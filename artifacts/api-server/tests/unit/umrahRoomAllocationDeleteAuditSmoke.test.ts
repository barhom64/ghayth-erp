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
 * `pilgrimId`, `roomNumber`, `bedNumber`, `accommodationId` — enough
 * to reconstruct the assignment after the fact.
 */

const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);

describe("DELETE /umrah/room-allocations/:id — audit trail", () => {
  it("snapshots the row BEFORE the soft-delete (otherwise audit `before` is empty)", () => {
    // Drift alarm: if anyone re-orders so the UPDATE runs first then
    // the rawQuery SELECT, the existing-row read returns NULL and the
    // audit `before` becomes empty. The select must precede the update.
    const selectIdx = ROUTE.indexOf('SELECT "pilgrimId", "roomNumber", "bedNumber", "accommodationId"');
    const updateIdx = ROUTE.indexOf('UPDATE umrah_room_allocations SET "deletedAt"');
    expect(selectIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(selectIdx);
  });

  it("snapshot is scoped by companyId AND deletedAt IS NULL (so already-deleted rows return nothing)", () => {
    expect(ROUTE).toMatch(/SELECT "pilgrimId", "roomNumber", "bedNumber", "accommodationId"\s*\n\s*FROM umrah_room_allocations\s*\n\s*WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
  });

  it("audit + event fire only when the UPDATE actually touched a row (no phantom audit)", () => {
    expect(ROUTE).toMatch(/if \(affectedRows > 0 && existing\) \{/);
  });

  it("audit before-payload carries the full snapshot for reconstruction", () => {
    expect(ROUTE).toMatch(/action: "umrah\.room_allocation\.deleted"[\s\S]{0,400}before: existing/);
  });

  it("event details broadcast pilgrim + accommodation ids (no row-by-row room geometry)", () => {
    // pilgrim and accommodation are the join keys consumers care about
    // for cascade reactions (e.g. invalidating a billed-nights cache).
    // The room/bed numbers are housekeeping detail and stay in the
    // RBAC-gated audit.
    expect(ROUTE).toMatch(/emitEvent\(\{[\s\S]{0,500}action: "umrah\.room_allocation\.deleted"[\s\S]{0,400}details: JSON\.stringify\(\{ pilgrimId: existing\.pilgrimId, accommodationId: existing\.accommodationId \}\)/);
  });

  it("event emit error is caught — a background failure must not break the response", () => {
    expect(ROUTE).toMatch(/\.catch\(\(e\) => logger\.error\(e, "umrah room-allocation delete event emit failed"\)\)/);
  });
});
