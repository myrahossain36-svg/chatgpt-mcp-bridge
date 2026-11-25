# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-11-25

### Added

- **15 AI providers**: ChatGPT, Claude, Gemini, Grok, DeepSeek, Mistral, Meta Llama, Perplexity, Kimi, Qwen, Cohere, Groq, OpenRouter, Ollama and LM Studio. Each is switched on by its API key.
- `ai_ask` (ask a specific AI), `ai_panel` (ask every configured AI at once) and `ai_list_providers` tools.
- `provider` option on every chat tool, `provider:model` shorthand, and friendly aliases (`claude`, `grok`, `kimi`, ...).
- Automatic model fallback when a provider retires a default model name.
- Conversations remember which AI they are with.
- `--providers` CLI flag; `npm run check-key` now tests every configured provider.
- Guides: docs/PROVIDERS.md and docs/USE-FROM-CHATGPT.md (reach Claude from ChatGPT).

### Changed

- OPENAI_API_KEY is no longer required on its own: any one provider key is enough.

## [1.0.0] - 2026-11-25

### Added

- 12 tools: `chatgpt_ask`, `chatgpt_second_opinion`, `chatgpt_code_review`, `chatgpt_debate`, `chatgpt_structured`, `chatgpt_compare_models`, `chatgpt_generate_image`, `chatgpt_list_conversations`, `chatgpt_get_conversation`, `chatgpt_reset_conversation`, `chatgpt_list_models`, `chatgpt_server_info`.
- Prompts: `cross_check`, `council`, `review_my_code`.
- Conversation threads as MCP resources (`chatgpt://conversations/{id}`).
- stdio and stateless Streamable HTTP transports, bearer-token auth, CORS, `/health`.
- Multi-turn conversation store with trimming, TTL, LRU eviction and optional JSON persistence.
- Automatic removal of parameters a model rejects, with retry.
- Support for OpenAI-compatible providers via `OPENAI_BASE_URL`.
- Dockerfile, Compose example, GitHub Actions CI, 41 tests.
