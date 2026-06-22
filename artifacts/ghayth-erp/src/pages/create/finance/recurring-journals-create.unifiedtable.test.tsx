import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — القيد الدوري يجب أن يعتمد المكوّن المشترك
 * <LineItemsTable> بدل شبكة CSS يدوية مكرّرة (grid-cols-[…] لكل سطر). دفعة 2 من
 * مسار «توحيد شاشات الإدخالات المالية على نمط جدول واحد». الحارس يمنع الارتداد.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "recurring-journals-create.tsx"), "utf8");

describe("recurring-journals adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable<TemplateLine>/);
  });

  it("no longer hand-rolls a grid-cols line pseudo-table", () => {
    expect(PAGE).not.toMatch(/grid-cols-\[1fr_1\.5fr_1fr_1fr_40px\]/);
  });

  it("keeps the balanced totals row (with balance badge) via renderTotals", () => {
    expect(PAGE).toMatch(/renderTotals=\{/);
    expect(PAGE).toMatch(/الإجمالي/);
    expect(PAGE).toMatch(/متوازن/);
  });
});
