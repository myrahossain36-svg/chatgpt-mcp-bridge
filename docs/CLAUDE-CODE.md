# Claude Code setup

## Add the server

**From a local clone** (after `git clone` and `npm install`):

```bash
claude mcp add chatgpt --scope user \
  -e OPENAI_API_KEY=sk-your-key-here \
  -- node /absolute/path/to/chatgpt-mcp-bridge/dist/index.js
```

**Directly from GitHub** (npx downloads and builds it on first run, so the first start is slower):

```bash
claude mcp add chatgpt --scope user \
  -e OPENAI_API_KEY=sk-your-key-here \
  -- npx -y github:myrahossain36-svg/chatgpt-mcp-bridge
```

`--scope user` makes it available in every project. Use `--scope project` to write it to the project's `.mcp.json` instead (do not commit real keys; see below), or leave the flag off for the current project only.

Add more settings with extra `-e` flags, e.g. `-e OPENAI_MODEL=gpt-6.1-terra -e LOG_LEVEL=debug`.

## Check it

```bash
claude mcp list
```

Inside Claude Code, run `/mcp` to see status and tools.

## Sharing with a team (without sharing a key)

Commit a `.mcp.json` like [examples/project.mcp.json](../examples/project.mcp.json):

```json
{
  "mcpServers": {
    "chatgpt": {
      "command": "npx",
      "args": ["-y", "github:myrahossain36-svg/chatgpt-mcp-bridge"],
      "env": { "OPENAI_API_KEY": "${OPENAI_API_KEY}" }
    }
  }
}
```

Each developer sets `OPENAI_API_KEY` in their own shell profile.

## Using a remote bridge

If you host the bridge in HTTP mode (see [REMOTE-HTTP.md](REMOTE-HTTP.md)):

```bash
claude mcp add --transport http chatgpt https://bridge.example.com/mcp \
  --header "Authorization: Bearer YOUR_MCP_AUTH_TOKEN"
```

## Handy prompts in Claude Code

- "Ask chatgpt_code_review to check the diff in `git diff main` for security issues."
- `/mcp__chatgpt__review_my_code` then paste code: both models review and merge findings.
- "Before you commit, get ChatGPT's second opinion on your plan."

## Remove

```bash
claude mcp remove chatgpt
```
