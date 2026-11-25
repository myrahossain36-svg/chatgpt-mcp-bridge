# Architecture

```text
                    ┌──────────────────────── chatgpt-mcp-bridge ────────────────────────┐
 Claude Desktop ─┐  │                                                                     │
 Claude Code    ─┼──┤ transports/stdio.ts ─┐                                              │
 claude.ai      ─┘  │ transports/http.ts  ─┴─► server.ts ──► tools/*  ──► backend.ts ──┼──► OpenAI API
 (any MCP client)   │   (auth, CORS,           (McpServer)   prompts.ts   (OpenAI SDK,  │    (or any
                    │    /health)                             resources    retries,     │    compatible API)
                    │                                            │         error hints) │
                    │                                            ▼                      │
                    │                                    conversations.ts               │
                    │                                    (memory / JSON file)           │
                    └─────────────────────────────────────────────────────────────────────┘
```

## Design choices

**Tools depend on an interface, not the SDK.** `backend.ts` defines `ChatBackend` (`chat`, `generateImage`, `listModels`). The real `OpenAIBackend` implements it; tests use `FakeBackend`. That makes every tool testable end to end with no network, and keeps provider quirks in one file.

**Friendly failures.** Tools never throw to the client. `tools/shared.ts#safe` turns any error into an MCP tool result with `isError: true`, an HTTP status and a "How to fix" line produced by `explainOpenAIError`. Claude can then explain the problem to the user in plain language.

**Self-healing parameters.** Models differ in what they accept (`temperature`, `reasoning_effort`, `response_format`, `max_completion_tokens`). When the API returns a 400 naming one of these, the backend removes it and retries, up to four times, and reports what it dropped in the reply footer.

**Conversations are server-side.** Claude only passes a `conversation_id`; the bridge keeps the history, so Claude does not have to resend whole transcripts. The store trims history (keeping the system prompt), evicts least-recently-used threads, expires idle ones, and can persist atomically to JSON. A turn is saved only after a successful reply.

**stdout is sacred.** In stdio mode stdout carries JSON-RPC. All logging goes through `logger.ts` to stderr, with API keys and bearer tokens redacted.

**Stateless HTTP.** Each `POST /mcp` builds a fresh `McpServer` with the shared dependencies. No session map to leak or expire; easy to run behind a load balancer. Threads survive across requests because the store is shared.

## Adding a tool

1. Create `src/tools/myTool.ts` exporting `registerMyTool(server, ctx)`.
2. Use `server.registerTool(name, { title, description, inputSchema, annotations }, safe(ctx, name, handler))`.
3. Write a description that tells Claude *when* to use the tool, not only what it does.
4. Register it in `src/server.ts` and mention it in `SERVER_INSTRUCTIONS`.
5. Add tests in `test/tools.test.ts` using `connectTestClient()` and `FakeBackend`.
6. Document it in `docs/TOOLS.md` and the README table.
