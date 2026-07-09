import { neutralizeInstructions } from './neutralize-instructions';
import { stripInvisibleChars } from './strip-invisible-chars';

/**
 * The real content sanitizer `@aegis/agent`'s `identitySanitize` placeholder (#16-#19)
 * is meant to be replaced by: strips invisible-character hiding tricks first, then
 * neutralizes instruction-like imperatives and spoofed role markers — order matters,
 * since a phrase hidden with zero-width characters must become contiguous text again
 * before the instruction patterns can match it.
 */
export function sanitizePageContent(text: string): string {
  return neutralizeInstructions(stripInvisibleChars(text));
}
