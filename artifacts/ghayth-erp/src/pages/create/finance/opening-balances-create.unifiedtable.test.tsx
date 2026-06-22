import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — الأرصدة الافتتاحية تعتمد المكوّن المشترك
 * <LineItemsTable> بدل شبكة CSS يدوية. دفعة 3 من «توحيد شاشات الإدخالات
 * المالية على نمط جدول واحد». الحارس يمنع الارتداد ويثبّت بقاء استيراد CSV.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "opening-balances-create.tsx"), "utf8");

describe("opening-balances adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable\b/);
    expect(PAGE).not.toMatch(/<LineItemsTable</); // JSX type-arg breaks dev preview (check-jsx-generic-component); T inferred
  });

  it("no longer hand-rolls a grid-cols line pseudo-table", () => {
    expect(PAGE).not.toMatch(/grid-cols-\[2fr_1fr_1fr_40px\]/);
  });

  it("keeps CSV import and the balanced totals row (no lost feature)", () => {
    expect(PAGE).toMatch(/استيراد CSV/);
    expect(PAGE).toMatch(/renderTotals=\{/);
    expect(PAGE).toMatch(/متوازن/);
  });
});
