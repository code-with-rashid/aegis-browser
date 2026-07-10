import { createWebMcpEventBridgeSource } from '@aegis/mcp';
import { createLogger } from '@aegis/shared';
import { defineContentScript } from 'wxt/utils/define-content-script';

import { connectWebMcpTabBridge } from '../messaging/chrome-port';
import type {
  BackgroundToContentWebMcpMessage,
  ContentToBackgroundWebMcpMessage,
} from '../messaging/webmcp-protocol';

const logger = createLogger('webmcp-relay');

/**
 * The ISOLATED-world half of the WebMCP bridge (default world — has real `chrome.*`
 * access, unlike `webmcp-page-bridge.content.ts`'s MAIN-world script). Relays the page's
 * WebMCP tools (and their call results) to the background over a per-tab port
 * (`webmcp-tab-bridge.ts` on the other end), so a running task's `ToolRegistry` can
 * register them (#88) — the composition-root wiring `docs/adr/0035-webmcp-detection-and-adapter.md`
 * deliberately deferred out of #87. Tears itself down cleanly on navigation/tab close via
 * `ctx.onInvalidated` (WXT invalidates a content script's context on both).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    const source = createWebMcpEventBridgeSource(document);
    const port = connectWebMcpTabBridge<
      ContentToBackgroundWebMcpMessage,
      BackgroundToContentWebMcpMessage
    >();

    ctx.onInvalidated(() => {
      source.dispose();
      port.disconnect();
    });

    async function publish(): Promise<void> {
      const result = await source.listTools();
      if (result.ok) {
        port.send({ type: 'WEBMCP_TOOLS', tools: result.value });
        if (result.value.length > 0) {
          logger.info(`Detected ${result.value.length} WebMCP tool(s) on this page`, {
            tools: result.value.map((tool) => tool.name),
          });
        }
      }
    }

    source.onToolsChanged(() => {
      void publish();
    });
    void publish();

    port.onMessage((message) => {
      void (async () => {
        const result = await source.callTool(message.name, message.args);
        port.send(
          result.ok
            ? {
                type: 'WEBMCP_CALL_RESULT',
                requestId: message.requestId,
                ok: true,
                text: result.value.text,
              }
            : {
                type: 'WEBMCP_CALL_RESULT',
                requestId: message.requestId,
                ok: false,
                error: result.error.message,
              },
        );
      })();
    });
  },
});
