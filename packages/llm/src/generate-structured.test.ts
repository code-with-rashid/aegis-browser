import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isErr, isOk, ok } from '@aegis/shared';

import { generateStructured } from './generate-structured';
import { createMockProvider } from './mock-provider';
import type { LlmTextRequest, LlmTextResult } from './provider';
import { LlmError } from './provider';

const PersonSchema = z.object({ name: z.string(), age: z.number() });

describe('generateStructured', () => {
  it('parses and validates a well-formed JSON response on the first attempt', async () => {
    const provider = createMockProvider({ responses: ['{"name": "Ada", "age": 30}'] });

    const result = await generateStructured(provider, PersonSchema, 'describe a person');

    expect(isOk(result) && result.value).toEqual({ name: 'Ada', age: 30 });
  });

  it('transparently handles a fenced response with trailing commas', async () => {
    const provider = createMockProvider({
      responses: ['```json\n{"name": "Ada", "age": 30,}\n```'],
    });

    const result = await generateStructured(provider, PersonSchema, 'describe a person');

    expect(isOk(result) && result.value).toEqual({ name: 'Ada', age: 30 });
  });

  it('retries with schema-violation feedback and succeeds on the second attempt', async () => {
    let calls = 0;
    const seenPrompts: string[] = [];
    const provider = createMockProvider({
      generateText: (request: LlmTextRequest): Promise<ReturnType<typeof ok<LlmTextResult>>> => {
        seenPrompts.push(request.prompt);
        calls += 1;
        const text =
          calls === 1 ? '{"name": "Ada", "age": "not a number"}' : '{"name": "Ada", "age": 30}';
        return Promise.resolve(ok({ text, finishReason: 'stop' }));
      },
    });

    const result = await generateStructured(provider, PersonSchema, 'describe a person');

    expect(isOk(result) && result.value).toEqual({ name: 'Ada', age: 30 });
    expect(calls).toBe(2);
    expect(seenPrompts[1]).toContain('Problem:');
  });

  it('hard-fails with a typed error after exhausting maxRetries', async () => {
    let calls = 0;
    const provider = createMockProvider({
      generateText: () => {
        calls += 1;
        return Promise.resolve(
          ok({ text: '{"name": "Ada", "age": "nope"}', finishReason: 'stop' }),
        );
      },
    });

    const result = await generateStructured(provider, PersonSchema, 'describe a person', {
      maxRetries: 2,
    });

    expect(isErr(result) && result.error.code).toBe('LLM_STRUCTURED_VALIDATION_FAILED');
    expect(calls).toBe(3); // 1 initial attempt + 2 retries
  });

  it('hard-fails with a parse error when the model never produces recoverable JSON', async () => {
    const provider = createMockProvider({ responses: ['{{{{'] });

    const result = await generateStructured(provider, PersonSchema, 'describe a person', {
      maxRetries: 0,
    });

    expect(isErr(result) && result.error.code).toBe('LLM_STRUCTURED_PARSE_FAILED');
  });

  it('hard-fails with a validation error when the model returns unstructured prose', async () => {
    const provider = createMockProvider({ responses: ['not json, sorry'] });

    const result = await generateStructured(provider, PersonSchema, 'describe a person', {
      maxRetries: 0,
    });

    // jsonrepair wraps bare prose as a JSON string, so this fails schema validation
    // (not object-shaped) rather than JSON parsing itself.
    expect(isErr(result) && result.error.code).toBe('LLM_STRUCTURED_VALIDATION_FAILED');
  });

  it('short-circuits on a transport error without retrying', async () => {
    let calls = 0;
    const provider = createMockProvider({
      generateText: () => {
        calls += 1;
        return Promise.resolve({
          ok: false as const,
          error: new LlmError('LLM_TIMEOUT', 'timed out'),
        });
      },
    });

    const result = await generateStructured(provider, PersonSchema, 'describe a person');

    expect(isErr(result) && result.error.code).toBe('LLM_TIMEOUT');
    expect(calls).toBe(1);
  });
});
