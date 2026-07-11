import { createFakeCdp, type FakeCdp } from '@aegis/perception';
import { ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowStepId } from '../ids';
import { buildWorkflowSteps, type RecordableStepInput } from './build-workflow-steps';

async function fakeCdpDescribingNode(
  nodeName: string,
  attributes: string[] = [],
): Promise<FakeCdp> {
  const cdp = createFakeCdp(1, {
    onSend: (method) => {
      if (method === 'DOM.describeNode') {
        return ok({ node: { nodeName, attributes } });
      }
      return ok(undefined);
    },
  });
  await cdp.attach();
  return cdp;
}

function makeStepId(): () => ReturnType<typeof toWorkflowStepId> {
  let counter = 0;
  return () => {
    counter += 1;
    return toWorkflowStepId(`step-${counter}`);
  };
}

describe('buildWorkflowSteps', () => {
  it('returns no steps when there is no run summary yet', async () => {
    const cdp = await fakeCdpDescribingNode('DIV');
    const input: RecordableStepInput = {
      proposedToolCalls: [],
      lastRunSummary: undefined,
      perception: undefined,
    };

    const steps = await buildWorkflowSteps(input, cdp, makeStepId());

    expect(steps).toEqual([]);
  });

  it('records a successful browser tool call with no target (extract)', async () => {
    const cdp = await fakeCdpDescribingNode('DIV');
    const input: RecordableStepInput = {
      proposedToolCalls: [
        { toolId: 'browser.extract', args: { type: 'extract', instructions: 'read it' } },
      ],
      lastRunSummary: {
        kind: 'completed',
        toolCalls: [{ toolId: 'browser.extract', succeeded: true }],
      },
      perception: undefined,
    };

    const steps = await buildWorkflowSteps(input, cdp, makeStepId());

    expect(steps).toEqual([
      {
        stepId: 'step-1',
        toolId: 'browser.extract',
        args: { type: 'extract', instructions: 'read it' },
      },
    ]);
  });

  it('skips a tool call that did not succeed', async () => {
    const cdp = await fakeCdpDescribingNode('DIV');
    const input: RecordableStepInput = {
      proposedToolCalls: [{ toolId: 'browser.click', args: { type: 'click', ref: 'ax:1' } }],
      lastRunSummary: {
        kind: 'failed',
        toolCalls: [{ toolId: 'browser.click', succeeded: false, errorMessage: 'boom' }],
      },
      perception: undefined,
    };

    const steps = await buildWorkflowSteps(input, cdp, makeStepId());

    expect(steps).toEqual([]);
  });

  it('captures ref, derived selector, role, and name for a targeted action', async () => {
    const cdp = await fakeCdpDescribingNode('BUTTON', ['id', 'submit-button']);
    const input: RecordableStepInput = {
      proposedToolCalls: [{ toolId: 'browser.click', args: { type: 'click', ref: 'ax:1' } }],
      lastRunSummary: {
        kind: 'completed',
        toolCalls: [{ toolId: 'browser.click', succeeded: true }],
      },
      perception: {
        elements: [
          { ref: toElementRef('ax:1'), role: 'button', name: 'Submit', state: {}, source: 'ax' },
        ],
        content: { text: '', truncated: false },
        tokenEstimate: 0,
        truncated: false,
      },
    };

    const steps = await buildWorkflowSteps(input, cdp, makeStepId());

    expect(steps).toEqual([
      {
        stepId: 'step-1',
        toolId: 'browser.click',
        args: { type: 'click', ref: 'ax:1' },
        target: { ref: 'ax:1', selector: '#submit-button', role: 'button', name: 'Submit' },
      },
    ]);
  });

  it('records a non-browser (MCP/WebMCP) tool call with no target at all', async () => {
    const cdp = await fakeCdpDescribingNode('DIV');
    const input: RecordableStepInput = {
      proposedToolCalls: [{ toolId: 'mcp.weather.get_forecast', args: { city: 'Paris' } }],
      lastRunSummary: {
        kind: 'completed',
        toolCalls: [{ toolId: 'mcp.weather.get_forecast', succeeded: true }],
      },
      perception: undefined,
    };

    const steps = await buildWorkflowSteps(input, cdp, makeStepId());

    expect(steps).toEqual([
      { stepId: 'step-1', toolId: 'mcp.weather.get_forecast', args: { city: 'Paris' } },
    ]);
  });

  it('correlates outcomes with proposed tool calls by index, not by matching toolId', async () => {
    const cdp = await fakeCdpDescribingNode('DIV');
    const input: RecordableStepInput = {
      proposedToolCalls: [
        { toolId: 'browser.click', args: { type: 'click', ref: 'ax:1' } },
        { toolId: 'browser.go_back', args: { type: 'go_back' } },
      ],
      lastRunSummary: {
        kind: 'completed',
        toolCalls: [
          { toolId: 'browser.click', succeeded: true },
          { toolId: 'browser.go_back', succeeded: true },
        ],
      },
      perception: undefined,
    };

    const steps = await buildWorkflowSteps(input, cdp, makeStepId());

    expect(steps.map((step) => step.toolId)).toEqual(['browser.click', 'browser.go_back']);
    expect(steps.map((step) => step.stepId)).toEqual(['step-1', 'step-2']);
  });
});
