/**
 * Conversation store: lets Claude hold a real multi-turn conversation with
 * ChatGPT by passing the same `conversation_id` on each call.
 *
 * - In memory by default (lost on restart).
 * - Set CONVERSATION_STORE_PATH to persist to a JSON file.
 * - Old/idle conversations are evicted automatically (TTL + max count).
 * - History is trimmed to MAX_HISTORY_MESSAGES, always keeping the system prompt.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ChatMessage } from "./backend.js";
import type { Logger } from "./logger.js";

export interface Conversation {
  id: string;
  title: string;
  model: string;
  /** Provider id the thread is with (older saved threads may not have one). */
  provider?: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  totalTokens: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  provider?: string;
  turns: number;
  createdAt: string;
  updatedAt: string;
  totalTokens: number;
}

export interface StoreOptions {
  maxConversations: number;
  maxHistoryMessages: number;
  ttlMinutes: number;
  filePath?: string;
  now?: () => number;
}

const ID_PATTERN = /^[A-Za-z0-9_\-]{1,64}$/;

export function isValidConversationId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export class ConversationStore {
  private readonly items = new Map<string, Conversation>();
  private readonly now: () => number;

  constructor(
    private readonly opts: StoreOptions,
    private readonly log?: Logger,
  ) {
    this.now = opts.now ?? Date.now;
    this.load();
  }

  /** Get a conversation, or undefined if missing/expired. */
  get(id: string): Conversation | undefined {
    this.evictExpired();
    return this.items.get(id);
  }

  /** Create a new conversation (optionally with a caller-chosen id). */
  create(input: { id?: string; model: string; provider?: string; systemPrompt?: string; title?: string }): Conversation {
    const id = input.id ?? `conv_${randomUUID().slice(0, 8)}`;
    if (!isValidConversationId(id)) {
      throw new Error("conversation_id may only contain letters, numbers, '-' and '_' (max 64 chars).");
    }
    const ts = new Date(this.now()).toISOString();
    const conv: Conversation = {
      id,
      title: input.title ?? "Untitled conversation",
      model: input.model,
      provider: input.provider,
      systemPrompt: input.systemPrompt,
      messages: input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : [],
      createdAt: ts,
      updatedAt: ts,
      totalTokens: 0,
    };
    this.items.set(id, conv);
    this.enforceLimits();
    this.save();
    return conv;
  }

  /** Get an existing conversation or create it. */
  getOrCreate(input: { id?: string; model: string; provider?: string; systemPrompt?: string; title?: string }): {
    conversation: Conversation;
    created: boolean;
  } {
    if (input.id) {
      const existing = this.get(input.id);
      if (existing) return { conversation: existing, created: false };
    }
    return { conversation: this.create(input), created: true };
  }

  /** Append messages after a successful exchange, then trim history. */
  append(id: string, messages: ChatMessage[], tokens = 0, model?: string, provider?: string): Conversation {
    const conv = this.items.get(id);
    if (!conv) throw new Error(`Conversation "${id}" not found`);
    conv.messages.push(...messages);
    conv.totalTokens += tokens;
    if (model) conv.model = model;
    if (provider) conv.provider = provider;
    conv.updatedAt = new Date(this.now()).toISOString();
    if (conv.title === "Untitled conversation") {
      const firstUser = conv.messages.find((m) => m.role === "user");
      if (firstUser) conv.title = makeTitle(firstUser.content);
    }
    conv.messages = trimHistory(conv.messages, this.opts.maxHistoryMessages);
    // Re-insert to keep Map ordering = least recently used first.
    this.items.delete(id);
    this.items.set(id, conv);
    this.save();
    return conv;
  }

  delete(id: string): boolean {
    const ok = this.items.delete(id);
    if (ok) this.save();
    return ok;
  }

  clear(): number {
    const n = this.items.size;
    this.items.clear();
    this.save();
    return n;
  }

  list(): ConversationSummary[] {
    this.evictExpired();
    return [...this.items.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        provider: c.provider,
        turns: c.messages.filter((m) => m.role === "user").length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        totalTokens: c.totalTokens,
      }));
  }

  get size(): number {
    return this.items.size;
  }

  private evictExpired(): void {
    const cutoff = this.now() - this.opts.ttlMinutes * 60_000;
    let removed = 0;
    for (const [id, c] of this.items) {
      if (Date.parse(c.updatedAt) < cutoff) {
        this.items.delete(id);
        removed++;
      }
    }
    if (removed) {
      this.log?.debug(`Evicted ${removed} expired conversation(s)`);
      this.save();
    }
  }

  private enforceLimits(): void {
    while (this.items.size > this.opts.maxConversations) {
      const oldest = this.items.keys().next().value as string;
      this.items.delete(oldest);
      this.log?.debug(`Evicted oldest conversation ${oldest} (MAX_CONVERSATIONS reached)`);
    }
  }

  private load(): void {
    const path = this.opts.filePath;
    if (!path || !existsSync(path)) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as { conversations?: Conversation[] };
      for (const c of data.conversations ?? []) {
        if (c && typeof c.id === "string" && Array.isArray(c.messages)) this.items.set(c.id, c);
      }
      this.evictExpired();
      this.log?.info(`Loaded ${this.items.size} conversation(s) from ${path}`);
    } catch (err) {
      this.log?.warn(`Could not read conversation store at ${path}; starting empty`, err);
    }
  }

  private save(): void {
    const path = this.opts.filePath;
    if (!path) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, conversations: [...this.items.values()] }, null, 2));
      renameSync(tmp, path); // atomic replace, so a crash never leaves half a file
    } catch (err) {
      this.log?.warn(`Could not write conversation store at ${path}`, err);
    }
  }
}

/** Keep the system prompt (if any) plus the most recent messages. */
export function trimHistory(messages: ChatMessage[], max: number): ChatMessage[] {
  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = system.length ? messages.slice(1) : messages;
  const room = Math.max(1, max - system.length);
  let tail = rest.slice(-room);
  // Never start the kept history with an orphaned assistant reply.
  while (tail.length > 1 && tail[0].role === "assistant") tail = tail.slice(1);
  return [...system, ...tail];
}

export function makeTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? oneLine.slice(0, 57) + "..." : oneLine || "Untitled conversation";
}
