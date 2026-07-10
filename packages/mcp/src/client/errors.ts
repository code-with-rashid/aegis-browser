import { AegisError } from '@aegis/shared';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export type McpClientErrorCode =
  | 'MCP_NOT_CONNECTED'
  | 'MCP_CONNECTION_FAILED'
  | 'MCP_TIMEOUT'
  | 'MCP_CANCELLED'
  | 'MCP_PROTOCOL_ERROR';

/** Typed error raised by {@link McpClient} (`client/mcp-client.ts`) — never a thrown string. */
export class McpClientError extends AegisError {
  readonly code: McpClientErrorCode;

  constructor(code: McpClientErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

/**
 * True when an `McpError` with `RequestTimeout` was actually caused by the caller's own
 * `AbortSignal` firing, not the request genuinely timing out. The SDK reports both
 * through the identical error code (`ErrorCode.RequestTimeout`, -32001) — the *message*
 * is the only signal that distinguishes them (`"Request timed out"` vs. `"AbortError:
 * This operation was aborted"`), so this is necessarily a text check, not a structural
 * one.
 */
function isAbortDisguisedAsTimeout(cause: McpError): boolean {
  return /abort/i.test(cause.message);
}

/**
 * True when a schema-validating response failed to conform to the MCP protocol (e.g. a
 * non-MCP HTTP server answering on the configured URL) — a genuine protocol-level
 * problem, distinct from a network-level connection failure.
 */
function isProtocolValidationError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'ZodError';
}

/**
 * Classifies an error thrown by the `@modelcontextprotocol/sdk` client into a
 * {@link McpClientError}: a genuine `RequestTimeout` becomes `MCP_TIMEOUT`, the *same*
 * error code caused by the caller's own `AbortSignal` becomes `MCP_CANCELLED` instead
 * (see {@link isAbortDisguisedAsTimeout}), any other `McpError` or a response that fails
 * MCP schema validation becomes `MCP_PROTOCOL_ERROR`, and anything else (network
 * failure, connection refused, DNS failure) becomes `MCP_CONNECTION_FAILED` — the
 * fail-safe default for an unrecognized failure shape. Never includes request headers
 * (auth tokens) in the resulting message — only the SDK's own error text.
 */
const REQUEST_TIMEOUT_CODE: number = ErrorCode.RequestTimeout;

export function toMcpClientError(cause: unknown): McpClientError {
  if (cause instanceof McpError) {
    if (cause.code === REQUEST_TIMEOUT_CODE) {
      return isAbortDisguisedAsTimeout(cause)
        ? new McpClientError('MCP_CANCELLED', 'The MCP request was cancelled', { cause })
        : new McpClientError('MCP_TIMEOUT', cause.message, { cause });
    }
    return new McpClientError('MCP_PROTOCOL_ERROR', cause.message, { cause });
  }
  if (isAbortError(cause)) {
    return new McpClientError('MCP_CANCELLED', 'The MCP request was cancelled', { cause });
  }
  if (isProtocolValidationError(cause)) {
    return new McpClientError(
      'MCP_PROTOCOL_ERROR',
      'The server response did not conform to the MCP protocol',
      { cause },
    );
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return new McpClientError('MCP_CONNECTION_FAILED', message, { cause });
}
