#!/usr/bin/env node
//
// scripts/src/check-display-tables.mjs
//
// Display-table canonicalization guard. The 2026-06 table-unification pass
// moved every page-level LIST / DISPLAY table onto the shared <DataTable>
// (sorting, per-user page-size, sticky header, responsive mobile cards,
// column-aligned footers, CSV export). A hand-rolled raw `<table>` in a
// page re-introduces the very drift that pass removed — inconsistent
// headers, no mobile cards, no shared sort/export — so this guard keeps NEW
// raw tables out of `src/pages/**`.
//
// It is intentionally scoped to PAGES. A raw `<table>` is legitimate in a
// few shapes that DataTable (a column-oriented data grid) cannot express,
// and those are pinned in the allowlist with a reason:
//
//   • editable-form  — data-entry grids whose cells are <Input>/<Select>/
//                      NumberField driving page state (journal-manual-create,
//                      customer-receipt, sales-wizard, …). DataTable is a
//                      DISPLAY component; forcing a form into it is backwards.
//   • statement      — vertical financial statements (P&L / balance sheet via
//                      <PlRow>): hierarchical label/value rows, not columns.
//   • merged-header  — colSpan/rowSpan grouped headers a flat column list
//                      cannot represent (vat-filing, reconciliation-workpaper).
//   • tree           — collapsible hierarchy (reports-tree).
//   • info-block     — tiny fixed letterhead / key-value print blocks.
//
// Component-level tables (src/components/**) are out of scope here — a
// separate concern from page canonicalization.
//
// OFFLINE: pure source scan, no DB / build / server — runs unconditionally
// in CI like check:responsive-tables. The guard fails only on a PAGE with a
// raw <table> that is NOT on scripts/display-tables-allowlist.txt.
// `.test.tsx` files are skipped (test fixtures).
//
// Usage:
//   node scripts/src/check-display-tables.mjs                 # gate
//   node scripts/src/check-display-tables.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/display-tables-allowlist.txt");

// Page roots only — component-level tables are deliberately out of scope.
const PAGE_SRC_DIRS = [
  "artifacts/ghayth-erp/src/pages",
  "artifacts/client-portal/src/pages",
  "artifacts/careers-portal/src/pages",
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

// A page is an offender when it renders a raw `<table>` element. Both
// line-start (`<table …>`) and inline (`<div …><table …>`) forms count;
// full-line comments (`*` JSDoc / `//`) are ignored so prose mentioning
// "<table>" doesn't false-positive.
export function fileHasDisplayTable(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
    if (/<table\b/.test(line)) return true;
  }
  return false;
}

async function findOffenders() {
  const offenders = [];
  for (const rel of PAGE_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkTsx(abs, []);
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (fileHasDisplayTable(text)) {
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
    // tolerate "path  # reason" — only the path is significant
    set.add(t.split(/\s+#/)[0].trim());
  }
  return set;
}

async function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const offenders = await findOffenders();

  if (writeMode) {
    const header = [
      "# display-tables-allowlist.txt",
      "#",
      "# Pages that keep a raw <table> on purpose — DataTable (a column data",
      "# grid) cannot faithfully express them. The guard fails only on a PAGE",
      "# with a raw <table> NOT listed here. Append the reason after the path:",
      "#   path/to/page.tsx   # editable-form | statement | merged-header | tree | info-block",
      "# Regenerate the baseline with:",
      "#   node scripts/src/check-display-tables.mjs --write-allowlist",
      "# When a page is moved to <DataTable>, prune its line.",
      "#",
      `# Baseline captured: ${offenders.length} page(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:display-tables] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:display-tables] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(page moved to <DataTable> or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:display-tables] FAIL: ${fresh.length} page(s) render a raw <table> ` +
        `instead of the shared <DataTable>:`,
    );
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      "\n  Page list/display tables must use the shared <DataTable> (sort, per-user\n" +
        "  page-size, mobile cards, column-aligned footers, CSV export):\n" +
        '      import { DataTable } from "@workspace/ui-core";\n' +
        "  If this table is genuinely a form / statement / merged-header / tree /\n" +
        "  info-block that DataTable cannot express, add its path + reason to\n" +
        "  scripts/display-tables-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(`[check:display-tables] OK — no raw <table> in pages outside the allowlist (${offenders.length} allowlisted).`);
}

main().catch((err) => {
  console.error("[check:display-tables] ERROR:", err);
  process.exit(1);
});
