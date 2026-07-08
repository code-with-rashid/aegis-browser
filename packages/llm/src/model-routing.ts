import { z } from 'zod';

import { isErr, ok, type Result, type StorageError, type StoragePort } from '@aegis/shared';

import { ProviderConfigSchema, type ProviderConfig } from './config';
import type { LlmError, LlmProvider, LlmTextRequest } from './provider';

/** The four agent roles that can each use a different model. */
export const AgentRoleSchema = z.enum(['planner', 'navigator', 'verifier', 'critic']);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const RoleModelConfigSchema = z.object({
  provider: ProviderConfigSchema,
  temperature: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});
export type RoleModelConfig = z.infer<typeof RoleModelConfigSchema>;

/** A Zod-validated provider+model+params assignment for every agent role. */
export const ModelRoutingConfigSchema = z.object({
  planner: RoleModelConfigSchema,
  navigator: RoleModelConfigSchema,
  verifier: RoleModelConfigSchema,
  critic: RoleModelConfigSchema,
});
export type ModelRoutingConfig = z.infer<typeof ModelRoutingConfigSchema>;

/**
 * Default sampling temperature per role when a role's config doesn't specify one.
 * Aegis is BYOK, so there is no sensible default *provider* — the user must always
 * configure one — but these param defaults match the design intent from `docs/DESIGN.md`:
 * Planner reasons and re-plans (higher temperature), Navigator/Verifier/Critic make
 * narrow, low-variance judgment calls (low temperature).
 */
export const DEFAULT_ROLE_TEMPERATURE: Readonly<Record<AgentRole, number>> = {
  planner: 0.7,
  navigator: 0.2,
  verifier: 0.1,
  critic: 0.1,
};

/** Resolves a working {@link LlmProvider} for a given {@link AgentRole}. */
export interface ModelRouter {
  resolve(role: AgentRole): Result<LlmProvider, LlmError>;
}

function withRoleDefaults(
  role: AgentRole,
  roleConfig: RoleModelConfig,
  provider: LlmProvider,
): LlmProvider {
  return {
    id: provider.id,
    generateText(request: LlmTextRequest) {
      const temperature =
        request.temperature ?? roleConfig.temperature ?? DEFAULT_ROLE_TEMPERATURE[role];
      const maxOutputTokens = request.maxOutputTokens ?? roleConfig.maxOutputTokens;

      return provider.generateText({
        ...request,
        temperature,
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      });
    },
  };
}

/** Turns a validated {@link ProviderConfig} into a working {@link LlmProvider}. `ProviderRegistry.create`, bound to its instance, satisfies this. */
export type ProviderFactory = (config: ProviderConfig) => Result<LlmProvider, LlmError>;

/**
 * Builds a {@link ModelRouter} that resolves each role's configured provider through
 * `createProvider`, applying that role's default temperature/token params to every call
 * unless the caller explicitly overrides them per-request.
 */
export function createModelRouter(
  createProvider: ProviderFactory,
  config: ModelRoutingConfig,
): ModelRouter {
  return {
    resolve(role: AgentRole): Result<LlmProvider, LlmError> {
      const roleConfig = config[role];
      const providerResult = createProvider(roleConfig.provider);
      if (isErr(providerResult)) {
        return providerResult;
      }
      return ok(withRoleDefaults(role, roleConfig, providerResult.value));
    },
  };
}

const MODEL_ROUTING_STORAGE_KEY = 'model-routing-config';

/** Persists a {@link ModelRoutingConfig} via a Zod-validated {@link StoragePort}. */
export function saveModelRoutingConfig(
  storage: StoragePort,
  config: ModelRoutingConfig,
): Promise<Result<void, StorageError>> {
  return storage.set(ModelRoutingConfigSchema, MODEL_ROUTING_STORAGE_KEY, config);
}

/** Loads a previously-saved {@link ModelRoutingConfig}, or `undefined` if none exists yet. */
export function loadModelRoutingConfig(
  storage: StoragePort,
): Promise<Result<ModelRoutingConfig | undefined, StorageError>> {
  return storage.get(ModelRoutingConfigSchema, MODEL_ROUTING_STORAGE_KEY);
}
