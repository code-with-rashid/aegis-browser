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
  createMcpServerStore,
  createMcpToolPolicyStore,
  createWebMcpSettingsStore,
  registerMcpServerTools,
  registerWebMcpTools,
  type RegisteredMcpServerTools,
  type WebMcpSource,
} from '@aegis/mcp';
import {
  createChromeCdpSession,
  getPerceptionPayload,
  type CdpError,
  type CdpSession,
} from '@aegis/perception';
import {
  createPolicyEngine,
  createPolicyStore,
  createSecretVault,
  sanitizePageContent,
} from '@aegis/security';
import { err, isErr, isOk, ok, type Result, type StoragePort } from '@aegis/shared';

import { createPolicyService } from './policy-service';

/** Used when no `WebMcpSource` is supplied (e.g. tests that don't exercise WebMCP) — resolves to no tools, matching a page with WebMCP absent. */
const NO_WEBMCP_TOOLS_SOURCE: WebMcpSource = {
  listTools: () => Promise.resolve(ok([])),
  callTool: (name) =>
    Promise.resolve(
      err({ message: `No WebMCP source configured for this run (calling "${name}")` }),
    ),
  onToolsChanged: () => () => {
    // No source, so it can never change.
  },
};

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
 * Connects to every enabled, configured MCP server (`@aegis/mcp`'s `McpServerStore`, #84)
 * and registers its allowed tools (#86's deny-by-default gate) into `registry` — the
 * composition-root wiring deferred since #85/#86, closed here alongside the options UI
 * that actually manages these servers (#89). A single server's failure (unreachable, bad
 * auth, vault locked) never blocks another server or task start, matching the same
 * "never hard-depend on any one tool source" principle already applied to WebMCP
 * (`docs/adr/0035-webmcp-detection-and-adapter.md`).
 *
 * Uses a fresh `SecretVault` instance scoped to this call — the background service
 * worker has no way to share an *unlocked* vault with the options page's own instance
 * (separate processes); see `docs/adr/0037-mcp-tools-management-ui.md`. A server with no
 * `authHeaders` at all never touches the vault and registers normally regardless.
 */
async function registerConfiguredMcpServers(
  registry: ToolRegistry,
  storage: StoragePort,
): Promise<readonly RegisteredMcpServerTools[]> {
  const serverStore = createMcpServerStore(storage);
  const policyStore = createMcpToolPolicyStore(storage);
  const vault = createSecretVault(storage);

  const serversResult = await serverStore.listServers();
  if (isErr(serversResult)) {
    return [];
  }

  const registrations: RegisteredMcpServerTools[] = [];
  for (const config of serversResult.value) {
    const result = await registerMcpServerTools(
      registry,
      config,
      (name) => vault.getSecret(name),
      policyStore,
    );
    if (isOk(result)) {
      registrations.push(result.value);
    }
  }
  return registrations;
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
  webMcpSource: WebMcpSource = NO_WEBMCP_TOOLS_SOURCE,
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
  // WebMCP is opportunistic (docs/adr/0035-webmcp-detection-and-adapter.md) — a failed
  // registration (e.g. no bridge ever connected for this tab) must never fail task
  // start; it just means no `source: "webmcp"` tools are available this run. The global
  // toggle (#89) is checked first: disabled means WebMCP tools are never registered at
  // all, regardless of what any page declares. A settings-read failure fails open
  // (enabled) — this toggle is a preference, not a security boundary; every tool call
  // still goes through the same risk-based policy/critic/confirmation gate either way.
  const webMcpSettingsResult = await createWebMcpSettingsStore(storage).getSettings();
  const webMcpEnabled = isOk(webMcpSettingsResult) ? webMcpSettingsResult.value.enabled : true;
  const webMcpRegistration = webMcpEnabled
    ? await registerWebMcpTools(toolRegistry, webMcpSource)
    : undefined;
  const mcpRegistrations = await registerConfiguredMcpServers(toolRegistry, storage);
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
    detach: async () => {
      if (webMcpRegistration !== undefined && isOk(webMcpRegistration)) {
        webMcpRegistration.value.unregister();
      }
      for (const registration of mcpRegistrations) {
        await registration.disconnect();
      }
      return session.detach();
    },
  });
}
