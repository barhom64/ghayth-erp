import { describe, it, expect } from "vitest";
import { groupByCategoryOrder } from "./document-grouping";

/**
 * (هـ، توجيه إبراهيم) — «تنظيم المكتبات». يثبّت أن مكتبة المستندات تُرتَّب حسب
 * ترتيب التصنيفات المعتمد مع عدّاد لكل تصنيف، فلا تبقى قائمة مسطّحة.
 */
const ORDER = ["contracts", "official", "financial", "hr", "legal", "other"];

interface Doc { id: number; category?: string | null; }

describe("groupByCategoryOrder — تنظيم مكتبة المستندات", () => {
  it("يرتّب المستندات حسب ترتيب التصنيفات لا حسب الإدخال", () => {
    const docs: Doc[] = [
      { id: 1, category: "financial" },
      { id: 2, category: "contracts" },
      { id: 3, category: "official" },
    ];
    const { ordered } = groupByCategoryOrder(docs, ORDER);
    expect(ordered.map((d) => d.id)).toEqual([2, 3, 1]); // عقود ثم رسمية ثم مالية
  });

  it("يحافظ على الترتيب الأصلي داخل التصنيف الواحد (ثابت)", () => {
    const docs: Doc[] = [
      { id: 10, category: "contracts" },
      { id: 11, category: "financial" },
      { id: 12, category: "contracts" },
      { id: 13, category: "contracts" },
    ];
    const { ordered } = groupByCategoryOrder(docs, ORDER);
    // كل العقود قبل المالية، وبترتيب إدخالها 10→12→13
    expect(ordered.map((d) => d.id)).toEqual([10, 12, 13, 11]);
  });

  it("يحسب عدّاد كل تصنيف", () => {
    const docs: Doc[] = [
      { id: 1, category: "contracts" },
      { id: 2, category: "contracts" },
      { id: 3, category: "financial" },
    ];
    const { countByCat } = groupByCategoryOrder(docs, ORDER);
    expect(countByCat).toEqual({ contracts: 2, financial: 1 });
  });

  it("يضع التصنيف غير المعروف آخرًا ويعدّ الفارغ كـ other", () => {
    const docs: Doc[] = [
      { id: 1, category: "weird" },
      { id: 2, category: "contracts" },
      { id: 3, category: null },
      { id: 4, category: "" },
    ];
    const { ordered, countByCat } = groupByCategoryOrder(docs, ORDER);
    // contracts معروف (مرتبة 0) → أولًا؛ "weird" غير معروف و null/"" → other (آخرًا)
    expect(ordered[0].id).toBe(2);
    expect(countByCat.contracts).toBe(1);
    expect(countByCat.other).toBe(2); // null + ""
    expect(countByCat.weird).toBe(1);
  });

  it("قائمة فارغة → نتيجة فارغة بلا أعطال", () => {
    const { ordered, countByCat } = groupByCategoryOrder([] as Doc[], ORDER);
    expect(ordered).toEqual([]);
    expect(countByCat).toEqual({});
  });
});
