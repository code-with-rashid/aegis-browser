import {
  createDefaultToolRegistry,
  createFakeTabManager,
  type ExecutorContext,
} from '@aegis/actions';
import { createNavigatorService } from '@aegis/agent';
import { createMockProvider, LlmError, type LlmProvider, type ModelRouter } from '@aegis/llm';
import { CdpError, createFakeCdp, type FakeCdp } from '@aegis/perception';
import { err, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowStepId } from '../ids';
import type { NeedsHealingSignal } from '../executor/execute-workflow';
import type { WorkflowStep } from '../schema';
import { healStep } from './heal-step';

function routerFor(provider: LlmProvider): ModelRouter {
  return { resolve: () => ok(provider) };
}

function navigatorResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    observation: 'The originally recorded button is gone; a similar button is visible.',
    reasoning: 'Click the current Submit button to reproduce the recorded step.',
    memory: '',
    nextGoal: 'Click the Submit button',
    toolCalls: [{ toolId: 'browser.click', args: { type: 'click', ref: 'el:42' } }],
    ...overrides,
  });
}

/** A fake CDP wired for a full heal cycle: perception (AX+DOM) plus a `browser.click` replay against backend node 42. */
async function healableFakeCdp(): Promise<FakeCdp> {
  const cdp = createFakeCdp(1, {
    onSend: (method, params) => {
      switch (method) {
        case 'DOM.resolveNode':
          return ok({
            object: { objectId: `obj-${(params as { backendNodeId?: number }).backendNodeId}` },
          });
        case 'DOM.getBoxModel':
          return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
        case 'DOM.describeNode':
          return ok({
            node: { nodeName: 'BUTTON', backendNodeId: 42, attributes: ['id', 'new-button'] },
          });
        case 'DOM.querySelector':
          return ok({ nodeId: 0 });
        case 'Accessibility.getFullAXTree':
          return ok({
            nodes: [
              {
                nodeId: '1',
                ignored: false,
                role: { type: 'string', value: 'button' },
                name: { type: 'string', value: 'Submit' },
                backendDOMNodeId: 42,
              },
            ],
          });
        case 'DOM.getDocument':
          return ok({
            root: {
              nodeId: 1,
              backendNodeId: 1,
              nodeType: 1,
              nodeName: 'BODY',
              localName: 'body',
              nodeValue: '',
              attributes: [],
              children: [],
              childNodeCount: 0,
            },
          });
        default:
          return ok(undefined);
      }
    },
  });
  await cdp.attach();
  return cdp;
}

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.click',
    args: { type: 'click', ref: 'dom:99' },
    target: { ref: 'dom:99', selector: '#old-button' },
    ...overrides,
  };
}

const needsHealing: NeedsHealingSignal = {
  stepId: toWorkflowStepId('step-1'),
  reason: 'target_not_found',
  message: 'Selector "#old-button" matched no element on the current page',
};

describe('healStep', () => {
  it('recovers a step whose target shifted, proposing and executing a fix with the real Navigator + a MockProvider', async () => {
    const cdp = await healableFakeCdp();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

    const result = await healStep(
      { workflowName: 'Check order status', step: step(), needsHealing },
      { navigate, registry, ctx, session: cdp },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.step.toolId).toBe('browser.click');
      expect(result.value.step.args).toEqual({ type: 'click', ref: toElementRef('el:42') });
      expect(result.value.step.target).toEqual({
        ref: toElementRef('el:42'),
        selector: '#new-button',
      });
      expect(result.value.result.succeeded).toBe(true);
    }
  });

  it('fails with HEAL_FAILED when the navigator reports stuck (no fix found)', async () => {
    const cdp = await healableFakeCdp();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({
      responses: [
        navigatorResponse({ toolCalls: [{ toolId: 'browser.teleport', args: {} }] }),
        navigatorResponse({ toolCalls: [{ toolId: 'browser.teleport', args: {} }] }),
        navigatorResponse({ toolCalls: [{ toolId: 'browser.teleport', args: {} }] }),
      ],
    });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

    const result = await healStep(
      { workflowName: 'Check order status', step: step(), needsHealing },
      { navigate, registry, ctx, session: cdp },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('HEAL_FAILED');
  });

  it('fails with HEAL_FAILED when the navigator itself cannot be resolved', async () => {
    const cdp = await healableFakeCdp();
    const registry = createDefaultToolRegistry();
    const router: ModelRouter = {
      resolve: () => err(new LlmError('LLM_INVALID_CONFIG', 'no key')),
    };
    const navigate = createNavigatorService(router, registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

    const result = await healStep(
      { workflowName: 'Check order status', step: step(), needsHealing },
      { navigate, registry, ctx, session: cdp },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('HEAL_FAILED');
  });

  it('fails with HEAL_FAILED when the proposed fix itself fails to execute', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return ok({
            nodes: [
              {
                nodeId: '1',
                ignored: false,
                role: { type: 'string', value: 'button' },
                name: { type: 'string', value: 'Submit' },
                backendDOMNodeId: 42,
              },
            ],
          });
        }
        if (method === 'DOM.getDocument') {
          return ok({
            root: {
              nodeId: 1,
              backendNodeId: 1,
              nodeType: 1,
              nodeName: 'BODY',
              localName: 'body',
              nodeValue: '',
              attributes: [],
              children: [],
              childNodeCount: 0,
            },
          });
        }
        if (method === 'DOM.resolveNode') {
          return err(new CdpError('CDP_SEND_FAILED', 'still detached'));
        }
        if (method === 'Page.captureScreenshot') {
          return err(new CdpError('CDP_SEND_FAILED', 'no screenshot'));
        }
        return ok(undefined);
      },
    });
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

    const result = await healStep(
      { workflowName: 'Check order status', step: step(), needsHealing },
      { navigate, registry, ctx, session: cdp },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('HEAL_FAILED');
  });

  it("fails with HEAL_FAILED when the fix executes but the step's expect post-condition still is not met", async () => {
    const cdp = await healableFakeCdp();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    // The fixture's DOM.querySelector never matches anything, so this condition stays unmet.
    const stepWithExpect = step({ expect: { type: 'element_visible', selector: '#confirmation' } });

    const result = await healStep(
      { workflowName: 'Check order status', step: stepWithExpect, needsHealing },
      { navigate, registry, ctx, session: cdp },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('HEAL_FAILED');
  });

  it("recovers a step and keeps its expect post-condition when it's satisfied", async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method, params) => {
        switch (method) {
          case 'DOM.resolveNode':
            return ok({
              object: { objectId: `obj-${(params as { backendNodeId?: number }).backendNodeId}` },
            });
          case 'DOM.getBoxModel':
            return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
          case 'DOM.describeNode':
            return ok({
              node: { nodeName: 'BUTTON', backendNodeId: 42, attributes: ['id', 'new-button'] },
            });
          case 'DOM.querySelector':
            return ok({ nodeId: 7 });
          case 'Runtime.callFunctionOn':
            return ok({ result: { value: true } });
          case 'Accessibility.getFullAXTree':
            return ok({
              nodes: [
                {
                  nodeId: '1',
                  ignored: false,
                  role: { type: 'string', value: 'button' },
                  name: { type: 'string', value: 'Submit' },
                  backendDOMNodeId: 42,
                },
              ],
            });
          case 'DOM.getDocument':
            return ok({
              root: {
                nodeId: 1,
                backendNodeId: 1,
                nodeType: 1,
                nodeName: 'BODY',
                localName: 'body',
                nodeValue: '',
                attributes: [],
                children: [],
                childNodeCount: 0,
              },
            });
          default:
            return ok(undefined);
        }
      },
    });
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const stepWithExpect = step({ expect: { type: 'element_visible', selector: '#confirmation' } });

    const result = await healStep(
      { workflowName: 'Check order status', step: stepWithExpect, needsHealing },
      { navigate, registry, ctx, session: cdp },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.step.expect).toEqual({
      type: 'element_visible',
      selector: '#confirmation',
    });
  });
});
