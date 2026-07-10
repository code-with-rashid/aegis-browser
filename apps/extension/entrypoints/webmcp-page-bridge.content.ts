import { installWebMcpPageBridge } from '@aegis/mcp';
import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  // Must run in the page's own JS realm — only there does `document.modelContext`
  // (if the page declares any WebMCP tools) actually exist. The ISOLATED-world half
  // (`webmcp-relay.content.ts`) can only reach this data via the event bridge in
  // `@aegis/mcp`'s `bridge-protocol.ts`, never by touching `document.modelContext`
  // itself. See `docs/adr/0035-webmcp-detection-and-adapter.md`.
  world: 'MAIN',
  main() {
    // `document.modelContext` isn't part of `lib.dom.d.ts` yet (the spec is an active
    // origin trial), so `WebMcpCapableTarget` declares it as an optional property —
    // `document` satisfies that structurally whether or not a given page actually has
    // one; `installWebMcpPageBridge` itself feature-detects the rest at runtime.
    installWebMcpPageBridge(document);
  },
});
