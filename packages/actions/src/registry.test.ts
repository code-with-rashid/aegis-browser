import { isErr, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ActionRegistry, createDefaultActionRegistry, validateAction } from './registry';

describe('createDefaultActionRegistry', () => {
  const BUILT_IN_TYPES = [
    'click',
    'input_text',
    'scroll',
    'navigate',
    'go_back',
    'open_tab',
    'switch_tab',
    'close_tab',
    'get_dropdown_options',
    'select_dropdown_option',
    'send_keys',
    'wait',
    'extract',
    'done',
  ];

  it('registers all 14 built-in action types', () => {
    const registry = createDefaultActionRegistry();
    expect(registry.list()).toHaveLength(14);
    for (const type of BUILT_IN_TYPES) {
      expect(registry.get(type)).toBeDefined();
    }
  });

  it('validates a well-formed built-in action', () => {
    const registry = createDefaultActionRegistry();
    const result = registry.validate({ type: 'click', ref: 'e1' });
    expect(isOk(result) && result.value.type).toBe('click');
  });

  it('rejects an action with an unknown type', () => {
    const registry = createDefaultActionRegistry();
    const result = registry.validate({ type: 'teleport' });
    expect(isErr(result) && result.error.code).toBe('ACTION_UNKNOWN_TYPE');
  });

  it('rejects an action missing a "type" field', () => {
    const registry = createDefaultActionRegistry();
    const result = registry.validate({ ref: 'e1' });
    expect(isErr(result) && result.error.code).toBe('ACTION_INVALID_PARAMS');
  });

  it('rejects a known type with invalid params', () => {
    const registry = createDefaultActionRegistry();
    const result = registry.validate({ type: 'click' }); // missing ref
    expect(isErr(result) && result.error.code).toBe('ACTION_INVALID_PARAMS');
  });

  it('classifies a built-in type consistently with classifyActionRisk', () => {
    const registry = createDefaultActionRegistry();
    expect(registry.classify('click')).toBe('input');
    expect(registry.classify('click', { elementName: 'Submit Order' })).toBe('state_changing');
    expect(registry.classify('navigate')).toBe('navigate');
  });

  it('defaults an unregistered type to the most restrictive risk', () => {
    const registry = createDefaultActionRegistry();
    expect(registry.classify('some_future_mcp_tool')).toBe('state_changing');
  });
});

describe('ActionRegistry extensibility (MCP-style custom registration)', () => {
  it('lets a caller register a new action type alongside the built-ins', () => {
    const registry = createDefaultActionRegistry();
    const customSchema = z.object({ type: z.literal('custom_tool'), query: z.string() });

    registry.register({ type: 'custom_tool', schema: customSchema, baseRisk: 'read' });

    const result = registry.validate({ type: 'custom_tool', query: 'weather' });
    expect(isOk(result) && result.value['query']).toBe('weather');
    expect(registry.classify('custom_tool')).toBe('read');
  });

  it('starts empty when constructed directly (no built-ins)', () => {
    const registry = new ActionRegistry();
    expect(registry.list()).toHaveLength(0);
    const result = registry.validate({ type: 'click', ref: 'e1' });
    expect(isErr(result) && result.error.code).toBe('ACTION_UNKNOWN_TYPE');
  });
});

describe('validateAction', () => {
  it('validates a well-formed built-in action with full typing', () => {
    const result = validateAction({ type: 'done', success: true, summary: 'ok' });
    expect(isOk(result) && result.value.type).toBe('done');
  });

  it('rejects an invalid action', () => {
    const result = validateAction({ type: 'done' });
    expect(isErr(result) && result.error.code).toBe('ACTION_INVALID_PARAMS');
  });
});
