import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-15-P2 — resolution helper for the package/accommodation
 * classification.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-15 audit §3.2):
 *   - New `resolveHotelForPilgrim(companyId, pilgrimId)` helper in
 *     `lib/umrahHotelResolution.ts` exposes the canonical chain:
 *       allocation > hotelName > package > unknown
 *   - Read-only. Tenant-scoped via companyId + deletedAt IS NULL
 *     on every join.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. No migration. No FE. No new schema.
 *   - The helper itself does NOT decide what to render — callers
 *     get { source, hotelId, hotelName } and choose presentation.
 *   - U-15-P3 (FE picker) + U-15-P4 (hotelName deprecation) +
 *     U-15-P5 (pricing-drift report) are separate slices.
 *
 * Failure modes pinned:
 *   - Resolution order swapped (e.g. hotelName beats allocation)
 *     → §A fails (would silently flip migration 246's contract).
 *   - Tenant scope guard dropped on any query → §B fails.
 *   - Helper starts writing → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahHotelResolution.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Resolution order is allocation > hotelName > package > unknown
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P2 §A — resolution chain runs in the documented order", () => {
  it("source 'allocation' is checked FIRST (allocation join precedes hotelName lookup)", () => {
    const allocIdx = HELPER.indexOf('source: "allocation"');
    const hotelNameIdx = HELPER.indexOf('source: "hotelName"');
    const packageIdx = HELPER.indexOf('source: "package"');
    // `unknown` appears twice: once as a defensive early-return when
    // the pilgrim row is missing (between the allocation and hotelName
    // branches), and once as the final fallback. The smoke pins the
    // FINAL fallback's position via lastIndexOf — that's the one the
    // resolution-chain order is about.
    const unknownFinalIdx = HELPER.lastIndexOf('source: "unknown"');
    expect(allocIdx).toBeGreaterThan(-1);
    expect(hotelNameIdx).toBeGreaterThan(allocIdx);
    expect(packageIdx).toBeGreaterThan(hotelNameIdx);
    expect(unknownFinalIdx).toBeGreaterThan(packageIdx);
  });

  it("returns { source: \"allocation\" } from the room-allocations branch", () => {
    expect(HELPER).toMatch(
      /umrah_room_allocations[\s\S]{0,2000}?source:\s*["']allocation["']/,
    );
  });

  it("returns { source: \"hotelName\" } from the legacy string branch", () => {
    expect(HELPER).toMatch(/source:\s*["']hotelName["']/);
  });

  it("returns { source: \"package\" } from the defaultHotelId branch", () => {
    expect(HELPER).toMatch(
      /"defaultHotelId"[\s\S]{0,800}?source:\s*["']package["']/,
    );
  });

  it("returns { source: \"unknown\" } when nothing resolves", () => {
    expect(HELPER).toMatch(/source:\s*["']unknown["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Tenant scope guard on every query
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P2 §B — every aggregate query is companyId + deletedAt scoped", () => {
  it("allocation chain joins on ra.companyId + filters companyId=$1 + deletedAt IS NULL", () => {
    expect(HELPER).toMatch(
      /FROM\s+umrah_room_allocations[\s\S]{0,1200}?"companyId"\s*=\s*\$1[\s\S]{0,200}?"deletedAt"\s+IS\s+NULL/,
    );
  });

  it("pilgrim SELECT filters by id + companyId + deletedAt IS NULL", () => {
    expect(HELPER).toMatch(
      /FROM\s+umrah_pilgrims[\s\S]{0,300}?WHERE\s+id\s*=\s*\$1[\s\S]{0,200}?"companyId"\s*=\s*\$2[\s\S]{0,200}?"deletedAt"\s+IS\s+NULL/,
    );
  });

  it("package SELECT filters by id + companyId + deletedAt IS NULL", () => {
    expect(HELPER).toMatch(
      /FROM\s+umrah_packages[\s\S]{0,300}?WHERE\s+id\s*=\s*\$1[\s\S]{0,200}?"companyId"\s*=\s*\$2[\s\S]{0,200}?"deletedAt"\s+IS\s+NULL/,
    );
  });

  it("hotel SELECT filters by id + companyId + deletedAt IS NULL", () => {
    expect(HELPER).toMatch(
      /FROM\s+umrah_hotels[\s\S]{0,300}?WHERE\s+id\s*=\s*\$1[\s\S]{0,200}?"companyId"\s*=\s*\$2[\s\S]{0,200}?"deletedAt"\s+IS\s+NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Pure read path (no writes)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P2 §C — helper makes ZERO writes", () => {
  it("no INSERT", () => {
    expect(HELPER).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("no UPDATE", () => {
    expect(HELPER).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
  });

  it("no DELETE", () => {
    expect(HELPER).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("uses rawQuery (not rawExecute or withTransaction)", () => {
    expect(HELPER).toMatch(/import\s+\{\s*rawQuery\s*\}\s+from/);
    expect(HELPER).not.toMatch(/rawExecute/);
    expect(HELPER).not.toMatch(/withTransaction/);
  });
});
