/**
 * Test helpers: a fake ChatGPT backend and an in-memory MCP client, so the
 * whole server can be exercised end to end without an API key or network.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  ChatBackend,
  ChatRequest,
  ChatResult,
  ImageRequest,
  ImageResult,
  ModelInfo,
} from "../src/backend.js";
import { loadConfig, type BridgeConfig } from "../src/config.js";
import { ConversationStore } from "../src/conversations.js";
import { createLogger } from "../src/logger.js";
import { createServer } from "../src/server.js";

export class FakeBackend implements ChatBackend {
  calls: ChatRequest[] = [];
  imageCalls: ImageRequest[] = [];
  reply: (req: ChatRequest) => string = (req) => `echo: ${req.messages[req.messages.length - 1].content}`;
  failWith?: Error;

  async chat(req: ChatRequest): Promise<ChatResult> {
    this.calls.push(structuredClone(req));
    if (this.failWith) throw this.failWith;
    return {
      text: this.reply(req),
      model: req.model,
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    this.imageCalls.push(req);
    // 1x1 transparent PNG
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    return {
      model: req.model,
      images: Array.from({ length: req.n ?? 1 }, () => ({ base64: png, mimeType: "image/png" })),
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "dall-e-3" }, { id: "gpt-5.6-sol" }, { id: "gpt-6.1-terra" }, { id: "text-embedding-3-small" }];
  }
}

export function testConfig(overrides: Record<string, string> = {}): BridgeConfig {
  return loadConfig({ OPENAI_API_KEY: "sk-test-key-123456", LOG_LEVEL: "silent", ...overrides });
}

export async function connectTestClient(opts: { config?: BridgeConfig; backend?: FakeBackend } = {}) {
  const config = opts.config ?? testConfig();
  const backend = opts.backend ?? new FakeBackend();
  const log = createLogger("silent");
  const store = new ConversationStore({
    maxConversations: config.maxConversations,
    maxHistoryMessages: config.maxHistoryMessages,
    ttlMinutes: config.conversationTtlMinutes,
    filePath: config.conversationStorePath,
  });
  const server = createServer({ config, backend, store, log });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, backend, store, config };
}

export function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
