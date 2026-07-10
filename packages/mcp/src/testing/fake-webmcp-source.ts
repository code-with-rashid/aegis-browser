import { err, ok } from '@aegis/shared';

import type { WebMcpSource, WebMcpToolCallResult } from '../webmcp/webmcp-source';
import type { WebMcpToolAnnotations } from '../webmcp/webmcp-tool';

/** One tool a {@link FakeWebMcpSource} exposes — the in-memory test double for a page's `document.modelContext`. */
export interface FakeWebMcpToolSpec {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly annotations?: WebMcpToolAnnotations;
  handler(args: unknown): WebMcpToolCallResult | Promise<WebMcpToolCallResult>;
}

export interface FakeWebMcpSource extends WebMcpSource {
  /** Simulates the page calling `registerTool`/`unregisterTool` again — fires every `onToolsChanged` listener, same as a real page's `ontoolchange`. */
  setTools(tools: readonly FakeWebMcpToolSpec[]): void;
}

/** A trivial `isError: false` result — matches what a real WebMCP tool's `execute` returning plain text would surface. */
export function webMcpTextResult(text: string, isError = false): WebMcpToolCallResult {
  return { isError, text };
}

/**
 * An in-memory {@link WebMcpSource} — for domain-level tests of `registerWebMcpTools`
 * that don't need to exercise the real DOM/content-script bridge (that's covered
 * separately, against a real `document.modelContext`-shaped fixture, via `webmcp/page-bridge.ts`'s own tests).
 */
export function createFakeWebMcpSource(
  initialTools: readonly FakeWebMcpToolSpec[] = [],
): FakeWebMcpSource {
  let tools = initialTools;
  const listeners = new Set<() => void>();

  return {
    listTools() {
      return Promise.resolve(
        ok(
          tools.map((tool) => ({
            name: tool.name,
            ...(tool.description !== undefined ? { description: tool.description } : {}),
            inputSchema: tool.inputSchema ?? {},
            ...(tool.annotations !== undefined ? { annotations: tool.annotations } : {}),
          })),
        ),
      );
    },

    async callTool(name, args) {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) {
        return err({ message: `Unknown WebMCP tool "${name}"` });
      }
      return ok(await tool.handler(args));
    },

    onToolsChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setTools(next) {
      tools = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
