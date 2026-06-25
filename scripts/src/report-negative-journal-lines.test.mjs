#!/usr/bin/env node
//
// scripts/src/report-negative-journal-lines.test.mjs
//
// Unit fixtures for the pure helpers of the negative-journal-lines report
// (formatReport + parsePsqlRows). No DB — the psql call itself is not unit
// tested here; only the parsing/formatting logic.
//
// Run:  node scripts/src/report-negative-journal-lines.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//
import assert from "node:assert/strict";
import { formatReport, parsePsqlRows } from "./report-negative-journal-lines.mjs";

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${e.message}`);
  }
}

test("formatReport: empty rows => clean OK message", () => {
  const out = formatReport([]);
  assert.match(out, /OK — zero journal_lines store a negative/);
});

test("parsePsqlRows: parses tab-separated psql -At output into typed rows", () => {
  const stdout = "sales_invoice\t3\t2\t1\nperiod_close\t5\t5\t0\n";
  const rows = parsePsqlRows(stdout);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { sourceType: "sales_invoice", lines: 3, negDebit: 2, negCredit: 1 });
  assert.deepEqual(rows[1], { sourceType: "period_close", lines: 5, negDebit: 5, negCredit: 0 });
});

test("parsePsqlRows: ignores blank lines", () => {
  assert.equal(parsePsqlRows("\n\n").length, 0);
});

test("formatReport: non-empty rows => totals + per-source breakdown + footer", () => {
  const out = formatReport([
    { sourceType: "period_close", lines: 5, negDebit: 5, negCredit: 0 },
    { sourceType: "asset_disposal", lines: 2, negDebit: 1, negCredit: 1 },
  ]);
  // total lines 7, total neg-debit 6, total neg-credit 1
  assert.match(out, /FOUND 7 negative line\(s\)/);
  assert.match(out, /6 negative-debit, 1 negative-credit/);
  assert.match(out, /across 2 source type\(s\)/);
  assert.match(out, /period_close/);
  assert.match(out, /asset_disposal/);
  assert.match(out, /predate the createJournalEntry sign-normalization/);
});

if (failures > 0) {
  console.error(`\n[report-negative-journal-lines.test] ${failures} failure(s).`);
  process.exit(1);
}
console.log("\n[report-negative-journal-lines.test] all passed.");
process.exit(0);
