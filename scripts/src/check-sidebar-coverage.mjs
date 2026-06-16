#!/usr/bin/env node
// scripts/src/check-sidebar-coverage.mjs
//
// Sidebar-coverage + navigation-governance gate. Answers the user-facing
// question: "this feature exists on the server and is wired into
// React Router, but how does a user actually navigate to it?" — and,
// with --strict, fails the build when the navigation registry drifts.
//
// What it does:
//   1. Reads every mounted route from artifacts/ghayth-erp/src/routes/*.tsx
//      (the same `{ path: "/x", component: X }` shape adminRoutes etc.
//      already use).
//   2. Reads every `path: "/..."` literal from the navigation registry
//      (artifacts/ghayth-erp/src/components/layout/navigation.registry.ts)
//      — the single source of truth the sidebar derives from.
//   3. Removes the routes that are LEGITIMATELY off-sidebar:
//        - detail pages with `:id` params (opened from list pages)
//        - create/edit pages (`/create`, `/new`, `/:id/edit`) — opened
//          from a button on the list/detail page
//        - redirect stubs (`component: redirectTo(...)` / `RedirectToXxx`) —
//          deep-link aliases that bounce to a canonical page, not real pages
//        - login / 404 / shell routes
//   4. Reports the difference, plus governance checks (below).
//
// Governance gate (HARD — fail under --strict):
//   - orphan          : a real list/dashboard page with no nav entry.
//   - dead-link       : a nav entry pointing at a path that no route mounts.
//   - create-in-sidebar: a create/edit/detail page wired into the nav drawer
//                        (violates the "create/edit = standalone page opened
//                        from a button, never the nav" convention). A small
//                        allowlist covers intentional self-service entries.
//
// Governance checks (SOFT — report-only):
//   - no-perm         : nav leaf with no explicit `perm`/`module` gate. Many
//                       pages legitimately rely on module+minRoleLevel only,
//                       so this is informational, not a hard failure.
//   - leader-path / status are guaranteed for every page by construction in
//     getNavigationRegistry() (each PageMeta is assigned a leaderPath and a
//     status), so a runtime check would be redundant — building the registry
//     IS the enforcement.
//
// Usage:
//   node scripts/src/check-sidebar-coverage.mjs           # report-only
//   node scripts/src/check-sidebar-coverage.mjs --strict  # exit 1 on HARD violations
//
// Output: stdout, plain text. Pipe to a file or read directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/ghayth-erp/src/routes");
// The navigation tree was lifted into navigation.registry.ts (single source of
// truth). The sidebar derives from it, so the nav paths now live there.
const SIDEBAR_FILE = path.join(
  REPO,
  "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts",
);

const STRICT = process.argv.includes("--strict");

// Intentional create/edit-style pages that ARE primary nav entries (e.g.
// employee self-service "submit leave request"). Keep this list tiny and
// justified — every entry is an explicit exception to the
// "no create/edit in the nav drawer" convention.
const CREATE_IN_SIDEBAR_ALLOWLIST = new Set([
  "/hr/leaves/create", // employee self-service "طلب إجازة" entry point
]);

/** Strip a trailing query string / hash so nav paths compare to route paths. */
function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

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

/**
 * Paths whose route component is a redirect — `component: redirectTo("/x")` or a
 * named `RedirectToXxx` component. These are deep-link / back-compat aliases that
 * bounce to a canonical page, not pages in their own right, so (like detail /
 * create pages) they are never expected to carry a sidebar entry.
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

/** Pull every `path: "/x"` value from the navigation registry. */
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
 *   - ends with `/create` or `/new` → create page
 *   - ends with `/edit` → edit page
 *   - is the login page or the special shell roots
 */
function isLegitimatelyOffSidebar(routePath) {
  if (routePath.includes(":")) return true;
  if (/\/(create|new|edit)$/.test(routePath)) return true;
  if (routePath === "/login") return true;
  if (routePath === "/") return true;
  if (routePath === "/dashboard") return true; // home shell
  return false;
}

/** True when a nav-drawer path is a create/edit/detail page (convention breach). */
function isCreateEditDetail(p) {
  const b = basePath(p);
  return b.includes(":") || /\/(create|new|edit)$/.test(b);
}

function main() {
  const routes = getMountedRoutes();
  const routesSet = new Set(routes);
  const redirectPaths = getRedirectRoutePaths();
  const sidebarPaths = [...new Set(getSidebarPaths())].sort();
  const sidebarSet = new Set(sidebarPaths);

  // ── coverage: routes with no nav entry ────────────────────────────────
  const missing = [];
  let legitimatelyOff = 0;
  for (const r of routes) {
    if (sidebarSet.has(r)) continue;
    // Redirect stubs bounce to a canonical page — aliases, not pages, so they
    // don't need their own nav entry (same treatment as detail/create pages).
    if (redirectPaths.has(r) || isLegitimatelyOffSidebar(r)) {
      legitimatelyOff++;
      continue;
    }
    missing.push(r);
  }

  // ── governance: dead links (nav → no mounted route) ───────────────────
  const SHELL_PATHS = new Set(["/", "/dashboard", "/login"]);
  const deadLinks = [];
  for (const p of sidebarPaths) {
    const b = basePath(p);
    if (SHELL_PATHS.has(b)) continue;
    if (!routesSet.has(b)) deadLinks.push(p);
  }

  // ── governance: create/edit/detail pages wired into the nav drawer ────
  const createInSidebar = sidebarPaths.filter(
    (p) => isCreateEditDetail(p) && !CREATE_IN_SIDEBAR_ALLOWLIST.has(basePath(p)),
  );

  // ── soft: nav leaves with no explicit perm/module gate (informational) ─
  // Pull each leaf object's own line and flag those lacking perm/module.
  const src = fs.readFileSync(SIDEBAR_FILE, "utf-8");
  const noPerm = [];
  for (const line of src.split("\n")) {
    const m = line.match(/\bpath:\s*["']([^"']+)["']/);
    if (!m) continue;
    const p = m[1];
    if (SHELL_PATHS.has(basePath(p))) continue;
    if (!/\bperm:/.test(line) && !/\bmodule:/.test(line)) noPerm.push(p);
  }

  // ── report ────────────────────────────────────────────────────────────
  console.log(`# sidebar-coverage + navigation-governance audit\n`);
  console.log(`mode:                                    ${STRICT ? "STRICT (gate)" : "report-only"}`);
  console.log(`total mounted routes:                    ${routes.length}`);
  console.log(`entries in sidebar:                      ${sidebarSet.size}`);
  console.log(`legitimately off-sidebar (detail/create): ${legitimatelyOff}`);
  console.log(`[HARD] orphan pages (missing from nav):  ${missing.length}`);
  console.log(`[HARD] dead links (nav → no route):      ${deadLinks.length}`);
  console.log(`[HARD] create/edit pages in nav drawer:  ${createInSidebar.length}`);
  console.log(`[soft] nav leaves w/o perm/module gate:  ${noPerm.length}\n`);

  if (missing.length > 0) {
    console.log(`## [HARD] orphan pages (missing from the sidebar)\n`);
    const byDomain = new Map();
    for (const p of missing) {
      const domain = p.split("/")[1] || "(root)";
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(p);
    }
    const sorted = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [domain, list] of sorted) {
      console.log(`### /${domain} (${list.length})`);
      for (const p of list) console.log(`  ${p}`);
      console.log();
    }
  }

  if (deadLinks.length > 0) {
    console.log(`## [HARD] dead links (nav entry → no mounted route)\n`);
    for (const p of deadLinks) console.log(`  ${p}`);
    console.log();
  }

  if (createInSidebar.length > 0) {
    console.log(`## [HARD] create/edit/detail pages wired into the nav drawer\n`);
    console.log(`(create/edit pages must be standalone pages opened from a button,`);
    console.log(` never the nav drawer; add an intentional exception to`);
    console.log(` CREATE_IN_SIDEBAR_ALLOWLIST only with justification)\n`);
    for (const p of createInSidebar) console.log(`  ${p}`);
    console.log();
  }

  if (noPerm.length > 0) {
    console.log(`## [soft] nav leaves with no explicit perm/module gate (informational)\n`);
    for (const p of noPerm) console.log(`  ${p}`);
    console.log();
  }

  const hardViolations = missing.length + deadLinks.length + createInSidebar.length;
  if (hardViolations === 0) {
    console.log(`✓ navigation governance: no HARD violations.`);
  }

  if (STRICT && hardViolations > 0) {
    console.error(
      `\n✗ navigation governance gate FAILED: ${hardViolations} HARD violation(s) ` +
        `(${missing.length} orphan, ${deadLinks.length} dead-link, ${createInSidebar.length} create-in-nav).`,
    );
    process.exit(1);
  }
}

main();
