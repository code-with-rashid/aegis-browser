import type { ToolRisk } from '@aegis/actions';

import type { WebMcpToolAnnotations } from './webmcp-tool';

/**
 * Infers a Tool's static risk from its WebMCP annotations: `readOnlyHint: true` is
 * `read`; anything else — including a page that declares no annotations at all — fails
 * safe to `state_changing`, the same fail-safe convention `inferMcpToolRisk`
 * (`@aegis/mcp`'s MCP-tool counterpart) already applies. WebMCP has no `destructiveHint`
 * equivalent to check first; `untrustedContentHint` is a different concern (the tool's
 * *output* trust, not the action's risk) and doesn't factor into risk at all.
 */
export function inferWebMcpToolRisk(annotations?: WebMcpToolAnnotations): ToolRisk {
  if (annotations?.readOnlyHint === true) {
    return 'read';
  }
  return 'state_changing';
}
