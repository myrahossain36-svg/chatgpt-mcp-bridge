# Claude Desktop setup (detailed)

This expands on the Quick start in the README.

## 1. Install Node.js

Install the **LTS** version from [nodejs.org](https://nodejs.org). Then, in a new terminal:

```bash
node --version   # must print v20 or higher
```

## 2. Get the bridge

```bash
git clone https://github.com/myrahossain36-svg/chatgpt-mcp-bridge.git
cd chatgpt-mcp-bridge
npm install
```

`npm install` builds the project automatically. You should now have `dist/index.js`.

Get its absolute path:

| System | Command |
| --- | --- |
| macOS / Linux | `echo "$(pwd)/dist/index.js"` |
| Windows PowerShell | `Join-Path (Get-Location) "dist\index.js"` |

## 3. Get an OpenAI API key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and sign in.
2. Click **Create new secret key**, name it (e.g. "Claude bridge"), and copy it. You will not be able to see it again.
3. Under [Billing](https://platform.openai.com/settings/organization/billing), add credit and set a monthly limit.

Test it:

```bash
OPENAI_API_KEY=sk-... npm run check-key
```

## 4. Edit the Claude Desktop config

In Claude Desktop: **Settings → Developer → Edit Config**. The file is:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the bridge under `mcpServers`. Ready-made versions:

- [examples/claude_desktop_config.macos.json](../examples/claude_desktop_config.macos.json)
- [examples/claude_desktop_config.windows.json](../examples/claude_desktop_config.windows.json)
- [examples/claude_desktop_config.npx.json](../examples/claude_desktop_config.npx.json) (no clone; runs from GitHub)
- [examples/claude_desktop_config.full.json](../examples/claude_desktop_config.full.json) (every setting)

### Already have other MCP servers?

Add `chatgpt` alongside them; do not create a second `mcpServers` key:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"] },
    "chatgpt": {
      "command": "node",
      "args": ["/Users/me/chatgpt-mcp-bridge/dist/index.js"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

### "node" not found?

Claude Desktop does not always see the same PATH as your terminal (common with nvm, Volta or Homebrew). Use the full path to Node as the command:

```bash
which node      # macOS / Linux, e.g. /opt/homebrew/bin/node
where node      # Windows, e.g. C:\Program Files\nodejs\node.exe
```

```json
"command": "/opt/homebrew/bin/node"
```

## 5. Restart and test

Quit Claude Desktop fully and reopen it. In a new chat, open the tools menu and check **chatgpt** is listed and enabled. Try:

- "Run chatgpt_server_info."
- "Ask ChatGPT for three names for a bakery."
- "Write a haiku about rain, then get ChatGPT's second opinion on it."

## Updating

```bash
cd chatgpt-mcp-bridge
git pull
npm install
```

Then restart Claude Desktop.

## Uninstalling

Remove the `chatgpt` block from the config, restart Claude, and delete the folder. Revoke the API key at platform.openai.com if you no longer need it.
