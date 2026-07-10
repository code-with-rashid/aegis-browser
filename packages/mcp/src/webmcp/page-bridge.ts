import {
  WEBMCP_CALL_EVENT,
  WEBMCP_REQUEST_SYNC_EVENT,
  WEBMCP_RESULT_EVENT,
  WEBMCP_TOOLS_EVENT,
  type WebMcpCallEventDetail,
  type WebMcpResultEventDetail,
  type WebMcpToolsEventDetail,
} from './bridge-protocol';
import type { WebMcpToolDescriptor } from './webmcp-tool';

/** One tool as `document.modelContext.getTools()` returns it — a live object, not just data, since only this (MAIN-world) side can call its real `execute`. */
interface PageModelContextTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly untrustedContentHint?: boolean;
  };
  execute(input: unknown): unknown;
}

/** The shape of `document.modelContext` this bridge relies on (per the evolving WebMCP spec — https://webmachinelearning.github.io/webmcp/). Declared locally rather than assumed from `lib.dom.d.ts`, which doesn't include it yet. */
interface PageModelContext extends EventTarget {
  getTools(): readonly PageModelContextTool[] | Promise<readonly PageModelContextTool[]>;
}

/** The page-global object a real `document` provides once WebMCP is present (Chrome 150+ uses `document.modelContext`; see `docs/adr/0035-webmcp-detection-and-adapter.md` for why this, not `navigator.modelContext`, is targeted). */
export interface WebMcpCapableTarget extends EventTarget {
  readonly modelContext?: PageModelContext;
}

function toDescriptor(tool: PageModelContextTool): WebMcpToolDescriptor {
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    inputSchema: tool.inputSchema ?? {},
    ...(tool.annotations !== undefined ? { annotations: tool.annotations } : {}),
  };
}

function dispatchTools(target: EventTarget, tools: readonly WebMcpToolDescriptor[]): void {
  const detail: WebMcpToolsEventDetail = { tools };
  target.dispatchEvent(new CustomEvent(WEBMCP_TOOLS_EVENT, { detail }));
}

/**
 * Installs the MAIN-world half of the WebMCP bridge on `target` (a real `document` in the
 * browser). Feature-detects `target.modelContext`: if absent, dispatches a single empty
 * {@link WEBMCP_TOOLS_EVENT} and returns immediately — the "graceful no-op" path, no
 * listeners attached, nothing left running. If present, publishes the page's live tool
 * list (initially, whenever the page's own `toolchange` event fires, and whenever the
 * ISOLATED-world half asks via {@link WEBMCP_REQUEST_SYNC_EVENT}) and answers
 * {@link WEBMCP_CALL_EVENT} requests by invoking the matching tool's real `execute` —
 * the only place that can, since a function reference never crosses the MAIN/ISOLATED
 * world boundary, only the JSON-safe events in `bridge-protocol.ts` do. Returns a cleanup
 * function that removes every listener this installed.
 */
export function installWebMcpPageBridge(target: WebMcpCapableTarget): () => void {
  const modelContext = target.modelContext;
  if (modelContext === undefined) {
    // Still answer sync requests (with an empty list) so an ISOLATED-world half that
    // installs *after* this one never has to wait out its own timeout to learn "no
    // tools" — regardless of which half loads first, the answer is immediate.
    function respondEmpty(): void {
      dispatchTools(target, []);
    }
    target.addEventListener(WEBMCP_REQUEST_SYNC_EVENT, respondEmpty);
    dispatchTools(target, []);
    return () => {
      target.removeEventListener(WEBMCP_REQUEST_SYNC_EVENT, respondEmpty);
    };
  }

  // Reassigned to a plain `const` of the narrowed (never-undefined) type — TS's
  // control-flow narrowing from the guard above doesn't persist into the closures below.
  const context: PageModelContext = modelContext;

  async function publish(): Promise<void> {
    const tools = await context.getTools();
    dispatchTools(target, tools.map(toDescriptor));
  }

  function onToolChange(): void {
    void publish();
  }

  function onRequestSync(): void {
    void publish();
  }

  function onCallRequest(event: Event): void {
    const detail = (event as CustomEvent<WebMcpCallEventDetail>).detail;
    void (async () => {
      // Always re-fetch fresh rather than trust a cached list — a call can arrive before
      // any broadcast has landed, or right after the page's own tool list changed.
      const tools = await context.getTools();
      const tool = tools.find((candidate) => candidate.name === detail.name);
      const result: WebMcpResultEventDetail =
        tool === undefined
          ? {
              requestId: detail.requestId,
              ok: false,
              error: `Unknown WebMCP tool "${detail.name}"`,
            }
          : await callTool(tool, detail);
      target.dispatchEvent(new CustomEvent(WEBMCP_RESULT_EVENT, { detail: result }));
    })();
  }

  async function callTool(
    tool: PageModelContextTool,
    detail: WebMcpCallEventDetail,
  ): Promise<WebMcpResultEventDetail> {
    try {
      const value = await tool.execute(detail.args);
      return {
        requestId: detail.requestId,
        ok: true,
        text: typeof value === 'string' ? value : JSON.stringify(value),
      };
    } catch (cause) {
      return {
        requestId: detail.requestId,
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  modelContext.addEventListener('toolchange', onToolChange);
  target.addEventListener(WEBMCP_REQUEST_SYNC_EVENT, onRequestSync);
  target.addEventListener(WEBMCP_CALL_EVENT, onCallRequest);
  void publish();

  return () => {
    modelContext.removeEventListener('toolchange', onToolChange);
    target.removeEventListener(WEBMCP_REQUEST_SYNC_EVENT, onRequestSync);
    target.removeEventListener(WEBMCP_CALL_EVENT, onCallRequest);
  };
}
