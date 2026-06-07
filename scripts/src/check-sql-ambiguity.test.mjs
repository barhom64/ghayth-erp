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
  computeSharedColumns,
  extractOutputAliases,
  isInOrderOrGroupRegion,
  findAmbiguousRefs,
  analyzeBody,
} from "./check-sql-ambiguity.mjs";

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
    new Set(["id", "companyId", "employeeId", "status", "period", "startDate"]),
  ],
  ["employees", new Set(["id", "companyId", "name", "status", "empNumber"])],
  ["evaluation_summaries", new Set(["id", "cycleId", "finalScore"])],
  [
    "employee_assignments",
    new Set(["id", "companyId", "branchId", "employeeId", "status", "isPrimary"]),
  ],
  ["tasks", new Set(["id", "companyId", "branchId", "status", "title"])],
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

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll check-sql-ambiguity fixtures passed.");
process.exit(0);
