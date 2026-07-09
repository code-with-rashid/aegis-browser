/**
 * Patterns matching instruction-like imperatives and spoofed role/control markers that
 * page content sometimes uses to try to hijack a model reading it — real prompt-injection
 * phrasing seen in the wild, not a general profanity/keyword filter. Each match is
 * replaced with an explicit marker (not silently deleted) so the model — and anyone
 * reviewing a trace later — can see that something was caught, without ever seeing the
 * original instruction text.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  // Imperative "ignore/disregard/forget what you were told" phrasing.
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
  /disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
  /forget\s+(everything|all|what)\s+(you\s+)?(were\s+told|know|learned)/gi,
  // Attempts to inject a fresh instruction set.
  /new\s+instructions?\s*:/gi,
  /updated\s+instructions?\s*:/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(if\s+you\s+are\s+)?/gi,
  /override\s+(your\s+)?(previous\s+)?(guidelines|instructions|rules)/gi,
  /(reveal|repeat|print|output)\s+(your\s+)?(system\s+prompt|instructions)/gi,
  // Requires "now" — "you must comply with our terms" is common, legitimate ToS
  // boilerplate; "you must now comply" is a distinctly injection-flavored demand.
  /you\s+must\s+now\s+(ignore|disregard|comply|obey)/gi,
  // Spoofed role markers / chat-template control tokens.
  /^\s*system\s*:/gim,
  /^\s*assistant\s*:/gim,
  /system\s+prompt\s*:/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /###\s*(system|instruction)/gi,
];

const REDACTION_MARKER = '[REMOVED: instruction-like content]';

/**
 * Replaces instruction-like imperatives and spoofed system/role markers with an explicit
 * redaction marker. Call after {@link stripInvisibleChars} — a phrase hidden with
 * zero-width characters must be made contiguous again before it can match here.
 */
export function neutralizeInstructions(text: string): string {
  return INJECTION_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, REDACTION_MARKER),
    text,
  );
}
