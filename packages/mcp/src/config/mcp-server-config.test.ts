import { describe, expect, it } from 'vitest';

import { McpServerConnectionConfigSchema } from './mcp-server-config';

describe('McpServerConnectionConfigSchema', () => {
  it('parses a well-formed config', () => {
    const result = McpServerConnectionConfigSchema.safeParse({
      url: 'https://mcp.example.com/mcp',
      name: 'Example server',
      authHeaders: [{ name: 'Authorization', secretName: 'my-token' }],
      enabled: true,
    });

    expect(result.success).toBe(true);
  });

  it('defaults authHeaders to an empty array when omitted', () => {
    const result = McpServerConnectionConfigSchema.safeParse({
      url: 'https://mcp.example.com/mcp',
      name: 'Example server',
      enabled: false,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.authHeaders).toEqual([]);
  });

  it('rejects a non-URL', () => {
    const result = McpServerConnectionConfigSchema.safeParse({
      url: 'not-a-url',
      name: 'Example server',
      enabled: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = McpServerConnectionConfigSchema.safeParse({
      url: 'https://mcp.example.com/mcp',
      name: '',
      enabled: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an auth header missing a secretName', () => {
    const result = McpServerConnectionConfigSchema.safeParse({
      url: 'https://mcp.example.com/mcp',
      name: 'Example server',
      authHeaders: [{ name: 'Authorization' }],
      enabled: true,
    });

    expect(result.success).toBe(false);
  });
});
