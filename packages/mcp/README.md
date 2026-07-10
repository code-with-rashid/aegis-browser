# @aegis/mcp

An `McpClient` for connecting to external MCP (Model Context Protocol) servers and
calling their tools, user-facing server configuration + storage, a bridge that registers
an MCP server's tools into `@aegis/actions`' `ToolRegistry`, plus a WebMCP page-tool
adapter (#87, not yet built).

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
lists tools, and always disconnects — the exact same three steps
`registerMcpServerTools` (below) performs, so a passing test genuinely predicts the
server will work once enabled.

## Registering MCP tools into the `ToolRegistry` (`registry/`)

`registerMcpServerTools(registry, config, resolveSecret, policyStore, options?)`
(`registry/mcp-tool-registry.ts`) connects to an enabled `McpServerConnectionConfig`,
lists its tools, gates them through `policyStore` (below), and registers each _allowed_
tool as a `source: "mcp"` `Tool` (`@aegis/actions`) the Navigator can call (#81) and the
policy engine can gate per-call (#82) exactly like a built-in browser tool:

```ts
const result = await registerMcpServerTools(toolRegistry, serverConfig, resolveSecret, policyStore);
if (isOk(result)) {
  // result.value.toolIds -> e.g. ["mcp.weather_co.get_forecast"] (only the allowed ones)
  // result.value.newlyDiscoveredToolIds -> tool ids seen for the first time, recorded pending
  // result.value.disconnect() -> call when the server is disabled/removed, or on teardown
}
```

- **Tool ids are namespaced `mcp.<server>.<tool>`**, where `<server>` is the configured
  server's display `name` reduced to `[a-z0-9_]`. This keeps ids stable and readable even
  if two different servers each expose a tool with the same bare name.
- **Risk is inferred from the tool's MCP annotations** (`inferMcpToolRisk`):
  `readOnlyHint: true` → `read`; `destructiveHint: true`, or no annotations at all
  (fail-safe) → `state_changing`.
- **A tool's JSON Schema input becomes its `Tool.inputSchema`** via `jsonSchemaToZod`
  (`registry/json-schema-to-zod.ts`) — a deliberately minimal converter (objects,
  strings/numbers/integers/booleans/arrays/enums, required vs. optional, nested objects)
  that falls back to `z.unknown()` for anything it doesn't recognize, rather than a
  general-purpose JSON-Schema library. See `docs/adr/0033-mcp-tools-to-toolregistry.md`.
- **Every tool registered from one call shares one `McpClient` connection**, kept open
  for the tools' lifetime; `disconnect()` closes it once (not per tool).
- **A tool's `isError: true` result becomes a `ToolExecutionError`** — the Navigator sees
  a normal failed-tool-call outcome, not a client-level `McpClientError`, for a tool that
  ran but failed on its own terms.

### Elicitation

MCP servers can ask the connecting client for input mid-call ("elicitation"). Supplying
`CreateMcpClientOptions.onElicitationRequest` (an `ElicitationHandler`) advertises the
`elicitation` capability and answers requests through it; omitting it means the client
never advertises the capability, so a well-behaved server simply won't ask. Nothing wires
a real handler through the confirmation UI yet — that's #90.

## Tool permissioning (`policy/`)

Every MCP tool is denied by default, whether at the server level or the individual-tool
level — no MCP tool is ever auto-trusted (#86):

- **Per-server**: `config.enabled === false` means `registerMcpServerTools` never even
  connects — it resolves immediately to an empty, no-op registration.
- **Per-tool**: `McpToolPolicy` (`policy/mcp-tool-policy.ts`) is `{toolId, mode: "allow" |
"deny"}`, persisted by `createMcpToolPolicyStore(storage)` (`policy/mcp-tool-policy-store.ts`)
  — the same one-storage-record-per-map shape `@aegis/security`'s `PolicyStore` and this
  package's own `McpServerStore` already use. There's no `ask`/`confirm` mode here: this
  gates whether a tool may be registered/callable _at all_, a separate, one-time decision
  from the per-call risk gate `@aegis/security`'s `PolicyEngine` already runs (#82).
- **`gateMcpTools(serverIdSegment, descriptors, policyStore)`** (`policy/gate-mcp-tools.ts`)
  is the actual deny-by-default gate `registerMcpServerTools` calls after `listTools()`:
  a tool id with no stored policy is recorded `mode: "deny"` on the spot and reported in
  `newlyDiscoveredToolIds` (so a management UI, #89, can prompt for a decision); an
  explicitly `deny`d tool stays excluded; only an explicitly `allow`ed tool is registered.
  A denied (or merely undecided) tool is never registered, so it's neither offered to the
  Navigator nor callable (`ToolRegistry.call` returns `TOOL_UNKNOWN`).

See `docs/adr/0034-mcp-tool-permissioning.md`.

Depends on `@aegis/shared`, `@aegis/actions`, `@modelcontextprotocol/sdk`, `zod`.
