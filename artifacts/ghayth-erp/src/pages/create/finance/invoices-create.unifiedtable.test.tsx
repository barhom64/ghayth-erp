import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — فاتورة العميل تعتمد المكوّن المشترك
 * <LineItemsTable> (بنود بضاعة: منتج/كمية/سعر/ضريبة/إجمالي + لوحة الأبعاد).
 * دفعة 4 من «توحيد شاشات الإدخالات المالية على نمط جدول واحد». الحارس يمنع
 * الارتداد لجدول يدوي ويثبّت بقاء ملخّص ضريبة السطر ولوحة الأبعاد.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "invoices-create.tsx"), "utf8");

describe("invoices-create adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable\b/);
    expect(PAGE).not.toMatch(/<LineItemsTable</); // JSX type-arg breaks dev preview (check-jsx-generic-component); T inferred
  });

  it("no longer hand-rolls its own <thead>/<tbody> line table", () => {
    expect(PAGE).not.toMatch(/<thead/);
    expect(PAGE).not.toMatch(/<tbody/);
  });

  it("keeps the per-line tax split + allocation panel via renderExpansion", () => {
    expect(PAGE).toMatch(/renderExpansion=\{/);
    expect(PAGE).toMatch(/<LineAllocationPanel/);
    expect(PAGE).toMatch(/صافي:/);
  });
});
