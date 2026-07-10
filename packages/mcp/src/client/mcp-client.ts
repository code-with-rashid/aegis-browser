import { err, ok, type Result } from '@aegis/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { McpClientError, toMcpClientError } from './errors';

const CLIENT_IDENTITY = { name: 'aegis-browser', version: '0.1.0' };

/**
 * How to reach one MCP server. A browser extension cannot spawn stdio processes, so
 * `url` must be an HTTP(S) endpoint speaking the MCP **Streamable HTTP** transport — no
 * other transport is supported (`docs/adr/0031-mcp-client-streamable-http.md`).
 */
export interface McpServerConfig {
  readonly url: string;
  /** Extra HTTP headers (e.g. `Authorization`) sent with every request — resolved from the vault by the caller (#84), never logged here. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Standard MCP tool hints (`docs/adr/0033-mcp-tool-registration.md`): `readOnlyHint`
 * means the tool never modifies state; `destructiveHint` means it can (irreversibly).
 * A server that declares neither leaves risk unknown — callers must fail safe.
 */
export interface McpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
}

/** One tool as an MCP server declares it — `inputSchema` is the raw JSON Schema object the server returned. */
export interface McpToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: McpToolAnnotations;
}

/** A single text content block — the only content type this client surfaces today (see {@link McpToolCallResult}). */
export interface McpTextContent {
  readonly type: 'text';
  readonly text: string;
}

/**
 * The result of calling one MCP tool. `isError` is the protocol's own signal that the
 * *tool* failed (not the RPC call itself — that failure path is a `McpClientError`
 * instead). Only `text` content blocks are surfaced; image/audio/resource blocks are
 * dropped rather than partially represented, since nothing in this codebase consumes
 * them yet.
 */
export interface McpToolCallResult {
  readonly isError: boolean;
  readonly content: readonly McpTextContent[];
}

/** A server asking the human (via the client) for input mid-call — MCP's "elicitation" feature. */
export interface ElicitationRequest {
  readonly message: string;
  /** The JSON Schema (always `type: "object"`) describing the requested fields. */
  readonly requestedSchema: Record<string, unknown>;
}

export interface ElicitationResponse {
  readonly action: 'accept' | 'decline' | 'cancel';
  /** Present only when `action` is `"accept"`. */
  readonly content?: Record<string, string | number | boolean | readonly string[]>;
}

/**
 * Answers one {@link ElicitationRequest}. The real implementation (composition root)
 * routes this through the same human-input/confirmation UI a state-changing tool call
 * already uses; a test supplies a trivial fake. Declining to configure this at all
 * (`CreateMcpClientOptions.onElicitationRequest` omitted) means the client never
 * advertises the `elicitation` capability, so a well-behaved server simply won't ask.
 */
export type ElicitationHandler = (request: ElicitationRequest) => Promise<ElicitationResponse>;

export interface CreateMcpClientOptions {
  /** Per-request timeout, in ms. Falls back to the SDK's own default (60s) when omitted. */
  readonly timeoutMs?: number;
  readonly onElicitationRequest?: ElicitationHandler;
}

/**
 * A connection to one MCP server, over Streamable HTTP only. Every method returns a
 * typed `Result` — never throws — so a hallucinated/unreachable/misbehaving server
 * degrades to a normal error the agent loop can handle, not an uncaught exception.
 */
export interface McpClient {
  /** Connects and completes the MCP initialization handshake. Must succeed before any other method is called. */
  connect(signal?: AbortSignal): Promise<Result<void, McpClientError>>;
  listTools(signal?: AbortSignal): Promise<Result<readonly McpToolDescriptor[], McpClientError>>;
  callTool(
    name: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<Result<McpToolCallResult, McpClientError>>;
  /** Closes the connection. Safe to call even if never connected. */
  disconnect(): Promise<void>;
}

function toDescriptor(tool: {
  name: string;
  description?: string | undefined;
  inputSchema: unknown;
  annotations?:
    { readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined } | undefined;
}): McpToolDescriptor {
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
    ...(tool.annotations !== undefined
      ? {
          annotations: {
            ...(tool.annotations.readOnlyHint !== undefined
              ? { readOnlyHint: tool.annotations.readOnlyHint }
              : {}),
            ...(tool.annotations.destructiveHint !== undefined
              ? { destructiveHint: tool.annotations.destructiveHint }
              : {}),
          },
        }
      : {}),
  };
}

function toTextContent(
  content: readonly { type: string; text?: string }[],
): readonly McpTextContent[] {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => ({ type: 'text' as const, text: block.text }));
}

/**
 * Builds an {@link McpClient} for `config`. Nothing connects until {@link McpClient.connect}
 * is called. `options.timeoutMs` applies to every request (connect/listTools/callTool);
 * a caller-provided `AbortSignal` is honored in addition to (not instead of) that timeout.
 */
export function createMcpClient(
  config: McpServerConfig,
  options: CreateMcpClientOptions = {},
): McpClient {
  let client: Client | undefined;

  function requestOptions(signal?: AbortSignal): RequestOptions {
    return {
      ...(signal !== undefined ? { signal } : {}),
      ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
    };
  }

  return {
    async connect(signal) {
      const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        ...(config.headers !== undefined ? { requestInit: { headers: config.headers } } : {}),
      });
      const elicitationHandler = options.onElicitationRequest;
      const newClient = new Client(CLIENT_IDENTITY, {
        capabilities: elicitationHandler !== undefined ? { elicitation: {} } : {},
      });
      if (elicitationHandler !== undefined) {
        // The SDK's declared return type for this handler also covers its newer
        // task-based execution mode (an unrelated response shape a simple form-mode
        // reply never needs to satisfy) and is loose (`z.core.$loose`) about extra keys
        // regardless, so every branch casts through `unknown` to the same loose shape.
        newClient.setRequestHandler(ElicitRequestSchema, async (request) => {
          // Only form-mode elicitation carries a `requestedSchema` — URL-mode asks the
          // client to navigate somewhere instead, which this codebase doesn't support;
          // decline immediately rather than mishandle it.
          if (!('requestedSchema' in request.params)) {
            const declined: ElicitationResponse = { action: 'decline' };
            return declined as unknown as Record<string, unknown>;
          }
          const response = await elicitationHandler({
            message: request.params.message,
            requestedSchema: request.params.requestedSchema,
          });
          return response as unknown as Record<string, unknown>;
        });
      }
      try {
        // The SDK's own .d.ts wasn't built with exactOptionalPropertyTypes, so its
        // Transport interface and StreamableHTTPClientTransport's `sessionId` getter
        // disagree on `string | undefined` vs `string` under our stricter setting.
        await newClient.connect(transport as Transport, requestOptions(signal));
      } catch (cause) {
        return err(toMcpClientError(cause));
      }
      client = newClient;
      return ok(undefined);
    },

    async listTools(signal) {
      if (!client) {
        return err(new McpClientError('MCP_NOT_CONNECTED', 'Not connected — call connect() first'));
      }
      try {
        const result = await client.listTools(undefined, requestOptions(signal));
        return ok(result.tools.map(toDescriptor));
      } catch (cause) {
        return err(toMcpClientError(cause));
      }
    },

    async callTool(name, args, signal) {
      if (!client) {
        return err(new McpClientError('MCP_NOT_CONNECTED', 'Not connected — call connect() first'));
      }
      try {
        const result = await client.callTool(
          { name, arguments: args as Record<string, unknown> | undefined },
          CallToolResultSchema,
          requestOptions(signal),
        );
        // `result.content` is well-typed in the SDK's own .d.ts, but its generic
        // resolution collapses to `unknown` at this call site under our stricter
        // compiler settings — narrowed to the shape `toTextContent` actually reads.
        const content = result.content as readonly { type: string; text?: string }[];
        return ok({
          isError: result.isError === true,
          content: toTextContent(content),
        });
      } catch (cause) {
        return err(toMcpClientError(cause));
      }
    },

    async disconnect() {
      if (client) {
        const closing = client;
        client = undefined;
        await closing.close();
      }
    },
  };
}
