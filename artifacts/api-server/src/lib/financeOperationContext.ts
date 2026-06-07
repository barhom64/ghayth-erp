// financeOperationContext.ts
//
// The unified description of EVERY finance operation (#1715). Per the
// consolidation directive: we do NOT rebuild — we wrap the existing
// primitives (financeAccountClassifier, financePostingPolicy,
// accountingAllocation.resolveLineAllocation) behind one context object
// + legacy adapters so the scattered create flows converge without
// breaking the old payloads.
//
// A FinanceOperationContext answers, for any operation:
//   - operationType        نوع العملية
//   - party                الطرف
//   - moneySource/Dest     مصدر/وجهة المال (+ usage)
//   - paymentMethod        طريقة الدفع/القبض
//   - allocationTarget     هدف الربط + أبعاده
//   - operationalEffect    الأثر التشغيلي (تذكرة صيانة / تحديث عهدة)
//   - overrideReason       سبب أي تجاوز يدوي
//
// The route handlers build a context, call assertValid (which runs the
// posting policy), then post the JE with the resolved dims. Adapters map
// the legacy form payloads into this shape so no caller breaks.

import type { AccountUsage } from "./financeAccountClassifier.js";

export type FinanceOperationType =
  | "expense" | "receipt" | "payment" | "invoice" | "vendor_invoice"
  | "custody" | "transfer" | "manual_journal" | "opening_balance";

export type AllocationTarget =
  | "none" | "vehicle" | "vehicle_maintenance" | "property"
  | "property_maintenance" | "unit" | "contract" | "project"
  | "umrah_season" | "umrah_agent" | "transport_trip" | "supplier"
  | "customer" | "employee" | "fixed_asset";

// The canonical dim payload (mirrors LineAllocation / lineAllocationSchema).
export interface OperationDimensions {
  costCenterId?: number | null;
  activityType?: string | null;
  projectId?: number | null;
  vehicleId?: number | null;
  propertyId?: number | null;
  unitId?: number | null;
  assetId?: number | null;
  contractId?: number | null;
  umrahAgentId?: number | null;
  umrahSeasonId?: number | null;
  clientId?: number | null;
  vendorId?: number | null;
  driverId?: number | null;
  productId?: number | null;
  departmentId?: number | null;
  employeeId?: number | null;
  manualOverrideReason?: string | null;
}

export interface OperationalEffect {
  kind: "maintenance_ticket" | "custody_update" | "none";
  // For maintenance_ticket:
  maintenanceType?: string;
  odometer?: number;
  costBearer?: "owner" | "tenant" | "shared";
  reason?: string;
}

export interface FinanceOperationContext {
  operationType: FinanceOperationType;
  companyId: number;
  branchId?: number | null;
  party?: { type: string; id?: number | null; name?: string | null };
  moneySource?: { accountCode?: string | null; usage?: AccountUsage | null };
  moneyDestination?: { accountCode?: string | null; usage?: AccountUsage | null };
  paymentMethod?: string | null;
  allocationTarget: AllocationTarget;
  dimensions: OperationDimensions;
  operationalEffect: OperationalEffect;
  overrideReason?: string | null;
}

// ── Validation: runs the posting policy on the money account vs method ──
export async function assertOperationValid(ctx: FinanceOperationContext): Promise<void> {
  const { assertPaymentSourceAllowed } = await import("./financePostingPolicy.js");
  const moneyCode = ctx.moneySource?.accountCode ?? ctx.moneyDestination?.accountCode;
  if (moneyCode && ctx.paymentMethod) {
    await assertPaymentSourceAllowed({
      companyId: ctx.companyId,
      accountCode: moneyCode,
      paymentMethod: ctx.paymentMethod,
    });
  }
}

// ── Resolve dims + cost-centre via the central allocation resolver ─────
// Wraps accountingAllocation.resolveLineAllocation so callers get the
// rule-driven account + CC without re-implementing the lookup.
export async function resolveOperationAllocation(ctx: FinanceOperationContext): Promise<{
  accountCode: string | null;
  costCenterId: number | null;
  dimensions: OperationDimensions;
}> {
  const { resolveLineAllocation } = await import("./accountingAllocation.js");
  const d = ctx.dimensions;
  const resolved = await resolveLineAllocation({
    companyId: ctx.companyId,
    documentType: ctx.operationType,
    entityType: ctx.party?.type,
    accountCode: undefined,
    costCenterId: d.costCenterId ?? null,
    dimensions: {
      vehicleId: d.vehicleId ?? null,
      propertyId: d.propertyId ?? null,
      unitId: d.unitId ?? null,
      assetId: d.assetId ?? null,
      projectId: d.projectId ?? null,
      employeeId: d.employeeId ?? null,
      driverId: d.driverId ?? null,
      contractId: d.contractId ?? null,
      umrahSeasonId: d.umrahSeasonId ?? null,
      umrahAgentId: d.umrahAgentId ?? null,
      productId: d.productId ?? null,
      clientId: d.clientId ?? null,
      vendorId: d.vendorId ?? null,
    },
    sourceTable: "journal_lines",
    sourceLineId: 0,
  });
  return {
    accountCode: resolved.resolvedAccountCode ?? null,
    costCenterId: resolved.costCenterId ?? d.costCenterId ?? null,
    dimensions: { ...d, costCenterId: resolved.costCenterId ?? d.costCenterId ?? null },
  };
}

// ─────────────────────────────────────────────────────────────────────
// LEGACY ADAPTERS — map the existing form payloads into a context so the
// old callers keep working while the pages migrate wave-by-wave.
// ─────────────────────────────────────────────────────────────────────

interface LegacyLineAllocation {
  costCenterId?: number; activityType?: string; projectId?: number;
  vehicleId?: number; propertyId?: number; unitId?: number; assetId?: number;
  contractId?: number; umrahAgentId?: number; umrahSeasonId?: number;
  clientId?: number; vendorId?: number; driverId?: number; productId?: number;
  departmentId?: number; employeeId?: number; manualOverrideReason?: string;
}

function dimsFromLegacy(la: LegacyLineAllocation | undefined): OperationDimensions {
  if (!la) return {};
  return {
    costCenterId: la.costCenterId ?? null,
    activityType: la.activityType ?? null,
    projectId: la.projectId ?? null,
    vehicleId: la.vehicleId ?? null,
    propertyId: la.propertyId ?? null,
    unitId: la.unitId ?? null,
    assetId: la.assetId ?? null,
    contractId: la.contractId ?? null,
    umrahAgentId: la.umrahAgentId ?? null,
    umrahSeasonId: la.umrahSeasonId ?? null,
    clientId: la.clientId ?? null,
    vendorId: la.vendorId ?? null,
    driverId: la.driverId ?? null,
    productId: la.productId ?? null,
    departmentId: la.departmentId ?? null,
    employeeId: la.employeeId ?? null,
    manualOverrideReason: la.manualOverrideReason ?? null,
  };
}

function targetFromDims(d: OperationDimensions): AllocationTarget {
  if (d.vehicleId) return "vehicle";
  if (d.propertyId) return "property";
  if (d.unitId) return "unit";
  if (d.contractId) return "contract";
  if (d.projectId) return "project";
  if (d.umrahSeasonId) return "umrah_season";
  if (d.umrahAgentId) return "umrah_agent";
  if (d.assetId) return "fixed_asset";
  if (d.vendorId) return "supplier";
  if (d.clientId) return "customer";
  if (d.employeeId) return "employee";
  return "none";
}

export function fromLegacyExpenseForm(b: {
  companyId: number; branchId?: number | null;
  sourceAccountCode?: string | null; paymentMethod?: string | null;
  relatedEntityType?: string | null; relatedEntityId?: number | null;
  lineAllocation?: LegacyLineAllocation;
}): FinanceOperationContext {
  const dims = dimsFromLegacy(b.lineAllocation);
  return {
    operationType: "expense",
    companyId: b.companyId,
    branchId: b.branchId ?? null,
    party: b.relatedEntityType ? { type: b.relatedEntityType, id: b.relatedEntityId ?? null } : undefined,
    moneySource: { accountCode: b.sourceAccountCode ?? null },
    paymentMethod: b.paymentMethod ?? null,
    allocationTarget: targetFromDims(dims),
    dimensions: dims,
    operationalEffect: { kind: "none" },
    overrideReason: dims.manualOverrideReason ?? null,
  };
}

export function fromLegacyVoucherForm(b: {
  companyId: number; branchId?: number | null; type?: string | null;
  sourceAccountCode?: string | null; method?: string | null;
  relatedEntityType?: string | null; relatedEntityId?: number | null;
  lineAllocation?: LegacyLineAllocation;
}): FinanceOperationContext {
  const dims = dimsFromLegacy(b.lineAllocation);
  return {
    operationType: b.type === "receipt" ? "receipt" : "payment",
    companyId: b.companyId,
    branchId: b.branchId ?? null,
    party: b.relatedEntityType ? { type: b.relatedEntityType, id: b.relatedEntityId ?? null } : undefined,
    moneySource: { accountCode: b.sourceAccountCode ?? null },
    paymentMethod: b.method ?? null,
    allocationTarget: targetFromDims(dims),
    dimensions: dims,
    operationalEffect: { kind: "none" },
    overrideReason: dims.manualOverrideReason ?? null,
  };
}

export function fromLegacyInvoiceLine(line: {
  companyId: number; productId?: number | null; clientId?: number | null;
  costCenterId?: number | null; projectId?: number | null;
}): OperationDimensions {
  return {
    productId: line.productId ?? null,
    clientId: line.clientId ?? null,
    costCenterId: line.costCenterId ?? null,
    projectId: line.projectId ?? null,
  };
}

export function fromLegacyCustodyForm(b: {
  companyId: number; branchId?: number | null;
  sourceAccountCode?: string | null; paymentMethod?: string | null;
  assignmentId?: number | null; employeeName?: string | null;
}): FinanceOperationContext {
  return {
    operationType: "custody",
    companyId: b.companyId,
    branchId: b.branchId ?? null,
    party: { type: "employee", id: b.assignmentId ?? null, name: b.employeeName ?? null },
    moneySource: { accountCode: b.sourceAccountCode ?? null },
    paymentMethod: b.paymentMethod ?? null,
    allocationTarget: b.assignmentId ? "employee" : "none",
    dimensions: { employeeId: b.assignmentId ?? null },
    operationalEffect: { kind: "custody_update" },
  };
}
