import { z } from 'zod';

/** How an origin's actions are gated: always ask, always allow, or always deny. */
export const PolicyModeSchema = z.enum(['ask', 'allow', 'deny']);
export type PolicyMode = z.infer<typeof PolicyModeSchema>;

/**
 * A user-configured (or default) policy for one origin. Persisted via {@link PolicyStore}.
 *
 * `allowStateChanging` is a separate opt-in from `mode`: even an `allow`-mode origin still
 * requires confirmation for `state_changing` actions unless this is explicitly `true`,
 * matching CLAUDE.md's invariant that state-changing actions always require human
 * confirmation by default.
 */
export const SitePolicySchema = z.object({
  origin: z.string().min(1),
  mode: PolicyModeSchema,
  allowStateChanging: z.boolean(),
  /** Epoch ms after which this policy no longer applies (e.g. "allow for this session"). */
  expiresAt: z.number().optional(),
});
export type SitePolicy = z.infer<typeof SitePolicySchema>;

/** A map of origin to its policy, as persisted by {@link PolicyStore}. */
export const SitePolicyMapSchema = z.record(z.string(), SitePolicySchema);
export type SitePolicyMap = z.infer<typeof SitePolicyMapSchema>;

/** True when `policy.expiresAt` has passed as of `now`. An expired policy is treated as unset. */
export function isPolicyExpired(policy: SitePolicy, now: number): boolean {
  return policy.expiresAt !== undefined && policy.expiresAt <= now;
}
