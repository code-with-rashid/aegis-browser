const ELEMENT_LINE_PATTERN = /-\s\[([^\]]+)]\s+\w+\s+"([^"]*)"/g;

/**
 * Finds the `ElementRef` string for the first "Available elements" line (as rendered by
 * `@aegis/agent`'s navigator/planner prompt builders) whose accessible name contains
 * `nameSubstring` (case-insensitive) — so a scripted response can reference a real ref
 * pulled straight out of the actual prompt, rather than guessing one, matching whatever
 * `hallucinated-refs.ts` requires to accept the action.
 */
export function findRef(prompt: string, nameSubstring: string): string {
  const needle = nameSubstring.toLowerCase();
  for (const match of prompt.matchAll(ELEMENT_LINE_PATTERN)) {
    const [, ref, name] = match;
    if (ref !== undefined && name?.toLowerCase().includes(needle) === true) {
      return ref;
    }
  }
  throw new Error(`No element matching "${nameSubstring}" found in prompt:\n${prompt}`);
}
