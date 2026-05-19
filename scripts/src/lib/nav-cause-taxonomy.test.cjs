"use strict";

// Regression test for the Task #702 finance-cluster misclassification.
//
// Symptom: 27 contiguous /finance/* routes failed in audit run
//   run-20260519-175517-257267-indt3a
// with categoryHistogram = { harness:0, authz:0, auth:0, unknown:29 },
// even though every one of them returned HTTP 200 in 5-7ms via curl
// (curl audit/runtime-evidence/...). The 27-route block was a contiguous
// idx range (79-105), all stuck at `goto:start` only, all exactly
// ~25025ms — the textbook wedged-Chromium pattern documented in
// nav-cause-taxonomy.cjs as `harness.timeout`.
//
// Root cause located in scripts/src/runtime-audit.cjs probe() catch
// block: the catch returned a row with NO `navCause`, so the post-run
// classifier saw an empty string and matched /^$/ in
// `unknown.unclassified`. The fix in runtime-audit.cjs now sets the
// navCause string explicitly so the classifier puts these where they
// belong: `harness.timeout`. This test pins both halves of that
// contract: (a) the exact strings the probe() catch emits map to the
// expected taxonomy category, and (b) the historical bare-empty
// navCause still maps to unknown (so the unknown bucket isn't silently
// hollowed out — if a new failure mode ships an empty navCause we WANT
// to see it as unknown until we classify it).

const assert = require("node:assert/strict");
const tax = require("./nav-cause-taxonomy.cjs");

const cases = [
  // ── exact strings emitted by the patched probe() catch ──────────────
  {
    name: "probe() Navigation timeout → harness.timeout (#702 fix)",
    nc: "harness-timeout (page.goto exceeded 25s — chromium/proxy starvation, not a route defect)",
    expectCategory: "harness",
    expectCode: "harness.timeout",
  },
  {
    name: "probe() detached Frame → harness.detached_frame",
    nc: "harness-detached-frame (chromium crashed mid-navigation)",
    expectCategory: "harness",
    expectCode: "harness.detached_frame",
  },
  {
    name: "probe() Target/Session closed → harness.session_closed",
    nc: "harness-session-closed (browser/page died)",
    expectCategory: "harness",
    expectCode: "harness.session_closed",
  },
  {
    name: "probe() Protocol error → harness.protocol_error",
    nc: "harness-protocol-error (some cdp error)",
    expectCategory: "harness",
    expectCode: "harness.protocol_error",
  },
  {
    name: "probe() generic throw → harness.throw",
    nc: "harness-throw (something else)",
    expectCategory: "harness",
    expectCode: "harness.throw",
  },

  // ── canary: empty/undefined navCause must still map to unknown ──────
  {
    name: "empty navCause → unknown.unclassified (canary)",
    nc: "",
    expectCategory: "unknown",
    expectCode: "unknown.unclassified",
  },
  {
    name: "null navCause → unknown.unclassified (canary)",
    nc: null,
    expectCategory: "unknown",
    expectCode: "unknown.unclassified",
  },
  {
    name: "unclassified prefix → unknown.unclassified",
    nc: "unclassified (trace=goto:start)",
    expectCategory: "unknown",
    expectCode: "unknown.unclassified",
  },

  // ── canary: auth/authz buckets still pin to the right categories ────
  {
    name: "api401 → auth.api401_redirect",
    nc: "api401 (something)",
    expectCategory: "auth",
    expectCode: "auth.api401_redirect",
  },
  {
    name: "forbidden-bounce → authz.forbidden_bounce",
    nc: "forbidden-bounce (SPA guard sent /login)",
    expectCategory: "authz",
    expectCode: "authz.forbidden_bounce",
  },
  {
    name: "AccessDenied → authz.access_denied",
    nc: "AccessDenied banner rendered",
    expectCategory: "authz",
    expectCode: "authz.access_denied",
  },
];

let failed = 0;
for (const c of cases) {
  try {
    const entry = tax.classify(c.nc);
    assert.equal(entry.category, c.expectCategory, `${c.name}: category`);
    assert.equal(entry.code, c.expectCode, `${c.name}: code`);
    console.log(`  ✓ ${c.name}`);
  } catch (e) {
    console.error(`  ✗ ${c.name}\n    ${e.message}`);
    failed++;
  }
}

// ── extra contract: the EXACT 27 finance routes from the #702 evidence
// pack should all land in `harness` once probe() emits navCause. We
// simulate the post-classifier on the patched probe() output.
const FINANCE_27 = [
  "/finance/financial-requests", "/finance/fiscal-periods", "/finance/fixed-assets",
  "/finance/fixed-assets/batch-depreciate", "/finance/fx-rates", "/finance/gl-posting-queue",
  "/finance/intercompany", "/finance/intercompany/consolidation/create",
  "/finance/inventory-costing", "/finance/invoices", "/finance/invoices/create",
  "/finance/journal", "/finance/journal-manual", "/finance/journal-manual/create",
  "/finance/journal/create", "/finance/opening-balances", "/finance/opening-balances/create",
  "/finance/payments", "/finance/pricing-rules", "/finance/pricing-rules/create",
  "/finance/project-costing", "/finance/purchase-orders", "/finance/purchase-orders/:id",
  "/finance/purchase-orders/create", "/finance/receivables", "/finance/recurring-journals",
  "/finance/recurring-journals/create",
];
const PROBE_EMITTED = "harness-timeout (page.goto exceeded 25s — chromium/proxy starvation, not a route defect)";
const hist = { harness: 0, authz: 0, auth: 0, unknown: 0 };
for (const _ of FINANCE_27) hist[tax.categoryOf(PROBE_EMITTED)]++;
try {
  assert.deepEqual(hist, { harness: 27, authz: 0, auth: 0, unknown: 0 }, "Task #702 27-route reclassification");
  console.log(`  ✓ Task #702: 27 finance nav-timeouts → all harness, none unknown`);
} catch (e) {
  console.error(`  ✗ Task #702 reclassification: ${e.message}`);
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length + 1} taxonomy regression tests passed.`);
