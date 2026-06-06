// Modules a manager can delegate. The delegation engine treats a bare module
// key (e.g. "hr") as covering every feature in that module, and "*" as all of
// the delegator's authority (see lib/rbac/delegationService.delegationCoversFeature).
// Keep labels Arabic and the keys aligned with ModuleType / the feature catalog.
export interface DelegatableFeature { key: string; label: string }

export const DELEGATABLE_FEATURES: DelegatableFeature[] = [
  { key: "*", label: "كل الصلاحيات" },
  { key: "hr", label: "الموارد البشرية" },
  { key: "finance", label: "المالية" },
  { key: "fleet", label: "الأسطول والنقل" },
  { key: "property", label: "إدارة الأملاك" },
  { key: "operations", label: "العمليات / المشاريع" },
  { key: "warehouse", label: "المستودعات والمتجر" },
  { key: "legal", label: "القانونية" },
  { key: "crm", label: "علاقات العملاء" },
  { key: "support", label: "الدعم" },
  { key: "umrah", label: "العمرة" },
];

const LABELS: Record<string, string> = Object.fromEntries(DELEGATABLE_FEATURES.map((f) => [f.key, f.label]));

/** Render a stored features array (["*"] / ["hr","finance"]) as Arabic text. */
export function describeFeatures(features: unknown): string {
  const list = Array.isArray(features) ? (features as string[]) : [];
  if (list.length === 0) return "—";
  if (list.includes("*")) return "كل الصلاحيات";
  return list.map((k) => LABELS[k] ?? k).join("، ");
}
