import { createWebMcpEventBridgeSource } from '@aegis/mcp';
import { createLogger } from '@aegis/shared';
import { defineContentScript } from 'wxt/utils/define-content-script';

const logger = createLogger('webmcp-relay');

/**
 * The ISOLATED-world half of the WebMCP bridge (default world — has real `chrome.*`
 * access, unlike `webmcp-page-bridge.content.ts`'s MAIN-world script). Today this proves
 * detection actually works end-to-end in a real browser (not just against the fixture in
 * `@aegis/mcp`'s own tests) and tears itself down cleanly on navigation/tab close via
 * `ctx.onInvalidated` (WXT invalidates a content script's context on both). Relaying
 * detected tools into a running task's `ToolRegistry` is #88's job, once the Navigator
 * actually has a use for them — see `docs/adr/0035-webmcp-detection-and-adapter.md`.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    const source = createWebMcpEventBridgeSource(document);
    ctx.onInvalidated(() => {
      source.dispose();
    });

    void (async () => {
      const result = await source.listTools();
      if (result.ok && result.value.length > 0) {
        logger.info(`Detected ${result.value.length} WebMCP tool(s) on this page`, {
          tools: result.value.map((tool) => tool.name),
        });
      }
    })();
  },
});
