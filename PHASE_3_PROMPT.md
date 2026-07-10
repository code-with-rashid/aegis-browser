# Aegis — Phase 3 Build Prompt: Workflows & Autonomy

> **Run it:** in Claude Code, inside the repo, once Phase 2 (v0.2) is merged:
> _"Read `PHASE_3_PROMPT.md` and execute it fully and autonomously — create the Phase 3 issues, then loop until they're all closed, then tag v0.3."_
> **Resume:** _"Resume `PHASE_3_PROMPT.md`. Read `CLAUDE.md`, `PROGRESS.md`, and the open Phase-3 issues, then continue."_
>
> Builds on v0.2. **Standards and the per-issue loop are unchanged** — see `CLAUDE.md` and `BUILD_PROMPT.md` (Sections 5 and 8). This file adds only the Phase 3 design and backlog.

---

## 0. Prerequisites (verify before starting)

- Phases 1 and 2 are complete and `main` is green (all gates + eval + security suite).
- Available extension points: the agent loop, `ToolRegistry`, perception with stable refs, the security stack (policy engine, alignment critic, confirmation gate, vault), and the trace UI.
- Continue GitHub issue numbering after Phase 2; create Phase 3 issues under milestones **M13–M17**. Map backlog#→issue# in `PROGRESS.md`.

---

## 1. Mission

Turn one-off agent runs into **reusable, deterministic, self-healing workflows**, and allow them to run **scheduled / in the background / unattended** — safely. This is the durable moat: instead of re-invoking the planner every run (slow, costly, non-deterministic — Nanobrowser's model), Aegis **records a successful run once, compiles it to a fast deterministic workflow, and only falls back to the LLM when a step breaks** (self-heal). Unattended runs never bypass the safety model: each workflow carries an explicit pre-authorization policy, and anything outside it hard-stops and notifies.

**Outcome (v0.3):** a user can record a task into a parameterized workflow, run it deterministically and cheaply, have it self-heal when the site changes, and schedule it to run unattended within strict, pre-authorized bounds.

---

## 2. Design addendum (what's new)

**Record → compile → run.** A `Workflow` is a versioned, parameterized sequence of steps captured from a successful agent run. Each step stores the tool/action, its args, the **target by stable ref + a resilient selector** (captured at record time), and an expected post-condition.

```ts
interface Workflow {
  id: string;
  version: number;
  name: string;
  origin: string; // where it runs
  params: WorkflowParam[]; // typed run-time inputs (some may bind to vault secrets)
  steps: WorkflowStep[]; // ordered, deterministic
  authorization: RunPolicy; // what it may do unattended (see below)
}
interface WorkflowStep {
  toolId: string;
  args: unknown;
  target?: { ref: string; selector: string; role?: string; name?: string };
  expect?: PostCondition; // verified after execution
}
```

**Deterministic executor.** Replays steps via CDP **without calling the planner** — fast and cheap. Each step is verified against its `expect`; params are bound at run start (secrets resolved from the vault as `‹secret:name›`, never in any prompt).

**Self-healing (the differentiator).** When a step fails (selector missing, layout changed, post-condition unmet), fall back to the LLM to **re-locate the element or re-plan just that one step** using current perception, execute the fix, then **patch the workflow and bump its version** (recording the change). Healing that touches a `state_changing` step requires human review/confirmation and shows a diff; changes are rollback-able.

**Unattended safety (critical).** With no human watching, the confirmation gate can't rely on a person. So every workflow carries a `RunPolicy` (pre-authorized tools/actions, allowed origins, spending/rate caps). During an unattended run, **anything outside the pre-authorized set hard-stops the run and notifies the user** — it is never auto-approved. Self-heal may not expand authority. This preserves the safety-first invariant even when running headless.

**MV3 background reality.** Service workers are evicted; use **`chrome.alarms`** for scheduling and a **managed/offscreen tab** to actually drive a page (CDP needs a real target). Persist run state so an evicted worker resumes. Document these constraints.

**Dependency rule.** New `packages/workflows` (model, recorder, executor, self-heal, scheduler). It depends on `agent`/`actions`/`perception`/`security`/`shared`; UI stays in the app. No cycles.

---

## 3. Issue backlog (create these; numbers continue after Phase 2)

### M13 — Workflow model & recording

**P3-1 · Workflow data model + storage** · `type:feature, area:workflows, M13`

- Goal: represent and persist workflows.
- Scope: `Workflow`/`WorkflowStep`/`WorkflowParam`/`RunPolicy` types + Zod schemas; versioned; storage port; migrations helper.
- Acceptance: create/read/update/version a workflow; schema-validated; round-trips storage; unit-tested.
- Blocked by: (Phase 1 shared).

**P3-2 · Run recorder** · `type:feature, area:workflows, M13`

- Goal: capture a successful run as a workflow.
- Scope: record executed steps (tool + args + target ref/selector + post-condition) during/after a successful agent run; produce a replayable `Workflow`.
- Acceptance: a recorded research/extract run replays structurally; selectors + refs captured; tested.
- Blocked by: P3-1, (Phase 1 agent/actions).

**P3-3 · Parameterization** · `type:feature, area:workflows, M13`

- Goal: workflows take typed inputs.
- Scope: extract run-time values (search terms, form fields) into typed `params`; support binding a param to a vault secret; validation.
- Acceptance: a recorded workflow exposes params; running with new param values works; secret-bound params resolve from vault only; tested.
- Blocked by: P3-2.

### M14 — Deterministic execution

**P3-4 · Deterministic workflow executor** · `type:feature, area:workflows, M14`

- Goal: replay without the planner.
- Scope: execute steps in order via CDP using stored ref/selector; bind params; no LLM calls on the happy path; abort/stop support.
- Acceptance: a recorded workflow completes deterministically on an unchanged page with zero planner calls; tested against fixtures.
- Blocked by: P3-3, (Phase 1 actions/perception).

**P3-5 · Step verification + result capture** · `type:feature, area:workflows, M14`

- Goal: trust each step and collect outputs.
- Scope: evaluate each step's `expect` post-condition; capture extractions/outputs; on failure emit a typed "needs healing" signal.
- Acceptance: success and failure post-conditions detected correctly; outputs captured; tested.
- Blocked by: P3-4.

### M15 — Self-healing

**P3-6 · Failure detection + self-heal** · `type:feature, area:workflows, M15`

- Goal: recover from site changes automatically.
- Scope: on a step failure, invoke the LLM with current perception to re-locate/re-plan **only that step**; execute the fix; patch the workflow + bump version.
- Acceptance: an intentionally shifted selector heals and the run completes; the workflow is updated; tested with MockProvider + a mutated fixture.
- Blocked by: P3-5, (Phase 1 agent/perception).

**P3-7 · Healing safety & review** · `type:security, area:security, priority:P0, M15`

- Goal: healing can't become an attack vector.
- Scope: healed changes to `state_changing` steps require confirmation (or hard-stop when unattended); show a diff of the change; allow rollback; healing may not exceed the workflow's `RunPolicy`.
- Acceptance: a heal that would alter a state-changing step is gated; diff shown; rollback works; unattended heal outside policy hard-stops; tested.
- Blocked by: P3-6, (Phase 1 security core).

### M16 — Scheduling & background runs

**P3-8 · Background run engine** · `type:feature, area:workflows, M16`

- Goal: run workflows unattended.
- Scope: drive a managed/offscreen tab; lifecycle + persistence across service-worker eviction; concurrency limits; run records.
- Acceptance: a workflow runs to completion with no side panel open; survives a simulated worker restart; tested.
- Blocked by: P3-4.

**P3-9 · Scheduler + triggers** · `type:feature, area:workflows, M16`

- Goal: run on a schedule or trigger.
- Scope: `chrome.alarms`-based scheduling (cron-like) + manual trigger; run history with status/outputs; enable/disable per workflow.
- Acceptance: a scheduled workflow fires and records a run; history visible; tested.
- Blocked by: P3-8.

**P3-10 · Unattended-mode guardrails** · `type:security, area:security, priority:P0, M16`

- Goal: safe autonomy.
- Scope: enforce each workflow's `RunPolicy` (allowed tools/actions/origins, spending/rate caps); **hard-stop + notify** on anything outside it; never auto-confirm arbitrary state changes; secrets via vault.
- Acceptance: an unattended run blocks and notifies on an out-of-policy action; in-policy runs proceed; injection during a background run is blocked; tested.
- Blocked by: P3-9, P3-7.

### M17 — Workflow UX, evals, release

**P3-11 · Workflow library UI** · `type:ui, area:ui, M17`

- Goal: manage and run workflows.
- Scope: list/run/edit/delete; parameter input form; run history + per-run trace.
- Acceptance: user runs a saved workflow with params and views history/trace; a11y-checked.
- Blocked by: P3-5, (Phase 1 trace UI).

**P3-12 · Workflow builder/editor** · `type:ui, area:ui, M17`

- Goal: inspect and edit workflows.
- Scope: view/reorder/delete steps, edit params, set the `RunPolicy`, enable scheduling; show version history.
- Acceptance: edits persist and change execution; RunPolicy editable; tested.
- Blocked by: P3-11, P3-10.

**P3-13 · Workflow evals + security suite** · `type:security, area:evals, priority:P0, M17`

- Goal: prove reliability + safety.
- Scope: eval deterministic replay and self-heal across simulated site changes (measure heal success + planner-call reduction); security suite for unattended runs (no unauthorized state change; injection during background/scheduled runs blocked).
- Acceptance: `pnpm eval` covers workflows; heal + unattended-safety tests pass in CI.
- Blocked by: P3-12.

**P3-14 · Docs + v0.3** · `type:docs, area:infra, M17`

- Goal: ship v0.3.
- Scope: document recording, parameters, self-heal, scheduling, and the RunPolicy/unattended-safety model; update README/DESIGN; `CHANGELOG`; tag `v0.3.0`.
- Acceptance: a user can record, parameterize, and schedule a workflow from the docs; tagged.
- Blocked by: P3-13.

---

## 4. Execution & definition of done

Identical to `BUILD_PROMPT.md` §8/§9 and `CLAUDE.md`. All gates + `eval` + security suite green before any issue closes. **Never let an unattended run perform an un-authorized state-changing action, and never let self-heal expand a workflow's authority** — these are hard invariants. Phase 3 is done when all P3 issues are closed, `v0.3.0` is tagged, and a user can record, run, self-heal, and safely schedule a workflow.

---

## 5. Beyond v0.3 (not yet detailed)

Phase 4 ideas — Firefox support (WXT makes this incremental), Chrome Web Store / Edge Add-ons distribution, team/workflow sharing, and polish — remain a high-level backlog. Detail them into a `PHASE_4_PROMPT.md` once v0.3 exists.
