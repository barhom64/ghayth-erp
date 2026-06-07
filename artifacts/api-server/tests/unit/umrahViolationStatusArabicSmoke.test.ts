import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Violation list — print payload status cell.
 *
 *   `violations.tsx` already had a local `STATUS_LABEL` map (Arabic
 *   labels per `detected` / `open` / `invoiced` / `paid` / `disputed` /
 *   `closed`). The data table cell rendered via that map and looked
 *   correct on screen. But the print/PrintButton payload was shipping
 *   `v.status || "—"` — the same raw English enum that the on-screen
 *   cell was already translating.
 *
 *   Result: the printed report says "الحالة: paid" while the on-screen
 *   list says "الحالة: مسددة" for the same violation.
 *
 *   Fix: walk through the existing local `STATUS_LABEL` dictionary in
 *   the print payload too — `STATUS_LABEL[v.status]?.label ?? v.status`
 *   so it inherits the on-screen labels with no per-print divergence.
 */
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/violations.tsx"),
  "utf8",
);

describe("violations page — print payload uses the on-screen status labels", () => {
  it("STATUS_LABEL dictionary is still the canonical (regression guard)", () => {
    expect(PAGE).toMatch(/detected:\s*\{\s*label:\s*"مكتشفة"/);
    expect(PAGE).toMatch(/open:\s*\{\s*label:\s*"مفتوحة"/);
    expect(PAGE).toMatch(/invoiced:\s*\{\s*label:\s*"بفاتورة"/);
    expect(PAGE).toMatch(/paid:\s*\{\s*label:\s*"مسددة"/);
    expect(PAGE).toMatch(/disputed:\s*\{\s*label:\s*"متنازع عليها"/);
    expect(PAGE).toMatch(/closed:\s*\{\s*label:\s*"مغلقة"/);
  });

  it("print payload looks up the label, not the raw v.status", () => {
    // The cell shows the Arabic label (`STATUS_LABEL[v.status]?.label`)
    // and falls through to the raw `v.status` only when the dictionary
    // doesn't know the value — same forward-compat shape used by the
    // pilgrim helpers.
    expect(PAGE).toMatch(/"الحالة":\s*STATUS_LABEL\[v\.status as ViolationStatus\]\?\.label \?\? v\.status \?\? "—"/);
    // And the legacy raw fallback is gone.
    expect(PAGE).not.toMatch(/"الحالة":\s*v\.status\s*\|\|\s*"—"/);
  });
});
