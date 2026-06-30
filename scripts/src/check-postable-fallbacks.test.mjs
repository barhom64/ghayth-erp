#!/usr/bin/env node
//
// scripts/src/check-postable-fallbacks.test.mjs
//
// Pure-logic fixtures for the postable-fallback detector (`scanFallbacks`).
// Verifies that ternary fallbacks — the shape the invoice_payment_cash bug took
// (`? "1100" : "1110"`) — are caught on BOTH branches, alongside the existing
// direct-literal / ?? / || / default() / fallbackCode patterns, and that a bare
// ternary outside a resolver call is NOT flagged (anchoring). No file or DB
// access, so it runs everywhere and guards the guard itself.
//
// Run:  node scripts/src/check-postable-fallbacks.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//
import { scanFallbacks } from "./check-postable-fallbacks.mjs";

// Mock chart: true = postable leaf, false = non-postable parent, absent = undefined.
const postable = new Map([
  ["1111", true], ["1124", true], ["5430", true], ["1131", true],
  ["1100", false], ["1110", false], ["5200", false], // non-postable parents
  // 6200 deliberately absent from the map → "absent from chart"
]);

let failed = 0;
const codesOf = (txt) => new Set(scanFallbacks(txt, postable).map((h) => h.code));
function flags(txt, code, label) {
  if (codesOf(txt).has(code)) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label} — expected to FLAG ${code}`); failed++; }
}
function clean(txt, label) {
  const got = [...codesOf(txt)];
  if (got.length === 0) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label} — unexpectedly flagged [${got.join(", ")}]`); failed++; }
}

console.log("positives — ternary fallbacks must FLAG both branches");
flags(`getAccountCodeFromMapping(c, "invoice_payment_cash", "debit", method === "cash" ? "1100" : "1124")`, "1100", "getAccountCodeFromMapping ternary — parent first branch (1100)");
flags(`getAccountCodeFromMapping(c, "invoice_payment_cash", "debit", method === "cash" ? "1111" : "1110")`, "1110", "getAccountCodeFromMapping ternary — parent second branch (1110)");
flags(`resolveAccountCode(c, "x", "debit", isCash ? "1100" : "1111")`, "1100", "resolveAccountCode ternary — parent first branch");
flags(`getAccountCodeFromMapping(c, "x", "debit", cond ? "6200" : "1111")`, "6200", "ternary — code absent from chart (6200)");

console.log("positives — existing direct patterns still FLAG");
flags(`resolveAccountCode(c, "commission_expense", "debit", "5200")`, "5200", "direct literal parent (5200)");
flags(`const x = a ?? "1100"`, "1100", "?? parent fallback");
flags(`const x = a || "1110"`, "1110", "|| parent fallback");

console.log("negatives — must NOT flag");
clean(`getAccountCodeFromMapping(c, "invoice_payment_cash", "debit", method === "cash" ? "1111" : "1124")`, "ternary — both branches postable leaves (the fix)");
clean(`resolveAccountCode(c, "x", "debit", "1131")`, "direct literal leaf (1131)");
clean(`const label = status === "open" ? "1100" : "1110"`, "bare ternary NOT in a resolver call — anchoring prevents false-positive");

console.log(
  failed === 0
    ? "\n[check-postable-fallbacks.test] PASS — all fixtures passed."
    : `\n[check-postable-fallbacks.test] FAIL — ${failed} assertion(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
