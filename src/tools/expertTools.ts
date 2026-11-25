/**
 * Purpose-built tools that wrap chatgpt_ask with carefully written prompts:
 * second opinions, code review, structured JSON output and debate.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { footer, modelOptions, resolveTarget, safe, textResult, type ToolContext } from "./shared.js";

export const SECOND_OPINION_SYSTEM = `You are an independent expert reviewer giving a second opinion on another AI assistant's answer.
Be direct and specific. Do not flatter. Structure your reply as:
1. Verdict: one line (Agree / Partly agree / Disagree).
2. What is right.
3. What is wrong, missing or risky (most important first), each with why.
4. A better or corrected answer, if one is needed.
If you are unsure about a fact, say so rather than guessing.`;

export const CODE_REVIEW_SYSTEM = `You are a senior software engineer doing a careful code review.
Report only real issues. For each issue give: severity (critical / major / minor / nit), location (line or function),
the problem, and a concrete fix (show code where useful). Finish with a short overall assessment.
If the code is good, say so briefly instead of inventing problems.`;

export function registerExpertTools(server: McpServer, ctx: ToolContext): void {
  // ---------------------------------------------------------------- second opinion
  server.registerTool(
    "chatgpt_second_opinion",
    {
      title: "Get a second opinion from ChatGPT",
      description:
        "Ask ChatGPT (or any AI, via provider) to critically review an answer, plan or piece of writing, for example " +
        "Claude's own draft, and say what is right, wrong or missing. Useful for cross-checking important answers between models.",
      inputSchema: {
        question: z.string().min(1).describe("The original question or task."),
        answer: z.string().min(1).describe("The answer, plan or draft to be reviewed."),
        focus: z
          .string()
          .optional()
          .describe("Optional: what to concentrate on, e.g. 'factual accuracy', 'security', 'tone'."),
        ...modelOptions,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_second_opinion", async (args) => {
      const t = resolveTarget(ctx, args.provider, args.model);
      const user =
        `## Original question or task\n${args.question}\n\n## Answer to review\n${args.answer}` +
        (args.focus ? `\n\n## Focus\nConcentrate on: ${args.focus}` : "");
      const result = await ctx.backend.chat({
        provider: t.provider,
        model: t.model,
        messages: [
          { role: "system", content: SECOND_OPINION_SYSTEM },
          { role: "user", content: user },
        ],
        temperature: args.temperature ?? 0.3,
        maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
        reasoningEffort: args.reasoning_effort,
      });
      return textResult(result.text + footer({ provider: t.provider, ...result }), { review: result.text, model: result.model });
    }),
  );

  // ---------------------------------------------------------------- code review
  server.registerTool(
    "chatgpt_code_review",
    {
      title: "ChatGPT code review",
      description:
        "Have ChatGPT (or any AI, via provider) review code for bugs, security problems, performance and readability, " +
        "with severity ratings and suggested fixes.",
      inputSchema: {
        code: z.string().min(1).describe("The code to review."),
        language: z.string().optional().describe("Programming language, e.g. 'TypeScript'."),
        context: z.string().optional().describe("Optional: what the code is meant to do, or the surrounding system."),
        focus: z
          .array(z.enum(["bugs", "security", "performance", "readability", "tests", "style"]))
          .optional()
          .describe("Optional: limit the review to these areas."),
        ...modelOptions,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_code_review", async (args) => {
      const t = resolveTarget(ctx, args.provider, args.model);
      const fence = args.code.includes("```") ? "~~~~" : "```";
      const parts = [
        args.context ? `## Context\n${args.context}` : "",
        args.focus?.length ? `## Focus areas\n${args.focus.join(", ")}` : "",
        `## Code${args.language ? ` (${args.language})` : ""}\n${fence}${args.language?.toLowerCase() ?? ""}\n${args.code}\n${fence}`,
      ].filter(Boolean);
      const result = await ctx.backend.chat({
        provider: t.provider,
        model: t.model,
        messages: [
          { role: "system", content: CODE_REVIEW_SYSTEM },
          { role: "user", content: parts.join("\n\n") },
        ],
        temperature: args.temperature ?? 0.2,
        maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
        reasoningEffort: args.reasoning_effort,
      });
      return textResult(result.text + footer({ provider: t.provider, ...result }), { review: result.text, model: result.model });
    }),
  );

  // ---------------------------------------------------------------- structured JSON
  server.registerTool(
    "chatgpt_structured",
    {
      title: "Get JSON from ChatGPT",
      description:
        "Ask ChatGPT (or any AI, via provider) for a machine-readable JSON object (for example, extracting fields from text, " +
        "classifying items, or generating test data). Describe the shape you want in json_shape.",
      inputSchema: {
        instruction: z.string().min(1).describe("What ChatGPT should produce."),
        json_shape: z
          .string()
          .min(1)
          .describe('Describe the JSON object wanted, e.g. \'{"name": string, "tags": string[]}\'.'),
        input: z.string().optional().describe("Optional source text or data to work on."),
        ...modelOptions,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_structured", async (args) => {
      const t = resolveTarget(ctx, args.provider, args.model);
      const result = await ctx.backend.chat({
        provider: t.provider,
        model: t.model,
        jsonMode: true,
        messages: [
          {
            role: "system",
            content:
              "Reply with a single valid JSON object and nothing else. No markdown, no commentary. " +
              `The object must match this shape:\n${args.json_shape}`,
          },
          {
            role: "user",
            content: args.input ? `${args.instruction}\n\n## Input\n${args.input}` : args.instruction,
          },
        ],
        temperature: args.temperature ?? 0,
        maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
        reasoningEffort: args.reasoning_effort,
      });
      const parsed = parseJsonLoose(result.text);
      if (parsed === undefined) {
        return textResult(
          "ChatGPT did not return valid JSON. Raw reply below:\n\n" + result.text + footer({ provider: t.provider, ...result }),
          { valid_json: false, raw: result.text },
        );
      }
      return textResult(JSON.stringify(parsed, null, 2) + footer({ provider: t.provider, ...result }), {
        valid_json: true,
        data: parsed as Record<string, unknown>,
      });
    }),
  );

  // ---------------------------------------------------------------- debate
  server.registerTool(
    "chatgpt_debate",
    {
      title: "Debate a position with ChatGPT",
      description:
        "Ask ChatGPT (or any AI, via provider) to argue against (or for) a position so you can stress-test an idea. " +
        "ChatGPT gives its strongest arguments, then the best counter-points, then a balanced conclusion.",
      inputSchema: {
        position: z.string().min(1).describe("The claim, decision or plan to stress-test."),
        stance: z
          .enum(["against", "for", "both"])
          .default("against")
          .describe("Which side ChatGPT should argue. Default: against."),
        rounds_context: z
          .string()
          .optional()
          .describe("Optional: earlier arguments already made, so ChatGPT can respond to them."),
        ...modelOptions,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "chatgpt_debate", async (args) => {
      const t = resolveTarget(ctx, args.provider, args.model);
      const stance = args.stance ?? "against";
      const sys =
        `You are a sharp, fair debater. Argue ${stance === "both" ? "both sides of" : stance} the position given. ` +
        "Give your 3 to 5 strongest arguments with reasons and evidence types, then the best counter-arguments, " +
        "then a short balanced conclusion. Flag any factual claims that should be verified.";
      const result = await ctx.backend.chat({
        provider: t.provider,
        model: t.model,
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content:
              `## Position\n${args.position}` +
              (args.rounds_context ? `\n\n## Arguments already made\n${args.rounds_context}` : ""),
          },
        ],
        temperature: args.temperature ?? 0.7,
        maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
        reasoningEffort: args.reasoning_effort,
      });
      return textResult(result.text + footer({ provider: t.provider, ...result }), { debate: result.text, model: result.model });
    }),
  );
}

/** Parse JSON, tolerating a ```json fence or text around the object. */
export function parseJsonLoose(text: string): unknown {
  const attempts = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* try next */
    }
  }
  return undefined;
}
