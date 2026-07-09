import { SitePolicySchema, type PolicyMode, type SitePolicy } from '@aegis/security';

/** In-progress fields for a new site policy — origin is free text until normalized. */
export interface SitePolicyDraft {
  readonly origin: string;
  readonly mode: PolicyMode;
  readonly allowStateChanging: boolean;
}

export const EMPTY_SITE_POLICY_DRAFT: SitePolicyDraft = {
  origin: '',
  mode: 'ask',
  allowStateChanging: false,
};

/** Parses free-text into a canonical origin (scheme + host, no path/query), or `undefined`. */
export function normalizeOrigin(input: string): string | undefined {
  try {
    return new URL(input.trim()).origin;
  } catch {
    return undefined;
  }
}

/** Validates a {@link SitePolicyDraft} into a real {@link SitePolicy}, or `undefined` while invalid. */
export function toSitePolicy(draft: SitePolicyDraft): SitePolicy | undefined {
  const origin = normalizeOrigin(draft.origin);
  if (origin === undefined) {
    return undefined;
  }
  const parsed = SitePolicySchema.safeParse({
    origin,
    mode: draft.mode,
    allowStateChanging: draft.allowStateChanging,
  });
  return parsed.success ? parsed.data : undefined;
}
