#!/usr/bin/env node
/**
 * lintGlBoundary.mjs — GL Boundary Compliance Audit
 *
 * Enforces a single rule: only the central financial engine (and a few
 * explicitly allow-listed helpers) may write into journal_entries /
 * journal_lines. Every other domain engine, route, or processor MUST go
 * through financialEngine.postJournalEntry so period guards, sourceKey
 * idempotency, account validation, and balance updates are applied uniformly.
 *
 * It flags two classes of regressions:
 *   1. Direct INSERTs into `journal_entries` / `journal_lines` from files
 *      outside the ALLOWED set.
 *   2. Direct calls to `createJournalEntry` / `createGuardedJournalEntry`
 *      from outside the ALLOWED set (those helpers exist for the engine
 *      and a small number of legacy processors — new code uses the engine).
 *   3. Volatile sourceKey values (`Date.now()` literals, or 13-digit
 *      millisecond timestamps embedded in the key) which silently break
 *      idempotency.
 *
 * Usage: node scripts/lintGlBoundary.mjs [--json]
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..");
const SRC_DIR = join(API_ROOT, "src");

// Files / globs that are AUTHORIZED to mutate journal tables directly or to
// call createJournalEntry / createGuardedJournalEntry. Everything else must
// route through financialEngine.postJournalEntry.
//
// Paths are tested as substrings against the path relative to API_ROOT.
const ALLOWED_PATHS = [
  // The engine itself
  "src/lib/engines/financialEngine.ts",
  // The shared business helpers expose the primitives the engine wraps.
  "src/lib/businessHelpers.ts",
  // GL primitives used by the engine and a small number of authorized
  // processors (FX, inventory writeoffs, recurring journals, mudad salary).
  "src/lib/gl/posting.ts",
  "src/lib/gl/index.ts",
  "src/lib/gl/journal-poster.ts",
  // Authorized internal processors — each posts via createGuardedJournalEntry
  // with a stable sourceKey. They predate the engine and are kept on the
  // allow-list pending migration to the engine API.
  "src/lib/recurringJournalProcessor.ts",
  "src/lib/umrahImportEngine.ts",
  "src/lib/umrahInvoicingEngine.ts",
  "src/lib/umrahCommissionEngine.ts",
  "src/lib/eventListeners.ts",
  "src/lib/saudi-compliance/mudad/post-salary-journal.ts",
  "src/lib/inventory/post-lot-writeoff-journal.ts",
  "src/lib/inventory/post-cycle-count-journal.ts",
  "src/lib/fx/post-realized-journal.ts",
  "src/lib/fx/post-revaluation-journal.ts",
];

const ALLOWED_DIRS = [
  // Test fixtures may emit raw SQL by design.
  "tests/",
  // Migrations are the canonical place to write DDL/DML against journal_*.
  "migrations/",
];

const DIRECT_INSERT_RE = /INSERT\s+INTO\s+(?:journal_entries|journal_lines)\b/i;
const DIRECT_HELPER_RE = /\b(createJournalEntry|createGuardedJournalEntry)\s*\(/;
// Volatile sourceKey patterns:
//   1. Literal `${Date.now()}` interpolated into a sourceKey string.
//   2. A 13-digit ms timestamp embedded in a sourceKey assignment.
const VOLATILE_SOURCEKEY_LITERAL_RE = /sourceKey\s*:\s*[`"'][^`"']*\$\{[^}]*Date\.now\(\)[^}]*\}[^`"']*[`"']/;
const VOLATILE_SOURCEKEY_DIGITS_RE = /sourceKey\s*:\s*[`"'][^`"']*\b1\d{12}\b[^`"']*[`"']/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (ent.isFile() && /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(relPath) {
  if (ALLOWED_DIRS.some((d) => relPath.startsWith(d))) return true;
  return ALLOWED_PATHS.some((p) => relPath === p || relPath.endsWith("/" + p));
}

function findLines(src, regex) {
  const findings = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip line comments.
    const stripped = line.replace(/\/\/.*$/, "");
    if (regex.test(stripped)) {
      findings.push({ line: i + 1, text: line.trim() });
    }
  }
  return findings;
}

async function main() {
  const wantJson = process.argv.includes("--json");
  const files = await walk(SRC_DIR);
  const offenders = [];

  for (const f of files) {
    const rel = relative(API_ROOT, f);
    const src = await readFile(f, "utf8");

    // Volatile sourceKey check applies EVERYWHERE — even allowed files
    // must use deterministic keys.
    for (const f2 of findLines(src, VOLATILE_SOURCEKEY_LITERAL_RE)) {
      offenders.push({ file: rel, kind: "volatile-sourcekey-datenow", ...f2 });
    }
    for (const f2 of findLines(src, VOLATILE_SOURCEKEY_DIGITS_RE)) {
      offenders.push({ file: rel, kind: "volatile-sourcekey-timestamp", ...f2 });
    }

    if (isAllowed(rel)) continue;

    for (const f2 of findLines(src, DIRECT_INSERT_RE)) {
      offenders.push({ file: rel, kind: "direct-insert", ...f2 });
    }
    for (const f2 of findLines(src, DIRECT_HELPER_RE)) {
      offenders.push({ file: rel, kind: "direct-helper-call", ...f2 });
    }
  }

  if (offenders.length === 0) {
    if (wantJson) console.log(JSON.stringify({ ok: true }, null, 2));
    else console.log("lintGlBoundary: OK — every GL write routes through financialEngine.");
    return;
  }

  if (wantJson) {
    console.log(JSON.stringify({ ok: false, offenders }, null, 2));
  } else {
    console.error(`lintGlBoundary: FAIL — ${offenders.length} GL boundary violation(s):`);
    for (const o of offenders) {
      console.error(`  - [${o.kind}] ${o.file}:${o.line}  ${o.text}`);
    }
    console.error(
      "\nAll GL writes must go through financialEngine.postJournalEntry. If a\n" +
      "file is a legitimate processor that pre-dates the engine, add it to\n" +
      "ALLOWED_PATHS in scripts/lintGlBoundary.mjs with a justification."
    );
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("lintGlBoundary crashed:", err);
  process.exit(2);
});
