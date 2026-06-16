#!/usr/bin/env node
//
// scripts/src/check-redirect-targets.test.mjs
//
// Pure-logic fixtures for the redirect-target integrity guard. Exercises the
// extractors and the `resolves` matcher against positive (broken) and negative
// (valid) snippets without touching any file or DB — runs in every environment
// and guards the guard itself.
//
// Run:  node scripts/src/check-redirect-targets.test.mjs
// Exits 0 on pass, 1 on any assertion failure.

import {
  extractRoutePaths,
  extractRedirectTargets,
  resolves,
} from "./check-redirect-targets.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
}

// ── extractors ───────────────────────────────────────────────────────────
const sample = `
  { path: "/hr/leaves", component: LeavesPage, subKey: "leaves" },
  { path: "/hr/leaves/management", component: redirectTo("/hr/leaves"), subKey: "leaves" },
  const RedirectX = redirectTo("/bi");
  { path: "/bi/kpis", component: RedirectX },
  { path: "/finance/invoices/:id", component: InvoiceDetail },
`;
console.log("extractors");
assert(extractRoutePaths(sample).includes("/hr/leaves"), "extractRoutePaths picks plain path");
assert(extractRoutePaths(sample).includes("/finance/invoices/:id"), "extractRoutePaths picks param path");
assert(extractRedirectTargets(sample).includes("/hr/leaves"), "extractRedirectTargets picks inline target");
assert(extractRedirectTargets(sample).includes("/bi"), "extractRedirectTargets picks const-assigned target");

// ── resolves: positives (must resolve / not flag) ──────────────────────────
console.log("resolves — must RESOLVE");
const defined = new Set([
  "/hr/leaves",
  "/bi",
  "/finance/invoices/:id",
  "/finance/fiscal-periods-v2",
  "/hr/org-tree",
]);
assert(resolves("/hr/leaves", defined), "exact match");
assert(resolves("/bi", defined), "exact short match");
assert(resolves("/finance/invoices/123", defined), "param family: /x/123 -> /x/:id");
assert(resolves("/hr/org-tree", defined), "exact nested match");

// ── resolves: negatives (must FAIL to resolve = broken redirect) ───────────
console.log("resolves — must NOT resolve (broken)");
assert(!resolves("/hr/org-tree-typo", defined), "typo target does not resolve");
assert(!resolves("/finance/fiscal-periods", defined), "renamed-away target does not resolve");
assert(!resolves("/nonexistent/page", defined), "totally unknown target does not resolve");

if (failed) {
  console.error(`\n[check:redirect-targets.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:redirect-targets.test] all assertions passed");
