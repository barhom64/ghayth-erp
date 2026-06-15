import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-15-P4 — deprecation marker on umrah_pilgrims."hotelName".
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-15 audit §3.4):
 *   - Migration 365 adds a COMMENT ON COLUMN marking the field as
 *     deprecated.
 *   - No NEW route writes to `hotelName`. The two legacy writers
 *     (POST /umrah/pilgrims and PUT /umrah/pilgrims/:id) are
 *     grandfathered.
 *   - The accommodation_bookings 3-table model (migration 246) is
 *     the authoritative path.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No DDL drop (that's U-15-P6, hard-pause).
 *   - No engine touch.
 *   - No FE change.
 *   - No silent rewrite of legacy callers — they keep working.
 *
 * Failure modes pinned:
 *   - Migration removed / renamed → §A fails.
 *   - The COMMENT text loses the DEPRECATED marker → §B fails.
 *   - A THIRD writer of hotelName appears anywhere in src/routes or
 *     src/lib → §C fails (would re-establish the bad write surface
 *     after we explicitly froze it).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const MIGRATION = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/api-server/src/migrations/365_umrah_pilgrims_hotelname_deprecation.sql",
  ),
  "utf8",
);

const ROUTES_UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);

const ROUTES_UMRAH_ENTITIES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);

const IMPORT_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahImportEngine.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Migration exists with the COMMENT statement
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P4 §A — migration adds a COMMENT ON COLUMN for hotelName", () => {
  it("file is non-empty + targets the right column", () => {
    expect(MIGRATION).toMatch(
      /COMMENT\s+ON\s+COLUMN\s+umrah_pilgrims\."hotelName"\s+IS/i,
    );
  });

  it("does NOT include any DDL drop / alter (P6 territory)", () => {
    expect(MIGRATION).not.toMatch(/DROP\s+COLUMN/i);
    expect(MIGRATION).not.toMatch(/ALTER\s+TABLE/i);
  });

  it("does NOT include a data UPDATE / INSERT (no silent backfill)", () => {
    expect(MIGRATION).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(MIGRATION).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — COMMENT text carries the canonical [DEPRECATED — U-15-P4] marker
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P4 §B — comment text carries the canonical deprecation marker", () => {
  it("includes the [DEPRECATED — U-15-P4] tag", () => {
    expect(MIGRATION).toMatch(/\[DEPRECATED\s*[—\-]\s*U-15-P4\]/);
  });

  it("points operators at the accommodation_bookings replacement", () => {
    expect(MIGRATION).toMatch(/accommodation_bookings/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — No NEW writer of hotelName beyond the 2 grandfathered ones
// ─────────────────────────────────────────────────────────────────────────────
// The legacy write paths live exclusively in `routes/umrah.ts`:
//   - POST /umrah/pilgrims  — INSERT INTO umrah_pilgrims (..., "hotelName", ...)
//   - PUT  /umrah/pilgrims/:id — dynamic UPDATE using `fieldKeys` array
//     that includes the string "hotelName".
// We pin BOTH the INSERT count + the fieldKeys reference + the absence
// of any equivalent write surface in routes/umrah-entities.ts (the new
// wave-5 path) and lib/umrahImportEngine.ts (the bulk import — must
// keep flowing through accommodation_bookings only).
describe("U-15-P4 §C — no NEW writer of hotelName beyond the grandfathered umrah.ts pair", () => {
  it("exactly 1 INSERT into umrah_pilgrims mentions hotelName (the legacy create)", () => {
    const inserts =
      ROUTES_UMRAH.match(/INSERT\s+INTO\s+umrah_pilgrims[\s\S]{0,2000}?"hotelName"/g) ?? [];
    expect(inserts.length).toBe(1);
  });

  it("the legacy PUT's fieldKeys array still references 'hotelName' (grandfathered)", () => {
    expect(ROUTES_UMRAH).toMatch(/fieldKeys\s*=\s*\[[\s\S]{0,500}?"hotelName"/);
  });

  it("the wave-5 path (umrah-entities.ts) does NOT INSERT hotelName", () => {
    expect(ROUTES_UMRAH_ENTITIES).not.toMatch(
      /INSERT\s+INTO\s+umrah_pilgrims[\s\S]{0,2000}?"hotelName"/,
    );
  });

  it("the bulk import (umrahImportEngine.ts) does NOT INSERT hotelName (must flow through accommodation_bookings)", () => {
    expect(IMPORT_ENGINE).not.toMatch(
      /INSERT\s+INTO\s+umrah_pilgrims[\s\S]{0,2000}?"hotelName"/,
    );
  });
});
