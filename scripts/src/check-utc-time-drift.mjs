#!/usr/bin/env node
// scripts/src/check-utc-time-drift.mjs
//
// Guard: prevent new UTC-vs-Riyadh time-drift bugs (Task #428 family,
// originally Task #400 in attendance).
//
// Bans three anti-patterns inside production code under
//   - artifacts/api-server/src/routes/**
//   - artifacts/api-server/src/lib/**
//   - artifacts/ghayth-erp/src/**
//   - artifacts/client-portal/src/**
//   - artifacts/careers-portal/src/**
//
// 1. `toDateISO(new Date())` — returns the UTC calendar date, not Riyadh's.
//    Fix: `currentDateInTz("Asia/Riyadh")` or `todayISO()` (now Riyadh-aware).
//
// 2. `new Date().toISOString().slice(0, 10|7)` and
//    `new Date().toISOString().split("T")[0]`  — same UTC drift.
//    Fix (server): `todayISO()` / `currentPeriod()` from businessHelpers.
//    Fix (browser): `todayLocal()` from `@/lib/formatters`.
//
// 3. `new Date(<dateISO> + "T00:00:00")` followed by `.setHours(...)` —
//    interprets the wall-clock time in the *server's* TZ. Fix:
//    `combineDateAndShiftTime(dateISO, "HH:MM", "Asia/Riyadh")`.
//
// Per-line opt-out: append a `// utc-ok: <reason>` comment on the offending
// line (or its `{/* utc-ok: ... */}` JSX equivalent). Use sparingly — every
// allowlisted call is a future Task #400-style outage waiting to happen.
//
// Exit codes: 0 = clean, 1 = violations found, 2 = scan failed.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SCAN_DIRS = [
  "artifacts/api-server/src/routes",
  "artifacts/api-server/src/lib",
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// Files we never want to scan (audit/test/migration noise that legitimately
// pokes at UTC for fixtures or database diagnostics).
const SKIP_RE = /(\/tests?\/|\/__tests__\/|\/migrations\/|\.test\.ts$|\.test\.tsx$|\.test\.mjs$|\.spec\.ts$)/;

const PATTERNS = [
  {
    id: "toDateISO-now",
    re: /toDateISO\(\s*new\s+Date\(\s*\)\s*\)/,
    hint: 'use `currentDateInTz("Asia/Riyadh")` or `todayISO()` instead — `toDateISO(new Date())` returns the UTC calendar date.',
  },
  {
    id: "iso-split-T",
    re: /new\s+Date\(\s*\)\.toISOString\(\)\.split\(\s*["']T["']\s*\)\[\s*0\s*\]/,
    hint: "use `todayISO()` (server) or `todayLocal()` (browser) — `new Date().toISOString().split(\"T\")[0]` is the UTC date.",
  },
  {
    id: "iso-slice-10",
    re: /new\s+Date\(\s*\)\.toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/,
    hint: "use `todayISO()` (server) or `todayLocal()` (browser) — `.toISOString().slice(0, 10)` is the UTC date.",
  },
  {
    id: "iso-slice-7",
    re: /new\s+Date\(\s*\)\.toISOString\(\)\.slice\(\s*0\s*,\s*7\s*\)/,
    hint: "use `currentPeriod()` (server) or `todayLocal().slice(0, 7)` (browser) — `.toISOString().slice(0, 7)` is the UTC YYYY-MM.",
  },
  {
    id: "iso-slice-time",
    // `<expr>.slice(11, 16)` over an ISO timestamp yields the UTC HH:MM, not
    // the Riyadh wall-clock time the user expects to see in the UI.
    re: /\.toISOString\(\)\.slice\(\s*11\s*,\s*16\s*\)|\.slice\(\s*11\s*,\s*16\s*\)/,
    hint: "use `formatTimeAr(...)` (browser) — `.slice(11, 16)` of an ISO string is UTC time, not Riyadh wall-clock.",
  },
  {
    id: "date-T00-no-Z",
    // `new Date(<expr> + "T00:00:00")` *without* a trailing Z — server-local TZ.
    // Z-suffixed forms (`"T00:00:00Z"`) are unambiguous UTC and OK.
    re: /new\s+Date\(\s*[^)]*\+\s*["']T00:00:00["']\s*\)/,
    hint: 'use `combineDateAndShiftTime(dateISO, "HH:MM", "Asia/Riyadh")` — `new Date(date + "T00:00:00")` interprets the wall-clock in the server\'s TZ.',
  },
];

function walk(dir, out) {
  const abs = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    const full = path.join(REPO_ROOT, rel);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      if (SKIP_RE.test(full)) continue;
      out.push(rel);
    }
  }
}

// Strip /* ... */ block comments across the whole file, then per-line strip
// `// ...` and `{/* ... */}` (JSX) tail comments before pattern matching.
// Replacing comments with same-length whitespace preserves line numbers.
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  return out;
}

function stripLineComment(line) {
  // Naive but adequate for our regex targets — strip everything from the first
  // `//` that is NOT inside a string literal. Walk the line tracking quote
  // state so URLs like `https://...` inside strings are preserved.
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function scanFile(rel) {
  const abs = path.join(REPO_ROOT, rel);
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch (err) {
    return { error: err.message, hits: [] };
  }
  const stripped = stripComments(src).split("\n");
  const original = src.split("\n");
  const hits = [];
  for (let i = 0; i < stripped.length; i++) {
    const rawLine = original[i] ?? "";
    if (/utc-ok\s*:/i.test(rawLine)) continue;
    const codeLine = stripLineComment(stripped[i]);
    if (!codeLine.trim()) continue;
    for (const p of PATTERNS) {
      if (p.re.test(codeLine)) {
        hits.push({
          rule: p.id,
          hint: p.hint,
          line: i + 1,
          snippet: rawLine.trim(),
        });
      }
    }
  }
  return { hits };
}

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(d, files);

  let totalHits = 0;
  const byFile = new Map();
  for (const rel of files) {
    const { error, hits } = scanFile(rel);
    if (error) {
      console.error(`[check:utc-time-drift] could not read ${rel}: ${error}`);
      process.exit(2);
    }
    if (hits.length) {
      byFile.set(rel, hits);
      totalHits += hits.length;
    }
  }

  if (totalHits === 0) {
    console.log(
      `[check:utc-time-drift] OK — scanned ${files.length} file(s), zero UTC-drift anti-patterns.`,
    );
    process.exit(0);
  }

  console.error(
    `[check:utc-time-drift] FAIL — ${totalHits} UTC-drift anti-pattern(s) in ${byFile.size} file(s):\n`,
  );
  for (const [rel, hits] of byFile) {
    console.error(`  ${rel}`);
    for (const h of hits) {
      console.error(`    L${h.line}  [${h.rule}] ${h.snippet}`);
      console.error(`           hint: ${h.hint}`);
    }
    console.error("");
  }
  console.error(
    "Each finding is a Task #400-class bug (UTC date/time used where Riyadh wall-clock is needed).",
  );
  console.error(
    'If a hit is genuinely UTC-correct (e.g. object-storage path partition, synthetic ref), append `// utc-ok: <reason>` to the line.',
  );
  process.exit(1);
}

main();
