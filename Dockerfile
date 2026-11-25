# ChatGPT MCP Bridge: container image for HTTP mode.
#
#   docker build -t chatgpt-mcp-bridge .
#   docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... -e MCP_AUTH_TOKEN=change-me chatgpt-mcp-bridge
#
# ---- build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY scripts ./scripts
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime stage -----------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    CONVERSATION_STORE_PATH=/data/conversations.json
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/index.js", "--http"]
