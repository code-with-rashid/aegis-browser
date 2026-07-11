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
