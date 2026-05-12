/**
 * Canonical Arabic labels for the ERP's top-level modules.
 *
 * Until this file existed, the same map was duplicated inline in
 * policy-banner, automation, settings-rules, admin/roles, and admin/shared,
 * each with subtle drift:
 *   - `property` was sometimes "الأملاك" and sometimes "العقارات"
 *   - `fleet`    was sometimes "الأسطول" and sometimes "النقليات"
 *   - the admin variant carried 20 keys, the policy banner only 13
 *
 * Pick the dominant label for each ambiguous entry (`property` →
 * "الأملاك", `fleet` → "الأسطول") and superset the keys so every caller
 * can reach in for any module name. The two helpers below cover the
 * common patterns the duplicated maps were used for: looking a label up
 * by key and resolving the module key for a given route path.
 */

export const MODULE_LABELS: Record<string, string> = {
  // Top-level modules listed in nav order.
  home: "الرئيسية",
  hr: "الموارد البشرية",
  finance: "المالية",
  fleet: "الأسطول",
  property: "الأملاك",
  projects: "المشاريع",
  operations: "العمليات",
  warehouse: "المستودعات",
  legal: "القانونية",
  crm: "المبيعات",
  support: "الدعم",
  comms: "التواصل",
  marketing: "التسويق",
  store: "المتجر",
  // Cross-cutting / system modules.
  governance: "الحوكمة",
  bi: "ذكاء الأعمال",
  reports: "التقارير",
  documents: "المستندات",
  requests: "الطلبات",
  admin: "مدير النظام",
  settings: "الإعدادات",
};

/**
 * Get the Arabic label for a module key, or the raw key when the module
 * isn't catalogued (so a typo surfaces as the bare slug instead of a
 * silent fallback).
 */
export function moduleLabel(key: string | null | undefined): string {
  if (!key) return "";
  return MODULE_LABELS[key] ?? key;
}

/**
 * Resolve the canonical module key for a route path. Centralises the
 * route-to-module mapping that previously lived inside policy-banner.
 * Add new prefixes here, not in the consumers.
 */
export function moduleFromPath(path: string): string | null {
  if (path.startsWith("/hr") || path.startsWith("/employees")) return "hr";
  if (path.startsWith("/finance")) return "finance";
  if (path.startsWith("/fleet")) return "fleet";
  if (path.startsWith("/properties")) return "property";
  if (path.startsWith("/projects") || path.startsWith("/tasks")) return "operations";
  if (path.startsWith("/warehouse")) return "warehouse";
  if (path.startsWith("/governance")) return "governance";
  if (path.startsWith("/legal")) return "legal";
  if (path.startsWith("/crm") || path.startsWith("/clients")) return "crm";
  if (path.startsWith("/support")) return "support";
  if (path.startsWith("/communications")) return "comms";
  if (path.startsWith("/store")) return "store";
  if (path.startsWith("/marketing")) return "marketing";
  if (path.startsWith("/bi")) return "bi";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/settings")) return "settings";
  return null;
}
