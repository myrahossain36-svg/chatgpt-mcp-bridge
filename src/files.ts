/**
 * Safe file sharing: lets the AIs read files from folders the user has
 * explicitly approved with ALLOWED_FILE_DIRS. Nothing outside those folders
 * can be read, symlinks are resolved before checking, and sizes are capped.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { ConfigError } from "./config.js";

export interface FileLimits {
  allowedDirs: string[];
  maxFileBytes: number;
  maxTotalBytes: number;
}

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".mp3", ".mp4", ".mov", ".avi", ".wav", ".woff", ".woff2",
  ".ttf", ".otf", ".docx", ".xlsx", ".pptx", ".sqlite", ".db", ".class", ".jar", ".pyc",
]);

const LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx", ".mjs": "javascript", ".py": "python",
  ".rb": "ruby", ".go": "go", ".rs": "rust", ".java": "java", ".kt": "kotlin", ".cs": "csharp", ".php": "php",
  ".swift": "swift", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".sql": "sql", ".sh": "bash",
  ".json": "json", ".yml": "yaml", ".yaml": "yaml", ".md": "markdown", ".html": "html", ".css": "css",
  ".lua": "lua", ".toml": "toml", ".xml": "xml", ".txt": "",
};

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Resolve and validate one path against the allow-list. Returns the real path. */
export function checkPath(path: string, limits: FileLimits): string {
  if (limits.allowedDirs.length === 0) {
    throw new ConfigError(
      "File sharing is switched off. To let the AIs read files, set ALLOWED_FILE_DIRS to the folder(s) they may read, " +
        'e.g. "ALLOWED_FILE_DIRS": "/Users/me/projects". Or paste the content into the message instead.',
    );
  }
  const abs = resolve(limits.allowedDirs[0], path);
  if (!existsSync(abs)) throw new ConfigError(`File not found: ${path}`);
  const real = realpathSync(abs);
  const allowed = limits.allowedDirs.map((d) => (existsSync(d) ? realpathSync(d) : resolve(d)));
  if (!allowed.some((d) => isInside(real, d))) {
    throw new ConfigError(`"${path}" is outside ALLOWED_FILE_DIRS, so the AIs may not read it.`);
  }
  const st = statSync(real);
  if (!st.isFile()) throw new ConfigError(`"${path}" is not a file.`);
  if (BINARY_EXT.has(extname(real).toLowerCase())) {
    throw new ConfigError(`"${path}" looks like a binary file; only text files can be shared.`);
  }
  if (st.size > limits.maxFileBytes) {
    throw new ConfigError(`"${path}" is ${st.size} bytes; the limit is ${limits.maxFileBytes} (MAX_FILE_BYTES).`);
  }
  return real;
}

/** Read files and format them as a context block to append to a message. */
export function buildFileContext(paths: string[] | undefined, limits: FileLimits): string {
  if (!paths || paths.length === 0) return "";
  let total = 0;
  const parts: string[] = [];
  for (const p of paths) {
    const real = checkPath(p, limits);
    const text = readFileSync(real, "utf8");
    if (text.includes("\u0000")) throw new ConfigError(`"${p}" contains binary data; only text files can be shared.`);
    total += Buffer.byteLength(text);
    if (total > limits.maxTotalBytes) {
      throw new ConfigError(`The files together exceed ${limits.maxTotalBytes} bytes (MAX_TOTAL_FILE_BYTES). Share fewer files.`);
    }
    const shown = limits.allowedDirs.map((d) => relative(d, real)).find((r) => !r.startsWith("..")) ?? p;
    const fence = text.includes("```") ? "~~~~" : "```";
    parts.push(`### File: ${shown.split(sep).join("/")}\n${fence}${LANG[extname(real).toLowerCase()] ?? ""}\n${text}\n${fence}`);
  }
  return `\n\n## Shared files\n\n${parts.join("\n\n")}`;
}
