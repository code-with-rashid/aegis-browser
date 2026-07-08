import { generateText as aiGenerateText, type LanguageModel } from 'ai';

import { err, ok, type Result } from '@aegis/shared';

import { LlmError, type LlmTextRequest, type LlmTextResult } from './provider';

/** Combines two optional abort signals into one that fires when either does. */
export function combineSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (a && b) {
    return AbortSignal.any([a, b]);
  }
  return a ?? b;
}

/** Maps a thrown value from `generateText` into a typed {@link LlmError}. */
export function mapError(cause: unknown): LlmError {
  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return new LlmError('LLM_TIMEOUT', 'The request timed out', { cause });
  }
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new LlmError('LLM_ABORTED', 'The request was aborted', { cause });
  }
  const message = cause instanceof Error ? cause.message : 'Unknown error';
  return new LlmError('LLM_REQUEST_FAILED', `Provider request failed: ${message}`, { cause });
}

/**
 * Runs `generateText` (from the `ai` package) against `model` with timeout/abort support
 * and typed error mapping. Shared by every real provider adapter.
 */
export async function runGenerateText(
  model: LanguageModel,
  request: LlmTextRequest,
): Promise<Result<LlmTextResult, LlmError>> {
  const timeoutSignal =
    request.timeoutMs !== undefined ? AbortSignal.timeout(request.timeoutMs) : undefined;
  const signal = combineSignals(request.signal, timeoutSignal);

  try {
    const result = await aiGenerateText({
      model,
      prompt: request.prompt,
      ...(request.system !== undefined ? { instructions: request.system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxOutputTokens !== undefined
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
      ...(signal !== undefined ? { abortSignal: signal } : {}),
    });

    return ok({ text: result.text, finishReason: result.finishReason });
  } catch (cause) {
    return err(mapError(cause));
  }
}
