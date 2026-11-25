/**
 * The "backend" is the thing that actually talks to ChatGPT.
 *
 * Tools depend on the small ChatBackend interface rather than the OpenAI SDK
 * directly. That keeps the tools easy to unit-test (see test/fakeBackend.ts)
 * and makes it simple to point the bridge at any OpenAI-compatible API.
 */
import OpenAI from "openai";
import type { BridgeConfig } from "./config.js";
import type { Logger } from "./logger.js";

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  /** Ask for a JSON object reply. */
  jsonMode?: boolean;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  finishReason?: string;
  usage?: Usage;
  /** Parameters the backend had to drop because the model rejected them. */
  droppedParams?: string[];
}

export interface ImageRequest {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
}

export interface ImageResult {
  images: { base64: string; mimeType: string; revisedPrompt?: string }[];
  model: string;
}

export interface ModelInfo {
  id: string;
  ownedBy?: string;
  created?: number;
}

export interface ChatBackend {
  chat(req: ChatRequest): Promise<ChatResult>;
  generateImage(req: ImageRequest): Promise<ImageResult>;
  listModels(): Promise<ModelInfo[]>;
}

/** A clean, user-facing error with a hint on how to fix it. */
export class BackendError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/** Turn an OpenAI SDK error into something Claude (and the user) can act on. */
export function explainOpenAIError(err: unknown): BackendError {
  if (err instanceof BackendError) return err;
  const anyErr = err as { status?: number; message?: string; code?: string; name?: string };
  const status = typeof anyErr?.status === "number" ? anyErr.status : undefined;
  const message = anyErr?.message ?? String(err);

  let hint: string | undefined;
  switch (status) {
    case 401:
      hint = "The OpenAI API key was rejected. Check OPENAI_API_KEY in your Claude config and restart Claude.";
      break;
    case 403:
      hint = "Your OpenAI account or project does not have access to this model or feature.";
      break;
    case 404:
      hint = "The model was not found. Run the chatgpt_list_models tool to see the models your key can use.";
      break;
    case 429:
      hint =
        "Rate limit or quota reached. Wait a moment, or check billing at https://platform.openai.com/settings/organization/billing.";
      break;
    case 400:
      hint = "OpenAI rejected the request parameters. Try a different model or remove optional settings.";
      break;
    default:
      if (status && status >= 500) hint = "OpenAI had a server error. Try again shortly.";
      else if (anyErr?.name === "APIConnectionTimeoutError" || /timed? ?out/i.test(message))
        hint = "The request timed out. Increase REQUEST_TIMEOUT_MS or ask for a shorter answer.";
      else if (anyErr?.name === "APIConnectionError")
        hint = "Could not reach the OpenAI API. Check your internet connection or OPENAI_BASE_URL.";
  }
  return new BackendError(message, status, hint);
}

/**
 * Some models (for example reasoning models) refuse certain parameters such
 * as `temperature`. Detect that so we can retry without the parameter.
 */
export function unsupportedParam(err: unknown): string | undefined {
  const anyErr = err as { status?: number; message?: string; param?: string };
  if (anyErr?.status !== 400) return undefined;
  const msg = (anyErr.message ?? "").toLowerCase();
  const candidates = ["temperature", "reasoning_effort", "max_completion_tokens", "response_format"];
  if (anyErr.param && candidates.includes(anyErr.param)) return anyErr.param;
  return candidates.find((p) => msg.includes(p) && (msg.includes("unsupported") || msg.includes("not support")));
}

export class OpenAIBackend implements ChatBackend {
  private readonly client: OpenAI;

  constructor(
    config: BridgeConfig,
    private readonly log: Logger,
    client?: OpenAI,
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        organization: config.organization,
        project: config.project,
        timeout: config.timeoutMs,
        maxRetries: config.maxRetries,
      });
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const params: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
    };
    if (req.maxOutputTokens) params.max_completion_tokens = req.maxOutputTokens;
    if (req.temperature !== undefined) params.temperature = req.temperature;
    if (req.reasoningEffort) params.reasoning_effort = req.reasoningEffort;
    if (req.jsonMode) params.response_format = { type: "json_object" };

    const dropped: string[] = [];
    // Up to 4 attempts: each attempt may strip one parameter the model refuses.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        this.log.debug("chat.completions.create", { model: req.model, attempt, messages: req.messages.length });
        const res = (await this.client.chat.completions.create(params as never)) as OpenAI.Chat.ChatCompletion;
        const choice = res.choices?.[0];
        const text = choice?.message?.content ?? "";
        return {
          text,
          model: res.model ?? req.model,
          finishReason: choice?.finish_reason ?? undefined,
          usage: res.usage
            ? {
                inputTokens: res.usage.prompt_tokens,
                outputTokens: res.usage.completion_tokens,
                totalTokens: res.usage.total_tokens,
              }
            : undefined,
          droppedParams: dropped.length ? dropped : undefined,
        };
      } catch (err) {
        const bad = unsupportedParam(err);
        if (bad && bad in params) {
          this.log.warn(`Model ${req.model} rejected "${bad}", retrying without it`);
          delete params[bad];
          // Older OpenAI-compatible servers only know max_tokens.
          if (bad === "max_completion_tokens" && req.maxOutputTokens) params.max_tokens = req.maxOutputTokens;
          dropped.push(bad);
          continue;
        }
        throw explainOpenAIError(err);
      }
    }
    throw new BackendError("Gave up after removing unsupported parameters.", 400);
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    try {
      const params: Record<string, unknown> = { model: req.model, prompt: req.prompt, n: req.n ?? 1 };
      if (req.size) params.size = req.size;
      if (req.quality) params.quality = req.quality;
      const res = (await this.client.images.generate(params as never)) as OpenAI.Images.ImagesResponse;
      const images = (res.data ?? [])
        .filter((d) => d.b64_json)
        .map((d) => ({ base64: d.b64_json as string, mimeType: "image/png", revisedPrompt: d.revised_prompt }));
      if (images.length === 0) {
        throw new BackendError(
          "The image API returned no base64 image data.",
          undefined,
          "Use an image model that returns b64_json, such as gpt-image-2.",
        );
      }
      return { images, model: req.model };
    } catch (err) {
      throw explainOpenAIError(err);
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = [];
      for await (const m of this.client.models.list()) {
        out.push({ id: m.id, ownedBy: m.owned_by, created: m.created });
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      throw explainOpenAIError(err);
    }
  }
}
