// @vitest-environment jsdom
import type { ConfirmationRequest } from '@aegis/agent';
import { toElementRef } from '@aegis/shared';
import { fireEvent, render, screen, type ByRoleOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmationModal } from './confirmation-modal';

// jsdom doesn't implement HTMLDialogElement.showModal(), so our <dialog> never gains the
// `open` attribute in tests — per HTML semantics, a closed <dialog>'s whole subtree is
// hidden from the accessibility tree, so every role query here needs `hidden: true`.
function getByRole(role: Parameters<typeof screen.getByRole>[0], options?: ByRoleOptions) {
  return screen.getByRole(role, { hidden: true, ...options });
}
function queryByRole(role: Parameters<typeof screen.queryByRole>[0], options?: ByRoleOptions) {
  return screen.queryByRole(role, { hidden: true, ...options });
}

function requestFixture(overrides: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  return {
    actions: [{ type: 'click', ref: toElementRef('ax:1') }],
    preview: ['Click "Submit Order"'],
    reason: 'Submit Order is state-changing',
    ...overrides,
  };
}

describe('ConfirmationModal', () => {
  it('renders as a labeled, described dialog with the preview and reason', () => {
    render(
      <ConfirmationModal
        request={requestFixture()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const dialog = getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Confirm action');
    expect(dialog).toHaveAccessibleDescription('Submit Order is state-changing');
    expect(screen.getByText('Click "Submit Order"')).toBeInTheDocument();
  });

  it('focuses the Reject button on mount — the safe default, not Approve', () => {
    render(
      <ConfirmationModal
        request={requestFixture()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(getByRole('button', { name: 'Reject' })).toHaveFocus();
  });

  it('Approve calls onApprove', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        request={requestFixture()}
        onApprove={onApprove}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: 'Approve' }));

    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('Reject calls onReject', async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        request={requestFixture()}
        onApprove={vi.fn()}
        onReject={onReject}
        onEdit={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: 'Reject' }));

    expect(onReject).toHaveBeenCalledOnce();
  });

  it('a native cancel event (Escape) is treated as Reject, never a silent dismiss', () => {
    const onReject = vi.fn();
    render(
      <ConfirmationModal
        request={requestFixture()}
        onApprove={vi.fn()}
        onReject={onReject}
        onEdit={vi.fn()}
      />,
    );

    fireEvent(getByRole('dialog'), new Event('cancel', { cancelable: true }));

    expect(onReject).toHaveBeenCalledOnce();
  });

  it('Edit reveals an editable field for a text-bearing action, pre-filled with its current value', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        request={requestFixture({
          actions: [{ type: 'input_text', ref: toElementRef('ax:1'), text: 'hunter2' }],
          preview: ['Enter "hunter2" into "Password"'],
        })}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: 'Edit' }));

    expect(getByRole('textbox')).toHaveValue('hunter2');
  });

  it('does not offer an editable field for an action with no free-text value', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        request={requestFixture()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: 'Edit' }));

    expect(queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Click "Submit Order"')).toBeInTheDocument();
  });

  it('Save changes calls onEdit with the revised action and exits edit mode', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        request={requestFixture({
          actions: [{ type: 'input_text', ref: toElementRef('ax:1'), text: 'hunter2' }],
          preview: ['Enter "hunter2" into "Password"'],
        })}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(getByRole('button', { name: 'Edit' }));
    await user.clear(getByRole('textbox'));
    await user.type(getByRole('textbox'), 'correct-password');
    await user.click(getByRole('button', { name: 'Save changes' }));

    expect(onEdit).toHaveBeenCalledWith([
      { type: 'input_text', ref: toElementRef('ax:1'), text: 'correct-password' },
    ]);
    expect(queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Cancel edit discards changes without calling onEdit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        request={requestFixture({
          actions: [{ type: 'input_text', ref: toElementRef('ax:1'), text: 'hunter2' }],
          preview: ['Enter "hunter2" into "Password"'],
        })}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(getByRole('button', { name: 'Edit' }));
    await user.type(getByRole('textbox'), 'oops');
    await user.click(getByRole('button', { name: 'Cancel edit' }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('a new request (e.g. after EDIT_RUN produces an updated preview) exits edit mode and refreshes the preview', async () => {
    const user = userEvent.setup();
    const firstRequest = requestFixture({
      actions: [{ type: 'input_text', ref: toElementRef('ax:1'), text: 'hunter2' }],
      preview: ['Enter "hunter2" into "Password"'],
    });
    const { rerender } = render(
      <ConfirmationModal
        request={firstRequest}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: 'Edit' }));
    expect(getByRole('textbox')).toBeInTheDocument();

    const updatedRequest = requestFixture({
      actions: [{ type: 'input_text', ref: toElementRef('ax:1'), text: 'correct-password' }],
      preview: ['Enter "correct-password" into "Password"'],
    });
    rerender(
      <ConfirmationModal
        request={updatedRequest}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Enter "correct-password" into "Password"')).toBeInTheDocument();
  });
});
