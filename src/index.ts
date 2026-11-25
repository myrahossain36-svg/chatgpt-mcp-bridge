#!/usr/bin/env node
/**
 * ChatGPT MCP Bridge: command-line entry point.
 *
 *   chatgpt-mcp-bridge                 start on stdio (Claude Desktop / Claude Code)
 *   chatgpt-mcp-bridge --http          start an HTTP endpoint on HOST:PORT/mcp
 *   chatgpt-mcp-bridge --http --port 8080 --host 0.0.0.0
 *   chatgpt-mcp-bridge --help | --version
 */
import { RouterBackend } from "./backend.js";
import { PROVIDERS } from "./providers.js";
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

  ${NAME} --providers          List every supported AI and the key that switches it on

Required environment (at least one):
  OPENAI_API_KEY               ChatGPT. Others: GEMINI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY,
                               DEEPSEEK_API_KEY, MISTRAL_API_KEY, PERPLEXITY_API_KEY, ... (see --providers)

Common optional environment:
  DEFAULT_PROVIDER             Which AI chatgpt_ask uses (default: openai if set)
  OPENAI_MODEL, GEMINI_MODEL   Default model per provider (<PROVIDER>_MODEL)
  OPENAI_BASE_URL              Override a provider's address (<PROVIDER>_BASE_URL)
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
  if (args.providers) {
    const lines = PROVIDERS.map(
      (p) => `  ${p.id.padEnd(11)} ${p.name.padEnd(42)} ${p.local ? `${p.id.toUpperCase()}_ENABLED=true` : p.keyEnv[0]}`,
    );
    process.stderr.write(`Supported AI providers (set the variable on the right to switch one on):\n${lines.join("\n")}\n`);
    return;
  }

  const config = loadConfig();
  if (args.port) config.http.port = args.port;
  if (args.host) config.http.host = args.host;

  const log = createLogger(config.logLevel);
  const backend = new RouterBackend(config, log);
  log.info(`AI providers on: ${Object.keys(config.providers).join(", ")} (default: ${config.defaultProvider})`);
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
