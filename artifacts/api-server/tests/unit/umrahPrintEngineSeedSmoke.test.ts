import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P4 — seed umrah print templates as DB rows.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.4):
 *   - Migration 349_umrah_print_engine_seed.sql inserts a classic
 *     preset row for each umrah entityType the print engine
 *     already supports (10 rows).
 *   - Same shape as 172_print_engine_seed.sql — `companyId IS NULL`
 *     "system default" so the resolver step 4 finds it for any
 *     tenant.
 *   - NOT EXISTS guard makes the migration idempotent.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch / no FE / no schema change.
 *   - No new bespoke preset builder (U-14-P3 separate slice).
 *   - The migration does NOT remove or update existing umrah
 *     templates — purely additive INSERT.
 *
 * Failure modes pinned:
 *   - Migration drops the NOT EXISTS guard → §A fails on re-run.
 *   - Migration inserts companyId != NULL → §B fails (would
 *     fingerprint a specific tenant).
 *   - Migration sets presetKey != 'classic' → §C fails (resolver
 *     step 4 only matches `presetKey = 'classic'`).
 *   - One of the 10 entity types is missing → §D fails.
 *   - Migration adds an UPDATE / DELETE → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/349_umrah_print_engine_seed.sql"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Idempotent (NOT EXISTS guard present)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P4 §A — migration is idempotent via NOT EXISTS", () => {
  it("INSERT … SELECT pairs with a WHERE NOT EXISTS guard", () => {
    expect(MIGRATION).toMatch(
      /WHERE\s+NOT\s+EXISTS\s*\([\s\S]{0,500}?FROM\s+document_templates\s+dt[\s\S]{0,500}?presetKey[\s\S]{0,200}?'classic'/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — System-default scope (companyId NULL)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P4 §B — rows are inserted as system defaults (companyId NULL)", () => {
  it("no INSERT explicitly populates a non-NULL companyId for the seeded preset", () => {
    // The INSERT is `INSERT INTO document_templates (...names...) SELECT
    // (label||..., desc, entity_type, ...) FROM (VALUES ...)` — no
    // companyId in the column list and no value supplied. By omission
    // the column defaults to NULL.
    expect(MIGRATION).toMatch(
      /INSERT\s+INTO\s+document_templates\s*\(\s*name,\s*description,\s*"entityType",[\s\S]{0,200}?\)\s*SELECT/,
    );
    expect(MIGRATION).not.toMatch(
      /INSERT\s+INTO\s+document_templates\s*\([^)]*"companyId"/,
    );
  });

  it("NOT EXISTS guard checks companyId IS NULL", () => {
    expect(MIGRATION).toMatch(/dt\."companyId"\s+IS\s+NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Preset key matches the resolver fallback
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P4 §C — presetKey = 'classic' so the resolver step 4 finds it", () => {
  it("'classic' is the literal in the INSERT", () => {
    // The presetKey value in the SELECT is the literal 'classic'.
    expect(MIGRATION).toMatch(/'classic'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — All 10 expected umrah entity types are present
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P4 §D — the 10 umrah entity types are seeded", () => {
  for (const entityType of [
    "umrah_pilgrim",
    "umrah_invoice",
    "umrah_agent_invoice",
    "umrah_agent",
    "umrah_sub_agent",
    "umrah_penalty",
    "umrah_violation",
    "umrah_transport",
    "umrah_package",
    "umrah_season",
  ]) {
    it(`seeds ${entityType}`, () => {
      expect(MIGRATION).toMatch(new RegExp(`'${entityType}'`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Pure additive (no UPDATE / DELETE)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P4 §E — migration is purely additive", () => {
  it("no UPDATE statement against document_templates", () => {
    expect(MIGRATION).not.toMatch(/UPDATE\s+document_templates/i);
  });

  it("no DELETE statement against document_templates (rollback is in a comment, not executable)", () => {
    // The @rollback block is in a SQL comment (-- prefix). The
    // committable SQL must NOT contain a DELETE.
    const executable = MIGRATION
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/DELETE\s+FROM\s+document_templates/i);
  });
});
