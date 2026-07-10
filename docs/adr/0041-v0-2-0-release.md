# 0041 — v0.2.0 release: MCP/WebMCP docs, changelog, version bump

## Context

#93 is the last issue before tagging `v0.2.0`: document MCP setup (server config, auth
header storage via the vault, per-server/per-tool permissioning) and WebMCP behavior
(feature-detection, preferred-action routing, fallback) so a user can, from the docs
alone, add an MCP server and complete a tool-calling task; update `CHANGELOG.md`; bump
versions; tag. Mirrors `docs/adr/0023-v0-1-0-release.md`'s process for the same reasons.

## Decisions

1. **The root `README.md` gains a new "MCP & WebMCP tools" section**, grounded in the
   actual rendered options-page UI text (`mcp-tools-panel.tsx`'s real labels: "Tools &
   MCP" tab, "Add an MCP server" fields, "Discover tools", "Pending review", the
   per-tool permission `<select>`, "Use WebMCP tools when a page declares them"), not
   written from memory of the design — the same discipline ADR 0023 established for the
   original README. The **Status** line moves to v0.2.0/M0–M12; the **Security model**
   section gains one bullet stating every tool call passes through the identical gate a
   browser action does.
2. **`docs/DESIGN.md` gets a new §16** ("Phase 2 — MCP + WebMCP tool calling, shipped
   v0.2.0") documenting what was actually built — the unified `Tool` abstraction, the MCP
   client's real transport choice (Streamable HTTP, no stdio), deny-by-default
   permissioning as two independent layers, the WebMCP two-world bridge, tool-call-aware
   trace/confirmation, and the untrusted-description sanitization guarantee — plus what
   was deliberately **not** built (elicitation UI, cross-process vault access for an MCP
   server needing auth). The stale non-goal/tech-stack/build-plan/§15 rows that predated
   Phase 2 are struck through or corrected in place rather than silently deleted, the same
   "light polish, not a rewrite" choice ADR 0023 made for v0.1.0.
3. **`apps/extension/README.md` gains three sections it was missing** — #90 (tool-call-
   aware trace/confirmation), #91 (E2E: MCP + WebMCP tasks), #92 (tool-use evals +
   hostile-tool security suite) — backfilling the one-section-per-issue convention every
   earlier Phase 2 issue's own PR had already established for #80–#89, which slipped for
   three issues in a row before this one caught it.
4. **`CHANGELOG.md` gains one `[0.2.0]` entry**, grouped by subsystem like `[0.1.0]` was,
   not 14 one-line-per-issue entries. Explicitly calls out four real bugs found and fixed
   while building Phase 2 (the #87 content-script bloat and WebMCP call-race, the #86
   trace index-misalignment risk, the #92 reliability-scorer case-sensitivity bug) —
   same "don't ship a changelog that hides the near-misses" principle ADR 0023 applied.
5. **Every package bumped from `0.1.1` to `0.2.0`** (11 `package.json` files: root,
   `apps/extension`, `evals`, and every `packages/*`) — mirrors the exact mechanical
   pattern the `v0.1.1` patch release (#79) already used for its own bump, including
   leaving `pnpm-lock.yaml` untouched (workspace protocol deps aren't version-pinned in
   the lockfile, confirmed by that release's own diff never touching it either).
6. **`PROGRESS.md`'s per-issue Notes log is backfilled for #90/#91/#92**, which never got
   their own one-line entry when they merged (the log's cadence lapsed for three issues in
   a row) — added here rather than left permanently missing, since a future session
   reading this file chronologically would otherwise see an unexplained gap between #89
   and #93.

## Consequences

- A user can follow the README's "MCP & WebMCP tools" section alone, with no other
  context, to add a server and get a tool-calling task working — the acceptance
  criterion this issue exists to satisfy.
- `docs/DESIGN.md` now accurately reflects both shipped phases; nothing in it still reads
  as "designed for but not built" for anything Phase 2 actually delivered.
- `v0.2.0` is tagged on the exact commit this issue's PR merges to `main`, matching how
  `v0.1.0`/`v0.1.1` were each tagged on their own release PR's merge commit — not a
  separate, later commit.
