# 0030 — Tool risk gating: policy engine + critic generalized to any tool call

## Context

ADR 0029 (#81) deliberately left the security policy engine, alignment critic,
confirmation UI, and trace consuming only the derived, `source: "browser"` `actions`
view of a Navigator turn — genuinely generalizing them was called out as #82's job.
Issue #82 (Phase 2, M8) asks for exactly that: every tool call, from any source, routed
through the policy engine and critic, with `state_changing` tools requiring confirmation
and tool descriptions/results sanitized as untrusted content.

## Decision

- **`@aegis/security`'s policy engine no longer knows about `Action` at all.**
  `EvaluatePolicyInput.action: Action` + `riskContext?: ActionRiskContext` become a single
  `risk: ActionRisk` — already classified by the caller. `PolicyEngine.evaluate` drops
  from `(action, origin, riskContext?)` to `(risk, origin)`. This is a genuine
  simplification, not just a rename: `evaluatePolicy` no longer imports
  `classifyActionRisk`/`Action` from `@aegis/actions` at all, so `@aegis/security`'s
  policy module has zero dependency on what kind of thing is being gated — a browser
  action, an MCP tool call, a WebMCP tool call, or anything else Phase 3 invents.
- **`ToolRegistry.classify(id, context?)`** (`@aegis/actions`, mirroring the old
  `ActionRegistry.classify` this generalizes) is the new single place risk is resolved:
  an unrecognized tool id fails safe to `state_changing`; a `source: "browser"` tool's
  static risk is elevated by `context` exactly as `classifyActionRisk` always did (a
  "Submit Order" element name); any other source's risk is used as declared, since
  there's no page-element context to elevate from for an MCP/WebMCP tool call (#85/#86
  assign risk at registration time instead).
- **`PolicyCheckInput`/`CriticCheckInput` carry `toolCalls: readonly ToolCall[]`**
  (replacing `actions: readonly Action[]`) — every tool call this turn, any source.
  `apps/extension/background/policy-service.ts`'s real `PolicyService` resolves each
  call's `Tool` (for browser-specific element-name/destination-origin context) and its
  risk via `registry.classify`, then calls the now-generic `PolicyEngine.evaluate(risk,
origin)`. A non-browser call has no separate "destination origin" concept yet, so it's
  checked against the current page's origin, pending #85/#86's own MCP-specific
  permissioning layer on top.
- **`buildCriticPrompt` takes a `ToolRegistry`** and describes each proposed call via a
  new `describeToolCall` (`loop/confirmation.ts`): a `source: "browser"` call delegates to
  the existing `describeAction`; any other tool's `description` is untrusted (it comes
  from an external MCP server or a page's own WebMCP declaration) and is run through the
  caller's `sanitize` function before it's ever included — same treatment as page content.
- **The Navigator's tool listing (`navigator/prompt.ts`'s `formatTool`) now sanitizes
  `tool.description` too**, through the same `options.sanitize` already used for page
  content — one sanitizer, applied everywhere untrusted text reaches a prompt, rather
  than a second bespoke mechanism.
- **The composition root (`build-loop-services.ts`) now wires `@aegis/security`'s real
  `sanitizePageContent`** as the `sanitize` option for the Planner/Navigator/Verifier/
  Critic, replacing the `identitySanitize` no-op placeholder every one of them had used
  since Phase 1. This was a pre-existing gap (`sanitizePageContent`/`neutralizeInstructions`,
  built and tested in #20, were never actually wired into the real running extension) —
  fixed here rather than merely flagged, since it's small, low-risk, and directly on-theme
  for an issue about sanitizing untrusted content before it reaches a model.
- **What's still deliberately unchanged**: `context.proposedActions` (derived, browser-only)
  still feeds `buildConfirmationRequest` and the trace — the confirmation UI and trace
  rendering staying Action-only, not yet tool-call-aware, is explicitly #90's job. `EDIT`
  re-derives `proposedToolCalls` from the edited `proposedActions` via `actionToToolCall`
  so a human's edit during confirmation still takes effect at execution time.

## Consequences

- A hand-registered mock `state_changing` MCP tool is proven to require confirmation the
  same way a "Buy Now" browser click does (`policy-service.test.ts`), and an unregistered
  tool id fails safe to `confirm`/`deny` rather than silently allowing — there is no way
  for policy gating to be skipped just because a tool isn't `source: "browser"`.
- A malicious tool description (an MCP server or WebMCP page attempting prompt injection
  via its own tool's `description` field) is neutralized before it reaches the Navigator's
  or the Critic's prompt, proven directly (`navigator/prompt.test.ts`,
  `critic/prompt.test.ts`) with a realistic injected-imperative description.
- `@aegis/security`'s public surface shrank (one parameter instead of three on
  `PolicyEngine.evaluate`) and dropped an entire import (`@aegis/actions`' `Action`/
  `classifyActionRisk`) from the policy module — a smaller, more honest dependency
  footprint for a package whose job is "gate risk levels," not "understand actions."
