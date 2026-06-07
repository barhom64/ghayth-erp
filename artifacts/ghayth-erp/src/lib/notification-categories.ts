/**
 * Notification routing categories — the canonical list of event
 * categories the notification engine actually matches on.
 *
 * IMPORTANT: getRoutingRule() in notificationEngine.ts looks a rule up
 * by the FIRST segment of the event name (e.g. "leave.request.created"
 * → "leave"). A routing rule keyed on a full event name like
 * "leave.request.created" would therefore NEVER match. The admin UI
 * must offer THESE prefixes — not free text — so operators can't create
 * dead rules that silently route nothing.
 *
 * Mirrors the global defaults seeded in migration
 * 256_seed_notification_routing_rules.sql. Keep the two in sync when a
 * new auto-fire event prefix is introduced.
 */
export interface RoutingCategory {
  value: string;
  label: string;
}

export const ROUTING_CATEGORIES: ReadonlyArray<RoutingCategory> = [
  { value: "leave", label: "الإجازات (طلب/موافقة/رفض)" },
  { value: "payroll", label: "الرواتب (كشف/صرف)" },
  { value: "invoice", label: "الفواتير (إنشاء/سداد/تأخر)" },
  { value: "document", label: "انتهاء الوثائق (إقامة/جواز/رخصة)" },
  { value: "contract", label: "انتهاء العقود" },
  { value: "approval", label: "الموافقات والتصعيد" },
  { value: "task", label: "المهام" },
  { value: "support", label: "تذاكر الدعم" },
  { value: "fleet", label: "الأسطول (صيانة/حوادث/استمارات)" },
  { value: "inventory", label: "تنبيهات المخزون" },
  { value: "property", label: "العقارات والإيجارات" },
  { value: "opportunity", label: "فرص البيع" },
  { value: "overtime", label: "الوقت الإضافي" },
  { value: "loan", label: "القروض" },
  { value: "exit", label: "إخلاء الطرف" },
  { value: "purchase_request", label: "طلبات الشراء" },
  { value: "purchase_order", label: "أوامر الشراء" },
  { value: "expense", label: "المصروفات" },
  { value: "lead", label: "العملاء المحتملون" },
  { value: "umrah", label: "العمرة (حجوزات/تأخر معتمر)" },
  { value: "user", label: "حسابات المستخدمين وكلمات المرور" },
  { value: "discipline", label: "المذكرات التأديبية" },
  { value: "attendance", label: "الحضور والانصراف" },
  { value: "receipt", label: "سندات القبض" },
  { value: "payment", label: "سندات الصرف" },
  { value: "project", label: "المشاريع والمعالم" },
];

/** Lookup label for a category value; falls back to the raw value. */
export function routingCategoryLabel(value: string): string {
  return ROUTING_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
