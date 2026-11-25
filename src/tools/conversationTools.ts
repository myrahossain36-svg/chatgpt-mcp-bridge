/**
 * Tools for managing ChatGPT conversation threads.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safe, textResult, type ToolContext } from "./shared.js";

export function registerConversationTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_list_conversations",
    {
      title: "List ChatGPT conversations",
      description: "List the conversation threads this bridge is holding (with ChatGPT or any other AI), newest first.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(ctx, "chatgpt_list_conversations", async () => {
      const items = ctx.store.list();
      if (items.length === 0) {
        return textResult("No conversations yet. Call chatgpt_ask with a conversation_id to start one.", {
          conversations: [],
        });
      }
      const lines = items.map(
        (c) =>
          `- ${c.id}: "${c.title}" (${c.turns} turn(s), ${c.provider ? `${c.provider}/` : ""}${c.model}, last used ${c.updatedAt})`,
      );
      return textResult(`${items.length} conversation(s):\n${lines.join("\n")}`, { conversations: items });
    }),
  );

  server.registerTool(
    "chatgpt_get_conversation",
    {
      title: "Show a ChatGPT conversation",
      description: "Show the full message history of one ChatGPT conversation thread.",
      inputSchema: {
        conversation_id: z.string().min(1).describe("The conversation ID to show."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(ctx, "chatgpt_get_conversation", async ({ conversation_id }) => {
      const conv = ctx.store.get(conversation_id);
      if (!conv) {
        return textResult(`No conversation called "${conversation_id}". Use chatgpt_list_conversations to see them.`);
      }
      const body = conv.messages
        .map((m) => `### ${m.role === "assistant" ? "AI" : m.role === "user" ? "Claude/user" : "System"}\n${m.content}`)
        .join("\n\n");
      return textResult(`Conversation ${conv.id} ("${conv.title}"), ${conv.provider ? `${conv.provider}/` : ""}${conv.model}\n\n${body}`, {
        conversation: conv as unknown as Record<string, unknown>,
      });
    }),
  );

  server.registerTool(
    "chatgpt_reset_conversation",
    {
      title: "Delete ChatGPT conversation(s)",
      description:
        "Forget a ChatGPT conversation so the next message with that ID starts fresh. " +
        "Set all=true to delete every conversation.",
      inputSchema: {
        conversation_id: z.string().optional().describe("The conversation to delete."),
        all: z.boolean().optional().describe("Delete all conversations."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    safe(ctx, "chatgpt_reset_conversation", async ({ conversation_id, all }) => {
      if (all) {
        const n = ctx.store.clear();
        return textResult(`Deleted ${n} conversation(s).`);
      }
      if (!conversation_id) return textResult("Pass conversation_id, or all=true to delete everything.");
      return textResult(
        ctx.store.delete(conversation_id)
          ? `Deleted conversation "${conversation_id}".`
          : `No conversation called "${conversation_id}" (nothing to delete).`,
      );
    }),
  );
}
