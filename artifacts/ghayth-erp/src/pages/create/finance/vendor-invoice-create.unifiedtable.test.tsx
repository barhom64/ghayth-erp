import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — فاتورة المورد تعتمد المكوّن المشترك
 * <LineItemsTable> (بنود بضاعة + منتقي صنف المورد + لوحة الأبعاد). دفعة 5 من
 * «توحيد شاشات الإدخالات المالية على نمط جدول واحد». الحارس يمنع الارتداد.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "vendor-invoice-create.tsx"), "utf8");

describe("vendor-invoice-create adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable<VendorInvoiceLine>/);
  });

  it("no longer hand-rolls its own <thead>/<tbody> line table", () => {
    expect(PAGE).not.toMatch(/<thead/);
    expect(PAGE).not.toMatch(/<tbody/);
  });

  it("keeps supplier item picker + allocation panel via renderExpansion", () => {
    expect(PAGE).toMatch(/renderExpansion=\{/);
    expect(PAGE).toMatch(/<SupplierItemPicker/);
    expect(PAGE).toMatch(/<LineAllocationPanel/);
  });
});
