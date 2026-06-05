import { describe, it, expect } from "vitest";
import { ADAPTERS } from "../../src/lib/importAdapters.js";
import { rawQuery } from "../../src/lib/rawdb.js";

// The generic import engine builds `INSERT INTO ${table} (${cols})`,
// `UPDATE ${table} SET ...`, and `WHERE "${uniqueField}"` from each adapter's
// column mappings. A column that doesn't exist on the table makes the whole
// import path throw 42703 at runtime. This validates every adapter's target
// columns against the live schema.

const HAS_DB = !!process.env.DATABASE_URL;

// Every DB column an adapter reads or writes.
function targetColumns(a: (typeof ADAPTERS)[keyof typeof ADAPTERS]): string[] {
  const cols = new Set<string>();
  for (const v of Object.values(a.headerMap)) cols.add(v);
  for (const k of Object.keys(a.fieldTypes)) cols.add(k);
  for (const c of a.compareFields) cols.add(c);
  if (a.uniqueField) cols.add(a.uniqueField);
  if (a.defaults) for (const k of Object.keys(a.defaults)) cols.add(k);
  return [...cols];
}

describe("import adapters — target columns exist on their tables", () => {
  it("every adapter declares a table", () => {
    for (const [key, a] of Object.entries(ADAPTERS)) {
      expect(a.table, `adapter "${key}" missing table`).toBeTruthy();
    }
  });

  it.skipIf(!HAS_DB)("every mapped/compared/unique/default column exists", async () => {
    const offenders: string[] = [];
    for (const [key, a] of Object.entries(ADAPTERS)) {
      const rows = await rawQuery<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [a.table],
      );
      const existing = new Set(rows.map((r) => r.column_name));
      if (existing.size === 0) {
        offenders.push(`adapter "${key}": table "${a.table}" not found`);
        continue;
      }
      for (const col of targetColumns(a)) {
        if (!existing.has(col)) offenders.push(`adapter "${key}": ${a.table}.${col} does not exist`);
      }
    }
    expect(offenders, `Import adapter column problems:\n${offenders.join("\n")}`).toEqual([]);
  });
});
