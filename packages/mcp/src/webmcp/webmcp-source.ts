import type { Result } from '@aegis/shared';

import type { WebMcpToolDescriptor } from './webmcp-tool';

/** A plain, structural error shape — matches `SecretResolveError`'s "no exotic error class" convention (`config/resolve-headers.ts`). */
export interface WebMcpSourceError {
  readonly message: string;
}

export interface WebMcpToolCallResult {
  readonly isError: boolean;
  readonly text: string;
}

/**
 * A live connection to one page's WebMCP tools — implemented by a real content-script
 * bridge in `apps/extension` (a page's `document.modelContext` never lives in this
 * package, which stays browser-agnostic) and by a fake in tests. Mirrors `McpClient`'s
 * shape so the two tool sources feel consistent, even though WebMCP has no
 * connect/disconnect step — the page itself is the "connection."
 */
export interface WebMcpSource {
  listTools(): Promise<Result<readonly WebMcpToolDescriptor[], WebMcpSourceError>>;
  callTool(name: string, args: unknown): Promise<Result<WebMcpToolCallResult, WebMcpSourceError>>;
  /** Subscribes to the page's own tool list changing (the spec's `ontoolchange`). Returns an unsubscribe function. */
  onToolsChanged(listener: () => void): () => void;
}
