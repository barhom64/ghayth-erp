import { describe, it, expect } from "vitest";
import { ADAPTERS } from "../../src/lib/importAdapters.js";
import { rawQuery } from "../../src/lib/rawdb.js";

// Each adapter enumMap translates an Arabic/English label to a DB value. If a
// produced value isn't allowed by the column's CHECK constraint, the import
// INSERT fails and that row is silently dropped. This validates every enum
// output (plus any default for the same column) against the live CHECK
// constraints — which is what surfaced INVOICE_STATUS→"issued" (invalid) and
// employees.status→"pending"/"cancelled" (invalid).

const HAS_DB = !!process.env.DATABASE_URL;

// Pull the allowed string literals out of a CHECK definition that constrains
// `col` via `= ANY (ARRAY[...])` or `IN (...)`. Returns null when the def
// doesn't constrain this column in that shape (so we don't guess).
function allowedValuesFor(col: string, def: string): Set<string> | null {
  // Must reference the column: `(col)::text` or `"col"` or bare `col`.
  const refsCol = new RegExp(`[("]${col}[")]|\\b${col}\\b`).test(def);
  if (!refsCol) return null;
  if (!/=\s*ANY\s*\(|\bIN\s*\(/i.test(def)) return null;
  const literals = [...def.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  if (literals.length === 0) return null;
  return new Set(literals);
}

describe("import adapter enum outputs satisfy table CHECK constraints", () => {
  it.skipIf(!HAS_DB)("every enum value (and status default) is allowed by the column CHECK", async () => {
    const offenders: string[] = [];
    for (const [key, a] of Object.entries(ADAPTERS)) {
      if (!a.enumMaps) continue;
      const checks = await rawQuery<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE contype = 'c' AND conrelid = $1::regclass`,
        [a.table],
      ).catch(() => [] as { def: string }[]);

      for (const [col, map] of Object.entries(a.enumMaps)) {
        const outputs = new Set<string>(Object.values(map as Record<string, string>));
        const def = (a.defaults as Record<string, unknown> | undefined)?.[col];
        if (def != null) outputs.add(String(def));

        // Union of allowed sets across every CHECK that constrains this column.
        let allowed: Set<string> | null = null;
        for (const { def: d } of checks) {
          const a2 = allowedValuesFor(col, d);
          if (a2) allowed = allowed ? new Set([...allowed, ...a2]) : a2;
        }
        if (!allowed) continue; // column has no enumerated CHECK — free value

        for (const v of outputs) {
          if (!allowed.has(v)) {
            offenders.push(`adapter "${key}": ${a.table}.${col} value "${v}" not allowed by CHECK (allowed: ${[...allowed].join(", ")})`);
          }
        }
      }
    }
    expect(offenders, `Enum/CHECK mismatches:\n${offenders.join("\n")}`).toEqual([]);
  });
});
