import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * الجدول الموحّد للإدخالات المالية — القيد (الموجّه) يعتمد المكوّن المشترك
 * <LineItemsTable> بدل شبكة CSS يدوية. دفعة 7 من «توحيد شاشات الإدخالات
 * المالية على نمط جدول واحد». الحارس يمنع الارتداد ويثبّت بقاء أبعاد السطر
 * (مركز تكلفة/قسم/مشروع) ولوحة الأبعاد وصف الإجمالي.
 */
const PAGE = readFileSync(join(import.meta.dirname!, "journal-create.tsx"), "utf8");

describe("journal-create adopts the shared unified LineItemsTable", () => {
  it("imports and renders <LineItemsTable>", () => {
    expect(PAGE).toMatch(/import \{ LineItemsTable \} from "@\/components\/shared\/line-items-table"/);
    expect(PAGE).toMatch(/<LineItemsTable<JournalLine>/);
  });

  it("no longer hand-rolls a grid-cols line pseudo-table", () => {
    expect(PAGE).not.toMatch(/grid-cols-\[1fr_1\.5fr_1fr_1fr_40px\]/);
  });

  it("keeps line dims + allocation panel via renderExpansion and totals", () => {
    expect(PAGE).toMatch(/renderExpansion=\{/);
    expect(PAGE).toMatch(/<LineAllocationPanel/);
    expect(PAGE).toMatch(/renderTotals=\{/);
    expect(PAGE).toMatch(/الإجمالي/);
  });
});
