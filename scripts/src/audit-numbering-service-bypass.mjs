#!/usr/bin/env node
//
// scripts/src/audit-numbering-service-bypass.mjs
//
// Deeper guard ON TOP OF audit-numbering-coverage.mjs. The coverage
// audit answers "is every executive INSERT paired with issueNumber?".
// This audit answers the inverse: "is every WRITE to a numbering_*
// table coming from THE service?"
//
// Two ways a route can still bypass the center even after the coverage
// audit passes:
//
//   1. Direct INSERT/UPDATE into numbering_assignments / numbering_counters /
//      numbering_schemes / numbering_audit_logs from outside lib/numberingService.ts.
//      That would mean someone is forging assignment rows or hand-bumping
//      counters — which defeats the whole single-authority model.
//
//   2. A `SELECT COUNT(*) ... + 1` pattern adjacent to a column named
//      memoNumber / orderNumber / refNumber / receiptNumber / caseNumber —
//      i.e. someone reinventing sequence allocation outside the service.
//      generateMemoNumber in lib/disciplineEngine.ts (gap G1) is the
//      canonical example.
//
// Exits non-zero on either finding, with file:line citation.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");

// Files that LEGITIMATELY write to numbering_* tables. Every other file
// found writing to those tables is a service-bypass and CI fails.
const LEGITIMATE_WRITERS = new Set([
  "lib/numberingService.ts",        // the service itself
  "lib/numberingBackfill.ts",       // the documented backfill utility
  "routes/numbering.ts",             // the admin route exposes service ops;
                                     // every UPDATE there is fronted by an
                                     // exported service function call.
  // companyBootstrap clones the per-module numbering_schemes rows
  // when a brand-new tenant is provisioned (mirrors the seed-replay
  // pass in scripts/provision-agent-db.sh for tenants that came in
  // post-migration). This is SCHEME REGISTRATION (config rows), not
  // sequence allocation — the numbering service still owns every
  // counter increment via numberingService.issueNumber.
  "lib/companyBootstrap.ts",
]);

// Migration files writing seed data are intentionally exempted —
// migrations are reviewed at PR time and the audit's job is to catch
// runtime bypass, not schema setup.
const MIGRATION_PATH_PREFIX = "migrations/";

const NUMBERING_TABLES = [
  "numbering_assignments",
  "numbering_counters",
  "numbering_schemes",
  "numbering_audit_logs",
];

// Columns commonly used as a sequence target by legacy bypass code.
// Adding a column here REQUIRES a corresponding scheme in
// numbering_schemes so the proper service path is available.
const SEQUENCE_TARGET_COLUMNS = [
  "memoNumber",
  "orderNumber",
  "receiptNumber",
  "caseNumber",
  "ticketNumber",
  "loanNumber",
  "exitNumber",
  "requestNumber",
  "contractNumber",
  "tripNumber",
  "invoiceNumber",
  "documentNumber",
  "voucherNumber",
  "trxNumber",
  "grnNumber",
  "poNumber",
];

const NUMBERING_WRITE_RE = new RegExp(
  `(?:INSERT\\s+INTO|UPDATE)\\s+(?:public\\.)?"?(${NUMBERING_TABLES.join("|")})"?\\b`,
  "gi",
);

// Raw nextval() sequence allocation outside the service. PR #232 closure
// found two of these hiding in lib/umrahInvoicingEngine.ts:
//   SELECT nextval('umrah_sales_invoice_seq')
//   SELECT nextval('umrah_payment_seq')
// Any nextval() targeting a *_seq that ISN'T the numbering center's own
// counter table fixtures is a probable bypass. The lint rule
// `nextval-in-route` already catches this in routes/; this scan extends
// the check to lib/.
const NEXTVAL_RE = /\bnextval\s*\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\)/gi;
// Allow the numbering center's own seed sequences (created in the
// migrations) AND seed/bootstrap helpers that legitimately use raw
// nextval to mint demo employee numbers etc.
const ALLOWED_NEXTVAL_SEQUENCES = new Set([
  "numbering_schemes_id_seq",
  "numbering_counters_id_seq",
  "numbering_assignments_id_seq",
  "numbering_audit_logs_id_seq",
]);
const NEXTVAL_EXEMPT_FILES = new Set([
  "lib/seedDemoData.ts",
  "lib/bootstrapAdmin.ts",
]);

// The atomic-tx pattern from PR #1254 requires a single follow-up
// UPDATE on numbering_assignments to set `entityId` to the just-inserted
// row id. That UPDATE is the documented end of the transactional issue
// flow and is explicitly NOT a service bypass. Match exactly that shape
// (SET "entityId" = ... WHERE id = ...) and treat it as allowed.
const ALLOWED_LINKBACK_RE = /UPDATE\s+(?:public\.)?"?numbering_assignments"?\s+SET\s+"entityId"\s*=\s*\$\d+\s+WHERE\s+id\s*=\s*\$\d+/i;

// COUNT(*)-based sequence generation: SELECT COUNT(*) ... + 1, or
// COALESCE(MAX(seq), 0) + 1. Both are the classic "race-prone sequence"
// pattern. Match either across whatever table they target, then check
// that the same function returns / assigns to a *Number column.
const COUNT_STAR_SEQ_RE = /(?:SELECT\s+COUNT\s*\(\s*\*\s*\)|COALESCE\s*\(\s*MAX\s*\(\s*"?(?:sequenceValue|seq|\w+Number)"?\s*\)\s*,\s*0\s*\)\s*\+\s*1)/gi;
const MAX_PLUS_ONE_RE = /COALESCE\s*\(\s*MAX\s*\([^)]+\)\s*,\s*0\s*\)\s*\+\s*1/gi;

async function walk(dir, acc = []) {
  const entries = await readdir(dir);
  for (const e of entries) {
    const full = join(dir, e);
    const s = await stat(full);
    if (s.isDirectory()) await walk(full, acc);
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

function isLegitimate(relPath) {
  if (LEGITIMATE_WRITERS.has(relPath)) return true;
  if (relPath.startsWith(MIGRATION_PATH_PREFIX)) return true;
  if (relPath.endsWith(".test.ts") || relPath.endsWith(".spec.ts")) return true;
  if (relPath.startsWith("../tests/")) return true; // tests/ outside src/
  return false;
}

async function main() {
  const files = await walk(SRC_DIR);
  const bypassHits = [];
  const countHits = [];

  for (const file of files) {
    const rel = relative(SRC_DIR, file);
    const src = await readFile(file, "utf8");

    // ── Check 1: direct writes to numbering_* tables from non-service code
    if (!isLegitimate(rel)) {
      NUMBERING_WRITE_RE.lastIndex = 0;
      let m;
      while ((m = NUMBERING_WRITE_RE.exec(src)) !== null) {
        // Skip matches inside single-line comments. Walk back from
        // the match to the previous newline and check for `//` after
        // optional whitespace (and before the match position).
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        const lineHeader = src.slice(lineStart, m.index);
        if (/^\s*\/\//.test(lineHeader)) continue;

        // Grab the surrounding statement (200 chars) to test the
        // allowed-linkback pattern. The matched .index points at the
        // start of `UPDATE`/`INSERT`; the statement continues until
        // the next backtick, so 200 chars is enough for the SET clause.
        const stmt = src.slice(m.index, m.index + 200);
        if (ALLOWED_LINKBACK_RE.test(stmt)) continue;

        bypassHits.push({
          file: rel,
          line: lineOf(src, m.index),
          table: m[1],
          snippet: src.slice(m.index, m.index + 80).replace(/\n/g, " "),
        });
      }
    }

    // ── Check 2: COUNT(*)-as-sequence / MAX(seq)+1 patterns
    // Only flag if the same file ALSO references one of the sequence
    // target columns (so SELECT COUNT(*) AS rowsActive doesn't fire).
    const fileMentionsTarget = SEQUENCE_TARGET_COLUMNS.some((col) =>
      new RegExp(`["']?${col}["']?`).test(src),
    );
    if (fileMentionsTarget) {
      // Look for COUNT(*) lines that are paired with a sequence target
      // mention within 240 chars (one logical block) and a `+ 1` near it.
      const countMatch = /SELECT\s+COUNT\s*\(\s*\*\s*\)::int[^;]{0,240}\+\s*1/gi;
      let m;
      while ((m = countMatch.exec(src)) !== null) {
        countHits.push({
          file: rel,
          line: lineOf(src, m.index),
          snippet: src.slice(m.index, m.index + 120).replace(/\s+/g, " "),
          pattern: "COUNT(*) + 1",
        });
      }
      MAX_PLUS_ONE_RE.lastIndex = 0;
      while ((m = MAX_PLUS_ONE_RE.exec(src)) !== null) {
        // Skip when the MAX is over a sequence column inside the service
        // (numberingService uses MAX("sequenceValue") legitimately during
        // backfill ratchet).
        if (rel === "lib/numberingService.ts" || rel === "lib/numberingBackfill.ts") {
          continue;
        }
        countHits.push({
          file: rel,
          line: lineOf(src, m.index),
          snippet: src.slice(m.index, m.index + 120).replace(/\s+/g, " "),
          pattern: "MAX(...)+1",
        });
      }
    }

    // ── Check 3: raw nextval('..._seq') outside the service
    // Allowed: numbering_* table id sequences (the migrations create
    // those and the bootstrap helpers exercise them); seed/bootstrap
    // helper files explicitly exempted via NEXTVAL_EXEMPT_FILES.
    if (!NEXTVAL_EXEMPT_FILES.has(rel) && rel !== "lib/numberingService.ts" && rel !== "lib/numberingBackfill.ts") {
      NEXTVAL_RE.lastIndex = 0;
      let m;
      while ((m = NEXTVAL_RE.exec(src)) !== null) {
        const seqName = m[1];
        if (ALLOWED_NEXTVAL_SEQUENCES.has(seqName)) continue;
        countHits.push({
          file: rel,
          line: lineOf(src, m.index),
          snippet: src.slice(m.index, m.index + 120).replace(/\s+/g, " "),
          pattern: `nextval('${seqName}')`,
        });
      }
    }
  }

  // ── Report ──
  console.log("");
  console.log("Numbering service-bypass audit — Issue #1141 stronger guard");
  console.log("");

  console.log(`Bypass check: direct writes to numbering_* tables from outside the service`);
  console.log(`  scanned: ${files.length} .ts files under src/`);
  console.log(`  legitimate writers: ${[...LEGITIMATE_WRITERS].join(", ")}`);
  if (bypassHits.length === 0) {
    console.log(`  ✓ no bypass writes detected.`);
  } else {
    console.log(`  ✗ ${bypassHits.length} bypass write(s) found:`);
    for (const h of bypassHits) {
      console.log(`    • ${h.file}:${h.line} → ${h.table}`);
      console.log(`        ${h.snippet}`);
    }
  }

  console.log("");
  console.log(`Sequence-reinvention check: COUNT(*)+1 / MAX(...)+1 next to a *Number column`);
  if (countHits.length === 0) {
    console.log(`  ✓ no reinvented-sequence patterns detected.`);
  } else {
    console.log(`  ⚠ ${countHits.length} reinvented-sequence hit(s):`);
    for (const h of countHits) {
      console.log(`    • ${h.file}:${h.line} [${h.pattern}]`);
      console.log(`        ${h.snippet}`);
    }
  }

  console.log("");
  if (bypassHits.length === 0 && countHits.length === 0) {
    console.log("✓ audit-numbering-service-bypass: every numbering_* write goes through the service, and no sequence reinvention detected.");
    process.exit(0);
  }
  console.error(
    "✗ audit-numbering-service-bypass: bypass routes the numbering center is the central authority for sequence allocation. Route any new sequence through numberingService.issueNumber.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("audit-numbering-service-bypass: fatal error", err);
  process.exit(2);
});
