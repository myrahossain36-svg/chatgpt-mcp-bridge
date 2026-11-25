# Configuration reference

The bridge reads environment variables only. Invalid values stop the server at start-up with a message naming the variable, so mistakes show up immediately in the Claude log rather than half-way through a chat.

Where to set them:

- **Claude Desktop:** the `"env"` object of the server entry in `claude_desktop_config.json`. Every value must be a string (`"4096"`, not `4096`).
- **Claude Code:** `-e NAME=value` flags on `claude mcp add`.
- **HTTP / Docker:** a `.env` file (copy `.env.example`), `docker run -e`, or your host's secrets settings.

## OpenAI connection

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | required | Starts with `sk-`. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint. See OTHER-PROVIDERS.md. |
| `OPENAI_ORG_ID` | | For keys that belong to several organisations. |
| `OPENAI_PROJECT_ID` | | Bill usage to a specific project. |
| `REQUEST_TIMEOUT_MS` | `120000` | Minimum 1000. Raise for long reasoning tasks. |
| `MAX_RETRIES` | `2` | Retries with back-off on 429 and 5xx responses (handled by the OpenAI SDK). |

## Models and limits

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5.6-sol` | Used when a tool call does not name a model. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Used by `chatgpt_generate_image`. |
| `ALLOWED_MODELS` | empty (any) | Comma-separated. Applies to chat and image models. Requests for other models fail with a clear message. |
| `MAX_OUTPUT_TOKENS` | `4096` | Default reply limit; a tool call can override it. |
| `DEFAULT_SYSTEM_PROMPT` | | Applied to `chatgpt_ask` when no `system_prompt` is given. Example: `"You are being consulted by another AI assistant. Be concise, cite uncertainty, use British English."` |

### Cost control recipe

```json
"env": {
  "OPENAI_API_KEY": "sk-...",
  "OPENAI_MODEL": "gpt-6.1-terra",
  "ALLOWED_MODELS": "gpt-6.1-terra,gpt-image-2",
  "MAX_OUTPUT_TOKENS": "1500"
}
```

Combine with a monthly limit in OpenAI billing.

## Conversations

| Variable | Default | Notes |
| --- | --- | --- |
| `MAX_HISTORY_MESSAGES` | `40` | Per thread. The system prompt is always kept; the oldest turns are dropped first. |
| `MAX_CONVERSATIONS` | `200` | The least recently used thread is dropped when exceeded. |
| `CONVERSATION_TTL_MINUTES` | `1440` (24h) | Idle threads are forgotten. |
| `CONVERSATION_STORE_PATH` | memory only | e.g. `/Users/me/chatgpt-mcp-bridge/data/conversations.json`. Written atomically after every change. |

The store file contains the full text of your conversations. Keep it somewhere private.

## Images

| Variable | Default | Notes |
| --- | --- | --- |
| `IMAGE_OUTPUT_DIR` | off | Folder to save PNGs into (created if missing). |

## Logging

| Variable | Default | Notes |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent`. Logs go to **stderr** only (stdout is reserved for the MCP protocol). Keys and bearer tokens are redacted. |

## HTTP mode

| Variable | Default | Notes |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` in containers. The Docker image sets this. |
| `PORT` | `3000` | Or `--port`. |
| `MCP_AUTH_TOKEN` | | Required bearer token. Generate with `openssl rand -hex 32`. |
| `ALLOWED_HOSTS` | | Comma-separated Host header values to accept, e.g. `bridge.example.com`. |
| `CORS_ORIGINS` | | Comma-separated browser origins, or `*`. Only needed for browser-based clients. |
