# Troubleshooting

Work through these in order. Most problems are solved by step 1 or 2.

## 1. Read the log

Claude Desktop writes each MCP server's stderr to a log file:

| System | Log file |
| --- | --- |
| macOS | `~/Library/Logs/Claude/mcp-server-chatgpt.log` |
| Windows | `%APPDATA%\Claude\logs\mcp-server-chatgpt.log` |

On macOS you can follow it live:

```bash
tail -f ~/Library/Logs/Claude/mcp-server-chatgpt.log
```

Add `"LOG_LEVEL": "debug"` to the `env` block for more detail. Every line from the bridge starts with `[chatgpt-mcp-bridge]`.

## 2. Run the server by hand

From the project folder:

```bash
OPENAI_API_KEY=sk-... node dist/index.js
```

- If it prints `Ready on stdio` and waits, the server is fine. Press `Ctrl+C`. The problem is in the Claude config.
- If it prints `Failed to start: ...`, fix what it says.

Test the key and model separately:

```bash
OPENAI_API_KEY=sk-... npm run check-key
```

## 3. Inspect with the MCP Inspector

```bash
OPENAI_API_KEY=sk-... npm run inspect
```

This opens a web page where you can list and call every tool without Claude.

## Common problems

### The tools do not appear in Claude

- The config JSON is invalid. Common causes: a missing comma between servers, a trailing comma, single backslashes in Windows paths. Validate it at jsonlint.com.
- You edited the wrong file. Use **Settings → Developer → Edit Config** to open the right one.
- Claude was not fully restarted. Quit from the menu bar / system tray, not just the window.
- The path in `args` is relative or wrong. It must be the absolute path to `dist/index.js`.

### `spawn node ENOENT` or "command not found"

Claude cannot find Node. Use the full path from `which node` / `where node` as `"command"`.

### `Cannot find module '.../dist/index.js'`

Run `npm install` (which builds) or `npm run build` in the project folder.

### `OPENAI_API_KEY is not set`

The `env` block is missing, misspelt, or not inside the `chatgpt` entry.

### HTTP 401 / invalid API key

The key is wrong, has a stray space, or was revoked. Create a new key.

### HTTP 429 / insufficient quota

The account has no credit or hit a rate limit. Add credit in OpenAI billing. Free ChatGPT and ChatGPT Plus do not include API credit.

### HTTP 404 / model not found

Model names change. Ask Claude to run `chatgpt_list_models`, then set `OPENAI_MODEL` to one listed.

### HTTP 400 mentioning temperature, reasoning_effort or response_format

The bridge normally removes these automatically and retries. If you still see this, the provider rejected something else; try another model and report an issue with the debug log.

### Replies stop mid-sentence

The footer shows `finish: length`. Ask for a larger `max_output_tokens` or raise `MAX_OUTPUT_TOKENS`.

### Requests time out

Reasoning models with high effort can take minutes. Raise `REQUEST_TIMEOUT_MS` (e.g. `"300000"`).

### Conversations disappear

They are in memory by default and are lost when Claude restarts the bridge, after `CONVERSATION_TTL_MINUTES` of inactivity, or when more than `MAX_CONVERSATIONS` exist. Set `CONVERSATION_STORE_PATH` to keep them.

### HTTP mode: 401 Unauthorized

Send `Authorization: Bearer <MCP_AUTH_TOKEN>` (or `?token=` in the URL). Check for whitespace in the token.

### HTTP mode: 403 / invalid Host header

You are reaching the server by a hostname it does not expect. Set `ALLOWED_HOSTS=your.hostname` and, in containers, `HOST=0.0.0.0`.

## Still stuck?

Open an issue with: your OS, `node --version`, how you run the bridge, your config with the key removed, and the relevant log lines (keys are redacted automatically, but double-check).
