#!/usr/bin/env node
// Focused regression test for Task #433 — the two finance hot paths that
// previously derived period strings from `new Date().getMonth()` /
// `now.getFullYear()` (i.e. the UTC server clock) must stay routed through
// the Riyadh-aware `currentDateInTz` helper.
//
// Task #435 — extended to cover 6 more server-side hot paths flagged by the
// post-Task-#433 sweep where the inline form `new Date().getMonth()` /
// `new Date().getFullYear()` was still being used to build "current period
// / current month / current year" values. Same class of bug — at 21:00
// Riyadh on the last day of the month the UTC server thinks it's already
// next month, so the wrong period is used.
//
// Sister to `check-utc-time-drift.mjs`. We intentionally do NOT add a broad
// `new Date().getMonth()` rule to the global guard because many legitimate
// non-period sites (footer copyright years, low-stakes display headings)
// would trip it. This file pins the converted call sites so they can't
// silently regress.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Task #433 targets. The original pattern there was a 3-liner
// `const now = new Date(); now.getMonth(); now.getFullYear()`.
const T433_TARGETS = [
  "artifacts/api-server/src/routes/finance-budget.ts",
  "artifacts/api-server/src/routes/finance-algorithms.ts",
];

// Task #435 follow-up sweep targets. Each had an inline
// `new Date().getMonth()` (or `.getFullYear()`) that's been routed through
// `currentMonthPadded()` / `currentPeriod()` / `currentYear()`.
const T435_TARGETS = [
  "artifacts/api-server/src/routes/bi.ts",
  "artifacts/api-server/src/routes/finance-invoices.ts",
  "artifacts/api-server/src/routes/hr.ts",
  "artifacts/api-server/src/lib/eventListeners.ts",
  "artifacts/api-server/src/lib/proactiveEngine.ts",
];

// Task #437 — bi.ts had three additional "this month vs last month" /
// "this week vs last week" comparison blocks (executive summary, monthly
// admin report, CEO dashboard) using the `const now = new Date(); now.get
// Month()` shape that T435_BANNED's inline-call regex did NOT catch.
// Apply the full T433_BANNED set to bi.ts as well so the converted call
// sites can't silently regress to the variable-bound shape.
const T437_TARGETS = [
  "artifacts/api-server/src/routes/bi.ts",
];

// Task #433 anti-pattern: `const now = new Date()` then `now.getMonth()` /
// `now.getFullYear()`. Only enforced on the original Task #433 files —
// other files in this repo legitimately use `const now = new Date()` for
// non-period purposes.
const T433_BANNED = [
  /\bconst\s+now\s*=\s*new\s+Date\(\s*\)/,
  /\bnow\.getMonth\(\s*\)/,
  /\bnow\.getFullYear\(\s*\)/,
];

// Task #435 anti-pattern: inline `new Date().getMonth()` /
// `new Date().getFullYear()`. Narrow on the bare-call form (no variable,
// no argument) so it does NOT catch e.g. `hireDate.getMonth()` or
// `new Date(someISO).getMonth()` which are intentionally about a stored
// historical date and unrelated to "what month is it right now".
const T435_BANNED = [
  /\bnew\s+Date\(\s*\)\.getMonth\(\s*\)/,
  /\bnew\s+Date\(\s*\)\.getFullYear\(\s*\)/,
];

// In finance-algorithms.ts the depreciation-schedule loop must not rebuild
// `period` from `d.getFullYear() / d.getMonth()` directly (UTC-biased on a
// UTC server when purchaseDate's wall-clock crosses midnight) — it has to
// go through `currentDateInTz("Asia/Riyadh", d)`.
const ALGO_BANNED = [
  /\$\{d\.getFullYear\(\s*\)\}-\$\{String\(d\.getMonth\(\s*\)\s*\+\s*1\)/,
];

// Each converted file must keep referencing one of the Riyadh-aware
// helpers so we don't silently lose the conversion via a future refactor.
const RIYADH_HELPER_RE = /currentDateInTz|currentMonthPadded|currentPeriod\s*\(|currentYear\s*\(/;

function bannedFor(rel) {
  if (rel.endsWith("finance-algorithms.ts")) {
    return [...T433_BANNED, ...T435_BANNED, ...ALGO_BANNED];
  }
  if (T433_TARGETS.includes(rel)) {
    return [...T433_BANNED, ...T435_BANNED];
  }
  if (T437_TARGETS.includes(rel)) {
    return [...T433_BANNED, ...T435_BANNED];
  }
  return T435_BANNED;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const TARGETS = [...T433_TARGETS, ...T435_TARGETS];
let total = 0;
for (const rel of TARGETS) {
  const abs = path.join(REPO_ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const banned = bannedFor(rel);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Per-line `// utc-ok:` opt-out matches the global guard's contract.
    if (/utc-ok\s*:/i.test(line)) continue;
    for (const re of banned) {
      if (re.test(line)) {
        fail(`${rel}:${i + 1} reintroduced UTC-period anti-pattern matching ${re}\n   ${line.trim()}`);
      }
    }
  }
  if (!RIYADH_HELPER_RE.test(src)) {
    fail(`${rel} no longer references a Riyadh-aware helper (currentDateInTz / currentMonthPadded / currentPeriod / currentYear) — Task #433 / #435 conversion lost.`);
  }
  total++;
}

console.log(`check-finance-period-drift: OK — ${total} target file(s) clean.`);
