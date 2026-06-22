import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — أمر الشراء يعتمد المكوّن المشترك
 * <LineItemsTable> بدل بطاقة لكل بند. دفعة 6 من «توحيد شاشات الإدخالات
 * المالية على نمط جدول واحد». الحارس يمنع الارتداد ويثبّت بقاء معالجة البند
 * والتوجيه المحاسبي ولوحة الأبعاد.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "purchase-orders-create.tsx"), "utf8");

describe("purchase-orders-create adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable<\(typeof items\)\[number\]>/);
  });

  it("no longer renders a per-item border card grid (grid-cols-4)", () => {
    expect(PAGE).not.toMatch(/grid grid-cols-4 gap-2 items-end/);
  });

  it("keeps line treatment + GL hint + allocation panel via renderExpansion", () => {
    expect(PAGE).toMatch(/renderExpansion=\{/);
    expect(PAGE).toMatch(/<LineTreatmentSelect/);
    expect(PAGE).toMatch(/<LineAllocationPanel/);
  });
});
