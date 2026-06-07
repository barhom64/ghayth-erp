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
const PILGRIMS_LIST = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);
const STATUS_MODULE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/umrah-pilgrim-status.ts"),
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

  it("the canonical status module is the SOLE source — list duplicates are gone", () => {
    // Three different files used to carry their own copy of this dict
    // (pilgrim-detail STATUS_OPTIONS, pilgrims.tsx PILGRIM_STATUS_OPTIONS,
    // pilgrims.tsx AdvancedFilters statuses). After the extraction, only
    // the module carries the literal pairs — every consumer imports it.
    expect(STATUS_MODULE).toMatch(/UMRAH_PILGRIM_STATUS_OPTIONS[\s\S]{0,400}value:\s*"overstayed",\s*label:\s*"متجاوز"/);
    expect(STATUS_MODULE).toMatch(/UMRAH_PILGRIM_STATUS_OPTIONS[\s\S]{0,400}value:\s*"cancelled",\s*label:\s*"ملغى"/);

    // No raw status-option array literal survives in either page file.
    // (The "متأخر" / "ملغي" mis-spellings can't reappear because the
    // dictionary doesn't live here anymore.)
    expect(PILGRIM_DETAIL).not.toMatch(/value:\s*"overstayed",\s*label:\s*"/);
    expect(PILGRIMS_LIST).not.toMatch(/value:\s*"overstayed",\s*label:\s*"/);
    expect(PILGRIM_DETAIL).not.toMatch(/value:\s*"cancelled",\s*label:\s*"/);
    expect(PILGRIMS_LIST).not.toMatch(/value:\s*"cancelled",\s*label:\s*"/);
  });

  it("both consumer files import from the canonical module", () => {
    expect(PILGRIM_DETAIL).toMatch(/UMRAH_PILGRIM_STATUS_OPTIONS[\s\S]{0,80}from\s*"@\/lib\/umrah-pilgrim-status"/);
    expect(PILGRIMS_LIST).toMatch(/UMRAH_PILGRIM_STATUS_OPTIONS[\s\S]{0,80}from\s*"@\/lib\/umrah-pilgrim-status"/);
  });

  it("AdvancedFilters list reads from the same constant, not a re-typed copy", () => {
    // The filter strip in pilgrims.tsx used to inline its own array. Now
    // it spreads the shared constant, so the dropdown's labels and the
    // chip's labels can never drift apart.
    expect(PILGRIMS_LIST).toMatch(/statuses:\s*\[\.\.\.PILGRIM_STATUS_OPTIONS\]/);
  });

  it("cancelled uses the canonical 'ملغى' spelling, not the legacy 'ملغي'", () => {
    expect(BADGE).toMatch(/cancelled:\s*\{\s*label:\s*"ملغى"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"cancelled",\s*label:\s*"ملغى"/);
  });

  it("arrived / departed / violated stay aligned (regression guard)", () => {
    expect(STATUS_MODULE).toMatch(/value:\s*"arrived",\s*label:\s*"وصل"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"departed",\s*label:\s*"غادر"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"violated",\s*label:\s*"مخالف"/);
    expect(BADGE).toMatch(/arrived:\s*\{\s*label:\s*"وصل"/);
    expect(BADGE).toMatch(/departed:\s*\{\s*label:\s*"غادر"/);
    expect(BADGE).toMatch(/violated:\s*\{\s*label:\s*"مخالف"/);
  });
});
