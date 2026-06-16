#!/usr/bin/env node
// scripts/src/check-tabs-coverage.mjs
//
// Secondary-navigation (tabs) coverage gate. Companion to
// check-sidebar-coverage.mjs: that gate governs the LEFT sidebar
// (navigation.registry.ts); this one governs the per-module tab bars
// (artifacts/ghayth-erp/src/components/shared/*-tabs-nav.tsx).
//
// Each *-tabs-nav file renders a row of `{ href, label, icon, match? }`
// tabs. This gate answers: does every tab actually go somewhere real?
//
//   - dead-tab     (HARD) : a tab `href` that no route mounts — clicking
//                           it 404s. The important one.
//   - redirect-tab (SOFT) : a tab `href` whose route is a redirect stub
//                           (redirectTo(...) / RedirectToXxx) — clicking it
//                           bounces to a canonical page (a dead-end
//                           duplicate, like the BI dashboards/kpis/reports
//                           tabs removed in the BI de-dup). Report-only.
//   - stale-match  (SOFT) : a `match` entry (drives active-highlight) that
//                           no route mounts — harmless but rotted.
//
// Tabs are written one-per-line in every *-tabs-nav file, so a line-based
// scan is sufficient and avoids a TS parser.
//
// Usage:
//   node scripts/src/check-tabs-coverage.mjs           # report-only
//   node scripts/src/check-tabs-coverage.mjs --strict  # exit 1 on dead-tab
//
// Output: stdout, plain text.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
const SHARED_DIR = path.join(REPO, "artifacts/ghayth-erp/src/components/shared");

const STRICT = process.argv.includes("--strict");

/** Strip a trailing query string / hash so tab hrefs compare to route paths. */
function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** Pull every `{ path: "/x", component: … }` literal from the routes/*.tsx files. */
function getMountedRoutes() {
  const set = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    for (const m of src.matchAll(/\{\s*path:\s*["']([^"']+)["']/g)) set.add(m[1]);
  }
  return set;
}

/**
 * Paths whose route component is a redirect — `component: redirectTo("/x")` or a
 * named `RedirectToXxx` component. Kept in sync with check-sidebar-coverage.mjs.
 */
function getRedirectRoutePaths() {
  const set = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    for (const m of src.matchAll(
      /\{\s*path:\s*["']([^"']+)["']\s*,\s*component:\s*(?:redirectTo\b|RedirectTo[A-Za-z]*)/g,
    )) {
      set.add(m[1]);
    }
  }
  return set;
}

/** Parse every *-tabs-nav.tsx → one record per tab: { file, href, matches[] }. */
function getTabs() {
  const tabs = [];
  for (const file of fs.readdirSync(SHARED_DIR)) {
    if (!file.endsWith("-tabs-nav.tsx")) continue;
    const src = fs.readFileSync(path.join(SHARED_DIR, file), "utf-8");
    for (const line of src.split("\n")) {
      // Tab object property `href: "/x"` (not the JSX `href={...}` on the <a>).
      const hrefM = line.match(/\bhref:\s*["']([^"']+)["']/);
      if (!hrefM) continue;
      const matchM = line.match(/\bmatch:\s*\[([^\]]*)\]/);
      const matches = matchM
        ? [...matchM[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
        : [];
      tabs.push({ file, href: hrefM[1], matches });
    }
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
      const mb = basePath(m);
      // A match entry is valid if it equals a route OR is a prefix of one
      // (the highlight logic does `location.startsWith(`${m}/`)`, so a parent
      // prefix like "/fleet/transport" legitimately covers its children).
      const covered = routes.has(mb) || [...routes].some((r) => r.startsWith(`${mb}/`));
      if (!covered) staleMatches.push({ ...t, badMatch: m });
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
    for (const t of redirectTabs) console.log(`  ${t.file}: ${t.href}`);
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

main();
