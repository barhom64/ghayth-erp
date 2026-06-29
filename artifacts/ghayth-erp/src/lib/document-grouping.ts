// ─────────────────────────────────────────────────────────────────────────────
// document-grouping.ts
//
// (هـ، توجيه إبراهيم) — «تنظيم المكتبات». مكتبة المستندات كانت قائمة مسطّحة رغم
// وجود تصنيفات. هذا المُساعد النقي يرتّب المستندات حسب ترتيب التصنيفات المعتمد
// (غير المعروف آخرًا) ويحسب عدّاد كل تصنيف، فتُعرض مجمّعة برأس قسم لكل تصنيف.
//
// وحدة نقية قابلة للاختبار (لا React) — يثبّت الاختبار الترتيب والعدّاد.
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryGrouping<T> {
  /** المستندات مرتّبة حسب ترتيب التصنيفات (ترتيب ثابت داخل كل تصنيف). */
  ordered: T[];
  /** عدد المستندات لكل تصنيف (المفتاح فارغ/غير معروف → "other"). */
  countByCat: Record<string, number>;
}

const catKey = (c: string | null | undefined): string => c || "other";

/**
 * يرتّب المستندات حسب `categoryOrder` ويحسب عدّاد كل تصنيف. الترتيب **ثابت**
 * (stable): تبقى مستندات التصنيف الواحد على ترتيبها الأصلي (تاريخ النشأة مثلًا).
 * التصنيفات غير المعروفة (خارج القائمة) تُوضع آخرًا.
 *
 *   groupByCategoryOrder(docs, ["contracts","financial"])
 *     → عقود ثم مالية ثم غيرها، مع countByCat لكل تصنيف.
 */
export function groupByCategoryOrder<T extends { category?: string | null }>(
  docs: readonly T[],
  categoryOrder: readonly string[],
): CategoryGrouping<T> {
  const rank = (c: string | null | undefined): number => {
    const i = categoryOrder.indexOf(catKey(c));
    return i < 0 ? categoryOrder.length : i;
  };
  // مؤشر أصلي لكسر التعادل ⇒ ترتيب ثابت داخل التصنيف الواحد.
  const ordered = docs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => rank(a.d.category) - rank(b.d.category) || a.i - b.i)
    .map((x) => x.d);

  const countByCat: Record<string, number> = {};
  for (const d of docs) {
    const k = catKey(d.category);
    countByCat[k] = (countByCat[k] || 0) + 1;
  }
  return { ordered, countByCat };
}
