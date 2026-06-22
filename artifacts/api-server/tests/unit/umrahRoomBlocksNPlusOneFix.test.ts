/**
 * Umrah room-blocks list — N+1 fix static guard.
 *
 * The room-blocks list endpoint carried a correlated scalar COUNT
 * subquery on umrah_room_allocations:
 *
 *     (SELECT COUNT(*) FROM umrah_room_allocations a
 *      WHERE a."blockId" = b.id AND a."deletedAt" IS NULL)
 *       AS "allocatedCount"
 *
 * Postgres planned that once per returned row, so at LIMIT 500 a
 * single list call fired 501 lookups through
 * umrah_room_allocations. Same N+1 shape as the earlier fixes,
 * applied to a seventeenth site.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * allocation counts once and joins the per-block result back via a
 * LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
// U-07 Phase 4: room-blocks routes now live in the dedicated sub-router.
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-accommodation.ts"),
  "utf8",
);

describe("Umrah room-blocks list — umrah_room_allocations N+1 fix", () => {
  // Anchor on the /room-blocks handler.
  const handlerIdx = SRC.indexOf('router.get("/room-blocks"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 2500);

  it("the /room-blocks handler is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar COUNT subquery on umrah_room_allocations for blockId = b.id", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+umrah_room_allocations\s+a\s+WHERE\s+a\."blockId"\s*=\s*b\.id/,
    );
  });

  it("uses an alloc_counts CTE to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH alloc_counts AS");
    expect(handler).toContain('SELECT "blockId", COUNT(*) AS "allocatedCount"');
    expect(handler).toContain("FROM umrah_room_allocations");
    expect(handler).toContain('"deletedAt" IS NULL');
    expect(handler).toContain('GROUP BY "blockId"');
  });

  it("LEFT JOINs alloc_counts back to umrah_room_blocks by blockId", () => {
    expect(handler).toMatch(
      /LEFT JOIN alloc_counts ac ON ac\."blockId" = b\.id/,
    );
  });

  it("COALESCEs the allocatedCount so blocks with no allocations return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(ac."allocatedCount", 0)::int AS "allocatedCount"');
  });
});
