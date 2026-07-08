# @aegis/agent

The orchestration core. Hosts the resumable XState loop machine
(`Planning → Perceiving → Deciding → PolicyCheck → (Confirming?) → Acting → Verifying`),
the Planner (decomposition/replanning), the Navigator (next-action selection), the
Verifier (sub-goal success/failure judgment), and loop guardrails (step/replan budgets,
stall-forced replan, stop/pause/resume).

Depends on `@aegis/actions`, `@aegis/llm`, `@aegis/perception`, `@aegis/shared`.
