import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ConversationStore } from "../src/conversations.js";
import { createLogger } from "../src/logger.js";
import { buildHttpApp } from "../src/transports/http.js";
import { FakeBackend, testConfig, textOf } from "./helpers.js";

let server: Server | undefined;
afterEach(() => server?.close());

async function start(env: Record<string, string> = {}) {
  const config = testConfig(env);
  const store = new ConversationStore({ maxConversations: 10, maxHistoryMessages: 10, ttlMinutes: 60 });
  const app = buildHttpApp({ config, backend: new FakeBackend(), store, log: createLogger("silent") });
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("HTTP transport", () => {
  it("serves /health", async () => {
    const base = await start();
    const res = await fetch(`${base}/health`);
    expect(await res.json()).toMatchObject({ status: "ok", name: "chatgpt-mcp-bridge" });
  });

  it("works end to end with a real MCP HTTP client and keeps threads across requests", async () => {
    const base = await start();
    const client = new Client({ name: "http-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools.length).toBe(12);
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "one", conversation_id: "h1" } });
    const list = await client.callTool({ name: "chatgpt_list_conversations", arguments: {} });
    expect(textOf(list)).toContain("h1");
    await client.close();
  });

  it("rejects requests without the bearer token when MCP_AUTH_TOKEN is set", async () => {
    const base = await start({ MCP_AUTH_TOKEN: "secret-token-123" });
    const bad = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(bad.status).toBe(401);

    const client = new Client({ name: "http-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: "Bearer secret-token-123" } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.length).toBe(12);
    await client.close();
  });

  it("returns 405 for GET /mcp in stateless mode", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`);
    expect(res.status).toBe(405);
  });
});
