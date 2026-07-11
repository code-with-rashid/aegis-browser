import {
  createDefaultToolRegistry,
  createFakeTabManager,
  ToolExecutionError,
  ToolRegistry,
  type ExecutorContext,
} from '@aegis/actions';
import { createFakeCdp, type FakeCdpOptions } from '@aegis/perception';
import { err, ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toWorkflowStepId } from '../ids';
import type { WorkflowStep } from '../schema';
import { executeWorkflow } from './execute-workflow';

function contextFor(options: FakeCdpOptions = {}): ExecutorContext {
  return { session: createFakeCdp(1, options), tabManager: createFakeTabManager(1) };
}

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.wait',
    args: { type: 'wait', ms: 1 },
    ...overrides,
  };
}

describe('executeWorkflow', () => {
  it('completes a multi-step run with zero LLM involvement, in order', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const steps = [
      step(),
      step({ stepId: toWorkflowStepId('step-2'), args: { type: 'wait', ms: 2 } }),
    ];

    const outcome = await executeWorkflow(
      steps,
      createDefaultToolRegistry(),
      context,
      context.session,
    );

    expect(outcome.kind).toBe('completed');
    expect(outcome.steps.map((result) => result.toolId)).toEqual(['browser.wait', 'browser.wait']);
    expect(outcome.steps.every((result) => result.succeeded)).toBe(true);
  });

  it('runs a non-browser tool call straight through the registry', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = createDefaultToolRegistry();
    let called = false;
    registry.register({
      id: 'mcp.weather.lookup',
      source: 'mcp',
      description: 'Look up the weather.',
      inputSchema: z.object({ city: z.string() }),
      risk: 'read',
      execute: () => {
        called = true;
        return Promise.resolve(ok({ tempC: 20 }));
      },
    });

    const outcome = await executeWorkflow(
      [step({ toolId: 'mcp.weather.lookup', args: { city: 'London' } })],
      registry,
      context,
      context.session,
    );

    expect(outcome.kind).toBe('completed');
    expect(called).toBe(true);
  });

  it('stops at the first failing step and reports which one failed', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'mcp.broken.tool',
      source: 'mcp',
      description: 'Always fails.',
      inputSchema: z.object({}),
      risk: 'read',
      execute: () => Promise.resolve(err(new ToolExecutionError('TOOL_EXECUTION_FAILED', 'nope'))),
    });
    const steps = [
      step({ toolId: 'mcp.broken.tool', args: {} }),
      step({
        stepId: toWorkflowStepId('step-2'),
        toolId: 'browser.go_back',
        args: { type: 'go_back' },
      }),
    ];

    const outcome = await executeWorkflow(steps, registry, context, context.session);

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.failedStepId).toBe('step-1');
      expect(outcome.steps).toHaveLength(1);
      expect(outcome.steps[0]?.succeeded).toBe(false);
    }
  });

  it('fails a step whose target cannot be re-resolved, without calling the tool', async () => {
    let toolCalled = false;
    const context = contextFor({
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return err(new Error('detached') as never);
        }
        if (method === 'DOM.getDocument') {
          return ok({ root: { nodeId: 1 } });
        }
        if (method === 'DOM.querySelector') {
          return ok({ nodeId: 0 });
        }
        return ok(undefined);
      },
    });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'browser.click',
      source: 'browser',
      description: 'Click.',
      inputSchema: z.object({ type: z.literal('click'), ref: z.string() }),
      risk: 'read',
      execute: () => {
        toolCalled = true;
        return Promise.resolve(ok(undefined));
      },
    });
    const withTarget = step({
      toolId: 'browser.click',
      args: { type: 'click', ref: 'ax:1' },
      target: { ref: 'ax:1', selector: '#gone' },
    });

    const outcome = await executeWorkflow([withTarget], registry, context, context.session);

    expect(outcome.kind).toBe('failed');
    expect(toolCalled).toBe(false);
  });

  it("captures a succeeding tool call's own result value as the step output", async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'mcp.weather.lookup',
      source: 'mcp',
      description: 'Look up the weather.',
      inputSchema: z.object({}),
      risk: 'read',
      execute: () => Promise.resolve(ok({ tempC: 20 })),
    });

    const outcome = await executeWorkflow(
      [step({ toolId: 'mcp.weather.lookup', args: {} })],
      registry,
      context,
      context.session,
    );

    expect(outcome.kind).toBe('completed');
    expect(outcome.steps[0]?.output).toEqual({ tempC: 20 });
  });

  it('fails a step whose expect post-condition is not met, capturing the output and a needsHealing signal', async () => {
    const context = contextFor({
      onSend: (method) => {
        if (method === 'DOM.getDocument') {
          return ok({ root: { nodeId: 1 } });
        }
        if (method === 'DOM.querySelector') {
          return ok({ nodeId: 0 });
        }
        return ok(undefined);
      },
    });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'mcp.checkout.submit',
      source: 'mcp',
      description: 'Submit checkout.',
      inputSchema: z.object({}),
      risk: 'state_changing',
      execute: () => Promise.resolve(ok({ confirmationId: 'abc' })),
    });
    const withExpect = step({
      toolId: 'mcp.checkout.submit',
      args: {},
      expect: { type: 'element_visible', selector: '#confirmation' },
    });

    const outcome = await executeWorkflow([withExpect], registry, context, context.session);

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.needsHealing.stepId).toBe('step-1');
      expect(outcome.needsHealing.reason).toBe('post_condition_failed');
      expect(outcome.needsHealing.message).toContain('element_visible');
      expect(outcome.steps[0]?.succeeded).toBe(false);
      expect(outcome.steps[0]?.output).toEqual({ confirmationId: 'abc' });
    }
  });

  it('continues past a step whose expect post-condition is met', async () => {
    const context = contextFor({
      onSend: (method) => {
        if (method === 'DOM.getDocument') {
          return ok({ root: { nodeId: 1 } });
        }
        if (method === 'DOM.querySelector') {
          return ok({ nodeId: 42 });
        }
        if (method === 'DOM.resolveNode') {
          return ok({ object: { objectId: 'obj-1' } });
        }
        if (method === 'Runtime.callFunctionOn') {
          return ok({ result: { value: true } });
        }
        return ok(undefined);
      },
    });
    await context.session.attach();
    const registry = createDefaultToolRegistry();
    const withExpect = step({ expect: { type: 'element_visible', selector: '#confirmation' } });

    const outcome = await executeWorkflow([withExpect], registry, context, context.session);

    expect(outcome.kind).toBe('completed');
  });

  it('carries a needsHealing signal for a target-resolution failure', async () => {
    const context = contextFor({
      onSend: (method) => {
        if (method === 'DOM.resolveNode') {
          return err(new Error('detached') as never);
        }
        if (method === 'DOM.getDocument') {
          return ok({ root: { nodeId: 1 } });
        }
        if (method === 'DOM.querySelector') {
          return ok({ nodeId: 0 });
        }
        return ok(undefined);
      },
    });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'browser.click',
      source: 'browser',
      description: 'Click.',
      inputSchema: z.object({ type: z.literal('click'), ref: z.string() }),
      risk: 'read',
      execute: () => Promise.resolve(ok(undefined)),
    });
    const withTarget = step({
      toolId: 'browser.click',
      args: { type: 'click', ref: 'ax:1' },
      target: { ref: 'ax:1', selector: '#gone' },
    });

    const outcome = await executeWorkflow([withTarget], registry, context, context.session);

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.needsHealing.reason).toBe('target_not_found');
      expect(outcome.needsHealing.stepId).toBe('step-1');
    }
  });

  it('carries a needsHealing signal for a tool-call failure', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'mcp.broken.tool',
      source: 'mcp',
      description: 'Always fails.',
      inputSchema: z.object({}),
      risk: 'read',
      execute: () => Promise.resolve(err(new ToolExecutionError('TOOL_EXECUTION_FAILED', 'nope'))),
    });

    const outcome = await executeWorkflow(
      [step({ toolId: 'mcp.broken.tool', args: {} })],
      registry,
      context,
      context.session,
    );

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.needsHealing.reason).toBe('tool_call_failed');
    }
  });

  it('reports aborted when the signal is already aborted', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const controller = new AbortController();
    controller.abort();

    const outcome = await executeWorkflow(
      [step()],
      createDefaultToolRegistry(),
      context,
      context.session,
      controller.signal,
    );

    expect(outcome.kind).toBe('aborted');
    expect(outcome.steps).toEqual([]);
  });
});
