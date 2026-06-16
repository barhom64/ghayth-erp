#!/usr/bin/env node
// scripts/src/check-tabs-coverage.mjs
//
// Secondary-navigation (tabs) coverage gate. Companion to
// check-sidebar-coverage.mjs (left sidebar) and check-redirect-targets.mjs
// (redirect aliases): this one governs the per-module tab bars
// (artifacts/ghayth-erp/src/components/shared/*-tabs-nav.tsx).
//
// Each *-tabs-nav file renders a row of `{ href, label, icon, match? }` tabs.
// This gate answers: does every tab actually go somewhere real?
//
//   - dead-tab     (HARD) : a tab `href` that no route mounts — clicking it
//                           404s. The important one (fails --strict).
//   - redirect-tab (SOFT) : a tab `href` whose route is a redirect stub
//                           (redirectTo(...) / RedirectToXxx) — clicking it
//                           bounces to a canonical page (a dead-end duplicate,
//                           like the BI dashboards/kpis/reports tabs removed in
//                           the BI de-dup). Report-only.
//   - stale-match  (SOFT) : a `match` entry (drives active-highlight) that is
//                           neither a route nor a prefix of one. Report-only.
//
// Tabs are written one-per-line in every *-tabs-nav file, so a line-based scan
// is sufficient and avoids a TS parser. The pure extractors/classifiers are
// exported so the .test.mjs sibling can guard the detector with fixtures.
//
// Usage:
//   node scripts/src/check-tabs-coverage.mjs           # report-only
//   node scripts/src/check-tabs-coverage.mjs --strict  # exit 1 on dead-tab

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
const SHARED_DIR = path.join(REPO, "artifacts/ghayth-erp/src/components/shared");

const STRICT = process.argv.includes("--strict");

// ── pure helpers (exported; exercised by check-tabs-coverage.test.mjs) ──────

/** Strip a trailing query string / hash so tab hrefs compare to route paths. */
export function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** Every `path: "/..."` route literal in a source string. Quote-agnostic so a
 *  formatter switch (", ', `) can't silently blind the scan. */
export function extractRoutePaths(src) {
  const out = [];
  const re = /\bpath:\s*["'`](\/[^"'`]*)["'`]/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/** Redirect routes in a source string → Map(path → target | RedirectToXxx name).
 *  Matches `component: redirectTo("/x")` (captures target) and named
 *  `component: RedirectToXxx` redirect components. */
export function extractRedirectRoutes(src) {
  const map = new Map();
  let m;
  const reInline =
    /\{\s*path:\s*["'`]([^"'`]+)["'`]\s*,\s*component:\s*redirectTo\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = reInline.exec(src)) !== null) map.set(m[1], m[2]);
  const reNamed =
    /\{\s*path:\s*["'`]([^"'`]+)["'`]\s*,\s*component:\s*(RedirectTo[A-Za-z]*)/g;
  while ((m = reNamed.exec(src)) !== null) if (!map.has(m[1])) map.set(m[1], m[2]);
  return map;
}

/** Tab definitions in a *-tabs-nav source string → [{ href, matches[] }].
 *  Reads the object-property `href: "/x"` (not the JSX `href={...}` on the <a>)
 *  plus any `match: [...]` on the same line. */
export function extractTabs(src) {
  const out = [];
  for (const line of src.split("\n")) {
    const hrefM = line.match(/\bhref:\s*["'`]([^"'`]+)["'`]/);
    if (!hrefM) continue;
    const matchM = line.match(/\bmatch:\s*\[([^\]]*)\]/);
    const matches = matchM
      ? [...matchM[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1])
      : [];
    out.push({ href: hrefM[1], matches });
  }
  return out;
}

/** A `match` entry is "covered" if it equals a mounted route or is a parent
 *  prefix of one (the highlight logic does `location.startsWith(`${m}/`)`, so a
 *  parent like "/fleet/transport" legitimately covers its children). */
export function isMatchCovered(matchPath, routesSet) {
  if (routesSet.has(matchPath)) return true;
  for (const r of routesSet) if (r.startsWith(`${matchPath}/`)) return true;
  return false;
}

// ── impure aggregation (reads files, delegates to the pure extractors) ──────

function getMountedRoutes() {
  const set = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    for (const p of extractRoutePaths(src)) set.add(p);
  }
  return set;
}

function getRedirectRoutePaths() {
  const map = new Map();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    for (const [p, t] of extractRedirectRoutes(src)) if (!map.has(p)) map.set(p, t);
  }
  return map;
}

function getTabs() {
  const tabs = [];
  for (const file of fs.readdirSync(SHARED_DIR)) {
    if (!file.endsWith("-tabs-nav.tsx")) continue;
    const src = fs.readFileSync(path.join(SHARED_DIR, file), "utf-8");
    for (const t of extractTabs(src)) tabs.push({ file, ...t });
  }
  return tabs;
}

function main() {
  const routes = getMountedRoutes();
  const redirects = getRedirectRoutePaths();
  const tabs = getTabs();

  const deadTabs = [];
  const redirectTabs = [];
  const staleMatches = [];

  for (const t of tabs) {
    const b = basePath(t.href);
    if (!routes.has(b)) deadTabs.push(t);
    else if (redirects.has(b)) redirectTabs.push(t);
    for (const m of t.matches) {
      if (!isMatchCovered(basePath(m), routes)) staleMatches.push({ ...t, badMatch: m });
    }
  }

  const files = new Set(tabs.map((t) => t.file));
  console.log(`# tabs-nav coverage audit\n`);
  console.log(`mode:                              ${STRICT ? "STRICT (gate)" : "report-only"}`);
  console.log(`tabs-nav files:                    ${files.size}`);
  console.log(`tabs scanned:                      ${tabs.length}`);
  console.log(`[HARD] dead tabs (href → no route): ${deadTabs.length}`);
  console.log(`[soft] redirect tabs (href → stub): ${redirectTabs.length}`);
  console.log(`[soft] stale match entries:         ${staleMatches.length}\n`);

  if (deadTabs.length) {
    console.log(`## [HARD] dead tabs (href points at no mounted route)\n`);
    for (const t of deadTabs) console.log(`  ${t.file}: ${t.href}`);
    console.log();
  }
  if (redirectTabs.length) {
    console.log(`## [soft] redirect tabs (href bounces via a redirect stub)\n`);
    for (const t of redirectTabs) console.log(`  ${t.file}: ${t.href}  →  ${redirects.get(basePath(t.href))}`);
    console.log();
  }
  if (staleMatches.length) {
    console.log(`## [soft] stale match entries (highlight path with no route)\n`);
    for (const t of staleMatches) console.log(`  ${t.file}: ${t.badMatch} (tab ${t.href})`);
    console.log();
  }

  if (deadTabs.length === 0) console.log(`✓ tabs-nav coverage: no dead tabs.`);

  if (STRICT && deadTabs.length > 0) {
    console.error(`\n✗ tabs-nav coverage gate FAILED: ${deadTabs.length} dead tab(s).`);
    process.exit(1);
  }
}

// Auto-run only when invoked directly (so the .test.mjs sibling can import the
// pure helpers without triggering a scan/exit).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (invokedDirectly) main();
