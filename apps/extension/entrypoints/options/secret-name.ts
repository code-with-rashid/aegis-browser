/**
 * Secret names become the `name` in a `‹secret:name›` placeholder the model may echo
 * back verbatim into an action's text — restricting to a plain identifier charset keeps
 * that round-trip unambiguous (no whitespace/delimiter characters to mangle in transit).
 */
const SECRET_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidSecretName(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name);
}
