// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RunPolicyDraft } from './workflow-run-policy-draft';
import { WorkflowRunPolicyEditor } from './workflow-run-policy-editor';

/** A stateful wrapper — `WorkflowRunPolicyEditor` is a purely controlled component, so exercising multi-keystroke typing needs a harness that actually feeds `onChange` back into `draft`, exactly like `WorkflowBuilderPanel` does. */
function StatefulEditor({ initial }: { initial: RunPolicyDraft }): React.JSX.Element {
  const [draft, setDraft] = useState(initial);
  return <WorkflowRunPolicyEditor draft={draft} onChange={setDraft} />;
}

const DRAFT: RunPolicyDraft = {
  allowedToolIds: 'browser.click',
  allowedOrigins: 'https://example.com',
  allowStateChanging: false,
  maxStepsPerRun: '20',
  maxRunsPerDay: '',
};

describe('WorkflowRunPolicyEditor', () => {
  it('reflects each field from the draft', () => {
    render(<WorkflowRunPolicyEditor draft={DRAFT} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Allowed tool ids/)).toHaveValue('browser.click');
    expect(screen.getByLabelText(/Allowed origins/)).toHaveValue('https://example.com');
    expect(screen.getByLabelText(/Allow state-changing steps unattended/)).not.toBeChecked();
    expect(screen.getByLabelText(/Max steps per run/)).toHaveValue('20');
    expect(screen.getByLabelText(/Max runs per day/)).toHaveValue('');
  });

  it('accumulates typed text across keystrokes without reformatting it', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor initial={{ ...DRAFT, allowedToolIds: '' }} />);

    await user.type(screen.getByLabelText(/Allowed tool ids/), 'a, b');

    expect(screen.getByLabelText(/Allowed tool ids/)).toHaveValue('a, b');
  });

  it('toggles allowStateChanging', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowRunPolicyEditor draft={DRAFT} onChange={onChange} />);

    await user.click(screen.getByLabelText(/Allow state-changing steps unattended/));

    expect(onChange).toHaveBeenCalledWith({ ...DRAFT, allowStateChanging: true });
  });
});
