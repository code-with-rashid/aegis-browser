# 0009 — Policy engine: risk x mode decision matrix, and deny-list opt-out semantics

## Context

#21 asks for `evaluate(action, origin) → allow|confirm|deny`, gated by a per-origin
`SitePolicy {mode: ask|allow|deny, allowStateChanging}` and a hard deny-list, with the
acceptance criterion "matrix of risk x policy tested exhaustively." Neither
`docs/DESIGN.md` §7.3 nor §7.5 fully specifies the matrix: §7.3 states `state_changing`
"ALWAYS confirm in MVP" while also defining a `SitePolicy.allowStateChanging` flag whose
purpose is presumably to relax that — apparently contradictory unless the flag's scope is
made precise. §7.5 says the hard deny-list applies "unless the user explicitly opts in,"
but doesn't say whether an `ask` (not `allow`) policy on a deny-listed origin counts as
opting in.

## Decision

1. **Deny-list precedence.** `resolveEffectiveMode(origin, policy, now)` returns `"deny"`
   whenever `origin` matches the hard deny-list, _unless_ a non-expired stored policy has
   `mode: "allow"` specifically. A stored `"ask"` or `"deny"` policy does not opt out —
   only an explicit `"allow"` counts as the user "explicitly opting in," so a user can't
   accidentally soften the deny-list by leaving a site on its default/ambiguous mode.
2. **Risk x mode matrix** (`decideForRisk`), applied only after the effective mode above:
   - Effective mode `"deny"` → `"deny"`, for every risk level, no exceptions.
   - `risk: "read"` → always `"allow"` once not hard-denied — reading cannot change page
     state, so site mode doesn't gate it further.
   - `risk: "navigate" | "input"` → `"allow"` under both `"ask"` and `"allow"` modes. Only
     `"state_changing"` risk triggers the confirmation gate; `"ask"` mode does not mean
     "confirm every interaction," it means "use the MVP default state-changing rule."
   - `risk: "state_changing"` → `"allow"` only when mode is `"allow"` **and**
     `allowStateChanging` is `true`; every other combination (including plain `"ask"`
     mode, and `"allow"` mode without the flag) resolves to `"confirm"`. This resolves the
     §7.3/§7.5 tension: `allowStateChanging` is the single, explicit, per-origin override
     of the "always confirm" MVP default, and it requires `mode: "allow"` too so a site
     can't be state-changing-unlocked while still generally in `"ask"`/`"deny"`.
3. An expired policy (`expiresAt` in the past) is treated identically to no stored policy
   at all, at every step above — including for the deny-list opt-out check (an expired
   `"allow"` no longer shields a deny-listed origin).

## Consequences

- `decideForRisk` and `resolveEffectiveMode` are pure, synchronous, and independent of
  storage — the exhaustive matrix (4 risks x 3 modes x 2 `allowStateChanging` values) is
  tested directly, with no I/O mocking, satisfying #21's acceptance criterion.
- CLAUDE.md's "state-changing actions ALWAYS require human confirmation" invariant holds
  by default everywhere; the only way to weaken it for one origin is two explicit,
  separate opt-ins (`mode: "allow"` and `allowStateChanging: true`) on that exact origin.
- `createPolicyEngine` (the I/O-performing composition of `PolicyStore` + `evaluatePolicy`)
  stays a thin wrapper with no branching logic of its own, so the decision rules above
  have exactly one implementation to review.
