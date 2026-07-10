import { z } from 'zod';

/** A raw `{toolId, args}` call as the model must emit it — `args` is intentionally `unknown` here (validated per-tool by `resolve-tool-calls.ts` against the real `Tool.inputSchema` afterward, not by this wire schema). */
const ToolCallSchema = z.object({
  toolId: z.string().min(1),
  args: z.unknown(),
});

/**
 * The LLM's structured output for one navigation step — `docs/DESIGN.md` §5's
 * `AgentBrain` shape (the Navigator returns `toolCalls`, where the Planner returns
 * `plan`). Each entry names a `Tool.id` (`@aegis/actions`, e.g. `"browser.click"`) the
 * Navigator chose from the tools listed in its prompt (`navigator/prompt.ts`); args are
 * schema-validated per-tool afterward (`resolve-tool-calls.ts`), not by this schema —
 * see `docs/adr/0029-tool-calling-agent-loop.md` for why (this supersedes ADR 0006's
 * transform-free mirror, which is no longer needed).
 */
export const NavigatorOutputSchema = z.object({
  observation: z.string(),
  reasoning: z.string(),
  memory: z.string(),
  nextGoal: z.string(),
  toolCalls: z.array(ToolCallSchema).max(4),
});

export type NavigatorLlmOutput = z.infer<typeof NavigatorOutputSchema>;
