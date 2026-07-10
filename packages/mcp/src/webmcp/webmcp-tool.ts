/**
 * Standard WebMCP tool hints (per the evolving WebMCP spec,
 * https://webmachinelearning.github.io/webmcp/): `readOnlyHint` means the tool never
 * modifies state; `untrustedContentHint` means the tool's *return value* should be
 * treated as untrusted page-derived content by the caller — a separate concern from
 * action risk (`docs/adr/0035-webmcp-detection-and-adapter.md`).
 */
export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

/** One tool as a page declares it via `document.modelContext.registerTool(...)`. */
export interface WebMcpToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: WebMcpToolAnnotations;
}
