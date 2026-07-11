import type { ElementRef } from '@aegis/shared';

import type { Action } from './schema';

/** The ref a browser action targets, for the action types that have one — `undefined` for the rest. */
export function targetRefOf(action: Action): ElementRef | undefined {
  switch (action.type) {
    case 'click':
    case 'input_text':
    case 'scroll':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
    case 'send_keys':
      return action.ref;
    case 'navigate':
    case 'go_back':
    case 'open_tab':
    case 'switch_tab':
    case 'close_tab':
    case 'wait':
    case 'extract':
    case 'done':
      return undefined;
  }
}

/**
 * Returns `action` with its target ref replaced by `ref` — the setter symmetric with
 * {@link targetRefOf}. Used by a workflow replay (`@aegis/workflows`, #111) to re-target a
 * recorded step at a freshly re-located element (the original ref/backend-node-id from
 * recording time won't resolve against a new page load); a future self-heal pass (#113)
 * re-targeting a step after an LLM re-locates it needs the identical operation. An action
 * with no ref concept at all (e.g. `navigate`) is returned unchanged.
 */
export function withTargetRef(action: Action, ref: ElementRef): Action {
  switch (action.type) {
    case 'click':
    case 'input_text':
    case 'scroll':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
    case 'send_keys':
      return { ...action, ref };
    case 'navigate':
    case 'go_back':
    case 'open_tab':
    case 'switch_tab':
    case 'close_tab':
    case 'wait':
    case 'extract':
    case 'done':
      return action;
  }
}
