/**
 * stdio transport: Claude Desktop and Claude Code start the bridge as a
 * child process and talk to it over stdin/stdout. This is the default.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, type ServerDeps } from "../server.js";

export async function startStdio(deps: ServerDeps): Promise<void> {
  const server = createServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  deps.log.info(`Ready on stdio (default model: ${deps.config.defaultModel})`);
}
