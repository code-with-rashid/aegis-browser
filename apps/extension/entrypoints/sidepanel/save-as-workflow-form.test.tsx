// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SaveAsWorkflowForm } from './save-as-workflow-form';

describe('SaveAsWorkflowForm', () => {
  it('disables Save until a name is entered', () => {
    render(<SaveAsWorkflowForm saveWorkflowStatus={{ status: 'idle' }} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save as workflow' })).toBeDisabled();
  });

  it('calls onSave with the entered name', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<SaveAsWorkflowForm saveWorkflowStatus={{ status: 'idle' }} onSave={onSave} />);

    await user.type(screen.getByPlaceholderText('Workflow name'), 'Buy oat milk');
    await user.click(screen.getByRole('button', { name: 'Save as workflow' }));

    expect(onSave).toHaveBeenCalledWith('Buy oat milk');
  });

  it('shows a saving state and disables the button', () => {
    render(<SaveAsWorkflowForm saveWorkflowStatus={{ status: 'saving' }} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('shows a success message instead of the form once saved', () => {
    render(
      <SaveAsWorkflowForm
        saveWorkflowStatus={{ status: 'saved', workflowId: 'workflow-1' }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(/Saved as a workflow/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save as workflow/ })).not.toBeInTheDocument();
  });

  it('shows an error message', () => {
    render(
      <SaveAsWorkflowForm
        saveWorkflowStatus={{ status: 'error', message: 'Enter a name' }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Enter a name')).toBeInTheDocument();
  });
});
