#!/usr/bin/env node
//
// scripts/src/check-api-base.mjs
//
// Native-API-origin guard. The app ships the same SPA bundle to the web and
// to the Capacitor native shell. On the web the bundle is served from the
// same origin as the API, so a relative `/api/...` works. Inside the native
// app the bundle is served from https://localhost (Android) /
// capacitor://localhost (iOS), so a relative `/api/...` hits the APP, not the
// server — every such call fails silently in the native build.
//
// The single source of truth is `API_BASE` in artifacts/ghayth-erp/src/lib/
// api.ts, which resolves to the absolute server origin when running natively
// (VITE_API_ORIGIN) and to the relative base on the web. This guard fails the
// build when a file reintroduces a native-breaking pattern:
//
//   1. `import.meta.env.BASE_URL` outside api.ts — a local, relative base
//      redefinition that bypasses the native-aware resolver.
//   2. `fetch("/api…")` / `fetch(`/api…`)` — a hardcoded relative API URL.
//
// Fix: import { API_BASE } from "@/lib/api" and build the URL as
// `${API_BASE}/api/…`, or just use apiFetch / apiUrl / useApiQuery.
//
// OFFLINE source scan; empty baseline allowlist in
// scripts/api-base-allowlist.txt (every offender was migrated), so it's a
// hard ratchet. `.test.tsx`/`.test.ts` skipped. Pure-logic fixtures guard the
// detector.
//
// Usage:
//   node scripts/src/check-api-base.mjs                 # gate
//   node scripts/src/check-api-base.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/api-base-allowlist.txt");

const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// api.ts legitimately owns `import.meta.env.BASE_URL` (the resolver).
const RESOLVER_FILES = new Set(["artifacts/ghayth-erp/src/lib/api.ts"]);

// Match the API-base REDEFINITION idiom specifically — `const BASE =
// import.meta.env.BASE_URL` — not every BASE_URL use. The legitimate consumer
// is the SPA router base (`<WouterRouter base={import.meta.env.BASE_URL}>`),
// which must stay the bundle base, not the API origin.
const RELATIVE_BASE_RE = /\bconst\s+\w+\s*=\s*import\.meta\.env\.BASE_URL\b/;
const HARDCODED_API_FETCH_RE = /fetch\(\s*[`"']\/api\b/;

export function fileHasNativeBreakingApi(text, isResolver) {
  if (!isResolver && RELATIVE_BASE_RE.test(text)) return true;
  if (HARDCODED_API_FETCH_RE.test(text)) return true;
  return false;
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walk(full, out);
    } else if (
      e.isFile() &&
      (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) &&
      !e.name.endsWith(".test.tsx") &&
      !e.name.endsWith(".test.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

async function findOffenders() {
  const offenders = [];
  for (const rel of FRONTEND_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walk(abs, []);
    for (const f of files) {
      const relPath = relative(REPO_ROOT, f).split("\\").join("/");
      const text = await readFile(f, "utf8");
      if (fileHasNativeBreakingApi(text, RESOLVER_FILES.has(relPath))) {
        offenders.push(relPath);
      }
    }
  }
  offenders.sort();
  return offenders;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const set = new Set();
  for (const line of readFileSync(ALLOWLIST_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t);
  }
  return set;
}

async function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const offenders = await findOffenders();

  if (writeMode) {
    const header = [
      "# api-base-allowlist.txt",
      "#",
      "# Pre-existing files with a native-breaking API URL (relative",
      "# import.meta.env.BASE_URL or hardcoded fetch(\"/api…\")). Accepted",
      "# baseline; the guard fails only on a file NOT listed here. Regenerate:",
      "#   node scripts/src/check-api-base.mjs --write-allowlist",
      "# Migrate each to `${API_BASE}/api/…` (import { API_BASE } from \"@/lib/api\").",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:api-base] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:api-base] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:api-base] FAIL: ${fresh.length} file(s) use a native-breaking API URL ` +
        `(relative base / hardcoded "/api") — these fetch the app bundle, not the server, in the Capacitor app:`,
    );
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      '\n  Fix: import { API_BASE } from "@/lib/api" and use `${API_BASE}/api/…`,\n' +
        "  or call apiFetch / apiUrl / useApiQuery (already native-aware).\n" +
        "  If genuinely intentional, add the path to scripts/api-base-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(`[check:api-base] OK — no native-breaking API URLs (${offenders.length} allowlisted).`);
}

main().catch((err) => {
  console.error("[check:api-base] ERROR:", err);
  process.exit(1);
});
