import {
  createActionRunner,
  createChromeTabManager,
  createDefaultToolRegistry,
  type ExecutorContext,
  type ToolRegistry,
} from '@aegis/actions';
import {
  createCriticService,
  createNavigatorService,
  createPlannerService,
  createToolCallActService,
  createVerifierService,
  type LoopServices,
} from '@aegis/agent';
import { createModelRouter, loadModelRoutingConfig, ProviderRegistry } from '@aegis/llm';
import {
  createChromeCdpSession,
  getPerceptionPayload,
  type CdpError,
  type CdpSession,
} from '@aegis/perception';
import { createPolicyEngine, createPolicyStore, sanitizePageContent } from '@aegis/security';
import { err, isErr, ok, type Result, type StoragePort } from '@aegis/shared';

import { createPolicyService } from './policy-service';

export type BuildLoopServicesErrorCode = 'MODEL_ROUTING_NOT_CONFIGURED' | 'STORAGE_FAILED';

export interface BuildLoopServicesError {
  readonly code: BuildLoopServicesErrorCode;
  readonly message: string;
}

export interface BuiltLoop {
  readonly services: LoopServices;
  readonly executorContext: ExecutorContext;
  /** The registry `services` was built against — the trace/audit UI (#86) needs this to describe a tool call by its actual source, not just a browser `Action`. */
  readonly toolRegistry: ToolRegistry;
  /** Attaches the live CDP session — call before creating the loop actor. */
  attach(): Promise<Result<void, CdpError>>;
  /** Detaches the CDP session — call once the run reaches a terminal state. */
  detach(): Promise<Result<void, CdpError>>;
}

async function resolveOrigin(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url === undefined) {
    throw new Error(`Tab ${tabId} has no readable URL`);
  }
  return new URL(tab.url).origin;
}

/**
 * Assembles a real, non-mock {@link LoopServices} + {@link ExecutorContext} for `tabId` —
 * the composition root the security ADRs (0010, 0011, 0012) deferred. Every port is a
 * real adapter (`@aegis/perception`'s live CDP session, `@aegis/actions`' action runner,
 * `@aegis/llm`'s provider registry + model router, `@aegis/security`'s policy engine)
 * except when `ModelRoutingConfig` hasn't been saved to `storage` yet (no options UI to
 * write one exists until #28) — that's reported as `MODEL_ROUTING_NOT_CONFIGURED`, a
 * real, user-actionable error, not a stub.
 */
export async function buildLoopServices(
  storage: StoragePort,
  tabId: number,
): Promise<Result<BuiltLoop, BuildLoopServicesError>> {
  const configResult = await loadModelRoutingConfig(storage);
  if (isErr(configResult)) {
    return err({ code: 'STORAGE_FAILED', message: configResult.error.message });
  }
  if (configResult.value === undefined) {
    return err({
      code: 'MODEL_ROUTING_NOT_CONFIGURED',
      message: 'No model routing is configured yet — add a provider in Options first.',
    });
  }

  const registry = new ProviderRegistry();
  const modelRouter = createModelRouter(
    (providerConfig) => registry.create(providerConfig),
    configResult.value,
  );

  const session: CdpSession = createChromeCdpSession(tabId);
  const tabManager = createChromeTabManager(tabId);
  const executorContext: ExecutorContext = { session, tabManager };
  const actionRunner = createActionRunner();
  const toolRegistry = createDefaultToolRegistry();
  const policyEngine = createPolicyEngine(createPolicyStore(storage));
  const checkPolicy = createPolicyService(policyEngine, () => resolveOrigin(tabId), toolRegistry);

  const services: LoopServices = {
    perceive: (input) => getPerceptionPayload(input.session, { goal: input.goal }),
    plan: createPlannerService(modelRouter, { sanitize: sanitizePageContent }),
    decide: createNavigatorService(modelRouter, toolRegistry, { sanitize: sanitizePageContent }),
    checkPolicy,
    checkAlignment: createCriticService(modelRouter, toolRegistry, {
      sanitize: sanitizePageContent,
    }),
    act: createToolCallActService(actionRunner, toolRegistry),
    verify: createVerifierService(modelRouter, { sanitize: sanitizePageContent }),
  };

  return ok({
    services,
    executorContext,
    toolRegistry,
    attach: () => session.attach(),
    detach: () => session.detach(),
  });
}
