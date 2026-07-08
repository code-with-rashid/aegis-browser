import type { Action } from '../schema';

function assertNever(value: never): never {
  throw new Error(`Unhandled action type: ${JSON.stringify(value)}`);
}

/**
 * A coarse fingerprint of "what this action targets" — same type + same ref/url/tabId
 * where relevant. Used to detect stalls: the loop repeating the identical action over
 * and over without the page state changing enough to need a different one.
 */
export function actionSignature(action: Action): string {
  switch (action.type) {
    case 'click':
    case 'input_text':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
      return `${action.type}:${action.ref}`;
    case 'scroll':
    case 'send_keys':
      return `${action.type}:${action.ref ?? ''}`;
    case 'navigate':
    case 'open_tab':
      return `${action.type}:${action.url ?? ''}`;
    case 'switch_tab':
    case 'close_tab':
      return `${action.type}:${action.tabId ?? ''}`;
    case 'go_back':
    case 'wait':
    case 'extract':
    case 'done':
      return action.type;
    default:
      return assertNever(action);
  }
}
