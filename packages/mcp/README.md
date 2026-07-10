# @aegis/mcp

An `McpClient` for connecting to external MCP (Model Context Protocol) servers and
calling their tools, user-facing server configuration + storage, plus a WebMCP page-tool
adapter (#87, not yet built). Not wired into `@aegis/agent`'s `ToolRegistry` yet — that's
#85.

## Transport: Streamable HTTP only

A browser extension **cannot spawn stdio processes** (no child process API), so an MCP
server must be reachable over **Streamable HTTP** — the same URL/headers a `fetch()` call
would use. `createMcpClient` only ever constructs a
`StreamableHTTPClientTransport` (`@modelcontextprotocol/sdk`); there is no stdio path,
and none is planned. See `docs/adr/0031-mcp-client-streamable-http.md`.

## `McpClient` (`client/mcp-client.ts`)

```ts
const client = createMcpClient(
  { url: 'https://mcp.example.com/mcp', headers: { Authorization: `Bearer ${token}` } },
  { timeoutMs: 10_000 },
);

const connected = await client.connect();
const tools = await client.listTools();
const result = await client.callTool('search', { query: 'oat milk' });
await client.disconnect();
```

Every method returns a `Result<T, McpClientError>` — never throws — so a hallucinated
tool name, an unreachable server, or a misbehaving one all degrade to a normal typed
error the agent loop can handle:

- `MCP_NOT_CONNECTED` — `listTools`/`callTool` called before `connect()` succeeded.
- `MCP_CONNECTION_FAILED` — network failure, connection refused, DNS failure, or any
  other unrecognized failure shape (the fail-safe default).
- `MCP_TIMEOUT` — the request exceeded `options.timeoutMs` (falls back to the SDK's own
  60s default when unset).
- `MCP_CANCELLED` — the caller's own `AbortSignal` fired. The SDK reports this through
  the _same_ error code as a genuine timeout (`RequestTimeout`, -32001) — `errors.ts`'s
  `toMcpClientError` distinguishes them by the error's message text (the only signal the
  SDK exposes for this), since a structural check isn't available.
- `MCP_PROTOCOL_ERROR` — any other JSON-RPC error response, or a response that fails MCP
  schema validation entirely (e.g. the configured URL isn't actually an MCP server).

`McpToolCallResult.isError` is a _separate_ signal from all of the above — it's the
protocol's own way of saying "the tool itself failed," not a client-level error. Calling
an unknown tool name, for instance, comes back as a normal `Ok` result with
`isError: true` (per MCP convention), not an `Err`.

Auth headers (`McpServerConfig.headers`) are sent with every request and are never
included in any constructed error's message — only the SDK's own error text ever reaches
a `McpClientError`.

Only `text` content blocks are surfaced (`McpTextContent`) — image/audio/resource blocks
are dropped rather than partially represented, since nothing in this codebase consumes
them yet.

## Testing: `startMockMcpServer` (`testing/mock-mcp-server.ts`)

A real MCP server bound to `127.0.0.1` on an ephemeral port — a genuine local HTTP
round-trip (matching this codebase's fake-model-server convention,
`docs/adr/0019-e2e-read-only-use-cases.md`), not an in-process stub, so it exercises
`McpClient`'s real Streamable HTTP transport code, not just its call-shape plumbing. Runs
in stateful mode (a real session id per connection) — the SDK's stateless mode doesn't
correctly complete the handshake over this SDK version's Node HTTP bridge, and a real MCP
server commonly runs stateful anyway.

```ts
const server = await startMockMcpServer([
  {
    name: 'get_weather',
    inputSchema: { city: z.string() },
    handler: (args) => textResult(`sunny in ${args.city}`),
  },
]);
// server.url -> pass to createMcpClient({ url: server.url })
// server.requestHeaders -> every request's headers, oldest first, for asserting auth was sent
await server.close();
```

## Server configuration + storage (`config/`)

`McpServerConnectionConfig` (`config/mcp-server-config.ts`) is what a user configures per
MCP server: `url` (the natural, unique key — mirroring how `@aegis/security`'s
`SitePolicy` is keyed by origin), a display `name`, `enabled`, and `authHeaders` — a list
of `{name, secretName}` pairs. **The header's real value is never stored** — only
`secretName`, a reference into the secret vault, resolved at call time only, the same
vault-plus-name-reference discipline `@aegis/security` already applies to `input_text`/
`send_keys` (`docs/adr/0012-secret-vault.md`).

`createMcpServerStore(storage: StoragePort)` (`config/mcp-server-store.ts`) persists every
server config in one `Record<url, McpServerConnectionConfig>` — `getServer`/`saveServer`
(upsert — covers both "add" and "edit")/`removeServer`/`listServers` — the exact shape
`@aegis/security`'s `PolicyStore` uses for per-origin policies.

`@aegis/mcp` never imports `@aegis/security` directly (packages under `packages/` stay
siblings — see ADR 0010's precedent). Resolving a `secretName` to a real value is a
plain injected function, `SecretResolver` (`config/resolve-headers.ts`):

```ts
const resolveSecret: SecretResolver = (name) => vault.getSecret(name); // wired at the composition root
const headers = await resolveAuthHeaders(config.authHeaders, resolveSecret);
```

`testMcpServerConnection(config, resolveSecret, options?)` (`config/test-connection.ts`)
is the connection test the acceptance criteria asks for: resolves headers, connects,
lists tools, and always disconnects — the same three steps a real `ToolRegistry` wiring
(#85) will perform, so a passing test genuinely predicts the server will work once
enabled.

Depends on `@aegis/shared`, `@modelcontextprotocol/sdk`, `zod`.
