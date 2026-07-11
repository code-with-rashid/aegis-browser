import type { RunPolicy } from '../schema';
import { describe, expect, it } from 'vitest';

import { gateOriginalStep, gateWorkflowOrigin } from './run-policy-gate';

function policy(overrides: Partial<RunPolicy> = {}): RunPolicy {
  return { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false, ...overrides };
}

describe('gateOriginalStep', () => {
  it('allows a read-risk step with an empty allow-list', () => {
    const result = gateOriginalStep({ toolId: 'browser.wait', risk: 'read', runPolicy: policy() });
    expect(result.kind).toBe('allow');
  });

  it('hard-stops a step whose tool id is outside a non-empty allow-list', () => {
    const result = gateOriginalStep({
      toolId: 'browser.click',
      risk: 'input',
      runPolicy: policy({ allowedToolIds: ['browser.wait'] }),
    });
    expect(result.kind).toBe('hard_stop');
    expect(result.kind === 'hard_stop' && result.reason).toContain('RunPolicy');
  });

  it('allows a step whose tool id is inside a non-empty allow-list', () => {
    const result = gateOriginalStep({
      toolId: 'browser.click',
      risk: 'input',
      runPolicy: policy({ allowedToolIds: ['browser.click'] }),
    });
    expect(result.kind).toBe('allow');
  });

  it('hard-stops a state-changing step when the policy does not authorize it unattended', () => {
    const result = gateOriginalStep({
      toolId: 'browser.click',
      risk: 'state_changing',
      runPolicy: policy({ allowStateChanging: false }),
    });
    expect(result.kind).toBe('hard_stop');
    expect(result.kind === 'hard_stop' && result.reason).toContain('state-changing');
  });

  it('allows a state-changing step when the policy authorizes it unattended', () => {
    const result = gateOriginalStep({
      toolId: 'browser.click',
      risk: 'state_changing',
      runPolicy: policy({ allowStateChanging: true }),
    });
    expect(result.kind).toBe('allow');
  });
});

describe('gateWorkflowOrigin', () => {
  it('allows any origin when the allow-list is empty', () => {
    const result = gateWorkflowOrigin('https://shop.example.com', policy());
    expect(result.kind).toBe('allow');
  });

  it('hard-stops an origin outside a non-empty allow-list', () => {
    const result = gateWorkflowOrigin(
      'https://evil.example.com',
      policy({ allowedOrigins: ['https://shop.example.com'] }),
    );
    expect(result.kind).toBe('hard_stop');
  });

  it('allows an origin inside a non-empty allow-list', () => {
    const result = gateWorkflowOrigin(
      'https://shop.example.com',
      policy({ allowedOrigins: ['https://shop.example.com'] }),
    );
    expect(result.kind).toBe('allow');
  });
});
