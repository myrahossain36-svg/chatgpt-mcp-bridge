<p align="center">
  <img src="docs/assets/demo-v3.gif" alt="Demo: Claude consults other AIs through the bridge, then runs a panel of ChatGPT, Gemini, Grok and DeepSeek and summarises their answers" width="100%">
  <br><sub>Claude gets a second opinion from ChatGPT, then puts one question to ChatGPT, Gemini, Grok and DeepSeek at once and sums up where they agree. <a href="docs/assets/demo-v3.mp4">Watch the full-quality MP4</a>. (Illustrative session.)</sub>
</p>

<h1 align="center">Multi-AI MCP Bridge</h1>

<p align="center">
  <b>Give Claude a phone line to every major AI.</b><br>
  ChatGPT, Gemini, Grok, DeepSeek, Mistral, Llama, Perplexity, Kimi, Qwen, Cohere, Claude itself and local models: ask any of them, run an AI panel, get second opinions and code reviews, compare models side by side and generate images, all without leaving Claude.
</p>

<p align="center">
  <a href="https://github.com/myrahossain36-svg/chatgpt-mcp-bridge/actions/workflows/ci.yml"><img src="https://github.com/myrahossain36-svg/chatgpt-mcp-bridge/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/MCP-compatible-7c3aed" alt="MCP compatible">
  <img src="https://img.shields.io/badge/AI%20providers-15-f59e0b" alt="15 AI providers">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+">
  <img src="https://img.shields.io/badge/tests-61%20passing-success" alt="61 tests">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT licence"></a>
</p>

<p align="center">
  <a href="#quick-start-claude-desktop-5-minutes">Claude Desktop</a> ·
  <a href="#quick-start-claude-code">Claude Code</a> ·
  <a href="#remote--claudeai-connector-http-mode">claude.ai / remote</a> ·
  <a href="docs/PROVIDERS.md">15 AI providers</a> ·
  <a href="docs/TOOLS.md">Tool reference</a> ·
  <a href="docs/TROUBLESHOOTING.md">Troubleshooting</a>
</p>

### One-line install for Claude Code

```bash
claude mcp add ai-bridge --scope user -e OPENAI_API_KEY=sk-... -e GEMINI_API_KEY=... -- npx -y github:myrahossain36-svg/chatgpt-mcp-bridge
```

### Why more than one AI?

Different models make different mistakes. Letting Claude consult ChatGPT, Gemini, Grok and the rest gives you a built-in cross-check: Claude drafts, the others challenge, Claude reconciles, and you see where they agree and where they do not. It is also the quickest way to try every major model on your real work without switching apps.

### Every major AI, one bridge

| | | | |
| --- | --- | --- | --- |
| **ChatGPT** (OpenAI) | **Gemini** (Google) | **Grok** (xAI) | **Claude** (Anthropic) |
| **DeepSeek** | **Mistral** | **Llama** (Meta) | **Perplexity** (live web) |
| **Kimi** (Moonshot) | **Qwen** (Alibaba) | **Cohere** | **Groq** (fast open models) |
| **OpenRouter** (hundreds more) | **Ollama** (local, free) | **LM Studio** (local, free) | |

Switch each one on by adding its API key. Use as many as you like. Full list, key links and settings: [docs/PROVIDERS.md](docs/PROVIDERS.md). It also works in reverse: [use it from ChatGPT](docs/USE-FROM-CHATGPT.md) to reach Claude.

It is an [MCP](https://modelcontextprotocol.io) server, so it works with **Claude Desktop**, **Claude Code**, **claude.ai custom connectors** and any other MCP client.

```text
                                                      ┌──► ChatGPT (OpenAI)
                                                      ├──► Gemini (Google)
 You ──► Claude ──(MCP)──► Multi-AI MCP Bridge ──(HTTPS)┼──► Grok, DeepSeek, Mistral, Llama ...
            ▲                                         ├──► Claude, Perplexity, Kimi, Qwen ...
            │                                         └──► Ollama / LM Studio (local)
            └──────────────────── answers ◄──────────────────────┘
```

---

## Contents

1. [What you can do with it](#what-you-can-do-with-it)
2. [Before you start](#before-you-start)
3. [Quick start: Claude Desktop (5 minutes)](#quick-start-claude-desktop-5-minutes)
4. [Quick start: Claude Code](#quick-start-claude-code)
5. [Remote / claude.ai connector (HTTP mode)](#remote--claudeai-connector-http-mode)
6. [The tools](#the-tools)
7. [Built-in prompts](#built-in-prompts)
8. [Configuration](#configuration)
9. [Using other providers (Gemini, Grok, Claude, DeepSeek and more)](#using-other-providers)
10. [Troubleshooting](#troubleshooting)
11. [Security and costs](#security-and-costs)
12. [Development](#development)
13. [FAQ](#faq)

---

## What you can do with it

Once installed, just talk to Claude normally:

| You say to Claude | What happens |
| --- | --- |
| "Ask ChatGPT what it thinks of this paragraph." | Claude calls `chatgpt_ask` and shows you ChatGPT's reply. |
| "Get a second opinion from ChatGPT on your answer." | Claude sends its own answer to `chatgpt_second_opinion` and reconciles the two views. |
| "Have ChatGPT review this function for security issues." | `chatgpt_code_review` returns issues with severity and fixes. |
| "Start a brainstorm with ChatGPT called `launch-ideas` and keep going back and forth." | `chatgpt_ask` with a `conversation_id` keeps a real multi-turn thread. |
| "Ask ChatGPT to argue against my plan." | `chatgpt_debate` stress-tests the idea. |
| "Use ChatGPT to extract the names and dates from this text as JSON." | `chatgpt_structured` returns a parsed JSON object. |
| "Generate an image of a lighthouse at dawn with OpenAI." | `chatgpt_generate_image` returns the image right in the chat. |
| "Ask Gemini what it thinks of this contract clause." | `ai_ask` with `provider: "gemini"` sends it to Google Gemini. |
| "Run an AI panel: is this business plan realistic?" | `ai_panel` asks every AI you have switched on at once, then Claude summarises where they agree. |
| "Compare ChatGPT, Grok and DeepSeek on this puzzle." | `chatgpt_compare_models` runs them in parallel and shows the answers side by side. |
| "Which ChatGPT models can I use?" | `chatgpt_list_models` lists the models your key can access. |

Features at a glance:

- 15 AI providers: ChatGPT, Claude, Gemini, Grok, DeepSeek, Mistral, Llama, Perplexity, Kimi, Qwen, Cohere, Groq, OpenRouter, Ollama, LM Studio
- Automatic model fallback when a provider retires a model name
- 15 tools, 3 ready-made prompts, and conversation threads exposed as MCP resources
- Multi-turn memory per `conversation_id`, with optional saving to disk
- Works with any OpenAI-compatible API (Azure OpenAI, OpenRouter, Ollama, LM Studio, vLLM)
- Automatic retries, timeouts, and clear "how to fix" messages for every common error
- Copes with models that reject `temperature` or other settings (drops them and retries)
- Optional model allow-list to control cost
- Two transports: **stdio** (local) and **Streamable HTTP** (remote, with bearer-token auth)
- Dockerfile, Docker Compose file, GitHub Actions CI and 61 automated tests
- API keys are never logged or returned by any tool

---

## Before you start

You need three things:

1. **Node.js 20 or newer.** Check with `node --version`. If you do not have it, install the LTS version from [nodejs.org](https://nodejs.org).
2. **An API key from at least one AI provider**, for example [OpenAI (ChatGPT)](https://platform.openai.com/api-keys), [Google Gemini](https://aistudio.google.com/apikey), [xAI Grok](https://console.x.ai), [Anthropic Claude](https://platform.claude.com/settings/keys) or [DeepSeek](https://platform.deepseek.com/api_keys). Add as many as you like; [PROVIDERS.md](docs/PROVIDERS.md) lists all 15 and where to get each key. Want something free? [Ollama](https://ollama.com) runs models on your own computer with no key.
   > A chat subscription (ChatGPT Plus, Gemini Advanced, SuperGrok and so on) is **not** the same as API access. APIs are billed separately, per use. Set a monthly spending limit with each provider.
3. **Claude Desktop or Claude Code.** Download Claude Desktop from [claude.ai/download](https://claude.ai/download).

---

## Quick start: Claude Desktop (5 minutes)

### Step 1: Download and build the bridge

Open a terminal (macOS: **Terminal**; Windows: **PowerShell**) and run:

```bash
git clone https://github.com/myrahossain36-svg/chatgpt-mcp-bridge.git
cd chatgpt-mcp-bridge
npm install
```

`npm install` also builds the project (it creates the `dist/` folder). Then print the full path of the file Claude needs to run:

```bash
# macOS / Linux
echo "$(pwd)/dist/index.js"

# Windows (PowerShell)
Join-Path (Get-Location) "dist\index.js"
```

Copy that path. You will paste it in step 3.

> No git? Click the green **Code** button on GitHub, choose **Download ZIP**, unzip it, open a terminal in that folder, and run `npm install`.

### Step 2 (optional but recommended): Test your keys

Put in whichever keys you have; this checks each AI answers:

```bash
# macOS / Linux
OPENAI_API_KEY=sk-... GEMINI_API_KEY=... npm run check-key

# Windows (PowerShell)
$env:OPENAI_API_KEY="sk-..."; $env:GEMINI_API_KEY="..."; npm run check-key
```

You should see `OK` next to each AI and `All ... provider(s) work with the bridge.` If not, the message tells you what to fix.

### Step 3: Tell Claude Desktop about the bridge

1. Open Claude Desktop.
2. Open **Settings** → **Developer** → **Edit Config**. This opens `claude_desktop_config.json`:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Paste the following, replacing the path and the keys (keep the ones you have, delete the rest). If the file already has an `"mcpServers"` section, add the `"ai-bridge"` block inside it rather than creating a second section.

**macOS / Linux**

```json
{
  "mcpServers": {
    "ai-bridge": {
      "command": "node",
      "args": ["/Users/YOUR_NAME/chatgpt-mcp-bridge/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-your-openai-key",
        "GEMINI_API_KEY": "your-gemini-key",
        "XAI_API_KEY": "xai-your-grok-key",
        "ANTHROPIC_API_KEY": "your-claude-key"
      }
    }
  }
}
```

**Windows** (note the doubled backslashes, which JSON requires)

```json
{
  "mcpServers": {
    "ai-bridge": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_NAME\\chatgpt-mcp-bridge\\dist\\index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-your-openai-key",
        "GEMINI_API_KEY": "your-gemini-key",
        "XAI_API_KEY": "xai-your-grok-key",
        "ANTHROPIC_API_KEY": "your-claude-key"
      }
    }
  }
}
```

4. Save the file.

### Step 4: Restart Claude Desktop

Quit Claude Desktop **completely** (macOS: `Cmd+Q`; Windows: right-click the tray icon → Quit) and open it again.

### Step 5: Try it

Start a new chat and click the tools/connectors icon. You should see **ai-bridge** with 15 tools. Then type:

> Use chatgpt_server_info to check the ChatGPT bridge, then ask ChatGPT to tell me a fun fact about octopuses.

The first time Claude uses a tool it will ask for permission. Choose **Allow** (or **Always allow**).

That is it. More configs (all settings, `npx` version, Windows) are in [`examples/`](examples/). Something not working? See [Troubleshooting](#troubleshooting).

---

## Quick start: Claude Code

After step 1 above (clone and `npm install`):

```bash
claude mcp add ai-bridge --scope user \
  -e OPENAI_API_KEY=sk-your-key-here \
  -- node /absolute/path/to/chatgpt-mcp-bridge/dist/index.js
```

Or skip the clone and run straight from GitHub:

```bash
claude mcp add ai-bridge --scope user \
  -e OPENAI_API_KEY=sk-your-key-here \
  -- npx -y github:myrahossain36-svg/chatgpt-mcp-bridge
```

Check with `claude mcp list` (or `/mcp` inside Claude Code), then ask: *"Ask Gemini to review src/index.ts"* or *"Run an AI panel on this design."*

To share the setup with a team without committing a key, put [`examples/project.mcp.json`](examples/project.mcp.json) in your project as `.mcp.json`. It reads `OPENAI_API_KEY` from each person's environment.

Full guide: [docs/CLAUDE-CODE.md](docs/CLAUDE-CODE.md).

---

## Remote / claude.ai connector (HTTP mode)

The bridge can also run as a web service, so Claude can reach it over the internet. This is how you use it from **claude.ai** (as a custom connector) or share one bridge across a team.

```bash
export OPENAI_API_KEY=sk-your-key-here
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)   # keep this secret
npm run start:http                              # http://127.0.0.1:3000/mcp
```

Or with Docker:

```bash
docker build -t chatgpt-mcp-bridge .
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=sk-your-key-here \
  -e MCP_AUTH_TOKEN=your-long-random-token \
  -v ai-bridge-data:/data \
  chatgpt-mcp-bridge
curl http://localhost:3000/health
```

Then put it behind HTTPS (a host such as Render, Railway or Fly.io, or a tunnel such as Cloudflare Tunnel) and connect:

- **Claude Code:** `claude mcp add --transport http ai-bridge https://your-host/mcp --header "Authorization: Bearer YOUR_TOKEN"`
- **claude.ai:** Settings → Connectors → *Add custom connector*, URL `https://your-host/mcp?token=YOUR_TOKEN`

Step-by-step hosting instructions, including the security trade-offs of putting a token in the URL: [docs/REMOTE-HTTP.md](docs/REMOTE-HTTP.md).

---

## The tools

| Tool | What it does | Key inputs |
| --- | --- | --- |
| `chatgpt_ask` | Send ChatGPT (the default AI) a message. Reuse a `conversation_id` for multi-turn chat. | `message`, `conversation_id?`, `system_prompt?`, `provider?`, `model?` |
| `ai_ask` | Ask a specific AI by name: Gemini, Grok, Claude, DeepSeek, and so on. | `provider`, `message`, `conversation_id?` |
| `ai_panel` | Ask every configured AI (or a chosen list) the same question at once. | `message`, `providers?[]` |
| `ai_list_providers` | Which AIs are switched on, and how to switch on the rest. | none |
| `chatgpt_second_opinion` | Critical review of an answer, plan or draft. Verdict, what is right, what is wrong, better answer. | `question`, `answer`, `focus?` |
| `chatgpt_code_review` | Code review with severity ratings and concrete fixes. | `code`, `language?`, `context?`, `focus?[]` |
| `chatgpt_debate` | Argue for, against or both sides of a position. | `position`, `stance?` |
| `chatgpt_compare_models` | Same prompt to 2 to 8 models (any providers) in parallel, side by side with timing and tokens. | `message`, `models[]`, `system_prompt?` |
| `chatgpt_structured` | Get a JSON object back (parsed and validated). | `instruction`, `json_shape`, `input?` |
| `chatgpt_generate_image` | Create 1 to 4 images, returned into the chat (and optionally saved). | `prompt`, `size?`, `quality?`, `count?` |
| `chatgpt_list_conversations` | List the conversation threads the bridge holds. | none |
| `chatgpt_get_conversation` | Show a thread's full history. | `conversation_id` |
| `chatgpt_reset_conversation` | Delete one thread, or all of them. | `conversation_id?`, `all?` |
| `chatgpt_list_models` | Models your key can use (chat models by default). | `filter?`, `chat_only?` |
| `chatgpt_server_info` | Version and settings (never the key). Good health check. | none |

Every chat tool also accepts `provider` (which AI to use), `model`, `temperature`, `max_output_tokens` and `reasoning_effort` (`minimal`/`low`/`medium`/`high`). Each reply ends with a short footer showing the model used and token counts, so you can keep an eye on cost.

Full reference with example calls and outputs: [docs/TOOLS.md](docs/TOOLS.md).

---

## Built-in prompts

The bridge ships three MCP prompts that appear in Claude's prompt menu (in Claude Code they appear as slash commands such as `/mcp__ai-bridge__cross_check`):

- **`cross_check`**: Claude answers, another AI reviews, Claude reconciles.
- **`council`**: Claude and another AI each propose an approach independently, then Claude merges them.
- **`review_my_code`**: both models review the same code and the findings are merged.

---

## Configuration

All settings are environment variables. Put them in the `"env"` block of your Claude config, or in a `.env` file for HTTP/Docker use. See [`.env.example`](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | | ChatGPT. At least one provider key is required; see [PROVIDERS.md](docs/PROVIDERS.md) for `GEMINI_API_KEY`, `XAI_API_KEY`, `ANTHROPIC_API_KEY` and the rest. |
| `DEFAULT_PROVIDER` | `openai` | Which AI the tools use when none is named. |
| `<PROVIDER>_MODEL`, `<PROVIDER>_BASE_URL` | | Per-provider model and address, e.g. `GEMINI_MODEL`. |
| `OPENAI_MODEL` | `gpt-5.6-sol` | Default chat model. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Default image model. |
| `ALLOWED_MODELS` | *(any)* | Comma-separated allow-list, e.g. `gpt-5.6-sol,gpt-image-2`. |
| `OPENAI_BASE_URL` | OpenAI | Point at Azure OpenAI, OpenRouter, Ollama, etc. |
| `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID` | | Bill to a specific organisation/project. |
| `MAX_OUTPUT_TOKENS` | `4096` | Default reply length limit. |
| `REQUEST_TIMEOUT_MS` | `120000` | Per-request timeout. |
| `MAX_RETRIES` | `2` | Automatic retries on rate limits and server errors. |
| `MAX_HISTORY_MESSAGES` | `40` | Messages kept per conversation (system prompt always kept). |
| `MAX_CONVERSATIONS` | `200` | Threads held at once (least recently used dropped first). |
| `CONVERSATION_TTL_MINUTES` | `1440` | Idle threads are forgotten after this long. |
| `CONVERSATION_STORE_PATH` | *(memory)* | JSON file to keep threads across restarts. |
| `IMAGE_OUTPUT_DIR` | *(off)* | Also save generated images to this folder. |
| `DEFAULT_SYSTEM_PROMPT` | | Instructions applied to every `chatgpt_ask` call. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent`. Logs go to stderr. |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | HTTP mode address. |
| `MCP_AUTH_TOKEN` | | Bearer token required in HTTP mode. |
| `ALLOWED_HOSTS` | | Extra allowed `Host` headers when binding to `0.0.0.0`. |
| `CORS_ORIGINS` | | Browser origins allowed to call the HTTP endpoint. |

> **Model names change often.** If the default model is not available on your account, run the `chatgpt_list_models` tool (or `npm run check-key`) and set `OPENAI_MODEL` to one that is.

More detail: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

---

## Using other providers

Add any of these keys alongside (or instead of) your OpenAI key:

```json
"env": {
  "OPENAI_API_KEY": "sk-...",
  "GEMINI_API_KEY": "...",
  "XAI_API_KEY": "xai-...",
  "ANTHROPIC_API_KEY": "...",
  "DEEPSEEK_API_KEY": "sk-..."
}
```

Then ask Claude: *"Ask Grok..."*, *"Run an AI panel on..."*, or *"Which AIs are switched on?"*. Local models work too: install [Ollama](https://ollama.com), pull a model, and add `"OLLAMA_ENABLED": "true"`.

The full list of 15 providers, where to get each key, model settings and regional notes is in [docs/PROVIDERS.md](docs/PROVIDERS.md). Azure OpenAI and other compatible servers: [docs/OTHER-PROVIDERS.md](docs/OTHER-PROVIDERS.md).

--- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-5.6-sol` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (local) | `http://localhost:1234/v1` | the loaded model's ID |
| Azure OpenAI | `https://YOUR-RESOURCE.openai.azure.com/openai/v1` | your deployment name |

Details and caveats: [docs/OTHER-PROVIDERS.md](docs/OTHER-PROVIDERS.md).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No "ai-bridge" tools appear in Claude | Check the JSON is valid (paste it into [jsonlint.com](https://jsonlint.com)), the path is absolute and points at `dist/index.js`, then fully quit and reopen Claude. |
| "Server disconnected" / "failed to start" | Read the log (below). Most often `OPENAI_API_KEY` is missing, or `node` is not on Claude's PATH: use the full path from `which node` (macOS) or `where node` (Windows) as `"command"`. |
| `HTTP 401` | The key is wrong or revoked. Create a new one and update the config. |
| `HTTP 429` | Out of credit or rate limited. Check OpenAI billing and limits. |
| `HTTP 404` model not found | Run `chatgpt_list_models` and set `OPENAI_MODEL` to a listed model. |
| Reply ends with `finish: length` | The reply was cut off. Ask Claude to use a higher `max_output_tokens`. |
| `dist/index.js` missing | Run `npm install` (or `npm run build`) in the project folder. |

**Where are the logs?**

- macOS: `~/Library/Logs/Claude/mcp-server-ai-bridge.log`
- Windows: `%APPDATA%\Claude\logs\mcp-server-ai-bridge.log`

Set `"LOG_LEVEL": "debug"` in the config for more detail. You can also test the server on its own with the MCP Inspector: `OPENAI_API_KEY=sk-... npm run inspect`.

Full guide: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## Security and costs

- **Your key stays local.** In stdio mode the key lives only in your Claude config and is sent only to OpenAI (or your `OPENAI_BASE_URL`). It is redacted from logs and never returned by any tool.
- **What leaves your machine:** only the text Claude chooses to send in a tool call, which you can see (and approve) in Claude before it runs. The other AIs cannot see the rest of your Claude conversation.
- **Costs:** every tool call is a billed OpenAI API request. Set a monthly budget in OpenAI billing, use `ALLOWED_MODELS` to block expensive models, and keep `MAX_OUTPUT_TOKENS` sensible.
- **HTTP mode:** always set `MCP_AUTH_TOKEN` and use HTTPS when exposing the bridge beyond your own computer. Without a token, anyone who can reach it can spend your credit.
- **Confidential material:** consider your obligations before sending client, personal or confidential data to any third-party AI service, and check OpenAI's data-usage terms for your account.

Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

---

## Development

```bash
npm install          # install and build
npm run dev          # run from source (stdio) with tsx
npm run dev:http     # run from source in HTTP mode
npm test             # 61 tests, no API key or network needed
npm run typecheck
npm run build
npm run inspect      # open the MCP Inspector against dist/index.js
```

Project layout:

```text
src/
  index.ts              CLI entry point (stdio or --http)
  cli.ts                argument parsing
  config.ts             environment variable loading and validation
  providers.ts          the catalogue of 15 AI providers
  backend.ts            OpenAI-compatible client, multi-provider router, model fallback
  conversations.ts      multi-turn thread store (memory or JSON file)
  server.ts             builds the MCP server and registers everything
  prompts.ts            MCP prompts and resources
  logger.ts             stderr-only logger with key redaction
  tools/                one file per group of tools
  transports/           stdio and Streamable HTTP
test/                   vitest suites with a fake backend
docs/                   detailed guides
examples/               ready-to-copy configs
```

How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contributions welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## FAQ

**Is this official?** No. It is an independent open-source project, not made or endorsed by OpenAI, Anthropic, Google, xAI or any other provider. All product names are trademarks of their owners.

**Can it use my ChatGPT Plus (or other chat) subscription instead of an API key?** No. It uses each provider's API, which needs an API key and is billed separately.

**Which AIs does it support?** 15 providers: ChatGPT, Claude, Gemini, Grok, DeepSeek, Mistral, Llama, Perplexity, Kimi, Qwen, Cohere, Groq, OpenRouter (hundreds of models), Ollama and LM Studio. See [PROVIDERS.md](docs/PROVIDERS.md).

**Can ChatGPT use it to reach Claude?** Yes, by hosting it in HTTP mode. See [USE-FROM-CHATGPT.md](docs/USE-FROM-CHATGPT.md).

**Do the other AIs see my whole Claude chat?** No. They only see what Claude sends in each tool call (plus earlier turns of the same `conversation_id`).

**Do conversations survive a restart?** Only if you set `CONVERSATION_STORE_PATH`. Otherwise they are kept in memory until the bridge stops.

**Can I use it with other MCP clients?** Yes. Any MCP client that supports stdio or Streamable HTTP will work.

---

## Licence

[MIT](LICENSE)
