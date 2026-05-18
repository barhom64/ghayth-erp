// Regression test for issue #635 — migration runner must execute every
// statement of a `CREATE INDEX CONCURRENTLY` migration in its own query
// round-trip, otherwise PostgreSQL wraps the multi-statement simple query
// in an implicit transaction block and fails with 25001
// PreventInTransactionBlock — even though the runner itself never calls
// BEGIN.
//
// We verify the pure helpers (`splitSqlStatements` /
// `containsTxnIncompatibleStatement` / `stripSqlComments`) directly here.
// The actual end-to-end runner is exercised by the api-server boot path
// in CI (clean-boot smoke).

import { describe, it, expect } from "vitest";
import {
  splitSqlStatements,
  stripSqlComments,
  stripSqlLiteralsAndComments,
  containsTxnIncompatibleStatement,
} from "../../src/lib/migrate.js";

describe("migrate.ts — txn-incompatible detection (#635)", () => {
  it("flags CREATE INDEX CONCURRENTLY", () => {
    expect(
      containsTxnIncompatibleStatement(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foo ON foo (bar);`,
      ),
    ).toBe(true);
  });

  it("flags DROP INDEX CONCURRENTLY", () => {
    expect(
      containsTxnIncompatibleStatement(`DROP INDEX CONCURRENTLY idx_foo;`),
    ).toBe(true);
  });

  it("flags REINDEX ... CONCURRENTLY", () => {
    expect(
      containsTxnIncompatibleStatement(`REINDEX TABLE CONCURRENTLY foo;`),
    ).toBe(true);
  });

  it("flags REFRESH MATERIALIZED VIEW CONCURRENTLY", () => {
    expect(
      containsTxnIncompatibleStatement(
        `REFRESH MATERIALIZED VIEW CONCURRENTLY my_mv;`,
      ),
    ).toBe(true);
    // Non-concurrent REFRESH is safe inside a transaction.
    expect(
      containsTxnIncompatibleStatement(`REFRESH MATERIALIZED VIEW my_mv;`),
    ).toBe(false);
  });

  it("flags REINDEX SYSTEM CONCURRENTLY", () => {
    expect(
      containsTxnIncompatibleStatement(`REINDEX SYSTEM CONCURRENTLY foo;`),
    ).toBe(true);
  });

  it("flags VACUUM, ALTER SYSTEM, CREATE/DROP DATABASE, ALTER TYPE ADD VALUE", () => {
    expect(containsTxnIncompatibleStatement(`VACUUM ANALYZE foo;`)).toBe(true);
    expect(containsTxnIncompatibleStatement(`ALTER SYSTEM SET x = 1;`)).toBe(true);
    expect(containsTxnIncompatibleStatement(`CREATE DATABASE foo;`)).toBe(true);
    expect(containsTxnIncompatibleStatement(`DROP DATABASE foo;`)).toBe(true);
    expect(
      containsTxnIncompatibleStatement(`ALTER TYPE my_enum ADD VALUE 'new';`),
    ).toBe(true);
  });

  it("does NOT flag ordinary CREATE INDEX / CREATE TABLE / ALTER TABLE", () => {
    expect(
      containsTxnIncompatibleStatement(`CREATE INDEX idx_foo ON foo (bar);`),
    ).toBe(false);
    expect(
      containsTxnIncompatibleStatement(
        `CREATE TABLE foo (id serial PRIMARY KEY);`,
      ),
    ).toBe(false);
    expect(
      containsTxnIncompatibleStatement(`ALTER TABLE foo ADD COLUMN bar text;`),
    ).toBe(false);
    expect(
      containsTxnIncompatibleStatement(
        `ALTER TABLE foo CLUSTER ON idx_foo_pkey;`,
      ),
    ).toBe(false);
  });

  it("ignores keywords inside line comments and block comments", () => {
    expect(
      containsTxnIncompatibleStatement(`-- VACUUM never runs here\nSELECT 1;`),
    ).toBe(false);
    expect(
      containsTxnIncompatibleStatement(
        `/* CREATE INDEX CONCURRENTLY in a block comment */\nSELECT 1;`,
      ),
    ).toBe(false);
  });

  it("ignores keywords inside single-quoted string literals (no false positive)", () => {
    expect(
      containsTxnIncompatibleStatement(
        `INSERT INTO notes (body) VALUES ('please VACUUM the warehouse tonight');`,
      ),
    ).toBe(false);
    expect(
      containsTxnIncompatibleStatement(
        `INSERT INTO notes (body) VALUES ('reminder: CREATE INDEX CONCURRENTLY on idx_foo');`,
      ),
    ).toBe(false);
  });

  it("ignores keywords inside double-quoted identifiers (no false positive)", () => {
    expect(
      containsTxnIncompatibleStatement(
        `CREATE TABLE "VACUUM logs" (id serial primary key);`,
      ),
    ).toBe(false);
  });

  it("ignores keywords inside $tag$ dollar-quoted strings (no false positive)", () => {
    expect(
      containsTxnIncompatibleStatement(
        `DO $$ BEGIN RAISE NOTICE 'CREATE INDEX CONCURRENTLY would fail here'; END $$;`,
      ),
    ).toBe(false);
  });
});

describe("migrate.ts — stripSqlLiteralsAndComments", () => {
  it("blanks single-quoted bodies but keeps surrounding tokens", () => {
    const out = stripSqlLiteralsAndComments(
      `INSERT INTO t VALUES ('VACUUM here');`,
    );
    expect(out).not.toMatch(/VACUUM/);
    expect(out).toMatch(/INSERT INTO t VALUES/);
    expect(out.endsWith(";")).toBe(true);
  });
  it("blanks dollar-quoted bodies", () => {
    const out = stripSqlLiteralsAndComments(
      `DO $$ BEGIN RAISE NOTICE 'VACUUM'; END $$;`,
    );
    expect(out).not.toMatch(/VACUUM/);
    expect(out).not.toMatch(/RAISE/);
  });
  it("blanks both comment kinds", () => {
    const out = stripSqlLiteralsAndComments(
      `-- VACUUM line\n/* CREATE INDEX CONCURRENTLY block */\nSELECT 1;`,
    );
    expect(out).not.toMatch(/VACUUM/);
    expect(out).not.toMatch(/CONCURRENTLY/);
    expect(out).toMatch(/SELECT 1;/);
  });
  it("preserves '' escape correctly (does not desync state)", () => {
    const out = stripSqlLiteralsAndComments(
      `INSERT INTO t VALUES ('it''s VACUUM time'); VACUUM foo;`,
    );
    // First VACUUM is inside the literal → blanked.
    // Second VACUUM is outside → preserved.
    const matches = out.match(/VACUUM/g) || [];
    expect(matches).toHaveLength(1);
  });
});

describe("migrate.ts — stripSqlComments", () => {
  it("strips -- line comments", () => {
    expect(stripSqlComments(`SELECT 1; -- trailing\nSELECT 2;`)).toContain(
      "SELECT 1;",
    );
    expect(stripSqlComments(`SELECT 1; -- trailing\nSELECT 2;`)).not.toContain(
      "trailing",
    );
  });
  it("strips /* block */ comments across lines", () => {
    expect(
      stripSqlComments(`SELECT /* inline\n  block */ 1;`),
    ).not.toContain("block");
  });
});

describe("migrate.ts — splitSqlStatements (#635)", () => {
  it("splits the canonical 150_companyid_indexes shape into N CREATE INDEX statements", () => {
    const sql = `
-- Add missing companyId indexes to high-traffic tenant-scoped tables.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_companyid ON attendance ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budgets_companyid ON budgets ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_companyid ON clients ("companyId");
`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toMatch(/CREATE INDEX CONCURRENTLY .* idx_attendance_companyid/);
    expect(stmts[1]).toMatch(/idx_budgets_companyid/);
    expect(stmts[2]).toMatch(/idx_clients_companyid/);
    // CRITICAL — exactly the regression #635 tests for: none of the
    // split statements may contain a bare `;` terminator, otherwise pg
    // would still treat the query as multi-statement and wrap it in an
    // implicit transaction block, breaking CREATE INDEX CONCURRENTLY.
    for (const s of stmts) {
      expect(s.endsWith(";")).toBe(false);
      // also confirm no internal `;` outside strings/identifiers
      // (the splitter is what guarantees this).
      const withoutQuoted = s
        .replace(/'(?:[^']|'')*'/g, "")
        .replace(/"(?:[^"])*"/g, "");
      expect(withoutQuoted).not.toContain(";");
    }
  });

  it("does NOT split on ; inside single-quoted strings", () => {
    const sql = `INSERT INTO foo (x) VALUES ('a;b;c'); INSERT INTO bar (y) VALUES ('d');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("'a;b;c'");
    expect(stmts[1]).toContain("'d'");
  });

  it('does NOT split on ; inside double-quoted identifiers', () => {
    const sql = `CREATE INDEX idx_x ON foo ("col;weird"); CREATE INDEX idx_y ON foo (bar);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('"col;weird"');
  });

  it("does NOT split on ; inside $tag$ dollar-quoted strings", () => {
    const sql = `
DO $$
BEGIN
  RAISE NOTICE 'one; two; three';
END
$$;
SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("RAISE NOTICE");
    expect(stmts[1]).toBe("SELECT 1");
  });

  it("handles '' single-quote escape correctly", () => {
    const sql = `INSERT INTO t (v) VALUES ('it''s ok'); SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("'it''s ok'");
  });

  it("ignores ; that appear inside -- line comments", () => {
    const sql = `SELECT 1; -- semicolon ; in comment ;\nSELECT 2;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
  });

  it("trims whitespace and drops empty trailing statements", () => {
    const sql = `SELECT 1;\n\n;  \n;\nSELECT 2;\n`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("returns a single statement for a file with no terminator", () => {
    const sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foo ON foo (bar)`;
    expect(splitSqlStatements(sql)).toEqual([sql]);
  });
});
