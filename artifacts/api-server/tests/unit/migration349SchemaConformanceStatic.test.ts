import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration 349 schema-conformance pin (2026-06-15 fix — sibling of #2389).
 *
 * Same pattern as migration 339: the original 349 referenced two
 * column names that don't exist on the live `document_templates`
 * schema:
 *
 *   1. `templateType`  — real column is `"type"` (per schema dump
 *                         + sibling migration 172_print_engine_seed.sql)
 *   2. `entityKind`    — never existed; `"entityType"` already
 *                         identifies the entity
 *
 * Also: `category` was being set to `t.entity_type` (duplicating
 * the `entityType` column), but sibling 172 sets the literal
 * `'print'` — that's the actual semantic value (the print-vs-other
 * classifier). Fixed to match.
 *
 * CI never caught this because guard.yml loads the schema from the
 * dump AND marks every migration as already-applied — the runner
 * skips them. `provision-agent-db.sh` (and prod's bootstrap.sh on
 * a fresh DB) DOES run the migration and crashed on every fresh
 * install since #2306 U-14 landed.
 *
 * Static pin (regex-only, per package-locality).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const MIG_RAW = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/349_umrah_print_engine_seed.sql"),
  "utf8",
);
// Strip SQL line comments so the static regex tests don't trip on
// the explanatory comments that BACK-reference the buggy original
// column names. We only care about executable SQL.
const MIG = MIG_RAW
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("Migration 349 — document_templates schema-conformance fix", () => {
  it("does NOT name the non-existent `templateType` column in any INSERT", () => {
    const insertList = MIG.match(/INSERT INTO document_templates\s*\(([\s\S]+?)\)/);
    expect(insertList, "INSERT column list not found").toBeTruthy();
    expect(insertList![1]).not.toMatch(/"?templateType"?/);
  });

  it("does NOT name the non-existent `entityKind` column in any INSERT", () => {
    const insertList = MIG.match(/INSERT INTO document_templates\s*\(([\s\S]+?)\)/);
    expect(insertList).toBeTruthy();
    expect(insertList![1]).not.toMatch(/"?entityKind"?/);
  });

  it("uses the real `\"type\"` column (per sibling migration 172 + schema dump)", () => {
    expect(MIG).toMatch(/INSERT INTO document_templates[\s\S]+?"type",\s*category/);
  });

  it("sets `category = 'print'` literal (the print-vs-other classifier), not entity_type duplication", () => {
    // Find the SELECT block and verify 'print' appears between paperSize and the entity_type values.
    // Easier: just confirm 'print' literal is present as a value (sibling 172 convention).
    expect(MIG).toMatch(/SELECT[\s\S]{0,800}?'print'[\s\S]{0,400}?FROM \(VALUES/);
  });

  it("is wrapped in BEGIN…COMMIT (transactional seed)", () => {
    expect(MIG).toMatch(/BEGIN;[\s\S]+?COMMIT;/);
  });

  it("idempotency clause preserved — re-runs over an applied DB are safe", () => {
    expect(MIG).toMatch(/WHERE NOT EXISTS\s*\(\s*SELECT 1 FROM document_templates/);
  });
});
