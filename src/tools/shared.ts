/**
 * Helpers shared by all tools.
 */
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ChatBackend, ChatResult } from "../backend.js";
import { BackendError } from "../backend.js";
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
export const modelOptions = {
  model: z
    .string()
    .min(1)
    .optional()
    .describe("OpenAI model ID to use, e.g. 'gpt-5.6-sol'. Leave empty to use the server default (OPENAI_MODEL)."),
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

export function resolveModel(ctx: ToolContext, requested?: string): string {
  const model = requested?.trim() || ctx.config.defaultModel;
  assertModelAllowed(ctx.config, model);
  return model;
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
  const parts = [`model: ${result.model}`];
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
