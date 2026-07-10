# Aegis — MVP Design & Architecture Spec

> **What it is:** A local-first, bring-your-own-key browser-automation agent delivered as an MV3 extension, where **reliability and safety are the product**.
> **Positioning:** _Private, reliable, safe web automation that runs in your own logged-in browser._
> **Status:** Implemented — v0.1.0 (MVP core) and v0.2.0 (MCP/WebMCP tool calling, §16)
> both shipped. See `PROGRESS.md` and `docs/adr/` for how the design below was realized and
> where real decisions departed from this draft.

---

## 1. Why this exists

Nanobrowser proved the demand for a free, private, BYOK browser agent — but it is beatable on the two axes that actually decide winners: **reliability** (it's model-gated, loops, and its structured-output parsing breaks) and **trust/safety** (only "lightweight" guardrails against prompt injection; credentials flow into the LLM prompt). Meanwhile the market is splitting: free AI-native browsers (Comet, Atlas) pull consumers from above; cloud frameworks (Browser Use, Skyvern) own developers/enterprise from below, but gate their best reliability behind paid cloud.

**Aegis's wedge:** keep the genuine moat of a local-first BYOK extension — it runs in _your_ browser with _your_ logins, nothing goes to a vendor server — and win on the two things nobody has fused into an open extension: **hybrid perception for reliability** and **a security-first architecture that is on by default.**

### Design principles

1. **Safe by default, not by configuration.** The protective behavior ships on; users relax it deliberately, per-site.
2. **The human is in the loop for anything irreversible.** State-changing actions always pause for confirmation in the MVP.
3. **Untrusted content is never an instruction.** Page text is data, tagged and sandboxed — never merged into the instruction channel.
4. **Reliability is measured, not asserted.** An eval harness gates every release; "use a smarter model" is not our answer.
5. **Local-first.** No Aegis backend in the critical path. Keys and data stay in the browser.
6. **Layered, not monolithic.** The MVP core is architected so MCP/tool-use and record→replay workflows attach later without a rewrite.

---

## 2. Goals & non-goals (MVP / v0.1)

### Goals

- Execute multi-step natural-language tasks in Chrome & Edge with a **measurably higher success rate** than Nanobrowser on a shared internal eval set.
- **100% of state-changing actions** (purchase, send, delete, post, credential entry, money movement) are gated behind explicit human confirmation.
- **Zero credentials in the LLM prompt** — logins are handled via an encrypted vault + native form fill, never by pasting secrets into chat.
- Survive a baseline **indirect prompt-injection test suite** without exfiltration or unauthorized state-change.
- Give the user a **replayable, human-readable trace** of every step (what/why/result).

### Non-goals (explicitly out for v0.1)

- No CAPTCHA solving or bot-detection evasion arms race — **human handoff** instead.
- No autonomous purchases/sends without confirmation.
- No headless / scheduled / background runs (Phase 3).
- No record→replay workflow compiler (Phase 3).
- ~~No MCP/WebMCP tool ecosystem yet (Phase 2 — but the interfaces are designed for it
  now).~~ Shipped in v0.2.0 — see §16.
- No cloud sync, no accounts, no telemetry beyond opt-in local-only diagnostics.
- Firefox ships shortly after, not on day one (Chrome + Edge first).

### Success metrics

| Metric                                               | Target for v0.1                            |
| ---------------------------------------------------- | ------------------------------------------ |
| Task success rate (internal eval set, live sites)    | Beat Nanobrowser baseline by ≥15 pts       |
| State-changing actions gated by confirmation         | 100%                                       |
| Credential-in-prompt incidents                       | 0                                          |
| Prompt-injection suite (exfil / unauthorized action) | 0 successful attacks in the baseline suite |
| Median steps per successful task vs. human reference | ≤ 2.0×                                     |
| p50 time-to-first-action                             | < 4 s                                      |

---

## 3. Target user & MVP use cases

**Primary user:** a privacy-conscious prosumer/developer who wants to automate real web tasks _in their own logged-in browser_ and won't hand logins to a cloud agent.

**MVP "happy path" scenarios** (also the seed of the eval set):

1. **Research & extract** — "Get the top 10 HN posts about AI agents today with links and points." (read-only; no confirmation needed)
2. **Compare & summarize** — "Find 3 water-resistant Bluetooth speakers under $50 on Amazon with >10h battery; make a table." (read-only, cross-page)
3. **Form fill with a confirmation gate** — "Fill out this job-application form from my résumé data, then let me review before submitting." (state-changing → **must confirm** at submit)
4. **Authenticated read** — "Summarize my unread GitHub notifications." (uses existing session; no credentials handled)

---

## 4. System architecture

Aegis runs entirely inside the browser across four MV3 surfaces, coordinated by a background service worker that owns the agent loop and the CDP connection.

```mermaid
flowchart TB
  subgraph UI["Side Panel (React)"]
    Chat["Chat + task input"]
    Trace["Action trace / log"]
    Confirm["Confirmation gate UI"]
  end
  subgraph OPT["Options page"]
    Keys["BYOK model config"]
    Vault["Secret vault UI"]
    Perms["Per-site permissions"]
  end
  subgraph BG["Background Service Worker (orchestrator)"]
    Loop["Agent loop (XState)"]
    Planner["Planner agent"]
    Navigator["Navigator agent"]
    Critic["Alignment critic"]
    Sec["Security policy engine"]
    LLM["LLM layer (Vercel AI SDK, BYOK)"]
  end
  subgraph PAGE["Target tab"]
    CDP["chrome.debugger → CDP"]
  end
  Store[("chrome.storage + WebCrypto vault")]

  Chat --> Loop
  Loop --> Planner --> LLM
  Loop --> Navigator --> LLM
  Navigator --> Sec
  Sec --> Critic --> LLM
  Sec -->|state-changing| Confirm
  Loop --> CDP
  CDP --> PAGE
  Loop --> Trace
  Keys --> Store
  Vault --> Store
  Perms --> Store
  Sec --> Store
  LLM -->|user's API key| Ext["User's chosen LLM provider"]
```

**Why this shape**

- **Background service worker owns the loop & CDP.** MV3 workers can be evicted, so loop state is persisted to `chrome.storage.session` after every transition; the XState machine is resumable.
- **Perception/control is CDP-only.** `chrome.debugger` gives us the accessibility tree, robust DOM, screenshots, and precise input events — the proven approach. v0.1.0 has no content-script fast path (see `apps/extension/README.md`'s "Note on `chrome.debugger`"): every perception/action call goes through CDP, accepting the "debugging this browser" banner as expected behavior rather than maintaining a second code path to partially avoid it.
- **The security policy engine sits between the agent and the browser.** No action reaches the page without passing policy → (critic) → (confirmation) checks. This is the architectural heart of the product.

---

## 5. The agent loop

Two agents, one explicit state machine. We keep the **Planner + Navigator** split (it works and matches how the models reason) and add a **verification** step Nanobrowser lacks — the single biggest lever against compounding error on long tasks.

- **Planner** (higher-temp, "smart" model): decomposes the task, maintains the plan, re-plans on obstacles, decides when the task is done. Runs at the start and whenever the Navigator is stuck or a sub-goal completes.
- **Navigator** (lower-temp, cheap/fast model): given current perception + the active sub-goal, emits the next concrete action(s).
- **Verifier** (cheap model or heuristic): after acting, checks "did that achieve the sub-goal?" against fresh perception. Prevents the "declared success but nothing happened" failure class.
- **Alignment critic** (safety, see §7): independently checks proposed state-changing actions against the _user's_ original intent before they're allowed.

```mermaid
stateDiagram-v2
  [*] --> Planning
  Planning --> Perceiving: plan ready
  Perceiving --> Deciding: page state captured
  Deciding --> PolicyCheck: Navigator proposes action(s)
  PolicyCheck --> Acting: safe / read-only
  PolicyCheck --> Confirming: state-changing
  Confirming --> Acting: user approves
  Confirming --> Replanning: user rejects / edits
  Acting --> Verifying: action executed
  Verifying --> Perceiving: sub-goal incomplete
  Verifying --> Planning: sub-goal done, more to do
  Verifying --> Done: task complete
  Deciding --> Replanning: stuck / no actionable elements
  Replanning --> Planning
  Perceiving --> Paused: user pause / stop
  Acting --> Failed: hard error x N
  Paused --> Perceiving: resume
  Done --> [*]
  Failed --> [*]
```

**Loop guardrails:** a max-step budget, a max-replan budget, a stall detector (same action/URL repeated → force replan, the exact bug that loops Nanobrowser), and a global stop/pause the user can hit at any time.

**Agent output contract** (Zod-validated, with a JSON-repair fallback so a stray markdown fence never crashes the run — directly fixing Nanobrowser's #1 bug class):

```ts
const AgentBrain = z.object({
  observation: z.string(), // what the agent sees right now
  reasoning: z.string(), // why it's choosing this (shown in the trace)
  memory: z.string(), // compact running state to carry forward
  nextGoal: z.string(),
  actions: z.array(Action).max(4), // Navigator; Planner returns `plan` instead
});
```

---

## 6. Perception layer (hybrid)

Perception is where Nanobrowser is structurally blind (index-only; `extractContent` disabled). Aegis uses a **three-tier, budget-aware** pipeline and hands the model a compact, stable representation.

```mermaid
flowchart LR
  A["Accessibility tree<br/>CDP Accessibility.getFullAXTree"] --> M["Merge + normalize"]
  B["Pruned DOM<br/>interactive + text nodes"] --> M
  M --> N["Normalized element set<br/>(stable refs)"]
  N --> Budget{"Within token<br/>budget?"}
  Budget -->|yes| Out["Perception payload"]
  Budget -->|no| Compress["Compress / rank by relevance to goal"] --> Out
  Out -.fallback.-> V["Screenshot + vision<br/>(only when structure is missing/ambiguous)"]
  V --> Out
```

- **Primary: accessibility tree** via `Accessibility.getFullAXTree` — roles, names, values, states. Cheap, semantic, deterministic; every element gets a **stable `ref`** (e.g., `ax-42`) so actions target refs, not brittle indexes/XPath.
- **Augment: pruned DOM** — fills gaps the AX tree misses (custom widgets with poor a11y), plus readable main-content extraction (a real `extractContent`, re-enabled and budgeted — the thing Nanobrowser commented out).
- **Fallback: screenshot + vision** — only when structure is absent/ambiguous (canvas, icon-only buttons, `<canvas>`/WebGL apps). This closes Nanobrowser's blind spot without paying the vision tax on every step.
- **Budget control:** a per-step token budget; when the page is huge, rank elements by relevance to the active goal and drop the rest (kills the DOM-dump token blow-up). History is compressed, not accumulated raw.

**Normalized element:**

```ts
interface PerceivedElement {
  ref: string; // stable handle used by actions
  role: string; // button, link, textbox, ...
  name: string; // accessible name / visible label
  value?: string;
  state?: { disabled?: boolean; checked?: boolean; expanded?: boolean };
  bounds?: Rect; // for vision fallback / highlighting
  source: 'ax' | 'dom' | 'vision';
}
```

---

## 7. Security & trust model (the differentiator)

The threat is **indirect prompt injection**: hidden instructions in page content that hijack the agent (the exploit class that produced account-takeovers against Comet/Operator/Atlas in 2025). Our design applies Simon Willison's _lethal trifecta_ and Meta's _Rule of Two_: never allow **untrusted content + private data + an exfiltration channel** to coexist unsupervised in one step.

Five layers, all on by default:

### 7.1 Trust boundary (content tagging)

All page-derived text enters the model wrapped and labeled as **untrusted data, not instructions**. The system prompt establishes that content inside the untrusted envelope can never issue commands, change the goal, or request navigation to new origins. Extracted/cached content is sanitized (strip instruction-like imperatives, hidden text, zero-width chars) before it ever reaches the Planner.

### 7.2 Alignment critic

Before any **state-changing** action executes, a second, independent model pass asks: _"Does this action serve the user's original stated intent, or does it appear induced by page content?"_ Misaligned actions are blocked and surfaced to the user. This is cheap insurance against injected sub-goals.

### 7.3 Mandatory confirmation for state-changing actions

The policy engine classifies every proposed action. Anything irreversible/consequential **pauses for explicit human approval** with a plain-language preview ("Submit application to X?"). Read-only actions flow through freely.

```ts
type ActionRisk = 'read' | 'navigate' | 'input' | 'state_changing';
// state_changing => ALWAYS confirm in MVP:
const STATE_CHANGING = [
  'purchase',
  'checkout',
  'send_message',
  'send_email',
  'post_content',
  'delete',
  'transfer_funds',
  'submit_form_with_side_effects',
  'enter_credentials',
  'grant_permission',
  'change_account_settings',
];
```

### 7.4 Secret vault + native fill (no creds in prompt)

Credentials live in a **WebCrypto-encrypted vault** (key derived from a user passphrase; secrets never serialized to the model). When a login is needed, Aegis fills fields via native input events — the model sees `‹secret:github_password›` placeholders, never the value. 2FA/MFA always hands off to the human.

### 7.5 Per-site permissions & isolation

- Every origin has a policy: `ask` (default) / `allow` / `deny`, plus an `allowStateChanging` flag.
- A hard **deny-list** for high-risk domains (banking, gov, adult) unless the user explicitly opts in.
- Optional **isolated profile mode**: run agent tasks in a dedicated browser profile so the agent's session is scoped away from the user's primary logins.

```ts
interface SitePolicy {
  origin: string;
  mode: 'ask' | 'allow' | 'deny';
  allowStateChanging: boolean;
  expiresAt?: number; // "allow for this session"
}
```

**Confirmation-gate flow:**

```mermaid
sequenceDiagram
  participant N as Navigator
  participant P as Policy engine
  participant C as Alignment critic
  participant U as User
  participant B as Browser (CDP)
  N->>P: propose action(s)
  P->>P: classify risk + check SitePolicy
  alt read-only / allowed
    P->>B: execute
  else state-changing
    P->>C: aligned with user intent?
    alt misaligned
      C-->>U: block + explain
    else aligned
      P-->>U: preview + request approval
      U-->>P: approve / edit / reject
      P->>B: execute (only if approved)
    end
  end
```

---

## 8. LLM layer (BYOK, provider-agnostic)

- **Vercel AI SDK (v6/7)** as the model + tool-calling abstraction. It gives provider-agnostic `generateObject`/tool loops plus first-class **approvals** and **durable steps** — which map directly onto our confirmation gate and resumable loop.
- **Per-agent model routing:** the user assigns models per role (e.g., Planner = a strong reasoning model, Navigator = a cheap/fast one, Critic/Verifier = cheap). Cost edge preserved from Nanobrowser.
- **Providers at MVP:** OpenAI, Anthropic, Google, Ollama (local), and any OpenAI-compatible endpoint.
- **Robust structured output:** Zod schema + `generateObject`, with a **manual JSON-repair fallback** and a bounded retry — so a provider that wraps JSON in a fence or fumbles tool-calling degrades gracefully instead of crashing (the failure Nanobrowser shipped for months).

---

## 9. Trust-UX: the four surfaces that _are_ the product

These aren't decoration — they're the reason a user trusts Aegis over a free AI-native browser.

1. **Confirmation gate.** A clear modal: the action, its target, a human-readable preview, and Approve / Edit / Reject. Never a generic "allow?" — always specific ("Send email to jane@acme.com?").
2. **Action trace / log.** A live, replayable, step-by-step timeline: each step shows the agent's reasoning, the action, the target element, and the result. Expandable to raw perception for debugging. This makes non-determinism _auditable_.
3. **Permissions panel.** Per-site policy at a glance; one click to allow/deny/scope; visible deny-list.
4. **Secret vault.** Add/remove credentials, see where each is used, everything encrypted. A "the agent never sees this value" affordance.

Plus a persistent **Stop/Pause** and a post-run summary. (Wireframes to follow in the design phase; this spec fixes the behavior, not the pixels.)

---

## 10. Data & storage

| Data                            | Store                               | Notes                                              |
| ------------------------------- | ----------------------------------- | -------------------------------------------------- |
| Model/provider config, API keys | `chrome.storage.local`              | Keys encrypted at rest via vault key               |
| Secret vault (credentials)      | `chrome.storage.local` + WebCrypto  | AES-GCM; key derived from user passphrase (PBKDF2) |
| Per-site policies               | `chrome.storage.local`              | User-editable                                      |
| Loop state (resume)             | `chrome.storage.session`            | Written every transition; cleared on completion    |
| Task history / traces           | `chrome.storage.local` (opt-in cap) | Local only; user can purge                         |
| Diagnostics                     | off by default                      | Opt-in, local-only; no remote telemetry in MVP     |

---

## 11. Tech stack & repo structure

| Layer                                   | Choice                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Extension framework                     | **WXT** (MV3, Vite, cross-browser)                                                                                      |
| Language                                | **TypeScript**                                                                                                          |
| UI                                      | **React + Tailwind + shadcn/ui**                                                                                        |
| Agent loop                              | **XState** (resumable state machine)                                                                                    |
| Model + tools                           | **Vercel AI SDK v6/7** (BYOK)                                                                                           |
| Schemas / validation                    | **Zod** + JSON-repair fallback                                                                                          |
| Perception / control                    | **chrome.debugger → CDP** (AX tree, DOM, screenshot) — no content-script fast path in v0.1.0; see §14                   |
| Security                                | **WebCrypto** vault, content trust-tagging, alignment critic                                                            |
| Extensibility (Phase 2, shipped v0.2.0) | Official **@modelcontextprotocol** SDK (Streamable HTTP) + WebMCP fast-path (`document.modelContext` feature-detection) |
| UI state                                | **Zustand**                                                                                                             |
| Testing                                 | **Vitest** + **Playwright** + reliability **eval harness**                                                              |
| Repo                                    | **pnpm + Turbo** monorepo                                                                                               |

```
aegis/
├─ apps/extension/          # WXT app (background, side-panel, options, content)
│  ├─ entrypoints/
│  │  ├─ background.ts       # orchestrator: XState loop + CDP session
│  │  ├─ sidepanel/          # React chat, trace, confirm gate
│  │  └─ options/            # models, vault, permissions
├─ packages/
│  ├─ eval-harness/          # shared E2E/eval infra: extension launcher, fake model
│  │                         # server, fixtures + scenarios (used by both E2E and evals/)
│  ├─ agent/                 # loop machine, planner, navigator, verifier, critic
│  ├─ perception/            # AX-tree + DOM + vision pipeline, normalizer
│  ├─ actions/               # action schemas + CDP executors
│  ├─ security/              # policy engine, classifier, vault, sanitizer
│  ├─ llm/                   # AI SDK providers, structured-output + repair
│  ├─ mcp/                   # MCP client (Streamable HTTP) + WebMCP adapter (Phase 2, v0.2.0)
│  └─ shared/                # types, storage, logging
├─ evals/                    # task set + harness (reliability gate)
└─ turbo.json / pnpm-workspace.yaml
```

---

## 12. Testing & eval strategy

- **Unit (Vitest):** perception normalizer, action classifier, security policy engine, JSON-repair.
- **E2E (Playwright):** run the extension against a set of fixture sites + a handful of live sites; assert task outcomes and that confirmations fire.
- **Reliability eval harness (the differentiator):** a versioned task set (seeded from the §3 use cases, grown toward Online-Mind2Web-style live tasks) with human-judged success. Runs on every release; a regression blocks the release. This is how we make "more reliable than Nanobrowser" a _number_, not a claim.
- **Security suite:** a corpus of indirect-prompt-injection pages (hidden instructions, spoofed CAPTCHAs, malicious URLs); assert zero exfiltration and zero unauthorized state-change.

---

## 13. Build plan / milestones

| Phase                        | Deliverable                                                                                                    | Exit criteria                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **0 — Spike** (throwaway)    | Drive one real site end-to-end via CDP AX-tree perception + AI SDK tool-calling with a hard human-confirm gate | Proves the perception→action→confirm loop works; informs the real interfaces    |
| **1 — Core loop**            | WXT scaffold, XState loop, Planner/Navigator, perception pipeline, action executors                            | Completes read-only use cases (1,2,4) reliably                                  |
| **2 — Security core**        | Policy engine, confirmation gate, alignment critic, content trust-tagging, secret vault                        | Use case 3 gated correctly; passes baseline injection suite                     |
| **3 — Trust UX + evals**     | Action trace, permissions panel, vault UI, eval harness wired to CI                                            | Beats Nanobrowser baseline on the eval set; ship v0.1 (Chrome+Edge)             |
| **Phase 2 — shipped v0.2.0** | MCP client + WebMCP fast-path, tool-call-aware trace/confirmation, tool-use evals + security suite             | Agent calls declared MCP/WebMCP tool APIs, gated identically to browser actions |
| **Phase 3 (post-MVP)**       | Record→compile self-healing workflows + scheduled runs                                                         | Reusable, deterministic automations                                             |

---

## 14. Risks & open questions

- **`chrome.debugger` banner UX.** The "started debugging this browser" bar is unavoidable when attached. **Resolved for v0.1.0**: no content-script fast path was built — every perception/action goes through CDP exclusively (see `apps/extension/README.md`'s "Note on `chrome.debugger`"), accepting the banner as expected behavior rather than partially avoiding it with a second code path to maintain. Revisit if the banner proves to be a real adoption blocker.
- **Confirmation fatigue.** Too many gates and users disable safety. Mitigation: precise classification, per-site `allow` scoping, batch-preview multi-step forms. _Open: the right default granularity._
- **Reliability ceiling is real.** Even frontier agents sit well under 100% on live multi-step tasks. We compete on _relative_ reliability + honesty, not magic. The verifier + evals are the levers.
- **Vision-fallback cost.** Keep it a genuine fallback; measure how often it triggers.
- **Solo-maintainer risk (the thing that's hurting Nanobrowser).** Keep the core small, typed, and well-tested; make packages independently ownable; write the eval harness early so contributors can change code safely.
- **WebMCP timing.** Origin trial mid-2026, mass adoption ~2027 — correct to treat as an opportunistic fast-path, not a dependency. Shipped in v0.2.0 exactly that way: feature-detected per page (`document.modelContext`), with a global off switch and a DOM-driven fallback when a page declares nothing (§16).

---

## 15. What makes this _not_ just a better Nanobrowser

Every core choice ties to a specific, verified Nanobrowser weakness:

| Nanobrowser weakness                                   | Aegis answer                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| Index-only perception (misses canvas/icons/shadow DOM) | Hybrid AX-tree + DOM + vision fallback with stable refs        |
| `extractContent` disabled → token blow-up              | Re-enabled, budgeted extraction + history compression          |
| Structured-output parsing breaks across providers      | Zod + `generateObject` + JSON-repair fallback                  |
| "Lightweight" guardrails vs. prompt injection          | 5-layer security core, on by default                           |
| Credentials flow into the prompt                       | WebCrypto vault + native fill; model never sees secrets        |
| No verification → compounding error / loops            | Verifier step + stall detector                                 |
| No human gate on risky actions                         | Mandatory confirmation for all state-changing actions          |
| Chrome/Edge only                                       | WXT cross-browser                                              |
| Reliability is unmeasured ("use a smarter model")      | Eval harness gates every release                               |
| No tools / MCP / API                                   | MCP client + WebMCP fast-path, shipped v0.2.0 (Phase 2)        |
| Single-maintainer, stalling                            | Small typed core + early evals so others can contribute safely |

---

## 16. Phase 2 — MCP + WebMCP tool calling (shipped v0.2.0)

Built as 14 issues (#80–#93, `PROGRESS.md`'s M8–M12), all documented in `docs/adr/`
(ADRs 0028–0040). Summary of what actually shipped, since several real decisions departed
from or sharpened what this draft only sketched:

- **A unified `Tool` abstraction** (`@aegis/actions`'s `ToolRegistry`) is the one shape a
  browser action, an MCP tool, and a WebMCP tool all implement — `{id, source, description,
inputSchema, risk, execute}`. The Navigator's decision became source-agnostic: a
  `ToolCall {toolId, args}`, not an `Action`; a browser-only `actions` view is still
  derived from it for backward-compatible consumers (the trace's "Edit" flow, mainly).
- **MCP client** (`@aegis/mcp`) wraps the official `@modelcontextprotocol/sdk` over
  Streamable HTTP (no stdio — a browser extension can't spawn child processes). Servers
  are user-configured (URL, display name, an optional auth header referencing a vault
  secret by name, never a raw value) and connected fresh on every task start — no
  persistent connection to manage across service-worker restarts.
- **Deny-by-default tool permissioning**, two independent layers: an admission gate
  (`McpToolPolicy`: a tool a user has never reviewed is recorded `deny` and excluded
  outright, mirroring nothing being auto-trusted) sits in front of the existing per-call
  risk gate (`ActionRisk` via `PolicyEngine`) every tool call — MCP, WebMCP, or browser —
  already passed through unchanged. Risk is inferred fail-safe: no `readOnlyHint` (or an
  explicit `destructiveHint`) means `state_changing`, never assumed safe.
- **WebMCP** is feature-detected per page (`document.modelContext`, Chrome's current
  in-progress attribute name for the emerging spec) via a two-world content-script bridge
  (a MAIN-world script with real access to the page's own declaration, an ISOLATED-world
  script with real `chrome.*` access, talking only over a shared-`document` event
  protocol — a live JS reference can't cross that boundary, only structured-cloned data
  can). The Navigator prefers a declared tool over driving the DOM when one covers the
  sub-goal; a page with none present falls back to ordinary DOM actions exactly as before,
  and a global options-page toggle can turn WebMCP off entirely regardless of what any
  page declares.
- **The confirmation gate and action trace are tool-call-aware**, not just
  browser-action-aware: a `state_changing` MCP/WebMCP call gets the same plain-language
  preview (tool id, source, a capped args summary) a browser action always has, and the
  trace shows a visible source badge plus an expandable args/result detail per call.
- **A tool's `description` is untrusted content, always** — it comes from an external
  server or a page's own script, exactly as unverified as page text — and is sanitized
  through the same pipeline (§7.1) before it ever reaches a Navigator or Critic prompt.
  The security test suite (§12) was extended with hostile-tool corpus cases (a malicious
  description attempting prompt injection, a hostile tool baiting an unauthorized call)
  proving this holds end-to-end, not just that a sanitize hook exists.
- **Not built in Phase 2**: MCP elicitation (a server asking the connecting client for
  more input mid-call) has real client-side plumbing but no UI wired to it yet; an MCP
  server needing an auth header can't yet connect from a live task specifically, because
  the background service worker has no way to share an _unlocked_ secret vault with the
  options page's separate process — a real, documented limitation (ADR 0037), not silently
  worked around, and one that equally affects `input_text`/`send_keys` secret placeholders.

---

_End of design draft. Phases "0 — Spike" through "3 — Trust UX + evals" shipped as
v0.1.0; Phase 2 (§16) shipped as v0.2.0. See `PROGRESS.md`'s milestone checklist and ADR
log for the 93 issues that implemented this design, including every place implementation
surfaced a real decision this draft didn't anticipate. Phase 3 (record→compile workflows)
remains post-MVP, not yet started._
