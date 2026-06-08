import { describe, it, expect, vi, beforeEach } from "vitest";

// The resource loader in authorize() previously SELECTed a fixed 7-column
// list (companyId, branchId, departmentId, createdBy, employeeId, managerId,
// assigneeId). Postgres raises 42703 on the first column a table lacks, the
// error was swallowed, and the record came back undefined — silently killing
// BOTH the cross-tenant 404 guard and the per-record OUT_OF_SCOPE check for
// every resource route. These tests pin the fix: the loader introspects the
// table's real columns and only selects the ones that exist, so the SELECT
// never throws and the record is actually returned.

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn();
  const withTransaction = vi.fn();
  return { rawQuery, rawExecute, withTransaction };
});

interface MockedRawdb {
  rawQuery: ReturnType<typeof vi.fn>;
  rawExecute: ReturnType<typeof vi.fn>;
}

async function mockedRawdb(): Promise<MockedRawdb> {
  return (await import("../../src/lib/rawdb.js")) as unknown as MockedRawdb;
}

// information_schema column sets keyed by table — mirrors the real schema
// for a couple of representative tables.
const SCHEMA: Record<string, string[]> = {
  // employees lacks departmentId/createdBy/employeeId/managerId/assigneeId
  employees: ["id", "companyId", "branchId", "name"],
  // invoices lacks departmentId/employeeId/managerId/assigneeId but has total
  invoices: ["id", "companyId", "branchId", "createdBy", "total"],
};

function wireRawQuery(rawQuery: ReturnType<typeof vi.fn>, recordRow: Record<string, unknown> = {}) {
  const recordSelects: string[] = [];
  rawQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("information_schema.columns")) {
      const table = String(params[0]);
      return (SCHEMA[table] || []).map((c) => ({ column_name: c }));
    }
    // record SELECT
    recordSelects.push(sql);
    return [recordRow];
  });
  return recordSelects;
}

describe("resource loader — selects only existing columns", () => {
  beforeEach(async () => {
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockReset();
    // Clear the module-level column cache between tests by re-importing fresh.
    vi.resetModules();
  });

  it("never requests a column the table lacks (employees)", async () => {
    const { rawQuery } = await mockedRawdb();
    const selects = wireRawQuery(rawQuery, { id: 7, companyId: 1, branchId: 2 });
    const { loadResourceRecord } = await import("../../src/lib/rbac/authorize.js");

    const rec = await loadResourceRecord({ table: "employees", idParam: "id" }, 7);
    expect(rec).toBeTruthy();
    expect(selects).toHaveLength(1);
    // present columns are selected …
    expect(selects[0]).toContain('"companyId"');
    expect(selects[0]).toContain('"branchId"');
    // … and absent ones are NOT (would have thrown 42703 before the fix).
    expect(selects[0]).not.toContain('"departmentId"');
    expect(selects[0]).not.toContain('"managerId"');
    expect(selects[0]).not.toContain('"assigneeId"');
  });

  it("honours explicit (quoted) columns but drops the ones that don't exist", async () => {
    const { rawQuery } = await mockedRawdb();
    const selects = wireRawQuery(rawQuery, { id: 9, companyId: 1, total: 500 });
    const { loadResourceRecord } = await import("../../src/lib/rbac/authorize.js");

    // invoices route asks for departmentId (absent) + total (present).
    const rec = await loadResourceRecord(
      { table: "invoices", idParam: "id", columns: ['"companyId"', '"branchId"', '"departmentId"', '"createdBy"', "total"] },
      9,
    );
    expect(rec).toBeTruthy();
    expect(selects[0]).toContain('"total"');
    expect(selects[0]).toContain('"companyId"');
    expect(selects[0]).not.toContain('"departmentId"');
  });

  it("returns undefined for an unknown table (fail closed)", async () => {
    const { rawQuery } = await mockedRawdb();
    wireRawQuery(rawQuery);
    const { loadResourceRecord } = await import("../../src/lib/rbac/authorize.js");
    const rec = await loadResourceRecord({ table: "no_such_table", idParam: "id" }, 1);
    expect(rec).toBeUndefined();
  });

  it("strips non-identifier characters from the table name", async () => {
    const { rawQuery } = await mockedRawdb();
    const selects = wireRawQuery(rawQuery, { id: 1, companyId: 1 });
    const { loadResourceRecord } = await import("../../src/lib/rbac/authorize.js");
    await loadResourceRecord({ table: "employees; DROP TABLE x", idParam: "id" }, 1);
    // sanitised to "employeesDROPTABLEx" → unknown table → no record SELECT issued
    expect(selects).toHaveLength(0);
  });
});
