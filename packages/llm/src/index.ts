export type { LlmErrorCode, LlmTextRequest, LlmTextResult, LlmProvider } from './provider';
export { LlmError } from './provider';

export type { ProviderConfig } from './config';
export {
  ProviderConfigSchema,
  OpenAiConfigSchema,
  AnthropicConfigSchema,
  GoogleConfigSchema,
  OllamaConfigSchema,
  OpenAiCompatibleConfigSchema,
} from './config';

export { ProviderRegistry } from './registry';

export type { MockProviderOptions } from './mock-provider';
export { createMockProvider } from './mock-provider';

export { createOpenAiProvider } from './adapters/openai-provider';
export { createAnthropicProvider } from './adapters/anthropic-provider';
export { createGoogleProvider } from './adapters/google-provider';
export { createOpenAiCompatibleProvider } from './adapters/openai-compatible-provider';
export { createOllamaProvider } from './adapters/ollama-provider';

export { parseAndRepairJson } from './json-repair';

export type { GenerateStructuredOptions } from './generate-structured';
export { generateStructured } from './generate-structured';

export type {
  AgentRole,
  RoleModelConfig,
  ModelRoutingConfig,
  ModelRouter,
  ProviderFactory,
} from './model-routing';
export {
  AgentRoleSchema,
  RoleModelConfigSchema,
  ModelRoutingConfigSchema,
  DEFAULT_ROLE_TEMPERATURE,
  createModelRouter,
  saveModelRoutingConfig,
  loadModelRoutingConfig,
} from './model-routing';
