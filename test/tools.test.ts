import { describe, expect, it } from "vitest";
import { BackendError } from "../src/backend.js";
import { connectTestClient, FakeBackend, testConfig, textOf } from "./helpers.js";

describe("tool discovery", () => {
  it("lists every tool with a description", async () => {
    const { client } = await connectTestClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "ai_ask",
      "ai_list_providers",
      "ai_panel",
      "ai_team",
      "chatgpt_ask",
      "chatgpt_code_review",
      "chatgpt_compare_models",
      "chatgpt_debate",
      "chatgpt_generate_image",
      "chatgpt_get_conversation",
      "chatgpt_list_conversations",
      "chatgpt_list_models",
      "chatgpt_reset_conversation",
      "chatgpt_second_opinion",
      "chatgpt_server_info",
      "chatgpt_structured",
    ]);
    for (const t of tools) expect(t.description?.length).toBeGreaterThan(20);
  });

  it("exposes prompts", async () => {
    const { client } = await connectTestClient();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["council", "cross_check", "review_my_code", "team_build", "team_write"]);
    const p = await client.getPrompt({ name: "cross_check", arguments: { question: "Is 2+2=4?" } });
    expect(JSON.stringify(p.messages)).toContain("chatgpt_second_opinion");
  });
});

describe("chatgpt_ask", () => {
  it("answers a one-off question with the default model", async () => {
    const { client, backend } = await connectTestClient();
    const res = await client.callTool({ name: "chatgpt_ask", arguments: { message: "hello" } });
    expect(textOf(res)).toContain("echo: hello");
    expect(textOf(res)).toContain("model: gpt-5.6-sol");
    expect(backend.calls[0].messages).toEqual([{ role: "user", content: "hello" }]);
    expect(res.structuredContent).toMatchObject({ reply: "echo: hello", model: "gpt-5.6-sol" });
  });

  it("passes model, temperature, system prompt and token limit through", async () => {
    const { client, backend } = await connectTestClient();
    await client.callTool({
      name: "chatgpt_ask",
      arguments: {
        message: "hi",
        model: "gpt-6.1-terra",
        temperature: 0.4,
        system_prompt: "Be brief",
        max_output_tokens: 100,
        reasoning_effort: "low",
      },
    });
    const call = backend.calls[0];
    expect(call.model).toBe("gpt-6.1-terra");
    expect(call.temperature).toBe(0.4);
    expect(call.maxOutputTokens).toBe(100);
    expect(call.reasoningEffort).toBe("low");
    expect(call.messages[0]).toEqual({ role: "system", content: "Be brief" });
  });

  it("remembers earlier turns when a conversation_id is reused", async () => {
    const { client, backend } = await connectTestClient();
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "My name is Sam", conversation_id: "t1" } });
    const second = await client.callTool({
      name: "chatgpt_ask",
      arguments: { message: "What is my name?", conversation_id: "t1" },
    });
    expect(backend.calls[1].messages.map((m) => m.content)).toEqual([
      "My name is Sam",
      "echo: My name is Sam",
      "What is my name?",
    ]);
    expect(textOf(second)).toContain("conversation: t1");
    expect(textOf(second)).not.toContain("(new)");
  });

  it("does not save a turn when ChatGPT fails", async () => {
    const backend = new FakeBackend();
    const { client, store } = await connectTestClient({ backend });
    backend.failWith = new BackendError("boom", 500, "try later");
    const res = await client.callTool({ name: "chatgpt_ask", arguments: { message: "x", conversation_id: "t2" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("HTTP 500");
    expect(textOf(res)).toContain("How to fix: try later");
    expect(store.get("t2")?.messages ?? []).toHaveLength(0);
  });

  it("rejects models outside ALLOWED_MODELS", async () => {
    const { client, backend } = await connectTestClient({
      config: testConfig({ ALLOWED_MODELS: "gpt-5.6-sol" }),
    });
    const res = await client.callTool({ name: "chatgpt_ask", arguments: { message: "x", model: "gpt-6-astra" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("not in ALLOWED_MODELS");
    expect(backend.calls).toHaveLength(0);
  });

  it("rejects an invalid conversation id", async () => {
    const { client } = await connectTestClient();
    const res = await client.callTool({
      name: "chatgpt_ask",
      arguments: { message: "x", conversation_id: "bad id with spaces" },
    });
    expect(res.isError).toBe(true);
  });

  it("applies DEFAULT_SYSTEM_PROMPT when none is given", async () => {
    const { client, backend } = await connectTestClient({
      config: testConfig({ DEFAULT_SYSTEM_PROMPT: "Answer in British English." }),
    });
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "colour?" } });
    expect(backend.calls[0].messages[0]).toEqual({ role: "system", content: "Answer in British English." });
  });
});

describe("conversation tools", () => {
  it("lists, shows and deletes conversations", async () => {
    const { client } = await connectTestClient();
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "Plan a trip to Rome", conversation_id: "rome" } });

    const list = await client.callTool({ name: "chatgpt_list_conversations", arguments: {} });
    expect(textOf(list)).toContain('rome: "Plan a trip to Rome"');
    expect(textOf(list)).toContain("openai/gpt-5.6-sol");

    const show = await client.callTool({ name: "chatgpt_get_conversation", arguments: { conversation_id: "rome" } });
    expect(textOf(show)).toContain("### AI");

    const del = await client.callTool({ name: "chatgpt_reset_conversation", arguments: { conversation_id: "rome" } });
    expect(textOf(del)).toContain("Deleted");

    const empty = await client.callTool({ name: "chatgpt_list_conversations", arguments: {} });
    expect(textOf(empty)).toContain("No conversations yet");
  });

  it("exposes conversations as resources", async () => {
    const { client } = await connectTestClient();
    await client.callTool({ name: "chatgpt_ask", arguments: { message: "hi", conversation_id: "res1" } });
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("chatgpt://conversations/res1");
    const read = await client.readResource({ uri: "chatgpt://conversations/res1" });
    expect((read.contents[0] as { text: string }).text).toContain('"id": "res1"');
  });
});

describe("expert tools", () => {
  it("second opinion sends question and answer with a reviewer system prompt", async () => {
    const { client, backend } = await connectTestClient();
    await client.callTool({
      name: "chatgpt_second_opinion",
      arguments: { question: "Capital of Australia?", answer: "Sydney", focus: "accuracy" },
    });
    const [sys, user] = backend.calls[0].messages;
    expect(sys.content).toContain("second opinion");
    expect(user.content).toContain("Sydney");
    expect(user.content).toContain("accuracy");
  });

  it("code review wraps the code in a fence and lists focus areas", async () => {
    const { client, backend } = await connectTestClient();
    await client.callTool({
      name: "chatgpt_code_review",
      arguments: { code: "const x = eval(input)", language: "JavaScript", focus: ["security"] },
    });
    const user = backend.calls[0].messages[1].content;
    expect(user).toContain("```javascript");
    expect(user).toContain("security");
  });

  it("structured returns parsed JSON", async () => {
    const backend = new FakeBackend();
    backend.reply = () => '```json\n{"name":"Ada","tags":["math"]}\n```';
    const { client } = await connectTestClient({ backend });
    const res = await client.callTool({
      name: "chatgpt_structured",
      arguments: { instruction: "extract", json_shape: '{"name": string, "tags": string[]}', input: "Ada, math" },
    });
    expect(res.structuredContent).toMatchObject({ valid_json: true, data: { name: "Ada", tags: ["math"] } });
    expect(backend.calls[0].jsonMode).toBe(true);
  });

  it("structured reports invalid JSON instead of crashing", async () => {
    const backend = new FakeBackend();
    backend.reply = () => "sorry, no";
    const { client } = await connectTestClient({ backend });
    const res = await client.callTool({
      name: "chatgpt_structured",
      arguments: { instruction: "x", json_shape: "{}" },
    });
    expect(res.structuredContent).toMatchObject({ valid_json: false });
  });

  it("debate defaults to arguing against", async () => {
    const { client, backend } = await connectTestClient();
    await client.callTool({ name: "chatgpt_debate", arguments: { position: "Remote work is always better" } });
    expect(backend.calls[0].messages[0].content).toContain("Argue against");
  });
});

describe("compare models", () => {
  it("runs every model in parallel and reports failures per model", async () => {
    const backend = new FakeBackend();
    const original = backend.chat.bind(backend);
    backend.chat = async (req) => {
      if (req.model === "broken-model") throw new BackendError("not found", 404, "pick another");
      return original(req);
    };
    const { client } = await connectTestClient({ backend });
    const res = await client.callTool({
      name: "chatgpt_compare_models",
      arguments: { message: "hi", models: ["gpt-5.6-sol", "gpt-6.1-terra", "broken-model"] },
    });
    const text = textOf(res);
    expect(text).toContain("Asked 3 model(s); 2 answered.");
    expect(text).toContain("(gpt-6.1-terra)");
    expect(text).toContain("FAILED: not found");
    expect(res.isError).toBeFalsy();
  });

  it("needs at least two models", async () => {
    const { client } = await connectTestClient();
    const res = await client.callTool({ name: "chatgpt_compare_models", arguments: { message: "hi", models: ["a"] } });
    expect(res.isError).toBe(true);
  });
});

describe("image and info tools", () => {
  it("returns image content", async () => {
    const { client, backend } = await connectTestClient();
    const res = await client.callTool({
      name: "chatgpt_generate_image",
      arguments: { prompt: "a red fox", count: 2, size: "1024x1024" },
    });
    const content = res.content as { type: string }[];
    expect(content.filter((c) => c.type === "image")).toHaveLength(2);
    expect(backend.imageCalls[0]).toMatchObject({ model: "gpt-image-2", n: 2, size: "1024x1024" });
  });

  it("lists chat models and marks the default", async () => {
    const { client } = await connectTestClient();
    const res = await client.callTool({ name: "chatgpt_list_models", arguments: {} });
    const text = textOf(res);
    expect(text).toContain("gpt-5.6-sol  (default)");
    expect(text).not.toContain("dall-e-3");
    expect(text).not.toContain("embedding");
  });

  it("server info never reveals the API key", async () => {
    const { client } = await connectTestClient();
    const res = await client.callTool({ name: "chatgpt_server_info", arguments: {} });
    const text = textOf(res);
    expect(text).toContain("api_key_set: true");
    expect(text).not.toContain("sk-test");
  });
});
