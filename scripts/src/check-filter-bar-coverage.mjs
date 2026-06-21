#!/usr/bin/env node
// scripts/src/check-filter-bar-coverage.mjs
//
// جرد شريط الفلاتر/البحث — Filter/search-bar consistency inventory.
//
// The canonical filter/search bar is <AdvancedFilters> (search on flex-1 +
// filters inline, responsive flex-wrap) OR the built-in <DataTable> toolbar
// (searchPlaceholder/searchable columns). Pages that hand-roll their own filter
// row (status-toggle Buttons / a filter <Select>) sit "off the canonical line".
//
// This is a REPORT-ONLY جرد (no --strict gate) because a legitimate subset of
// list pages filter SERVER-SIDE (the filter value goes into the query URL and
// the server returns a filtered/aggregated result) — those CANNOT move to the
// client-side AdvancedFilters model without breaking aggregation or over-
// fetching. The report separates:
//
//   canonical            : uses <AdvancedFilters> or the DataTable toolbar.
//   hand-rolled · client : hand-rolled filter row, filters in-memory →
//                          SAFE to migrate to <AdvancedFilters>.
//   hand-rolled · server : hand-rolled filter row, filter value feeds the
//                          query/endpoint → KEEP server logic; only the bar
//                          LAYOUT should be normalised, not the data path.
//
// Resolution reuses the same routes → component → page-file walk as
// check-module-strip-coverage.mjs. Pure helpers are exported for the test.
//
// Usage:  node scripts/src/check-filter-bar-coverage.mjs

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import {
  extractComponentImports,
  extractRouteEntries,
  isRedirectPage,
} from "./check-module-strip-coverage.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.join(REPO, "artifacts/ghayth-erp/src");
const ROUTES_DIR = path.join(APP, "routes");

// ── pure classifiers (exported for the .test.mjs sibling) ───────────────────

/** A page is a "list surface" when it renders a <DataTable>. */
export function isListPage(src) {
  return /<\s*DataTable\b/.test(src);
}

/** Canonical bar: <AdvancedFilters> OR the DataTable built-in toolbar
 *  (a searchPlaceholder prop / searchable columns and NOT noToolbar). */
export function usesCanonicalBar(src) {
  if (/<\s*AdvancedFilters\b/.test(src)) return true;
  const hasToolbar =
    /searchPlaceholder\s*[:=]/.test(src) || /\bsearchable\s*:\s*true/.test(src);
  const noToolbar = /\bnoToolbar\b/.test(src);
  return hasToolbar && !noToolbar;
}

/** Hand-rolled filter row: status-toggle Buttons/Badges whose `variant`
 *  depends on a filter-ish state var, OR a <Select> wired to a filter setter.
 *  (Deliberately does NOT count "a filter setter merely exists" — that produced
 *  false positives on pages whose only `flex gap` row was the actions bar.) */
export function hasHandRolledFilter(src) {
  const toggleButtons =
    /variant=\{[^}]*\b(statusFilter|cat|tab|filter|status|active|category)\b[^}]*\?[^}]*["'`](default|outline|secondary)["'`]/.test(src);
  const filterSelect =
    /onValueChange=\{[^}]*set(StatusFilter|Status|Cat|Category|Filter|Tab|Season|Agent|Employee|Type)\b/.test(src);
  return toggleButtons || filterSelect;
}

/** Server-side filtering: a filter-ish state var is interpolated into the
 *  query URL / query-key, or a `qsParts`/querystring is assembled. Full-file
 *  (multiline) test — line-based grep misses multi-line useApiQuery calls. */
export function filtersServerSide(src) {
  if (/\bqsParts\b|\bqs\.push\b|URLSearchParams/.test(src)) return true;
  // `?status=${statusFilter}` / `?${...}=${seasonFilter}` style URL building
  if (/\?\w*=\$\{[^}]*\b(\w*[Ff]ilter|status|season|agent|employee|year|fromDate|toDate)\b/.test(src)) return true;
  // a *Filter var appearing inside a useApiQuery(...) call's argument span
  const calls = src.match(/useApiQuery\s*<[^>]*>\s*\([\s\S]*?\)\s*;/g) || src.match(/useApiQuery\s*\([\s\S]*?\)\s*;/g) || [];
  for (const c of calls) {
    if (/\$\{[^}]*\b(\w*[Ff]ilter|status|season|agent|employee)\b/.test(c)) return true;
    if (/\[[^\]]*\b(\w*[Ff]ilter)\b[^\]]*\]/.test(c) && /`[^`]*\$\{/.test(c)) return true;
  }
  return false;
}

export function classify(src) {
  if (!isListPage(src)) return "not-list";
  if (usesCanonicalBar(src)) return "canonical";
  if (!hasHandRolledFilter(src)) return "no-filter";
  return filtersServerSide(src) ? "handrolled-server" : "handrolled-client";
}

// ── impure aggregation ──────────────────────────────────────────────────────

function resolveImport(imp) {
  if (!imp.startsWith("@/")) return null;
  const rel = imp.replace(/^@\//, "");
  for (const c of [path.join(APP, rel + ".tsx"), path.join(APP, rel + ".ts"), path.join(APP, rel, "index.tsx")]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function collectPageFiles() {
  const seen = new Map();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith("Routes.tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    const imports = extractComponentImports(src);
    for (const { path: rp, component } of extractRouteEntries(src)) {
      const imp = imports[component];
      if (!imp) continue;
      const f = resolveImport(imp);
      if (f && !seen.has(rp)) seen.set(rp, f);
    }
  }
  return seen;
}

function main() {
  const pages = collectPageFiles();
  const buckets = { canonical: [], "handrolled-client": [], "handrolled-server": [] };
  for (const [rp, f] of pages) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf-8");
    if (isRedirectPage(src)) continue;
    const k = classify(src);
    if (buckets[k]) buckets[k].push({ rp, f: path.relative(REPO, f) });
  }
  const tot = buckets.canonical.length + buckets["handrolled-client"].length + buckets["handrolled-server"].length;
  console.log(`# جرد شريط الفلاتر/البحث (filter/search-bar inventory)\n`);
  console.log(`list pages with a filter bar:            ${tot}`);
  console.log(`✅ canonical (AdvancedFilters/toolbar):   ${buckets.canonical.length}`);
  console.log(`🔧 hand-rolled · client (SAFE migrate):  ${buckets["handrolled-client"].length}`);
  console.log(`🔒 hand-rolled · server (keep logic):    ${buckets["handrolled-server"].length}\n`);

  console.log(`## 🔧 hand-rolled · client — migrate to <AdvancedFilters>\n`);
  for (const r of buckets["handrolled-client"].sort((a,b)=>a.rp.localeCompare(b.rp))) console.log(`  ${r.rp}\n      ${r.f}`);
  console.log(`\n## 🔒 hand-rolled · server — normalise LAYOUT only, keep server filtering\n`);
  for (const r of buckets["handrolled-server"].sort((a,b)=>a.rp.localeCompare(b.rp))) console.log(`  ${r.rp}\n      ${r.f}`);
  console.log(`\n(report-only جرد — no build gate: server-side filtering is a legitimate pattern.)`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (invokedDirectly) main();
