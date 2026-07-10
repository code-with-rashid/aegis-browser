/**
 * Test-only doubles, kept out of the main `@aegis/mcp` entry point (`src/index.ts`) so a
 * real browser consumer (`apps/extension`'s WebMCP content scripts) never transitively
 * bundles `mock-mcp-server.ts`'s real Node HTTP server (`node:http`/`node:crypto`) — see
 * `docs/adr/0035-webmcp-detection-and-adapter.md`. Import from `@aegis/mcp/testing`.
 */
export type { MockMcpToolSpec, MockMcpServer } from './mock-mcp-server';
export { startMockMcpServer, textResult } from './mock-mcp-server';

export type { FakeWebMcpToolSpec, FakeWebMcpSource } from './fake-webmcp-source';
export { createFakeWebMcpSource, webMcpTextResult } from './fake-webmcp-source';
