/** Namespaces a server's display name into an id-safe segment, e.g. `"My Server!"` → `"my_server"`. */
export function toIdSegment(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'server';
}

/** Builds a namespaced `Tool.id` for one MCP tool — shared by tool registration and tool-policy gating so both agree on the exact same id for the exact same tool. */
export function buildMcpToolId(serverIdSegment: string, toolName: string): string {
  return `mcp.${serverIdSegment}.${toolName}`;
}
