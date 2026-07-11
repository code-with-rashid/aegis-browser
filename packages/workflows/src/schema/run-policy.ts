import { z } from 'zod';

/**
 * What a workflow may do **unattended**, with no human watching to answer a confirmation
 * dialog (#117) — a pre-authorization the user sets deliberately, not something a run (or
 * a self-heal, #114) can ever expand. Anything a run proposes outside this policy must
 * hard-stop and notify rather than proceed or silently fall back to asking a human who
 * isn't there. Empty `allowedToolIds`/`allowedOrigins` means "nothing is pre-authorized"
 * — the safe default — not "everything is."
 */
export const RunPolicySchema = z.object({
  allowedToolIds: z.array(z.string().min(1)).default([]),
  allowedOrigins: z.array(z.string().min(1)).default([]),
  /** Whether a `state_changing` step may run unattended at all, even for an otherwise-allowed tool/origin. */
  allowStateChanging: z.boolean().default(false),
  maxStepsPerRun: z.number().int().positive().optional(),
  maxRunsPerDay: z.number().int().positive().optional(),
});

export type RunPolicy = z.infer<typeof RunPolicySchema>;
