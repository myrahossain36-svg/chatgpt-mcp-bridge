import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatRequest } from "../src/backend.js";
import { BackendError } from "../src/backend.js";
import { loadConfig } from "../src/config.js";
import { buildFileContext } from "../src/files.js";
import { estimateCalls } from "../src/tools/teamTools.js";
import { connectTestClient, FakeBackend, textOf } from "./helpers.js";

function teamConfig(extra: Record<string, string> = {}) {
  return loadConfig({
    OPENAI_API_KEY: "sk-test-openai-123",
    GEMINI_API_KEY: "g",
    XAI_API_KEY: "x",
    LOG_LEVEL: "silent",
    ...extra,
  });
}

const last = (r: ChatRequest) => r.messages[r.messages.length - 1].content;

describe("ai_team review mode", () => {
  it("drafts, reviews and revises over the requested rounds", async () => {
    const backend = new FakeBackend();
    let revision = 0;
    backend.reply = (req) => {
      const job = last(req);
      if (job.includes("Write the complete first draft")) return "DRAFT v0";
      if (job.includes("Review this draft")) return `Issue found by ${req.provider}`;
      if (job.includes("Revise the draft")) return `DRAFT v${++revision}\nChanges made: fixed`;
      return "?";
    };
    const { client } = await connectTestClient({ config: teamConfig(), backend });
    const res = await client.callTool({
      name: "ai_team",
      arguments: {
        task: "Write a function",
        mode: "review",
        rounds: 2,
        members: [
          { provider: "openai", role: "coder" },
          { provider: "gemini", role: "reviewer" },
          { provider: "grok", role: "security" },
        ],
      },
    });
    const sc = res.structuredContent as { final: string; calls: number; final_by: string };
    expect(sc.final).toContain("DRAFT v2");
    expect(sc.calls).toBe(estimateCalls("review", 3, 2, false)); // 1 + 2*3 = 7
    expect(sc.final_by).toContain("revision 2");
    // Reviewers see the current draft; the author's system prompt carries its role.
    const authorCall = backend.calls.find((c) => last(c).includes("Write the complete first draft"))!;
    expect(authorCall.provider).toBe("openai");
    expect(authorCall.messages[0].content).toContain("senior software engineer");
    expect(textOf(res)).toContain("How the team got there");
  });

  it("stops early when every reviewer approves, and improves Claude's own draft", async () => {
    const backend = new FakeBackend();
    backend.reply = (req) => (last(req).includes("Review this draft") ? "APPROVED. Looks good." : "unexpected");
    const { client } = await connectTestClient({ config: teamConfig(), backend });
    const res = await client.callTool({
      name: "ai_team",
      arguments: {
        task: "Check my email",
        draft: "Dear Sam, ...",
        rounds: 3,
        members: [{ provider: "openai" }, { provider: "gemini", role: "editor" }],
      },
    });
    const sc = res.structuredContent as { final: string; calls: number; note: string; final_by: string };
    expect(sc.calls).toBe(1);
    expect(sc.final).toBe("Dear Sam, ...");
    expect(sc.note).toContain("approved in round 1");
    expect(sc.final_by).toContain("Claude");
  });

  it("keeps going when one reviewer fails", async () => {
    const backend = new FakeBackend();
    backend.chat = async function (req: ChatRequest) {
      this.calls.push(req);
      if (req.provider === "xai") throw new BackendError("rate limited", 429, "wait");
      const job = last(req);
      const text = job.includes("Review") ? "Needs a fix" : job.includes("Revise") ? "FIXED" : "FIRST";
      return { text, model: req.model, usage: { totalTokens: 10 } };
    };
    const { client } = await connectTestClient({ config: teamConfig(), backend });
    const res = await client.callTool({
      name: "ai_team",
      arguments: {
        task: "t",
        rounds: 1,
        members: [{ provider: "openai" }, { provider: "gemini" }, { provider: "grok" }],
      },
    });
    expect((res.structuredContent as { final: string }).final).toBe("FIXED");
    expect(textOf(res)).toContain("(failed)");
  });

  it("refuses sessions above MAX_TEAM_CALLS", async () => {
    const { client, backend } = await connectTestClient({ config: teamConfig({ MAX_TEAM_CALLS: "3" }) });
    const res = await client.callTool({
      name: "ai_team",
      arguments: { task: "t", rounds: 3, members: [{ provider: "openai" }, { provider: "gemini" }] },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("MAX_TEAM_CALLS");
    expect(backend.calls).toHaveLength(0);
  });
});

describe("ai_team discussion and pipeline", () => {
  it("discussion: each member sees the others' answers in later rounds", async () => {
    const backend = new FakeBackend();
    backend.reply = (req) => `${req.provider} view`;
    const { client } = await connectTestClient({ config: teamConfig(), backend });
    const res = await client.callTool({
      name: "ai_team",
      arguments: {
        task: "Pick a database",
        mode: "discussion",
        rounds: 2,
        members: [{ provider: "openai" }, { provider: "gemini" }, { provider: "grok", role: "devils_advocate" }],
      },
    });
    expect(backend.calls).toHaveLength(6);
    const round2 = backend.calls.filter((c) => last(c).includes("FINAL answer"));
    expect(round2).toHaveLength(3);
    const openaiR2 = round2.find((c) => c.provider === "openai")!;
    expect(last(openaiR2)).toContain("gemini view");
    expect(last(openaiR2)).not.toContain("openai view");
    expect((res.structuredContent as { final: string }).final).toContain("xAI Grok (devils advocate)");
  });

  it("pipeline: passes each step's work to the next and saves the session", async () => {
    const backend = new FakeBackend();
    backend.reply = (req) => `output of ${req.provider}`;
    const { client, store } = await connectTestClient({ config: teamConfig(), backend });
    const res = await client.callTool({
      name: "ai_team",
      arguments: {
        task: "Write a blog post",
        mode: "pipeline",
        team_id: "blog-1",
        members: [
          { provider: "gemini", role: "researcher" },
          { provider: "openai", role: "writer" },
          { provider: "grok", role: "editor" },
        ],
      },
    });
    expect(last(backend.calls[1])).toContain("output of gemini");
    expect(last(backend.calls[2])).toContain("output of openai");
    expect((res.structuredContent as { final: string }).final).toBe("output of xai");
    const saved = store.get("blog-1")!;
    expect(saved.messages.at(-1)!.content).toBe("[FINAL] output of xai");

    // Continuing the session gives the team the previous result.
    await client.callTool({
      name: "ai_team",
      arguments: {
        task: "Now shorten it",
        mode: "pipeline",
        team_id: "blog-1",
        members: [{ provider: "openai", role: "editor" }, { provider: "gemini", role: "summariser" }],
      },
    });
    expect(last(backend.calls[3])).toContain("Result of the previous team session");
  });

  it("supports custom roles", async () => {
    const backend = new FakeBackend();
    const { client } = await connectTestClient({ config: teamConfig(), backend });
    await client.callTool({
      name: "ai_team",
      arguments: {
        task: "t",
        mode: "pipeline",
        members: [{ provider: "openai", role: "a UK employment lawyer" }, { provider: "gemini", role: "editor" }],
      },
    });
    expect(backend.calls[0].messages[0].content).toContain("Your role: a UK employment lawyer");
  });
});

describe("file sharing", () => {
  const root = mkdtempSync(join(tmpdir(), "share-"));
  const allowed = join(root, "project");
  const secret = join(root, "secret");
  mkdirSync(allowed);
  mkdirSync(secret);
  writeFileSync(join(allowed, "app.ts"), "export const x = 1;\n");
  writeFileSync(join(allowed, "logo.png"), "PNG");
  writeFileSync(join(secret, "keys.txt"), "TOP SECRET");
  try {
    symlinkSync(join(secret, "keys.txt"), join(allowed, "link.txt"));
  } catch {
    /* symlinks may be unavailable on some systems */
  }
  const limits = { allowedDirs: [allowed], maxFileBytes: 1000, maxTotalBytes: 2000 };

  it("is off unless ALLOWED_FILE_DIRS is set", () => {
    expect(() => buildFileContext(["app.ts"], { ...limits, allowedDirs: [] })).toThrow(/File sharing is switched off/);
  });

  it("shares allowed text files with a language fence", () => {
    const block = buildFileContext(["app.ts"], limits);
    expect(block).toContain("### File: app.ts");
    expect(block).toContain("```typescript");
    expect(block).toContain("export const x = 1;");
  });

  it("blocks paths outside the allowed folder, including via ../ and symlinks", () => {
    expect(() => buildFileContext(["../secret/keys.txt"], limits)).toThrow(/outside ALLOWED_FILE_DIRS/);
    expect(() => buildFileContext([join(secret, "keys.txt")], limits)).toThrow(/outside ALLOWED_FILE_DIRS/);
    try {
      expect(() => buildFileContext(["link.txt"], limits)).toThrow(/outside ALLOWED_FILE_DIRS/);
    } catch (e) {
      if (!String(e).includes("not found")) throw e;
    }
  });

  it("rejects binary and oversized files", () => {
    expect(() => buildFileContext(["logo.png"], limits)).toThrow(/binary/);
    writeFileSync(join(allowed, "big.txt"), "x".repeat(1500));
    expect(() => buildFileContext(["big.txt"], limits)).toThrow(/limit/);
  });

  it("ai_ask attaches shared files to the message", async () => {
    const backend = new FakeBackend();
    const { client } = await connectTestClient({ config: teamConfig({ ALLOWED_FILE_DIRS: allowed }), backend });
    await client.callTool({ name: "ai_ask", arguments: { provider: "gemini", message: "Review this", files: ["app.ts"] } });
    expect(last(backend.calls[0])).toContain("export const x = 1;");
  });
});
