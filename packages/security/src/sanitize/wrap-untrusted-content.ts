const UNTRUSTED_CONTENT_TAG = 'untrusted-page-content';

/**
 * Wraps sanitized page content in an explicit untrusted-data envelope, per
 * `docs/DESIGN.md` §7.1. Pair with {@link TRUST_BOUNDARY_SYSTEM_CONTRACT}
 * (`system-contract.ts`) — the wrapping is a label, not an enforcement mechanism on its
 * own; the system prompt is what tells the model to treat it as inert.
 */
export function wrapUntrustedContent(text: string): string {
  return `<${UNTRUSTED_CONTENT_TAG}>\n${text}\n</${UNTRUSTED_CONTENT_TAG}>`;
}
