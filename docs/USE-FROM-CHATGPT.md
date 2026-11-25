# Using the bridge from ChatGPT (the reverse direction)

The bridge is an MCP server, and ChatGPT can connect to remote MCP servers too. Point ChatGPT at a hosted bridge with `ANTHROPIC_API_KEY` set, and ChatGPT can ask Claude (and every other AI you have switched on) through the same tools.

```text
 You ──► ChatGPT ──(MCP over HTTPS)──► Bridge ──► Claude, Gemini, Grok, DeepSeek, ...
```

## What you need

- A ChatGPT plan that allows custom MCP connectors (called "apps" in newer ChatGPT screens). Availability, and whether connectors can perform write actions, depends on your plan and workspace settings; check OpenAI's current help pages.
- The bridge running in HTTP mode at a public **HTTPS** address. ChatGPT cannot start a program on your computer, so the local (stdio) setup used by Claude Desktop does not work here.

## Steps

1. **Host the bridge** following [REMOTE-HTTP.md](REMOTE-HTTP.md), with at least:

   ```bash
   ANTHROPIC_API_KEY=...        # so ChatGPT can reach Claude
   MCP_AUTH_TOKEN=$(openssl rand -hex 32)
   DEFAULT_PROVIDER=anthropic   # optional: make Claude the default AI for the tools
   ```

   Add any other provider keys you want ChatGPT to reach (Gemini, Grok, and so on).

2. **In ChatGPT**, open Settings, find Apps / Connectors, enable developer mode if your plan requires it, and create a new connector.

3. **Server URL:** `https://your-host/mcp?token=YOUR_MCP_AUTH_TOKEN`
   **Authentication:** No authentication (the token in the URL protects it).

   ChatGPT's connector screen offers OAuth or no authentication rather than a custom bearer header, which is why the token goes in the URL. Use a long random token, keep the URL private, and rotate the token if it leaks.

4. Start a chat, enable the connector, and try: *"Use ai_ask with provider claude: what do you think of this plan?"* or *"Run ai_panel on this question."*

## Notes

- Tool names start with `chatgpt_` for historical reasons; in this direction, pass `provider: "claude"` (or set `DEFAULT_PROVIDER=anthropic`) so they ask Claude.
- Everything in [SECURITY.md](../SECURITY.md) applies: anyone with the URL can spend your API credit, so set spending limits with each provider.
