# AI providers

The bridge connects Claude to 15 AI providers. Each one is switched on simply by adding its API key to the bridge's settings. Turn on as many as you like: Claude can then ask any of them by name (`ai_ask`), ask them all at once (`ai_panel`), or compare them side by side (`chatgpt_compare_models`).

All of these providers accept the same request format (OpenAI-compatible Chat Completions), so the bridge talks to every one of them in the same way.

## The list

| id | AI | Key setting | Default model | Get a key |
| --- | --- | --- | --- | --- |
| `openai` | OpenAI ChatGPT | `OPENAI_API_KEY` | `gpt-5.6-sol` | [platform.openai.com](https://platform.openai.com/api-keys) |
| `anthropic` | Anthropic Claude | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` | [platform.claude.com](https://platform.claude.com/settings/keys) |
| `gemini` | Google Gemini | `GEMINI_API_KEY` | `gemini-3.8-flash` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| `xai` | xAI Grok | `XAI_API_KEY` | `grok-4.6` | [console.x.ai](https://console.x.ai) |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-flash` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| `mistral` | Mistral AI | `MISTRAL_API_KEY` | `mistral-large-latest` | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| `meta` | Meta Llama API | `LLAMA_API_KEY` | `Llama-4-Maverick-17B-128E-Instruct-FP8` | [llama.developer.meta.com](https://llama.developer.meta.com) |
| `perplexity` | Perplexity Sonar (web search answers) | `PERPLEXITY_API_KEY` | `sonar-pro` | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) |
| `moonshot` | Moonshot Kimi | `MOONSHOT_API_KEY` | `kimi-k3` | [platform.moonshot.ai](https://platform.moonshot.ai/console/api-keys) |
| `qwen` | Alibaba Qwen | `DASHSCOPE_API_KEY` | `qwen-plus` | [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com) |
| `cohere` | Cohere Command | `COHERE_API_KEY` | `command-a-03-2025` | [dashboard.cohere.com](https://dashboard.cohere.com/api-keys) |
| `groq` | Groq (fast open models) | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | [console.groq.com](https://console.groq.com/keys) |
| `openrouter` | OpenRouter (hundreds of models) | `OPENROUTER_API_KEY` | `openrouter/auto` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `ollama` | Ollama (local, free) | `OLLAMA_ENABLED=true` | first installed model | [ollama.com](https://ollama.com/download) |
| `lmstudio` | LM Studio (local, free) | `LMSTUDIO_ENABLED=true` | first loaded model | [lmstudio.ai](https://lmstudio.ai) |

You can also use friendly names: `chatgpt`, `claude`, `grok`, `kimi`, `llama`, `google`.

Run `node dist/index.js --providers` or ask Claude to "run ai_list_providers" to see which are switched on.

## Model names change: the bridge copes

AI companies rename and retire models often (DeepSeek, for example, renamed its models several times in 2026). Two safeguards are built in:

1. **Automatic fallback.** If a provider's *default* model is retired and the provider answers "model not found", the bridge asks that provider which models it has, picks the newest sensible one, and remembers the choice. The reply footer shows `(auto-selected)` when this happens.
2. **Your override always wins.** Set `<ID>_MODEL` (for example `GEMINI_MODEL=gemini-3.8-pro`) to choose exactly. The bridge never second-guesses a model you chose yourself; if it is wrong you get a clear error.

To see what a provider offers your key: "List Gemini's models" (the `chatgpt_list_models` tool with `provider: "gemini"`).

## Settings per provider

For any provider id (upper-cased):

| Setting | Example | Purpose |
| --- | --- | --- |
| `<ID>_MODEL` | `XAI_MODEL=grok-4.6` | Default model for that provider |
| `<ID>_BASE_URL` | `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1` | Different address (regional endpoint, proxy, gateway) |
| `<ID>_ENABLED` | `OLLAMA_ENABLED=true` | Switch on a local server (Ollama, LM Studio) |
| `DEFAULT_PROVIDER` | `DEFAULT_PROVIDER=gemini` | Which AI `chatgpt_ask` and the other tools use when none is named |

Regional notes:

- **Kimi** keys from the China platform need `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1`.
- **Qwen** keys from the China region need `QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`.

## Example: four AIs in Claude Desktop

```json
{
  "mcpServers": {
    "ai-bridge": {
      "command": "node",
      "args": ["/Users/YOUR_NAME/chatgpt-mcp-bridge/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "GEMINI_API_KEY": "...",
        "XAI_API_KEY": "xai-...",
        "DEEPSEEK_API_KEY": "sk-..."
      }
    }
  }
}
```

Then try:

- "Ask Gemini to explain this contract clause in plain English."
- "Run an AI panel: what are the biggest risks in this business plan?"
- "Compare ChatGPT, Grok and DeepSeek on this maths puzzle."
- "Have Grok argue against my idea, then have ChatGPT review Grok's argument."

## Testing your keys

```bash
npm run build
OPENAI_API_KEY=sk-... GEMINI_API_KEY=... npm run check-key
```

It sends a one-line test to every provider whose key is set and reports which work.

## Costs and privacy

Each provider bills you directly under its own terms, and each has its own data-use policy. An `ai_panel` call to six AIs costs six requests. Set spending limits with each provider, and consider `ALLOWED_MODELS` to block expensive models. Do not send confidential or client material to a provider unless its terms allow for that.

## Limits

- Image generation (`chatgpt_generate_image`) uses OpenAI only.
- Provider-specific extras (Perplexity citations list, Gemini's native thinking settings, Claude's extended thinking) are not exposed; you get the text answer. The `reasoning_effort` setting is passed through where a provider supports it and dropped automatically where it does not.
- Default model names were correct when checked in November 2026. The automatic fallback covers renames, but if a provider changes its API address, set `<ID>_BASE_URL`.
