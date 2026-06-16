import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration 339 schema-conformance pin (2026-06-15 fix).
 *
 * The original migration referenced three column names that don't exist
 * on the live schema:
 *
 *   1. `chart_of_accounts.accountType` — the real column is `type`
 *   2. `companies.deletedAt`           — companies has no soft-delete column
 *   3. `accounting_mappings.{company_id, intent, account_code}` — real columns
 *      are `companyId`, `operationType`, `debitAccountCode`/`creditAccountCode`
 *
 * CI never caught this because guard.yml loads the schema from the dump
 * AND marks every migration as already-applied — the runner skips them.
 * `provision-agent-db.sh` (and prod's bootstrap.sh on a fresh DB) DOES
 * run the migration, and crashed on every fresh install since 339
 * landed. The fix corrects all three column references.
 *
 * Static pin (regex-only, per package-locality).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const MIG_RAW = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/339_fixed_assets_revaluation_surplus.sql"),
  "utf8",
);
// Strip SQL line comments so the static regex tests don't trip on the
// explanatory comments that BACKreference the buggy original column
// names. We only care about executable SQL.
const MIG = MIG_RAW
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("Migration 339 — schema-conformance fix", () => {
  it("does NOT reference the non-existent `chart_of_accounts.accountType` column", () => {
    // The live schema (db/schema_pre.sql:5481) has `type` only.
    expect(MIG).not.toMatch(/\bk\."accountType"/);
    expect(MIG).not.toMatch(/\bf\."accountType"/);
  });

  it("uses `k.\"type\"` and `f.\"type\"` (the real chart_of_accounts column)", () => {
    expect(MIG).toMatch(/AND k\."type"\s*=\s*i\.typ/);
    expect(MIG).toMatch(/AND f\."type"\s*=\s*i\.typ/);
  });

  it("does NOT reference the non-existent `companies.deletedAt` column", () => {
    // `companies` has no soft-delete column — verified vs schema dump.
    expect(MIG).not.toMatch(/c\."deletedAt"\s+IS NULL/);
  });

  it("uses the actual `accounting_mappings` schema (companyId / operationType / debitAccountCode + creditAccountCode)", () => {
    // Real columns per the schema + sibling migration 338.
    expect(MIG).toMatch(/INSERT INTO accounting_mappings[\s\S]+?"companyId"/);
    expect(MIG).toMatch(/INSERT INTO accounting_mappings[\s\S]+?"operationType"/);
    expect(MIG).toMatch(/INSERT INTO accounting_mappings[\s\S]+?"debitAccountCode"/);
    expect(MIG).toMatch(/INSERT INTO accounting_mappings[\s\S]+?"creditAccountCode"/);
    expect(MIG).toMatch(/INSERT INTO accounting_mappings[\s\S]+?"operationLabel"/);
  });

  it("does NOT name the invented `company_id` / `intent` / `account_code` columns in the INSERT target", () => {
    // The original migration invented these as DESTINATION column names.
    // Match only the parenthesized destination list right after
    // `INSERT INTO accounting_mappings (...)` so the test doesn't trip
    // on `c.id AS company_id` aliases used inside the resolved CTE.
    const destList = MIG.match(/INSERT INTO accounting_mappings\s*\(([^)]+)\)/);
    expect(destList, "INSERT destination column list not found").toBeTruthy();
    expect(destList![1]).not.toMatch(/\bcompany_id\b/);
    expect(destList![1]).not.toMatch(/\bintent\b/);
    expect(destList![1]).not.toMatch(/\baccount_code\b/);
  });

  it("ON CONFLICT clause matches the real composite key `(companyId, operationType)`", () => {
    expect(MIG).toMatch(
      /ON CONFLICT\s*\(\s*"companyId",\s*"operationType"\s*\)\s*DO NOTHING/,
    );
  });

  it("rollback annotation reflects the real column name (`operationType`, not `intent`)", () => {
    // Rollback is in the header comment, so check the raw file.
    expect(MIG_RAW).toMatch(
      /@rollback:[\s\S]{0,400}?accounting_mappings WHERE "operationType" IN/,
    );
  });

  it("idempotency is preserved — re-running over an applied DB is safe", () => {
    // `ADD COLUMN IF NOT EXISTS` on the ALTER + `ON CONFLICT DO NOTHING`
    // on the INSERT. Without both, a manually-patched prod row would
    // collide on re-run.
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "revaluationSurplus"/);
    expect(MIG).toMatch(/ON CONFLICT[\s\S]{0,80}?DO NOTHING/);
  });
});
