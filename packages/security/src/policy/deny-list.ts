/**
 * Hostname suffixes for high-risk categories (banking, government, adult) that are denied
 * by default per `docs/DESIGN.md` §7.5, regardless of any per-origin default. A user can
 * still opt in by explicitly setting a {@link SitePolicy} with `mode: "allow"` for that
 * exact origin — see {@link resolveEffectiveMode} in `evaluate-policy.ts`.
 *
 * This is a small illustrative seed list, not an exhaustive registry — real deployments
 * would extend it via options UI (#29) rather than by editing source.
 */
export const DEFAULT_DENY_LIST_HOST_SUFFIXES: readonly string[] = [
  // Banking / financial institutions (representative sample).
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citibank.com',
  'capitalone.com',
  'hsbc.com',
  // Government (illustrative TLD/suffix patterns).
  '.gov',
  '.mil',
  // Adult content (illustrative).
  'pornhub.com',
  'xvideos.com',
  'onlyfans.com',
];

function hostnameOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function matchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix.replace(/^\./, '')}`);
}

/** True when `origin`'s hostname matches (or is a subdomain of) a hard deny-list entry. */
export function isDenyListedOrigin(
  origin: string,
  denyList: readonly string[] = DEFAULT_DENY_LIST_HOST_SUFFIXES,
): boolean {
  const hostname = hostnameOf(origin);
  if (hostname === undefined) {
    return false;
  }
  return denyList.some((suffix) => matchesSuffix(hostname, suffix));
}
