import { createFakeTabManager, ToolRegistry, type ExecutorContext } from '@aegis/actions';
import { createFakeCdp, type FakeCdpOptions } from '@aegis/perception';
import { toSecretPlaceholder } from '@aegis/security';
import { ok } from '@aegis/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toWorkflowStepId } from '../ids';
import { toParamPlaceholder } from '../params/param-placeholder';
import type { WorkflowParam, WorkflowStep } from '../schema';
import { runWorkflow } from './run-workflow';

function contextFor(options: FakeCdpOptions = {}): ExecutorContext {
  return { session: createFakeCdp(1, options), tabManager: createFakeTabManager(1) };
}

describe('runWorkflow', () => {
  it('binds a value-kind param before executing, and the tool sees the resolved value', async () => {
    let seenArgs: unknown;
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'test.ask',
      source: 'browser',
      description: 'Ask a question.',
      inputSchema: z.object({ question: z.string() }),
      risk: 'read',
      execute: (args) => {
        seenArgs = args;
        return Promise.resolve(ok(undefined));
      },
    });
    const steps: WorkflowStep[] = [
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'test.ask',
        args: { question: toParamPlaceholder('question') },
      },
    ];
    const params: WorkflowParam[] = [{ kind: 'value', name: 'question', defaultValue: 'default?' }];

    const result = await runWorkflow(
      { steps, params },
      { question: 'what is the price?' },
      registry,
      context,
      context.session,
    );

    expect(result.ok).toBe(true);
    expect(seenArgs).toEqual({ question: 'what is the price?' });
  });

  it('falls back to the param default when the caller supplies no value', async () => {
    let seenArgs: unknown;
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'test.ask',
      source: 'browser',
      description: 'Ask a question.',
      inputSchema: z.object({ question: z.string() }),
      risk: 'read',
      execute: (args) => {
        seenArgs = args;
        return Promise.resolve(ok(undefined));
      },
    });
    const steps: WorkflowStep[] = [
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'test.ask',
        args: { question: toParamPlaceholder('question') },
      },
    ];
    const params: WorkflowParam[] = [{ kind: 'value', name: 'question', defaultValue: 'default?' }];

    const result = await runWorkflow({ steps, params }, {}, registry, context, context.session);

    expect(result.ok).toBe(true);
    expect(seenArgs).toEqual({ question: 'default?' });
  });

  it('binds a secret-kind param to a secret placeholder, never a raw value', async () => {
    let seenArgs: unknown;
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'browser.input_text',
      source: 'browser',
      description: 'Type.',
      inputSchema: z.object({ type: z.literal('input_text'), ref: z.string(), text: z.string() }),
      risk: 'input',
      execute: (args) => {
        seenArgs = args;
        return Promise.resolve(ok(undefined));
      },
    });
    const steps: WorkflowStep[] = [
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'browser.input_text',
        args: { type: 'input_text', ref: 'ax:1', text: toParamPlaceholder('login_password') },
      },
    ];
    const params: WorkflowParam[] = [
      { kind: 'secret', name: 'login_password', secretName: 'my_password' },
    ];

    const result = await runWorkflow({ steps, params }, {}, registry, context, context.session);

    expect(result.ok).toBe(true);
    expect(seenArgs).toEqual({
      type: 'input_text',
      ref: 'ax:1',
      text: toSecretPlaceholder('my_password'),
    });
  });

  it('fails before executing anything when a required param has no value or default', async () => {
    let toolCalled = false;
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    registry.register({
      id: 'test.ask',
      source: 'browser',
      description: 'Ask a question.',
      inputSchema: z.object({ question: z.string() }),
      risk: 'read',
      execute: () => {
        toolCalled = true;
        return Promise.resolve(ok(undefined));
      },
    });
    const steps: WorkflowStep[] = [
      {
        stepId: toWorkflowStepId('step-1'),
        toolId: 'test.ask',
        args: { question: toParamPlaceholder('question') },
      },
    ];
    const params: WorkflowParam[] = [{ kind: 'value', name: 'question' }];

    const result = await runWorkflow({ steps, params }, {}, registry, context, context.session);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('PARAM_VALUE_MISSING');
    expect(toolCalled).toBe(false);
  });

  it('runs a workflow end to end with its RunPolicy carried through unchanged (not consulted by the executor itself)', async () => {
    const context = contextFor({ onSend: () => ok(undefined) });
    await context.session.attach();
    const registry = new ToolRegistry();
    let calls = 0;
    registry.register({
      id: 'test.step',
      source: 'browser',
      description: 'A step.',
      inputSchema: z.object({}),
      risk: 'read',
      execute: () => {
        calls += 1;
        return Promise.resolve(ok(undefined));
      },
    });
    const steps: WorkflowStep[] = [
      { stepId: toWorkflowStepId('step-1'), toolId: 'test.step', args: {} },
      { stepId: toWorkflowStepId('step-2'), toolId: 'test.step', args: {} },
    ];

    const result = await runWorkflow({ steps, params: [] }, {}, registry, context, context.session);

    expect(result.ok && result.value.kind).toBe('completed');
    expect(calls).toBe(2);
  });
});
