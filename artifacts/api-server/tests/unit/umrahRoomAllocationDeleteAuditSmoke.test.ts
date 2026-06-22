import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Soft-delete of umrah_room_allocations now carries a full audit
 * trail. Before this fix the DELETE handler silently flipped
 * deletedAt to NOW() with no audit log — when housekeeping disputed
 * who was unassigned from which room, the trail showed nothing.
 *
 * Fix snapshots the row before the delete so audit `before` carries
 * `pilgrimId`, `roomNumber`, `blockId`, `occupants`, `checkInAt`,
 * `checkOutAt` — every column on the live schema — enough to
 * reconstruct the assignment after the fact. (Columns verified
 * against db/schema_pre.sql; audit:schema-drift guard rejects any
 * quoted identifier the schema dump doesn't carry.)
 */

// U-07 Phase 4: room-allocation routes now live in the dedicated sub-router.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-accommodation.ts"),
  "utf8",
);

describe("DELETE /umrah/room-allocations/:id — audit trail", () => {
  it("snapshots the row BEFORE the soft-delete (otherwise audit `before` is empty)", () => {
    // Drift alarm: if anyone re-orders so the UPDATE runs first then
    // the rawQuery SELECT, the existing-row read returns NULL and the
    // audit `before` becomes empty. The select must precede the update.
    const selectIdx = ROUTE.indexOf('SELECT "pilgrimId", "roomNumber", "blockId", occupants, "checkInAt", "checkOutAt"');
    const updateIdx = ROUTE.indexOf('UPDATE umrah_room_allocations SET "deletedAt"');
    expect(selectIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(selectIdx);
  });

  it("snapshot is scoped by companyId AND deletedAt IS NULL (so already-deleted rows return nothing)", () => {
    expect(ROUTE).toMatch(/SELECT "pilgrimId", "roomNumber", "blockId", occupants, "checkInAt", "checkOutAt"\s*\n\s*FROM umrah_room_allocations\s*\n\s*WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
  });

  it("audit + event fire only when the UPDATE actually touched a row (no phantom audit)", () => {
    expect(ROUTE).toMatch(/if \(affectedRows > 0 && existing\) \{/);
  });

  it("audit before-payload carries the full snapshot for reconstruction", () => {
    // U-07 Phase 4: auditFromRequest(req, action, entity, id, {before, after})
    // — action is a positional arg, not a named property.
    expect(ROUTE).toMatch(/auditFromRequest\(req, "umrah\.room_allocation\.deleted"[\s\S]{0,400}before: existing/);
  });

  it("event details broadcast pilgrim + block ids (no row-by-row room geometry)", () => {
    // pilgrim and block are the join keys consumers care about for
    // cascade reactions (e.g. invalidating a billed-nights cache or
    // refreshing a room-block availability tile). The room number,
    // occupants count, and check-in/out timestamps are housekeeping
    // detail that stays in the RBAC-gated audit log.
    expect(ROUTE).toMatch(/emitEvent\(\{[\s\S]{0,500}action: "umrah\.room_allocation\.deleted"[\s\S]{0,400}details: JSON\.stringify\(\{ pilgrimId: existing\.pilgrimId, blockId: existing\.blockId \}\)/);
  });

  it("event emit error is caught — a background failure must not break the response", () => {
    expect(ROUTE).toMatch(/\.catch\(\(e\) => logger\.error\(e, "umrah room-allocation delete event emit failed"\)\)/);
  });
});
