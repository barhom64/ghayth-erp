import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the penalty CSV export — the `onExportCSV` route in
 * `penalties.tsx` was passing the raw `filteredItems` to `exportToCSV`,
 * which materialised `status: "invoiced"` (raw enum) in the downloaded
 * file. Same Arabic-as-origin divergence as the print payload (#1755),
 * different export pathway.
 *
 * The CSV helper does NOT accept per-cell formatters, so the fix
 * pre-translates the `status` field on each row via
 * `umrahPenaltyStatusLabel` before passing the array in.
 */
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/penalties.tsx"),
  "utf8",
);

describe("penalties CSV export — pre-translates status before passing to exportToCSV", () => {
  it("rows are mapped through umrahPenaltyStatusLabel before export", () => {
    // The .map() spread pattern preserves every original field but
    // overwrites `status` with the Arabic label so the CSV cell carries
    // "مفوترة" not "invoiced".
    expect(PAGE).toMatch(/\.map\(\(p: any\) => \(\{\s*\.\.\.p,\s*status: umrahPenaltyStatusLabel\(p\.status\),?\s*\}\)\)/);
  });

  it("the column projection still ships `status` as the key (label stays عربي)", () => {
    // We don't change the projection — the spread above replaces the
    // value of `p.status` in-place, so the column { key: "status",
    // label: "الحالة" } already picks up the translated cell.
    expect(PAGE).toMatch(/\{\s*key:\s*"status",\s*label:\s*"الحالة"\s*\}/);
  });

  it("umrahPenaltyStatusLabel is imported from the canonical module", () => {
    expect(PAGE).toMatch(/import\s*\{[^}]*umrahPenaltyStatusLabel[^}]*\}\s*from\s*"@\/lib\/umrah-penalty-status"/);
  });
});
