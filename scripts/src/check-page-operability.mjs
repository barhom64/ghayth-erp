#!/usr/bin/env node
// scripts/src/check-page-operability.mjs
//
// جرد العمليّة الشامل — per-page census of the operational UI elements the
// owner asked to standardise across every page: back-nav, print, sort, and
// search/filter. READ-ONLY. Answers, for every routed page, «ماذا فيها وماذا
// ينقصها ولماذا» — so a skip always carries a reason.
//
// Per element the page is one of:
//   ✓ present   — the element is wired (via the shared component).
//   ✗ missing   — the page TYPE should have it but doesn't (a real gap).
//   – n/a       — the element does not apply to this page type (with reason).
//
// Element sources (the canonical shared components):
//   back   : PageShell / CreatePageLayout(backPath) / EntityDetailPage(backHref)
//            + SidebarLayout renders breadcrumbs + a Home button for EVERY
//            route centrally, so back-nav is structurally universal.
//   print  : <PrintButton> (the unified print surface → print_jobs + log).
//   sort   : <DataTable> (built-in column sort) — applies to list/report pages.
//   search : <AdvancedFilters> / DataTable toolbar / a search <Input>.
//
// Page TYPE (drives which elements are «should-have»):
//   list/report → search + sort + print expected; back via shell.
//   detail      → back + print expected; no list search/sort.
//   form        → back expected; nothing else.
//   dashboard/tool/settings → back via shell; print optional, search/sort n/a.
//   tab-fragment (file imported by another page, not a standalone route) → the
//                parent owns the chrome; the fragment needs nothing.
//   redirect    → excluded entirely.
//
// Usage:  node scripts/src/check-page-operability.mjs            # full census
//         node scripts/src/check-page-operability.mjs --gaps     # only gaps

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import {
  extractComponentImports,
  extractRouteEntries,
  isRedirectPage,
  basePath,
} from "./check-module-strip-coverage.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.join(REPO, "artifacts/ghayth-erp/src");
const ROUTES_DIR = path.join(APP, "routes");
const GAPS_ONLY = process.argv.includes("--gaps");

// ── pure classifiers (exported for the .test.mjs sibling) ───────────────────

export function hasBackShell(src) {
  return /<\s*PageShell\b|\bCreatePageLayout\b|\bEntityDetailPage\b|\bDetailPageLayout\b|\bListPage\b|\bbackHref\b|\bbackPath\b/.test(src);
}
export function hasPrint(src) {
  return /<\s*PrintButton\b|\bPrintButton\b/.test(src);
}
export function hasSort(src) {
  // DataTable gives column sort out of the box.
  return /<\s*DataTable\b/.test(src);
}
export function hasSearch(src) {
  if (/<\s*AdvancedFilters\b/.test(src)) return true;
  if (/searchPlaceholder\s*[:=]/.test(src)) return true;
  if (/placeholder=("|'|`)[^"'`]*(بحث|ابحث)/.test(src)) return true;
  // A <DataTable> WITHOUT noToolbar renders the built-in search toolbar.
  if (/<\s*DataTable\b/.test(src) && !/\bnoToolbar\b/.test(src)) return true;
  // A custom controlled search box: a state variable whose name contains
  // "search" (case-insensitive) or is "query", bound to an input's value
  // (`value={search}`). Several pages roll their own search with a
  // field-name placeholder (e.g. "اسم المستخدم…") that lacks the word
  // بحث, so the placeholder heuristic alone under-reports them. Requiring
  // BOTH a search-named state AND an input binding keeps false positives
  // near zero.
  const m = src.match(/const\s*\[\s*(\w*[Ss]earch\w*|query)\s*,/);
  if (m && new RegExp(`value=\\{${m[1]}\\}`).test(src)) return true;
  return false;
}

/** Page TYPE from route path + source. */
export function pageType(routePath, file, src) {
  const b = basePath(routePath);
  const f = (file || "").replace(/\\/g, "/");
  if (/\/(create|new|edit)$/.test(b) || /\/pages\/create\//.test(f) || /\bCreatePageLayout\b/.test(src)) return "form";
  if (b.includes(":") || /\/pages\/details\//.test(f) || /\bEntityDetailPage\b|\bDetailPageLayout\b/.test(src)) return "detail";
  if (/<\s*DataTable\b/.test(src) || /<\s*AdvancedFilters\b/.test(src)) return "list";
  // dashboards/tools/settings: a shell page with no table.
  return "page";
}

/** For a (type, hasX) decide present|missing|na with a reason. */
export function assess(type, has, element) {
  // applicability matrix by page type
  const applies = {
    list:   { back: true, print: true,  sort: true,  search: true },
    detail: { back: true, print: true,  sort: false, search: false },
    form:   { back: true, print: false, sort: false, search: false },
    page:   { back: true, print: false, sort: false, search: false },
  }[type];
  if (!applies[element]) {
    const why = {
      print: "ليست قائمة/تفصيلًا يُطبع",
      sort:  "لا جدول بيانات (ليست قائمة)",
      search:"ليست قائمة",
      back:  "",
    }[element];
    return { state: "na", why };
  }
  return { state: has ? "present" : "missing", why: "" };
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

/** Resolve a relative (`./x`) default import from the importing file's dir. */
function resolveRelativeImport(fromFile, rel) {
  const base = path.join(path.dirname(fromFile), rel);
  for (const c of [base + ".tsx", base + ".ts", path.join(base, "index.tsx")]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Effective source of a page — follows thin-wrapper delegation one level.
 * Several pages (customer-statement → account-statement, profitability-*
 * → profitability) are tiny wrappers that render a shared component which
 * actually owns the PrintButton / DataTable / search bar. Reading only the
 * wrapper file under-reports those capabilities (false "missing"), so we
 * union the wrapper's source with any locally-imported default component it
 * actually renders. Bounded to depth 1 — enough for the wrapper pattern,
 * and avoids cycles.
 */
export function effectiveSource(file, src) {
  let out = src;
  const importRe = /import\s+(\w+)\s+from\s+["'](\.\/[^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const [, name, rel] = m;
    // Only follow a delegated component that is actually rendered as <Name …>.
    if (!new RegExp(`<\\s*${name}\\b`).test(src)) continue;
    const target = resolveRelativeImport(file, rel);
    if (target && fs.existsSync(target)) {
      out += "\n" + fs.readFileSync(target, "utf-8");
    }
  }
  return out;
}

function collectRoutedPages() {
  const seen = new Map();
  const routedFiles = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith("Routes.tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    const imports = extractComponentImports(src);
    for (const { path: rp, component } of extractRouteEntries(src)) {
      const imp = imports[component];
      if (!imp) continue;
      const f = resolveImport(imp);
      if (f && !seen.has(rp)) { seen.set(rp, f); routedFiles.add(f); }
    }
  }
  return { seen, routedFiles };
}

function main() {
  const { seen, routedFiles } = collectRoutedPages();
  const rows = [];
  const tally = {
    list: { n: 0, print: [0, 0], sort: [0, 0], search: [0, 0] },
    detail: { n: 0, print: [0, 0] },
  };
  for (const [rp, f] of seen) {
    if (!fs.existsSync(f)) continue;
    const rawSrc = fs.readFileSync(f, "utf-8");
    if (isRedirectPage(rawSrc)) continue;
    // Follow thin-wrapper delegation so a shared component's PrintButton /
    // DataTable / search bar counts for the wrapper route too.
    const src = effectiveSource(f, rawSrc);
    const type = pageType(rp, f, src);
    const els = {
      back:   assess(type, hasBackShell(src), "back"),
      print:  assess(type, hasPrint(src), "print"),
      sort:   assess(type, hasSort(src), "sort"),
      search: assess(type, hasSearch(src), "search"),
    };
    rows.push({ rp, f: path.relative(REPO, f), type, els });
    if (type === "list") {
      tally.list.n++;
      for (const e of ["print", "sort", "search"]) tally.list[e][els[e].state === "present" ? 0 : 1]++;
    } else if (type === "detail") {
      tally.detail.n++;
      tally.detail.print[els.print.state === "present" ? 0 : 1]++;
    }
  }

  const byType = {};
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;

  console.log(`# جرد العمليّة الشامل (back / print / sort / search) — قراءة فعلية\n`);
  console.log(`صفحات مُركَّبة (بلا redirect): ${rows.length}`);
  console.log(`حسب النوع: ` + Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(" · ") + `\n`);
  console.log(`— صفحات القوائم (${tally.list.n}):`);
  console.log(`    بحث:  ${tally.list.search[0]} ✓ / ${tally.list.search[1]} ✗`);
  console.log(`    فرز:  ${tally.list.sort[0]} ✓ / ${tally.list.sort[1]} ✗`);
  console.log(`    طباعة: ${tally.list.print[0]} ✓ / ${tally.list.print[1]} ✗`);
  console.log(`— صفحات التفاصيل (${tally.detail.n}):  طباعة: ${tally.detail.print[0]} ✓ / ${tally.detail.print[1]} ✗\n`);

  // gaps: list/detail pages missing an applicable element
  const gap = (state) => state === "missing";
  const printGaps = rows.filter((r) => gap(r.els.print.state));
  const sortGaps = rows.filter((r) => gap(r.els.sort.state));
  const searchGaps = rows.filter((r) => gap(r.els.search.state));

  const dump = (title, list) => {
    console.log(`## ${title} (${list.length})\n`);
    for (const r of list) console.log(`  [${r.type}] ${r.rp}\n      ${r.f}`);
    console.log();
  };
  dump("✗ طباعة ناقصة (قوائم/تفاصيل تُطبع)", printGaps);
  dump("✗ فرز ناقص (قائمة بلا DataTable)", sortGaps);
  dump("✗ بحث ناقص (قائمة بلا شريط)", searchGaps);

  if (!GAPS_ONLY) {
    console.log(`ملاحظة: زر الرجوع/المسار يوفّره SidebarLayout مركزيًا لكل المسارات،`);
    console.log(`        و«غير منطبق» يعني نوع الصفحة لا يحتاج العنصر (نموذج/لوحة).`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (invokedDirectly) main();
