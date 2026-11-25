// Make dist/index.js executable so `npx chatgpt-mcp-bridge` and global installs work.
import { chmodSync, existsSync } from "node:fs";
const file = new URL("../dist/index.js", import.meta.url);
if (existsSync(file)) chmodSync(file, 0o755);
