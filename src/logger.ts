/**
 * Tiny logger that ALWAYS writes to stderr.
 *
 * Why this matters: with the stdio transport, stdout carries the MCP
 * JSON-RPC stream. Anything else printed to stdout (a stray console.log)
 * corrupts that stream and Claude will report the server as broken.
 * Claude Desktop captures stderr into its MCP log files, so logs are
 * still easy to read (see docs/TROUBLESHOOTING.md).
 */
import type { LogLevel } from "./config.js";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

/** Remove anything that looks like an API key before it reaches a log line. */
export function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***REDACTED***")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, "$1***REDACTED***");
}

export function createLogger(level: LogLevel, write: (line: string) => void = (l) => process.stderr.write(l)): Logger {
  const threshold = ORDER[level];
  const emit = (lvl: Exclude<LogLevel, "silent">, msg: string, meta?: unknown) => {
    if (ORDER[lvl] < threshold) return;
    let line = `[chatgpt-mcp-bridge] ${new Date().toISOString()} ${lvl.toUpperCase()} ${msg}`;
    if (meta !== undefined) {
      try {
        line += " " + (meta instanceof Error ? meta.message : JSON.stringify(meta));
      } catch {
        line += " [unserialisable meta]";
      }
    }
    write(redact(line) + "\n");
  };
  return {
    debug: (m, x) => emit("debug", m, x),
    info: (m, x) => emit("info", m, x),
    warn: (m, x) => emit("warn", m, x),
    error: (m, x) => emit("error", m, x),
  };
}
