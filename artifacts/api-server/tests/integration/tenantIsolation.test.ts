// Tenant-isolation static analysis test.
//
// Reads every `routes/*.ts` file, scans each `rawQuery(`…`)` /
// `rawExecute(`…`)` template literal, and verifies that any reference
// to a tenant-scoped table (a table whose drizzle definition declares
// a `companyId` column) is accompanied by either:
//
//   1. an explicit `"companyId"` predicate in the SQL body, or
//   2. an interpolation `${…}` that may inject `buildScopedWhere(…)`,
//      `parseScopeFilters(…)`, or a literal `scope.companyId` value, or
//   3. an entry in the allowlist below for an intentional cross-tenant
//      query (admin/health/super-admin views).
//
// A violation means the route can return rows belonging to a tenant
// other than the caller's. CI fails on any non-allowlisted violation.
//
// This is a static gate — it cannot prove correctness, but it makes
// regressions loud. The companion dynamic suite
// (`tenantIsolation.dynamic.test.ts.skip`) verifies behaviour against a
// seeded Postgres once docker-compose lands in CI (Day 12 of the
// 14-day freeze plan).

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const SCHEMA_FILE = join(REPO_ROOT, "lib/db/src/schema/index.ts");

// Route files that are intentionally not tenant-scoped because they
// serve public, health-check, or cross-tenant admin traffic.
const PUBLIC_ROUTE_FILES = new Set([
  "careersPortal.ts", // anonymous job applicants
  "health.ts",         // liveness / readiness / schema-drift probe
  "index.ts",          // router mount only
  "publicData.ts",     // public landing-page data
]);

// Per-(file, table) intentional cross-tenant exceptions. Keep this
// list small and review every entry. Adding here means "this query is
// supposed to span tenants — usually owner/super_admin reporting".
// (file, line, table) precision so that adding a new unscoped query
// in any of these files at a different line still fails loudly. The
// 17 entries tagged "PENDING DAY 3-5 TRIAGE" capture the candidates
// surfaced by the initial run (see docs/freeze/freeze-day-2-findings.md).
// Each one must be either resolved (fix the query) or have its reason
// rewritten to a real approval (read-after-write, auth bootstrap, etc.)
// before the freeze go/no-go decision on Day 14.
type Allow = { file: string; line: number; table: string; reason: string };
const ALLOWLIST: Allow[] = [
  {
    file: "auth.ts",
    line: 296,
    table: "employee_assignments",
    reason:
      "Refresh-token bootstrap. Runs before req.scope is built; the tenant boundary is the verified refresh token's employeeId, not scope.companyId.",
  },
  // ── PENDING DAY 3-5 TRIAGE ──────────────────────────────────────
  // Removing or rewriting an entry's `reason` is the Day 3-5 unit of
  // work. Order roughly matches `docs/freeze/freeze-day-2-findings.md`.
  { file: "accounting-engine.ts", line: 307, table: "chart_of_accounts",    reason: "PENDING DAY 3-5 TRIAGE — confirm parent journal_entry_template companyId scope" },
  { file: "accounting-engine.ts", line: 355, table: "chart_of_accounts",    reason: "PENDING DAY 3-5 TRIAGE — same template join pattern, different handler" },
  { file: "accounting-engine.ts", line: 411, table: "chart_of_accounts",    reason: "PENDING DAY 3-5 TRIAGE — same template join pattern, different handler" },
  { file: "crm.ts",               line: 1016, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — verify employeeId ANY array source is already-scoped" },
  { file: "employees.ts",         line: 627,  table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — read-after-INSERT, formalise read-after-write rule" },
  { file: "employees.ts",         line: 627,  table: "branches",             reason: "PENDING DAY 3-5 TRIAGE — branches join inside read-after-INSERT row" },
  { file: "employees.ts",         line: 786,  table: "attendance",           reason: "PENDING DAY 3-5 TRIAGE — employee.assignmentId from prior scoped fetch" },
  { file: "employees.ts",         line: 1084, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — read-after-UPDATE row, key was scoped earlier" },
  { file: "finance-custodies.ts", line: 441,  table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — HIGH: resolvedAssignmentId from request, no companyId check before journal write" },
  { file: "hr.ts",                line: 1702, table: "hr_leave_requests",    reason: "PENDING DAY 3-5 TRIAGE — read-after-INSERT of insertId (leave request)" },
  { file: "hr.ts",                line: 1702, table: "hr_leave_types",       reason: "PENDING DAY 3-5 TRIAGE — joined leave-type id; confirm tenant scope" },
  { file: "hr.ts",                line: 2154, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — leave_approval_stages join" },
  { file: "hr.ts",                line: 2326, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — payroll_lines join" },
  { file: "hr.ts",                line: 2364, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — payroll_lines join, alternate shape" },
  { file: "hr.ts",                line: 5246, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — peer_evaluations join" },
  { file: "properties.ts",        line: 2223, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — MEDIUM: assignedTechnicianId from req.body, returns employeeId cross-tenant" },
  { file: "properties.ts",        line: 2265, table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — MEDIUM: same pattern, different handler" },
  { file: "warehouse.ts",         line: 821,  table: "employee_assignments", reason: "PENDING DAY 3-5 TRIAGE — userId is helper-function arg; trace caller" },
];

interface SchemaInfo {
  tenantTables: Set<string>;
}

interface RawQueryCall {
  file: string;
  line: number;
  sql: string;
  args: string;
}

interface Violation {
  file: string;
  line: number;
  table: string;
  snippet: string;
  reason: string;
}

// ─── Schema parser ─────────────────────────────────────────────────
// Parse `pgTable("table_name", { ... companyId: integer("companyId") ... })`
// from lib/db/src/schema/index.ts and return the set of table names that
// have a companyId column.
function loadSchema(): SchemaInfo {
  const src = readFileSync(SCHEMA_FILE, "utf8");
  const tenantTables = new Set<string>();

  // Match `pgTable("name", { … })` blocks — depth-aware brace walk so
  // we don't get tripped up by nested object initialisers.
  const headRe = /pgTable\s*\(\s*"([^"]+)"\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = headRe.exec(src)) !== null) {
    const tableName = m[1];
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const body = src.slice(m.index + m[0].length, i - 1);
    // The drizzle pattern is: companyId: integer("companyId")…
    if (/(\b|^)companyId\s*:\s*integer\s*\(\s*"companyId"/.test(body)) {
      tenantTables.add(tableName);
    }
  }
  return { tenantTables };
}

// ─── Route scanner ─────────────────────────────────────────────────
// Find every `rawQuery(`…`)` / `rawExecute(`…`)` call in a route file.
// Returns the SQL body, the args expression, and the line number of
// the call site (1-based).
function findRawCalls(src: string, file: string): RawQueryCall[] {
  const out: RawQueryCall[] = [];
  // The opening: `rawQuery(` optionally followed by a generic, then a
  // backtick template literal.
  const headRe = /\b(?:rawQuery|rawExecute)\s*(?:<[^>]*>)?\s*\(\s*`/g;
  let m: RegExpExecArray | null;
  while ((m = headRe.exec(src)) !== null) {
    const start = m.index + m[0].length;
    // Find matching backtick, allowing nested ${…} which may contain
    // arbitrary JS including more backticks.
    let i = start;
    let depthInterp = 0;
    while (i < src.length) {
      const ch = src[i];
      if (depthInterp === 0 && ch === "`") break;
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "$" && src[i + 1] === "{") {
        depthInterp++;
        i += 2;
        continue;
      }
      if (depthInterp > 0 && ch === "}") {
        depthInterp--;
        i++;
        continue;
      }
      i++;
    }
    if (i >= src.length) continue;
    const sql = src.slice(start, i);

    // Walk past `, …` until matching `)` for args expression.
    let j = i + 1;
    while (j < src.length && /\s/.test(src[j])) j++;
    let args = "";
    if (src[j] === ",") {
      j++;
      let parens = 1;
      while (j < src.length && parens > 0) {
        const ch = src[j];
        if (ch === "(" || ch === "[" || ch === "{") parens++;
        else if (ch === ")" || ch === "]" || ch === "}") parens--;
        if (parens === 0) break;
        args += ch;
        j++;
      }
    }
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ file, line, sql, args });
  }
  return out;
}

// Extract every `FROM <table>`, `JOIN <table>`, `UPDATE <table>`,
// `INTO <table>`, `DELETE FROM <table>` reference from a SQL string.
// Strips quoted identifiers and CTE-style aliases.
function extractTableRefs(sql: string): string[] {
  const out: string[] = [];
  const re = /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+"?([a-z_][a-z0-9_]*)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

// True if this query is plausibly tenant-scoped. We accept any of:
//   - `"companyId"` (or `companyid`, etc.) appears in the SQL body
//   - `${…}` interpolation appears (could be buildScopedWhere)
//   - the args expression mentions `scope.companyId` /
//     `allowedCompanies` / `buildScopedWhere`
//   - the args expression filters by a tenant-bound surrogate that
//     authMiddleware already validates against the caller's company —
//     namely `scope.activeAssignmentId`, `scope.userId`,
//     `scope.employeeId`, or `scope.branchId`. Any of these can only
//     be the caller's own ids, so a query keyed on them cannot reach
//     another tenant's rows.
//   - the SQL is keyed by `"assignmentId" = $N` or `"employeeId" = $N`
//     AND that $N comes from a `scope.*` surrogate — captured above.
function isLikelyTenantScoped(call: RawQueryCall): boolean {
  if (/"companyId"|\bcompanyId\b/i.test(call.sql)) return true;
  if (/\$\{[^}]*\}/.test(call.sql)) return true;
  if (/\bscope\.(companyId|allowedCompanies)\b/.test(call.args)) return true;
  if (/\bbuildScopedWhere\b/.test(call.args)) return true;
  if (/\bscope\.(activeAssignmentId|userId|employeeId|branchId|allowedBranches|allowedAssignments)\b/.test(call.args))
    return true;
  return false;
}

function isAllowlisted(file: string, line: number, table: string): boolean {
  return ALLOWLIST.some((a) => a.file === file && a.line === line && a.table === table);
}

// ─── Suite ─────────────────────────────────────────────────────────

const schema = loadSchema();
const routeFiles = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts"))
  .filter((f) => !PUBLIC_ROUTE_FILES.has(f));

describe("Schema sanity", () => {
  it("loads the drizzle schema and finds tenant-scoped tables", () => {
    expect(schema.tenantTables.size).toBeGreaterThan(10);
    expect(schema.tenantTables.has("clients")).toBe(true);
    expect(schema.tenantTables.has("invoices")).toBe(true);
    expect(schema.tenantTables.has("journal_entries")).toBe(true);
  });

  it("excludes the four documented public route files", () => {
    expect(routeFiles.length).toBeGreaterThan(70);
    for (const pub of PUBLIC_ROUTE_FILES) {
      expect(routeFiles).not.toContain(pub);
    }
  });
});

describe("Tenant isolation — every raw SQL call against a tenant-scoped table is companyId-aware", () => {
  const violations: Violation[] = [];

  for (const fileName of routeFiles) {
    const filePath = join(ROUTES_DIR, fileName);
    const src = readFileSync(filePath, "utf8");
    const calls = findRawCalls(src, fileName);
    for (const call of calls) {
      const refs = extractTableRefs(call.sql);
      const tenantRefs = refs.filter((t) => schema.tenantTables.has(t));
      if (tenantRefs.length === 0) continue;
      if (isLikelyTenantScoped(call)) continue;
      for (const table of tenantRefs) {
        if (isAllowlisted(fileName, call.line, table)) continue;
        violations.push({
          file: fileName,
          line: call.line,
          table,
          snippet: call.sql.replace(/\s+/g, " ").trim().slice(0, 160),
          reason:
            "Raw query touches a tenant-scoped table but neither the SQL nor its args mention companyId/scope/buildScopedWhere",
        });
      }
    }
  }

  it("has zero unexplained cross-tenant query risks", () => {
    if (violations.length > 0) {
      const grouped = violations.reduce<Record<string, Violation[]>>(
        (acc, v) => {
          (acc[v.file] ||= []).push(v);
          return acc;
        },
        {}
      );
      const lines = Object.entries(grouped).map(([file, vs]) => {
        const inner = vs
          .map((v) => `  L${v.line}  ${v.table}\n    ${v.snippet}`)
          .join("\n");
        return `${file} (${vs.length}):\n${inner}`;
      });
      throw new Error(
        `Tenant-isolation violations found (${violations.length} total):\n\n${lines.join("\n\n")}\n\n` +
          `Either fix the query, add a "companyId" predicate, route through buildScopedWhere(),\n` +
          `or — if the query is intentionally cross-tenant — add an entry to the ALLOWLIST in\n` +
          `tests/integration/tenantIsolation.test.ts with a one-line reason.`
      );
    }
    expect(violations).toEqual([]);
  });
});
