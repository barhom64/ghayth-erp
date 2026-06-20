import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Build-time revision baked into the production bundle by `build.mjs` via
 * esbuild `define`. These globals only exist in the bundled output; under
 * `tsx`/dev they are absent, so every read is guarded with `typeof`.
 */
declare const __APP_COMMIT__: string | undefined;
declare const __APP_BUILT_AT__: string | undefined;

const PROCESS_STARTED_AT = new Date().toISOString();

/**
 * Best-effort runtime fallback for dev (`tsx`, no esbuild `define`): read the
 * checked-out commit straight from `.git`. Walks up from cwd looking for a
 * `.git` dir, resolves HEAD (ref or detached), and supports packed-refs.
 * Returns "unknown" on any failure — never throws.
 */
function readGitCommit(): string {
  try {
    let dir = process.cwd();
    let gitDir: string | null = null;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, ".git");
      try {
        const head = readFileSync(path.join(candidate, "HEAD"), "utf8");
        gitDir = candidate;
        const m = head.match(/^ref:\s*(.+)$/m);
        if (!m) return head.trim(); // detached HEAD → raw sha
        const ref = m[1].trim();
        try {
          return readFileSync(path.join(gitDir, ref), "utf8").trim();
        } catch {
          // ref not loose → look it up in packed-refs
          const packed = readFileSync(path.join(gitDir, "packed-refs"), "utf8");
          for (const line of packed.split("\n")) {
            if (line.endsWith(" " + ref)) return line.split(" ")[0].trim();
          }
          return "unknown";
        }
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

const COMMIT: string =
  typeof __APP_COMMIT__ !== "undefined" && __APP_COMMIT__
    ? __APP_COMMIT__
    : process.env.APP_COMMIT?.trim() || readGitCommit();

const BUILT_AT: string =
  typeof __APP_BUILT_AT__ !== "undefined" && __APP_BUILT_AT__
    ? __APP_BUILT_AT__
    : "unknown";

export interface VersionInfo {
  commit: string;
  shortCommit: string;
  builtAt: string;
  startedAt: string;
  node: string;
  env: string;
}

export function getVersionInfo(): VersionInfo {
  return {
    commit: COMMIT,
    shortCommit: COMMIT === "unknown" ? "unknown" : COMMIT.slice(0, 12),
    builtAt: BUILT_AT,
    startedAt: PROCESS_STARTED_AT,
    node: process.version,
    env: process.env.NODE_ENV ?? "development",
  };
}

export function getShortCommit(): string {
  return COMMIT === "unknown" ? "unknown" : COMMIT.slice(0, 12);
}
