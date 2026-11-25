/**
 * ai_team: make several AIs work together, with Claude in charge.
 *
 * Three ways of working:
 *  - review:     one AI is the author; the others review; the author revises.
 *                Repeats for N rounds, or stops early once every reviewer approves.
 *                Claude can supply its own draft, so the team improves Claude's work.
 *  - discussion: every AI answers, then reads the others' answers and refines its own.
 *  - pipeline:   each AI does its job in turn (e.g. researcher -> writer -> editor),
 *                seeing everything done before it.
 *
 * The full session is saved as a thread (team_id), so it can be shown later
 * with chatgpt_get_conversation or continued with another ai_team call.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BackendError, type ChatMessage, type ChatResult } from "../backend.js";
import { ConfigError } from "../config.js";
import { buildFileContext } from "../files.js";
import { resolveTarget, safe, textResult, type Target, type ToolContext } from "./shared.js";

export const ROLES: Record<string, string> = {
  author: "You are the author. Produce the best complete answer to the task.",
  coder:
    "You are a senior software engineer. Write correct, complete, idiomatic code with short explanations. " +
    "Handle edge cases and errors. Never leave placeholders such as 'TODO' or '...'.",
  reviewer:
    "You are a meticulous reviewer. Find real problems (correctness, gaps, unclear parts) and give specific, " +
    "actionable fixes. Do not rewrite the whole thing. Rank issues by importance.",
  critic:
    "You are a sharp critic. Find weaknesses, risky assumptions, missing considerations and better alternatives. " +
    "Be direct and specific.",
  security:
    "You are a security engineer. Look only for security and privacy problems: injection, secrets, auth, unsafe input, " +
    "data exposure. Give severity and fixes.",
  tester:
    "You are a test engineer. Identify edge cases and failure modes, and write concrete test cases (as code where relevant).",
  researcher:
    "You are a researcher. Set out the relevant facts, options and considerations. Clearly flag anything uncertain " +
    "or that should be verified.",
  writer: "You are a skilled writer. Turn the material into clear, well-structured, readable text for the intended audience.",
  editor: "You are an editor. Improve clarity, structure, tone and concision without changing the meaning.",
  planner: "You are a planner. Break the task into clear, ordered steps with owners, risks and checkpoints.",
  devils_advocate: "You argue the opposite case as strongly and fairly as you can, so the idea is properly stress-tested.",
  summariser: "You summarise the material accurately and concisely, keeping every important point.",
  expert: "You are a domain expert. Give a precise, expert answer and note where professional advice is needed.",
};

const ROLE_NAMES = Object.keys(ROLES);
const MAX_MEMBERS = 6;
const TRANSCRIPT_SNIPPET = 1500;
const TEAM_RULES =
  "You are part of a team of AI models working together on a task, coordinated by Claude. " +
  "Other team members are different AI models. Be concise, specific and constructive. " +
  "Do not include greetings or meta-commentary.";

interface MemberInput {
  provider: string;
  role?: string;
  model?: string;
}

interface Member {
  target: Target;
  roleName: string;
  roleText: string;
  label: string;
}

interface Turn {
  round: number;
  label: string;
  kind: string;
  text: string;
  ok: boolean;
}

function resolveMembers(ctx: ToolContext, inputs: MemberInput[]): Member[] {
  const labels = new Map<string, number>();
  return inputs.map((m) => {
    const target = resolveTarget(ctx, m.provider, m.model);
    const key = (m.role ?? "").trim();
    const known = ROLES[key.toLowerCase().replace(/[\s-]+/g, "_")];
    const roleName = known ? key.toLowerCase().replace(/[\s-]+/g, "_") : key ? "custom" : "member";
    const roleText = known ?? (key ? `Your role: ${key}` : "Contribute your best thinking to the task.");
    let label = `${target.name.replace(/ \(.*\)$/, "")} (${known ? roleName.replace(/_/g, " ") : key || "member"})`;
    const n = (labels.get(label) ?? 0) + 1;
    labels.set(label, n);
    if (n > 1) label += ` #${n}`;
    return { target, roleName, roleText, label };
  });
}

function short(text: string): string {
  return text.length > TRANSCRIPT_SNIPPET ? text.slice(0, TRANSCRIPT_SNIPPET) + " [...]" : text;
}

export function estimateCalls(mode: string, members: number, rounds: number, hasDraft: boolean): number {
  if (mode === "pipeline") return members;
  if (mode === "discussion") return members * rounds;
  // review: optional initial draft + rounds * (reviewers + author revision)
  return (hasDraft ? 0 : 1) + rounds * members;
}

export function registerTeamTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "ai_team",
    {
      title: "Run an AI team",
      description:
        "Make several AI models work together as a team on a task, for work or code. Modes: " +
        "'review' (first member writes or revises, the others review, repeated for several rounds until approved; " +
        "pass your own draft to have the team improve YOUR work), 'discussion' (all answer, then read each other's " +
        "answers and refine), 'pipeline' (each member does its role in order, e.g. researcher -> writer -> editor). " +
        `Roles: ${ROLE_NAMES.join(", ")}, or any custom role text. Use for code reviews, document drafting, ` +
        "planning, decisions and debugging. Afterwards, check the result yourself and tell the user which AI did what.",
      inputSchema: {
        task: z.string().min(1).describe("What the team should produce or decide. Be specific about the goal and audience."),
        mode: z.enum(["review", "discussion", "pipeline"]).default("review").describe("How the team works together."),
        members: z
          .array(
            z.object({
              provider: z.string().min(1).describe("Which AI, e.g. 'openai', 'gemini', 'grok', 'claude', 'deepseek'."),
              role: z.string().optional().describe(`A role (${ROLE_NAMES.join(", ")}) or your own role description.`),
              model: z.string().optional().describe("Optional specific model."),
            }),
          )
          .min(2)
          .max(MAX_MEMBERS)
          .describe("2 to 6 team members. In review mode the FIRST member is the author/reviser."),
        rounds: z.number().int().min(1).max(3).default(2).describe("Review or discussion rounds (1 to 3). Ignored for pipeline."),
        draft: z
          .string()
          .optional()
          .describe("Review mode: an existing draft (for example your own) for the team to improve, instead of writing from scratch."),
        context: z.string().optional().describe("Background the whole team needs: requirements, constraints, earlier decisions."),
        files: z
          .array(z.string())
          .max(20)
          .optional()
          .describe("Paths of text/code files to share with the team (only inside ALLOWED_FILE_DIRS)."),
        team_id: z
          .string()
          .optional()
          .describe("Optional name to save this session under (e.g. 'login-refactor'). Reuse it to continue from the last result."),
        max_output_tokens: z.number().int().min(1).max(128_000).optional().describe("Reply limit per contribution."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(ctx, "ai_team", (args) => runTeam(ctx, args)),
  );
}

export interface TeamArgs {
  task: string;
  mode?: "review" | "discussion" | "pipeline";
  members: MemberInput[];
  rounds?: number;
  draft?: string;
  context?: string;
  files?: string[];
  team_id?: string;
  max_output_tokens?: number;
}

export async function runTeam(ctx: ToolContext, args: TeamArgs): Promise<CallToolResult> {
  const started = Date.now();
  const mode = args.mode ?? "review";
  const rounds = args.rounds ?? 2;
  const members = resolveMembers(ctx, args.members);
  if (mode === "review" && members.length < 2) throw new ConfigError("Review mode needs an author and at least one reviewer.");

  const planned = estimateCalls(mode, members.length, rounds, Boolean(args.draft));
  if (planned > ctx.config.maxTeamCalls) {
    throw new ConfigError(
      `This team session would make up to ${planned} AI calls, above MAX_TEAM_CALLS (${ctx.config.maxTeamCalls}). ` +
        "Use fewer members or rounds, or raise MAX_TEAM_CALLS.",
    );
  }

  const fileBlock = buildFileContext(args.files, {
    allowedDirs: ctx.config.allowedFileDirs,
    maxFileBytes: ctx.config.maxFileBytes,
    maxTotalBytes: ctx.config.maxTotalFileBytes,
  });

  // Continue from a saved session: give the team the previous final result.
  let previous = "";
  if (args.team_id) {
    const prior = ctx.store.get(args.team_id);
    const lastFinal = [...(prior?.messages ?? [])].reverse().find((m) => m.content.startsWith("[FINAL]"));
    if (lastFinal) previous = `\n\n## Result of the previous team session\n${lastFinal.content.replace(/^\[FINAL\]\s*/, "")}`;
  }

  const brief =
    `## Task\n${args.task}` + (args.context ? `\n\n## Context\n${args.context}` : "") + previous + fileBlock;

  const turns: Turn[] = [];
  let calls = 0;
  let tokens = 0;

  const ask = async (m: Member, instruction: string): Promise<ChatResult> => {
    calls++;
    const messages: ChatMessage[] = [
      { role: "system", content: `${TEAM_RULES}\n\n${m.roleText}` },
      { role: "user", content: `${brief}\n\n## Your job now\n${instruction}` },
    ];
    const r = await ctx.backend.chat({
      provider: m.target.provider,
      model: m.target.model,
      messages,
      maxOutputTokens: args.max_output_tokens ?? ctx.config.maxOutputTokens,
    });
    tokens += r.usage?.totalTokens ?? 0;
    return r;
  };
  const record = (round: number, m: Member, kind: string, text: string, ok = true) =>
    turns.push({ round, label: m.label, kind, text, ok });
  const failText = (err: unknown) => {
    const e = err instanceof BackendError ? err : new BackendError(String((err as Error)?.message ?? err));
    return `FAILED: ${e.message}${e.hint ? ` (${e.hint})` : ""}`;
  };

  let final = "";
  let finalBy = "";
  let note = "";

  if (mode === "review") {
    const [author, ...reviewers] = members;
    let draft = args.draft ?? "";
    let draftBy = "Claude (starting draft)";
    if (!draft) {
      const r = await ask(author, "Write the complete first draft.");
      draft = r.text;
      draftBy = author.label;
      record(0, author, "first draft", draft);
    } else {
      turns.push({ round: 0, label: "Claude", kind: "starting draft", text: draft, ok: true });
    }
    for (let round = 1; round <= rounds; round++) {
      const reviews = await Promise.all(
        reviewers.map(async (rv) => {
          try {
            const r = await ask(
              rv,
              `Review this draft.\n\n## Draft\n${draft}\n\n` +
                "If it has no significant problems left, start your reply with the single word APPROVED, then any minor notes. " +
                "Otherwise list the problems, most important first, each with a concrete fix.",
            );
            record(round, rv, "review", r.text);
            return { rv, text: r.text, ok: true };
          } catch (err) {
            const t = failText(err);
            record(round, rv, "review", t, false);
            return { rv, text: t, ok: false };
          }
        }),
      );
      const usable = reviews.filter((r) => r.ok);
      if (usable.length === 0) {
        note = "No reviewer could respond, so the draft was not revised further.";
        break;
      }
      if (usable.every((r) => /^\W*approved\b/i.test(r.text))) {
        note = `All reviewers approved in round ${round}.`;
        break;
      }
      const feedback = usable.map((r) => `### ${r.rv.label}\n${r.text}`).join("\n\n");
      const rev = await ask(
        author,
        `Revise the draft using the reviewers' feedback. Accept good points; you may reject a point if it is wrong, but say why.\n\n` +
          `## Current draft\n${draft}\n\n## Feedback\n${feedback}\n\n` +
          "Output the complete revised version first. Then add a short section headed 'Changes made' listing what you changed and anything you rejected.",
      );
      draft = rev.text;
      draftBy = `${author.label}, revision ${round}`;
      record(round, author, "revision", draft);
    }
    final = draft;
    finalBy = draftBy;
    if (!note) note = `Completed ${rounds} review round(s).`;
  } else if (mode === "discussion") {
    let latest = new Map<Member, string>();
    for (let round = 1; round <= rounds; round++) {
      const prev = latest;
      const next = new Map<Member, string>();
      await Promise.all(
        members.map(async (m) => {
          if (round > 1 && !prev.has(m)) return; // dropped after failing
          const others = [...prev.entries()].filter(([o]) => o !== m).map(([o, t]) => `### ${o.label}\n${t}`).join("\n\n");
          const instruction =
            round === 1
              ? "Give your answer."
              : `Here are the other team members' latest answers:\n\n${others}\n\n` +
                (round === rounds
                  ? "Give your FINAL answer. Say briefly where you agree, where you changed your mind, and why."
                  : "Refine your answer in light of theirs. Point out anything they got wrong and anything you now see differently.");
          try {
            const r = await ask(m, instruction);
            next.set(m, r.text);
            record(round, m, round === rounds ? "final answer" : round === 1 ? "answer" : "refined answer", r.text);
          } catch (err) {
            record(round, m, "answer", failText(err), false);
          }
        }),
      );
      latest = next;
      if (latest.size === 0) break;
    }
    final = [...latest.entries()].map(([m, t]) => `### ${m.label}\n${t}`).join("\n\n");
    finalBy = "each member's final position";
    note = `${latest.size} of ${members.length} member(s) gave final answers after ${rounds} round(s). Synthesise them for the user.`;
  } else {
    // pipeline
    let soFar = "";
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const isLast = i === members.length - 1;
      const instruction =
        (soFar ? `Work done by earlier team members:\n${soFar}\n\n` : "") +
        `Do your part as the ${m.roleName === "custom" ? "team member described in your role" : m.roleName.replace(/_/g, " ")}.` +
        (isLast ? " You are the last step: produce the finished result." : " Your output goes to the next team member.");
      try {
        const r = await ask(m, instruction);
        record(1, m, `step ${i + 1}`, r.text);
        soFar += `\n### Step ${i + 1}: ${m.label}\n${r.text}\n`;
        final = r.text;
        finalBy = m.label;
      } catch (err) {
        record(1, m, `step ${i + 1}`, failText(err), false);
        note = `Stopped at step ${i + 1} because ${m.label} failed.`;
        break;
      }
    }
    if (!note) note = `All ${members.length} step(s) completed.`;
  }

  // Save the session as a thread.
  const teamId = args.team_id;
  if (teamId) {
    const { conversation } = ctx.store.getOrCreate({ id: teamId, model: mode, provider: "team", title: `Team: ${args.task}` });
    ctx.store.append(
      conversation.id,
      [
        { role: "user", content: `[TASK · ${mode}] ${args.task}` },
        ...turns.map((t) => ({ role: "assistant" as const, content: `[Round ${t.round} · ${t.label} · ${t.kind}] ${t.text}` })),
        { role: "assistant", content: `[FINAL] ${final}` },
      ],
      tokens,
    );
  }

  const roster = members.map((m) => `${m.label}${m.target.model ? ` [${m.target.model}]` : ""}`).join(", ");
  const log = turns
    .map((t) => `**Round ${t.round} · ${t.label} · ${t.kind}**${t.ok ? "" : " (failed)"}\n${short(t.text)}`)
    .join("\n\n");
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const text =
    `# Team result (${mode})\nTeam: ${roster}\n${note}\n\n## Final result (${finalBy})\n${final || "(no result)"}\n\n` +
    `## How the team got there\n${log}\n\n---\n[${calls} AI call(s) | ${tokens} tokens | ${secs}s${teamId ? ` | saved as ${teamId}` : ""}]`;

  return textResult(text, {
    mode,
    final,
    final_by: finalBy,
    note,
    team_id: teamId ?? null,
    calls,
    tokens,
    turns: turns.map((t) => ({ round: t.round, member: t.label, kind: t.kind, ok: t.ok, text: t.text })),
  });
}
