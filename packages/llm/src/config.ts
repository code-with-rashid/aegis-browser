import { z } from 'zod';

export const OpenAiConfigSchema = z.object({
  kind: z.literal('openai'),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export const AnthropicConfigSchema = z.object({
  kind: z.literal('anthropic'),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export const GoogleConfigSchema = z.object({
  kind: z.literal('google'),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export const OllamaConfigSchema = z.object({
  kind: z.literal('ollama'),
  model: z.string().min(1),
  baseUrl: z.url().optional(),
});

export const OpenAiCompatibleConfigSchema = z.object({
  kind: z.literal('openai-compatible'),
  model: z.string().min(1),
  baseUrl: z.url(),
  apiKey: z.string().optional(),
});

/** A Zod-validated, discriminated-by-`kind` provider configuration. */
export const ProviderConfigSchema = z.discriminatedUnion('kind', [
  OpenAiConfigSchema,
  AnthropicConfigSchema,
  GoogleConfigSchema,
  OllamaConfigSchema,
  OpenAiCompatibleConfigSchema,
]);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
