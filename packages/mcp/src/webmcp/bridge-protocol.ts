import type { WebMcpToolDescriptor } from './webmcp-tool';

/**
 * The event-based protocol between the two halves of the WebMCP bridge — a MAIN-world
 * script (`page-bridge.ts`, has real access to the page's `document.modelContext`) and an
 * ISOLATED-world script (`isolated-bridge.ts`, has real access to `chrome.*`) — both
 * dispatched/observed on the same shared `EventTarget` (a real browser's `document` is
 * visible to both worlds; see `docs/adr/0035-webmcp-detection-and-adapter.md`). A function
 * reference (a tool's live `execute`) can't cross this boundary — only the JSON-safe
 * payloads below can — so every call is a request/response pair correlated by `requestId`.
 */
export const WEBMCP_TOOLS_EVENT = 'aegis:webmcp-tools';
export const WEBMCP_REQUEST_SYNC_EVENT = 'aegis:webmcp-request-sync';
export const WEBMCP_CALL_EVENT = 'aegis:webmcp-call-tool';
export const WEBMCP_RESULT_EVENT = 'aegis:webmcp-call-result';

/** Dispatched by the MAIN-world bridge whenever the page's tool list is known (initially, on `ontoolchange`, and in response to {@link WEBMCP_REQUEST_SYNC_EVENT}). */
export interface WebMcpToolsEventDetail {
  readonly tools: readonly WebMcpToolDescriptor[];
}

/** Dispatched by the ISOLATED-world bridge to ask for an immediate resync — handles the case where it installs before the MAIN-world bridge has published anything yet. */
export type WebMcpRequestSyncEventDetail = Record<string, never>;

/** Dispatched by the ISOLATED-world bridge to invoke a tool the MAIN-world bridge is the only one able to call (only it holds the live `execute` reference). */
export interface WebMcpCallEventDetail {
  readonly requestId: string;
  readonly name: string;
  readonly args: unknown;
}

/** Dispatched by the MAIN-world bridge in response to a {@link WebMcpCallEventDetail}. */
export type WebMcpResultEventDetail =
  | { readonly requestId: string; readonly ok: true; readonly text: string }
  | { readonly requestId: string; readonly ok: false; readonly error: string };
