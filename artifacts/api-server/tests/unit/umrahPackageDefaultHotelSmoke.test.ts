import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-15-P1 — schema additive migration for the package → default hotel
 * link.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-15 audit §3.1):
 *   - Migration 350_umrah_package_default_hotel.sql adds nullable
 *     `defaultHotelId` to umrah_packages.
 *   - No FK constraint. No backfill. No engine touch.
 *   - Partial index supports the future U-15-P5 pricing-drift
 *     report query.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No resolution-helper wiring (U-15-P2).
 *   - No FE hotel-picker on the package editor (U-15-P3).
 *   - No deprecation of pilgrim.hotelName (U-15-P4).
 *   - No pricing-drift report (U-15-P5).
 *   - The resolution order from migration 246 stays untouched —
 *     allocation > hotelName > (new) package > unknown is the
 *     proposed P2 layering; the column alone changes nothing.
 *
 * Failure modes pinned:
 *   - Migration drops the IF NOT EXISTS guard → §A fails on re-run.
 *   - Migration adds NOT NULL or DEFAULT → §B fails (would block
 *     legacy packages from inserting without a hotel).
 *   - Migration adds a FK constraint → §C fails (no FK by design).
 *   - Engine starts reading package.defaultHotelId ahead of P2
 *     → §D fails (P2 hard-pause guard via comment marker).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/350_umrah_package_default_hotel.sql"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Migration shape: additive + idempotent
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P1 §A — migration adds nullable defaultHotelId additively", () => {
  it("uses ADD COLUMN IF NOT EXISTS for defaultHotelId (idempotent re-run)", () => {
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS\s+"defaultHotelId"\s+integer/,
    );
  });

  it("operates on umrah_packages (the package table, not hotels/blocks)", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE\s+umrah_packages/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE\s+umrah_hotels/);
    expect(MIGRATION).not.toMatch(/ALTER TABLE\s+umrah_room_blocks/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Nullable, no DEFAULT, no backfill
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P1 §B — column is nullable with no DEFAULT and no backfill", () => {
  it("defaultHotelId has no NOT NULL constraint", () => {
    expect(MIGRATION).not.toMatch(/"defaultHotelId"\s+integer\s+NOT NULL/i);
  });

  it("defaultHotelId has no DEFAULT clause", () => {
    expect(MIGRATION).not.toMatch(/"defaultHotelId"\s+integer\s+DEFAULT/i);
  });

  it("no UPDATE statement (zero backfill)", () => {
    // Backfill is the operator's job via the editor in U-15-P3.
    // The migration only adds the shape.
    expect(MIGRATION).not.toMatch(/UPDATE\s+umrah_packages/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — No FK constraint
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P1 §C — no FK constraint on defaultHotelId", () => {
  it("no REFERENCES clause for defaultHotelId", () => {
    expect(MIGRATION).not.toMatch(
      /"defaultHotelId"[\s\S]{0,200}?REFERENCES\s+umrah_hotels/i,
    );
  });

  it("no ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY", () => {
    expect(MIGRATION).not.toMatch(/ADD CONSTRAINT[\s\S]{0,200}?FOREIGN KEY/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Partial index supports the breakdown query
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P1 §D — partial index for the future report query", () => {
  it("indexes companyId+defaultHotelId where defaultHotelId IS NOT NULL", () => {
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS\s+idx_umrah_packages_default_hotel[\s\S]{0,400}?\("companyId",\s*"defaultHotelId"\)[\s\S]{0,200}?WHERE\s+"defaultHotelId"\s+IS NOT NULL/,
    );
  });
});
