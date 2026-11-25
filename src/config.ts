/**
 * Configuration for the ChatGPT MCP Bridge.
 *
 * Everything is read from environment variables so the server can be
 * configured from a Claude Desktop / Claude Code config file, a `.env`
 * file, Docker, or a hosting platform without code changes.
 *
 * See `.env.example` and docs/CONFIGURATION.md for the full reference.
 */

import { PROVIDERS, envPrefix, findProvider, type ProviderDef } from "./providers.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/** A provider that has been switched on (its key or local URL is set). */
export interface ProviderConfig {
  def: ProviderDef;
  apiKey: string;
  baseURL: string;
  /** Default model for this provider ("" means auto-pick from its model list). */
  model: string;
  /** True when the model came from the catalogue rather than the user's settings. */
  modelIsDefault: boolean;
}

export interface BridgeConfig {
  /** Every provider that is switched on, keyed by id. */
  providers: Record<string, ProviderConfig>;
  /** Provider used when a tool call does not name one. */
  defaultProvider: string;
  /** OpenAI API key ("" if OpenAI is not configured). */
  apiKey: string;
  /** Optional custom base URL, for Azure OpenAI, OpenRouter, Ollama, LM Studio, etc. */
  baseURL?: string;
  /** Optional OpenAI organisation ID. */
  organization?: string;
  /** Optional OpenAI project ID. */
  project?: string;
  /** Default chat model of the default provider. */
  defaultModel: string;
  /** Default image model for chatgpt_generate_image. */
  imageModel: string;
  /** Optional allow-list of models. Empty means any model is accepted. */
  allowedModels: string[];
  /** Default max output tokens per reply. */
  maxOutputTokens: number;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
  /** Number of automatic retries on rate limits / 5xx errors. */
  maxRetries: number;
  /** How many messages of history to keep per conversation. */
  maxHistoryMessages: number;
  /** Maximum number of conversations held at once (oldest evicted first). */
  maxConversations: number;
  /** Conversations idle longer than this are discarded (minutes). */
  conversationTtlMinutes: number;
  /** Optional path to a JSON file used to persist conversations between restarts. */
  conversationStorePath?: string;
  /** Optional folder where generated images are written to disk. */
  imageOutputDir?: string;
  /** Default system prompt applied to every ChatGPT call (can be overridden per call). */
  defaultSystemPrompt?: string;
  /** Folders the AIs may read files from (file sharing is off when empty). */
  allowedFileDirs: string[];
  /** Largest single file that may be shared, in bytes. */
  maxFileBytes: number;
  /** Largest total of shared files per request, in bytes. */
  maxTotalFileBytes: number;
  /** Upper limit on AI calls made by one ai_team session. */
  maxTeamCalls: number;
  /** Log level (logs always go to stderr, never stdout). */
  logLevel: LogLevel;
  /** HTTP transport settings. */
  http: {
    host: string;
    port: number;
    /** Bearer token clients must send. Strongly recommended when exposed beyond localhost. */
    authToken?: string;
    /** Extra Host header values allowed (DNS rebinding protection). */
    allowedHosts: string[];
    /** CORS origins allowed to call the HTTP endpoint. */
    corsOrigins: string[];
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string): string | undefined {
  const v = env[key];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

function int(env: Env, key: string, fallback: number, min = 0): number {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) {
    throw new ConfigError(`${key} must be a whole number >= ${min} (got "${raw}")`);
  }
  return n;
}

function list(env: Env, key: string): string[] {
  const raw = str(env, key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error", "silent"];

export const DEFAULTS = {
  model: "gpt-5.6-sol",
  imageModel: "gpt-image-2",
  maxOutputTokens: 4096,
  timeoutMs: 120_000,
  maxRetries: 2,
  maxHistoryMessages: 40,
  maxConversations: 200,
  conversationTtlMinutes: 24 * 60,
  httpHost: "127.0.0.1",
  httpPort: 3000,
} as const;

/**
 * Build the configuration from environment variables.
 * Throws ConfigError with a human-friendly message if something is wrong.
 */
function truthy(v: string | undefined): boolean {
  return v !== undefined && /^(1|true|yes|on)$/i.test(v.trim());
}

/** Work out which providers are switched on from the environment. */
export function loadProviders(env: Env): Record<string, ProviderConfig> {
  const out: Record<string, ProviderConfig> = {};
  for (const def of PROVIDERS) {
    const prefix = envPrefix(def);
    const key = def.keyEnv.map((k) => str(env, k)).find(Boolean) ?? "";
    const baseOverride = str(env, `${prefix}_BASE_URL`);
    const enabled = def.local ? truthy(env[`${prefix}_ENABLED`]) || Boolean(baseOverride) : Boolean(key);
    if (!enabled) continue;
    const userModel = str(env, `${prefix}_MODEL`);
    out[def.id] = {
      def,
      apiKey: key || (def.local ? def.id : ""),
      baseURL: baseOverride ?? def.baseURL,
      model: userModel ?? def.defaultModel,
      modelIsDefault: !userModel,
    };
  }
  return out;
}

/**
 * Build the configuration from environment variables.
 * Throws ConfigError with a human-friendly message if something is wrong.
 */
export function loadConfig(env: Env = process.env, opts: { requireApiKey?: boolean } = {}): BridgeConfig {
  const requireApiKey = opts.requireApiKey ?? true;
  const providers = loadProviders(env);
  const ids = Object.keys(providers);
  if (requireApiKey && ids.length === 0) {
    throw new ConfigError(
      "No AI provider is configured. Set at least one API key, for example OPENAI_API_KEY (ChatGPT), " +
        "GEMINI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY or DEEPSEEK_API_KEY, in the \"env\" section of your " +
        "Claude config (see README). Run with --providers to see every supported provider.",
    );
  }

  const requestedDefault = str(env, "DEFAULT_PROVIDER");
  let defaultProvider = providers.openai ? "openai" : (ids[0] ?? "openai");
  if (requestedDefault) {
    const def = findProvider(requestedDefault);
    if (!def) throw new ConfigError(`DEFAULT_PROVIDER "${requestedDefault}" is not a known provider.`);
    if (requireApiKey && !providers[def.id]) {
      throw new ConfigError(`DEFAULT_PROVIDER is "${def.id}" but ${def.keyEnv[0]} is not set.`);
    }
    defaultProvider = def.id;
  }

  const logLevelRaw = (str(env, "LOG_LEVEL") ?? "info").toLowerCase() as LogLevel;
  if (!LOG_LEVELS.includes(logLevelRaw)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")} (got "${logLevelRaw}")`);
  }

  return {
    providers,
    defaultProvider,
    apiKey: providers.openai?.apiKey ?? "",
    baseURL: str(env, "OPENAI_BASE_URL"),
    organization: str(env, "OPENAI_ORG_ID"),
    project: str(env, "OPENAI_PROJECT_ID"),
    defaultModel: providers[defaultProvider]?.model || DEFAULTS.model,
    imageModel: str(env, "OPENAI_IMAGE_MODEL") ?? DEFAULTS.imageModel,
    allowedModels: list(env, "ALLOWED_MODELS"),
    maxOutputTokens: int(env, "MAX_OUTPUT_TOKENS", DEFAULTS.maxOutputTokens, 1),
    timeoutMs: int(env, "REQUEST_TIMEOUT_MS", DEFAULTS.timeoutMs, 1000),
    maxRetries: int(env, "MAX_RETRIES", DEFAULTS.maxRetries, 0),
    maxHistoryMessages: int(env, "MAX_HISTORY_MESSAGES", DEFAULTS.maxHistoryMessages, 2),
    maxConversations: int(env, "MAX_CONVERSATIONS", DEFAULTS.maxConversations, 1),
    conversationTtlMinutes: int(env, "CONVERSATION_TTL_MINUTES", DEFAULTS.conversationTtlMinutes, 1),
    conversationStorePath: str(env, "CONVERSATION_STORE_PATH"),
    imageOutputDir: str(env, "IMAGE_OUTPUT_DIR"),
    defaultSystemPrompt: str(env, "DEFAULT_SYSTEM_PROMPT"),
    allowedFileDirs: list(env, "ALLOWED_FILE_DIRS"),
    maxFileBytes: int(env, "MAX_FILE_BYTES", 200_000, 1),
    maxTotalFileBytes: int(env, "MAX_TOTAL_FILE_BYTES", 600_000, 1),
    maxTeamCalls: int(env, "MAX_TEAM_CALLS", 20, 1),
    logLevel: logLevelRaw,
    http: {
      host: str(env, "HOST") ?? DEFAULTS.httpHost,
      port: int(env, "PORT", DEFAULTS.httpPort, 1),
      authToken: str(env, "MCP_AUTH_TOKEN"),
      allowedHosts: list(env, "ALLOWED_HOSTS"),
      corsOrigins: list(env, "CORS_ORIGINS"),
    },
  };
}

/** Check a requested model against the allow-list (if one is configured). */
export function assertModelAllowed(config: BridgeConfig, model: string): void {
  if (config.allowedModels.length === 0) return;
  if (!config.allowedModels.includes(model)) {
    throw new ConfigError(
      `Model "${model}" is not in ALLOWED_MODELS. Allowed: ${config.allowedModels.join(", ")}`,
    );
  }
}
