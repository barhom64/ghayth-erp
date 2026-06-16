#!/usr/bin/env node
//
// scripts/src/check-sql-ambiguity.test.mjs
//
// Pure-logic fixtures for the ambiguous-column scanner. Exercises scope
// decomposition, shared-column detection, alias/output-alias handling,
// quoted vs unquoted refs, self-joins, and ORDER BY / GROUP BY alias
// resolution without needing a live DB — the helpers take a fixture
// `tableColumns` Map.
//
// Run:  node scripts/src/check-sql-ambiguity.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import {
  replaceInterpolations,
  extractScopes,
  splitSetOpBranches,
  computeSharedColumns,
  extractOutputAliases,
  isInOrderOrGroupRegion,
  findAmbiguousRefs,
  findMissingQualifiedColumns,
  collectSqlFragmentVars,
  inlineFragments,
  splitHandlerSlices,
  analyzeBody,
} from "./check-sql-ambiguity.mjs";
import { extractRawQueryBodies } from "./lib/raw-query-bodies.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// Fixture schema mirroring the real evaluation surface: evaluation_cycles
// and employees both have `status` (+ id, companyId); evaluation_summaries
// shares cycleId/id but NOT status.
const tableColumns = new Map([
  [
    "evaluation_cycles",
    new Set(["id", "companyId", "employeeId", "status", "period", "startDate", "createdAt"]),
  ],
  ["employees", new Set(["id", "companyId", "name", "status", "empNumber", "createdAt"])],
  ["evaluation_summaries", new Set(["id", "cycleId", "finalScore"])],
  [
    "employee_assignments",
    new Set(["id", "companyId", "branchId", "employeeId", "status", "isPrimary"]),
  ],
  ["tasks", new Set(["id", "companyId", "branchId", "status", "title"])],
  // goods_receipts deliberately has NO `status` column (mirrors the real
  // table) — used to exercise the missing-qualified-column detector.
  [
    "goods_receipts",
    new Set(["id", "companyId", "ref", "journalId", "createdAt", "deletedAt"]),
  ],
  ["goods_receipt_items", new Set(["id", "grnId", "itemName", "lineTotal"])],
]);

const cols = (f) => f.map((x) => x.col).sort();

// ── replaceInterpolations ─────────────────────────────────────────────
console.log("replaceInterpolations");
assert(
  replaceInterpolations("WHERE a=$1 ${cond ? 'AND b' : ''} ORDER BY c") ===
    "WHERE a=$1  _interp_  ORDER BY c",
  "collapses a ${…} fragment to a neutral placeholder",
);
assert(
  replaceInterpolations("a ${ f(`${x}`) } b").includes("_interp_") &&
    !replaceInterpolations("a ${ f(`${x}`) } b").includes("x"),
  "handles nested braces in the interpolation",
);

// ── extractScopes ─────────────────────────────────────────────────────
console.log("extractScopes");
{
  const scopes = extractScopes(
    "SELECT * FROM a WHERE EXISTS (SELECT 1 FROM b JOIN c ON c.id=b.id)",
  );
  assert(scopes.length === 2, "splits an EXISTS subquery into its own scope");
  assert(
    scopes.some((s) => /\(\)/.test(s) && /FROM a/.test(s)),
    "outer scope keeps FROM a and masks the subquery as ()",
  );
  assert(
    scopes.some((s) => /FROM b JOIN c/.test(s) && !/FROM a/.test(s)),
    "inner scope carries the subquery FROM b JOIN c",
  );
}
assert(
  extractScopes("SELECT COUNT(status) FROM a JOIN b ON a.id=b.id").length === 1,
  "function-call parens are NOT treated as a subquery",
);

// ── splitSetOpBranches ────────────────────────────────────────────────
console.log("splitSetOpBranches");
{
  const branches = splitSetOpBranches(
    "SELECT id FROM cost_centers WHERE parentId IS NULL UNION ALL SELECT c.id FROM cost_centers c JOIN tree t ON c.parentId=t.id",
  );
  assert(branches.length === 2, "splits a UNION ALL into two branches");
  assert(
    /FROM cost_centers WHERE/.test(branches[0]) && !/JOIN tree/.test(branches[0]),
    "anchor branch carries only its single-table FROM",
  );
  assert(
    /JOIN tree/.test(branches[1]) && !/parentId IS NULL/.test(branches[1]),
    "recursive branch carries only the self-join",
  );
}
assert(
  splitSetOpBranches("SELECT a FROM x INTERSECT SELECT b FROM y").length === 2,
  "splits INTERSECT",
);
assert(
  splitSetOpBranches("SELECT a FROM x EXCEPT ALL SELECT b FROM y").length === 2,
  "splits EXCEPT ALL",
);
assert(
  splitSetOpBranches("SELECT a FROM x JOIN y ON x.id=y.id").length === 1,
  "a non-set-op scope stays a single branch",
);

// ── computeSharedColumns ──────────────────────────────────────────────
console.log("computeSharedColumns");
{
  const shared = computeSharedColumns(
    ["evaluation_cycles", "employees"],
    tableColumns,
  );
  assert(shared.has("status"), "status is shared by cycles + employees");
  assert(shared.has("id") && shared.has("companyId"), "id/companyId shared too");
  assert(!shared.has("period"), "period (only on cycles) is not shared");
}
{
  const shared = computeSharedColumns(
    ["evaluation_cycles", "evaluation_summaries"],
    tableColumns,
  );
  assert(!shared.has("status"), "status NOT shared (summaries has no status)");
  assert(shared.has("id"), "id still shared by cycles + summaries");
}
{
  // Self-join: same table twice → all its columns shared.
  const shared = computeSharedColumns(
    ["employee_assignments", "employee_assignments"],
    tableColumns,
  );
  assert(shared.has("status"), "self-join makes status shared");
}

// ── extractOutputAliases / isInOrderOrGroupRegion ─────────────────────
console.log("extractOutputAliases / isInOrderOrGroupRegion");
{
  const s = `SELECT e.status AS status, c.id AS "cycleId" FROM employees e`;
  const a = extractOutputAliases(s);
  assert(a.has("status") && a.has("cycleId"), "captures AS name and AS \"name\"");
}
{
  const s = "SELECT a.x FROM a JOIN b ON a.id=b.id ORDER BY status";
  const idx = s.indexOf("status");
  assert(isInOrderOrGroupRegion(s, idx), "detects ORDER BY region");
  const w = "SELECT a.x FROM a JOIN b ON a.id=b.id WHERE status='x'";
  assert(
    !isInOrderOrGroupRegion(w, w.indexOf("status")),
    "WHERE region is not order/group",
  );
}

// ── findAmbiguousRefs: the core bug class ─────────────────────────────
console.log("findAmbiguousRefs — flags the real bug class");
assert(
  findAmbiguousRefs(
    "SELECT id, status FROM evaluation_cycles ec JOIN employees e ON e.id=ec.employeeId",
    tableColumns,
  ).some((f) => f.col === "status" && f.kind === "unquoted"),
  "flags bare unquoted `status` across cycles+employees JOIN",
);
assert(
  findAmbiguousRefs(
    `SELECT "companyId" FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`,
    tableColumns,
  ).some((f) => f.col === "companyId" && f.kind === "quoted"),
  'flags bare quoted "companyId" across a JOIN',
);
assert(
  findAmbiguousRefs(
    "SELECT 1 FROM employee_assignments ea JOIN employee_assignments ea2 ON ea2.branchId=ea.branchId WHERE status='active'",
    tableColumns,
  ).some((f) => f.col === "status"),
  "flags bare `status` in a self-join",
);

console.log("findAmbiguousRefs — does NOT flag safe queries");
assert(
  findAmbiguousRefs(
    `SELECT ec.id, ec.status FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`,
    tableColumns,
  ).length === 0,
  "qualified ec.status / ec.id are clean",
);
assert(
  findAmbiguousRefs(
    "SELECT id, status FROM evaluation_cycles WHERE companyId=$1",
    tableColumns,
  ).length === 0,
  "single-table bare refs are out of scope (no JOIN)",
);
assert(
  findAmbiguousRefs(
    "SELECT ec.status FROM evaluation_cycles ec LEFT JOIN evaluation_summaries es ON es.cycleId=ec.id WHERE status='x'",
    tableColumns,
  ).length === 0,
  "bare `status` is fine when only one joined relation has status",
);
assert(
  findAmbiguousRefs(
    "SELECT e.status AS status FROM employees e JOIN tasks t ON t.id=e.id ORDER BY status",
    tableColumns,
  ).length === 0,
  "bare `status` in ORDER BY resolves to the output alias (not ambiguous)",
);
assert(
  findAmbiguousRefs(
    "SELECT t.id AS taskId FROM tasks t JOIN employees e ON e.id=t.id",
    tableColumns,
  ).length === 0,
  "`AS taskId` alias definition is not a column reference",
);
assert(
  findAmbiguousRefs(
    `SELECT ec."createdAt" AS "createdAt" FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`,
    tableColumns,
  ).length === 0,
  '`AS "createdAt"` quoted alias definition is not a column reference (the Task #500 false hit)',
);
assert(
  findAmbiguousRefs(
    `SELECT e.status AS "status" FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`,
    tableColumns,
  ).length === 0,
  'quoted `AS "status"` on a qualified expr is clean',
);
assert(
  findAmbiguousRefs(
    `SELECT "status" AS "status" FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`,
    tableColumns,
  ).some((f) => f.col === "status" && f.kind === "quoted"),
  'bare quoted "status" BEFORE an `AS "status"` is still flagged (only the alias def is skipped)',
);

// ── analyzeBody: end-to-end with interpolation ────────────────────────
console.log("analyzeBody — end-to-end");
assert(
  analyzeBody(
    'SELECT id FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId" WHERE ec."companyId"=$1 ${cond}',
    tableColumns,
  ).some((f) => f.col === "id"),
  "flags bare `id` even with a trailing ${…} interpolation",
);
assert(
  analyzeBody(
    'SELECT ec.id FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId" WHERE ec."companyId"=$1 ${employeeId ? `AND ec."employeeId"=$2` : ""}',
    tableColumns,
  ).length === 0,
  "the real evaluation-cycles list query (fully qualified) is clean",
);
assert(
  analyzeBody(
    `WITH RECURSIVE tree AS (
       SELECT id, status FROM employee_assignments WHERE "branchId" IS NULL
       UNION ALL
       SELECT ea.id, ea.status FROM employee_assignments ea JOIN tree t ON ea."branchId" = t.id
     ) SELECT * FROM tree`,
    tableColumns,
  ).length === 0,
  "recursive-CTE single-table anchor is NOT flagged (branches scoped separately)",
);
assert(
  analyzeBody(
    `WITH RECURSIVE tree AS (
       SELECT id FROM employee_assignments WHERE "branchId" IS NULL
       UNION ALL
       SELECT a.id FROM employee_assignments a JOIN employee_assignments b ON a."branchId" = b.id WHERE status = 'x'
     ) SELECT * FROM tree`,
    tableColumns,
  ).some((f) => f.type === "ambiguous" && f.col === "status"),
  "but a genuinely-bare `status` in the self-joining recursive branch is still flagged",
);
assert(
  analyzeBody(
    `SELECT ec."createdAt" AS "createdAt" FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`,
    tableColumns,
  ).length === 0,
  'analyzeBody: `AS "createdAt"` alias definition is clean end-to-end (retires the Task #500 allowlist)',
);

// ── findMissingQualifiedColumns: the `column "x.y" does not exist` class ─
console.log("findMissingQualifiedColumns — flags qualified refs to missing cols");
assert(
  findMissingQualifiedColumns(
    `SELECT gri.id, grn.ref, grn.status FROM goods_receipt_items gri JOIN goods_receipts grn ON grn.id = gri."grnId"`,
    tableColumns,
  ).some((f) => f.qual === "grn" && f.col === "status"),
  "flags grn.status (goods_receipts has no status column)",
);
assert(
  findMissingQualifiedColumns(
    `SELECT grn."receiptStatus" FROM goods_receipts grn`,
    tableColumns,
  ).some((f) => f.col === "receiptStatus" && f.quoted),
  'flags quoted grn."receiptStatus" (nonexistent)',
);
assert(
  findMissingQualifiedColumns(
    `SELECT grn.createdAt FROM goods_receipts grn`,
    tableColumns,
  ).some((f) => f.col === "createdAt"),
  "flags unquoted grn.createdAt (camelCase col must be quoted → folds to nonexistent createdat)",
);

console.log("findMissingQualifiedColumns — does NOT flag valid refs");
assert(
  findMissingQualifiedColumns(
    `SELECT grn.id, grn.ref, grn."journalId", gri."grnId", gri."itemName" FROM goods_receipt_items gri JOIN goods_receipts grn ON grn.id = gri."grnId"`,
    tableColumns,
  ).length === 0,
  "all existing qualified refs are clean",
);
assert(
  findMissingQualifiedColumns(
    `SELECT cte.anything, sub.whatever FROM some_cte cte JOIN (SELECT 1 AS whatever) sub ON true`,
    tableColumns,
  ).length === 0,
  "unknown qualifiers (CTE / subquery alias) are skipped — accepted blind spot",
);
assert(
  findMissingQualifiedColumns(
    `SELECT c.column_name FROM information_schema.columns c`,
    tableColumns,
  ).length === 0,
  "information_schema/pg_catalog aliases are skipped (not public tables)",
);
assert(
  findMissingQualifiedColumns(
    `SELECT grn.${"_interp_"} FROM goods_receipts grn`,
    tableColumns,
  ).length === 0,
  "alias.${…} (collapsed to alias._interp_) is skipped — runtime-injected col, not a missing-column finding",
);
assert(
  findMissingQualifiedColumns(
    `SELECT CASE WHEN grn."journalId" IS NOT NULL THEN 'posted' ELSE 'received' END AS status FROM goods_receipts grn`,
    tableColumns,
  ).length === 0,
  "the actual fix (derived CASE status from journalId) is clean",
);

console.log("analyzeBody — surfaces missing-column findings end-to-end");
assert(
  analyzeBody(
    `SELECT grn.ref, grn.status FROM goods_receipt_items gri JOIN goods_receipts grn ON grn.id = gri."grnId" WHERE grn."companyId" = $1`,
    tableColumns,
  ).some((f) => f.type === "missing" && f.col === "grn.status"),
  "analyzeBody tags grn.status as a missing-column finding",
);

// ── collectSqlFragmentVars + inlineFragments + analyzeBody: the fragment
//    blind-spot. The `je."postingDate"` 500 lived in a SQL fragment built
//    OUTSIDE the rawQuery template and spliced in via `${dateFilter}`. The
//    safe fix is to INLINE that fragment back into the body so the proven
//    per-scope resolver sees it next to the FROM/JOIN that binds the alias.
const fragSchema = new Map([
  ["journal_entries", new Set(["id", "companyId", "date", "ref", "sourceType"])],
  ["journal_lines", new Set(["id", "journalId", "accountCode", "debit", "credit"])],
  ["wht_categories", new Set(["id", "companyId", "code", "name", "appliesTo"])],
  ["warehouse_categories", new Set(["id", "companyId", "name", "parentId"])],
]);

console.log("collectSqlFragmentVars — accumulates SQL-looking fragment literals");
{
  const source = [
    'let dateFilter = "";',
    'if (startDate) dateFilter += ` AND je."date" >= $1`;',
    'if (endDate)   dateFilter += ` AND je."postingDate" < ($2::date + 1)`;',
    'let html = `<div>nope</div>`;', // non-SQL fragment must be ignored
  ].join("\n");
  const m = collectSqlFragmentVars(source);
  assert(m.has("dateFilter"), "captures the dateFilter SQL fragment var");
  assert(
    /je\."date"/.test(m.get("dateFilter")) && /je\."postingDate"/.test(m.get("dateFilter")),
    "unions every appended literal for the var",
  );
  assert(!m.has("html"), "non-SQL template var (html) is ignored");
}

console.log("inlineFragments — splices fragments into their ${var} site");
{
  const map = new Map([["dateFilter", ' AND je."postingDate" < $1']]);
  const out = inlineFragments("SELECT je.ref FROM journal_entries je ${dateFilter}", map);
  assert(/je\."postingDate"/.test(out), "fragment text replaces the interpolation");
  // Unknown vars are left for the _interp_ placeholder.
  const out2 = inlineFragments("WHERE x = ${unknownVar}", map);
  assert(out2.includes("${unknownVar}"), "unknown interpolation left untouched");
}

console.log("analyzeBody (with fragMap) — catches fragment-built missing column");
{
  // The bug: je."postingDate" appended to dateFilter, body binds je.
  const fragMap = collectSqlFragmentVars(
    'let dateFilter=""; if(e) dateFilter += ` AND je."postingDate" < $1`;',
  );
  const body = 'SELECT je.ref FROM journal_entries je WHERE 1=1 ${dateFilter}';
  assert(
    analyzeBody(body, fragSchema, fragMap).some(
      (f) => f.type === "missing" && f.col === "je.postingDate",
    ),
    'flags je."postingDate" once the fragment is inlined into a je-bound body',
  );
}
{
  // The fix (je."date") inlines clean — no finding.
  const fragMap = collectSqlFragmentVars(
    'let dateFilter=""; if(e) dateFilter += ` AND je."date" < $1`;',
  );
  const body = 'SELECT je.ref FROM journal_entries je WHERE 1=1 ${dateFilter}';
  assert(
    analyzeBody(body, fragSchema, fragMap).length === 0,
    'je."date" (the fix) inlines clean',
  );
}
{
  // No false positive on a reused alias: cat = wht_categories HERE (has
  // appliesTo) even though elsewhere cat = warehouse_categories. The ref
  // lives in the template, resolves in its OWN scope — never flagged.
  const body =
    'SELECT cat."appliesTo" FROM wht_categories cat WHERE cat."companyId" = $1';
  assert(
    analyzeBody(body, fragSchema, {}).every((f) => f.col !== "cat.appliesTo"),
    'cat."appliesTo" against wht_categories is NOT a false positive',
  );
}

console.log("splitHandlerSlices — isolates fragments per route handler");
{
  // `where` is reused in two handlers binding `m` to DIFFERENT tables.
  // File-wide union would inject `m."driverId"` (cargo) into the
  // fleet_maintenance body and flag it — a false positive. Per-handler
  // slicing keeps each fragment with its own body.
  const source = [
    'router.get("/manifests", h, async (req, res) => {',
    '  let where = `m."driverId" = $1`;',
    '  await rawQuery(`SELECT m.* FROM cargo_manifests m WHERE ${where}`);',
    "});",
    'router.get("/maint", h, async (req, res) => {',
    '  let where = `m.description ILIKE $1`;',
    '  await rawQuery(`SELECT m.* FROM fleet_maintenance m WHERE ${where}`);',
    "});",
  ].join("\n");
  const slices = splitHandlerSlices(source);
  assert(slices.length === 2, "splits into one slice per router handler");
  const schema = new Map([
    ["cargo_manifests", new Set(["id", "driverId", "companyId"])], // has driverId, NOT description
    ["fleet_maintenance", new Set(["id", "description", "companyId"])], // has description, NOT driverId
  ]);
  const findings = [];
  for (const slice of slices) {
    const fragMap = collectSqlFragmentVars(slice);
    for (const m of slice.matchAll(/rawQuery\(`([^`]*)`/g)) {
      for (const f of analyzeBody(m[1], schema, fragMap)) findings.push(f);
    }
  }
  assert(
    findings.length === 0,
    "per-handler scoping yields NO false positive on reused `where`/`m`",
  );
}

console.log("splitHandlerSlices — recognizes non-`router` Router identifiers");
{
  // Real route modules name their Router instance variously (reportsRouter,
  // accountsRouter, journalRouter, …). A boundary regex anchored to the
  // literal `router` collapses these files into a single slice, letting a
  // fragment var reused across handlers (`where` here, binding `m` to two
  // DIFFERENT tables) bleed and produce a false positive. Slicing must key
  // off any `*Router`/`router` identifier.
  const source = [
    'reportsRouter.get("/a", h, async (req, res) => {',
    '  let where = `m."driverId" = $1`;',
    '  await rawQuery(`SELECT m.* FROM cargo_manifests m WHERE ${where}`);',
    "});",
    'reportsRouter.get("/b", h, async (req, res) => {',
    '  let where = `m.description ILIKE $1`;',
    '  await rawQuery(`SELECT m.* FROM fleet_maintenance m WHERE ${where}`);',
    "});",
  ].join("\n");
  const slices = splitHandlerSlices(source);
  assert(slices.length === 2, "splits `reportsRouter`-named handlers per slice");
  const schema = new Map([
    ["cargo_manifests", new Set(["id", "driverId", "companyId"])],
    ["fleet_maintenance", new Set(["id", "description", "companyId"])],
  ]);
  const findings = [];
  for (const slice of slices) {
    const fragMap = collectSqlFragmentVars(slice);
    for (const m of slice.matchAll(/rawQuery\(`([^`]*)`/g)) {
      for (const f of analyzeBody(m[1], schema, fragMap)) findings.push(f);
    }
  }
  assert(
    findings.length === 0,
    "non-`router` Router names get per-handler scoping (NO false positive)",
  );
}

// Regression guard for the silent typed-call skip (Task #490 sibling): a
// rawQuery written with an inline — even NESTED — generic type argument
// must be EXTRACTED and analysed. A bare-ambiguous and a missing-qualified
// reference inside such a typed call must both surface; if the shared
// extractor silently skipped the typed body, analyzeBody would never see
// it and the parse-time 500 would ship unscanned.
console.log("typed rawQuery<…> bodies are scanned for ambiguity / missing cols");
{
  const src =
    'await rawQuery<Record<string, unknown>>(`SELECT id, status FROM evaluation_cycles ec JOIN employees e ON e.id=ec."employeeId"`);';
  const bodies = extractRawQueryBodies(src);
  assert(
    bodies.length === 1,
    "extracts the nested-generic typed rawQuery body",
  );
  assert(
    analyzeBody(bodies[0], tableColumns).some(
      (f) => f.type === "ambiguous" && f.col === "status",
    ),
    "flags bare `status` ambiguity inside a typed rawQuery<…> call",
  );
}
{
  const src =
    'await rawQuery<Row>(`SELECT grn.status FROM goods_receipt_items gri JOIN goods_receipts grn ON grn.id = gri."grnId"`);';
  const bodies = extractRawQueryBodies(src);
  assert(
    analyzeBody(bodies[0], tableColumns).some(
      (f) => f.type === "missing" && f.col === "grn.status",
    ),
    "flags missing grn.status inside a typed rawQuery<Row> call",
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll check-sql-ambiguity fixtures passed.");
process.exit(0);
