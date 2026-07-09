import type { Action } from '@aegis/actions';
import type { ConfirmationRequest } from '@aegis/agent';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

function editableTextOf(action: Action): string | undefined {
  if (action.type === 'input_text') {
    return action.text;
  }
  if (action.type === 'send_keys') {
    return action.keys;
  }
  return undefined;
}

function withEditedText(action: Action, text: string): Action {
  if (action.type === 'input_text') {
    return { ...action, text };
  }
  if (action.type === 'send_keys') {
    return { ...action, keys: text };
  }
  return action;
}

export interface ConfirmationModalProps {
  readonly request: ConfirmationRequest;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onEdit: (actions: readonly Action[]) => void;
}

/**
 * The human decision point (#27): blocks until Approve, Edit, or Reject is chosen. Uses
 * the native `<dialog>` element for its built-in modal semantics — `showModal()` traps
 * focus and makes the rest of the page inert without any custom focus-trap code.
 * Pressing Escape fires the native `cancel` event, which we treat as an explicit Reject
 * (never a silent dismiss that would leave the loop stuck in `confirming` with no
 * decision ever sent) — initial focus goes to Reject, the safe default, not Approve.
 */
export function ConfirmationModal({
  request,
  onApprove,
  onReject,
  onEdit,
}: ConfirmationModalProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftActions, setDraftActions] = useState<readonly Action[]>(request.actions);
  // Resets draftActions/editing when `request` changes (e.g. after EDIT_RUN produces a
  // fresh preview) — computed during render rather than in an effect, per React's
  // guidance for resetting derived state on a prop change (avoids an extra render).
  const [previousRequest, setPreviousRequest] = useState(request);
  if (request !== previousRequest) {
    setPreviousRequest(request);
    setDraftActions(request.actions);
    setEditing(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      // jsdom (our test environment) doesn't implement showModal()/close() — falling
      // back to the open attribute directly keeps the dialog visible/accessible there.
      // A real browser always takes the showModal() branch, with its real modal
      // semantics (focus trap, inert background, top-layer rendering).
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }
    rejectButtonRef.current?.focus();
    return () => {
      if (dialog === null) {
        return;
      }
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    };
  }, []);

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    onReject();
  }

  function handleSaveEdit(): void {
    onEdit(draftActions);
    setEditing(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-[90%] max-w-[320px] rounded-md border border-border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/50"
      aria-labelledby="confirmation-title"
      aria-describedby={request.reason !== undefined ? 'confirmation-description' : undefined}
      onCancel={handleCancel}
    >
      <h2 id="confirmation-title" className="text-base font-semibold">
        Confirm action
      </h2>
      {request.reason !== undefined ? (
        <p id="confirmation-description" className="mt-1 text-sm text-muted-foreground">
          {request.reason}
        </p>
      ) : null}

      {!editing ? (
        <ul className="mt-3 space-y-1 text-sm">
          {request.preview.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {draftActions.map((action, index) => {
            const text = editableTextOf(action);
            const previewLine = request.preview[index] ?? action.type;
            if (text === undefined) {
              return <li key={index}>{previewLine}</li>;
            }
            return (
              <li key={index}>
                <label
                  className="block text-xs text-muted-foreground"
                  htmlFor={`edit-action-${index}`}
                >
                  {previewLine}
                </label>
                <input
                  id={`edit-action-${index}`}
                  className="mt-1 w-full rounded border border-border bg-background p-1 text-sm"
                  value={text}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDraftActions((current) =>
                      current.map((currentAction, currentIndex) =>
                        currentIndex === index
                          ? withEditedText(currentAction, nextValue)
                          : currentAction,
                      ),
                    );
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {editing ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancel edit
            </Button>
            <Button variant="secondary" onClick={handleSaveEdit}>
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button ref={rejectButtonRef} variant="outline" onClick={onReject}>
              Reject
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button onClick={onApprove}>Approve</Button>
          </>
        )}
      </div>
    </dialog>
  );
}
