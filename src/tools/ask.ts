/**
 * chatgpt_ask and ai_ask: send a message to an AI, optionally as part of an
 * ongoing conversation. chatgpt_ask uses the default provider (normally
 * ChatGPT); ai_ask is the same tool with the provider front and centre, so
 * Claude reaches for it when the user names another AI ("ask Gemini...").
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ChatMessage, ReasoningEffort } from "../backend.js";
import { buildFileContext } from "../files.js";
import { footer, modelOptions, resolveTarget, safe, textResult, type ToolContext } from "./shared.js";

interface AskArgs {
  message: string;
  conversation_id?: string;
  system_prompt?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
  reasoning_effort?: ReasoningEffort;
  files?: string[];
}

export async function handleAsk(ctx: ToolContext, args: AskArgs): Promise<CallToolResult> {
  const systemPrompt = args.system_prompt ?? ctx.config.defaultSystemPrompt;
  const fileBlock = buildFileContext(args.files, {
    allowedDirs: ctx.config.allowedFileDirs,
    maxFileBytes: ctx.config.maxFileBytes,
    maxTotalBytes: ctx.config.maxTotalFileBytes,
  });
  const userMsg: ChatMessage = { role: "user", content: args.message + fileBlock };
  const common = {
    temperature: args.temperature,
    maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
    reasoningEffort: args.reasoning_effort,
  };

  // One-off question: no history kept.
  if (!args.conversation_id) {
    const target = resolveTarget(ctx, args.provider, args.model);
    const messages: ChatMessage[] = systemPrompt ? [{ role: "system", content: systemPrompt }, userMsg] : [userMsg];
    const result = await ctx.backend.chat({ provider: target.provider, model: target.model, messages, ...common });
    return textResult(result.text + footer({ provider: target.provider, ...result }), {
      reply: result.text,
      provider: target.provider,
      model: result.model,
      usage: result.usage ?? null,
    });
  }

  // Multi-turn: an existing thread keeps its AI unless the caller names a different one.
  const existing = ctx.store.get(args.conversation_id);
  const target = resolveTarget(
    ctx,
    args.provider ?? existing?.provider,
    args.model ?? (args.provider ? undefined : existing?.model),
  );
  const { conversation, created } = ctx.store.getOrCreate({
    id: args.conversation_id,
    model: target.model,
    provider: target.provider,
    systemPrompt,
  });
  const result = await ctx.backend.chat({
    provider: target.provider,
    model: target.model,
    messages: [...conversation.messages, userMsg],
    ...common,
  });
  // Only save the turn once the AI has answered, so failed calls leave history clean.
  const updated = ctx.store.append(
    conversation.id,
    [userMsg, { role: "assistant", content: result.text }],
    result.usage?.totalTokens ?? 0,
    result.model,
    target.provider,
  );
  const turns = updated.messages.filter((m) => m.role === "user").length;
  return textResult(
    result.text +
      footer({ provider: target.provider, ...result }, [
        `conversation: ${conversation.id}${created ? " (new)" : ""}`,
        `turns kept: ${turns}`,
      ]),
    {
      reply: result.text,
      provider: target.provider,
      model: result.model,
      conversation_id: conversation.id,
      new_conversation: created,
      usage: result.usage ?? null,
    },
  );
}

const sharedInputs = {
  message: z.string().min(1).describe("The message to send. Include all needed context: the AI cannot see this chat."),
  conversation_id: z
    .string()
    .optional()
    .describe(
      "Optional thread ID. Reuse it to continue a conversation; use a new value (e.g. 'research-1') to start one. " +
        "Letters, numbers, '-' and '_' only. A thread remembers which AI it is with.",
    ),
  system_prompt: z
    .string()
    .optional()
    .describe("Optional instructions for the AI's role or style. Only applied when a conversation starts."),
  files: z
    .array(z.string())
    .max(20)
    .optional()
    .describe("Optional paths of text/code files to share with the AI (only inside ALLOWED_FILE_DIRS)."),
};

export function registerAskTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_ask",
    {
      title: "Ask ChatGPT",
      description:
        "Send a message to ChatGPT (or the bridge's default AI) and get its reply. " +
        "Use this when the user asks to 'ask ChatGPT' or wants a second model's view. " +
        "For a multi-turn chat, pass the same conversation_id on every call. " +
        "To ask a different AI by name (Gemini, Grok, Claude, DeepSeek...), use ai_ask instead. " +
        "The other AI cannot see this conversation, so include all the context it needs.",
      inputSchema: { ...sharedInputs, ...modelOptions },
      annotations: { title: "Ask ChatGPT", readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_ask", (args) => handleAsk(ctx, args)),
  );

  server.registerTool(
    "ai_ask",
    {
      title: "Ask any AI",
      description:
        "Send a message to a specific AI model: ChatGPT, Claude, Gemini, Grok, DeepSeek, Mistral, Llama, Perplexity, " +
        "Kimi, Qwen, Cohere, models on Groq or OpenRouter, or a local model via Ollama/LM Studio. " +
        "Use this whenever the user names an AI ('ask Gemini', 'what does Grok think'). " +
        "Pass the same conversation_id to keep a multi-turn thread with that AI.",
      inputSchema: {
        provider: z
          .string()
          .min(1)
          .describe(
            "Which AI: openai/chatgpt, anthropic/claude, gemini, xai/grok, deepseek, mistral, meta/llama, perplexity, " +
              "moonshot/kimi, qwen, cohere, groq, openrouter, ollama, lmstudio.",
          ),
        ...sharedInputs,
        model: modelOptions.model,
        temperature: modelOptions.temperature,
        max_output_tokens: modelOptions.max_output_tokens,
        reasoning_effort: modelOptions.reasoning_effort,
      },
      annotations: { title: "Ask any AI", readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "ai_ask", (args) => handleAsk(ctx, args)),
  );
}
