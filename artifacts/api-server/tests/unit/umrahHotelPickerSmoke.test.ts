import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-15-P3 — FE hotel picker smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-15 audit §3.3):
 *   - The free-text `hotelName` input on the pilgrim create + edit
 *     forms is replaced by a `FormSelectField` whose options come from
 *     /umrah/hotels (the N6 hotel CRUD).
 *   - Value still travels as the hotel NAME (string) so the backend
 *     schema is unchanged — U-15-P3 is a UX-only improvement; the
 *     hotelName → hotelId switch is U-15-P6 territory.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No backend API change. No migration.
 *   - No swap from text-column to FK column.
 *
 * Failure modes pinned:
 *   - Picker disappears from either page → §A fails.
 *   - Picker drops the /umrah/hotels source → §B fails.
 *   - Free-text TextField regresses back in → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const CREATE_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/pilgrim-create.tsx"),
  "utf8",
);
const DETAIL_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Both pages render a Select-style hotel picker
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P3 §A — pilgrim create + edit forms render a hotel picker", () => {
  it("pilgrim-create.tsx uses FormSelectField for hotelName", () => {
    expect(CREATE_PAGE).toMatch(
      /<FormSelectField[\s\S]{0,500}name=\s*["']hotelName["'][\s\S]{0,200}label=\s*["']الفندق["']/,
    );
  });

  it("pilgrim-detail.tsx uses FormSelectField for hotelName", () => {
    expect(DETAIL_PAGE).toMatch(
      /<FormSelectField[\s\S]{0,500}name=\s*["']hotelName["'][\s\S]{0,200}label=\s*["']الفندق["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Options come from the /umrah/hotels source
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P3 §B — picker options sourced from /umrah/hotels", () => {
  it("pilgrim-create.tsx fetches /umrah/hotels via useApiQuery", () => {
    expect(CREATE_PAGE).toMatch(
      /useApiQuery<[^>]*>\(\s*\[\s*["']umrah-hotels["']\s*\]\s*,\s*["']\/umrah\/hotels["']\s*\)/,
    );
  });

  it("pilgrim-detail.tsx fetches /umrah/hotels via useApiQuery", () => {
    expect(DETAIL_PAGE).toMatch(
      /useApiQuery<[^>]*>\(\s*\[\s*["']umrah-hotels["']\s*\]\s*,\s*["']\/umrah\/hotels["']\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Free-text TextField no longer used for hotelName (regression guard)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-15-P3 §C — free-text TextField on hotelName is gone", () => {
  // Anchor on the same-line pattern <FormTextField name="hotelName" so a
  // FormTextField for a DIFFERENT field followed by a hotelName picker
  // a few lines later doesn't false-positive.
  it("pilgrim-create.tsx no longer renders FormTextField with name='hotelName'", () => {
    expect(CREATE_PAGE).not.toMatch(/<FormTextField[^>]{0,200}name=\s*["']hotelName["']/);
  });

  it("pilgrim-detail.tsx no longer renders FormTextField with name='hotelName'", () => {
    expect(DETAIL_PAGE).not.toMatch(/<FormTextField[^>]{0,200}name=\s*["']hotelName["']/);
  });
});
