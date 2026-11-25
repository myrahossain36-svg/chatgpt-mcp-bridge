# Running the bridge as a remote (HTTP) server

In HTTP mode the bridge listens at `http://HOST:PORT/mcp` using MCP's **Streamable HTTP** transport. Use it to:

- add the bridge to **claude.ai** as a custom connector,
- share one bridge (and one OpenAI bill) with a team,
- run it on a server instead of each laptop.

## 1. Run it locally first

```bash
export OPENAI_API_KEY=sk-...
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
echo "Your token: $MCP_AUTH_TOKEN"    # save this somewhere safe
npm run start:http
```

Check:

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","name":"chatgpt-mcp-bridge","version":"1.0.0"}
```

Options: `--port 8080`, `--host 0.0.0.0` (or the `PORT` and `HOST` variables).

## 2. Authentication

When `MCP_AUTH_TOKEN` is set, every `/mcp` request must include either:

- the header `Authorization: Bearer <token>` (preferred), or
- the query string `?token=<token>` (for clients that cannot send headers).

`/health` is always open and reveals nothing sensitive.

> **About tokens in URLs.** A token in the URL can end up in proxy and server logs and browser history. Use the header wherever the client supports it, use a long random token, rotate it if it may have leaked, and set an OpenAI spending limit.

The bridge warns at start-up if it is listening on a non-local address without a token.

## 3. Docker

```bash
docker build -t chatgpt-mcp-bridge .
docker run -d --name chatgpt-bridge -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e MCP_AUTH_TOKEN=your-token \
  -v chatgpt-bridge-data:/data \
  chatgpt-mcp-bridge
```

The image binds to `0.0.0.0:3000`, runs as a non-root user, has a health check, and persists conversations to the `/data` volume.

With Compose: copy `.env.example` to `.env`, fill it in, then `docker compose -f examples/docker-compose.yml up -d`.

## 4. Put it on the internet with HTTPS

Claude's remote connectors need an HTTPS URL. Some options:

**A. A platform that runs Docker** (Render, Railway, Fly.io, Google Cloud Run, Azure Container Apps, etc.)

1. Fork or push this repo.
2. Create a new web service from the repo using the `Dockerfile`.
3. Set environment variables `OPENAI_API_KEY` and `MCP_AUTH_TOKEN` in the platform's secrets settings.
4. If the platform sets its own `PORT`, the bridge uses it automatically.
5. Set `ALLOWED_HOSTS` to your public hostname if requests are rejected because of the Host header.
6. Your URL is `https://<your-app-host>/mcp`.

Note: on platforms that scale to zero or run several instances, in-memory conversations may be lost or not shared between instances. Use one instance with a persistent disk and `CONVERSATION_STORE_PATH` if threads matter.

**B. A tunnel from your own computer** (good for trying it out)

```bash
npm run start:http
# in another terminal, for example with Cloudflare Tunnel:
cloudflared tunnel --url http://localhost:3000
```

Use the `https://...trycloudflare.com/mcp` address it prints. It only works while your computer and the tunnel are running.

## 5. Connect Claude

**claude.ai (web, desktop and mobile apps):**

1. Open **Settings → Connectors**.
2. Choose **Add custom connector**.
3. Name: `ChatGPT`. URL: `https://your-host/mcp?token=YOUR_TOKEN`.
4. Save, then enable the connector in a chat from the tools menu.

Availability of custom connectors depends on your Claude plan and, for Team or Enterprise, on your organisation's settings.

**Claude Code:**

```bash
claude mcp add --transport http chatgpt https://your-host/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

**Any MCP client:** point it at `https://your-host/mcp` with the bearer header.

## How HTTP mode works

The endpoint is **stateless**: each POST creates a fresh MCP server instance, handles the request and closes. That is simple to host and scale. Conversation threads still work across requests because they live in the shared conversation store, keyed by `conversation_id`. `GET` and `DELETE` on `/mcp` return 405 because there are no long-lived sessions.

Protection built in:

- DNS-rebinding protection when bound to localhost (via the MCP SDK), plus `ALLOWED_HOSTS` for public hostnames
- constant-time token comparison
- CORS only for origins listed in `CORS_ORIGINS`
- API key redaction in all logs
