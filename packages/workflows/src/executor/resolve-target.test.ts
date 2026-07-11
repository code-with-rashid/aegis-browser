import { CdpError, createFakeCdp, type FakeCdp } from '@aegis/perception';
import { err, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowStepId } from '../ids';
import type { WorkflowStep } from '../schema';
import { resolveStepTarget } from './resolve-target';

async function fakeCdp(onSend: (method: string) => unknown): Promise<FakeCdp> {
  const cdp = createFakeCdp(1, {
    onSend: (method) => {
      const result = onSend(method);
      return result instanceof CdpError ? err(result) : ok(result);
    },
  });
  await cdp.attach();
  return cdp;
}

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.click',
    args: { type: 'click', ref: 'ax:1' },
    ...overrides,
  };
}

describe('resolveStepTarget', () => {
  it('returns the step unchanged when it has no target', async () => {
    const cdp = await fakeCdp(() => {
      throw new Error('should never call CDP with no target');
    });
    const result = await resolveStepTarget(step(), cdp);
    expect(result.ok && result.value).toEqual(step());
  });

  it('returns the step unchanged when the recorded ref still resolves', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'DOM.resolveNode') {
        return { object: { objectId: 'obj-1' } };
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const withTarget = step({ target: { ref: 'ax:1', selector: '#submit' } });

    const result = await resolveStepTarget(withTarget, cdp);

    expect(result.ok && result.value).toEqual(withTarget);
  });

  it('falls back to the selector and re-targets the step when the recorded ref no longer resolves', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.resolveNode':
          return new CdpError('CDP_SEND_FAILED', 'detached');
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 42 };
        case 'DOM.describeNode':
          return { node: { nodeName: 'BUTTON', backendNodeId: 99 } };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const withTarget = step({ target: { ref: 'ax:1', selector: '#submit' } });

    const result = await resolveStepTarget(withTarget, cdp);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.args).toEqual({ type: 'click', ref: 'dom:99' });
  });

  it('uses the selector directly when the step has no recorded ref at all', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 42 };
        case 'DOM.describeNode':
          return { node: { nodeName: 'BUTTON', backendNodeId: 99 } };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const withTarget = step({ target: { selector: '#submit' } });

    const result = await resolveStepTarget(withTarget, cdp);

    expect(result.ok && result.value.args).toEqual({ type: 'click', ref: 'dom:99' });
  });

  it('fails with TARGET_NOT_FOUND when the selector matches nothing', async () => {
    const cdp = await fakeCdp((method) => {
      switch (method) {
        case 'DOM.resolveNode':
          return new CdpError('CDP_SEND_FAILED', 'detached');
        case 'DOM.getDocument':
          return { root: { nodeId: 1 } };
        case 'DOM.querySelector':
          return { nodeId: 0 };
        default:
          throw new Error(`unexpected CDP call: ${method}`);
      }
    });
    const withTarget = step({ target: { ref: 'ax:1', selector: '#gone' } });

    const result = await resolveStepTarget(withTarget, cdp);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('TARGET_NOT_FOUND');
  });

  it('fails with TARGET_NOT_FOUND when the ref fails and there is no selector to fall back on', async () => {
    const cdp = await fakeCdp((method) => {
      if (method === 'DOM.resolveNode') {
        return new CdpError('CDP_SEND_FAILED', 'detached');
      }
      throw new Error(`unexpected CDP call: ${method}`);
    });
    const withTarget = step({ target: { ref: 'ax:1' } });

    const result = await resolveStepTarget(withTarget, cdp);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('TARGET_NOT_FOUND');
  });
});
