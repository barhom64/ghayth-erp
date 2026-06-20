#!/usr/bin/env node
//
// scripts/src/check-direct-api-fetch.mjs
//
// Direct-API-fetch guard. apiFetch() is the ONE native-safe path to the API:
// it resolves the absolute origin, attaches the Bearer token on native, the
// CSRF header, the selected-role header, and handles 401-refresh. A raw
// `fetch(`${BASE}/api…`)` / `fetch(`${API_BASE}/api…`)` bypasses ALL of that —
// on the native app it sends no Bearer (cookies don't cross the WebView
// origin) and 401s. A handful of legacy call sites legitimately need raw
// fetch (blob downloads, file uploads, print preview, pre-auth public calls)
// and now spread `nativeAuthHeaders()` — they are captured in the baseline
// allowlist. This guard FAILS on any NEW raw API fetch so new code is forced
// through apiFetch (or reviewed + allowlisted).
//
// OFFLINE source scan; baseline in scripts/direct-api-fetch-allowlist.txt.
// api.ts (the resolver/apiFetch home) and `.test.*` files are skipped.
// Pure-logic fixtures guard the detector.
//
// Usage:
//   node scripts/src/check-direct-api-fetch.mjs                 # gate
//   node scripts/src/check-direct-api-fetch.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/direct-api-fetch-allowlist.txt");

const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// api.ts owns the native-aware fetch primitives (apiFetch, tryRefreshToken).
const RESOLVER_FILES = new Set(["artifacts/ghayth-erp/src/lib/api.ts"]);

// `fetch(`${BASE}/api…`)` or `fetch(`${API_BASE}/api…`)` — a raw API fetch.
const DIRECT_API_FETCH_RE = /fetch\(\s*`\$\{(?:BASE|API_BASE)\}\/api\b/;

export function fileHasDirectApiFetch(text) {
  return DIRECT_API_FETCH_RE.test(text);
}

async function walk(dir, out) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walk(full, out);
    } else if (
      e.isFile() &&
      (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) &&
      !e.name.endsWith(".test.tsx") && !e.name.endsWith(".test.ts")
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
    for (const f of await walk(abs, [])) {
      const relPath = relative(REPO_ROOT, f).split("\\").join("/");
      if (RESOLVER_FILES.has(relPath)) continue;
      if (fileHasDirectApiFetch(await readFile(f, "utf8"))) offenders.push(relPath);
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
    if (t && !t.startsWith("#")) set.add(t);
  }
  return set;
}

async function main() {
  const offenders = await findOffenders();
  if (process.argv.includes("--write-allowlist")) {
    const header = [
      "# direct-api-fetch-allowlist.txt",
      "#",
      "# Reviewed files that call the API via raw fetch (blob download, upload,",
      "# print preview, pre-auth public). They spread nativeAuthHeaders() so the",
      "# native app stays authenticated. The guard fails on any file NOT here —",
      "# new API calls must go through apiFetch. Regenerate:",
      "#   node scripts/src/check-direct-api-fetch.mjs --write-allowlist",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:direct-api-fetch] wrote ${offenders.length} entries`);
    return;
  }
  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();
  if (stale.length) {
    console.log(`[check:direct-api-fetch] NOTE: ${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"} — prune:`);
    for (const f of stale) console.log(`    - ${f}`);
  }
  if (fresh.length) {
    console.error(`\n[check:direct-api-fetch] FAIL: ${fresh.length} NEW file(s) call the API via raw fetch (bypasses apiFetch → no Bearer on native → 401):`);
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      "\n  Fix: use apiFetch (handles base + Bearer + CSRF + 401). If a raw fetch\n" +
        "  is genuinely required (blob/upload), spread { ...nativeAuthHeaders() }\n" +
        "  into its headers and add the path to scripts/direct-api-fetch-allowlist.txt.",
    );
    process.exit(1);
  }
  console.log(`[check:direct-api-fetch] OK — ${offenders.length} reviewed call site(s), no new ones.`);
}

main().catch((err) => { console.error("[check:direct-api-fetch] ERROR:", err); process.exit(1); });
