import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Umrah penalty lifecycle — Arabic-as-origin closure.
 *
 *   The penalty list / detail pages were rendering raw English status
 *   strings in three places:
 *
 *   1. `<PageStatusBadge status={p.status} />` resolved via STATUS_MAP's
 *      `shared` block for `pending` / `cancelled` (those happen to be
 *      shared), but `invoiced` / `paid` / `waived` had no domain block
 *      claiming them → fell through and rendered raw.
 *
 *   2. The print payload shipped `"الحالة": p.status || "—"` — same
 *      bug as the pilgrim case (PR #1755).
 *
 *   3. The AdvancedFilters status chips were a re-typed inline literal
 *      that could drift from the badge labels.
 *
 *   Fix:
 *     - Add `umrah_penalty` block to STATUS_MAP with the missing labels.
 *     - Add `umrah-penalty-status.ts` (mirror of the pilgrim module)
 *       with `umrahPenaltyStatusLabel(status)` + the options array.
 *     - Print payload + AdvancedFilters statuses both read from the
 *       shared module so divergence is impossible.
 *     - `<PageStatusBadge domain="umrah_penalty">` so the resolver
 *       doesn't have to scan every block.
 */
const BADGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/page-status-badge.tsx"),
  "utf8",
);
const STATUS_MODULE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/umrah-penalty-status.ts"),
  "utf8",
);
const PENALTIES_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/penalties.tsx"),
  "utf8",
);

describe("STATUS_MAP — umrah_penalty domain block", () => {
  it("declares the penalty-specific lifecycle states", () => {
    expect(BADGE).toMatch(/umrah_penalty:\s*\{/);
    expect(BADGE).toMatch(/umrah_penalty:[\s\S]{0,400}invoiced:\s*\{\s*label:\s*"مفوترة"/);
    expect(BADGE).toMatch(/umrah_penalty:[\s\S]{0,400}paid:\s*\{\s*label:\s*"مدفوعة"/);
    expect(BADGE).toMatch(/umrah_penalty:[\s\S]{0,400}waived:\s*\{\s*label:\s*"معفاة"/);
  });
});

describe("umrah-penalty-status module — canonical client labels", () => {
  it("options array matches the on-screen badge wording", () => {
    expect(STATUS_MODULE).toMatch(/value:\s*"pending",\s*label:\s*"معلقة"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"invoiced",\s*label:\s*"مفوترة"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"paid",\s*label:\s*"مدفوعة"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"waived",\s*label:\s*"معفاة"/);
    expect(STATUS_MODULE).toMatch(/value:\s*"cancelled",\s*label:\s*"ملغية"/);
  });

  it("exports umrahPenaltyStatusLabel helper with consistent nullish + fallback semantics", () => {
    expect(STATUS_MODULE).toMatch(/export function umrahPenaltyStatusLabel\(status: string \| null \| undefined\): string/);
    expect(STATUS_MODULE).toMatch(/if \(!status\) return "—"/);
    expect(STATUS_MODULE).toMatch(/hit\?\.label \?\? status/);
  });
});

describe("penalties page — single source of truth", () => {
  it("imports from the canonical module — no inline status dictionary survives", () => {
    expect(PENALTIES_PAGE).toMatch(/import\s*\{[^}]*UMRAH_PENALTY_STATUS_OPTIONS[^}]*umrahPenaltyStatusLabel[^}]*\}\s*from\s*"@\/lib\/umrah-penalty-status"/);
    // The inline `value: "invoiced", label: ...` literals are gone from
    // the page (they live in the module now).
    expect(PENALTIES_PAGE).not.toMatch(/\{\s*value:\s*"invoiced",\s*label:\s*"مفوترة"\s*\}/);
    expect(PENALTIES_PAGE).not.toMatch(/\{\s*value:\s*"waived",\s*label:\s*"معفاة"\s*\}/);
  });

  it("AdvancedFilters statuses spread the shared constant — no re-typed copy", () => {
    expect(PENALTIES_PAGE).toMatch(/statuses:\s*\[\.\.\.UMRAH_PENALTY_STATUS_OPTIONS\]/);
  });

  it("PageStatusBadge passes domain hint so the resolver doesn't fall back to other blocks", () => {
    expect(PENALTIES_PAGE).toMatch(/<PageStatusBadge\s+status=\{p\.status\}\s+domain="umrah_penalty"\s*\/>/);
  });

  it("print payload status cell uses the helper, not raw p.status", () => {
    expect(PENALTIES_PAGE).toMatch(/"الحالة":\s*umrahPenaltyStatusLabel\(p\.status\)/);
    expect(PENALTIES_PAGE).not.toMatch(/"الحالة":\s*p\.status\s*\|\|\s*"—"/);
  });
});
