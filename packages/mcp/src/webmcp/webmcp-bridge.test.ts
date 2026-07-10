import { isErr, isOk } from '@aegis/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { installWebMcpPageBridge, type WebMcpCapableTarget } from './page-bridge';
import { createWebMcpEventBridgeSource, type WebMcpEventBridgeSource } from './isolated-bridge';

/** A fixture implementing the real WebMCP page-side spec shape (`registerTool`/`unregisterTool`/`getTools`, a `toolchange` event) — not a stand-in for `WebMcpSource`, a stand-in for the *page* the bridge observes. */
interface FixtureTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly annotations?: { readonly readOnlyHint?: boolean };
  execute(input: unknown): unknown;
}

class FixtureModelContext extends EventTarget {
  private readonly tools = new Map<string, FixtureTool>();

  getTools(): readonly FixtureTool[] {
    return [...this.tools.values()];
  }

  registerTool(tool: FixtureTool): void {
    this.tools.set(tool.name, tool);
    this.dispatchEvent(new Event('toolchange'));
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.dispatchEvent(new Event('toolchange'));
  }
}

class FixtureDocument extends EventTarget implements WebMcpCapableTarget {
  modelContext?: FixtureModelContext;
}

let cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups) {
    cleanup();
  }
  cleanups = [];
});

function installBridge(doc: FixtureDocument): WebMcpEventBridgeSource {
  const stopPageBridge = installWebMcpPageBridge(doc);
  const source = createWebMcpEventBridgeSource(doc, { timeoutMs: 200 });
  cleanups.push(stopPageBridge, () => {
    source.dispose();
  });
  return source;
}

describe('the WebMCP page/isolated bridge, end to end on a fixture page', () => {
  it('detects and wraps a tool the page declares via WebMCP', async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    doc.modelContext.registerTool({
      name: 'add_to_cart',
      description: 'Adds an item to the cart',
      inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
      execute: (input) => `added ${(input as { sku: string }).sku}`,
    });
    const source = installBridge(doc);

    const toolsResult = await source.listTools();

    expect(isOk(toolsResult) && toolsResult.value).toEqual([
      {
        name: 'add_to_cart',
        description: 'Adds an item to the cart',
        inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
      },
    ]);
  });

  it('is a clean, silent fallback on a page with no WebMCP tools at all', async () => {
    const doc = new FixtureDocument();
    // doc.modelContext deliberately left undefined — WebMCP absent on this page.
    const source = installBridge(doc);

    const toolsResult = await source.listTools();

    expect(isOk(toolsResult) && toolsResult.value).toEqual([]);
  });

  it('calls the real page-side execute function and returns its result', async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    doc.modelContext.registerTool({
      name: 'add_to_cart',
      inputSchema: {},
      execute: (input) => `added ${(input as { sku: string }).sku}`,
    });
    const source = installBridge(doc);

    const callResult = await source.callTool('add_to_cart', { sku: 'oat-milk' });

    expect(isOk(callResult) && callResult.value).toEqual({
      isError: false,
      text: 'added oat-milk',
    });
  });

  it('reports an error result for an unknown tool name, without throwing', async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    const source = installBridge(doc);

    const callResult = await source.callTool('does_not_exist', {});

    expect(isErr(callResult) && callResult.error.message).toBe(
      'Unknown WebMCP tool "does_not_exist"',
    );
  });

  it("surfaces the page's own execute throwing as an error result, without throwing itself", async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    doc.modelContext.registerTool({
      name: 'broken',
      inputSchema: {},
      execute: () => {
        throw new Error('page tool exploded');
      },
    });
    const source = installBridge(doc);

    const callResult = await source.callTool('broken', {});

    expect(isErr(callResult) && callResult.error.message).toBe('page tool exploded');
  });

  it("tracks the page's live tool list — a tool registered after startup is detected via toolchange", async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    const source = installBridge(doc);
    await source.listTools();

    let changeFired = false;
    source.onToolsChanged(() => {
      changeFired = true;
    });
    doc.modelContext.registerTool({ name: 'checkout', inputSchema: {}, execute: () => 'done' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(changeFired).toBe(true);
    const toolsResult = await source.listTools();
    expect(isOk(toolsResult) && toolsResult.value.map((tool) => tool.name)).toEqual(['checkout']);
  });

  it('a tool unregistered by the page disappears from the tool list', async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    doc.modelContext.registerTool({ name: 'checkout', inputSchema: {}, execute: () => 'done' });
    const source = installBridge(doc);
    await source.listTools();

    doc.modelContext.unregisterTool('checkout');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toolsResult = await source.listTools();
    expect(isOk(toolsResult) && toolsResult.value).toEqual([]);
  });

  it('dispose() stops the isolated half from observing further page changes', async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    const stopPageBridge = installWebMcpPageBridge(doc);
    const source = createWebMcpEventBridgeSource(doc, { timeoutMs: 200 });
    await source.listTools();

    let changeFired = false;
    source.onToolsChanged(() => {
      changeFired = true;
    });
    source.dispose();
    doc.modelContext.registerTool({ name: 'checkout', inputSchema: {}, execute: () => 'done' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(changeFired).toBe(false);
    stopPageBridge();
  });

  it('installs correctly regardless of which half installs first', async () => {
    const doc = new FixtureDocument();
    doc.modelContext = new FixtureModelContext();
    doc.modelContext.registerTool({ name: 'checkout', inputSchema: {}, execute: () => 'done' });

    // Isolated half installs first this time, unlike every other test above.
    const source = createWebMcpEventBridgeSource(doc, { timeoutMs: 200 });
    const stopPageBridge = installWebMcpPageBridge(doc);
    cleanups.push(stopPageBridge, () => {
      source.dispose();
    });

    const toolsResult = await source.listTools();
    expect(isOk(toolsResult) && toolsResult.value.map((tool) => tool.name)).toEqual(['checkout']);
  });
});
