#!/usr/bin/env bash
# Example commands for adding the bridge to Claude Code.
# Replace the key and path before running.

# Option A: a local build (most reliable)
claude mcp add chatgpt --scope user \
  -e OPENAI_API_KEY=sk-your-key-here \
  -- node /absolute/path/to/chatgpt-mcp-bridge/dist/index.js

# Option B: straight from GitHub with npx (no clone needed)
claude mcp add chatgpt --scope user \
  -e OPENAI_API_KEY=sk-your-key-here \
  -- npx -y github:myrahossain36-svg/chatgpt-mcp-bridge

# Option C: a remote bridge you host in HTTP mode
claude mcp add --transport http chatgpt https://bridge.example.com/mcp \
  --header "Authorization: Bearer YOUR_MCP_AUTH_TOKEN"

# Check it is connected
claude mcp list
