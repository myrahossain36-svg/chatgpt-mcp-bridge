/**
 * MCP prompts: ready-made workflows that appear in Claude's prompt / slash
 * menu (for example in Claude Desktop's "+" menu, or as /mcp__chatgpt__... in Claude Code).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./tools/shared.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "cross_check",
    {
      title: "Cross-check with ChatGPT",
      description: "Claude answers a question, then asks ChatGPT for a second opinion and reconciles the two.",
      argsSchema: { question: z.string().describe("The question to answer and cross-check") },
    },
    ({ question }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Answer this question carefully:\n\n${question}\n\n` +
              "Then call the chatgpt_second_opinion tool with the question and your answer. " +
              "Finally, give me a reconciled answer: say where you and ChatGPT agree, where you differ, " +
              "and which view you think is right and why.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "council",
    {
      title: "Two-model council",
      description: "Claude and ChatGPT each propose an approach to a problem, then Claude merges the best of both.",
      argsSchema: { problem: z.string().describe("The problem or decision to work through") },
    },
    ({ problem }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Problem: ${problem}\n\n` +
              "1. Write your own proposed approach.\n" +
              "2. Without showing ChatGPT your approach, use chatgpt_ask to get ChatGPT's independent approach " +
              "(give it the full problem).\n" +
              "3. Compare the two side by side and produce a final merged recommendation.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "review_my_code",
    {
      title: "Dual code review",
      description: "Claude and ChatGPT both review the same code; Claude merges and de-duplicates the findings.",
      argsSchema: {
        code: z.string().describe("The code to review"),
        language: z.string().optional().describe("Programming language"),
      },
    },
    ({ code, language }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Review this ${language ?? ""} code yourself first, then call chatgpt_code_review on the same code. ` +
              "Merge both reviews into one prioritised list, marking which issues both models found.\n\n" +
              "```\n" +
              code +
              "\n```",
          },
        },
      ],
    }),
  );
}

/**
 * MCP resources: conversations are exposed as readable resources, so
 * clients that support resources can attach a whole ChatGPT thread as context.
 */
export function registerResources(server: McpServer, ctx: ToolContext): void {
  server.registerResource(
    "conversation",
    new ResourceTemplate("chatgpt://conversations/{id}", {
      list: async () => ({
        resources: ctx.store.list().map((c) => ({
          uri: `chatgpt://conversations/${c.id}`,
          name: c.title,
          description: `${c.turns} turn(s) with ${c.model}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "ChatGPT conversation",
      description: "The full history of a ChatGPT conversation thread held by the bridge.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const conv = ctx.store.get(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(conv ?? { error: `No conversation "${id}"` }, null, 2),
          },
        ],
      };
    },
  );
}
