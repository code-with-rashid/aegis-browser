import { AgentError, type ToolCall } from '@aegis/agent';
import { createDefaultToolRegistry } from '@aegis/actions';
import type { PerceptionPayload } from '@aegis/perception';
import {
  createPolicyEngine,
  createPolicyStore,
  type PolicyDecision,
  type PolicyEngine,
} from '@aegis/security';
import { createMemoryStorage, err, ok, StorageError, toElementRef } from '@aegis/shared';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createPolicyService } from './policy-service';

const clickCall: ToolCall = {
  toolId: 'browser.click',
  args: { type: 'click', ref: toElementRef('e1') },
};
const goBackCall: ToolCall = { toolId: 'browser.go_back', args: { type: 'go_back' } };

function perceptionWithElement(name: string): PerceptionPayload {
  return {
    elements: [{ ref: toElementRef('e1'), role: 'button', name, state: {}, source: 'ax' }],
    content: { text: '', truncated: false },
    tokenEstimate: 0,
    truncated: false,
  };
}

function fakeEngine(decisionFor: (index: number) => PolicyDecision): PolicyEngine {
  let calls = 0;
  return {
    evaluate: () => Promise.resolve(ok(decisionFor(calls++))),
  };
}

function originOf(url: string) {
  return () => Promise.resolve(url);
}

const registry = createDefaultToolRegistry();

describe('createPolicyService', () => {
  it('allows a batch when every tool call is allowed', async () => {
    const checkPolicy = createPolicyService(
      fakeEngine(() => 'allow'),
      originOf('https://example.com'),
      registry,
    );

    const result = await checkPolicy({ toolCalls: [clickCall, goBackCall] });

    expect(result).toEqual({ ok: true, value: { decision: 'allow' } });
  });

  it('confirms when any single tool call needs confirmation', async () => {
    const checkPolicy = createPolicyService(
      fakeEngine(() => 'confirm'),
      originOf('https://example.com'),
      registry,
    );

    const result = await checkPolicy({ toolCalls: [clickCall] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('confirm');
    expect(result.ok && result.value.reason).toContain('example.com');
  });

  it('denies the whole batch when any tool call is denied, even if it comes after a confirm', async () => {
    const decisions: PolicyDecision[] = ['confirm', 'deny'];
    const checkPolicy = createPolicyService(
      fakeEngine((index) => decisions[index] ?? 'allow'),
      originOf('https://www.chase.com'),
      registry,
    );

    const result = await checkPolicy({ toolCalls: [clickCall, goBackCall] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('deny');
  });

  it('denies the whole batch when a deny comes before a confirm', async () => {
    const decisions: PolicyDecision[] = ['deny', 'confirm'];
    const checkPolicy = createPolicyService(
      fakeEngine((index) => decisions[index] ?? 'allow'),
      originOf('https://www.chase.com'),
      registry,
    );

    const result = await checkPolicy({ toolCalls: [clickCall, goBackCall] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('deny');
  });

  it('fails with POLICY_CHECK_FAILED when the engine errors', async () => {
    const engine: PolicyEngine = {
      evaluate: () => Promise.resolve(err(new StorageError('STORAGE_READ_FAILED', 'boom'))),
    };
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({ toolCalls: [clickCall] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(AgentError);
    expect(!result.ok && result.error.code).toBe('POLICY_CHECK_FAILED');
  });

  it('fails with POLICY_CHECK_FAILED when origin resolution throws', async () => {
    const checkPolicy = createPolicyService(
      fakeEngine(() => 'allow'),
      () => {
        throw new Error('no active tab');
      },
      registry,
    );

    const result = await checkPolicy({ toolCalls: [clickCall] });

    expect(!result.ok && result.error.code).toBe('POLICY_CHECK_FAILED');
  });

  it('integrates with a real PolicyEngine: a deny-listed origin denies by default', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://www.chase.com'), registry);

    const result = await checkPolicy({ toolCalls: [goBackCall] });

    expect(result).toEqual({
      ok: true,
      value: { decision: 'deny', reason: 'https://www.chase.com denies this tool call' },
    });
  });

  it('integrates with a real PolicyEngine: an ordinary origin with no configured policy allows a read tool call', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({ toolCalls: [goBackCall] });

    expect(result).toEqual({ ok: true, value: { decision: 'allow' } });
  });

  it('passes the target element accessible name from perception as risk-elevation context', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService(
      { evaluate },
      originOf('https://example.com'),
      registry,
    );

    await checkPolicy({ toolCalls: [clickCall], perception: perceptionWithElement('Buy Now') });

    expect(evaluate).toHaveBeenCalledWith('state_changing', 'https://example.com');
  });

  it('classifies at base risk when no perception is given', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService(
      { evaluate },
      originOf('https://example.com'),
      registry,
    );

    await checkPolicy({ toolCalls: [clickCall] });

    expect(evaluate).toHaveBeenCalledWith('input', 'https://example.com');
  });

  it('classifies at base risk when perception has no element matching the ref', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService(
      { evaluate },
      originOf('https://example.com'),
      registry,
    );
    const perception: PerceptionPayload = {
      elements: [],
      content: { text: '', truncated: false },
      tokenEstimate: 0,
      truncated: false,
    };

    await checkPolicy({ toolCalls: [clickCall], perception });

    expect(evaluate).toHaveBeenCalledWith('input', 'https://example.com');
  });

  it('integrates with a real PolicyEngine: a click on a button named "Buy Now" requires confirmation', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({
      toolCalls: [clickCall],
      perception: perceptionWithElement('Buy Now'),
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('confirm');
  });

  it('integrates with a real PolicyEngine: the same click on a button named "Details" is allowed', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({
      toolCalls: [clickCall],
      perception: perceptionWithElement('Details'),
    });

    expect(result).toEqual({ ok: true, value: { decision: 'allow' } });
  });

  it('checks a navigate tool call against its destination origin, not the current page', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const navigateCall: ToolCall = {
      toolId: 'browser.navigate',
      args: { type: 'navigate', url: 'https://www.chase.com/login' },
    };
    const checkPolicy = createPolicyService(
      { evaluate },
      originOf('https://example.com'),
      registry,
    );

    await checkPolicy({ toolCalls: [navigateCall] });

    expect(evaluate).toHaveBeenCalledWith('navigate', 'https://www.chase.com');
  });

  it('integrates with a real PolicyEngine: navigating to a deny-listed destination is denied, even from a safe origin', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const navigateCall: ToolCall = {
      toolId: 'browser.navigate',
      args: { type: 'navigate', url: 'https://www.chase.com/login' },
    };
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({ toolCalls: [navigateCall] });

    expect(result).toEqual({
      ok: true,
      value: { decision: 'deny', reason: 'https://www.chase.com denies this tool call' },
    });
  });

  it('integrates with a real PolicyEngine: opening a new tab at a deny-listed URL is denied', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const openTabCall: ToolCall = {
      toolId: 'browser.open_tab',
      args: { type: 'open_tab', url: 'https://www.chase.com/login' },
    };
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({ toolCalls: [openTabCall] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('deny');
  });

  it('checks a click tool call against the current origin, unaffected by the navigate-destination logic', async () => {
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const checkPolicy = createPolicyService(
      { evaluate },
      originOf('https://example.com'),
      registry,
    );

    await checkPolicy({ toolCalls: [clickCall] });

    expect(evaluate).toHaveBeenCalledWith('input', 'https://example.com');
  });

  it('falls back to the current origin for a navigate tool call with an unparseable URL', async () => {
    // NavigateActionSchema already requires a valid URL, but the fallback must still be
    // safe (deny nothing spuriously) if one somehow arrives malformed.
    const evaluate = vi.fn().mockResolvedValue(ok('allow'));
    const navigateCall: ToolCall = {
      toolId: 'browser.navigate',
      args: { type: 'navigate', url: 'not-a-valid-url' },
    };
    const checkPolicy = createPolicyService(
      { evaluate },
      originOf('https://example.com'),
      registry,
    );

    await checkPolicy({ toolCalls: [navigateCall] });

    expect(evaluate).toHaveBeenCalledWith('navigate', 'https://example.com');
  });

  it('routes a non-browser state-changing tool call through confirmation (mock MCP tool)', async () => {
    const stateChangingRegistry = createDefaultToolRegistry();
    stateChangingRegistry.register({
      id: 'mcp.email.send',
      source: 'mcp',
      description: 'Send an email.',
      inputSchema: z.object({}),
      risk: 'state_changing',
      execute: () => Promise.resolve(ok(undefined)),
    });
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(
      engine,
      originOf('https://example.com'),
      stateChangingRegistry,
    );

    const result = await checkPolicy({ toolCalls: [{ toolId: 'mcp.email.send', args: {} }] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('confirm');
  });

  it('fails safe to state_changing (confirm/deny) for an unregistered tool id', async () => {
    const engine = createPolicyEngine(createPolicyStore(createMemoryStorage()));
    const checkPolicy = createPolicyService(engine, originOf('https://example.com'), registry);

    const result = await checkPolicy({ toolCalls: [{ toolId: 'mcp.unknown.tool', args: {} }] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.decision).toBe('confirm');
  });
});
