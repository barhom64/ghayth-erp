import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the families entity scaffolding:
 *
 *   1. Schema — migration 265 creates `umrah_families` + adds the
 *      `umrah_pilgrims.familyId` back-reference. The umrah_pilgrims
 *      column is nullable + ON DELETE SET NULL so deleting a family
 *      doesn't cascade-delete its members.
 *
 *   2. CRUD — GET (list + detail) / POST / PATCH / DELETE on
 *      `/umrah/families`. Same tenant-scoping pattern every other
 *      umrah entity uses (companyId + deletedAt on every query).
 *
 *   3. headPilgrimId integrity — POST + PATCH verify the head exists
 *      in the same tenant before saving. Without this, a stale FK
 *      number could leak a pilgrim name from another company into
 *      the requesting tenant's family record.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/265_umrah_families.sql"),
  "utf8",
);
// U-07 Phase 2 — families CRUD now lives in its own sub-router file.
// Mounted via umrah-entities.ts so the URL surface (/umrah/families/...)
// is unchanged, but the route definitions themselves moved here.
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-families.ts"),
  "utf8",
);

describe("migration 265 — umrah_families table", () => {
  it("creates the families table with the expected columns", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS umrah_families/);
    expect(MIGRATION).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
    expect(MIGRATION).toMatch(/"familyName"\s+VARCHAR\(200\) NOT NULL/);
    expect(MIGRATION).toMatch(/"headPilgrimId" INTEGER REFERENCES umrah_pilgrims\(id\) ON DELETE SET NULL/);
    expect(MIGRATION).toMatch(/"contactPhone" VARCHAR/);
    expect(MIGRATION).toMatch(/"contactName"\s+VARCHAR/);
    expect(MIGRATION).toMatch(/notes\s+TEXT/);
    expect(MIGRATION).toMatch(/"deletedAt"\s+TIMESTAMPTZ/);
  });

  it("adds the back-pointer column on umrah_pilgrims (nullable + SET NULL)", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE umrah_pilgrims\s+ADD COLUMN IF NOT EXISTS "familyId" INTEGER REFERENCES umrah_families\(id\) ON DELETE SET NULL/);
  });

  it("indexes the common access paths", () => {
    expect(MIGRATION).toMatch(/idx_umrah_families_companyId/);
    expect(MIGRATION).toMatch(/idx_umrah_families_head/);
    // Partial index on the back-ref so the planner can find members
    // quickly without scanning the family-less pilgrims.
    expect(MIGRATION).toMatch(/idx_umrah_pilgrims_familyId[\s\S]{0,200}WHERE "familyId" IS NOT NULL AND "deletedAt" IS NULL/);
  });
});

describe("umrah-entities.ts — families CRUD endpoints", () => {
  it("GET /families with search + member-count aggregate", () => {
    expect(ROUTES).toMatch(/router\.get\("\/families"/);
    expect(ROUTES).toMatch(/SELECT COUNT\(\*\)::int FROM umrah_pilgrims p[\s\S]{0,200}p\."familyId" = f\.id/);
  });

  it("GET /families/:id surfaces members + the head's name", () => {
    expect(ROUTES).toMatch(/router\.get\("\/families\/:id"/);
    expect(ROUTES).toMatch(/SELECT id, "fullName", "passportNumber", "nuskNumber"[\s\S]{0,200}"familyId" = \$1/);
  });

  it("POST /families validates head ownership in the same tenant", () => {
    // The head-pilgrim integrity check — without it a stale FK could
    // surface another company's pilgrim name on our row.
    expect(ROUTES).toMatch(/router\.post\("\/families"/);
    expect(ROUTES).toMatch(/SELECT id FROM umrah_pilgrims[\s\S]{0,200}id = \$1 AND "companyId" = \$2/);
    expect(ROUTES).toMatch(/throw new ValidationError\("رئيس العائلة غير موجود في النظام"/);
  });

  it("POST /families inserts + emits audit + event", () => {
    expect(ROUTES).toMatch(/INSERT INTO umrah_families[\s\S]{0,200}"familyName","headPilgrimId"/);
    // U-07 Phase 2 — audit calls migrated from createAuditLog({...}) to
    // auditFromRequest(req, action, entity, entityId, {...}) so the IGOC
    // context (activeRoleKey/activeDepartmentId/resolvedScope/impersonation)
    // lands on every row.
    expect(ROUTES).toMatch(/auditFromRequest\(\s*req,\s*"create",\s*"umrah_families"/);
    expect(ROUTES).toMatch(/action: "umrah\.family\.created"/);
  });

  it("PATCH /families/:id supports partial updates without blanking other fields", () => {
    // Build SET clause from present-only fields — single-field update
    // doesn't accidentally null the others.
    expect(ROUTES).toMatch(/router\.patch\("\/families\/:id"/);
    expect(ROUTES).toMatch(/sets\.push\(`"\$\{col\}" = \$\$\{params\.length\}`\)/);
    expect(ROUTES).toMatch(/UPDATE umrah_families[\s\S]{0,200}SET \$\{sets\.join\(", "\)\}/);
  });

  it("DELETE /families/:id is a soft delete (deletedAt timestamp)", () => {
    expect(ROUTES).toMatch(/router\.delete\("\/families\/:id"/);
    expect(ROUTES).toMatch(/UPDATE umrah_families[\s\S]{0,200}SET "deletedAt" = NOW\(\)/);
  });

  it("every endpoint enforces tenant scoping (companyId + deletedAt)", () => {
    // Count tenant-scoped WHERE clauses in the families block — every
    // query MUST touch both columns; if a future refactor drops one,
    // this assertion catches it.
    // U-07 Phase 2 — the whole file IS the families block now (5 routes).
    const familiesBlock = ROUTES;
    const companyChecks = familiesBlock.match(/"companyId" = \$\d/g) ?? [];
    const deletedChecks = familiesBlock.match(/"deletedAt" IS NULL/g) ?? [];
    // 6 WHERE-clause `companyId = $N` checks across GET list, GET detail,
    // POST head verify, PATCH head verify, PATCH update, DELETE. The
    // POST insert passes companyId as a value (no WHERE) and doesn't
    // need a guard. The `deletedAt IS NULL` count is symmetric.
    expect(companyChecks.length).toBeGreaterThanOrEqual(6);
    expect(deletedChecks.length).toBeGreaterThanOrEqual(6);
  });
});
