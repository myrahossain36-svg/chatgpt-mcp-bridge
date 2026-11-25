import { describe, expect, it } from "vitest";
import { BackendError, RouterBackend, type ChatBackend, type ChatRequest } from "../src/backend.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { PROVIDERS, findProvider, pickModel } from "../src/providers.js";
import { connectTestClient, FakeBackend, textOf } from "./helpers.js";

const silent = createLogger("silent");

function multiConfig(extra: Record<string, string> = {}) {
  return loadConfig({
    OPENAI_API_KEY: "sk-test-openai-123",
    GEMINI_API_KEY: "gem-test",
    XAI_API_KEY: "xai-test",
    ANTHROPIC_API_KEY: "ant-test",
    LOG_LEVEL: "silent",
    ...extra,
  });
}

describe("provider catalogue", () => {
  it("has unique ids and aliases and an https base URL for every cloud provider", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROVIDERS) {
      if (!p.local) {
        expect(p.baseURL.startsWith("https://")).toBe(true);
        expect(p.keyEnv.length).toBeGreaterThan(0);
        expect(p.defaultModel).not.toBe("");
      }
    }
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(15);
  });

  it("resolves friendly aliases", () => {
    expect(findProvider("ChatGPT")?.id).toBe("openai");
    expect(findProvider("claude")?.id).toBe("anthropic");
    expect(findProvider("grok")?.id).toBe("xai");
    expect(findProvider("kimi")?.id).toBe("moonshot");
    expect(findProvider("llama")?.id).toBe("meta");
    expect(findProvider("nonsense")).toBeUndefined();
  });

  it("auto-picks the newest sensible model and skips non-chat models", () => {
    const gemini = findProvider("gemini")!;
    expect(
      pickModel(gemini, ["text-embedding-004", "gemini-2.5-flash", "gemini-3.1-pro", "gemini-3.8-pro", "gemini-3.8-flash"]),
    ).toBe("gemini-3.8-pro");
    const ollama = findProvider("ollama")!;
    expect(pickModel(ollama, ["nomic-embed-text", "llama3.2"])).toBe("llama3.2");
  });
});

describe("multi-provider config", () => {
  it("switches providers on by their keys and defaults to OpenAI", () => {
    const c = multiConfig();
    expect(Object.keys(c.providers).sort()).toEqual(["anthropic", "gemini", "openai", "xai"]);
    expect(c.defaultProvider).toBe("openai");
    expect(c.providers.gemini.baseURL).toContain("generativelanguage.googleapis.com");
  });

  it("works with no OpenAI key at all", () => {
    const c = loadConfig({ GEMINI_API_KEY: "g", LOG_LEVEL: "silent" });
    expect(c.defaultProvider).toBe("gemini");
    expect(c.defaultModel).toBe(findProvider("gemini")!.defaultModel);
  });

  it("honours DEFAULT_PROVIDER, per-provider model and base URL overrides, and local servers", () => {
    const c = multiConfig({
      DEFAULT_PROVIDER: "grok",
      XAI_MODEL: "grok-special",
      GEMINI_BASE_URL: "https://proxy.example/v1",
      OLLAMA_ENABLED: "true",
    });
    expect(c.defaultProvider).toBe("xai");
    expect(c.providers.xai.model).toBe("grok-special");
    expect(c.providers.xai.modelIsDefault).toBe(false);
    expect(c.providers.gemini.baseURL).toBe("https://proxy.example/v1");
    expect(c.providers.ollama.model).toBe("");
  });

  it("explains how to start when no provider is set", () => {
    expect(() => loadConfig({})).toThrow(/No AI provider is configured/);
    expect(() => multiConfig({ DEFAULT_PROVIDER: "deepseek" })).toThrow(/DEEPSEEK_API_KEY/);
  });
});

describe("multi-provider tools", () => {
  it("ai_ask routes to the named provider and its default model", async () => {
    const { client, backend } = await connectTestClient({ config: multiConfig() });
    const res = await client.callTool({ name: "ai_ask", arguments: { provider: "gemini", message: "hi" } });
    expect(backend.calls[0]).toMatchObject({ provider: "gemini", model: findProvider("gemini")!.defaultModel });
    expect(textOf(res)).toContain("Google Gemini");
  });

  it("accepts provider:model shorthand in chatgpt_ask", async () => {
    const { client, backend } = await connectTestClient({ config: multiConfig() });
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "hi", model: "xai:grok-test" } });
    expect(backend.calls[0]).toMatchObject({ provider: "xai", model: "grok-test" });
  });

  it("gives a clear fix when an AI is not configured", async () => {
    const { client, backend } = await connectTestClient({ config: multiConfig() });
    const res = await client.callTool({ name: "ai_ask", arguments: { provider: "deepseek", message: "hi" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("DeepSeek is not configured");
    expect(textOf(res)).toContain("DEEPSEEK_API_KEY");
    expect(backend.calls).toHaveLength(0);
  });

  it("a conversation remembers which AI it is with", async () => {
    const { client, backend } = await connectTestClient({ config: multiConfig() });
    await client.callTool({ name: "ai_ask", arguments: { provider: "claude", message: "one", conversation_id: "c1" } });
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "two", conversation_id: "c1" } });
    expect(backend.calls[1].provider).toBe("anthropic");
    expect(backend.calls[1].messages).toHaveLength(3);
  });

  it("second opinion can come from any provider", async () => {
    const { client, backend } = await connectTestClient({ config: multiConfig() });
    await client.callTool({
      name: "chatgpt_second_opinion",
      arguments: { question: "q", answer: "a", provider: "grok" },
    });
    expect(backend.calls[0].provider).toBe("xai");
  });

  it("ai_panel asks every configured AI by default", async () => {
    const { client, backend } = await connectTestClient({ config: multiConfig() });
    const res = await client.callTool({ name: "ai_panel", arguments: { message: "Best pizza topping?" } });
    expect(backend.calls.map((c) => c.provider).sort()).toEqual(["anthropic", "gemini", "openai", "xai"]);
    expect(textOf(res)).toContain("Asked 4 model(s); 4 answered.");
  });

  it("ai_panel reports unconfigured AIs without failing the rest", async () => {
    const { client } = await connectTestClient({ config: multiConfig() });
    const res = await client.callTool({
      name: "ai_panel",
      arguments: { message: "hi", providers: ["openai", "mistral"] },
    });
    expect(textOf(res)).toContain("Asked 2 model(s); 1 answered.");
    expect(textOf(res)).toContain("MISTRAL_API_KEY");
  });

  it("ai_list_providers shows on/off status and how to switch providers on", async () => {
    const { client } = await connectTestClient({ config: multiConfig() });
    const res = await client.callTool({ name: "ai_list_providers", arguments: {} });
    const text = textOf(res);
    expect(text).toContain("4 of");
    expect(text).toContain("[ON] gemini");
    expect(text).toContain("[off] deepseek");
    expect(text).toContain("DEEPSEEK_API_KEY");
    expect(text).not.toContain("gem-test");
  });

  it("chatgpt_list_models lists another provider's models", async () => {
    const backend = new FakeBackend();
    const { client } = await connectTestClient({ config: multiConfig(), backend });
    const res = await client.callTool({ name: "chatgpt_list_models", arguments: { provider: "gemini" } });
    expect(textOf(res)).toContain("Google Gemini");
  });
});

describe("router backend", () => {
  class Stub implements ChatBackend {
    calls: ChatRequest[] = [];
    constructor(
      private readonly models: string[],
      private readonly missing: string[] = [],
    ) {}
    async chat(req: ChatRequest) {
      this.calls.push(req);
      if (this.missing.includes(req.model)) throw new BackendError("model not found", 404);
      return { text: `ok from ${req.model}`, model: req.model };
    }
    async generateImage(): Promise<never> {
      throw new Error("no");
    }
    async listModels() {
      return this.models.map((id) => ({ id }));
    }
  }

  it("heals a retired default model by auto-picking another, then remembers it", async () => {
    const config = loadConfig({ GEMINI_API_KEY: "g", LOG_LEVEL: "silent" });
    const stub = new Stub(["gemini-9-pro", "gemini-9-flash"], [config.providers.gemini.model]);
    const router = new RouterBackend(config, silent, () => stub);
    const msgs = [{ role: "user" as const, content: "hi" }];
    const r1 = await router.chat({ provider: "gemini", model: config.providers.gemini.model, messages: msgs });
    expect(r1).toMatchObject({ model: "gemini-9-pro", autoSelectedModel: true, provider: "gemini" });
    const r2 = await router.chat({ provider: "gemini", model: config.providers.gemini.model, messages: msgs });
    expect(r2.model).toBe("gemini-9-pro");
    expect(stub.calls.filter((c) => c.model === config.providers.gemini.model)).toHaveLength(1);
  });

  it("does not second-guess a model the user chose explicitly", async () => {
    const config = loadConfig({ GEMINI_API_KEY: "g", GEMINI_MODEL: "my-model", LOG_LEVEL: "silent" });
    const stub = new Stub(["gemini-9-pro"], ["my-model"]);
    const router = new RouterBackend(config, silent, () => stub);
    await expect(
      router.chat({ provider: "gemini", model: "my-model", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/not found/);
  });

  it("auto-picks the first installed model for local servers", async () => {
    const config = loadConfig({ OLLAMA_ENABLED: "1", LOG_LEVEL: "silent" });
    const stub = new Stub(["llama3.2"]);
    const router = new RouterBackend(config, silent, () => stub);
    const r = await router.chat({ provider: "ollama", model: "", messages: [{ role: "user", content: "x" }] });
    expect(r.model).toBe("llama3.2");
  });

  it("refuses image generation on providers without it", async () => {
    const config = loadConfig({ GEMINI_API_KEY: "g", LOG_LEVEL: "silent" });
    const router = new RouterBackend(config, silent, () => new Stub([]));
    await expect(router.generateImage({ provider: "gemini", model: "x", prompt: "p" })).rejects.toThrow(
      /not set up for image generation/,
    );
  });
});
