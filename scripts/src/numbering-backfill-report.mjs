#!/usr/bin/env node
//
// scripts/src/numbering-backfill-report.mjs — Issue #1141 closure report.
//
// The engineering review correctly pointed out that previewBackfill +
// backfillScheme are TOOLS, not PROOF. This script runs `previewBackfill`
// against every active scheme in every company and produces a coverage
// matrix that an operator (or an auditor) can sign off on:
//
//   companyId  | scheme                  | table                 | refColumn   | pending | assigned
//   ---------- | ----------------------- | --------------------- | ----------- | ------- | --------
//   1          | hr.employee_contract    | employee_contracts    | ref         | 247     | 0
//   1          | finance.sales_invoice   | invoices              | ref         | 1832    | 0
//   1          | umrah.umrah_group       | umrah_groups          | internalRef | 0       | 0
//   ...
//
// Exits 0 when every scheme has either (pending=0, assigned≥1) — i.e.
// either no legacy data or fully backfilled — and prints a summary.
// Exits 1 when ANY scheme has pending>0 and assigned=0, which means
// legacy refs exist but have never been mirrored into the audit log.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/src/numbering-backfill-report.mjs
//   DATABASE_URL=postgres://... node scripts/src/numbering-backfill-report.mjs --json
//   DATABASE_URL=postgres://... node scripts/src/numbering-backfill-report.mjs --apply
//                              (also runs backfillScheme for every pending row)

import { spawnSync } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[numbering-backfill-report] ERROR — DATABASE_URL must be set.");
  process.exit(2);
}

const wantJson = process.argv.includes("--json");
const wantApply = process.argv.includes("--apply");

function psql(sql) {
  const res = spawnSync(
    "psql",
    [DATABASE_URL, "-At", "-c", sql.replace(/\s+/g, " ").trim()],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error("[numbering-backfill-report] psql failed:", res.stderr);
    process.exit(2);
  }
  return res.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|"));
}

const sanitiseIdent = (s) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(s)) {
    throw new Error(`unsafe identifier: ${s}`);
  }
  return s;
};

// 1. Load every active scheme + its (entity_table, ref_column) mapping.
const schemes = psql(`
  SELECT s.id,
         s."companyId",
         s."moduleKey",
         s."entityKey",
         s."defaultEntityTable",
         s."defaultRefColumn"
    FROM numbering_schemes s
   WHERE s."isActive" = true
     AND s."defaultEntityTable" IS NOT NULL
   ORDER BY s."companyId", s."moduleKey", s."entityKey";
`).map(([id, companyId, moduleKey, entityKey, table, refCol]) => ({
  id: Number(id),
  companyId: Number(companyId),
  moduleKey,
  entityKey,
  table,
  refCol: refCol || "ref",
}));

const rows = [];
for (const s of schemes) {
  let table, refCol;
  try {
    table = sanitiseIdent(s.table);
    refCol = sanitiseIdent(s.refCol);
  } catch (e) {
    rows.push({ ...s, error: e.message, pending: 0, assigned: 0 });
    continue;
  }

  // 2. Check the table + column actually exist (skip cleanly if not).
  const [[exists]] = psql(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='${table}' AND column_name='${refCol}'
    );`).length
    ? psql(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='${table}' AND column_name='${refCol}'
        );`)
    : [["f"]];
  if (exists !== "t") {
    rows.push({ ...s, error: `${table}.${refCol} missing`, pending: 0, assigned: 0 });
    continue;
  }

  // 3. Count assigned rows for this scheme.
  const [[assignedStr]] = psql(`
    SELECT COUNT(*)::text FROM numbering_assignments
     WHERE "companyId" = ${s.companyId}
       AND "moduleKey" = '${s.moduleKey.replace(/'/g, "''")}'
       AND "entityKey" = '${s.entityKey.replace(/'/g, "''")}'
       AND "entityTable" = '${table}';`);
  const assigned = Number(assignedStr ?? "0");

  // 4. Count rows in the entity table that carry a ref but have no
  //    matching assignment — same query shape as previewBackfill.
  const [[pendingStr]] = psql(`
    SELECT COUNT(*)::text
      FROM "${table}" t
      LEFT JOIN numbering_assignments a
             ON a."companyId"   = ${s.companyId}
            AND a."moduleKey"   = '${s.moduleKey.replace(/'/g, "''")}'
            AND a."entityKey"   = '${s.entityKey.replace(/'/g, "''")}'
            AND a."entityTable" = '${table}'
            AND a."entityId"    = t.id
     WHERE t."companyId" = ${s.companyId}
       AND t."${refCol}" IS NOT NULL
       AND length(trim(t."${refCol}"::text)) > 0
       AND a.id IS NULL;`);
  rows.push({ ...s, pending: Number(pendingStr ?? "0"), assigned });
}

// 5. Optionally apply (run backfillScheme for every row with pending>0).
let backfilledIds = [];
if (wantApply) {
  console.log("\n[numbering-backfill-report] --apply: running backfillScheme on every pending scheme…\n");
  const { backfillScheme } = await import("../../artifacts/api-server/src/lib/numberingBackfill.js");
  for (const r of rows.filter((x) => x.pending > 0)) {
    try {
      const summary = await backfillScheme({
        companyId: r.companyId,
        schemeId: r.id,
        actorId: null,
      });
      console.log(`  ✓ scheme #${r.id} ${r.moduleKey}.${r.entityKey} — imported ${summary.imported}, unparseable ${summary.unparseableSequence}, next seq ${summary.nextSequenceAfterBackfill}`);
      backfilledIds.push(r.id);
    } catch (e) {
      console.error(`  ✗ scheme #${r.id} ${r.moduleKey}.${r.entityKey} — ${e.message}`);
    }
  }
  console.log("");
}

// 6. Output.
if (wantJson) {
  console.log(JSON.stringify({ schemes: rows, backfilledIds, generatedAt: new Date().toISOString() }, null, 2));
} else {
  console.log("");
  console.log("Numbering backfill coverage report (#1141)");
  console.log("");
  const widthScheme = Math.max(20, ...rows.map((r) => `${r.moduleKey}.${r.entityKey}`.length));
  const widthTable = Math.max(15, ...rows.map((r) => (r.table || "").length));
  console.log(
    "  co | " +
    "scheme".padEnd(widthScheme) + " | " +
    "table".padEnd(widthTable) + " | " +
    "refCol".padEnd(12) + " | pending | assigned | status",
  );
  console.log("  " + "-".repeat(widthScheme + widthTable + 60));
  for (const r of rows) {
    const status = r.error
      ? `⚠ ${r.error}`
      : r.pending > 0 && r.assigned === 0
        ? "✗ legacy refs unimported"
        : r.pending > 0
          ? `⚠ partially imported (${r.pending} pending)`
          : "✓ clean";
    console.log(
      `  ${String(r.companyId).padStart(2)} | ` +
      `${r.moduleKey}.${r.entityKey}`.padEnd(widthScheme) + " | " +
      (r.table || "").padEnd(widthTable) + " | " +
      r.refCol.padEnd(12) + " | " +
      String(r.pending).padStart(7) + " | " +
      String(r.assigned).padStart(8) + " | " +
      status,
    );
  }
  console.log("");
  const drift = rows.filter((r) => r.pending > 0 && r.assigned === 0);
  const partial = rows.filter((r) => r.pending > 0 && r.assigned > 0);
  console.log(`  Summary: ${rows.length} schemes scanned, ${rows.length - drift.length - partial.length} clean, ${partial.length} partial, ${drift.length} drift.`);
  console.log("");
}

const drift = rows.filter((r) => r.pending > 0 && r.assigned === 0);
if (drift.length > 0 && !wantApply) {
  console.error(`  ✗ ${drift.length} scheme(s) have legacy refs that have NEVER been inventoried.`);
  console.error(`  Run with --apply to backfill them, or via the admin UI's "جرد المعاملات السابقة" button.`);
  process.exit(1);
}
process.exit(0);
