#!/usr/bin/env node
//
// scripts/src/check-responsive-tables.mjs
//
// Responsive-table guard. A raw `<table>` that is NOT inside a horizontal
// scroll container (`overflow-x-auto` / `overflow-auto`) breaks or clips the
// layout on phone-width screens — the table either overflows the viewport
// (pushing the whole page wide) or, when its wrapper uses `overflow-hidden`,
// gets its right-hand columns CLIPPED with no way to reach them. The mobile
// pass (2026-06) wrapped every offender; this guard keeps NEW ones out so the
// "cramped/clipped table on mobile" regression can't recur.
//
// The fix is always the same — wrap the table:
//
//     <div className="overflow-x-auto">
//       <table …> … </table>
//     </div>
//
// (For list tables prefer the shared <DataTable>, which already renders
// stacked cards on mobile. This guard targets hand-rolled raw tables.)
//
// OFFLINE: pure source scan, no DB / build / server — runs unconditionally
// in CI like check:button-nesting. Baseline in
// scripts/responsive-tables-allowlist.txt; the guard fails only on a file
// NOT on the allowlist. `.test.tsx` files are skipped (test fixtures).
//
// Usage:
//   node scripts/src/check-responsive-tables.mjs                 # gate
//   node scripts/src/check-responsive-tables.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/responsive-tables-allowlist.txt");

const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

async function walkTsx(dir, out) {
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
      await walkTsx(full, out);
    } else if (e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

// A raw `<table>` is an offender when none of the two preceding lines (its
// wrapper) declares a horizontal scroll container. Comment lines (`*`/`//`)
// are ignored so a JSDoc that mentions "<table>" doesn't false-positive.
export function fileHasBareTable(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*<table\b/.test(lines[i])) continue;
    const ctx = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
    if (!/overflow-(x-)?auto/.test(ctx)) return true;
  }
  return false;
}

async function findOffenders() {
  const offenders = [];
  for (const rel of FRONTEND_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkTsx(abs, []);
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (fileHasBareTable(text)) {
        offenders.push(relative(REPO_ROOT, f).split("\\").join("/"));
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
      "# responsive-tables-allowlist.txt",
      "#",
      "# Pre-existing files with a raw <table> not wrapped in an overflow",
      "# scroll container. Accepted baseline offenders; the guard fails only",
      "# on a file NOT listed here. Regenerate with:",
      "#   node scripts/src/check-responsive-tables.mjs --write-allowlist",
      "# As tables are wrapped (or moved to <DataTable>), prune their line.",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:responsive-tables] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:responsive-tables] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(table wrapped or file removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:responsive-tables] FAIL: ${fresh.length} file(s) render a raw <table> ` +
        `not wrapped in an overflow scroll container (clips/breaks on mobile):`,
    );
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      "\n  Fix: wrap the table —\n" +
        '      <div className="overflow-x-auto"><table …>…</table></div>\n' +
        "  For list tables prefer the shared <DataTable> (responsive cards on mobile).\n" +
        "  If genuinely intentional, add the path to scripts/responsive-tables-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(`[check:responsive-tables] OK — no unwrapped raw tables (${offenders.length} allowlisted).`);
}

main().catch((err) => {
  console.error("[check:responsive-tables] ERROR:", err);
  process.exit(1);
});
