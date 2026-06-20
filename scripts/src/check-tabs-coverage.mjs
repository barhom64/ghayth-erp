#!/usr/bin/env node
// scripts/src/check-tabs-coverage.mjs
//
// Secondary-navigation (tabs) coverage + governance gate. Companion to
// check-sidebar-coverage.mjs (left sidebar) and check-redirect-targets.mjs
// (redirect aliases): this one governs the per-module tab bars
// (artifacts/ghayth-erp/src/components/shared/*-tabs-nav.tsx).
//
// Each *-tabs-nav file renders a row of `{ href, label, icon, match? }` tabs.
// This gate answers: does every tab go somewhere real and canonical?
//
//   - dead-tab        (HARD) : a tab `href` that no route mounts — clicking it
//                              404s. Fails --strict.
//   - create-edit-tab (HARD) : a tab `href` that is a create/edit/detail page —
//                              tabs must point at list/dashboard surfaces, never
//                              a create form. Fails --strict.
//   - redirect-tab    (SOFT) : a tab `href` whose route is a redirect stub
//                              (redirectTo(...) / RedirectToXxx) — clicking it
//                              bounces to a canonical page (a dead-end duplicate,
//                              like the BI dashboards/kpis/reports tabs removed in
//                              the BI de-dup). Report-only.
//   - stale-match     (SOFT) : a `match` entry (drives the active-highlight) that
//                              is neither a route nor a prefix of one. Report-only.
//   - label-drift     (SOFT) : a tab label that is neither the canonical label nor
//                              a search alias for that path in
//                              navigation.canonical-map.ts. Report-only (the map
//                              is a seed, so an un-mapped path simply isn't checked).
//
// Tabs are written one-per-line in every *-tabs-nav file, so a line-based scan
// is sufficient and avoids a TS parser. The pure extractors/classifiers are
// exported so the .test.mjs sibling can guard the detector with fixtures.
//
// Usage:
//   node scripts/src/check-tabs-coverage.mjs           # report-only
//   node scripts/src/check-tabs-coverage.mjs --strict  # exit 1 on HARD violations

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
const SHARED_DIR = path.join(REPO, "artifacts/ghayth-erp/src/components/shared");
const CANON_FILE = path.join(
  REPO,
  "artifacts/ghayth-erp/src/components/layout/navigation.canonical-map.ts",
);

const STRICT = process.argv.includes("--strict");

// ── pure helpers (exported; exercised by check-tabs-coverage.test.mjs) ──────

/** Strip a trailing query string / hash so tab hrefs compare to route paths. */
export function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** True when an href is a create/edit/detail page (a tab must never be one). */
export function isCreateEditDetail(p) {
  const b = basePath(p);
  return b.includes(":") || /\/(create|new|edit)$/.test(b);
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

/** Tab definitions in a *-tabs-nav source string → [{ href, label, matches[] }].
 *  Reads the object-property `href: "/x"` (not the JSX `href={...}` on the <a>)
 *  plus its `label: "..."` and any `match: [...]` on the same line. */
export function extractTabs(src) {
  const out = [];
  for (const line of src.split("\n")) {
    const hrefM = line.match(/\bhref:\s*["'`]([^"'`]+)["'`]/);
    if (!hrefM) continue;
    const labelM = line.match(/\blabel:\s*["'`]([^"'`]+)["'`]/);
    const matchM = line.match(/\bmatch:\s*\[([^\]]*)\]/);
    const matches = matchM
      ? [...matchM[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1])
      : [];
    out.push({ href: hrefM[1], label: labelM ? labelM[1] : "", matches });
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

/**
 * Parse navigation.canonical-map.ts (by regex, so this guard needs no TS
 * compile step) into path → set-of-accepted-labels (canonical + aliases).
 * Defensive: any parse hiccup yields an empty map and the SOFT check no-ops.
 */
function readCanonicalLabels() {
  const map = new Map();
  try {
    const src = fs.readFileSync(CANON_FILE, "utf-8");
    const starts = [];
    const re = /path:\s*"([^"]+)",\s*canonicalLabel:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      starts.push({ index: m.index, path: m[1], label: m[2] });
    }
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i].index;
      const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
      const chunk = src.slice(start, end);
      const labels = new Set([starts[i].label]);
      const aliasBlock = chunk.match(/aliases:\s*\[([^\]]*)\]/);
      if (aliasBlock) {
        for (const a of aliasBlock[1].matchAll(/"([^"]+)"/g)) labels.add(a[1]);
      }
      map.set(starts[i].path, labels);
    }
  } catch {
    /* canonical map optional — SOFT check simply no-ops */
  }
  return map;
}

function main() {
  const routes = getMountedRoutes();
  const redirects = getRedirectRoutePaths();
  const tabs = getTabs();
  const canonical = readCanonicalLabels();

  const deadTabs = [];
  const createTabs = [];
  const redirectTabs = [];
  const staleMatches = [];
  const labelDrift = [];

  for (const t of tabs) {
    const b = basePath(t.href);
    if (isCreateEditDetail(t.href)) {
      createTabs.push(t);
    } else if (!routes.has(b)) {
      deadTabs.push(t);
    } else if (redirects.has(b)) {
      redirectTabs.push(t);
    }
    for (const m of t.matches) {
      if (!isMatchCovered(basePath(m), routes)) staleMatches.push({ ...t, badMatch: m });
    }
    const accepted = canonical.get(b);
    if (accepted && t.label && !accepted.has(t.label)) {
      labelDrift.push({ ...t, canonical: [...accepted][0] });
    }
  }

  const files = new Set(tabs.map((t) => t.file));
  console.log(`# tabs-nav coverage + governance audit\n`);
  console.log(`mode:                                    ${STRICT ? "STRICT (gate)" : "report-only"}`);
  console.log(`tabs-nav files:                          ${files.size}`);
  console.log(`tabs scanned:                            ${tabs.length}`);
  console.log(`[HARD] dead tabs (href → no route):      ${deadTabs.length}`);
  console.log(`[HARD] create/edit/detail tabs:          ${createTabs.length}`);
  console.log(`[soft] redirect tabs (href → stub):      ${redirectTabs.length}`);
  console.log(`[soft] stale match entries:              ${staleMatches.length}`);
  console.log(`[soft] label drift (≠ canonical/alias):  ${labelDrift.length}\n`);

  if (deadTabs.length) {
    console.log(`## [HARD] dead tabs (href points at no mounted route)\n`);
    for (const t of deadTabs) console.log(`  ${t.file}: ${t.href}  ("${t.label}")`);
    console.log();
  }
  if (createTabs.length) {
    console.log(`## [HARD] create/edit/detail pages used as a tab\n`);
    console.log(`(tabs must point at list/dashboard surfaces, never a create form)\n`);
    for (const t of createTabs) console.log(`  ${t.file}: ${t.href}  ("${t.label}")`);
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
  if (labelDrift.length) {
    console.log(`## [soft] tab label drift vs navigation.canonical-map.ts\n`);
    for (const t of labelDrift) {
      console.log(`  ${t.file}: ${t.href}  tab="${t.label}"  canonical="${t.canonical}"`);
    }
    console.log();
  }

  const hard = deadTabs.length + createTabs.length;
  if (hard === 0) console.log(`✓ tab governance: no HARD violations.`);

  if (STRICT && hard > 0) {
    console.error(
      `\n✗ tab governance gate FAILED: ${hard} HARD violation(s) ` +
        `(${deadTabs.length} dead, ${createTabs.length} create-in-tab).`,
    );
    process.exit(1);
  }
}

// Auto-run only when invoked directly (so the .test.mjs sibling can import the
// pure helpers without triggering a scan/exit).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (invokedDirectly) main();
