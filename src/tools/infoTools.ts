/**
 * Discovery and health tools: list models and show the bridge's settings.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safe, textResult, type ToolContext } from "./shared.js";
import { VERSION } from "../version.js";

const CHAT_HINT = /^(gpt|o\d|chatgpt|chat-latest)/i;

export function registerInfoTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_list_models",
    {
      title: "List available OpenAI models",
      description:
        "List the OpenAI model IDs your API key can use. Use this to pick a value for the 'model' parameter " +
        "or to troubleshoot 'model not found' errors.",
      inputSchema: {
        filter: z.string().optional().describe("Only show models whose ID contains this text, e.g. 'gpt-6' or 'image'."),
        chat_only: z.boolean().optional().describe("Only show likely chat models (gpt-*, o*). Default true."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_list_models", async ({ filter, chat_only }) => {
      let models = await ctx.backend.listModels();
      const chatOnly = chat_only ?? !filter;
      if (chatOnly) models = models.filter((m) => CHAT_HINT.test(m.id));
      if (filter) models = models.filter((m) => m.id.toLowerCase().includes(filter.toLowerCase()));
      if (ctx.config.allowedModels.length) {
        models = models.filter((m) => ctx.config.allowedModels.includes(m.id));
      }
      const ids = models.map((m) => m.id);
      const text = ids.length
        ? `${ids.length} model(s)${chatOnly ? " (chat models)" : ""}:\n${ids.map((i) => `- ${i}${i === ctx.config.defaultModel ? "  (default)" : ""}`).join("\n")}`
        : "No models matched. Try chat_only=false or a different filter.";
      return textResult(text, { models: ids, default_model: ctx.config.defaultModel });
    }),
  );

  server.registerTool(
    "chatgpt_server_info",
    {
      title: "ChatGPT bridge status",
      description: "Show the bridge version and current settings (never shows the API key). Use to check the bridge is working.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(ctx, "chatgpt_server_info", async () => {
      const c = ctx.config;
      const info = {
        version: VERSION,
        default_model: c.defaultModel,
        image_model: c.imageModel,
        base_url: c.baseURL ?? "https://api.openai.com/v1 (default)",
        api_key_set: Boolean(c.apiKey),
        allowed_models: c.allowedModels.length ? c.allowedModels : "any",
        max_output_tokens: c.maxOutputTokens,
        timeout_ms: c.timeoutMs,
        max_retries: c.maxRetries,
        conversations_held: ctx.store.size,
        conversation_persistence: c.conversationStorePath ?? "memory only",
        image_output_dir: c.imageOutputDir ?? "not saving to disk",
      };
      const text = Object.entries(info)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\n");
      return textResult(`ChatGPT MCP Bridge\n${text}`, info);
    }),
  );
}
