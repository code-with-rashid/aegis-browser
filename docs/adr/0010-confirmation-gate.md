# 0010 — Confirmation gate: three-way policy decision, EDIT semantics, and deferred wiring

## Context

#19 already gave the loop machine a `policyCheck -> confirming` path with `APPROVE`/
`REJECT` events, anticipating #21/#22. But its `PolicyCheckOutput` was just
`{requiresConfirmation: boolean}` — built before the policy engine (#21) existed, so it
could only express a two-way allow/confirm split. #21's `@aegis/security` policy engine
is three-way (`allow`/`confirm`/`deny`), and #22 additionally asks for "await
approve/**edit**/reject" and to "map onto the AI SDK approvals pattern." None of that
existed in the machine yet, and `@aegis/agent` doesn't depend on `@aegis/security` (nor
vice versa — an explicit sibling-package boundary already established when #20 built the
sanitizer, since both sit at the same layer in CLAUDE.md's dependency graph).

## Decision

1. **`PolicyCheckOutput.decision: 'allow' | 'confirm' | 'deny'`** replaces
   `requiresConfirmation: boolean`, declared locally in `@aegis/agent`'s `services.ts`
   (not imported from `@aegis/security`) — structurally identical to
   `@aegis/security`'s `PolicyDecision` by convention, not by shared type, preserving the
   no-cross-import boundary. The real `PolicyService` adapter that calls
   `@aegis/security`'s `PolicyEngine.evaluate` is composition-root work (like
   `sanitizePageContent` before it) — out of scope here; this issue only builds the loop
   mechanics and the port shape a future adapter fills in.
2. **`deny` routes to `replanning`, not `failed`.** A hard policy denial (e.g. a
   deny-listed origin) can't be overridden by the human from inside the loop, but the
   _task_ may still be achievable a different way — consistent with how a stuck
   navigator or a failed verification also replan rather than abort outright. If no
   alternative exists, the existing replan budget (#19/ADR 0008) already bounds this to a
   finite number of attempts before genuinely failing.
3. **`AgentLoopContext.pendingConfirmation: ConfirmationRequest | undefined`** is set when
   entering `confirming` (`{actions, preview: string[], reason?}`) and cleared on
   `APPROVE`/`REJECT`. `preview` is one human-readable line per action
   (`buildConfirmationRequest`/`describeAction` in `loop/confirmation.ts`), built by
   cross-referencing each action's `ref` against `context.perception.elements` for a
   real accessible name (falling back to the raw ref string) — this is what a
   confirmation UI (#27) reads to render "Submit application to X?" instead of raw JSON.
4. **`EDIT` is a self-transition within `confirming`**: `{type: 'EDIT', actions}` replaces
   `proposedActions` and rebuilds `pendingConfirmation` (keeping the original `reason`),
   staying in `confirming` — approval is still required afterward. This is the "edit"
   leg of "approve/edit/reject": a human can revise a proposed action (e.g. correct a
   mistyped field) without that edit ever executing unsupervised.
5. **"AI SDK approvals pattern" mapping**: we don't use the Vercel AI SDK's tool-calling
   loop for policy checks (our actions are our own schema, not AI SDK tool calls), so
   this is a structural analogy, not a literal integration. The analogy: a "pending call"
   the human must resolve before it runs (`pendingConfirmation`), resolved by exactly the
   approve/deny shape the SDK uses, plus our own `edit` extension. If a future phase
   moves action execution through the AI SDK's own tool-calling loop, `pendingConfirmation`
   is the natural shape to translate into that SDK's real approval objects.

## Consequences

- `@aegis/agent` still has zero dependency on `@aegis/security`; a composition root
  (background script, not yet built — same deferral already noted for the sanitizer)
  wires a real `PolicyService` backed by `@aegis/security`'s `PolicyEngine` when it
  exists.
- Every existing `confirming`-related test needed updating from
  `requiresConfirmation: true/false` to `decision: 'confirm'/'allow'`; new tests cover
  `deny` (never asks a human, still bounded by the replan budget) and `EDIT` (revises
  the pending actions and preview without leaving `confirming`).
- State-changing actions still never execute without an explicit `APPROVE` — `deny`
  removes the human from the loop entirely rather than weakening that guarantee, and
  `EDIT` cannot itself trigger execution.
