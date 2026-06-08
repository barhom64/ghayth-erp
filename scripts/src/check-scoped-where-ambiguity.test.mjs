#!/usr/bin/env node
//
// scripts/src/check-scoped-where-ambiguity.test.mjs
//
// Pure-logic fixtures for the scoped-where ambiguity scanner. Exercises
// option parsing, alias detection, bare-column derivation, hole tagging,
// and the end-to-end body analysis — all without a live DB, using a
// fixture `tableColumns` Map.
//
// Run:  node scripts/src/check-scoped-where-ambiguity.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import {
  columnIsAliased,
  parseScopedOptions,
  bareScopeColumns,
  scopeAmbiguousColumns,
  tagScopedHoles,
  analyzeBodyScoped,
  analyzeScopedHelperBody,
  readSqlLiteralArg,
  findRawQueryBodies,
} from "./check-scoped-where-ambiguity.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

const eqSet = (s, arr) => s.size === arr.length && arr.every((x) => s.has(x));
const cols = (f) => [...new Set(f.map((x) => x.col))].sort();

// Fixture schema: tasks + employee_assignments + employees all carry
// companyId; tasks & employee_assignments carry branchId; tasks &
// employees carry deletedAt. invoices is the lone single-table case.
const tableColumns = new Map([
  ["tasks", new Set(["id", "companyId", "branchId", "status", "deletedAt"])],
  [
    "employee_assignments",
    new Set(["id", "companyId", "branchId", "employeeId", "status"]),
  ],
  ["employees", new Set(["id", "companyId", "name", "deletedAt"])],
  ["invoices", new Set(["id", "companyId", "status", "dueDate", "deletedAt"])],
]);

// ── columnIsAliased ───────────────────────────────────────────────────
console.log("columnIsAliased");
assert(
  columnIsAliased('t."companyId"'),
  'alias-qualified t."companyId" → true',
);
assert(columnIsAliased("ea.companyId"), "alias-qualified ea.companyId → true");
assert(!columnIsAliased('"companyId"'), 'bare "companyId" → false');
assert(!columnIsAliased("companyId"), "bare companyId → false");

// ── parseScopedOptions ────────────────────────────────────────────────
console.log("parseScopedOptions");
{
  const o = parseScopedOptions(
    `{ companyColumn: 't."companyId"', branchColumn: 't."branchId"', enforceBranchScope: true }`,
  );
  assert(o.companyColumn === 't."companyId"', "extracts aliased companyColumn");
  assert(o.branchColumn === 't."branchId"', "extracts aliased branchColumn");
  assert(o.enforceBranchScope === true, "extracts enforceBranchScope: true");
}
{
  const o = parseScopedOptions(`{ disableBranchScope: true }`);
  assert(o.disableBranchScope === true, "extracts disableBranchScope: true");
  assert(o.companyColumn === undefined, "absent companyColumn → undefined");
}
{
  const o = parseScopedOptions(`{ softDeleteColumn: '"deletedAt"' }`);
  assert(
    o.softDeleteColumn === '"deletedAt"',
    "extracts bare softDeleteColumn",
  );
}
assert(
  Object.keys(parseScopedOptions("")).length === 0,
  "empty options text → {}",
);

// ── bareScopeColumns ──────────────────────────────────────────────────
console.log("bareScopeColumns");
assert(
  eqSet(bareScopeColumns({}, "buildScopedWhere"), ["companyId", "branchId"]),
  "no options → bare companyId + branchId (deletedAt only with softDeleteColumn)",
);
assert(
  eqSet(
    bareScopeColumns(
      { companyColumn: 't."companyId"', branchColumn: 't."branchId"' },
      "buildScopedWhere",
    ),
    [],
  ),
  "both columns aliased → nothing bare",
);
assert(
  eqSet(
    bareScopeColumns({ companyColumn: '"companyId"' }, "buildScopedWhere"),
    ["companyId", "branchId"],
  ),
  "explicit bare companyColumn is still bare",
);
assert(
  eqSet(bareScopeColumns({ disableBranchScope: true }, "buildScopedWhere"), [
    "companyId",
  ]),
  "disableBranchScope drops branchId",
);
assert(
  eqSet(bareScopeColumns({}, "buildFilterNoBranch"), ["companyId"]),
  "NoBranch wrapper name drops branchId",
);
assert(
  eqSet(
    bareScopeColumns({ softDeleteColumn: '"deletedAt"' }, "buildScopedWhere"),
    ["companyId", "branchId", "deletedAt"],
  ),
  "bare softDeleteColumn adds deletedAt",
);
assert(
  eqSet(
    bareScopeColumns(
      { softDeleteColumn: 'po."deletedAt"' },
      "buildScopedWhere",
    ),
    ["companyId", "branchId"],
  ),
  "aliased softDeleteColumn does NOT add deletedAt",
);

// ── scopeAmbiguousColumns ─────────────────────────────────────────────
console.log("scopeAmbiguousColumns");
{
  const scope =
    "SELECT t.id FROM tasks t JOIN employee_assignments ea ON ea.id = t.x WHERE _swhole_0_";
  assert(
    scopeAmbiguousColumns(scope, new Set(["companyId"]), tableColumns)[0] ===
      "companyId",
    "bare companyId shared by tasks + employee_assignments → flagged",
  );
  assert(
    scopeAmbiguousColumns(scope, new Set(["branchId"]), tableColumns)[0] ===
      "branchId",
    "bare branchId shared by tasks + employee_assignments → flagged",
  );
}
{
  // employees has no branchId, so a tasks⋈employees join shares only
  // companyId + deletedAt, not branchId.
  const scope =
    "SELECT t.id FROM tasks t JOIN employees e ON e.id = t.x WHERE _swhole_0_";
  assert(
    scopeAmbiguousColumns(scope, new Set(["branchId"]), tableColumns).length ===
      0,
    "branchId not shared (employees lacks it) → not flagged",
  );
  assert(
    scopeAmbiguousColumns(scope, new Set(["deletedAt"]), tableColumns)[0] ===
      "deletedAt",
    "bare deletedAt shared by tasks + employees → flagged",
  );
}
{
  const single = "SELECT id FROM invoices WHERE _swhole_0_";
  assert(
    scopeAmbiguousColumns(single, new Set(["companyId"]), tableColumns)
      .length === 0,
    "single-table query → never ambiguous",
  );
}
assert(
  scopeAmbiguousColumns(
    "SELECT t.id FROM tasks t JOIN employees e ON e.id=t.x WHERE _swhole_0_",
    new Set(),
    tableColumns,
  ).length === 0,
  "empty bareCols (all aliased) → nothing flagged",
);

// ── tagScopedHoles ────────────────────────────────────────────────────
console.log("tagScopedHoles");
{
  const map = new Map([["tw", new Set(["companyId"])]]);
  const { text, holes } = tagScopedHoles(
    "WHERE ${tw} AND x=$1 ${cond ? 'AND y' : ''}",
    map,
  );
  assert(holes.length === 1, "one scope-where hole recorded");
  assert(eqSet(holes[0], ["companyId"]), "hole carries tw's bare columns");
  assert(
    text.includes("_swhole_0_") && text.includes("_interp_"),
    "scope-where hole → _swhole_, other interpolation → _interp_",
  );
}
{
  // A property access like obj.where must NOT match the where variable.
  const map = new Map([["where", new Set(["companyId"])]]);
  const { holes } = tagScopedHoles("SELECT ${row.where} FROM t", map);
  assert(holes.length === 0, "dotted member .where is not the where variable");
}

// ── analyzeBodyScoped (end-to-end body) ───────────────────────────────
console.log("analyzeBodyScoped");
{
  // Bare where spliced into a tasks⋈employee_assignments join → both
  // companyId and branchId ambiguous.
  const body = `SELECT t.id
     FROM tasks t
     JOIN employee_assignments ea ON ea.id = t."assignedTo"
     WHERE \${where} AND t."scheduledDate" = $1`;
  const map = new Map([["where", new Set(["companyId", "branchId"])]]);
  assert(
    JSON.stringify(cols(analyzeBodyScoped(body, map, tableColumns))) ===
      JSON.stringify(["branchId", "companyId"]),
    "bare where in multi-table join → companyId + branchId flagged",
  );
}
{
  // Same join but the producer aliased its columns (empty bareCols).
  const body = `SELECT t.id FROM tasks t JOIN employee_assignments ea ON ea.id = t.x WHERE \${tw}`;
  const map = new Map([["tw", new Set()]]);
  assert(
    analyzeBodyScoped(body, map, tableColumns).length === 0,
    "aliased producer (no bare columns) → clean",
  );
}
{
  // Single-table query — bare where is fine.
  const body = `SELECT COUNT(*) FROM invoices WHERE \${where} AND status='overdue'`;
  const map = new Map([["where", new Set(["companyId", "branchId"])]]);
  assert(
    analyzeBodyScoped(body, map, tableColumns).length === 0,
    "single-table invoices query → clean even with bare where",
  );
}
{
  // The bare deletedAt case across tasks⋈employees.
  const body = `SELECT t.id FROM tasks t JOIN employees e ON e.id = t.x WHERE \${w}`;
  const map = new Map([["w", new Set(["deletedAt"])]]);
  assert(
    cols(analyzeBodyScoped(body, map, tableColumns))[0] === "deletedAt",
    "bare deletedAt shared across join → flagged",
  );
}
{
  // A body with no scope-where interpolation at all → nothing.
  const body = `SELECT t.id FROM tasks t JOIN employees e ON e.id=t.x WHERE t."companyId"=$1`;
  const map = new Map([["where", new Set(["companyId"])]]);
  assert(
    analyzeBodyScoped(body, map, tableColumns).length === 0,
    "no ${where} hole → nothing analysed",
  );
}

// ── readSqlLiteralArg ─────────────────────────────────────────────────
console.log("readSqlLiteralArg");
assert(
  readSqlLiteralArg("`SELECT 1`") === "SELECT 1",
  "template-literal arg → inner text",
);
assert(
  readSqlLiteralArg(`  "SELECT 1"  `) === "SELECT 1",
  "double-quoted arg (trimmed) → inner text",
);
assert(
  readSqlLiteralArg("sqlVariable") === null,
  "variable reference (not a literal) → null (skipped)",
);
assert(readSqlLiteralArg("") === null, "empty arg → null");

// ── analyzeScopedHelperBody (scopedQuery / scopedCount shape) ──────────
// These helpers take the SQL as their FIRST argument and inject the scope
// predicate at `{{WHERE}}` (or appended). The aliasing decision lives in
// the options argument, which we model via bareScopeColumns().
console.log("analyzeScopedHelperBody");
{
  // NEGATIVE TEST — the new wrapper shape with the alias DROPPED.
  // A scopedQuery into a tasks⋈employee_assignments join, options pass no
  // aliased companyColumn/branchColumn → bare companyId + branchId →
  // flagged (red). This is the exact blind-spot regression the task guards.
  const sql =
    "SELECT t.id FROM tasks t JOIN employee_assignments ea ON ea.id = t.x WHERE {{WHERE}}";
  const bareNoAlias = bareScopeColumns(parseScopedOptions("{}"), "scopedQuery");
  assert(
    JSON.stringify(
      cols(analyzeScopedHelperBody(sql, bareNoAlias, tableColumns)),
    ) === JSON.stringify(["branchId", "companyId"]),
    "scopedQuery, alias dropped → bare companyId + branchId flagged (red)",
  );
}
{
  // POSITIVE TEST — same call, but options alias the scope columns →
  // nothing bare → clean (green). Proves the alias is what flips it.
  const sql =
    "SELECT t.id FROM tasks t JOIN employee_assignments ea ON ea.id = t.x WHERE {{WHERE}}";
  const bareAliased = bareScopeColumns(
    parseScopedOptions(
      `{ companyColumn: 't."companyId"', branchColumn: 't."branchId"' }`,
    ),
    "scopedQuery",
  );
  assert(
    analyzeScopedHelperBody(sql, bareAliased, tableColumns).length === 0,
    "scopedQuery with aliased company+branch columns → clean (green)",
  );
}
{
  // The appended-WHERE form (no `{{WHERE}}` placeholder): scopedQuery
  // appends `WHERE <scope>` to the base SQL, so the bare predicate still
  // lands in the join and must be flagged.
  const sql =
    "SELECT t.id FROM tasks t JOIN employee_assignments ea ON ea.id = t.x";
  const bareNoAlias = bareScopeColumns(parseScopedOptions("{}"), "scopedCount");
  assert(
    cols(analyzeScopedHelperBody(sql, bareNoAlias, tableColumns)).includes(
      "companyId",
    ),
    "scopedCount with appended WHERE (no placeholder) → bare companyId flagged",
  );
}
{
  // Single-table scopedQuery — bare scope is never ambiguous.
  const sql = "SELECT COUNT(*) AS total FROM invoices WHERE {{WHERE}}";
  const bareNoAlias = bareScopeColumns(parseScopedOptions("{}"), "scopedCount");
  assert(
    analyzeScopedHelperBody(sql, bareNoAlias, tableColumns).length === 0,
    "single-table scopedCount → clean even with bare scope",
  );
}

// Regression guard for the silent typed-call skip. This scanner has its
// own rawQuery body extractor (it also tracks the source offset) — it must
// keep tolerating nested inline generics, or typed call sites are silently
// never scanned.
console.log("findRawQueryBodies: tolerates inline generics");
{
  const b = findRawQueryBodies("rawQuery(`SELECT a FROM t`)");
  assert(b.length === 1, "captures untyped rawQuery(`…`)");
}
{
  const b = findRawQueryBodies("rawQuery<Row>(`SELECT a FROM t`)");
  assert(b.length === 1, "captures single-level generic rawQuery<Row>(`…`)");
}
{
  const b = findRawQueryBodies(
    "rawQuery<Record<string, unknown>>(`SELECT a FROM t`)",
  );
  assert(
    b.length === 1,
    "captures NESTED generic rawQuery<Record<string, unknown>>(`…`)",
  );
}

// Combined end-to-end: a bare scope column injected via ${where} into a
// multi-table JOIN inside a TYPED rawQuery<…> call must be FLAGGED. Proves
// the typed body is both extracted (with its offset) AND analysed; if the
// extractor skipped typed calls, the ambiguous companyId would ship unseen.
console.log("typed rawQuery<…> scoped-where ambiguity is flagged end-to-end");
{
  const src =
    'await rawQuery<Record<string, unknown>>(`SELECT t.id FROM tasks t JOIN employee_assignments ea ON ea."taskId" = t.id WHERE ${where}`);';
  const [{ body }] = findRawQueryBodies(src);
  const nameToBareCols = new Map([["where", new Set(["companyId"])]]);
  assert(
    analyzeBodyScoped(body, nameToBareCols, tableColumns).some(
      (f) => f.col === "companyId",
    ),
    'bare companyId from ${where} in a typed rawQuery<…> JOIN is flagged',
  );
}

if (failed > 0) {
  console.error(`\n✗ ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n✓ all scoped-where ambiguity fixtures passed.");
process.exit(0);
