import { jsonrepair } from 'jsonrepair';

import { err, ok, type Result } from '@aegis/shared';

const FENCED_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

function stripCodeFences(text: string): string {
  const match = FENCED_BLOCK_PATTERN.exec(text);
  return match ? (match[1] ?? '') : text;
}

/** Finds the outermost `{...}` or `[...]` substring, tolerating surrounding prose. */
function extractBracketedSubstring(text: string): string | undefined {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const starts = [firstBrace, firstBracket].filter((index) => index !== -1);
  if (starts.length === 0) {
    return undefined;
  }

  const start = Math.min(...starts);
  const closeChar = text[start] === '{' ? '}' : ']';
  const end = text.lastIndexOf(closeChar);
  if (end === -1 || end < start) {
    return undefined;
  }

  return text.slice(start, end + 1);
}

function extractJsonCandidate(raw: string): string {
  const withoutFences = stripCodeFences(raw).trim();
  if (withoutFences.startsWith('{') || withoutFences.startsWith('[')) {
    return withoutFences;
  }
  return extractBracketedSubstring(withoutFences) ?? withoutFences;
}

/**
 * Parses `raw` model output as JSON, tolerating markdown code fences, surrounding
 * prose, trailing commas, and truncated/partial objects. Tries a strict parse first,
 * then falls back to `jsonrepair` before giving up.
 */
export function parseAndRepairJson(raw: string): Result<unknown, string> {
  const candidate = extractJsonCandidate(raw);

  try {
    return ok(JSON.parse(candidate));
  } catch {
    // fall through to the repair pass
  }

  try {
    return ok(JSON.parse(jsonrepair(candidate)));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to parse or repair JSON';
    return err(message);
  }
}
