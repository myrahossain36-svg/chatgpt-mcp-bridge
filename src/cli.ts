/** Command-line argument parsing (kept separate so it can be unit-tested). */
import { ConfigError } from "./config.js";

export interface CliArgs {
  http: boolean;
  port?: number;
  host?: string;
  help: boolean;
  version: boolean;
  providers: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { http: false, help: false, version: false, providers: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--http") out.http = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--providers") out.providers = true;
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) out.port = Number(a.split("=")[1]);
    else if (a === "--host") out.host = argv[++i];
    else if (a.startsWith("--host=")) out.host = a.split("=")[1];
    else throw new ConfigError(`Unknown option "${a}". Run with --help.`);
  }
  if (out.port !== undefined && (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535)) {
    throw new ConfigError("--port must be a number between 1 and 65535");
  }
  return out;
}
