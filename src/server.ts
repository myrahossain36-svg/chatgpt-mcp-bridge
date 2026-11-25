/**
 * Builds the MCP server and wires up every tool, prompt and resource.
 * Used by both the stdio transport (Claude Desktop / Claude Code) and the
 * HTTP transport (remote connectors).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChatBackend } from "./backend.js";
import type { BridgeConfig } from "./config.js";
import type { ConversationStore } from "./conversations.js";
import type { Logger } from "./logger.js";
import { registerPrompts, registerResources } from "./prompts.js";
import { registerAskTool } from "./tools/ask.js";
import { registerCompareTool } from "./tools/compareTool.js";
import { registerConversationTools } from "./tools/conversationTools.js";
import { registerExpertTools } from "./tools/expertTools.js";
import { registerImageTools } from "./tools/imageTools.js";
import { registerInfoTools } from "./tools/infoTools.js";
import type { ToolContext } from "./tools/shared.js";
import { NAME, VERSION } from "./version.js";

export const SERVER_INSTRUCTIONS = `This server connects you to ChatGPT (OpenAI models).
- chatgpt_ask: send ChatGPT a message. Pass a conversation_id to keep a multi-turn thread.
- chatgpt_second_opinion / chatgpt_code_review / chatgpt_debate: get a critical outside view.
- chatgpt_structured: get a JSON object back.
- chatgpt_compare_models: run one prompt on several models side by side.
- chatgpt_generate_image: create images.
- chatgpt_list_models / chatgpt_server_info: discover models and check the bridge.
ChatGPT cannot see your conversation with the user. Always include the full context it needs.
Tell the user when an answer came from ChatGPT rather than from you.`;

export interface ServerDeps {
  config: BridgeConfig;
  backend: ChatBackend;
  store: ConversationStore;
  log: Logger;
}

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: NAME, version: VERSION, title: "ChatGPT Bridge" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {}, logging: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );
  const ctx: ToolContext = deps;
  registerAskTool(server, ctx);
  registerConversationTools(server, ctx);
  registerExpertTools(server, ctx);
  registerCompareTool(server, ctx);
  registerImageTools(server, ctx);
  registerInfoTools(server, ctx);
  registerPrompts(server);
  registerResources(server, ctx);
  return server;
}
