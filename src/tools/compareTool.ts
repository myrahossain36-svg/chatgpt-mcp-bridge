/**
 * chatgpt_compare_models: send the same prompt to several OpenAI models at
 * once and show the answers side by side. Great for choosing a model, or for
 * spotting where models disagree.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendError, type ChatMessage } from "../backend.js";
import { resolveModel, safe, textResult, type ToolContext } from "./shared.js";

export function registerCompareTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_compare_models",
    {
      title: "Compare OpenAI models",
      description:
        "Send the same prompt to 2 to 5 OpenAI models in parallel and return their answers side by side, " +
        "with timing and token usage for each. Use it to choose a model or to see where models disagree.",
      inputSchema: {
        message: z.string().min(1).describe("The prompt to send to every model."),
        models: z
          .array(z.string().min(1))
          .min(2)
          .max(5)
          .describe("Model IDs to compare, e.g. ['gpt-5.6-sol', 'gpt-6.1-terra']."),
        system_prompt: z.string().optional().describe("Optional system prompt applied to every model."),
        max_output_tokens: z.number().int().min(1).max(128_000).optional().describe("Reply limit per model."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_compare_models", async (args) => {
      const models = [...new Set(args.models.map((m) => resolveModel(ctx, m)))];
      const messages: ChatMessage[] = args.system_prompt
        ? [
            { role: "system", content: args.system_prompt },
            { role: "user", content: args.message },
          ]
        : [{ role: "user", content: args.message }];

      const results = await Promise.all(
        models.map(async (model) => {
          const started = Date.now();
          try {
            const r = await ctx.backend.chat({
              model,
              messages,
              maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
            });
            return { model, ok: true as const, text: r.text, ms: Date.now() - started, usage: r.usage ?? null };
          } catch (err) {
            const e = err instanceof BackendError ? err : new BackendError(String(err));
            return { model, ok: false as const, error: e.message, hint: e.hint, ms: Date.now() - started };
          }
        }),
      );

      const sections = results.map((r) => {
        const head = `## ${r.model}  (${(r.ms / 1000).toFixed(1)}s${
          r.ok && r.usage?.totalTokens !== undefined ? `, ${r.usage.totalTokens} tokens` : ""
        })`;
        return r.ok ? `${head}\n${r.text}` : `${head}\nFAILED: ${r.error}${r.hint ? `\nHow to fix: ${r.hint}` : ""}`;
      });
      const okCount = results.filter((r) => r.ok).length;
      return textResult(
        `Compared ${models.length} model(s); ${okCount} answered.\n\n${sections.join("\n\n")}`,
        { results },
      );
    }),
  );
}
