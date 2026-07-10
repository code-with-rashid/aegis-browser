import type { WebMcpToolDescriptor } from '@aegis/mcp';

/** The port name a WebMCP content script connects on — one connection per tab, distinct from the side panel's `RUN_BRIDGE_PORT_NAME`. */
export const WEBMCP_TAB_PORT_NAME = 'aegis-webmcp-tab-bridge';

/**
 * Messages the content script (`webmcp-relay.content.ts`) sends to the background.
 * `WEBMCP_TOOLS` is sent once the ISOLATED-world bridge resolves its first snapshot, and
 * again every time the page's own tool list changes (`onToolsChanged`).
 */
export type ContentToBackgroundWebMcpMessage =
  | { readonly type: 'WEBMCP_TOOLS'; readonly tools: readonly WebMcpToolDescriptor[] }
  | {
      readonly type: 'WEBMCP_CALL_RESULT';
      readonly requestId: string;
      readonly ok: true;
      readonly text: string;
    }
  | {
      readonly type: 'WEBMCP_CALL_RESULT';
      readonly requestId: string;
      readonly ok: false;
      readonly error: string;
    };

/** The one message the background ever sends back — a request to invoke a tool the content script's own bridge already knows about. */
export interface BackgroundToContentWebMcpMessage {
  readonly type: 'WEBMCP_CALL_TOOL';
  readonly requestId: string;
  readonly name: string;
  readonly args: unknown;
}
