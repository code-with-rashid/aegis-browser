import type { Action } from '@aegis/actions';
import type { PerceptionPayload } from '@aegis/perception';
import type { ElementRef } from '@aegis/shared';

function assertNever(value: never): never {
  throw new Error(`Unhandled action type: ${JSON.stringify(value)}`);
}

/** The ref(s) an action targets, if any — the same fields `actionSignature` (`@aegis/actions`) treats as a target. */
function refsOf(action: Action): readonly ElementRef[] {
  switch (action.type) {
    case 'click':
    case 'input_text':
    case 'get_dropdown_options':
    case 'select_dropdown_option':
      return [action.ref];
    case 'scroll':
    case 'send_keys':
      return action.ref !== undefined ? [action.ref] : [];
    case 'navigate':
    case 'go_back':
    case 'open_tab':
    case 'switch_tab':
    case 'close_tab':
    case 'wait':
    case 'extract':
    case 'done':
      return [];
    default:
      return assertNever(action);
  }
}

/**
 * Finds any ref referenced by `actions` that isn't in `perception.elements` — a
 * well-formed but hallucinated ref (the model invented one, or reused one from a stale
 * perception). Returns the distinct invalid refs, empty if every ref is real.
 */
export function findHallucinatedRefs(
  actions: readonly Action[],
  perception: PerceptionPayload,
): readonly ElementRef[] {
  const knownRefs = new Set(perception.elements.map((element) => element.ref));
  const invalidRefs = new Set<ElementRef>();

  for (const action of actions) {
    for (const ref of refsOf(action)) {
      if (!knownRefs.has(ref)) {
        invalidRefs.add(ref);
      }
    }
  }

  return [...invalidRefs];
}
