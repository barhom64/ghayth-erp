#!/usr/bin/env node
//
// scripts/src/check-audit-coverage.test.mjs
//
// Pure-logic fixtures for the audit-coverage detector. Exercises
// `unauditedWriteKeys` against endpoint records with and without audit, without
// touching any file or DB — so it runs in every environment and guards the
// guard itself.
//
// Run:  node scripts/src/check-audit-coverage.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { unauditedWriteKeys } from "./check-audit-coverage.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
}

// ── positives: write endpoints WITHOUT audit must be flagged ─────────────
console.log("positives — must FLAG unaudited writes");
{
  const keys = unauditedWriteKeys([
    { method: "POST", path: "/finance/journal/:id/reverse", hasAudit: false },
  ]);
  assert(
    keys.includes("POST /finance/journal/:id/reverse"),
    "unaudited POST flagged with METHOD path key",
  );
}
{
  const keys = unauditedWriteKeys([
    { method: "PUT", path: "/a", hasAudit: false },
    { method: "PATCH", path: "/b", hasAudit: false },
    { method: "DELETE", path: "/c", hasAudit: false },
  ]);
  assert(keys.length === 3, "PUT/PATCH/DELETE all counted as writes");
  assert(
    JSON.stringify(keys) === JSON.stringify(["DELETE /c", "PATCH /b", "PUT /a"]),
    "keys returned sorted for stable allowlist diffs",
  );
}
{
  // identical METHOD+path from two mount prefixes collapse to one key
  const keys = unauditedWriteKeys([
    { method: "POST", path: "/hr/x", hasAudit: false },
    { method: "POST", path: "/hr/x", hasAudit: false },
  ]);
  assert(keys.length === 1, "duplicate METHOD+path de-duplicated");
}

// ── negatives: GET and audited writes must NOT be flagged ────────────────
console.log("negatives — must NOT flag");
{
  const keys = unauditedWriteKeys([
    { method: "GET", path: "/finance/invoices", hasAudit: false },
  ]);
  assert(keys.length === 0, "GET (read) never flagged even without audit");
}
{
  const keys = unauditedWriteKeys([
    { method: "POST", path: "/finance/invoices", hasAudit: true },
    { method: "DELETE", path: "/finance/invoices/:id", hasAudit: true },
  ]);
  assert(keys.length === 0, "audited writes (createAuditLog/emitEvent/mw) not flagged");
}
{
  const keys = unauditedWriteKeys([
    { method: "GET", path: "/r", hasAudit: false },
    { method: "POST", path: "/w-ok", hasAudit: true },
    { method: "POST", path: "/w-gap", hasAudit: false },
  ]);
  assert(
    JSON.stringify(keys) === JSON.stringify(["POST /w-gap"]),
    "mixed set isolates only the unaudited write",
  );
}

if (failed) {
  console.error(`\n[check:audit-coverage.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:audit-coverage.test] all assertions passed");
