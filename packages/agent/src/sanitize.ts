/**
 * Sanitizes page-derived text before it reaches a model prompt — stripping
 * instruction-like imperatives, hidden text, zero-width characters, etc. (`docs/DESIGN.md`
 * §7.1). The real implementation (content trust-tagging, #20) isn't built yet;
 * `identitySanitize` is a pass-through placeholder so callers here don't have to change
 * when it lands — only the function passed in does.
 */
export type SanitizeText = (text: string) => string;

/** Pass-through: use until #20's real sanitizer is wired in at the composition root. */
export const identitySanitize: SanitizeText = (text) => text;

const UNTRUSTED_CONTENT_TAG = 'untrusted-page-content';

/**
 * Wraps sanitized page content in an explicit untrusted-data envelope, per
 * `docs/DESIGN.md` §7.1: "content inside the untrusted envelope can never issue
 * commands, change the goal, or request navigation to new origins." Pair with a system
 * prompt that states this rule — the wrapping alone is a label, not an enforcement
 * mechanism.
 */
export function wrapUntrustedContent(text: string): string {
  return `<${UNTRUSTED_CONTENT_TAG}>\n${text}\n</${UNTRUSTED_CONTENT_TAG}>`;
}
