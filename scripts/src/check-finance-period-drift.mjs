#!/usr/bin/env node
// scripts/src/check-finance-period-drift.mjs
//
// Repo-wide guard against the Task #433 / #435 / #437 family — UTC server
// clock used to derive "current month" / "current year" / "current period"
// values that need to be Riyadh wall-clock. At ~21:00 Riyadh on the last
// day of the month a UTC server already thinks it's next month, so any
// filter / default / report period built from `new Date().getMonth()` /
// `new Date().getFullYear()` ends up pointing at the wrong period.
//
// Sister to `check-utc-time-drift.mjs`. The earlier focused regression
// test (`check-finance-period-drift.test.mjs`) only enforced the rule on
// a hand-maintained allowlist of 7 files; this guard walks every `.ts`
// / `.tsx` under:
//
//   - artifacts/api-server/src/routes
//   - artifacts/api-server/src/lib
//   - artifacts/ghayth-erp/src
//   - artifacts/client-portal/src    (Task #440)
//   - artifacts/careers-portal/src   (Task #440)
//
// Banned shapes (Task #438):
//   1. `new Date().getMonth()`             (inline)
//   2. `new Date().getFullYear()`          (inline)
//   3. `const X = new Date(); X.getMonth()`     (variable-bound, anywhere
//   3b. `const X = new Date(); X.getFullYear()`  in the same file)
//
// Per-line opt-out: `// utc-ok: <reason>` on the offending line silences
// it (matches the global `check-utc-time-drift` contract).
//
// File-level opt-out: `scripts/finance-period-drift-allowlist.txt` —
// `<repo-relative-path>:<line>` entries cover sites that legitimately
// can't carry an inline comment (e.g. JSX attribute on a multi-token
// line, calendar widget initial view, footer copyright year, object-
// storage path partition, timer math). Stale entries fail.
//
// Exit codes: 0 = clean, 1 = violations, 2 = scan failed.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SCAN_DIRS = [
  "artifacts/api-server/src/routes",
  "artifacts/api-server/src/lib",
  "artifacts/ghayth-erp/src",
  // Task #440: portals are production frontends and were missing from the
  // original Task #438 scan, letting the same `new Date().getMonth()` /
  // `new Date().getFullYear()` anti-pattern land silently.
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

const SKIP_RE = /(\/tests?\/|\/__tests__\/|\/migrations\/|\.test\.ts$|\.test\.tsx$|\.test\.mjs$|\.spec\.ts$)/;

const ALLOWLIST_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "finance-period-drift-allowlist.txt",
);

const INLINE_PATTERNS = [
  {
    id: "inline-getMonth",
    re: /\bnew\s+Date\(\s*\)\.getMonth\(\s*\)/,
    hint: 'use `currentDateInTz("Asia/Riyadh")` / `currentMonthPadded()` / `currentPeriod()` — `new Date().getMonth()` is the UTC month.',
  },
  {
    id: "inline-getFullYear",
    re: /\bnew\s+Date\(\s*\)\.getFullYear\(\s*\)/,
    hint: 'use `currentDateInTz("Asia/Riyadh")` / `currentYear()` — `new Date().getFullYear()` is the UTC year.',
  },
];

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return new Map();
  const out = new Map(); // key: `${rel}:${line}` → true
  const lines = fs.readFileSync(ALLOWLIST_PATH, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([^:]+):(\d+)$/);
    if (!m) {
      console.error(
        `[check:finance-period-drift] malformed allowlist entry: ${line}`,
      );
      process.exit(2);
    }
    out.set(`${m[1]}:${m[2]}`, false); // value flips to true if hit
  }
  return out;
}

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

// Strip /* ... */ block comments and {/* ... */} JSX comments, replacing
// them with same-length whitespace so line numbers are preserved.
function stripBlockComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
  return out;
}

function stripLineComment(line) {
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

// Find variable bindings of the shape `const|let|var NAME = new Date()`
// (with NO arguments — `new Date(someISO)` is intentionally about a
// stored historical date and unrelated to "what month is it now").
// Returns { name → declaringLine0 }.
function findNowBindings(strippedLines) {
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Date\(\s*\)\s*[;,)]/;
  const out = new Map();
  for (let i = 0; i < strippedLines.length; i++) {
    const m = strippedLines[i].match(re);
    if (m) out.set(m[1], i);
  }
  return out;
}

function scanFile(rel, allowlist) {
  const abs = path.join(REPO_ROOT, rel);
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch (err) {
    return { error: err.message, hits: [] };
  }
  const stripped = stripBlockComments(src).split("\n");
  const original = src.split("\n");
  const bindings = findNowBindings(stripped);
  const hits = [];

  for (let i = 0; i < stripped.length; i++) {
    const rawLine = original[i] ?? "";
    if (/utc-ok\s*:/i.test(rawLine)) continue;
    const codeLine = stripLineComment(stripped[i]);
    if (!codeLine.trim()) continue;

    const lineHits = [];

    for (const p of INLINE_PATTERNS) {
      if (p.re.test(codeLine)) {
        lineHits.push({ rule: p.id, hint: p.hint });
      }
    }

    for (const [name, declLine] of bindings) {
      // Don't flag the declaration line itself.
      if (i === declLine) continue;
      const escaped = name.replace(/[$]/g, "\\$");
      const monthRe = new RegExp(`\\b${escaped}\\.getMonth\\(\\s*\\)`);
      const yearRe = new RegExp(`\\b${escaped}\\.getFullYear\\(\\s*\\)`);
      if (monthRe.test(codeLine)) {
        lineHits.push({
          rule: "bound-getMonth",
          hint: `\`${name}\` is bound to \`new Date()\` on L${declLine + 1} — use \`currentDateInTz("Asia/Riyadh")\` / \`currentMonthPadded()\` / \`currentPeriod()\` instead of \`${name}.getMonth()\`.`,
        });
      }
      if (yearRe.test(codeLine)) {
        lineHits.push({
          rule: "bound-getFullYear",
          hint: `\`${name}\` is bound to \`new Date()\` on L${declLine + 1} — use \`currentDateInTz("Asia/Riyadh")\` / \`currentYear()\` instead of \`${name}.getFullYear()\`.`,
        });
      }
    }

    if (lineHits.length === 0) continue;

    const key = `${rel}:${i + 1}`;
    if (allowlist.has(key)) {
      allowlist.set(key, true);
      continue;
    }

    for (const h of lineHits) {
      hits.push({ ...h, line: i + 1, snippet: rawLine.trim() });
    }
  }
  return { hits };
}

function main() {
  const allowlist = loadAllowlist();
  const files = [];
  for (const d of SCAN_DIRS) walk(d, files);

  let totalHits = 0;
  const byFile = new Map();
  for (const rel of files) {
    const { error, hits } = scanFile(rel, allowlist);
    if (error) {
      console.error(`[check:finance-period-drift] could not read ${rel}: ${error}`);
      process.exit(2);
    }
    if (hits.length) {
      byFile.set(rel, hits);
      totalHits += hits.length;
    }
  }

  // Stale allowlist entries fail the guard.
  const stale = [];
  for (const [key, hit] of allowlist) {
    if (!hit) stale.push(key);
  }

  if (totalHits === 0 && stale.length === 0) {
    console.log(
      `[check:finance-period-drift] OK — scanned ${files.length} file(s), zero new period-drift anti-patterns, ${allowlist.size} allowlist entry/entries all matched.`,
    );
    process.exit(0);
  }

  if (totalHits > 0) {
    console.error(
      `[check:finance-period-drift] FAIL — ${totalHits} period-drift anti-pattern(s) in ${byFile.size} file(s):\n`,
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
      "Each finding is a Task #433/#435/#437-class bug (UTC month/year used where Riyadh wall-clock is needed).",
    );
    console.error(
      'If a hit is genuinely UTC-correct, append `// utc-ok: <reason>` to the line, or — if the line cannot carry the comment — add the `<path>:<line>` to scripts/finance-period-drift-allowlist.txt with a category comment.',
    );
  }

  if (stale.length > 0) {
    console.error(
      `\n[check:finance-period-drift] FAIL — ${stale.length} stale allowlist entry/entries in scripts/finance-period-drift-allowlist.txt (no matching banned pattern at file:line):\n`,
    );
    for (const k of stale) console.error(`  ${k}`);
    console.error(
      "\nRemove the stale entries — the underlying line was either fixed or moved.",
    );
  }

  process.exit(1);
}

main();
