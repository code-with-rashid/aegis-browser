import type { WebMcpToolDescriptor } from '@aegis/mcp';
import { isErr, isOk } from '@aegis/shared';
import { describe, expect, it } from 'vitest';

import { createFakePortPair } from '../messaging/fake-port';
import type {
  BackgroundToContentWebMcpMessage,
  ContentToBackgroundWebMcpMessage,
} from '../messaging/webmcp-protocol';
import { createWebMcpTabBridge } from './webmcp-tab-bridge';

function fixtureTool(name: string): WebMcpToolDescriptor {
  return { name, inputSchema: {} };
}

function connectFakeTab(bridge: ReturnType<typeof createWebMcpTabBridge>, tabId: number) {
  const { a: background, b: contentScript } = createFakePortPair<
    BackgroundToContentWebMcpMessage,
    ContentToBackgroundWebMcpMessage
  >();
  bridge.registerPort(tabId, background);
  return contentScript;
}

describe('createWebMcpTabBridge', () => {
  it('resolves to no tools for a tab with no connected content script', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 50 });

    const result = await bridge.getSource(1).listTools();

    expect(isOk(result) && result.value).toEqual([]);
  });

  it("returns the content script's already-sent tool list immediately", async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 200 });
    const contentScript = connectFakeTab(bridge, 1);
    contentScript.send({ type: 'WEBMCP_TOOLS', tools: [fixtureTool('add_to_cart')] });

    const result = await bridge.getSource(1).listTools();

    expect(isOk(result) && result.value).toEqual([fixtureTool('add_to_cart')]);
  });

  it('waits for the first snapshot when listTools() is called before one arrives', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 500 });
    const contentScript = connectFakeTab(bridge, 1);

    const pending = bridge.getSource(1).listTools();
    contentScript.send({ type: 'WEBMCP_TOOLS', tools: [fixtureTool('checkout')] });
    const result = await pending;

    expect(isOk(result) && result.value).toEqual([fixtureTool('checkout')]);
  });

  it('fails safe to no tools if nothing answers within the timeout', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 30 });
    connectFakeTab(bridge, 1);

    const result = await bridge.getSource(1).listTools();

    expect(isOk(result) && result.value).toEqual([]);
  });

  it('fires onToolsChanged for a tool-list update after the first snapshot, not for the first one', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 200 });
    const contentScript = connectFakeTab(bridge, 1);
    contentScript.send({ type: 'WEBMCP_TOOLS', tools: [fixtureTool('checkout')] });
    await bridge.getSource(1).listTools();

    let changeCount = 0;
    bridge.getSource(1).onToolsChanged(() => {
      changeCount += 1;
    });
    contentScript.send({
      type: 'WEBMCP_TOOLS',
      tools: [fixtureTool('checkout'), fixtureTool('add_to_cart')],
    });

    expect(changeCount).toBe(1);
  });

  it('calls a tool by sending a request over the port and resolving the correlated result', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 200 });
    const contentScript = connectFakeTab(bridge, 1);
    const received: BackgroundToContentWebMcpMessage[] = [];
    contentScript.onMessage((message) => received.push(message));

    const pending = bridge.getSource(1).callTool('add_to_cart', { sku: 'oat-milk' });
    expect(received).toHaveLength(1);
    const request = received[0];
    expect(request?.type).toBe('WEBMCP_CALL_TOOL');
    expect(request?.name).toBe('add_to_cart');
    contentScript.send({
      type: 'WEBMCP_CALL_RESULT',
      requestId: request?.requestId ?? '',
      ok: true,
      text: 'added oat-milk',
    });

    const result = await pending;
    expect(isOk(result) && result.value).toEqual({ isError: false, text: 'added oat-milk' });
  });

  it('surfaces a call-result error without throwing', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 200 });
    const contentScript = connectFakeTab(bridge, 1);
    contentScript.onMessage((message) => {
      contentScript.send({
        type: 'WEBMCP_CALL_RESULT',
        requestId: message.requestId,
        ok: false,
        error: 'boom',
      });
    });

    const result = await bridge.getSource(1).callTool('broken', {});

    expect(isErr(result) && result.error.message).toBe('boom');
  });

  it('fails safe when calling a tool for a tab with no connected content script', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 50 });

    const result = await bridge.getSource(1).callTool('add_to_cart', {});

    expect(isErr(result) && result.error.message).toContain('No WebMCP bridge connected');
  });

  it('times out a call that never gets a result', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 30 });
    connectFakeTab(bridge, 1);

    const result = await bridge.getSource(1).callTool('add_to_cart', {});

    expect(isErr(result) && result.error.message).toContain('Timed out');
  });

  it('resets to no tools when the content script disconnects', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 30 });
    const contentScript = connectFakeTab(bridge, 1);
    contentScript.send({ type: 'WEBMCP_TOOLS', tools: [fixtureTool('checkout')] });
    await bridge.getSource(1).listTools();

    contentScript.disconnect();
    const result = await bridge.getSource(1).listTools();

    expect(isOk(result) && result.value).toEqual([]);
  });

  it('keeps different tabs independent', async () => {
    const bridge = createWebMcpTabBridge({ timeoutMs: 200 });
    const tab1 = connectFakeTab(bridge, 1);
    const tab2 = connectFakeTab(bridge, 2);
    tab1.send({ type: 'WEBMCP_TOOLS', tools: [fixtureTool('checkout')] });
    tab2.send({ type: 'WEBMCP_TOOLS', tools: [] });

    const result1 = await bridge.getSource(1).listTools();
    const result2 = await bridge.getSource(2).listTools();

    expect(isOk(result1) && result1.value).toEqual([fixtureTool('checkout')]);
    expect(isOk(result2) && result2.value).toEqual([]);
  });
});
