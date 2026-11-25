/**
 * Streamable HTTP transport.
 *
 * Use this when Claude is not on the same machine as the bridge, for example
 * to add the bridge as a custom connector in claude.ai, or to share one
 * bridge across a team. See docs/REMOTE-HTTP.md.
 *
 * Runs in stateless mode: every POST /mcp gets a fresh server + transport,
 * which is the simplest model to scale and host. Conversation threads still
 * persist across requests because they live in the shared ConversationStore.
 */
import { timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type ServerDeps } from "../server.js";
import { NAME, VERSION } from "../version.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildHttpApp(deps: ServerDeps) {
  const { config, log } = deps;
  const { host, authToken, allowedHosts, corsOrigins } = config.http;

  const app = createMcpExpressApp({
    host,
    allowedHosts: allowedHosts.length ? allowedHosts : undefined,
  });

  // --- CORS (only for origins you list in CORS_ORIGINS)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (corsOrigins.includes("*") || corsOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", corsOrigins.includes("*") ? "*" : origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
      );
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // --- Health check (no auth, reveals nothing sensitive)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", name: NAME, version: VERSION });
  });

  // --- Bearer token auth for /mcp
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!authToken) return next();
    const header = req.headers.authorization ?? "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : queryToken;
    if (given && tokensMatch(given, authToken)) return next();
    log.warn(`Rejected unauthenticated request from ${req.ip}`);
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: send 'Authorization: Bearer <MCP_AUTH_TOKEN>'" },
      id: null,
    });
  };

  app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
    const server = createServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error("Error handling MCP request", err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  // Stateless mode: no server-initiated streams or session deletion.
  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).set("Allow", "POST").json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This server is stateless; use POST /mcp." },
      id: null,
    });
  };
  app.get("/mcp", requireAuth, notAllowed);
  app.delete("/mcp", requireAuth, notAllowed);

  return app;
}

export async function startHttp(deps: ServerDeps): Promise<Server> {
  const { host, port, authToken } = deps.config.http;
  if (!authToken && !LOCAL_HOSTS.has(host)) {
    deps.log.warn(
      `HTTP server is listening on ${host} WITHOUT MCP_AUTH_TOKEN. Anyone who can reach it can spend your OpenAI credit. Set MCP_AUTH_TOKEN.`,
    );
  }
  const app = buildHttpApp(deps);
  return await new Promise<Server>((resolvePromise, reject) => {
    const srv = app.listen(port, host, () => {
      deps.log.info(`HTTP MCP endpoint ready at http://${host}:${port}/mcp (health: /health)`);
      resolvePromise(srv);
    });
    srv.on("error", reject);
  });
}
