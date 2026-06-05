import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ENTITY_REGISTRY } from "../../src/lib/entityRegistry.js";

// entityRegistry.table is interpolated into `SELECT * FROM ${table}` by the
// print data loader (default case) and is the canonical entity→table map. A
// wrong/non-existent name silently loads nothing — the user sees an "empty
// print". This guards every declared table against the schema dump CI loads.

const CWD = process.cwd(); // artifacts/api-server
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

describe("entityRegistry tables resolve to real relations", () => {
  const relations = loadSchemaRelations();

  it("loaded a non-trivial relation set from the dump", () => {
    expect(relations.size).toBeGreaterThan(100);
  });

  it("every entity's declared table exists in the schema", () => {
    const offenders: string[] = [];
    for (const e of ENTITY_REGISTRY) {
      const table = (e as { table?: string }).table;
      if (table && !relations.has(table)) {
        offenders.push(`entity "${e.id}" → table "${table}" does not exist`);
      }
    }
    expect(offenders, `Unknown registry tables:\n${offenders.join("\n")}`).toEqual([]);
  });
});
