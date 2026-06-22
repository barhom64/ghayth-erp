import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — القيد اليدوي يجب أن يعتمد المكوّن المشترك
 * <LineItemsTable> بدل جدول HTML يدوي مكرّر. هذا أول موضع في مسار «توحيد شاشات
 * الإدخالات المالية على نمط جدول واحد». الحارس يمنع الارتداد إلى جدول يدوي.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "journal-manual-create.tsx"), "utf8");

describe("journal-manual adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable<JournalLine>/);
  });

  it("no longer hand-rolls its own <thead>/<tbody> account-lines table", () => {
    // The unified component owns the table chrome; the page must not re-introduce
    // a bespoke <thead> with the رمز الحساب / مدين / دائن header row.
    expect(PAGE).not.toMatch(/<thead/);
    expect(PAGE).not.toMatch(/<tbody/);
  });

  it("keeps the per-line allocation panel via renderExpansion (no lost feature)", () => {
    expect(PAGE).toMatch(/renderExpansion=\{/);
    expect(PAGE).toMatch(/<LineAllocationPanel/);
  });

  it("keeps the balanced totals row via renderTotals", () => {
    expect(PAGE).toMatch(/renderTotals=\{/);
    expect(PAGE).toMatch(/المجموع/);
  });
});
