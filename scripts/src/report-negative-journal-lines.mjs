#!/usr/bin/env node
//
// scripts/src/report-negative-journal-lines.mjs
//
// Read-only diagnostic (NOT a CI gate). Quantifies historical journal_lines
// that store a NEGATIVE debit or credit — the rows that predate the central
// sign-normalization landed in createJournalEntry (businessHelpers.ts). New
// postings can no longer store negatives; this report tells us how many old
// rows exist and which flows produced them, so a follow-up data-fix batch can
// be scoped (or shown to be unnecessary).
//
// It is intentionally report-only: it ALWAYS exits 0 and never mutates
// anything. Run it manually against an environment that has DATABASE_URL:
//
//   DATABASE_URL=postgres://… node scripts/src/report-negative-journal-lines.mjs
//
// Why not a guard: failing CI on pre-existing historical rows would block every
// merge for a condition the engine fix already prevents going forward. Cleanup
// of the historical rows is a separate, explicitly-approved data-fix decision.
//
import { spawnSync } from "node:child_process";

// Pure formatter — kept separate so it is unit-testable without a DB.
// Input: rows of { sourceType, lines, negDebit, negCredit }. Output: a
// human-readable report string.
export function formatReport(rows) {
  if (!rows || rows.length === 0) {
    return "[report:negative-journal-lines] OK — zero journal_lines store a negative debit/credit.";
  }
  const totalLines = rows.reduce((s, r) => s + Number(r.lines || 0), 0);
  const totalNegDebit = rows.reduce((s, r) => s + Number(r.negDebit || 0), 0);
  const totalNegCredit = rows.reduce((s, r) => s + Number(r.negCredit || 0), 0);
  const header =
    `[report:negative-journal-lines] FOUND ${totalLines} negative line(s) ` +
    `(${totalNegDebit} negative-debit, ${totalNegCredit} negative-credit) across ` +
    `${rows.length} source type(s):\n`;
  const body = rows
    .map(
      (r) =>
        `  ${String(r.sourceType ?? "(null)").padEnd(28)} ` +
        `lines=${String(r.lines).padStart(6)}  ` +
        `negDebit=${String(r.negDebit).padStart(6)}  ` +
        `negCredit=${String(r.negCredit).padStart(6)}`,
    )
    .join("\n");
  const footer =
    "\n\nThese rows predate the createJournalEntry sign-normalization. New " +
    "postings are already normalized; cleaning these up is an optional, " +
    "separately-approved data-fix batch.";
  return header + body + footer;
}

// Parse psql -At (tab-separated, unaligned) output into row objects.
export function parsePsqlRows(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const [sourceType, lines, negDebit, negCredit] = t.split("\t");
    rows.push({ sourceType, lines: Number(lines), negDebit: Number(negDebit), negCredit: Number(negCredit) });
  }
  return rows;
}

const QUERY = `
  SELECT COALESCE(je."sourceType", '(null)') AS source_type,
         COUNT(*) AS lines,
         COUNT(*) FILTER (WHERE jl.debit < 0) AS neg_debit,
         COUNT(*) FILTER (WHERE jl.credit < 0) AS neg_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl."journalId"
   WHERE (jl.debit < 0 OR jl.credit < 0)
     AND jl."deletedAt" IS NULL
     AND je."deletedAt" IS NULL
   GROUP BY je."sourceType"
   ORDER BY lines DESC;
`;

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      "[report:negative-journal-lines] DATABASE_URL not set — this is a read-only " +
        "diagnostic; run it against an environment with a database. Exiting 0.",
    );
    process.exit(0);
  }
  const res = spawnSync("psql", [url, "-Atqc", QUERY.replace(/\s+/g, " ").trim()], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("[report:negative-journal-lines] psql failed:");
    console.error(res.stderr || res.stdout);
    // Report-only: do not fail callers' pipelines on a diagnostic.
    process.exit(0);
  }
  console.log(formatReport(parsePsqlRows(res.stdout)));
  process.exit(0);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "");
if (isDirectRun) main();
