// @vitest-environment jsdom
import type { WorkflowStepResult } from '@aegis/workflows';
import { toWorkflowStepId } from '@aegis/workflows';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WorkflowRunTrace } from './workflow-run-trace';

function stepFixture(overrides: Partial<WorkflowStepResult> = {}): WorkflowStepResult {
  return {
    stepId: toWorkflowStepId('step-1'),
    toolId: 'browser.click',
    succeeded: true,
    ...overrides,
  };
}

describe('WorkflowRunTrace', () => {
  it('renders nothing when there are no steps', () => {
    const { container } = render(<WorkflowRunTrace steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a succeeded step with its toolId', () => {
    render(<WorkflowRunTrace steps={[stepFixture({ toolId: 'browser.click' })]} />);
    expect(screen.getByText(/OK/)).toBeInTheDocument();
    expect(screen.getByText(/browser\.click/)).toBeInTheDocument();
  });

  it('shows a failed step with its error message', () => {
    render(
      <WorkflowRunTrace
        steps={[stepFixture({ succeeded: false, errorMessage: 'element not found' })]}
      />,
    );
    expect(screen.getByText(/FAILED/)).toBeInTheDocument();
    expect(screen.getByText(/element not found/)).toBeInTheDocument();
  });

  it('hides step output until "Show output" is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkflowRunTrace steps={[stepFixture({ output: { total: '$42' } })]} />);

    expect(screen.queryByText(/\$42/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show output' }));

    expect(screen.getByText(/\$42/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide output' }));
    expect(screen.queryByText(/\$42/)).not.toBeInTheDocument();
  });

  it('renders no output toggle when a step has no output', () => {
    render(<WorkflowRunTrace steps={[stepFixture()]} />);
    expect(screen.queryByRole('button', { name: 'Show output' })).not.toBeInTheDocument();
  });

  it('renders multiple steps in order', () => {
    render(
      <WorkflowRunTrace
        steps={[
          stepFixture({ stepId: toWorkflowStepId('step-1'), toolId: 'browser.click' }),
          stepFixture({ stepId: toWorkflowStepId('step-2'), toolId: 'browser.input_text' }),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('browser.click');
    expect(items[1]).toHaveTextContent('browser.input_text');
  });
});
