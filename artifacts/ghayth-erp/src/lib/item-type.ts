/**
 * نوع الصنف (itemType) — مصدر موحّد لتمييز الخدمة عن المنتج (توجيه إبراهيم «د»).
 *
 * المخطط (`products.itemType` / `warehouse_products.itemType`، هجرتا 203/299) يحمل
 * enum واحدًا، والخلفية تحترمه فعلًا: لا تُحرّك مخزونًا للأنواع غير المخزنية
 * (`NON_STOCK_ITEM_TYPES` في `warehouse.ts`) وتروّج الحساب بالنوع. هذا الملف يوحّد
 * القائمة + اشتقاق «هل النوع مخزني؟» لتقرأه شاشات الإدخال والمنتقيات بلا تكرار
 * يقبل الانحراف (كان مُكرَّرًا في product-select.tsx والخلفية).
 */
export type ItemType = "product" | "service" | "asset" | "consumable" | "digital";

/** القائمة المعتمدة بترتيب العرض + التسميات العربية الموحّدة (تطابق كتالوج المالية). */
export const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "product", label: "منتج" },
  { value: "service", label: "خدمة" },
  { value: "consumable", label: "مستهلك" },
  { value: "asset", label: "أصل ثابت" },
  { value: "digital", label: "رقمي" },
];

/** خريطة value→label للعرض السريع (شارة/عمود النوع). */
export const ITEM_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ITEM_TYPES.map((t) => [t.value, t.label]),
);

/**
 * الأنواع التي لا يُمسك لها رصيد/حركة مخزون — تطابق `NON_STOCK_ITEM_TYPES`
 * في الخلفية (`warehouse.ts`) حرفيًّا: خدمة/رقمي/أصل ثابت.
 */
export const NON_STOCK_ITEM_TYPES: ReadonlySet<string> = new Set([
  "service",
  "digital",
  "asset",
]);

/**
 * هل هذا النوع مخزني (يُمسك له رصيد وحركة وموقع)؟ المنتج والمستهلك مخزنيان،
 * وما عداهما لا. الغياب/الفراغ يُعامل «منتجًا» (سلوك الخلفية الافتراضي).
 */
export function isStockItem(itemType: string | null | undefined): boolean {
  return !NON_STOCK_ITEM_TYPES.has(String(itemType ?? "product"));
}
