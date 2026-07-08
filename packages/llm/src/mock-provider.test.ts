import { describe, expect, it } from 'vitest';

import { isOk } from '@aegis/shared';

import { createMockProvider } from './mock-provider';

describe('createMockProvider', () => {
  it('defaults to a stable id and a canned response', async () => {
    const provider = createMockProvider();
    expect(provider.id).toBe('mock:test-model');

    const result = await provider.generateText({ prompt: 'hi' });
    expect(isOk(result) && result.value.text).toBe('mock response');
  });

  it('uses a custom id when provided', () => {
    const provider = createMockProvider({ id: 'mock:planner' });
    expect(provider.id).toBe('mock:planner');
  });

  it('cycles through responses in order and repeats the last one', async () => {
    const provider = createMockProvider({ responses: ['first', 'second'] });

    const r1 = await provider.generateText({ prompt: 'a' });
    const r2 = await provider.generateText({ prompt: 'b' });
    const r3 = await provider.generateText({ prompt: 'c' });

    expect(isOk(r1) && r1.value.text).toBe('first');
    expect(isOk(r2) && r2.value.text).toBe('second');
    expect(isOk(r3) && r3.value.text).toBe('second');
  });

  it('lets a test fully override generateText', async () => {
    const provider = createMockProvider({
      generateText: (request) =>
        Promise.resolve({
          ok: true,
          value: { text: `echo: ${request.prompt}`, finishReason: 'stop' },
        }),
    });

    const result = await provider.generateText({ prompt: 'ping' });
    expect(isOk(result) && result.value.text).toBe('echo: ping');
  });
});
