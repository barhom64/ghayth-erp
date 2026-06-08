import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Guards a real bug class: an authorize({ resource: { table: "X" } }) clause
// that names a relation which doesn't exist (e.g. "vehicles" instead of
// "fleet_vehicles", "custodies" instead of "journal_entries"). When the table
// name is wrong the resource SELECT fails, the record never loads, and BOTH
// the cross-tenant 404 guard and the per-record OUT_OF_SCOPE check silently
// no-op for that route. This test scans every route file for resource table
// names and asserts each is a real relation in the schema dump that CI loads.

const CWD = process.cwd(); // artifacts/api-server when vitest runs
const ROUTES_DIR = resolve(CWD, "src/routes");
const DUMP_FILES = [
  resolve(CWD, "../../db/schema_pre.sql"),
  resolve(CWD, "../../db/schema_post.sql"),
];

function loadSchemaRelations(): Set<string> {
  const names = new Set<string>();
  for (const f of DUMP_FILES) {
    if (!existsSync(f)) continue;
    const sql = readFileSync(f, "utf8");
    const re = /CREATE (?:TABLE|VIEW|MATERIALIZED VIEW)(?:\s+IF NOT EXISTS)?\s+public\.([a-z0-9_]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) names.add(m[1]);
  }
  return names;
}

// Pull every `resource: { ... table: "name" ... }` table literal out of a
// route file. Matches across the small object literal (single line in this
// codebase). Returns [{ table, line }].
function extractResourceTables(src: string): { table: string; line: number }[] {
  const out: { table: string; line: number }[] = [];
  const lines = src.split("\n");
  const re = /resource:\s*\{[^}]*\btable:\s*["']([a-z0-9_]+)["']/gi;
  lines.forEach((line, i) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) out.push({ table: m[1], line: i + 1 });
  });
  return out;
}

describe("authorize resource tables resolve to real relations", () => {
  const relations = loadSchemaRelations();

  it("loaded a non-trivial schema relation set from the dump", () => {
    // Guard the guard: if the dump path/regex breaks we must not silently
    // pass every assertion below against an empty set.
    expect(relations.size).toBeGreaterThan(100);
    expect(relations.has("fleet_vehicles")).toBe(true);
  });

  it("every resource:{table} in routes names a relation that exists", () => {
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"));
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(resolve(ROUTES_DIR, file), "utf8");
      for (const { table, line } of extractResourceTables(src)) {
        if (!relations.has(table)) offenders.push(`${file}:${line} → resource table "${table}" does not exist`);
      }
    }
    expect(offenders, `Unknown resource tables:\n${offenders.join("\n")}`).toEqual([]);
  });
});
