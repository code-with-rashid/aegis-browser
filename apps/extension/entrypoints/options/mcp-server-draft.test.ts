import { describe, expect, it } from 'vitest';

import {
  draftFromConfig,
  EMPTY_MCP_SERVER_DRAFT,
  toMcpServerConfig,
  type McpServerDraft,
} from './mcp-server-draft';

describe('toMcpServerConfig', () => {
  it('builds a valid config with no auth header when none is given', () => {
    const draft: McpServerDraft = {
      ...EMPTY_MCP_SERVER_DRAFT,
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
    };
    expect(toMcpServerConfig(draft)).toEqual({
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      authHeaders: [],
      enabled: true,
    });
  });

  it('includes an auth header only when both its name and secret name are given', () => {
    const draft: McpServerDraft = {
      ...EMPTY_MCP_SERVER_DRAFT,
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      authHeaderName: 'Authorization',
      authHeaderSecretName: 'example_token',
    };
    expect(toMcpServerConfig(draft)?.authHeaders).toEqual([
      { name: 'Authorization', secretName: 'example_token' },
    ]);
  });

  it('omits a partially-filled-in auth header', () => {
    const draft: McpServerDraft = {
      ...EMPTY_MCP_SERVER_DRAFT,
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      authHeaderName: 'Authorization',
      authHeaderSecretName: '',
    };
    expect(toMcpServerConfig(draft)?.authHeaders).toEqual([]);
  });

  it('trims surrounding whitespace from url and name', () => {
    const draft: McpServerDraft = {
      ...EMPTY_MCP_SERVER_DRAFT,
      url: '  https://mcp.example.com/mcp  ',
      name: '  Example  ',
    };
    expect(toMcpServerConfig(draft)).toEqual({
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      authHeaders: [],
      enabled: true,
    });
  });

  it('returns undefined for an unparseable URL', () => {
    const draft: McpServerDraft = { ...EMPTY_MCP_SERVER_DRAFT, url: 'not a url', name: 'Example' };
    expect(toMcpServerConfig(draft)).toBeUndefined();
  });

  it('returns undefined for an empty name', () => {
    const draft: McpServerDraft = {
      ...EMPTY_MCP_SERVER_DRAFT,
      url: 'https://mcp.example.com/mcp',
      name: '',
    };
    expect(toMcpServerConfig(draft)).toBeUndefined();
  });

  it('carries the enabled flag through', () => {
    const draft: McpServerDraft = {
      ...EMPTY_MCP_SERVER_DRAFT,
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      enabled: false,
    };
    expect(toMcpServerConfig(draft)?.enabled).toBe(false);
  });
});

describe('draftFromConfig', () => {
  it('round-trips a config with no auth headers', () => {
    const draft = draftFromConfig({
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      authHeaders: [],
      enabled: true,
    });
    expect(draft).toEqual({
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      enabled: true,
      authHeaderName: '',
      authHeaderSecretName: '',
    });
  });

  it('round-trips a config with an auth header', () => {
    const draft = draftFromConfig({
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      authHeaders: [{ name: 'Authorization', secretName: 'example_token' }],
      enabled: false,
    });
    expect(draft).toEqual({
      url: 'https://mcp.example.com/mcp',
      name: 'Example',
      enabled: false,
      authHeaderName: 'Authorization',
      authHeaderSecretName: 'example_token',
    });
  });
});
