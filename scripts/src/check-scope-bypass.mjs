#!/usr/bin/env node
// check-scope-bypass.mjs — CI wrapper for the scope-bypass static
// detector (audit/system-review/tooling/scope-bypass.mjs).
//
// Per #685 PR-1 owner directive ("لا تفشل CI على كل شيء مباشرة؛ اجعلها
// report-first أو warning-first إن كان الفشل سيكسر main") this script:
//
//   1. Always runs the underlying detector (regenerates the JSON +
//      Markdown reports).
//   2. By default, exits 0 — surfaces totals + Class A/B/C/D split to
//      stdout, but does NOT fail the guard suite. Today's hit count
//      (~2.3k across ~83 files) would otherwise red-card every PR until
//      the multi-cluster migration plan in
//      docs/audit/SCOPE_NORMALIZATION_RCA_685.md completes.
//   3. With `SCOPE_BYPASS_STRICT=1`, exits non-zero when:
//        a. New hand-rolled hits appear above the baseline, OR
//        b. The allowlist has stale entries.
//      This lets the migration PRs (A1, A2, ...) opt into strict mode
//      file-by-file as each cluster lands, without breaking main today.
//   4. With `SCOPE_BYPASS_FAIL_ON_STALE=1`, exits non-zero ONLY on
//      stale allowlist entries (cheap to enforce immediately because
//      stale entries are always wrong; no migration coupling).
//
// Exit codes:
//   0 — always in report mode, OR strict mode with no new hits / stale.
//   1 — strict mode with new hits OR stale allowlist entries detected.
//   2 — detector itself failed (script error).
//
// Baseline file (optional): audit/system-review/tooling/scope-bypass-baseline.json
//   { "totalHits": <n>, "filesWithHits": <n> }
// Refresh via:  SCOPE_BYPASS_UPDATE_BASELINE=1 node scripts/src/check-scope-bypass.mjs

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");
const DETECTOR = join(REPO, "audit/system-review/tooling/scope-bypass.mjs");
const OUT_JSON = join(REPO, "audit/system-review/tooling/_scope-bypass.json");
const BASELINE = join(REPO, "audit/system-review/tooling/scope-bypass-baseline.json");

const STRICT = process.env.SCOPE_BYPASS_STRICT === "1";
const FAIL_ON_STALE = process.env.SCOPE_BYPASS_FAIL_ON_STALE === "1";
const UPDATE_BASELINE = process.env.SCOPE_BYPASS_UPDATE_BASELINE === "1";

const r = spawnSync(process.execPath, [DETECTOR], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("check-scope-bypass: detector exited", r.status);
  process.exit(2);
}

if (!existsSync(OUT_JSON)) {
  console.error("check-scope-bypass: detector did not write", OUT_JSON);
  process.exit(2);
}

const data = JSON.parse(readFileSync(OUT_JSON, "utf8"));
const { totals, staleAllowlist } = data;

console.log("");
console.log("check-scope-bypass summary (route layer only):");
console.log("  files scanned          :", totals.filesScanned);
console.log("  files with ≥1 hit      :", totals.filesWithHits);
console.log("  total hand-rolled hits :", totals.totalHits);
console.log("  Class A (safe)         :", totals.byCategory.A_safe.files,   "files /", totals.byCategory.A_safe.hits,   "hits");
console.log("  Class B (risky)        :", totals.byCategory.B_risky.files,  "files /", totals.byCategory.B_risky.hits,  "hits");
console.log("  Class C (manual)       :", totals.byCategory.C_manual.files, "files /", totals.byCategory.C_manual.hits, "hits");
console.log("  Class D (helper)       :", totals.byCategory.D_helper.files, "files /", totals.byCategory.D_helper.hits, "hits");
console.log("  stale allowlist        :", staleAllowlist.length);

if (UPDATE_BASELINE) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ totalHits: totals.totalHits, filesWithHits: totals.filesWithHits }, null, 2) + "\n"
  );
  console.log("check-scope-bypass: baseline updated ->", BASELINE);
  process.exit(0);
}

// Stale-allowlist gate is cheap to enforce immediately. Disabled by
// default so PR-1 itself does not red-card if a manual file legitimately
// stops hand-rolling. Opt-in via SCOPE_BYPASS_FAIL_ON_STALE=1.
if (FAIL_ON_STALE && staleAllowlist.length > 0) {
  console.error("check-scope-bypass: FAIL — stale allowlist entries:");
  for (const s of staleAllowlist) console.error("   -", s.file, "(was:", s.category + ")");
  process.exit(1);
}

if (!STRICT) {
  console.log("");
  console.log("check-scope-bypass: report-only mode (SCOPE_BYPASS_STRICT unset).");
  console.log("check-scope-bypass: see docs/audit/SCOPE_BYPASS.md and docs/audit/SCOPE_NORMALIZATION_RCA_685.md.");
  process.exit(0);
}

// Strict mode: compare against baseline.
let baseline = { totalHits: Infinity, filesWithHits: Infinity };
if (existsSync(BASELINE)) {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
}
const regressed =
  totals.totalHits > baseline.totalHits ||
  totals.filesWithHits > baseline.filesWithHits;

if (regressed) {
  console.error("");
  console.error("check-scope-bypass: STRICT FAIL — new hand-rolled scope predicates detected.");
  console.error("  baseline totalHits   :", baseline.totalHits, " current:", totals.totalHits);
  console.error("  baseline filesWithHits:", baseline.filesWithHits, " current:", totals.filesWithHits);
  console.error("Fix the new bypass, OR add a per-line `// scope-ok: <reason>` comment, OR");
  console.error("(for Category C/D only) add the file to");
  console.error("  audit/system-review/tooling/scope-bypass-allowlist.txt");
  console.error("Do NOT bump the baseline to silence a new bypass — that defeats the guard.");
  process.exit(1);
}

console.log("check-scope-bypass: STRICT OK — no regression against baseline.");
process.exit(0);
