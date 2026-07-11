// @vitest-environment jsdom
import type { WorkflowStep } from '@aegis/workflows';
import { toWorkflowStepId } from '@aegis/workflows';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowStepsEditor } from './workflow-steps-editor';

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.click',
    args: { ref: 'ax:1' },
    ...overrides,
  };
}

const STEPS = [
  step({ stepId: toWorkflowStepId('a'), toolId: 'browser.click' }),
  step({ stepId: toWorkflowStepId('b'), toolId: 'browser.input_text' }),
];

describe('WorkflowStepsEditor', () => {
  it('shows a message when there are no steps', () => {
    render(<WorkflowStepsEditor steps={[]} onChange={vi.fn()} />);
    expect(screen.getByText('This workflow has no steps.')).toBeInTheDocument();
  });

  it('lists each step with its position and toolId', () => {
    render(<WorkflowStepsEditor steps={STEPS} onChange={vi.fn()} />);
    expect(screen.getByText(/1\. browser\.click/)).toBeInTheDocument();
    expect(screen.getByText(/2\. browser\.input_text/)).toBeInTheDocument();
  });

  it('shows the target and expect summaries when present', () => {
    render(
      <WorkflowStepsEditor
        steps={[
          step({
            target: { selector: '#search' },
            expect: { type: 'element_visible', selector: '#results' },
          }),
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Target: #search/)).toBeInTheDocument();
    expect(screen.getByText(/Expect: element visible: #results/)).toBeInTheDocument();
  });

  it('disables "up" on the first step and "down" on the last', () => {
    render(<WorkflowStepsEditor steps={STEPS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move step 2 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move step 1 down' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move step 2 up' })).not.toBeDisabled();
  });

  it('calls onChange with the reordered steps when "down" is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowStepsEditor steps={STEPS} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Move step 1 down' }));

    expect(onChange).toHaveBeenCalledWith([STEPS[1], STEPS[0]]);
  });

  it('calls onChange with the step removed when "Delete" is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowStepsEditor steps={STEPS} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Delete step 1' }));

    expect(onChange).toHaveBeenCalledWith([STEPS[1]]);
  });

  it('hides step args until "Show args" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowStepsEditor
        steps={[step({ args: { secretLooking: 'value123' } })]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/value123/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show args' }));
    expect(screen.getByText(/value123/)).toBeInTheDocument();
  });
});
