/**
 * Placeholder token a recorded step's `args` carries in place of a literal, run-time
 * value — mirrors `@aegis/security`'s `‹secret:name›` convention exactly (same delimiter
 * characters, same "built from code points, not literal characters in source" discipline,
 * `docs/adr/0044-workflow-parameterization.md`), so a workflow param and a vault secret
 * placeholder are visually and structurally the same kind of thing, just resolved by a
 * different mechanism.
 */
const OPEN = String.fromCodePoint(0x2039); // ‹ U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK
const CLOSE = String.fromCodePoint(0x203a); // › U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
const PREFIX = 'param:';

/** Builds the placeholder text for a named param, e.g. `toParamPlaceholder('search_term')`. */
export function toParamPlaceholder(name: string): string {
  return `${OPEN}${PREFIX}${name}${CLOSE}`;
}

const PLACEHOLDER_PATTERN = new RegExp(`${OPEN}${PREFIX}([^${OPEN}${CLOSE}]+)${CLOSE}`, 'g');

/** Finds every distinct param name referenced by a placeholder in `text`, in first-seen order. */
export function findParamPlaceholderNames(text: string): readonly string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}
