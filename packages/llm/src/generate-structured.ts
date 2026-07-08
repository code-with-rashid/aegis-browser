import { z, type ZodType } from 'zod';

import { err, isErr, ok, type Result } from '@aegis/shared';

import { parseAndRepairJson } from './json-repair';
import { LlmError, type LlmProvider, type LlmTextRequest } from './provider';

export interface GenerateStructuredOptions {
  readonly system?: string;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Additional attempts after the first, each retried with schema-violation feedback. */
  readonly maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 2;

function buildJsonInstructions(jsonSchema: unknown): string {
  return [
    'Respond with ONLY a single JSON value (no markdown code fences, no commentary)',
    'that satisfies this JSON Schema:',
    JSON.stringify(jsonSchema),
  ].join('\n');
}

function buildRetryPrompt(originalPrompt: string, previousText: string, problem: string): string {
  return [
    originalPrompt,
    '',
    'Your previous response did not satisfy the required format.',
    'Previous response:',
    previousText,
    '',
    `Problem: ${problem}`,
    'Return a corrected JSON value that fixes this, following the same instructions.',
  ].join('\n');
}

/**
 * Generates a schema-validated value from `provider`, tolerating imperfect model JSON —
 * the reliability gap that made Nanobrowser's structured output unreliable. Strips
 * markdown fences and repairs malformed JSON ({@link parseAndRepairJson}) before
 * validating against `schema`; on a parse or validation failure, retries up to
 * `maxRetries` times, feeding the model's own bad output and the specific problem back
 * into the next prompt.
 */
export async function generateStructured<T>(
  provider: LlmProvider,
  schema: ZodType<T>,
  prompt: string,
  options: GenerateStructuredOptions = {},
): Promise<Result<T, LlmError>> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' });
  let currentPrompt = `${prompt}\n\n${buildJsonInstructions(jsonSchema)}`;
  let lastError: LlmError = new LlmError(
    'LLM_STRUCTURED_VALIDATION_FAILED',
    'generateStructured made no attempts',
  );

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const textRequest: LlmTextRequest = {
      prompt: currentPrompt,
      ...(options.system !== undefined ? { system: options.system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };

    const textResult = await provider.generateText(textRequest);
    if (isErr(textResult)) {
      return textResult;
    }

    const rawText = textResult.value.text;
    const parsed = parseAndRepairJson(rawText);
    if (isErr(parsed)) {
      lastError = new LlmError(
        'LLM_STRUCTURED_PARSE_FAILED',
        `Could not parse model output as JSON: ${parsed.error}`,
      );
      currentPrompt = buildRetryPrompt(prompt, rawText, parsed.error);
      continue;
    }

    const validated = schema.safeParse(parsed.value);
    if (!validated.success) {
      const problem = validated.error.message;
      lastError = new LlmError(
        'LLM_STRUCTURED_VALIDATION_FAILED',
        `Model output did not satisfy the schema: ${problem}`,
        { cause: validated.error },
      );
      currentPrompt = buildRetryPrompt(prompt, rawText, problem);
      continue;
    }

    return ok(validated.data);
  }

  return err(lastError);
}
