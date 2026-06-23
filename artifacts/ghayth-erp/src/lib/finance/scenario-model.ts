// finance/scenario-model.ts
//
// #1715 / #1945 — THE central finance scenario model (single source of truth).
//
// The owner's directive: every finance screen must be driven by progressive
// selection — operation type → domain → scenario → only-the-relevant fields →
// suggested account → cost-centre → operational effect → future task — and NOT
// by hand-patched field lists. This registry is that source of truth.
//
// Today the same knowledge is scattered across three places that must agree:
//   • AllocationTargetSelect  — which fields render per "target".
//   • deriveSpecializedAccount (api-server) — the GL account purpose per target.
//   • deriveOperationalEffectHint (api-server) — the operational effect + future
//     task per target.
// This module consolidates that into ONE typed registry. The renderer, the
// account/cost-centre resolvers and the impact preview all read from it, so a
// scenario is declared once and every layer stays in sync.
//
// ROADMAP (see docs/finance/FINANCE_SCENARIO_MODEL.md):
//   Phase 1 (this file)  — the registry + resolvers (fields / account / cost
//                          centre / effect / future task) + docs.
//   Phase 2              — AllocationTargetSelect renders from the registry.
//   Phase 3              — the backend deriveSpecializedAccount /
//                          deriveOperationalEffectHint read the SAME purpose +
//                          effect keys (they already use these strings).
//   Phase 4              — vouchers / receipts / invoices / intake reuse the
//                          model; remove the legacy "الجهة المرتبطة" + raw
//                          account/cost-centre fields.

// FIN-SUB-05 (#2101) — the voucher direction/label maps now live in ONE
// canonical source shared with the backend; see the re-export block below.
import {
  ACCOUNT_TYPE_LABELS as ACCOUNT_TYPE_LABELS_AR,
  VOUCHER_COUNTER_ACCOUNT_TYPES,
  type AccountTypeKey,
} from "@workspace/api-zod/financeDirectionMaps";

export type FinanceDomain =
  | "general"
  | "vehicle"
  | "property"
  | "umrah"
  | "project"
  | "inventory"
  | "fixed_asset"
  | "document"
  | "employee"
  | "supplier_customer";

export const DOMAIN_LABELS: Record<FinanceDomain, string> = {
  general: "عام",
  vehicle: "مركبة / أسطول",
  property: "عقار / وحدة",
  umrah: "عمرة",
  project: "مشروع",
  inventory: "مخزون",
  fixed_asset: "أصل ثابت",
  document: "وثيقة / ترخيص",
  employee: "موظف / عهدة",
  supplier_customer: "مورد / عميل",
};

/** A field the renderer should show for a scenario (only the relevant ones). */
export interface ScenarioFieldSpec {
  /** Canonical key the form binds to (maps onto the allocation/effect payload). */
  key: string;
  label: string;
  /** Drives which control the renderer picks. */
  kind:
    | "vehicle" | "driver" | "property" | "unit" | "contract" | "tenant"
    | "umrah_season" | "umrah_agent" | "umrah_group" | "project" | "supplier"
    | "warehouse" | "product" | "asset"
    | "number" | "money" | "text" | "date" | "select" | "attachment";
  required?: boolean;
  /** For kind === "select". */
  options?: { value: string; label: string }[];
  hint?: string;
}

/** The operational side-effect a scenario produces when it posts. */
export type ScenarioEffect =
  | "maintenance_ticket"
  | "fuel_log"
  | "asset_creation"
  | "document_record"
  | "tenant_claim"
  | "stock_movement"
  | null;

export interface FinanceScenario {
  id: string;
  domain: FinanceDomain;
  label: string;
  /** Only these fields render for the scenario. */
  fields: ScenarioFieldSpec[];
  /** GL purpose key → financialEngine.resolveAccountCode (matches the backend). */
  accountPurpose: string;
  /** True when the spend is capitalised (asset/inventory), not a P&L expense. */
  capitalize?: boolean;
  /** Which entity supplies the cost centre (null = branch/general). */
  costCenterSource: FinanceDomain | null;
  /** Operational effect fired in the JE transaction. */
  effect: ScenarioEffect;
  /** Human description of the future task the scenario schedules, if any. */
  futureTask?: string | null;
}

// ── shared field fragments ──────────────────────────────────────────────────
const VEHICLE = { key: "vehicleId", label: "المركبة", kind: "vehicle", required: true } as const;
const ODOMETER = { key: "odometer", label: "قراءة العداد", kind: "number" } as const;
const ATTACH = { key: "attachment", label: "المرفق", kind: "attachment" } as const;

export const FINANCE_SCENARIOS: Record<string, FinanceScenario> = {
  // ── vehicle ───────────────────────────────────────────────────────────────
  vehicle_fuel: {
    id: "vehicle_fuel", domain: "vehicle", label: "وقود",
    fields: [
      VEHICLE, { key: "driverId", label: "السائق", kind: "driver" }, ODOMETER,
      { key: "liters", label: "عدد اللترات", kind: "number" },
      { key: "costPerLiter", label: "سعر اللتر", kind: "money" },
      { key: "stationName", label: "المحطة / المورد", kind: "text" }, ATTACH,
    ],
    accountPurpose: "vehicle_fuel_expense", costCenterSource: "vehicle",
    effect: "fuel_log", futureTask: "احتساب كفاءة الوقود + تنبيه عند استهلاك غير منطقي",
  },
  vehicle_maintenance: {
    id: "vehicle_maintenance", domain: "vehicle", label: "صيانة (دورية/طارئة)",
    fields: [
      VEHICLE, ODOMETER, { key: "driverId", label: "السائق وقت البلاغ", kind: "driver" },
      { key: "maintenanceType", label: "نوع الصيانة", kind: "select",
        options: ["دورية", "إصلاح", "طارئة", "وقائية", "حادث"].map((v) => ({ value: v, label: v })) },
      { key: "performedBy", label: "الورشة / المورد", kind: "text" },
      { key: "costBearer", label: "مَن يتحمّل", kind: "select",
        options: ["company", "driver", "customer", "third_party", "insurance"].map((v) => ({ value: v, label: v })) },
      ATTACH,
    ],
    accountPurpose: "vehicle_maintenance_expense", costCenterSource: "vehicle",
    effect: "maintenance_ticket", futureTask: "تذكير الصيانة الوقائية القادم من جدول المركبة",
  },
  vehicle_tires: {
    id: "vehicle_tires", domain: "vehicle", label: "كفرات",
    fields: [VEHICLE, ODOMETER, { key: "tireCount", label: "عدد الكفرات", kind: "number" },
      { key: "tireSize", label: "المقاس", kind: "text" }, ATTACH],
    accountPurpose: "vehicle_maintenance_expense", costCenterSource: "vehicle",
    effect: "maintenance_ticket", futureTask: "مهمة فحص/استبدال حسب الممشى",
  },
  vehicle_purchase: {
    id: "vehicle_purchase", domain: "vehicle", label: "شراء مركبة",
    fields: [
      { key: "supplierId", label: "المورد", kind: "supplier" },
      { key: "assetName", label: "اسم الأصل", kind: "text", required: true },
      { key: "usefulLifeYears", label: "العمر الإنتاجي (سنوات)", kind: "number" }, ATTACH,
    ],
    accountPurpose: "fixed_asset_purchase", capitalize: true, costCenterSource: "vehicle",
    effect: "asset_creation", futureTask: "يبدأ الإهلاك الشهري + مهام تأمين/فحص/استمارة",
  },
  // ── property ────────────────────────────────────────────────────────────
  property_maintenance: {
    id: "property_maintenance", domain: "property", label: "صيانة عقار/وحدة",
    fields: [
      { key: "propertyId", label: "العقار", kind: "property", required: true },
      { key: "unitId", label: "الوحدة", kind: "unit" },
      { key: "contractId", label: "العقد النشط", kind: "contract" },
      { key: "maintenanceType", label: "نوع الصيانة", kind: "text" },
      { key: "performedBy", label: "الفني / المورد", kind: "text" },
      { key: "costBearer", label: "مَن يتحمّل", kind: "select",
        options: [{ value: "owner", label: "المالك" }, { value: "tenant", label: "المستأجر" }] },
      ATTACH,
    ],
    accountPurpose: "property_maintenance_expense", costCenterSource: "property",
    effect: "maintenance_ticket", futureTask: "مطالبة المستأجر عند تحمّله التكلفة",
  },
  // ── umrah ───────────────────────────────────────────────────────────────
  umrah_cost: {
    id: "umrah_cost", domain: "umrah", label: "تكلفة عمرة (سكن/نقل/إعاشة/خدمة)",
    fields: [
      { key: "umrahSeasonId", label: "الموسم", kind: "umrah_season", required: true },
      { key: "umrahAgentId", label: "الوكيل", kind: "umrah_agent" },
      { key: "umrahGroupId", label: "المجموعة", kind: "umrah_group" }, ATTACH,
    ],
    accountPurpose: "umrah_cost", costCenterSource: "umrah", effect: null,
  },
  // ── project ─────────────────────────────────────────────────────────────
  project_cost: {
    id: "project_cost", domain: "project", label: "تكلفة مشروع (مواد/مقاول/عمالة/معدات)",
    fields: [{ key: "projectId", label: "المشروع", kind: "project", required: true }, ATTACH],
    accountPurpose: "project_cost", costCenterSource: "project", effect: null,
  },
  // ── inventory ───────────────────────────────────────────────────────────
  inventory_purchase: {
    id: "inventory_purchase", domain: "inventory", label: "شراء مخزون",
    fields: [
      { key: "supplierId", label: "المورد", kind: "supplier" },
      { key: "warehouseId", label: "المستودع", kind: "warehouse" },
      { key: "productId", label: "الصنف", kind: "product" },
      { key: "quantity", label: "الكمية", kind: "number" }, ATTACH,
    ],
    accountPurpose: "inventory_receipt", capitalize: true, costCenterSource: null,
    effect: "stock_movement",
  },
  // ── fixed asset ─────────────────────────────────────────────────────────
  asset_purchase: {
    id: "asset_purchase", domain: "fixed_asset", label: "شراء أصل",
    fields: [
      { key: "supplierId", label: "المورد", kind: "supplier" },
      { key: "assetName", label: "اسم الأصل", kind: "text", required: true },
      { key: "usefulLifeYears", label: "العمر الإنتاجي (سنوات)", kind: "number" }, ATTACH,
    ],
    accountPurpose: "fixed_asset_purchase", capitalize: true, costCenterSource: "fixed_asset",
    effect: "asset_creation", futureTask: "يبدأ الإهلاك الشهري تلقائيًا",
  },
  // ── document / licence ──────────────────────────────────────────────────
  document_renewal: {
    id: "document_renewal", domain: "document", label: "وثيقة / ترخيص / تجديد",
    fields: [
      { key: "documentType", label: "نوع الوثيقة", kind: "text", required: true },
      { key: "documentNumber", label: "رقم الوثيقة", kind: "text" },
      { key: "expiryDate", label: "تاريخ الانتهاء", kind: "date" }, ATTACH,
    ],
    accountPurpose: "general_expense", costCenterSource: null,
    effect: "document_record", futureTask: "مهمة تجديد + تنبيه قبل الانتهاء (بلا قيد الآن)",
  },
  // ── general ─────────────────────────────────────────────────────────────
  general_expense: {
    id: "general_expense", domain: "general", label: "مصروف عام",
    fields: [ATTACH],
    accountPurpose: "general_expense", costCenterSource: null, effect: null,
  },
};

/** Scenarios available for a domain — the renderer shows ONLY these. */
export function scenariosForDomain(domain: FinanceDomain): FinanceScenario[] {
  return Object.values(FINANCE_SCENARIOS).filter((s) => s.domain === domain);
}

/** The single resolver the renderer + preview call once a scenario is chosen. */
export function resolveScenario(scenarioId: string): FinanceScenario | null {
  return FINANCE_SCENARIOS[scenarioId] ?? null;
}

// ── allocation targets ──────────────────────────────────────────────────────
//
// The «ربط العملية بـ» master picker (AllocationTargetSelect) chooses WHAT an
// operation is linked to. Each target has a single, canonical hint — the
// expected GL purpose, the operational effect, and the future task it
// schedules — that the panel renders BEFORE saving (spec §5/§6/§7). These keys
// are the SAME strings the backend deriveSpecializedAccount /
// deriveOperationalEffectHint use, and the acceptance test pins the parity so
// the FE hint can never drift from what the backend actually posts.

export type FinanceTarget =
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

export interface TargetHint {
  /** Expected GL purpose — equals deriveSpecializedAccount(target).purpose. */
  accountPurpose: string;
  /** True when the spend capitalises (balance sheet), not a P&L expense. */
  capitalize: boolean;
  /** Where the amount is charged / the operational side-effect it produces. */
  effect: string | null;
  /** The future task the link schedules, if any. */
  futureTask: string | null;
}

export const TARGET_HINTS: Record<FinanceTarget, TargetHint> = {
  none: { accountPurpose: "general_expense", capitalize: false, effect: null, futureTask: null },
  vehicle: {
    accountPurpose: "vehicle_expense", capitalize: false,
    effect: "يُحمَّل على المركبة ويظهر في تقرير تكلفة المركبة.", futureTask: null,
  },
  vehicle_maintenance: {
    accountPurpose: "vehicle_maintenance_expense", capitalize: false,
    effect: "سيُنشئ تذكرة صيانة مركبة وتُربط بهذا المصروف، ويُحدَّث عدّاد المركبة.",
    futureTask: "تذكير الصيانة الوقائية القادم يُحتسب من جدول صيانة المركبة.",
  },
  property: {
    accountPurpose: "property_expense", capitalize: false,
    effect: "يُحمَّل على العقار ويظهر في تقرير ربحية العقار.", futureTask: null,
  },
  property_maintenance: {
    accountPurpose: "property_maintenance_expense", capitalize: false,
    effect: "سيُنشئ تذكرة صيانة عقارية وتُربط بهذا المصروف (العقار/الوحدة/المستأجر).", futureTask: null,
  },
  unit: {
    accountPurpose: "property_maintenance_expense", capitalize: false,
    effect: "يُحمَّل على الوحدة العقارية ويظهر في تقرير ربحية العقار.", futureTask: null,
  },
  contract: {
    accountPurpose: "property_expense", capitalize: false,
    effect: "يُحمَّل على العقد المرتبط.", futureTask: null,
  },
  project: {
    accountPurpose: "project_cost", capitalize: false,
    effect: "يُحمَّل على المشروع ويظهر في تكلفة المشروع.", futureTask: null,
  },
  umrah_season: {
    accountPurpose: "umrah_cost", capitalize: false,
    effect: "يُحمَّل على موسم العمرة.", futureTask: null,
  },
  umrah_agent: {
    accountPurpose: "umrah_cost", capitalize: false,
    effect: "يُحمَّل على وكيل العمرة.", futureTask: null,
  },
  transport_trip: {
    accountPurpose: "transport_cost", capitalize: false,
    effect: "يُحمَّل على رحلة النقل.", futureTask: null,
  },
  supplier: {
    accountPurpose: "general_expense", capitalize: false,
    effect: "يُربط بالمورد ويظهر في كشف حساب المورد.", futureTask: null,
  },
  customer: {
    accountPurpose: "general_expense", capitalize: false,
    effect: "يُربط بالعميل ويظهر في كشف حساب العميل.", futureTask: null,
  },
  employee: {
    accountPurpose: "general_expense", capitalize: false,
    effect: "يُربط بالموظف.", futureTask: null,
  },
  fixed_asset: {
    accountPurpose: "fixed_asset_purchase", capitalize: true,
    effect: "يُرسمَل كأصل ثابت بدل قيده مصروفًا، وتزداد قيمته الدفترية.",
    futureTask: "سيبدأ احتساب الإهلاك الشهري تلقائيًا عبر محرك الإهلاك.",
  },
};

/** Resolve the hint for a linked target — the single source the panel reads. */
export function resolveTargetHint(target: string): TargetHint | null {
  return TARGET_HINTS[target as FinanceTarget] ?? null;
}

// ── linked entity derivation ────────────────────────────────────────────────
//
// The legacy expense / voucher forms each had their OWN «الجهة المرتبطة»
// picker on top of the scenario panel — a duplicate dimension. Both now derive
// the linked entity from the chosen scenario via this one function, so the
// relatedEntityType/Id the backend persists has a single, shared source.

export type RelatedKind =
  | ""
  | "employee"
  | "vehicle"
  | "supplier"
  | "customer"
  | "contract"
  | "property";

/** The allocation dimensions a target may carry (subset that maps to an entity). */
export interface RelatedDims {
  vehicleId?: string;
  vendorId?: string;
  employeeId?: string;
  clientId?: string;
  unitId?: string;
  contractId?: string;
}

// ── purchase line treatments ────────────────────────────────────────────────
//
// The purchase / GRN intake form classifies each line by how it should post
// (inventory / expense / fixed-asset / project-cost / …). The backend's
// TREATMENT_PURPOSE map (finance-purchase.ts) is the authority that routes the
// GRN GL entry. This registry mirrors it so the intake form can show the
// expected accounting per line (same «التوجيه المحاسبي المتوقع» principle as
// the expense scenario), and a unit test pins the parity against the backend.

export interface PurchaseTreatment {
  value: string;
  label: string;
  /** GL purpose — equals the backend TREATMENT_PURPOSE[value].purpose. */
  accountPurpose: string;
  /** Seed default account — equals the backend defaultCode. */
  defaultCode: string;
  /** True when the line capitalises (balance-sheet account), not a P&L expense. */
  capitalize: boolean;
  /** Short Arabic expected-accounting hint shown under the line. */
  hint: string;
}

export const PURCHASE_LINE_TREATMENTS: PurchaseTreatment[] = [
  { value: "inventory", label: "مخزون (Inventory)", accountPurpose: "inventory_receipt", defaultCode: "1150", capitalize: true, hint: "يُرسمَل في المخزون ويُسوّى عند استلام البضاعة (GRN)." },
  { value: "expense", label: "مصروف (Expense)", accountPurpose: "general_expense", defaultCode: "6900", capitalize: false, hint: "يُقيَّد مصروفًا عامًا فور الاستلام." },
  { value: "fixed_asset", label: "أصل ثابت (Fixed Asset)", accountPurpose: "fixed_asset_purchase", defaultCode: "1280", capitalize: true, hint: "يُرسمَل كأصل ثابت ويبدأ إهلاكه الشهري تلقائيًا." },
  { value: "project_cost", label: "تكلفة مشروع (Project Cost)", accountPurpose: "project_cost", defaultCode: "6800", capitalize: false, hint: "يُحمَّل على تكلفة المشروع المرتبط." },
  { value: "vehicle_cost", label: "تكلفة مركبة (Vehicle Cost)", accountPurpose: "vehicle_expense", defaultCode: "6500", capitalize: false, hint: "يُحمَّل على مصروفات المركبة." },
  { value: "property_maintenance", label: "صيانة عقار (Property Maintenance)", accountPurpose: "property_maintenance_expense", defaultCode: "6600", capitalize: false, hint: "يُحمَّل على صيانة العقار." },
  { value: "custody", label: "عهدة موظف (Custody)", accountPurpose: "employee_custody", defaultCode: "1142", capitalize: true, hint: "يُسجَّل كعهدة على الموظف (أصل) حتى التسوية." },
  { value: "prepayment", label: "دفعة مقدمة (Prepayment)", accountPurpose: "supplier_prepayment", defaultCode: "1170", capitalize: true, hint: "يُسجَّل دفعة مقدمة للمورد (أصل) حتى التسوية." },
  { value: "service", label: "خدمة (Service)", accountPurpose: "service_expense", defaultCode: "6920", capitalize: false, hint: "يُقيَّد مصروف خدمات." },
];

/** Resolve a purchase line treatment — the source the intake form reads. */
export function resolvePurchaseTreatment(value: string): PurchaseTreatment | null {
  return PURCHASE_LINE_TREATMENTS.find((t) => t.value === value) ?? null;
}

/** Map a chosen target + its allocation dims onto the persisted related entity. */
export function deriveRelatedEntity(
  target: string,
  a: RelatedDims,
): { type: RelatedKind; id: string } {
  switch (target as FinanceTarget) {
    case "vehicle":
    case "vehicle_maintenance":
    case "transport_trip":
      return { type: a.vehicleId ? "vehicle" : "", id: a.vehicleId ?? "" };
    case "supplier":
      return { type: a.vendorId ? "supplier" : "", id: a.vendorId ?? "" };
    case "customer":
      return { type: a.clientId ? "customer" : "", id: a.clientId ?? "" };
    case "employee":
      return { type: a.employeeId ? "employee" : "", id: a.employeeId ?? "" };
    case "property":
    case "property_maintenance":
    case "unit":
      return { type: a.unitId ? "property" : "", id: a.unitId ?? "" };
    case "contract":
      return { type: a.contractId ? "contract" : "", id: a.contractId ?? "" };
    default:
      return { type: "", id: "" };
  }
}

// ── #1945 item 5 — direction-aware voucher (صرف=مصروف / قبض=إيراد) ──────
// Which chart-of-accounts TYPES the voucher's counter account may be, per
// voucher operationType. FIN-SUB-05 (#2101): this map and its Arabic labels
// now live in ONE canonical source (@workspace/api-zod/financeDirectionMaps)
// consumed by BOTH this form UX and the backend enforcement
// (api-server/src/lib/financeOperationContext.ts) — so the form can never
// drift from what the server accepts. The backend rejects with 422; this map
// drives the form hint so the operator picks right the first time. Unknown
// operationType falls back to the direction invariant: قبض لا يقيَّد على مصروف،
// صرف لا يقيَّد على إيراد.
//
// Re-exported under the legacy FE names (AccountTypeKey, ACCOUNT_TYPE_LABELS_AR,
// VOUCHER_COUNTER_ACCOUNT_TYPES) so existing FE importers don't break. The
// imports themselves are hoisted to the top of the file.
export {
  ACCOUNT_TYPE_LABELS_AR,
  VOUCHER_COUNTER_ACCOUNT_TYPES,
  type AccountTypeKey,
};

/** Human hint for the voucher form: which account types the chosen
 *  operation expects for its counter account. */
export function voucherCounterAccountHint(operationType: string, direction: "receipt" | "payment"): string {
  const allowed = VOUCHER_COUNTER_ACCOUNT_TYPES[operationType];
  if (allowed) {
    return `هذه العملية تتوقع حساب ${allowed.map((t) => ACCOUNT_TYPE_LABELS_AR[t]).join(" أو ")}.`;
  }
  return direction === "receipt"
    ? "سند القبض لا يُقيَّد على حساب مصروف."
    : "سند الصرف لا يُقيَّد على حساب إيراد.";
}
