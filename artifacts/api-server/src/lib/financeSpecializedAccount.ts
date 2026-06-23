// #1715 (comment 9) — specialized posting-account derivation.
//
// `resolveLineAllocation` only resolves an account when a tenant has
// configured an accounting_allocation_rule; otherwise the entry falls back to
// a generic expense account. This module gives the system a *built-in*,
// rule-free default: given what the operation is linked to (the allocation
// target) and the kind of item, derive the most specific sensible posting
// account so finance is "helpful by default".
//
// It returns a { purpose, defaultCode } pair — never a bare code — so callers
// route it through financialEngine.resolveAccountCode(companyId, purpose,
// side, defaultCode): a tenant that has mapped the purpose wins, everyone else
// inherits the proven seed default (the same 65xx/66xx/68xx/69xx/15xx/12xx
// codes the GRN per-line treatment already uses). Pure + DB-free so the
// mapping is unit-testable in isolation.

export type AllocationTargetType =
  | "none"
  | "vehicle"
  | "vehicle_maintenance"
  | "property"
  | "property_maintenance"
  | "unit"
  | "contract"
  | "project"
  | "umrah_season"
  | "umrah_agent"
  | "transport_trip"
  | "supplier"
  | "customer"
  | "employee"
  | "fixed_asset";

export interface SpecializedAccount {
  /** Posting-policy purpose key — what tenants remap against. */
  purpose: string;
  /** Seed default account code used when the purpose isn't mapped. */
  defaultCode: string;
  /** Arabic label for previews / UI hints. */
  label: string;
  /** True when the derived account is a balance-sheet capitalisation
   *  (asset / inventory), not a P&L expense. */
  capitalize: boolean;
}

const round = (s: string) => s.trim().toLowerCase();

// Item-kind hints override the target when present (e.g. fuel on any target is
// still fuel). Keys are matched against a normalised itemType/expenseType.
const ITEM_KIND: Record<string, SpecializedAccount> = {
  fuel: { purpose: "vehicle_fuel_expense", defaultCode: "6500", label: "وقود المركبات", capitalize: false },
  وقود: { purpose: "vehicle_fuel_expense", defaultCode: "6500", label: "وقود المركبات", capitalize: false },
  service: { purpose: "service_expense", defaultCode: "6920", label: "مصروف خدمات", capitalize: false },
  inventory: { purpose: "inventory_receipt", defaultCode: "1250", label: "مخزون", capitalize: true },
  product: { purpose: "inventory_receipt", defaultCode: "1250", label: "مخزون", capitalize: true },
  stock: { purpose: "inventory_receipt", defaultCode: "1250", label: "مخزون", capitalize: true },
  asset: { purpose: "fixed_asset_purchase", defaultCode: "1280", label: "أصل ثابت (رسملة)", capitalize: true },
  capital: { purpose: "fixed_asset_purchase", defaultCode: "1280", label: "أصل ثابت (رسملة)", capitalize: true },
};

const TARGET_MAP: Record<AllocationTargetType, SpecializedAccount> = {
  vehicle:              { purpose: "vehicle_expense",              defaultCode: "6500", label: "مصروفات المركبات",   capitalize: false },
  vehicle_maintenance:  { purpose: "vehicle_maintenance_expense",  defaultCode: "6500", label: "صيانة المركبات",      capitalize: false },
  property:             { purpose: "property_expense",             defaultCode: "6600", label: "مصروفات العقارات",   capitalize: false },
  property_maintenance: { purpose: "property_maintenance_expense", defaultCode: "6600", label: "صيانة العقارات",      capitalize: false },
  unit:                 { purpose: "property_maintenance_expense", defaultCode: "6600", label: "مصروفات الوحدة",      capitalize: false },
  contract:             { purpose: "property_expense",             defaultCode: "6600", label: "مصروفات عقد إيجار",   capitalize: false },
  project:              { purpose: "project_cost",                 defaultCode: "6800", label: "تكاليف المشاريع",    capitalize: false },
  umrah_season:         { purpose: "umrah_cost",                   defaultCode: "6900", label: "تكاليف العمرة",      capitalize: false },
  umrah_agent:          { purpose: "umrah_cost",                   defaultCode: "6900", label: "تكاليف وكيل عمرة",   capitalize: false },
  transport_trip:       { purpose: "transport_cost",               defaultCode: "6900", label: "تكاليف النقل",       capitalize: false },
  fixed_asset:          { purpose: "fixed_asset_purchase",         defaultCode: "1280", label: "أصل ثابت (رسملة)",   capitalize: true },
  supplier:             { purpose: "general_expense",              defaultCode: "6900", label: "مصروف عام",          capitalize: false },
  customer:             { purpose: "general_expense",              defaultCode: "6900", label: "مصروف عام",          capitalize: false },
  employee:             { purpose: "general_expense",              defaultCode: "6900", label: "مصروف عام",          capitalize: false },
  none:                 { purpose: "general_expense",              defaultCode: "6900", label: "مصروف عام",          capitalize: false },
};

const GENERAL: SpecializedAccount = TARGET_MAP.none;

// Derive the specialized account for an operation. An explicit item kind
// (fuel/service/inventory/asset) wins over the target; otherwise the target
// type decides; anything unknown falls back to the general expense account.
export function deriveSpecializedAccount(input: {
  targetType?: string | null;
  itemType?: string | null;
}): SpecializedAccount {
  const item = input.itemType ? round(input.itemType) : "";
  if (item && ITEM_KIND[item]) return ITEM_KIND[item];

  const target = (input.targetType ? round(input.targetType) : "none") as AllocationTargetType;
  return TARGET_MAP[target] ?? GENERAL;
}

// #1715 (owner feedback) — the human-readable «التوجيه المحاسبي المتوقّع»
// consequence of an allocation target: the linked-entity name, the operational
// effect the link produces, and any future task it schedules. Pure mapping so
// the impact-preview endpoint (and tests) can reuse it.
const ENTITY_LABELS: Record<string, string> = {
  vehicle: "مركبة", vehicle_maintenance: "صيانة مركبة", property: "عقار",
  property_maintenance: "صيانة عقار", unit: "وحدة عقارية", contract: "عقد",
  project: "مشروع", umrah_season: "موسم عمرة", umrah_agent: "وكيل عمرة",
  transport_trip: "رحلة نقل", supplier: "مورد", customer: "عميل",
  employee: "موظف", fixed_asset: "أصل ثابت",
};

export function deriveOperationalEffectHint(input: {
  targetType?: string | null;
  spec: SpecializedAccount;
}): { entityLabel: string | null; effect: string | null; futureTask: string | null } {
  const t = input.targetType ?? "none";
  const entityLabel = ENTITY_LABELS[t] ?? (t !== "none" ? t : null);
  let effect: string | null = null;
  let futureTask: string | null = null;
  if (t === "vehicle_maintenance") {
    effect = "ستُنشأ تذكرة صيانة مركبة وتُربط بهذا المصروف، ويُحدَّث عدّاد المركبة.";
    futureTask = "تذكير الصيانة الوقائية القادم يُحتسب من جدول صيانة المركبة.";
  } else if (t === "property_maintenance") {
    effect = "ستُنشأ تذكرة صيانة عقارية وتُربط بهذا المصروف (العقار/الوحدة/المستأجر).";
  } else if (input.spec.capitalize && (t === "fixed_asset" || input.spec.purpose === "fixed_asset_purchase")) {
    effect = "يُرسمَل كأصل ثابت بدل قيده مصروفًا، وتزداد قيمة الأصل الدفترية.";
    futureTask = "سيبدأ احتساب الإهلاك الشهري تلقائيًا عبر محرك الإهلاك.";
  } else if (input.spec.capitalize) {
    effect = "يُضاف إلى المخزون بدل قيده مصروفًا.";
  } else if (t === "vehicle") {
    effect = "يُحمَّل على المركبة ويظهر في تقرير تكلفة المركبة.";
  } else if (t === "property" || t === "unit" || t === "contract") {
    effect = "يُحمَّل على العقار/الوحدة ويظهر في تقرير ربحية العقار.";
  } else if (t === "project") {
    effect = "يُحمَّل على المشروع ويظهر في تكلفة المشروع.";
  }
  return { entityLabel, effect, futureTask };
}
