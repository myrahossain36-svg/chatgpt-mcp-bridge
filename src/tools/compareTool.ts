/**
 * chatgpt_compare_models and ai_panel: send the same prompt to several models
 * at once and show the answers side by side.
 *
 * - chatgpt_compare_models: compare specific models (any provider).
 * - ai_panel: ask every configured AI (or a chosen list) the same question,
 *   so Claude can weigh up where they agree and disagree.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BackendError, type ChatMessage } from "../backend.js";
import { findProvider } from "../providers.js";
import { resolveTarget, safe, textResult, type Target, type ToolContext } from "./shared.js";

const MAX_PANEL = 8;

/** Turn "gemini", "claude", "xai:grok-4.6" or "gpt-5.6-sol" into a target. */
export function parseEntry(ctx: ToolContext, entry: string): Target {
  const trimmed = entry.trim();
  const asProvider = findProvider(trimmed);
  if (asProvider) return resolveTarget(ctx, asProvider.id);
  return resolveTarget(ctx, undefined, trimmed);
}

interface PanelRow {
  label: string;
  provider?: string;
  model?: string;
  ok: boolean;
  text?: string;
  error?: string;
  hint?: string;
  ms: number;
  usage?: unknown;
}

export async function runPanel(
  ctx: ToolContext,
  entries: string[],
  message: string,
  systemPrompt?: string,
  maxOutputTokens?: number,
): Promise<CallToolResult> {
  const messages: ChatMessage[] = systemPrompt
    ? [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ]
    : [{ role: "user", content: message }];

  const seen = new Set<string>();
  const rows: PanelRow[] = await Promise.all(
    entries.map(async (entry): Promise<PanelRow> => {
      const started = Date.now();
      let target: Target;
      try {
        target = parseEntry(ctx, entry);
      } catch (err) {
        const e = err as BackendError;
        return { label: entry, ok: false, error: e.message, hint: e.hint, ms: 0 };
      }
      const key = `${target.provider}:${target.model}`;
      if (seen.has(key)) return { label: entry, ok: false, error: "duplicate entry, skipped", ms: 0 };
      seen.add(key);
      try {
        const r = await ctx.backend.chat({
          provider: target.provider,
          model: target.model,
          messages,
          maxOutputTokens: maxOutputTokens ?? ctx.config.maxOutputTokens,
        });
        return {
          label: `${target.name} (${r.model}${r.autoSelectedModel ? ", auto-selected" : ""})`,
          provider: target.provider,
          model: r.model,
          ok: true,
          text: r.text,
          ms: Date.now() - started,
          usage: r.usage ?? null,
        };
      } catch (err) {
        const e = err instanceof BackendError ? err : new BackendError(String((err as Error)?.message ?? err));
        return {
          label: `${target.name}${target.model ? ` (${target.model})` : ""}`,
          provider: target.provider,
          model: target.model,
          ok: false,
          error: e.message,
          hint: e.hint,
          ms: Date.now() - started,
        };
      }
    }),
  );

  const shown = rows.filter((r) => r.error !== "duplicate entry, skipped");
  const sections = shown.map((r) => {
    const tokens = (r.usage as { totalTokens?: number } | null)?.totalTokens;
    const head = `## ${r.label}  (${(r.ms / 1000).toFixed(1)}s${r.ok && tokens !== undefined ? `, ${tokens} tokens` : ""})`;
    return r.ok ? `${head}\n${r.text}` : `${head}\nFAILED: ${r.error}${r.hint ? `\nHow to fix: ${r.hint}` : ""}`;
  });
  const okCount = shown.filter((r) => r.ok).length;
  return textResult(`Asked ${shown.length} model(s); ${okCount} answered.\n\n${sections.join("\n\n")}`, {
    results: shown,
  });
}

export function registerCompareTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_compare_models",
    {
      title: "Compare AI models side by side",
      description:
        "Send the same prompt to 2 to 8 models in parallel and return their answers side by side, with timing and " +
        "token usage. Entries can be model IDs ('gpt-5.6-sol'), provider names ('gemini', 'grok', 'claude') or " +
        "'provider:model' ('xai:grok-4.6'). Use it to choose a model or to see where models disagree.",
      inputSchema: {
        message: z.string().min(1).describe("The prompt to send to every model."),
        models: z
          .array(z.string().min(1))
          .min(2)
          .max(MAX_PANEL)
          .describe("Models or providers to compare, e.g. ['gpt-5.6-sol', 'gemini', 'xai:grok-4.6']."),
        system_prompt: z.string().optional().describe("Optional system prompt applied to every model."),
        max_output_tokens: z.number().int().min(1).max(128_000).optional().describe("Reply limit per model."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_compare_models", (args) =>
      runPanel(ctx, args.models, args.message, args.system_prompt, args.max_output_tokens),
    ),
  );

  server.registerTool(
    "ai_panel",
    {
      title: "Ask a panel of AIs",
      description:
        "Ask several different AIs the same question at once (by default every AI configured in the bridge, up to 8) " +
        "and get all their answers side by side. Use it when the user wants a consensus, a 'council', or to see what " +
        "ChatGPT, Gemini, Grok, DeepSeek and others each think. Afterwards, summarise where they agree and disagree.",
      inputSchema: {
        message: z.string().min(1).describe("The question for the panel. Include all the context they need."),
        providers: z
          .array(z.string().min(1))
          .max(MAX_PANEL)
          .optional()
          .describe("Optional: which AIs to ask, e.g. ['openai', 'gemini', 'grok']. Default: all configured."),
        system_prompt: z.string().optional().describe("Optional system prompt applied to every AI."),
        max_output_tokens: z.number().int().min(1).max(128_000).optional().describe("Reply limit per AI."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "ai_panel", async (args) => {
      const entries = args.providers?.length ? args.providers : Object.keys(ctx.config.providers).slice(0, MAX_PANEL);
      if (entries.length === 0) return textResult("No AI providers are configured. Run ai_list_providers for setup help.");
      return runPanel(ctx, entries, args.message, args.system_prompt, args.max_output_tokens);
    }),
  );
}
