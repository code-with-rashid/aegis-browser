import type { Result, StorageError } from '@aegis/shared';
import { isErr, ok } from '@aegis/shared';

import type { McpToolDescriptor } from '../client/mcp-client';
import { buildMcpToolId } from '../registry/tool-id';
import type { McpToolPolicyStore } from './mcp-tool-policy-store';

export interface McpToolGateResult {
  readonly allowed: readonly McpToolDescriptor[];
  /** Tool ids seen for the first time this call — auto-recorded `mode: "deny"` (pending explicit opt-in) and excluded from `allowed`. */
  readonly newlyDiscoveredToolIds: readonly string[];
}

/**
 * Deny-by-default admission gate (#86): a tool id never seen before is recorded
 * `mode: "deny"` in `policyStore` (pending explicit opt-in) and excluded; a tool id
 * explicitly denied stays excluded; only a tool id with a stored `mode: "allow"` policy
 * is let through. No MCP tool is ever auto-trusted — a server exposing a new tool between
 * sessions doesn't change what's callable until a human explicitly allows it.
 */
export async function gateMcpTools(
  serverIdSegment: string,
  descriptors: readonly McpToolDescriptor[],
  policyStore: McpToolPolicyStore,
): Promise<Result<McpToolGateResult, StorageError>> {
  const allowed: McpToolDescriptor[] = [];
  const newlyDiscoveredToolIds: string[] = [];

  for (const descriptor of descriptors) {
    const toolId = buildMcpToolId(serverIdSegment, descriptor.name);
    const existing = await policyStore.getPolicy(toolId);
    if (isErr(existing)) {
      return existing;
    }

    if (existing.value === undefined) {
      const recorded = await policyStore.setPolicy({ toolId, mode: 'deny' });
      if (isErr(recorded)) {
        return recorded;
      }
      newlyDiscoveredToolIds.push(toolId);
      continue;
    }

    if (existing.value.mode === 'allow') {
      allowed.push(descriptor);
    }
  }

  return ok({ allowed, newlyDiscoveredToolIds });
}
