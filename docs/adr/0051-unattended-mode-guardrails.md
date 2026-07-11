# 0051: Unattended-mode guardrails

## Status

Accepted

## Context

Everything built through #116 lets a workflow run entirely unattended, but a genuinely
"safe autonomy" story needs more than a working engine: #117 asks that a workflow's own
`RunPolicy` actually bounds what it can do, that a blocked run tells the user, and that
secrets never leak. Auditing the existing pipeline surfaced three real gaps this issue
closes:

1. **`gateHeal` (#114) only ever gated a Navigator-_proposed_ fix.** A workflow's own
   _recorded_ steps — the ones the user themselves recorded — replayed with no `RunPolicy`
   check at all. A recorded `state_changing` step ran unattended regardless of
   `allowStateChanging`; a recorded step's tool id was never checked against
   `allowedToolIds`.
2. **`RunPolicy.maxStepsPerRun`/`maxRunsPerDay` existed in the schema since #108 but were
   never enforced anywhere.**
3. **`resolveActionSecrets` (`@aegis/security`, since #24/ADR 0012) was never actually
   called from any real execution path in the whole codebase** — not the live agent loop,
   not the workflow executor. A `‹secret:name›` placeholder in a workflow step's args was
   never resolved to a real value at all before this issue.

## Decision

**A second, distinct policy gate for _recorded_ steps: `gateOriginalStep`
(`packages/workflows/src/background/run-policy-gate.ts`), not a relaxed `gateHeal`.** The
two have genuinely different correct behavior for the same input (a `state_changing`
step, unattended): `gateHeal` never lets `allowStateChanging` authorize a _healed_ fix,
because it's unreviewed content the Navigator improvised. `gateOriginalStep` _does_ let
`allowStateChanging` authorize a _recorded_ step, because it's exactly what the user
themselves recorded and (by setting that flag) explicitly pre-authorized to replay
unattended. Reusing one function for both would have meant either weakening the heal
guarantee or wrongly blocking every recorded state-changing step forever — two different
security properties, two functions. A separate `gateWorkflowOrigin` checks the workflow's
own `origin` against `RunPolicy.allowedOrigins` once at run start.

**`RunPolicy`'s risk elevation for a recorded step reuses the step's own already-recorded
`target.name`** (captured back in #109) rather than gathering a fresh perception just to
classify risk — a live perception pull is exactly the cost `runWorkflowInBackground`
otherwise never pays for a successful (non-healed) step, and the element's accessible
name hasn't changed since it was recorded any more than the rest of the page has.

**`maxStepsPerRun`/`maxRunsPerDay` get pure enforcement functions
(`run-rate-limit.ts`)**, checked at the two natural choke points: `exceedsMaxSteps` once
at the top of `runWorkflowInBackground` (before any step runs — a workflow that's already
too long never starts), and `hasReachedDailyRunLimit` in `apps/extension`'s
`BackgroundRunManager.startOn` (before a tab is even opened — the caller supplies recent
run start times, typically from `WorkflowRunStore.listRunsForWorkflow`, keeping the check
a pure function of data rather than one that reads storage itself).

**Secrets: a new, generic `resolveStepArgsSecrets`, not the pre-existing (and, it turns
out, never-actually-called) `resolveActionSecrets`.** `resolveActionSecrets` only covers a
browser `Action`'s two known free-text fields (`input_text.text`, `send_keys.keys`); a
workflow step's args can belong to any tool (MCP included), so a `‹secret:name›`
placeholder could appear in any string field anywhere in `args: unknown`.
`resolveStepArgsSecrets` reuses `mapStringsDeep` (#110) — the same generic deep-walker
already built for exactly this "args isn't always a browser `Action`" problem — collecting
every distinct secret name referenced anywhere in one pass (`JSON.stringify` +
`findSecretPlaceholderNames`), resolving each once via the vault, then substituting.
Deliberately **not** a fix to the live agent loop's own equivalent gap (nothing there
calls `resolveActionSecrets` either) — that's a pre-existing Phase 1 issue, out of scope
for a Phase 3 workflows issue.

**An unresolvable secret (locked vault, or the name doesn't exist) hard-stops the run —
it is never allowed to fall through to the literal placeholder text.** Given
`SecretVault` requires an explicit `unlock(passphrase)` and a fresh background-script
instance always starts locked (the service worker has no way to share an _unlocked_
vault with another process — the same limitation `build-loop-services.ts` already
documented for MCP secrets), an unattended run genuinely cannot unlock the vault itself.
Rather than attempting to solve "persist an unlocked vault across a service-worker
restart" (a separate, security-sensitive feature this issue doesn't ask for and wasn't
scoped to design), a workflow that needs a secret while unattended and the vault happens
to be locked safely stops and reports why — never guesses, never leaks a raw placeholder
into a form field as if it were the credential.

**"Notify" is a real `chrome.notifications.create` call
(`apps/extension/background/notify.ts`)**, fired whenever `runWorkflowInBackground`
returns `status: 'hard_stopped'` — new `"notifications"` manifest permission.
`@types/chrome`'s `notifications.create` has no Promise-returning overload (unlike
`tabs.create`), so it's wrapped in a `Promise` over its callback form, checking
`chrome.runtime.lastError` the standard extension-API way. Best-effort: a notification
failure never affects the run itself, which has already stopped by the time it fires. The
extension has no icon asset yet, so a minimal inline 1x1 PNG data URI stands in rather
than referencing a file that doesn't exist.

**"Injection during a background run is blocked" is satisfied structurally, not
re-tested.** The only place a background run's heal path ever builds an LLM prompt from
page content is `built.services.decide` — built by `buildLoopServices`, hardcoding
`sanitize: sanitizePageContent`, completely unchanged by this issue (per ADR 0049's own
decision to reuse it as-is). That sanitization is already covered by
`build-loop-services.test.ts`'s existing suite; adding a redundant copy of the same
assertion under `background-run-manager.test.ts` would test the same code path twice for
no new confidence.

## Consequences

- A recorded workflow's steps can now legitimately hard-stop a run that used to complete
  under #111-114 alone, if its `RunPolicy` doesn't authorize what it's about to do. This
  is the point of the issue, but it does mean an existing workflow recorded before this
  issue landed, with no `authorization` deliberately configured, keeps working exactly as
  before only because the _default_ policy (`allowedToolIds: []`, `allowedOrigins: []`)
  means "no restriction" for the allow-lists specifically — only `allowStateChanging`
  (default `false`) newly blocks a state-changing recorded step it wouldn't have before.
- Every step now costs one `JSON.stringify` scan for secret placeholders — negligible next
  to a real CDP round trip.
- There is still no mechanism to unlock the vault for a genuinely unattended (no side
  panel, no options page open) run. A workflow whose steps need a secret simply cannot
  run unattended today; it hard-stops the first time it hits one. Solving that is future
  work, deliberately not attempted here.
