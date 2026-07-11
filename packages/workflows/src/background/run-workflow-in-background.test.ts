import {
  createDefaultToolRegistry,
  createFakeTabManager,
  ToolRegistry,
  type ExecutorContext,
} from '@aegis/actions';
import { createNavigatorService } from '@aegis/agent';
import { createMockProvider, type LlmProvider, type ModelRouter } from '@aegis/llm';
import { CdpError, createFakeCdp, type FakeCdp } from '@aegis/perception';
import { createSecretVault, toSecretPlaceholder, type SecretVault } from '@aegis/security';
import { createMemoryStorage, err, ok, toElementRef } from '@aegis/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toRunRecordId, toWorkflowId, toWorkflowStepId } from '../ids';
import type { Workflow } from '../schema';
import { createWorkflowStore } from '../store/workflow-store';
import { createWorkflowRunStore } from './run-record-store';
import { runWorkflowInBackground, type BackgroundRunDeps } from './run-workflow-in-background';

function fakeVault(): SecretVault {
  return createSecretVault(createMemoryStorage());
}

function routerFor(provider: LlmProvider): ModelRouter {
  return { resolve: () => ok(provider) };
}

function navigatorResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    observation: 'The originally recorded button is gone; a similar button is visible.',
    reasoning: 'Click the current Continue button to reproduce the recorded step.',
    memory: '',
    nextGoal: 'Click the Continue button',
    toolCalls: [{ toolId: 'browser.click', args: { type: 'click', ref: 'el:42' } }],
    ...overrides,
  });
}

function twoStepWorkflow(): Workflow {
  const now = 1_700_000_000_000;
  return {
    id: toWorkflowId('check-order-status'),
    version: 0,
    name: 'Check order status',
    origin: 'https://shop.example.com',
    params: [],
    steps: [
      { stepId: toWorkflowStepId('step-1'), toolId: 'browser.wait', args: { type: 'wait', ms: 1 } },
      { stepId: toWorkflowStepId('step-2'), toolId: 'browser.wait', args: { type: 'wait', ms: 1 } },
    ],
    authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
    createdAt: now,
    updatedAt: now,
  };
}

function healableWorkflow(): Workflow {
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
      { stepId: toWorkflowStepId('step-2'), toolId: 'browser.wait', args: { type: 'wait', ms: 1 } },
    ],
    authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
    createdAt: now,
    updatedAt: now,
  };
}

/** A page whose step-1 button moved: the recorded ref/selector are both stale, but a button with backend node 42 (name-dependent) is still there for the Navigator to find. */
function healableFakeCdp(buttonName: string): FakeCdp {
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
          return ok({ nodeId: 0 });
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
                name: { type: 'string', value: buttonName },
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

describe('runWorkflowInBackground', () => {
  it('runs a workflow to completion in one call, persisting the final record', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
    const workflowStore = createWorkflowStore(createMemoryStorage());
    const workflow = twoStepWorkflow();
    await workflowStore.createWorkflow(workflow);
    const runStore = createWorkflowRunStore(createMemoryStorage());
    const runRecord = await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: workflow.id,
      values: {},
    });
    expect(runRecord.ok).toBe(true);
    if (!runRecord.ok) {
      throw new Error('expected a run record');
    }

    const result = await runWorkflowInBackground(
      workflow,
      runRecord.value,
      runStore,
      workflowStore,
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe('completed');
    expect(result.ok && result.value.nextStepIndex).toBe(2);
    expect(result.ok && result.value.stepResults).toHaveLength(2);
  });

  it('resumes from a persisted checkpoint after a simulated service-worker restart, without re-running the completed step', async () => {
    const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
    await cdp.attach();
    const registry = new ToolRegistry();
    let waitCalls = 0;
    registry.register({
      id: 'browser.wait',
      source: 'browser',
      description: 'Wait.',
      inputSchema: z.object({ type: z.literal('wait'), ms: z.number() }),
      risk: 'read',
      execute: () => {
        waitCalls += 1;
        return Promise.resolve(ok({ kind: 'wait' }));
      },
    });
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
    const workflowStore = createWorkflowStore(createMemoryStorage());
    const workflow = twoStepWorkflow();
    await workflowStore.createWorkflow(workflow);
    const runStorage = createMemoryStorage();
    const runStore = createWorkflowRunStore(runStorage);
    const runRecord = await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: workflow.id,
      values: {},
    });
    expect(runRecord.ok).toBe(true);
    if (!runRecord.ok) {
      throw new Error('expected a run record');
    }

    const controller = new AbortController();
    controller.abort();
    const interrupted = await runWorkflowInBackground(
      workflow,
      runRecord.value,
      runStore,
      workflowStore,
      deps,
      controller.signal,
    );
    expect(interrupted.ok && interrupted.value.status).toBe('aborted');
    expect(interrupted.ok && interrupted.value.nextStepIndex).toBe(0);

    // simulate a fresh service worker: brand-new store instances over the same storage,
    // reloading whatever was persisted before the "restart".
    const rehydratedRunStore = createWorkflowRunStore(runStorage);
    const reloaded = await rehydratedRunStore.getRun(toRunRecordId('run-1'));
    expect(reloaded.ok && reloaded.value?.status).toBe('aborted');
    if (!reloaded.ok || reloaded.value === undefined) {
      throw new Error('expected a reloaded run record');
    }
    await rehydratedRunStore.updateRun(toRunRecordId('run-1'), { status: 'running' });
    const resumedRecord = await rehydratedRunStore.getRun(toRunRecordId('run-1'));
    if (!resumedRecord.ok || resumedRecord.value === undefined) {
      throw new Error('expected the run record to still exist');
    }

    const resumed = await runWorkflowInBackground(
      workflow,
      resumedRecord.value,
      rehydratedRunStore,
      workflowStore,
      deps,
    );

    expect(resumed.ok).toBe(true);
    expect(resumed.ok && resumed.value.status).toBe('completed');
    expect(resumed.ok && resumed.value.nextStepIndex).toBe(2);
    expect(waitCalls).toBe(2);
  });

  it('heals a step whose selector shifted, patches the workflow, and completes the run unattended', async () => {
    const cdp = healableFakeCdp('Continue');
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
    const workflowStore = createWorkflowStore(createMemoryStorage());
    const workflow = healableWorkflow();
    await workflowStore.createWorkflow(workflow);
    const runStore = createWorkflowRunStore(createMemoryStorage());
    const runRecord = await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: workflow.id,
      values: {},
    });
    if (!runRecord.ok) {
      throw new Error('expected a run record');
    }

    const result = await runWorkflowInBackground(
      workflow,
      runRecord.value,
      runStore,
      workflowStore,
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe('completed');

    const stored = await workflowStore.getWorkflow(workflow.id);
    expect(stored.ok && stored.value?.version).toBe(1);
    expect(stored.ok && stored.value?.steps[0]).toEqual({
      stepId: 'step-1',
      toolId: 'browser.click',
      args: { type: 'click', ref: toElementRef('el:42') },
      target: { ref: toElementRef('el:42'), selector: '#new-button' },
    });
  });

  it('hard-stops on a state-changing heal, recording the reason and leaving the workflow untouched', async () => {
    const cdp = healableFakeCdp('Submit Order');
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({ responses: [navigatorResponse()] });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
    const workflowStore = createWorkflowStore(createMemoryStorage());
    const workflow = healableWorkflow();
    await workflowStore.createWorkflow(workflow);
    const runStore = createWorkflowRunStore(createMemoryStorage());
    const runRecord = await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: workflow.id,
      values: {},
    });
    if (!runRecord.ok) {
      throw new Error('expected a run record');
    }

    const result = await runWorkflowInBackground(
      workflow,
      runRecord.value,
      runStore,
      workflowStore,
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe('hard_stopped');
    expect(result.ok && result.value.reason).toContain('unattended');
    expect(result.ok && result.value.nextStepIndex).toBe(0);

    const stored = await workflowStore.getWorkflow(workflow.id);
    expect(stored.ok && stored.value?.version).toBe(0);
  });

  it('fails the run when a step cannot be healed at all', async () => {
    const cdp = createFakeCdp(1, {
      onSend: (method) => {
        if (method === 'DOM.getDocument') {
          return ok({ root: { nodeId: 1 } });
        }
        if (method === 'DOM.querySelector') {
          return ok({ nodeId: 0 });
        }
        if (method === 'DOM.resolveNode') {
          return err(new CdpError('CDP_SEND_FAILED', 'detached'));
        }
        if (method === 'Accessibility.getFullAXTree') {
          return ok({ nodes: [] });
        }
        return ok(undefined);
      },
    });
    await cdp.attach();
    const registry = createDefaultToolRegistry();
    const provider = createMockProvider({
      responses: [
        navigatorResponse({ toolCalls: [] }),
        navigatorResponse({ toolCalls: [] }),
        navigatorResponse({ toolCalls: [] }),
      ],
    });
    const navigate = createNavigatorService(routerFor(provider), registry);
    const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
    const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
    const workflowStore = createWorkflowStore(createMemoryStorage());
    const workflow = healableWorkflow();
    await workflowStore.createWorkflow(workflow);
    const runStore = createWorkflowRunStore(createMemoryStorage());
    const runRecord = await runStore.createRun({
      id: toRunRecordId('run-1'),
      workflowId: workflow.id,
      values: {},
    });
    if (!runRecord.ok) {
      throw new Error('expected a run record');
    }

    const result = await runWorkflowInBackground(
      workflow,
      runRecord.value,
      runStore,
      workflowStore,
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe('failed');
  });

  describe('unattended-mode guardrails (#117)', () => {
    it('hard-stops before executing anything when the workflow exceeds maxStepsPerRun', async () => {
      const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const workflow: Workflow = {
        ...twoStepWorkflow(),
        authorization: {
          allowedToolIds: [],
          allowedOrigins: [],
          allowStateChanging: false,
          maxStepsPerRun: 1,
        },
      };
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('hard_stopped');
      expect(result.ok && result.value.reason).toContain('maxStepsPerRun');
      expect(result.ok && result.value.nextStepIndex).toBe(0);
    });

    it("hard-stops before executing anything when the workflow's origin is outside the RunPolicy allow-list", async () => {
      const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const workflow: Workflow = {
        ...twoStepWorkflow(),
        authorization: {
          allowedToolIds: [],
          allowedOrigins: ['https://different.example.com'],
          allowStateChanging: false,
        },
      };
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('hard_stopped');
      expect(result.ok && result.value.reason).toContain('Origin');
    });

    it('hard-stops on a recorded step whose tool id is outside the RunPolicy allow-list', async () => {
      const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const workflow: Workflow = {
        ...twoStepWorkflow(),
        authorization: {
          allowedToolIds: ['browser.click'], // the workflow's own steps use browser.wait
          allowedOrigins: [],
          allowStateChanging: false,
        },
      };
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('hard_stopped');
      expect(result.ok && result.value.reason).toContain('browser.wait');
      expect(result.ok && result.value.nextStepIndex).toBe(0);
    });

    function stateChangingStepWorkflow(allowStateChanging: boolean): Workflow {
      const now = 1_700_000_000_000;
      return {
        id: toWorkflowId('checkout'),
        version: 0,
        name: 'Checkout',
        origin: 'https://shop.example.com',
        params: [],
        steps: [
          {
            stepId: toWorkflowStepId('step-1'),
            toolId: 'browser.click',
            args: { type: 'click', ref: 'ax:1' },
            target: { ref: 'ax:1', name: 'Submit Order' },
          },
        ],
        authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging },
        createdAt: now,
        updatedAt: now,
      };
    }

    it('hard-stops a recorded state-changing step when the policy does not authorize it unattended', async () => {
      const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const workflow = stateChangingStepWorkflow(false);
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('hard_stopped');
      expect(result.ok && result.value.reason).toContain('state-changing');
    });

    it('runs a recorded state-changing step when the policy authorizes it unattended', async () => {
      const cdp = createFakeCdp(1, {
        onSend: (method) => {
          switch (method) {
            case 'DOM.resolveNode':
              return ok({ object: { objectId: 'obj-1' } });
            case 'DOM.getBoxModel':
              return ok({ model: { border: [0, 0, 10, 0, 10, 10, 0, 10] } });
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
      const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault: fakeVault() };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const workflow = stateChangingStepWorkflow(true);
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('completed');
    });

    it("resolves a secret placeholder in a step's args to its real value before executing, never the placeholder", async () => {
      const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
      await cdp.attach();
      const registry = new ToolRegistry();
      let seenArgs: unknown;
      registry.register({
        id: 'browser.input_text',
        source: 'browser',
        description: 'Type.',
        inputSchema: z.object({ type: z.literal('input_text'), ref: z.string(), text: z.string() }),
        risk: 'input',
        execute: (args) => {
          seenArgs = args;
          return Promise.resolve(ok({ kind: 'input_text' }));
        },
      });
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const vault = await (async () => {
        const v = createSecretVault(createMemoryStorage());
        await v.unlock('passphrase');
        await v.setSecret('login_password', 'hunter2');
        return v;
      })();
      const deps: BackgroundRunDeps = { registry, ctx, session: cdp, navigate, vault };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const now = 1_700_000_000_000;
      const workflow: Workflow = {
        id: toWorkflowId('login'),
        version: 0,
        name: 'Log in',
        origin: 'https://shop.example.com',
        params: [],
        steps: [
          {
            stepId: toWorkflowStepId('step-1'),
            toolId: 'browser.input_text',
            args: {
              type: 'input_text',
              ref: 'ax:1',
              text: toSecretPlaceholder('login_password'),
            },
          },
        ],
        authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
        createdAt: now,
        updatedAt: now,
      };
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('completed');
      expect(seenArgs).toEqual({ type: 'input_text', ref: 'ax:1', text: 'hunter2' });
    });

    it('hard-stops with a clear reason when a secret cannot be resolved because the vault is locked', async () => {
      const cdp = createFakeCdp(1, { onSend: () => ok(undefined) });
      await cdp.attach();
      const registry = createDefaultToolRegistry();
      const provider = createMockProvider({ responses: [navigatorResponse()] });
      const navigate = createNavigatorService(routerFor(provider), registry);
      const ctx: ExecutorContext = { session: cdp, tabManager: createFakeTabManager(1) };
      const deps: BackgroundRunDeps = {
        registry,
        ctx,
        session: cdp,
        navigate,
        vault: createSecretVault(createMemoryStorage()), // never unlocked
      };
      const workflowStore = createWorkflowStore(createMemoryStorage());
      const now = 1_700_000_000_000;
      const workflow: Workflow = {
        id: toWorkflowId('login'),
        version: 0,
        name: 'Log in',
        origin: 'https://shop.example.com',
        params: [],
        steps: [
          {
            stepId: toWorkflowStepId('step-1'),
            toolId: 'browser.input_text',
            args: {
              type: 'input_text',
              ref: 'ax:1',
              text: toSecretPlaceholder('login_password'),
            },
          },
        ],
        authorization: { allowedToolIds: [], allowedOrigins: [], allowStateChanging: false },
        createdAt: now,
        updatedAt: now,
      };
      await workflowStore.createWorkflow(workflow);
      const runStore = createWorkflowRunStore(createMemoryStorage());
      const runRecord = await runStore.createRun({
        id: toRunRecordId('run-1'),
        workflowId: workflow.id,
        values: {},
      });
      if (!runRecord.ok) {
        throw new Error('expected a run record');
      }

      const result = await runWorkflowInBackground(
        workflow,
        runRecord.value,
        runStore,
        workflowStore,
        deps,
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.status).toBe('hard_stopped');
      expect(result.ok && result.value.reason).toContain('secret');
    });
  });
});
