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
import type { RunPolicy, WorkflowStep } from '../schema';
import { applyConfirmedHeal, healStep, type HealStepDeps } from './heal-step';

function routerFor(provider: LlmProvider): ModelRouter {
  return { resolve: () => ok(provider) };
}

const openRunPolicy: RunPolicy = {
  allowedToolIds: [],
  allowedOrigins: [],
  allowStateChanging: false,
};

function depsFor(
  overrides: Partial<HealStepDeps> &
    Pick<HealStepDeps, 'navigate' | 'registry' | 'ctx' | 'session'>,
): HealStepDeps {
  return { runPolicy: openRunPolicy, mode: 'attended', ...overrides };
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
                name: { type: 'string', value: 'Continue' },
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
      depsFor({ navigate, registry, ctx, session: cdp }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe('applied');
    if (result.ok && result.value.kind === 'applied') {
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
      depsFor({ navigate, registry, ctx, session: cdp }),
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
      depsFor({ navigate, registry, ctx, session: cdp }),
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
                name: { type: 'string', value: 'Continue' },
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
      depsFor({ navigate, registry, ctx, session: cdp }),
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
      depsFor({ navigate, registry, ctx, session: cdp }),
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
                  name: { type: 'string', value: 'Continue' },
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
      depsFor({ navigate, registry, ctx, session: cdp }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe('applied');
    expect(
      result.ok && result.value.kind === 'applied' ? result.value.step.expect : undefined,
    ).toEqual({
      type: 'element_visible',
      selector: '#confirmation',
    });
  });

  describe('healing safety gate (#114)', () => {
    const stateChangingResponse = (): string =>
      navigatorResponse({
        toolCalls: [{ toolId: 'browser.click', args: { type: 'click', ref: 'el:99' } }],
      });

    function stateChangingFakeCdp(calls: string[]): FakeCdp {
      const cdp = createFakeCdp(1, {
        onSend: (method) => {
          calls.push(method);
          switch (method) {
            case 'Accessibility.getFullAXTree':
              return ok({
                nodes: [
                  {
                    nodeId: '1',
                    ignored: false,
                    role: { type: 'string', value: 'button' },
                    name: { type: 'string', value: 'Submit Order' },
                    backendDOMNodeId: 99,
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
            case 'DOM.querySelector':
              return ok({ nodeId: 0 });
            case 'DOM.resolveNode':
              return ok({ object: { objectId: 'obj-99' } });
            case 'DOM.getBoxModel':
              return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
            case 'DOM.describeNode':
              return ok({
                node: { nodeName: 'BUTTON', backendNodeId: 99, attributes: ['id', 'submit-order'] },
              });
            default:
              return ok(undefined);
          }
        },
      });
      return cdp;
    }

    it('needs confirmation for a state-changing fix when attended, without executing it', async () => {
      const calls: string[] = [];
      const cdp = stateChangingFakeCdp(calls);
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [stateChangingResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

      const result = await healStep(
        { workflowName: 'Check order status', step: step(), needsHealing },
        depsFor({ navigate, registry, ctx, session: cdp, mode: 'attended' }),
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.kind).toBe('needs_confirmation');
      if (result.ok && result.value.kind === 'needs_confirmation') {
        expect(result.value.diff.risk).toBe('state_changing');
        expect(result.value.pending.toolCall).toEqual({
          toolId: 'browser.click',
          args: { type: 'click', ref: toElementRef('el:99') },
        });
      }
      // the click was never dispatched — gating stopped it before execution
      expect(calls).not.toContain('Input.dispatchMouseEvent');
    });

    it('hard-stops a state-changing fix when unattended, without executing it', async () => {
      const cdp = stateChangingFakeCdp([]);
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [stateChangingResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

      const result = await healStep(
        { workflowName: 'Check order status', step: step(), needsHealing },
        depsFor({ navigate, registry, ctx, session: cdp, mode: 'unattended' }),
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.kind).toBe('hard_stopped');
      if (result.ok && result.value.kind === 'hard_stopped') {
        expect(result.value.reason).toContain('unattended');
      }
    });

    it("hard-stops unattended when the fix's tool id falls outside the workflow's RunPolicy allow-list", async () => {
      const cdp = await healableFakeCdp();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const restrictivePolicy: RunPolicy = {
        allowedToolIds: ['browser.wait'],
        allowedOrigins: [],
        allowStateChanging: false,
      };

      const result = await healStep(
        { workflowName: 'Check order status', step: step(), needsHealing },
        { navigate, registry, ctx, session: cdp, runPolicy: restrictivePolicy, mode: 'unattended' },
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.kind).toBe('hard_stopped');
      if (result.ok && result.value.kind === 'hard_stopped') {
        expect(result.value.reason).toContain('RunPolicy');
      }
    });

    it('does not hard-stop unattended for the same fix when its tool id is inside the RunPolicy allow-list', async () => {
      const cdp = await healableFakeCdp();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const permissivePolicy: RunPolicy = {
        allowedToolIds: ['browser.click'],
        allowedOrigins: [],
        allowStateChanging: false,
      };

      const result = await healStep(
        { workflowName: 'Check order status', step: step(), needsHealing },
        { navigate, registry, ctx, session: cdp, runPolicy: permissivePolicy, mode: 'unattended' },
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.kind).toBe('applied');
    });

    it('applyConfirmedHeal executes a gated fix once a human confirms it', async () => {
      const calls: string[] = [];
      const cdp = stateChangingFakeCdp(calls);
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [stateChangingResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };

      const gated = await healStep(
        { workflowName: 'Check order status', step: step(), needsHealing },
        depsFor({ navigate, registry, ctx, session: cdp, mode: 'attended' }),
      );
      expect(gated.ok && gated.value.kind).toBe('needs_confirmation');
      if (!gated.ok || gated.value.kind !== 'needs_confirmation') {
        throw new Error('expected needs_confirmation');
      }

      const applied = await applyConfirmedHeal(gated.value.pending, {
        registry,
        ctx,
        session: cdp,
      });

      expect(applied.ok).toBe(true);
      expect(applied.ok && applied.value.result.succeeded).toBe(true);
      expect(calls).toContain('Input.dispatchMouseEvent');
    });
  });
});
