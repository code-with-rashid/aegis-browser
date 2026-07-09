/**
 * Zero-width/invisible formatting characters sometimes used to hide text within
 * otherwise-visible content, or to split a trigger phrase across characters to evade
 * naive keyword filters (stripping first, then matching, defeats that).
 *
 * Built from numeric code points rather than a regex literal containing the characters
 * themselves — literal invisible characters in source code are exactly the kind of thing
 * this file exists to catch, so they must never appear here, even accidentally.
 */
const ZERO_WIDTH_CODE_POINTS: readonly number[] = [
  0x200b, // Zero Width Space
  0x200c, // Zero Width Non-Joiner
  0x200d, // Zero Width Joiner
  0x2060, // Word Joiner
  0xfeff, // Zero Width No-Break Space / byte-order mark
];

const ZERO_WIDTH_PATTERN = new RegExp(
  `[${ZERO_WIDTH_CODE_POINTS.map((codePoint) => String.fromCodePoint(codePoint)).join('')}]`,
  'g',
);

/**
 * The Unicode "Tags" block (U+E0000-U+E007F) — mirrors of ASCII characters with no
 * visual glyph, used by real prompt-injection proofs-of-concept to smuggle invisible
 * ASCII payloads inside otherwise-normal-looking text.
 */
const UNICODE_TAG_START = 0xe0000;
const UNICODE_TAG_END = 0xe007f;
const UNICODE_TAG_PATTERN = new RegExp(
  `[${String.fromCodePoint(UNICODE_TAG_START)}-${String.fromCodePoint(UNICODE_TAG_END)}]`,
  'gu',
);

/** Strips zero-width and Unicode-tag characters used to hide text invisibly within a string. */
export function stripInvisibleChars(text: string): string {
  return text.replace(UNICODE_TAG_PATTERN, '').replace(ZERO_WIDTH_PATTERN, '');
}
