#!/usr/bin/env node
// scripts/src/check-sidebar-coverage.mjs
//
// Report-only sidebar-coverage audit. Answers the user-facing
// question: "this feature exists on the server and is wired into
// React Router, but how does a user actually navigate to it?"
//
// What it does:
//   1. Reads every mounted route from artifacts/ghayth-erp/src/routes/*.tsx
//      (the same `{ path: "/x", component: X }` shape adminRoutes etc.
//      already use).
//   2. Reads every `path: "/..."` literal from the sidebar config
//      (artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx)
//      — these are the entries actually rendered in the nav drawer.
//   3. Removes the routes that are LEGITIMATELY off-sidebar:
//        - detail pages with `:id` params (opened from list pages)
//        - create/edit pages (`/create`, `/:id/edit`) — opened from
//          a button on the list page
//        - login / 404 / shell routes
//   4. Reports the difference. Every entry left is a real list/
//      dashboard page that has no entry in the nav drawer — a user
//      can only reach it by typing the URL.
//
// What it does NOT do:
//   - Does NOT fail the build. Report-only until the gap is mapped.
//   - Does NOT check the reverse (sidebar entries with no route);
//     audit-routes.mjs already enforces "every page is imported".
//
// Output: stdout, plain text. Pipe to a file or read directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
const SIDEBAR_FILE = path.join(
  REPO,
  "artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx",
);

/** Pull every `{ path: "/x", component: … }` literal from the routes/*.tsx files. */
function getMountedRoutes() {
  const set = new Set();
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    // Match `{ path: "/x", … }` shape. The path value is a string literal.
    for (const m of src.matchAll(/\{\s*path:\s*["']([^"']+)["']/g)) {
      set.add(m[1]);
    }
  }
  return [...set].sort();
}

/** Pull every `path: "/x"` value from the sidebar config object. */
function getSidebarPaths() {
  const src = fs.readFileSync(SIDEBAR_FILE, "utf-8");
  const set = new Set();
  for (const m of src.matchAll(/\bpath:\s*["']([^"']+)["']/g)) {
    set.add(m[1]);
  }
  return [...set].sort();
}

/**
 * A path is "legitimately off-sidebar" when it represents a detail/
 * create/edit page that's opened from another page (list or detail),
 * not from the nav drawer. Heuristics:
 *   - has `:` (route parameter) → detail/edit
 *   - ends with `/create` → create page
 *   - is the login page or the special shell roots
 */
function isLegitimatelyOffSidebar(routePath) {
  if (routePath.includes(":")) return true;
  if (/\/create$/.test(routePath)) return true;
  if (routePath === "/login") return true;
  if (routePath === "/") return true;
  if (routePath === "/dashboard") return true; // home shell
  return false;
}

function main() {
  const routes = getMountedRoutes();
  const sidebarPaths = new Set(getSidebarPaths());

  const missing = [];
  let legitimatelyOff = 0;

  for (const r of routes) {
    if (sidebarPaths.has(r)) continue;
    if (isLegitimatelyOffSidebar(r)) {
      legitimatelyOff++;
      continue;
    }
    missing.push(r);
  }

  console.log(`# sidebar-coverage audit\n`);
  console.log(`total mounted routes:                    ${routes.length}`);
  console.log(`entries in sidebar:                      ${sidebarPaths.size}`);
  console.log(`legitimately off-sidebar (detail/create): ${legitimatelyOff}`);
  console.log(`real list/dashboard pages missing:       ${missing.length}\n`);

  if (missing.length > 0) {
    console.log(`## pages missing from the sidebar\n`);
    // Group by top-level domain segment so the fix is easier to scope.
    const byDomain = new Map();
    for (const p of missing) {
      const domain = p.split("/")[1] || "(root)";
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(p);
    }
    const sorted = [...byDomain.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );
    for (const [domain, list] of sorted) {
      console.log(`### /${domain} (${list.length})`);
      for (const p of list) console.log(`  ${p}`);
      console.log();
    }
  } else {
    console.log(`✓ sidebar coverage: every list/dashboard page has a nav entry.`);
  }
}

main();
