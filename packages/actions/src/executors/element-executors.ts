import { err, isErr, ok, type Result } from '@aegis/shared';
import { getElementBounds, type CdpSession } from '@aegis/perception';

import type {
  ClickAction,
  GetDropdownOptionsAction,
  InputTextAction,
  ScrollAction,
  SelectDropdownOptionAction,
  SendKeysAction,
} from '../schema';
import { parseKeyCombo } from './key-map';
import { focusElement, resolveRef, selectElementContent } from './resolve-ref';
import {
  ActionExecutionError,
  type ClickResult,
  type DropdownOption,
  type GetDropdownOptionsResult,
  type InputTextResult,
  type ScrollResult,
  type SelectDropdownOptionResult,
  type SendKeysResult,
} from './types';

function isDropdownOptionArray(value: unknown): value is DropdownOption[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      const candidate = item as { value?: unknown; label?: unknown };
      return typeof candidate.value === 'string' && typeof candidate.label === 'string';
    })
  );
}

export async function executeClick(
  session: CdpSession,
  action: ClickAction,
): Promise<Result<ClickResult, ActionExecutionError>> {
  const resolved = await resolveRef(session, action.ref);
  if (isErr(resolved)) {
    return resolved;
  }

  await session.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: resolved.value.backendNodeId });

  const boundsResult = await getElementBounds(session, resolved.value.backendNodeId);
  if (isErr(boundsResult)) {
    return err(
      new ActionExecutionError('ELEMENT_DETACHED', `Could not get bounds for ref "${action.ref}"`, {
        cause: boundsResult.error,
      }),
    );
  }
  if (boundsResult.value === undefined) {
    return err(new ActionExecutionError('ELEMENT_DETACHED', `Ref "${action.ref}" has no bounds`));
  }

  const x = boundsResult.value.x + boundsResult.value.width / 2;
  const y = boundsResult.value.y + boundsResult.value.height / 2;

  const pressed = await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  if (isErr(pressed)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to dispatch mousePressed', {
        cause: pressed.error,
      }),
    );
  }

  const released = await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  if (isErr(released)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to dispatch mouseReleased', {
        cause: released.error,
      }),
    );
  }

  return ok({ kind: 'click' });
}

export async function executeInputText(
  session: CdpSession,
  action: InputTextAction,
): Promise<Result<InputTextResult, ActionExecutionError>> {
  const resolved = await resolveRef(session, action.ref);
  if (isErr(resolved)) {
    return resolved;
  }

  await session.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: resolved.value.backendNodeId });

  const focusResult = await focusElement(session, resolved.value.objectId);
  if (isErr(focusResult)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', `Failed to focus ref "${action.ref}"`, {
        cause: focusResult.error,
      }),
    );
  }

  // `Input.insertText` inserts at the cursor / replaces the current selection — it does
  // not clear existing content on its own. Selecting everything first makes the action
  // idempotent: the field ends up containing exactly `action.text`, regardless of what
  // was there before or how many times this is retried (docs/adr/0026).
  const selectResult = await selectElementContent(session, resolved.value.objectId);
  if (isErr(selectResult)) {
    return err(
      new ActionExecutionError(
        'CDP_SEND_FAILED',
        `Failed to select existing content for ref "${action.ref}"`,
        { cause: selectResult.error },
      ),
    );
  }

  const inserted = await session.send('Input.insertText', { text: action.text });
  if (isErr(inserted)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to insert text', {
        cause: inserted.error,
      }),
    );
  }

  return ok({ kind: 'input_text' });
}

const DEFAULT_SCROLL_AMOUNT = 300;

const DIRECTION_DELTAS: Readonly<Record<ScrollAction['direction'], { dx: number; dy: number }>> = {
  down: { dx: 0, dy: 1 },
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  left: { dx: -1, dy: 0 },
};

export async function executeScroll(
  session: CdpSession,
  action: ScrollAction,
): Promise<Result<ScrollResult, ActionExecutionError>> {
  let x = 0;
  let y = 0;

  if (action.ref !== undefined) {
    const resolved = await resolveRef(session, action.ref);
    if (isErr(resolved)) {
      return resolved;
    }

    const boundsResult = await getElementBounds(session, resolved.value.backendNodeId);
    if (isErr(boundsResult)) {
      return err(
        new ActionExecutionError(
          'ELEMENT_DETACHED',
          `Could not get bounds for ref "${action.ref}"`,
          {
            cause: boundsResult.error,
          },
        ),
      );
    }
    if (boundsResult.value !== undefined) {
      x = boundsResult.value.x + boundsResult.value.width / 2;
      y = boundsResult.value.y + boundsResult.value.height / 2;
    }
  }

  const amount = action.amount ?? DEFAULT_SCROLL_AMOUNT;
  const { dx, dy } = DIRECTION_DELTAS[action.direction];

  const wheelResult = await session.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX: dx * amount,
    deltaY: dy * amount,
  });
  if (isErr(wheelResult)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to dispatch mouseWheel', {
        cause: wheelResult.error,
      }),
    );
  }

  return ok({ kind: 'scroll' });
}

export async function executeGetDropdownOptions(
  session: CdpSession,
  action: GetDropdownOptionsAction,
): Promise<Result<GetDropdownOptionsResult, ActionExecutionError>> {
  const resolved = await resolveRef(session, action.ref);
  if (isErr(resolved)) {
    return resolved;
  }

  const result = await session.send('Runtime.callFunctionOn', {
    objectId: resolved.value.objectId,
    functionDeclaration:
      'function() { return Array.from(this.options ?? []).map((o) => ({ value: o.value, label: o.textContent ?? "" })); }',
    returnByValue: true,
  });
  if (isErr(result)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to read dropdown options', {
        cause: result.error,
      }),
    );
  }

  const options: unknown = result.value.result.value;
  if (!isDropdownOptionArray(options)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', `Ref "${action.ref}" is not a <select> element`),
    );
  }

  return ok({ kind: 'get_dropdown_options', options });
}

export async function executeSelectDropdownOption(
  session: CdpSession,
  action: SelectDropdownOptionAction,
): Promise<Result<SelectDropdownOptionResult, ActionExecutionError>> {
  const resolved = await resolveRef(session, action.ref);
  if (isErr(resolved)) {
    return resolved;
  }

  const result = await session.send('Runtime.callFunctionOn', {
    objectId: resolved.value.objectId,
    functionDeclaration:
      'function(value) { this.value = value; this.dispatchEvent(new Event("change", { bubbles: true })); }',
    arguments: [{ value: action.value }],
    returnByValue: true,
  });
  if (isErr(result)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to select dropdown option', {
        cause: result.error,
      }),
    );
  }

  return ok({ kind: 'select_dropdown_option' });
}

export async function executeSendKeys(
  session: CdpSession,
  action: SendKeysAction,
): Promise<Result<SendKeysResult, ActionExecutionError>> {
  if (action.ref !== undefined) {
    const resolved = await resolveRef(session, action.ref);
    if (isErr(resolved)) {
      return resolved;
    }

    await session.send('DOM.scrollIntoViewIfNeeded', {
      backendNodeId: resolved.value.backendNodeId,
    });

    const focusResult = await focusElement(session, resolved.value.objectId);
    if (isErr(focusResult)) {
      return err(
        new ActionExecutionError('CDP_SEND_FAILED', `Failed to focus ref "${action.ref}"`, {
          cause: focusResult.error,
        }),
      );
    }
  }

  const combo = parseKeyCombo(action.keys);

  const keyDown = await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: combo.key,
    code: combo.code,
    windowsVirtualKeyCode: combo.windowsVirtualKeyCode,
    nativeVirtualKeyCode: combo.windowsVirtualKeyCode,
    modifiers: combo.modifiers,
  });
  if (isErr(keyDown)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to dispatch keyDown', {
        cause: keyDown.error,
      }),
    );
  }

  const keyUp = await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: combo.key,
    code: combo.code,
    windowsVirtualKeyCode: combo.windowsVirtualKeyCode,
    nativeVirtualKeyCode: combo.windowsVirtualKeyCode,
    modifiers: combo.modifiers,
  });
  if (isErr(keyUp)) {
    return err(
      new ActionExecutionError('CDP_SEND_FAILED', 'Failed to dispatch keyUp', {
        cause: keyUp.error,
      }),
    );
  }

  return ok({ kind: 'send_keys' });
}
