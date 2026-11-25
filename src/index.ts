#!/usr/bin/env node
/**
 * ChatGPT MCP Bridge: command-line entry point.
 *
 *   chatgpt-mcp-bridge                 start on stdio (Claude Desktop / Claude Code)
 *   chatgpt-mcp-bridge --http          start an HTTP endpoint on HOST:PORT/mcp
 *   chatgpt-mcp-bridge --http --port 8080 --host 0.0.0.0
 *   chatgpt-mcp-bridge --help | --version
 */
import { OpenAIBackend } from "./backend.js";
import { ConfigError, loadConfig } from "./config.js";
import { ConversationStore } from "./conversations.js";
import { createLogger } from "./logger.js";
import { startHttp } from "./transports/http.js";
import { startStdio } from "./transports/stdio.js";
import { NAME, VERSION } from "./version.js";
import { parseArgs } from "./cli.js";

const HELP = `${NAME} v${VERSION}
Connects Claude to ChatGPT (OpenAI models) over the Model Context Protocol.

Usage:
  ${NAME}                      Run on stdio (what Claude Desktop / Claude Code expect)
  ${NAME} --http               Run a Streamable HTTP endpoint at http://HOST:PORT/mcp
  ${NAME} --http --port 8080   Choose the port (or set PORT)
  ${NAME} --http --host 0.0.0.0  Listen on all interfaces (set MCP_AUTH_TOKEN!)
  ${NAME} --version            Print the version
  ${NAME} --help               Show this help

Required environment:
  OPENAI_API_KEY               Your OpenAI API key

Common optional environment:
  OPENAI_MODEL                 Default chat model (default: gpt-5.6-sol)
  OPENAI_BASE_URL              Use Azure OpenAI, OpenRouter, Ollama, LM Studio, etc.
  MCP_AUTH_TOKEN               Bearer token required by the HTTP endpoint
  LOG_LEVEL                    debug | info | warn | error | silent

Full reference: docs/CONFIGURATION.md
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stderr.write(HELP);
    return;
  }
  if (args.version) {
    process.stderr.write(`${VERSION}\n`);
    return;
  }

  const config = loadConfig();
  if (args.port) config.http.port = args.port;
  if (args.host) config.http.host = args.host;

  const log = createLogger(config.logLevel);
  const backend = new OpenAIBackend(config, log);
  const store = new ConversationStore(
    {
      maxConversations: config.maxConversations,
      maxHistoryMessages: config.maxHistoryMessages,
      ttlMinutes: config.conversationTtlMinutes,
      filePath: config.conversationStorePath,
    },
    log,
  );
  const deps = { config, backend, store, log };

  if (args.http) {
    const srv = await startHttp(deps);
    const shutdown = () => {
      log.info("Shutting down");
      srv.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    await startStdio(deps);
  }
}

main().catch((err) => {
  const msg = err instanceof ConfigError ? err.message : err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[${NAME}] Failed to start: ${msg}\n`);
  process.exit(1);
});
