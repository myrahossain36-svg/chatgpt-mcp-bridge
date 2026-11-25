/**
 * Discovery and health tools: list providers, list models, show settings.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PROVIDERS } from "../providers.js";
import { providerOption, resolveTarget, safe, textResult, type ToolContext } from "./shared.js";
import { VERSION } from "../version.js";

const OPENAI_CHAT = /^(gpt|o\d|chatgpt|chat-latest)/i;
const NON_CHAT = /embed|tts|whisper|transcri|audio|realtime|moderation|guard|dall-e|rerank/i;

export function registerInfoTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "ai_list_providers",
    {
      title: "List AI providers",
      description:
        "List every AI the bridge can connect to (ChatGPT, Claude, Gemini, Grok, DeepSeek, Mistral, Llama, Perplexity, " +
        "Kimi, Qwen, Cohere, Groq, OpenRouter, Ollama, LM Studio), which ones are switched on, their default models, " +
        "and exactly which setting turns each one on.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(ctx, "ai_list_providers", async () => {
      const rows = PROVIDERS.map((p) => {
        const pc = ctx.config.providers[p.id];
        const isDefault = ctx.config.defaultProvider === p.id;
        if (pc) {
          return `- [ON] ${p.id}: ${p.name}, model ${pc.model || "auto (first available)"}${isDefault ? "  <- default" : ""}`;
        }
        const how = p.local ? `set ${p.id.toUpperCase()}_ENABLED=true` : `set ${p.keyEnv[0]} (key: ${p.keyUrl})`;
        return `- [off] ${p.id}: ${p.name}. To switch on, ${how}`;
      });
      const on = PROVIDERS.filter((p) => ctx.config.providers[p.id]);
      const text =
        `${on.length} of ${PROVIDERS.length} AI providers are switched on.\n\n${rows.join("\n")}\n\n` +
        "Use ai_ask with provider=<id> to ask one, or ai_panel to ask them all at once.";
      return textResult(text, {
        default_provider: ctx.config.defaultProvider,
        providers: PROVIDERS.map((p) => ({
          id: p.id,
          name: p.name,
          configured: Boolean(ctx.config.providers[p.id]),
          default_model: ctx.config.providers[p.id]?.model ?? p.defaultModel,
          key_env: p.keyEnv[0],
          note: p.note ?? null,
        })),
      });
    }),
  );

  server.registerTool(
    "chatgpt_list_models",
    {
      title: "List available models",
      description:
        "List the model IDs an AI provider offers to your key (ChatGPT by default; pass provider for others). " +
        "Use this to pick a value for the 'model' parameter or to troubleshoot 'model not found' errors.",
      inputSchema: {
        provider: providerOption,
        filter: z.string().optional().describe("Only show models whose ID contains this text, e.g. 'gpt-6' or 'pro'."),
        chat_only: z.boolean().optional().describe("Hide embedding, audio and similar models. Default true."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_list_models", async ({ provider, filter, chat_only }) => {
      const target = resolveTarget(ctx, provider);
      const pc = ctx.config.providers[target.provider];
      let models = await ctx.backend.listModels(target.provider);
      const chatOnly = chat_only ?? !filter;
      if (chatOnly) {
        models = models.filter((m) =>
          target.provider === "openai" ? OPENAI_CHAT.test(m.id) : !NON_CHAT.test(m.id),
        );
      }
      if (filter) models = models.filter((m) => m.id.toLowerCase().includes(filter.toLowerCase()));
      if (ctx.config.allowedModels.length) {
        models = models.filter((m) => ctx.config.allowedModels.includes(m.id));
      }
      const ids = models.map((m) => m.id);
      const text = ids.length
        ? `${target.name}: ${ids.length} model(s)${chatOnly ? " (chat models)" : ""}:\n${ids
            .map((i) => `- ${i}${i === pc.model ? "  (default)" : ""}`)
            .join("\n")}`
        : "No models matched. Try chat_only=false or a different filter.";
      return textResult(text, { provider: target.provider, models: ids, default_model: pc.model });
    }),
  );

  server.registerTool(
    "chatgpt_server_info",
    {
      title: "Bridge status",
      description:
        "Show the bridge version, which AI providers are switched on and the current settings (never shows API keys). " +
        "Use to check the bridge is working.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(ctx, "chatgpt_server_info", async () => {
      const c = ctx.config;
      const providers = Object.values(c.providers).map((p) => `${p.def.id} (${p.model || "auto"})`);
      const info = {
        version: VERSION,
        default_provider: c.defaultProvider,
        providers_on: providers.length ? providers.join(", ") : "none",
        default_model: c.defaultModel,
        image_model: c.imageModel,
        api_key_set: Object.keys(c.providers).length > 0,
        allowed_models: c.allowedModels.length ? c.allowedModels.join(", ") : "any",
        max_output_tokens: c.maxOutputTokens,
        timeout_ms: c.timeoutMs,
        max_retries: c.maxRetries,
        conversations_held: ctx.store.size,
        conversation_persistence: c.conversationStorePath ?? "memory only",
        image_output_dir: c.imageOutputDir ?? "not saving to disk",
      };
      const text = Object.entries(info)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return textResult(`Multi-AI MCP Bridge\n${text}`, info);
    }),
  );
}
