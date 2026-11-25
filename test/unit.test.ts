import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { explainOpenAIError, OpenAIBackend, unsupportedParam } from "../src/backend.js";
import { parseArgs } from "../src/cli.js";
import { ConfigError, loadConfig } from "../src/config.js";
import { ConversationStore, makeTitle, trimHistory } from "../src/conversations.js";
import { createLogger, redact } from "../src/logger.js";
import { parseJsonLoose } from "../src/tools/expertTools.js";
import { tokensMatch } from "../src/transports/http.js";
import { testConfig } from "./helpers.js";

describe("config", () => {
  it("requires an API key", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("applies defaults", () => {
    const c = loadConfig({ OPENAI_API_KEY: "sk-x" });
    expect(c.defaultModel).toBe("gpt-5.6-sol");
    expect(c.http.host).toBe("127.0.0.1");
    expect(c.http.port).toBe(3000);
    expect(c.allowedModels).toEqual([]);
  });

  it("parses lists and numbers and rejects bad numbers", () => {
    const c = loadConfig({ OPENAI_API_KEY: "sk-x", ALLOWED_MODELS: "a, b ,c", PORT: "8080" });
    expect(c.allowedModels).toEqual(["a", "b", "c"]);
    expect(c.http.port).toBe(8080);
    expect(() => loadConfig({ OPENAI_API_KEY: "sk-x", PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ OPENAI_API_KEY: "sk-x", LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});

describe("cli", () => {
  it("parses flags", () => {
    expect(parseArgs(["--http", "--port", "8080", "--host=0.0.0.0"])).toMatchObject({
      http: true,
      port: 8080,
      host: "0.0.0.0",
    });
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--port", "99999"])).toThrow(/port/);
  });
});

describe("logger", () => {
  it("redacts API keys and bearer tokens", () => {
    expect(redact("key sk-abcdefghijklmnop end")).toBe("key sk-***REDACTED*** end");
    expect(redact("Authorization: Bearer abcdefghijkl")).toContain("Bearer ***REDACTED***");
  });

  it("respects the level and writes through the sink", () => {
    const lines: string[] = [];
    const log = createLogger("warn", (l) => lines.push(l));
    log.info("hidden");
    log.warn("shown");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("WARN shown");
  });
});

describe("conversation store", () => {
  const opts = { maxConversations: 2, maxHistoryMessages: 5, ttlMinutes: 60 };

  it("evicts the least recently used conversation", () => {
    const s = new ConversationStore(opts);
    s.create({ id: "a", model: "m" });
    s.create({ id: "b", model: "m" });
    s.append("a", [{ role: "user", content: "hi" }]); // a is now most recent
    s.create({ id: "c", model: "m" });
    expect(s.get("b")).toBeUndefined();
    expect(s.get("a")).toBeDefined();
  });

  it("expires idle conversations", () => {
    let t = 1_000_000;
    const s = new ConversationStore({ ...opts, now: () => t });
    s.create({ id: "old", model: "m" });
    t += 61 * 60_000;
    expect(s.get("old")).toBeUndefined();
  });

  it("persists to and reloads from disk", () => {
    const file = join(mkdtempSync(join(tmpdir(), "bridge-")), "store.json");
    const s1 = new ConversationStore({ ...opts, filePath: file });
    s1.create({ id: "keep", model: "m" });
    s1.append("keep", [
      { role: "user", content: "remember me" },
      { role: "assistant", content: "ok" },
    ]);
    expect(JSON.parse(readFileSync(file, "utf8")).conversations).toHaveLength(1);
    const s2 = new ConversationStore({ ...opts, filePath: file });
    expect(s2.get("keep")?.messages).toHaveLength(2);
    expect(s2.get("keep")?.title).toBe("remember me");
  });

  it("trims history but keeps the system prompt", () => {
    const msgs = [
      { role: "system" as const, content: "S" },
      ...Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: String(i),
      })),
    ];
    const out = trimHistory(msgs, 5);
    expect(out[0].content).toBe("S");
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[1].role).toBe("user");
  });

  it("makes short titles", () => {
    expect(makeTitle("a".repeat(100))).toHaveLength(60);
  });
});

describe("error handling", () => {
  it("explains common HTTP errors", () => {
    expect(explainOpenAIError({ status: 401, message: "bad key" }).hint).toMatch(/OPENAI_API_KEY/);
    expect(explainOpenAIError({ status: 429, message: "slow" }).hint).toMatch(/Rate limit/);
    expect(explainOpenAIError({ status: 404, message: "nope" }).hint).toMatch(/chatgpt_list_models/);
  });

  it("detects unsupported parameters", () => {
    expect(unsupportedParam({ status: 400, message: "Unsupported parameter: 'temperature'" })).toBe("temperature");
    expect(unsupportedParam({ status: 400, param: "reasoning_effort", message: "x" })).toBe("reasoning_effort");
    expect(unsupportedParam({ status: 500, message: "temperature unsupported" })).toBeUndefined();
  });

  it("retries without a parameter the model rejects", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce({ status: 400, message: "Unsupported value: 'temperature' is not supported with this model." })
      .mockResolvedValueOnce({
        model: "o-test",
        choices: [{ message: { content: "done" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      });
    const fakeClient = { chat: { completions: { create } } } as never;
    const backend = new OpenAIBackend(testConfig(), createLogger("silent"), fakeClient);
    const res = await backend.chat({ model: "o-test", messages: [{ role: "user", content: "x" }], temperature: 1 });
    expect(res.text).toBe("done");
    expect(res.droppedParams).toEqual(["temperature"]);
    expect(create.mock.calls[1][0]).not.toHaveProperty("temperature");
  });
});

describe("misc", () => {
  it("parses loose JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('Here you go: {"a":2} thanks')).toEqual({ a: 2 });
    expect(parseJsonLoose("nope")).toBeUndefined();
  });

  it("compares tokens safely", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("abc", "abcd")).toBe(false);
  });
});
