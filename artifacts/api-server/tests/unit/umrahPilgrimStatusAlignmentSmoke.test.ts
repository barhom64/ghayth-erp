import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Same pilgrim, two badges, two labels — pinned.
 *
 *   `pilgrim-detail.tsx` had its own STATUS_OPTIONS dictionary that
 *   labelled `overstayed` as "متأخر" while the canonical STATUS_MAP in
 *   `<PageStatusBadge>` labelled the same value as "متجاوز". Because
 *   the page renders the status TWICE (once via PageStatusBadge in the
 *   audit-trail table, once via the local map in the page-header strip),
 *   the same pilgrim showed up with two different Arabic terms in
 *   different cells of the SAME page. Confusing for operators.
 *
 *   Also `cancelled` was "ملغي" locally vs "ملغى" canonically.
 *
 *   Fix: align the local STATUS_OPTIONS to the canonical STATUS_MAP
 *   wording. The terms are now identical wherever the pilgrim's status
 *   is displayed.
 */
const BADGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/page-status-badge.tsx"),
  "utf8",
);
const PILGRIM_DETAIL = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

describe("pilgrim-detail status options align with canonical STATUS_MAP", () => {
  it("PageStatusBadge umrah block labels overstayed as 'متجاوز' (overstayed, not late)", () => {
    // The umrah lifecycle uses "متجاوز" (exceeded / overstayed visa) — the
    // pilgrim has stayed past the permitted period. "متأخر" (late) is
    // about being delayed for something, which isn't the right semantic
    // for a visa overstay.
    expect(BADGE).toMatch(/umrah:\s*\{[\s\S]{0,200}overstayed:\s*\{\s*label:\s*"متجاوز"/);
  });

  it("pilgrim-detail STATUS_OPTIONS labels overstayed as 'متجاوز' too — same word both places", () => {
    expect(PILGRIM_DETAIL).toMatch(/\{\s*value:\s*"overstayed",\s*label:\s*"متجاوز"\s*\}/);
    // And the legacy "متأخر" label is gone for this value.
    expect(PILGRIM_DETAIL).not.toMatch(/\{\s*value:\s*"overstayed",\s*label:\s*"متأخر"\s*\}/);
  });

  it("cancelled uses the canonical 'ملغى' spelling, not the local 'ملغي'", () => {
    // Canonical STATUS_MAP uses "ملغى" everywhere (passive participle of
    // ألغى). The local map had "ملغي" (active participle) which reads as
    // "cancelling" not "cancelled" — minor but pinned.
    expect(BADGE).toMatch(/cancelled:\s*\{\s*label:\s*"ملغى"/);
    expect(PILGRIM_DETAIL).toMatch(/\{\s*value:\s*"cancelled",\s*label:\s*"ملغى"\s*\}/);
    expect(PILGRIM_DETAIL).not.toMatch(/\{\s*value:\s*"cancelled",\s*label:\s*"ملغي"\s*\}/);
  });

  it("arrived / departed / violated already aligned (regression guard)", () => {
    // These were already aligned but pin them so a future edit to either
    // file can't silently drift one term away from the other.
    expect(PILGRIM_DETAIL).toMatch(/\{\s*value:\s*"arrived",\s*label:\s*"وصل"\s*\}/);
    expect(PILGRIM_DETAIL).toMatch(/\{\s*value:\s*"departed",\s*label:\s*"غادر"\s*\}/);
    expect(PILGRIM_DETAIL).toMatch(/\{\s*value:\s*"violated",\s*label:\s*"مخالف"\s*\}/);
    expect(BADGE).toMatch(/arrived:\s*\{\s*label:\s*"وصل"/);
    expect(BADGE).toMatch(/departed:\s*\{\s*label:\s*"غادر"/);
    expect(BADGE).toMatch(/violated:\s*\{\s*label:\s*"مخالف"/);
  });
});
