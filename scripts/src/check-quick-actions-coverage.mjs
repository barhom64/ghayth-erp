#!/usr/bin/env node
// scripts/src/check-quick-actions-coverage.mjs
//
// Quick-actions governance gate. The header "quick actions" bar in
// sidebar-layout.tsx (`pageQuickActions`) renders shortcut buttons per page.
// This guard answers: "does every quick-action button point at a real,
// canonical destination — never a redirect-only route (a circular bounce
// back to the same page) and never a dead route?" — and, with --strict,
// fails the build when the quick-action config drifts.
//
// What it does:
//   1. Reads every mounted route from artifacts/ghayth-erp/src/routes/*.tsx,
//      and which of them are redirect-only.
//   2. Reads every `link: "/..."` button target AND every `"/path": [` block
//      key from pageQuickActions in sidebar-layout.tsx.
//
// Governance gate (HARD — fail under --strict):
//   - redirect-link : a VISIBLE button → a redirect-only route (e.g.
//                     "إدارة المخالفات" → /hr/violations/management, which
//                     bounces straight back; see NAVIGATION_DUPLICATE_INVENTORY
//                     §7).
//   - dead-link     : a button → no mounted route at all.
//   NB: links to /create|/new|/edit pages are LEGITIMATE here (that is what a
//   quick action is for) and are NOT flagged.
//
// Governance check (SOFT — report-only):
//   - dead-config   : a pageQuickActions BLOCK keyed on a redirect-only path
//                     (the page redirects before its quick-action bar ever
//                     renders, so the whole block is dead config).
//
// Usage:
//   node scripts/src/check-quick-actions-coverage.mjs           # report-only
//   node scripts/src/check-quick-actions-coverage.mjs --strict  # exit 1 on HARD

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
const SIDEBAR_LAYOUT = path.join(
  REPO,
  "artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx",
);

const STRICT = process.argv.includes("--strict");

/** Strip a trailing query string / hash so links compare to route paths. */
function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** Pull mounted routes + the redirect-only subset from routes/*.tsx. */
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

/**
 * Extract the pageQuickActions region from sidebar-layout.tsx, then pull every
 * button `link:` target and every `"/path":` block key from within it.
 */
function readQuickActions() {
  const src = fs.readFileSync(SIDEBAR_LAYOUT, "utf-8");
  const startMarker = src.indexOf("pageQuickActions");
  const region =
    startMarker === -1
      ? src
      : src.slice(startMarker, src.indexOf("resolveQuickActions", startMarker) + 1 || src.length);

  const links = [];
  for (const m of region.matchAll(/\blink:\s*["']([^"']+)["']/g)) {
    links.push(m[1]);
  }
  const blockKeys = [];
  for (const m of region.matchAll(/(?:^|\n)\s*["'](\/[^"']*)["']\s*:\s*\[/g)) {
    blockKeys.push(m[1]);
  }
  return { links, blockKeys };
}

function main() {
  const { mounted, redirects } = readRoutes();
  const { links, blockKeys } = readQuickActions();

  const redirectLinks = [];
  const deadLinks = [];
  for (const link of links) {
    const b = basePath(link);
    if (redirects.has(b)) redirectLinks.push(link);
    else if (!mounted.has(b)) deadLinks.push(link);
  }

  const deadConfig = [];
  for (const key of blockKeys) {
    const b = basePath(key);
    if (redirects.has(b)) deadConfig.push(key);
  }

  // De-dup for readability (the same link can appear under several pages).
  const uniq = (arr) => [...new Set(arr)].sort();

  console.log(`# quick-actions-coverage + governance audit\n`);
  console.log(`mode:                                    ${STRICT ? "STRICT (gate)" : "report-only"}`);
  console.log(`quick-action blocks:                     ${blockKeys.length}`);
  console.log(`quick-action buttons (links):            ${links.length}`);
  console.log(`[HARD] buttons → redirect route:         ${uniq(redirectLinks).length}`);
  console.log(`[HARD] buttons → no route (dead):        ${uniq(deadLinks).length}`);
  console.log(`[soft] blocks keyed on a redirect path:  ${uniq(deadConfig).length}\n`);

  if (redirectLinks.length > 0) {
    console.log(`## [HARD] quick-action buttons pointing at a redirect-only route\n`);
    console.log(`(a visible button that bounces the user back; point it at the`);
    console.log(` canonical destination instead)\n`);
    for (const l of uniq(redirectLinks)) console.log(`  ${l}`);
    console.log();
  }
  if (deadLinks.length > 0) {
    console.log(`## [HARD] quick-action buttons pointing at no mounted route\n`);
    for (const l of uniq(deadLinks)) console.log(`  ${l}`);
    console.log();
  }
  if (deadConfig.length > 0) {
    console.log(`## [soft] quick-action blocks keyed on a redirect path (dead config)\n`);
    console.log(`(the page redirects before its quick-action bar renders, so the`);
    console.log(` whole block is unreachable; remove it)\n`);
    for (const k of uniq(deadConfig)) console.log(`  ${k}`);
    console.log();
  }

  const hard = uniq(redirectLinks).length + uniq(deadLinks).length;
  if (hard === 0) console.log(`✓ quick-actions governance: no HARD violations.`);

  if (STRICT && hard > 0) {
    console.error(
      `\n✗ quick-actions governance gate FAILED: ${hard} HARD violation(s) ` +
        `(${uniq(redirectLinks).length} redirect-link, ${uniq(deadLinks).length} dead-link).`,
    );
    process.exit(1);
  }
}

main();
