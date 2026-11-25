/**
 * The catalogue of AI providers the bridge can talk to.
 *
 * Every provider here exposes an OpenAI-compatible Chat Completions API, so
 * one client implementation reaches all of them; only the base URL, key and
 * model names differ. A provider is switched on simply by setting its API key
 * (or, for local servers, its base URL).
 *
 * Model names change often. Each provider has a default model plus a list of
 * "prefer" patterns: if the default is ever retired (HTTP 404), the bridge
 * lists the provider's models and picks the best match automatically.
 *
 * Base URLs were checked against each provider's documentation in November
 * 2026. Any of them can be overridden with <PROVIDER>_BASE_URL.
 */

export interface ProviderDef {
  /** Short id used in tool calls, e.g. "gemini". */
  id: string;
  /** Display name, e.g. "Google Gemini". */
  name: string;
  /** Company behind it. */
  maker: string;
  /** Environment variables holding the API key (first one found wins). */
  keyEnv: string[];
  /** Default OpenAI-compatible base URL. */
  baseURL: string;
  /** Default chat model. Override with <ID>_MODEL. */
  defaultModel: string;
  /** Patterns used to auto-pick a model if the default is unavailable (best first). */
  prefer: RegExp[];
  /** Where to get a key. */
  keyUrl: string;
  /** Local servers need no key; they are enabled by setting <ID>_BASE_URL or <ID>_ENABLED=true. */
  local?: boolean;
  /** Supports the image generation endpoint used by chatgpt_generate_image. */
  images?: boolean;
  /** Other names people use, so "ask Claude" or "ask Kimi" resolve correctly. */
  aliases?: string[];
  /** Short note shown in ai_list_providers. */
  note?: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    maker: "OpenAI",
    keyEnv: ["OPENAI_API_KEY"],
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-sol",
    prefer: [/^gpt-6[\w.-]*-sol$/, /^gpt-6/, /^gpt-5[\w.-]*-sol$/, /^gpt-5/, /^gpt-4/],
    keyUrl: "https://platform.openai.com/api-keys",
    images: true,
    aliases: ["chatgpt", "gpt"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    maker: "Anthropic",
    keyEnv: ["ANTHROPIC_API_KEY"],
    baseURL: "https://api.anthropic.com/v1/",
    defaultModel: "claude-sonnet-5-5",
    prefer: [/^claude-sonnet/, /^claude-opus/, /^claude-haiku/, /^claude/],
    keyUrl: "https://platform.claude.com/settings/keys",
    aliases: ["claude"],
    note: "Useful when the bridge is used from ChatGPT or another non-Claude client.",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    maker: "Google",
    keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-3.8-flash",
    prefer: [/gemini-[\d.]+-pro$/, /gemini-[\d.]+-flash$/, /gemini.*pro/, /gemini.*flash/, /gemini/],
    keyUrl: "https://aistudio.google.com/apikey",
    aliases: ["google", "bard"],
  },
  {
    id: "xai",
    name: "xAI Grok",
    maker: "xAI",
    keyEnv: ["XAI_API_KEY", "GROK_API_KEY"],
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-4.6",
    prefer: [/^grok-\d[\d.]*$/, /^grok-\d/, /^grok/],
    keyUrl: "https://console.x.ai",
    aliases: ["grok"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    maker: "DeepSeek",
    keyEnv: ["DEEPSEEK_API_KEY"],
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    prefer: [/^deepseek-v[\d.]+-pro$/, /flash$/, /^deepseek/],
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    maker: "Mistral AI",
    keyEnv: ["MISTRAL_API_KEY"],
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    prefer: [/^mistral-large-latest$/, /^mistral-medium-latest$/, /^mistral-large/, /^mistral/],
    keyUrl: "https://console.mistral.ai/api-keys",
    aliases: ["le-chat"],
  },
  {
    id: "meta",
    name: "Meta Llama API",
    maker: "Meta",
    keyEnv: ["LLAMA_API_KEY", "META_API_KEY"],
    baseURL: "https://api.llama.com/compat/v1/",
    defaultModel: "Llama-4-Maverick-17B-128E-Instruct-FP8",
    prefer: [/maverick/i, /scout/i, /llama/i],
    keyUrl: "https://llama.developer.meta.com",
    aliases: ["llama"],
  },
  {
    id: "perplexity",
    name: "Perplexity Sonar",
    maker: "Perplexity",
    keyEnv: ["PERPLEXITY_API_KEY", "PPLX_API_KEY"],
    baseURL: "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
    prefer: [/^sonar-pro$/, /^sonar/],
    keyUrl: "https://www.perplexity.ai/settings/api",
    aliases: ["pplx", "sonar"],
    note: "Answers are grounded in live web search, with citations.",
  },
  {
    id: "moonshot",
    name: "Moonshot Kimi",
    maker: "Moonshot AI",
    keyEnv: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    baseURL: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k3",
    prefer: [/^kimi-k\d[\w.-]*$/, /^kimi/, /^moonshot/],
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    aliases: ["kimi"],
    note: "China-mainland keys: set MOONSHOT_BASE_URL=https://api.moonshot.cn/v1",
  },
  {
    id: "qwen",
    name: "Alibaba Qwen",
    maker: "Alibaba Cloud",
    keyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    prefer: [/^qwen-max/, /^qwen-plus/, /^qwen/],
    keyUrl: "https://modelstudio.console.alibabacloud.com",
    aliases: ["dashscope", "alibaba"],
    note: "China-region keys: set QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "cohere",
    name: "Cohere Command",
    maker: "Cohere",
    keyEnv: ["COHERE_API_KEY", "CO_API_KEY"],
    baseURL: "https://api.cohere.ai/compatibility/v1",
    defaultModel: "command-a-03-2025",
    prefer: [/^command-a/, /^command-r-plus/, /^command/],
    keyUrl: "https://dashboard.cohere.com/api-keys",
  },
  {
    id: "groq",
    name: "Groq (fast open models)",
    maker: "Groq",
    keyEnv: ["GROQ_API_KEY"],
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    prefer: [/llama-?4/i, /llama-3\.3-70b/i, /gpt-oss-120b/, /llama/i],
    keyUrl: "https://console.groq.com/keys",
    note: "Very fast hosting for open models such as Llama and gpt-oss.",
  },
  {
    id: "openrouter",
    name: "OpenRouter (hundreds of models, one key)",
    maker: "OpenRouter",
    keyEnv: ["OPENROUTER_API_KEY"],
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    prefer: [/^openrouter\/auto$/],
    keyUrl: "https://openrouter.ai/keys",
    note: "Model IDs include the vendor, e.g. 'google/gemini-...' or 'x-ai/grok-...'.",
  },
  {
    id: "ollama",
    name: "Ollama (local, free)",
    maker: "Ollama",
    keyEnv: ["OLLAMA_API_KEY"],
    baseURL: "http://localhost:11434/v1",
    defaultModel: "",
    prefer: [/.*/],
    keyUrl: "https://ollama.com/download",
    local: true,
    note: "Runs on your own computer. Enable with OLLAMA_ENABLED=true. Uses the first installed model unless OLLAMA_MODEL is set.",
  },
  {
    id: "lmstudio",
    name: "LM Studio (local, free)",
    maker: "LM Studio",
    keyEnv: ["LMSTUDIO_API_KEY"],
    baseURL: "http://localhost:1234/v1",
    defaultModel: "",
    prefer: [/.*/],
    keyUrl: "https://lmstudio.ai",
    local: true,
    note: "Start LM Studio's local server first. Enable with LMSTUDIO_ENABLED=true.",
  },
];

const BY_ID = new Map<string, ProviderDef>();
for (const p of PROVIDERS) {
  BY_ID.set(p.id, p);
  for (const a of p.aliases ?? []) BY_ID.set(a, p);
}

/** Find a provider by id or alias (case-insensitive). */
export function findProvider(idOrAlias: string): ProviderDef | undefined {
  return BY_ID.get(idOrAlias.trim().toLowerCase());
}

/** Environment-variable prefix for a provider's overrides, e.g. GEMINI_MODEL. */
export function envPrefix(p: ProviderDef): string {
  return p.id.toUpperCase();
}

/** Pick the best model id from a list using the provider's preference patterns. */
const NON_CHAT = /embed|tts|whisper|transcri|audio|realtime|moderation|guard|image|dall-e|rerank|search-preview/i;

export function pickModel(p: ProviderDef, available: string[]): string | undefined {
  const chat = available.filter((m) => !NON_CHAT.test(m));
  const sorted = [...chat].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const pattern of p.prefer) {
    const hit = sorted.find((m) => pattern.test(m));
    if (hit) return hit;
  }
  return sorted[0];
}
