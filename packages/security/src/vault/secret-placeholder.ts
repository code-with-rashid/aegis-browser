/**
 * Placeholder token the model sees instead of a real secret value (`docs/DESIGN.md` §7.4:
 * "the model sees ‹secret:github_password› placeholders, never the value"). Built from
 * numeric code points rather than the literal guillemet characters in source, matching
 * this codebase's convention for Unicode that must be reproduced exactly (see
 * `sanitize/strip-invisible-chars.ts`).
 */
const OPEN = String.fromCodePoint(0x2039); // ‹ U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK
const CLOSE = String.fromCodePoint(0x203a); // › U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
const PREFIX = 'secret:';

/** Builds the placeholder text for a named secret, e.g. `toSecretPlaceholder('github_password')`. */
export function toSecretPlaceholder(name: string): string {
  return `${OPEN}${PREFIX}${name}${CLOSE}`;
}

const PLACEHOLDER_PATTERN = new RegExp(`${OPEN}${PREFIX}([^${OPEN}${CLOSE}]+)${CLOSE}`, 'g');

/** Finds every distinct secret name referenced by a placeholder in `text`, in first-seen order. */
export function findSecretPlaceholderNames(text: string): readonly string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}
