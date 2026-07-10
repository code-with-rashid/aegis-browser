import { z } from 'zod';

/**
 * `allow`: this exact tool id may be registered/callable. `deny`: it must not be — either
 * a user's explicit choice, or the fail-safe default recorded the moment a tool is first
 * discovered (`gate-mcp-tools.ts`). There is no `ask`/`confirm` mode here (unlike
 * `@aegis/security`'s `SitePolicy`) — this is a one-time "may this tool exist at all"
 * admission gate, not the per-call risk gate `@aegis/security`'s `PolicyEngine` already
 * runs on every allowed tool call (#82).
 */
export const McpToolPolicyModeSchema = z.enum(['allow', 'deny']);
export type McpToolPolicyMode = z.infer<typeof McpToolPolicyModeSchema>;

/**
 * Keyed by `Tool.id` (`mcp.<server>.<tool>`, `@aegis/actions`) — not a separate
 * `(server, tool)` pair — since that id already namespaces both, and reusing it avoids a
 * second, potentially-inconsistent id scheme.
 */
export const McpToolPolicySchema = z.object({
  toolId: z.string().min(1),
  mode: McpToolPolicyModeSchema,
});
export type McpToolPolicy = z.infer<typeof McpToolPolicySchema>;

export const McpToolPolicyMapSchema = z.record(z.string(), McpToolPolicySchema);
export type McpToolPolicyMap = z.infer<typeof McpToolPolicyMapSchema>;
