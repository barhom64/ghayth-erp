#!/usr/bin/env node
// scripts/src/check-tabs-coverage.mjs
//
// Internal-tab governance gate — the in-page sibling of
// check-sidebar-coverage.mjs. Every `*-tabs-nav.tsx` renders a horizontal
// sub-navigation strip under a page's PageShell. This guard answers:
// "does every tab point at a real, canonical destination — not a dead
// route, not a redirect (which lands the user somewhere the tab didn't
// name), and not a create/edit/detail page?" — and, with --strict, fails
// the build when an internal tab strip drifts.
//
// What it does:
//   1. Reads every mounted route from artifacts/ghayth-erp/src/routes/*.tsx,
//      and which of them are redirect-only (component = redirectTo(...) or a
//      const assigned redirectTo(...)).
//   2. Reads every `href: "/..."` (with its `label`) from each
//      components/shared/*-tabs-nav.tsx.
//   3. Reports, per governance rule:
//
// Governance gate (HARD — fail under --strict):
//   - dead-tab        : tab href → no mounted route.
//   - redirect-tab    : tab href → a redirect-only route (the user lands on a
//                       DIFFERENT page than the tab named — see the /bi tabs in
//                       docs/ux/NAVIGATION_DUPLICATE_INVENTORY.md §4).
//   - create-edit-tab : tab href → a create/edit/detail page (tabs must point
//                       at list/dashboard surfaces, never a create form).
//
// Governance check (SOFT — report-only):
//   - label-drift     : tab label is neither the canonical label nor a search
//                       alias for that path in navigation.canonical-map.ts.
//                       Informational: the canonical map is a seed, so an
//                       un-mapped path simply isn't checked.
//
// Usage:
//   node scripts/src/check-tabs-coverage.mjs           # report-only
//   node scripts/src/check-tabs-coverage.mjs --strict  # exit 1 on HARD violations

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
const SHARED_DIR = path.join(REPO, "artifacts/ghayth-erp/src/components/shared");
const CANON_FILE = path.join(
  REPO,
  "artifacts/ghayth-erp/src/components/layout/navigation.canonical-map.ts",
);

const STRICT = process.argv.includes("--strict");

/** Strip a trailing query string / hash so tab hrefs compare to route paths. */
function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** True when an href is a create/edit/detail page (a tab must never be one). */
function isCreateEditDetail(p) {
  const b = basePath(p);
  return b.includes(":") || /\/(create|new|edit)$/.test(b);
}

/**
 * Pull mounted routes + the subset that are redirect-only from routes/*.tsx.
 * A redirect route is `{ path, component: redirectTo("/y") }` or a `const X =
 * redirectTo("/y")` referenced as the component.
 */
function readRoutes() {
  const mounted = new Set();
  const redirects = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    const redirectConsts = new Set();
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*redirectTo\(/g)) {
      redirectConsts.add(m[1]);
    }
    for (const m of src.matchAll(/\{\s*path:\s*["']([^"']+)["']/g)) {
      mounted.add(m[1]);
    }
    for (const m of src.matchAll(
      /\{\s*path:\s*["']([^"']+)["']\s*,\s*component:\s*(redirectTo\(|\w+)/g,
    )) {
      const p = m[1];
      const comp = m[2];
      if (comp === "redirectTo(" || redirectConsts.has(comp)) redirects.add(p);
    }
  }
  return { mounted, redirects };
}

/** Pull every (href, label) tab pair from each *-tabs-nav.tsx. */
function readTabs() {
  const tabs = [];
  for (const file of fs.readdirSync(SHARED_DIR)) {
    if (!file.endsWith("-tabs-nav.tsx")) continue;
    const src = fs.readFileSync(path.join(SHARED_DIR, file), "utf-8");
    for (const m of src.matchAll(
      /\bhref:\s*["']([^"']+)["']\s*,\s*label:\s*["']([^"']+)["']/g,
    )) {
      tabs.push({ file, href: m[1], label: m[2] });
    }
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
  const { mounted, redirects } = readRoutes();
  const tabs = readTabs();
  const canonical = readCanonicalLabels();

  const deadTabs = [];
  const redirectTabs = [];
  const createTabs = [];
  const labelDrift = [];

  for (const t of tabs) {
    const b = basePath(t.href);
    if (isCreateEditDetail(t.href)) {
      createTabs.push(t);
    } else if (!mounted.has(b)) {
      deadTabs.push(t);
    } else if (redirects.has(b)) {
      redirectTabs.push(t);
    }
    const accepted = canonical.get(b);
    if (accepted && !accepted.has(t.label)) {
      labelDrift.push({ ...t, canonical: [...accepted][0] });
    }
  }

  const tabFiles = new Set(tabs.map((t) => t.file)).size;

  console.log(`# tabs-coverage + tab-governance audit\n`);
  console.log(`mode:                                    ${STRICT ? "STRICT (gate)" : "report-only"}`);
  console.log(`tab-nav files scanned:                   ${tabFiles}`);
  console.log(`total tabs:                              ${tabs.length}`);
  console.log(`[HARD] dead tabs (href → no route):      ${deadTabs.length}`);
  console.log(`[HARD] redirect tabs (href → redirect):  ${redirectTabs.length}`);
  console.log(`[HARD] create/edit/detail tabs:          ${createTabs.length}`);
  console.log(`[soft] label drift (≠ canonical/alias):  ${labelDrift.length}\n`);

  if (deadTabs.length > 0) {
    console.log(`## [HARD] dead tabs (href → no mounted route)\n`);
    for (const t of deadTabs) console.log(`  ${t.href}  ("${t.label}", ${t.file})`);
    console.log();
  }
  if (redirectTabs.length > 0) {
    console.log(`## [HARD] redirect tabs (href → a redirect-only route)\n`);
    console.log(`(the user lands on a different page than the tab named; point`);
    console.log(` the tab at the canonical destination instead)\n`);
    for (const t of redirectTabs) console.log(`  ${t.href}  ("${t.label}", ${t.file})`);
    console.log();
  }
  if (createTabs.length > 0) {
    console.log(`## [HARD] create/edit/detail pages used as a tab\n`);
    for (const t of createTabs) console.log(`  ${t.href}  ("${t.label}", ${t.file})`);
    console.log();
  }
  if (labelDrift.length > 0) {
    console.log(`## [soft] tab label drift vs navigation.canonical-map.ts\n`);
    for (const t of labelDrift) {
      console.log(`  ${t.href}  tab="${t.label}"  canonical="${t.canonical}"  (${t.file})`);
    }
    console.log();
  }

  const hard = deadTabs.length + redirectTabs.length + createTabs.length;
  if (hard === 0) console.log(`✓ tab governance: no HARD violations.`);

  if (STRICT && hard > 0) {
    console.error(
      `\n✗ tab governance gate FAILED: ${hard} HARD violation(s) ` +
        `(${deadTabs.length} dead, ${redirectTabs.length} redirect, ${createTabs.length} create-in-tab).`,
    );
    process.exit(1);
  }
}

main();
