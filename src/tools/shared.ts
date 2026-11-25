/**
 * Helpers shared by all tools.
 */
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ChatBackend, ChatResult } from "../backend.js";
import { BackendError, notConfigured } from "../backend.js";
import { findProvider } from "../providers.js";
import type { BridgeConfig } from "../config.js";
import { ConfigError, assertModelAllowed } from "../config.js";
import type { ConversationStore } from "../conversations.js";
import type { Logger } from "../logger.js";

/** Everything a tool needs, passed in once when the server is built. */
export interface ToolContext {
  config: BridgeConfig;
  backend: ChatBackend;
  store: ConversationStore;
  log: Logger;
}

/** Common optional model settings, reused by several tools. */
export const providerOption = z
  .string()
  .optional()
  .describe(
    "Which AI to ask: openai (ChatGPT), anthropic (Claude), gemini, xai (Grok), deepseek, mistral, meta (Llama), " +
      "perplexity, moonshot (Kimi), qwen, cohere, groq, openrouter, ollama or lmstudio. Leave empty for the default. " +
      "Run ai_list_providers to see which are configured.",
  );

export const modelOptions = {
  provider: providerOption,
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Model ID for the chosen provider, e.g. 'gpt-5.6-sol' or 'gemini-3.8-flash'. You can also write 'provider:model', " +
        "e.g. 'xai:grok-4.6'. Leave empty to use that provider's default.",
    ),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional()
    .describe("Creativity, 0 to 2. Lower is more focused. Some reasoning models ignore this; the bridge drops it automatically."),
  max_output_tokens: z
    .number()
    .int()
    .min(1)
    .max(128_000)
    .optional()
    .describe("Upper limit on the length of ChatGPT's reply, in tokens."),
  reasoning_effort: z
    .enum(["minimal", "low", "medium", "high"])
    .optional()
    .describe("For reasoning models only: how hard the model should think. Higher is slower and more expensive."),
};

export interface Target {
  /** Provider id, e.g. "gemini". */
  provider: string;
  /** Model id ("" lets the router auto-pick, for local servers). */
  model: string;
  /** Display name, e.g. "Google Gemini". */
  name: string;
}

/**
 * Work out which provider and model a tool call means.
 * Accepts a provider id or alias ("grok", "claude"), and 'provider:model' shorthand in the model field.
 */
export function resolveTarget(ctx: ToolContext, provider?: string, model?: string): Target {
  let p = provider?.trim() || undefined;
  let m = model?.trim() || undefined;
  if (m && m.includes(":")) {
    const [prefix, ...rest] = m.split(":");
    const def = findProvider(prefix);
    if (def && rest.join(":")) {
      if (p && findProvider(p)?.id !== def.id) {
        throw new ConfigError(`provider "${p}" conflicts with model "${m}".`);
      }
      p = def.id;
      m = rest.join(":");
    }
  }
  let id = ctx.config.defaultProvider;
  if (p) {
    const def = findProvider(p);
    if (!def) throw new ConfigError(`Unknown AI provider "${p}". Run ai_list_providers to see the options.`);
    id = def.id;
  }
  const pc = ctx.config.providers[id];
  if (!pc) throw notConfigured(id);
  const finalModel = m ?? pc.model;
  if (finalModel) assertModelAllowed(ctx.config, finalModel);
  return { provider: id, model: finalModel, name: pc.def.name };
}

/** Backwards-compatible helper: model for the default provider. */
export function resolveModel(ctx: ToolContext, requested?: string): string {
  return resolveTarget(ctx, undefined, requested).model;
}

export function textResult(text: string, structured?: Record<string, unknown>): CallToolResult {
  const result: CallToolResult = { content: [{ type: "text", text }] };
  if (structured) result.structuredContent = structured;
  return result;
}

/** Convert any thrown error into an MCP tool error Claude can read and explain. */
export function errorResult(err: unknown): CallToolResult {
  let text: string;
  if (err instanceof BackendError) {
    text = `ChatGPT request failed${err.status ? ` (HTTP ${err.status})` : ""}: ${err.message}`;
    if (err.hint) text += `\nHow to fix: ${err.hint}`;
  } else if (err instanceof ConfigError) {
    text = `Configuration problem: ${err.message}`;
  } else if (err instanceof Error) {
    text = `Error: ${err.message}`;
  } else {
    text = `Error: ${String(err)}`;
  }
  return { content: [{ type: "text", text }], isError: true };
}

/** A short footer so Claude can see which model answered and what it cost. */
export function footer(result: ChatResult, extra: string[] = []): string {
  const parts: string[] = [];
  const def = result.provider ? findProvider(result.provider) : undefined;
  if (def) parts.push(def.name);
  parts.push(`model: ${result.model}${result.autoSelectedModel ? " (auto-selected)" : ""}`);
  if (result.usage?.totalTokens !== undefined) {
    parts.push(`tokens: ${result.usage.inputTokens ?? "?"} in / ${result.usage.outputTokens ?? "?"} out`);
  }
  if (result.finishReason && result.finishReason !== "stop") {
    parts.push(`finish: ${result.finishReason}${result.finishReason === "length" ? " (reply was cut off; raise max_output_tokens)" : ""}`);
  }
  if (result.droppedParams?.length) parts.push(`ignored unsupported: ${result.droppedParams.join(", ")}`);
  parts.push(...extra);
  return `\n\n---\n[${parts.join(" | ")}]`;
}

/** Wrap a handler so any error becomes a friendly isError result. */
export function safe<A>(ctx: ToolContext, name: string, fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const out = await fn(args);
      ctx.log.info(`${name} ok in ${Date.now() - started}ms`);
      return out;
    } catch (err) {
      ctx.log.warn(`${name} failed in ${Date.now() - started}ms`, err);
      return errorResult(err);
    }
  };
}
