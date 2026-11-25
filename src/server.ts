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
import { registerTeamTools } from "./tools/teamTools.js";
import type { ToolContext } from "./tools/shared.js";
import { NAME, VERSION } from "./version.js";

export const SERVER_INSTRUCTIONS = `This server connects you to ChatGPT and other AI models (Gemini, Grok, Claude, DeepSeek, Mistral, Llama, Perplexity, Kimi, Qwen, Cohere, local models).
- chatgpt_ask: send ChatGPT (the default AI) a message. Pass a conversation_id to keep a multi-turn thread.
- ai_ask: ask a specific AI by name (provider="gemini", "grok", "claude", ...).
- ai_panel: ask every configured AI the same question at once, then summarise agreement and disagreement.
- ai_team: make several AIs work together on a task with roles (review loop, discussion or pipeline). Pass your own draft to have the team improve your work.
- ai_list_providers: see which AIs are switched on and how to add more.
- Files can be shared with the AIs through the 'files' input (only from folders in ALLOWED_FILE_DIRS).
- chatgpt_second_opinion / chatgpt_code_review / chatgpt_debate: get a critical outside view.
- chatgpt_structured: get a JSON object back.
- chatgpt_compare_models: run one prompt on several models side by side.
- chatgpt_generate_image: create images.
- chatgpt_list_models / chatgpt_server_info: discover models and check the bridge.
The other AIs cannot see your conversation with the user. Always include the full context they need.
Tell the user which AI each answer came from.`;

export interface ServerDeps {
  config: BridgeConfig;
  backend: ChatBackend;
  store: ConversationStore;
  log: Logger;
}

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: NAME, version: VERSION, title: "Multi-AI Bridge" },
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
  registerTeamTools(server, ctx);
  registerImageTools(server, ctx);
  registerInfoTools(server, ctx);
  registerPrompts(server);
  registerResources(server, ctx);
  return server;
}
