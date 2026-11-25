/**
 * chatgpt_ask: the main tool. Send ChatGPT a message, optionally as part of
 * an ongoing conversation.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChatMessage } from "../backend.js";
import { footer, modelOptions, resolveModel, safe, textResult, type ToolContext } from "./shared.js";

export function registerAskTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_ask",
    {
      title: "Ask ChatGPT",
      description:
        "Send a message to ChatGPT (an OpenAI model) and get its reply. " +
        "Use this when the user asks to 'ask ChatGPT', wants an answer from OpenAI, or wants a second model's view. " +
        "For a multi-turn chat, pass the same conversation_id on every call: ChatGPT will remember earlier turns. " +
        "Leave conversation_id empty for a one-off question. ChatGPT cannot see this Claude conversation, " +
        "so include all the context it needs in the message.",
      inputSchema: {
        message: z.string().min(1).describe("The message to send to ChatGPT. Include all needed context."),
        conversation_id: z
          .string()
          .optional()
          .describe(
            "Optional thread ID. Reuse it to continue a conversation; use a new value (e.g. 'research-1') to start one. " +
              "Letters, numbers, '-' and '_' only.",
          ),
        system_prompt: z
          .string()
          .optional()
          .describe("Optional instructions for ChatGPT's role or style. Only applied when a conversation starts."),
        ...modelOptions,
      },
      annotations: { title: "Ask ChatGPT", readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_ask", async (args) => {
      const model = resolveModel(ctx, args.model);
      const systemPrompt = args.system_prompt ?? ctx.config.defaultSystemPrompt;
      const userMsg: ChatMessage = { role: "user", content: args.message };

      // One-off question: no history kept.
      if (!args.conversation_id) {
        const messages: ChatMessage[] = systemPrompt ? [{ role: "system", content: systemPrompt }, userMsg] : [userMsg];
        const result = await ctx.backend.chat({
          model,
          messages,
          temperature: args.temperature,
          maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
          reasoningEffort: args.reasoning_effort,
        });
        return textResult(result.text + footer(result), {
          reply: result.text,
          model: result.model,
          usage: result.usage ?? null,
        });
      }

      // Multi-turn: load or start the thread.
      const { conversation, created } = ctx.store.getOrCreate({
        id: args.conversation_id,
        model,
        systemPrompt,
      });
      const result = await ctx.backend.chat({
        model,
        messages: [...conversation.messages, userMsg],
        temperature: args.temperature,
        maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
        reasoningEffort: args.reasoning_effort,
      });
      // Only save the turn once ChatGPT has answered, so failed calls leave history clean.
      const updated = ctx.store.append(
        conversation.id,
        [userMsg, { role: "assistant", content: result.text }],
        result.usage?.totalTokens ?? 0,
        result.model,
      );
      const turns = updated.messages.filter((m) => m.role === "user").length;
      return textResult(
        result.text +
          footer(result, [`conversation: ${conversation.id}${created ? " (new)" : ""}`, `turns kept: ${turns}`]),
        {
          reply: result.text,
          model: result.model,
          conversation_id: conversation.id,
          new_conversation: created,
          usage: result.usage ?? null,
        },
      );
    }),
  );
}
