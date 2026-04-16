#!/usr/bin/env node
//
// scripts/src/audit-routes.mjs — Guard #2 (routes + orphan pages).
//
// Catches the class of bug where a page file exists under
// `src/pages/**/*.tsx` but nobody imports it — i.e. the feature was
// coded but never wired up. This is the exact bug we hit with
// `official-letters.tsx` before it was added to `hrRoutes.tsx`.
//
// Algorithm:
//
//   1. Walk every .ts/.tsx file under artifacts/ghayth-erp/src.
//   2. For each import specifier, resolve it to an absolute filesystem
//      path (supports both the `@/…` alias and `./…` / `../…` relative
//      specifiers).
//   3. Build a Set<absolutePath> of everything that is imported from
//      somewhere.
//   4. Every .tsx file under src/pages must either be in that set or
//      be listed in ALLOWLIST. Otherwise it is an orphan → exit 1.
//
// Usage:
//
//   node scripts/src/audit-routes.mjs
//   pnpm audit:routes
//

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ERP_SRC = join(REPO_ROOT, "artifacts/ghayth-erp/src");
const PAGES_DIR = join(ERP_SRC, "pages");

// Pages that are intentionally not imported by anything.
// Keep this TINY. Each entry needs a one-line reason.
// Each entry is a PRE-EXISTING orphan that the audit surfaced on the
// day the script was introduced. They are NOT clean findings — each
// one is a real drift issue that should be fixed in a follow-up PR.
// The allowlist exists only so we can land the guard itself without
// blocking on unrelated historical drift. When a line is removed, the
// fix for that page must ship in the same commit.
const ALLOWLIST = new Set([
  // BI tabs built but never wired into pages/bi.tsx — hidden features.
  "pages/bi/dashboards-tab.tsx",
  "pages/bi/kpis-tab.tsx",
  "pages/bi/reports-tab.tsx",
  // Communications feature never wired to any route file.
  "pages/communications/letters.tsx",
  "pages/create/communications/letters-create.tsx",
  // /finance redirect stub → /finance/accounts. Not in any routes file,
  // so visiting /finance directly 404s today. Keep until router decides.
  "pages/finance.tsx",
]);

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx"];

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else if (SOURCE_EXTS.some((ext) => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

function pageKey(filePath) {
  return relative(ERP_SRC, filePath).split(sep).join("/");
}

// Try to resolve a module specifier to an absolute filesystem path
// inside ERP_SRC. Returns null when the specifier points outside the
// tree (node_modules, absolute system path, etc.).
function resolveSpecifier(specifier, importerDir) {
  let base;
  if (specifier.startsWith("@/")) {
    base = join(ERP_SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(importerDir, specifier);
  } else {
    return null; // bare import (package) or non-local alias
  }

  // Direct file hit with extension already present.
  for (const ext of SOURCE_EXTS) {
    if (base.endsWith(ext) && existsSync(base)) return base;
  }
  // Try appending each extension.
  for (const ext of SOURCE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  // Try index file inside a directory.
  for (const ext of SOURCE_EXTS) {
    const candidate = join(base, "index" + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function extractImportSpecifiers(source) {
  const out = new Set();
  // Static imports:  import X from "…";   import "…";   export * from "…";
  // Dynamic imports: import("…")
  const re =
    /(?:^|\s)(?:from|import|require)\s*\(?\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const t = m[1] || m[2];
    if (t) out.add(t);
  }
  return out;
}

async function main() {
  const allSrcFiles = await walk(ERP_SRC);
  const pageFiles = allSrcFiles.filter(
    (f) => f.endsWith(".tsx") && f.startsWith(PAGES_DIR + sep),
  );

  const importedSet = new Set();
  for (const file of allSrcFiles) {
    const source = await readFile(file, "utf8");
    const importerDir = dirname(file);
    for (const spec of extractImportSpecifiers(source)) {
      const resolved = resolveSpecifier(spec, importerDir);
      if (resolved) importedSet.add(resolved);
    }
  }

  const orphans = [];
  for (const file of pageFiles) {
    const key = pageKey(file);
    if (ALLOWLIST.has(key)) continue;
    if (!importedSet.has(file)) orphans.push(key);
  }

  if (orphans.length === 0) {
    console.log(
      `[audit-routes] OK — all ${pageFiles.length} page files are imported somewhere.`,
    );
    process.exit(0);
  }

  console.error(
    `[audit-routes] FAIL — ${orphans.length} orphan page file(s) not imported anywhere:\n`,
  );
  for (const p of orphans) console.error("  - " + p);
  console.error(
    `\nFix options:\n` +
      `  1. Register the page in the matching routes file (e.g. src/routes/hrRoutes.tsx).\n` +
      `  2. Import it from another page that already is routed.\n` +
      `  3. Delete the file if it is dead code.\n` +
      `  4. If it truly must exist unimported, add it to ALLOWLIST in this script with a reason.\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[audit-routes] crashed:", err);
  process.exit(2);
});
