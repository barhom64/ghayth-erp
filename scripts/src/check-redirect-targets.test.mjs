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

// quote-agnostic extraction: single quotes and backticks must be seen too, so a
// formatter/style switch can't silently blind the scan.
const quoteSample = `
  { path: '/a/single', component: redirectTo('/a/target') },
  { path: \`/b/backtick\`, component: redirectTo(\`/b/target\`) },
`;
assert(extractRoutePaths(quoteSample).includes("/a/single"), "extractRoutePaths picks single-quoted path");
assert(extractRoutePaths(quoteSample).includes("/b/backtick"), "extractRoutePaths picks backtick path");
assert(extractRedirectTargets(quoteSample).includes("/a/target"), "extractRedirectTargets picks single-quoted target");
assert(extractRedirectTargets(quoteSample).includes("/b/target"), "extractRedirectTargets picks backtick target");

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

// ── resolves: strict-depth semantics (the no-prefix-fallthrough guarantee) ──
// These are the regression fixtures for the tightened matcher: a target must
// match a defined route of the SAME depth — a shorter ancestor is NOT a match.
console.log("resolves — strict depth (no prefix fallthrough)");
const depthSet = new Set(["/finance", "/finance/invoices/:id", "/x/:id"]);
assert(!resolves("/finance/typo/sub", depthSet), "deeper target does NOT resolve to shorter ancestor /finance");
assert(!resolves("/finance/invoices", depthSet), "ancestor of a param route does NOT resolve");
assert(!resolves("/x", depthSet), "bare /x does NOT resolve to /x/:id (param needs its segment)");
assert(!resolves("/x/1/2", depthSet), "too-deep /x/1/2 does NOT resolve to /x/:id");
assert(resolves("/finance", depthSet), "exact /finance still resolves");
assert(resolves("/x/123", depthSet), "/x/123 resolves to /x/:id (same depth)");

if (failed) {
  console.error(`\n[check:redirect-targets.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:redirect-targets.test] all assertions passed");
