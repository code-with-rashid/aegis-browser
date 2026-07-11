import { createFakeCdp } from '@aegis/perception';
import { ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createRunRecorder } from './run-recorder';

async function fakeCdp() {
  const cdp = createFakeCdp(1, { onSend: () => ok({ node: { nodeName: 'DIV', attributes: [] } }) });
  await cdp.attach();
  return cdp;
}

describe('createRunRecorder', () => {
  it('starts with no steps recorded', async () => {
    const recorder = createRunRecorder(await fakeCdp());
    expect(recorder.steps).toEqual([]);
  });

  it('accumulates steps across multiple recordCycle calls with globally unique ids', async () => {
    const recorder = createRunRecorder(await fakeCdp());

    await recorder.recordCycle({
      proposedToolCalls: [{ toolId: 'browser.click', args: { type: 'click', ref: 'ax:1' } }],
      lastRunSummary: {
        kind: 'completed',
        toolCalls: [{ toolId: 'browser.click', succeeded: true }],
      },
      perception: undefined,
    });
    await recorder.recordCycle({
      proposedToolCalls: [
        { toolId: 'browser.extract', args: { type: 'extract', instructions: 'x' } },
      ],
      lastRunSummary: {
        kind: 'completed',
        toolCalls: [{ toolId: 'browser.extract', succeeded: true }],
      },
      perception: undefined,
    });

    expect(recorder.steps.map((step) => step.stepId)).toEqual(['step-1', 'step-2']);
    expect(recorder.steps.map((step) => step.toolId)).toEqual(['browser.click', 'browser.extract']);
  });

  it('ignores a cycle with no run summary yet', async () => {
    const recorder = createRunRecorder(await fakeCdp());

    await recorder.recordCycle({
      proposedToolCalls: [],
      lastRunSummary: undefined,
      perception: undefined,
    });

    expect(recorder.steps).toEqual([]);
  });
});
