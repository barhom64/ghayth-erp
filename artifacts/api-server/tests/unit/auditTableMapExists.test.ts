import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ENTITY_TABLE_MAP } from "../../src/middlewares/auditMiddleware.js";

// auditMiddleware.fetchBeforeState() runs `SELECT * FROM ${ENTITY_TABLE_MAP[entity]}`
// to capture the before-state of an audited mutation. A wrong table name makes
// the query throw, the catch swallows it, and the audit row is written WITHOUT
// a before-state — a silent gap in the compliance trail. This guards every
// mapped table against the schema dump CI loads.

const CWD = process.cwd();
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

describe("audit ENTITY_TABLE_MAP tables exist", () => {
  const relations = loadSchemaRelations();

  it("loaded a non-trivial relation set", () => {
    expect(relations.size).toBeGreaterThan(100);
  });

  it("every audited entity maps to a real relation", () => {
    const offenders: string[] = [];
    for (const [entity, table] of Object.entries(ENTITY_TABLE_MAP)) {
      if (!relations.has(table)) offenders.push(`audit entity "${entity}" → table "${table}" does not exist`);
    }
    expect(offenders, `Unknown audit tables:\n${offenders.join("\n")}`).toEqual([]);
  });
});
