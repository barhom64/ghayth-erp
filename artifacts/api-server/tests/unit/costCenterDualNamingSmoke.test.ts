import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-cost-centers.ts"),
  "utf8",
);
const ALLOCATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/accountingAllocation.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/226_cost_centers_dual_naming_backfill.sql"),
  "utf8",
);

// ─── Cost-center dual-naming contract (audit finding F1) ──────────────────
//
// cost_centers carries BOTH `relatedEntityType`/`relatedEntityId` (mig 091)
// AND `linkedEntityType`/`linkedEntityId` (mig 203). Different code paths
// read from different pairs:
//
//   • routes/finance-cost-centers.ts (UI master data) → relatedEntity*
//   • routes/finance-reports.ts                        → relatedEntity*
//   • lib/accountingAllocation.ts from_* strategies    → linkedEntity*
//
// Until both pairs hold the same value, cost-centres authored via the UI
// are invisible to the resolver's from_vehicle / from_property /
// from_project / from_unit / from_contract / from_umrah_* strategies.
//
// These tests lock the fix: INSERT writes both pairs, migration 226
// backfills existing rows, allocation engine still reads linkedEntity*.

describe("UI route writes both naming pairs on INSERT", () => {
  it("INSERT lists both relatedEntityType + linkedEntityType columns", () => {
    const insertBlock = ROUTE.match(/INSERT INTO cost_centers \(([\s\S]{0,600}?)\)\s+VALUES/);
    expect(insertBlock).not.toBeNull();
    const cols = insertBlock![1];
    expect(cols).toContain('"relatedEntityType"');
    expect(cols).toContain('"relatedEntityId"');
    expect(cols).toContain('"linkedEntityType"');
    expect(cols).toContain('"linkedEntityId"');
  });

  it("VALUES list reuses $6 + $7 for the linked pair (single source of truth)", () => {
    // The two pairs should share the same placeholders so they can't
    // drift. Search for the exact `$6, $7, $6, $7` token sequence.
    const valuesMatch = ROUTE.match(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$6, \$7, \$8\)/);
    expect(valuesMatch).not.toBeNull();
  });

  it("PARAM array passes relatedEntityType / relatedEntityId once (placeholders reuse)", () => {
    // After the dual-write fix the params still pass the user input
    // ONCE — Postgres reuses the placeholder for the second pair.
    const paramsMatch = ROUTE.match(/\[scope\.companyId, code \|\| null, name, type \|\| "general", parentId \|\| null, relatedEntityType \|\| null, relatedEntityId \|\| null, allocatedAmount \|\| 0\]/);
    expect(paramsMatch).not.toBeNull();
  });
});

describe("allocation engine still reads linkedEntity* (no regression)", () => {
  it("resolveCostCenter still joins on linkedEntityType + linkedEntityId", () => {
    expect(ALLOCATION).toContain('"linkedEntityType"');
    expect(ALLOCATION).toContain('"linkedEntityId"');
  });
});

describe("migration 226 backfills both directions + adds index", () => {
  it("backfills linkedEntity* from relatedEntity* when missing", () => {
    expect(MIGRATION).toMatch(/UPDATE public\.cost_centers[\s\S]{0,300}SET "linkedEntityType" = "relatedEntityType"[\s\S]{0,200}WHERE "linkedEntityType" IS NULL[\s\S]{0,100}"relatedEntityType" IS NOT NULL/);
  });

  it("backfills relatedEntity* from linkedEntity* when missing (covers the inverse)", () => {
    expect(MIGRATION).toMatch(/UPDATE public\.cost_centers[\s\S]{0,300}SET "relatedEntityType" = "linkedEntityType"[\s\S]{0,200}WHERE "relatedEntityType" IS NULL[\s\S]{0,100}"linkedEntityType" IS NOT NULL/);
  });

  it("creates a partial composite index matching the resolver's access pattern", () => {
    expect(MIGRATION).toContain("idx_cost_centers_linked_entity");
    expect(MIGRATION).toContain('"companyId", "linkedEntityType", "linkedEntityId"');
    expect(MIGRATION).toContain('WHERE "linkedEntityType" IS NOT NULL AND "linkedEntityId" IS NOT NULL');
  });

  it("backfill statements use IS NULL gates so rerunning is idempotent", () => {
    // Both UPDATE blocks must guard with `WHERE <target> IS NULL` so a
    // second run doesn't overwrite anything.
    const updates = MIGRATION.match(/UPDATE public\.cost_centers/g) ?? [];
    expect(updates.length).toBe(2);
    const islNullMatches = MIGRATION.match(/IS NULL\s+AND/g) ?? [];
    expect(islNullMatches.length).toBeGreaterThanOrEqual(2);
  });
});
