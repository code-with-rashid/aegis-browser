import {
  createDefaultToolRegistry,
  createFakeTabManager,
  type ExecutorContext,
} from '@aegis/actions';
import { createNavigatorService } from '@aegis/agent';
import { createMockProvider, type LlmProvider, type ModelRouter } from '@aegis/llm';
import { CdpError, createFakeCdp, type FakeCdp } from '@aegis/perception';
import { createMemoryStorage, err, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { toWorkflowId, toWorkflowStepId } from '../ids';
import type { Workflow } from '../schema';
import { createWorkflowStore } from '../store/workflow-store';
import { runWorkflowWithHealing } from './run-workflow-with-healing';

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

/** A page whose step-1 button moved: the recorded ref/selector are both stale, but an AX button with backend node 42 is still there for the Navigator to find. */
function healableFakeCdp(): FakeCdp {
  return createFakeCdp(1, {
    onSend: (method, params) => {
      switch (method) {
        case 'DOM.resolveNode': {
          const backendNodeId = (params as { backendNodeId?: number }).backendNodeId;
          if (backendNodeId === 99) {
            return err(new CdpError('CDP_SEND_FAILED', 'detached'));
          }
          return ok({ object: { objectId: `obj-${backendNodeId}` } });
        }
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
          return ok({ nodeId: 0 }); // #old-button no longer matches anything
        case 'DOM.getBoxModel':
          return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
        case 'DOM.describeNode':
          return ok({
            node: { nodeName: 'BUTTON', backendNodeId: 42, attributes: ['id', 'new-button'] },
          });
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
        default:
          return ok(undefined);
      }
    },
  });
}

function workflowFixture(): Workflow {
  const now = 1_700_000_000_000;
  return {
    id: toWorkflowId('check-order-status'),
    version: 0,
    name: 'Check order status',
    origin: 'https://shop.example.com',
    params: [],
    steps: [
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'browser.click',
        args: { type: 'click', ref: 'dom:99' },
        target: { ref: 'dom:99', selector: '#old-button' },
      },
      {
        stepId: toWorkflowStepId('step-2'),
        toolId: 'browser.wait',
        args: { type: 'wait', ms: 1 },
      },
    ],
    authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
    createdAt: now,
    updatedAt: now,
  };
}

describe('runWorkflowWithHealing', () => {
  it('heals a step whose selector shifted, patches and version-bumps the workflow, and completes the run', async () => {
    const cdp = healableFakeCdp();
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const store = createWorkflowStore(createMemoryStorage());
    const workflow = workflowFixture();
    await store.createWorkflow(workflow);

    const result = await runWorkflowWithHealing(workflow, {}, store, {
      registry,
      ctx,
      session: cdp,
      navigate,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe('completed');
    if (result.ok && result.value.kind === 'completed') {
      expect(result.value.steps.map((step) => step.stepId)).toEqual(['step-1', 'step-2']);
      expect(result.value.steps.every((step) => step.succeeded)).toBe(true);
    }

    const stored = await store.getWorkflow(workflow.id);
    expect(stored.ok && stored.value?.version).toBe(1);
    expect(stored.ok && stored.value?.steps[0]).toEqual({
      stepId: 'step-1',
      toolId: 'browser.click',
      args: { type: 'click', ref: toElementRef('el:42') },
      target: { ref: toElementRef('el:42'), selector: '#new-button' },
    });
  });

  it('gives up and leaves the workflow untouched when healing cannot find a fix', async () => {
    const cdp = healableFakeCdp();
    await cdp.attach();
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
    const store = createWorkflowStore(createMemoryStorage());
    const workflow = workflowFixture();
    await store.createWorkflow(workflow);

    const result = await runWorkflowWithHealing(workflow, {}, store, {
      registry,
      ctx,
      session: cdp,
      navigate,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe('failed');

    const stored = await store.getWorkflow(workflow.id);
    expect(stored.ok && stored.value?.version).toBe(0);
  });

  it('never invokes the navigator when the run completes without any failure', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    let navigateCalls = 0;
    const navigate: Parameters<typeof runWorkflowWithHealing>[3]['navigate'] = () => {
      navigateCalls += 1;
      return Promise.resolve(ok({ actions: [], toolCalls: [], stuck: false }));
    };
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const store = createWorkflowStore(createMemoryStorage());
    const workflow: Workflow = {
      ...workflowFixture(),
      steps: [
        {
          stepId: toWorkflowStepId('step-2'),
          toolId: 'browser.wait',
          args: { type: 'wait', ms: 1 },
        },
      ],
    };
    await store.createWorkflow(workflow);

    const result = await runWorkflowWithHealing(workflow, {}, store, {
      registry,
      ctx,
      session: cdp,
      navigate,
    });

    expect(result.ok && result.value.kind).toBe('completed');
    expect(navigateCalls).toBe(0);
  });
});
