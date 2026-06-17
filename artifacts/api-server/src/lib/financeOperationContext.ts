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
import { ValidationError } from "./errorHandler.js";
// FIN-SUB-05 (#2101) — the voucher direction/label maps live in the single
// canonical source (lib/api-zod/src/financeDirectionMaps.ts) shared with the
// ghayth-erp form UX. We import them here and re-export under the legacy BE
// name so existing importers don't break. Pure move — zero semantic change.
import {
  ACCOUNT_TYPE_LABELS,
  VOUCHER_COUNTER_ACCOUNT_TYPES,
} from "@workspace/api-zod/financeDirectionMaps";

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
  /** #1945 item 5 — the voucher's revenue/expense/AR/AP leg opposite the
   *  cash leg. `operationKey` is the voucher operationType (rent / salary /
   *  invoice_payment / …); `direction` is the voucher type. Both drive the
   *  direction-aware account-type validation in assertOperationValid. */
  counterAccount?: {
    accountCode?: string | null;
    operationKey?: string | null;
    direction?: "receipt" | "payment" | null;
  };
  paymentMethod?: string | null;
  allocationTarget: AllocationTarget;
  dimensions: OperationDimensions;
  operationalEffect: OperationalEffect;
  overrideReason?: string | null;
}

// Each allocation target must carry its own key dimension — selecting
// «ربط بمركبة» with no vehicleId is a conflicting/incomplete context (#1715
// §4 "منع الحقول المتعارضة", §10 gap "عمليات بلا target رغم أنها صيانة…").
// transport_trip has no dimension field yet, so it is intentionally absent.
const REQUIRED_DIM_FOR_TARGET: Partial<
  Record<AllocationTarget, { key: keyof OperationDimensions; label: string }>
> = {
  vehicle: { key: "vehicleId", label: "مركبة" },
  vehicle_maintenance: { key: "vehicleId", label: "مركبة" },
  property: { key: "propertyId", label: "عقار" },
  property_maintenance: { key: "propertyId", label: "عقار" },
  unit: { key: "unitId", label: "وحدة" },
  contract: { key: "contractId", label: "عقد" },
  project: { key: "projectId", label: "مشروع" },
  umrah_season: { key: "umrahSeasonId", label: "موسم عمرة" },
  umrah_agent: { key: "umrahAgentId", label: "وكيل عمرة" },
  supplier: { key: "vendorId", label: "مورد" },
  customer: { key: "clientId", label: "عميل" },
  employee: { key: "employeeId", label: "موظف" },
  fixed_asset: { key: "assetId", label: "أصل ثابت" },
};

// A transfer moves money between liquidity accounts; its source must be a
// payment-source usage, never an expense / fixed asset / receivable / payable
// (#1715 §6 "لا يسمح بالتحويل من حساب مصروف أو أصل ثابت أو ذمم").
const FORBIDDEN_TRANSFER_SOURCE_USAGES: AccountUsage[] = [
  "operating_expense", "cogs", "payroll_expense", "fixed_asset", "receivable", "payable",
];

// ── #1945 item 5 — direction-aware voucher (صرف=مصروف / قبض=إيراد) ──────
// The voucher's COUNTER account (the revenue/expense/AR/AP leg opposite the
// cash leg) is operator-pinned, and nothing validated its direction: a سند
// قبض crediting an EXPENSE account (or a سند صرف debiting a REVENUE account)
// posted silently and flipped the P&L. Two-tier rule:
//   • a known operationType pins the exact allowed chart types below
//     (e.g. invoice_payment clears AR → asset; deposit creates a liability);
//   • an unknown/legacy operationType falls back to the direction invariant:
//     قبض never lands on a مصروف account, صرف never lands on an إيراد account.
// Mirrored for the form UX in ghayth-erp/src/lib/finance/scenario-model.ts —
// both sides now consume @workspace/api-zod/financeDirectionMaps; the backend
// stays the enforcement point. The canonical map is named
// VOUCHER_COUNTER_ACCOUNT_TYPES; we re-export it under the legacy BE name
// VOUCHER_OPERATION_COUNTER_TYPES so existing importers don't break.
export { VOUCHER_COUNTER_ACCOUNT_TYPES as VOUCHER_OPERATION_COUNTER_TYPES };

/**
 * Assert a finance operation context is internally consistent and legal:
 *   1. money source/destination account matches the payment method,
 *   2. the chosen allocation target carries its key dimension, and
 *   3. a transfer's source is a real liquidity account.
 * Throws ValidationError (422) with an Arabic message on any conflict.
 */
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

  // (2) allocation target ↔ dimension consistency
  const need = ctx.allocationTarget !== "none" ? REQUIRED_DIM_FOR_TARGET[ctx.allocationTarget] : undefined;
  if (need && ctx.dimensions[need.key] == null) {
    throw new ValidationError(
      `الربط بـ«${need.label}» يتطلب تحديد ${need.label} — الحقل ناقص أو متعارض`,
      {
        field: "allocationTarget",
        fix: `اختر ${need.label} أو غيّر نوع الربط`,
        meta: { allocationTarget: ctx.allocationTarget, missingDimension: need.key },
      },
    );
  }

  // (3) transfer source must be a liquidity account (when its usage is known)
  if (ctx.operationType === "transfer") {
    const srcUsage = ctx.moneySource?.usage;
    if (srcUsage && FORBIDDEN_TRANSFER_SOURCE_USAGES.includes(srcUsage)) {
      throw new ValidationError(
        "لا يسمح بالتحويل من حساب مصروف أو أصل ثابت أو ذمم — اختر صندوقاً أو بنكاً أو عهدة كمصدر",
        {
          field: "sourceAccountCode",
          fix: "اختر حساب صندوق/بنك/عهدة صالحاً كمصدر للتحويل",
          meta: { sourceUsage: srcUsage },
        },
      );
    }
  }

  // (4) #1945 item 5 — direction-aware voucher counter account
  // (صرف=مصروف / قبض=إيراد). Known operationType → exact allowed types;
  // unknown → the direction invariant only. Account not found is left to
  // the posting engine's own existence/postability validation.
  const ca = ctx.counterAccount;
  if (ca?.accountCode && ca.direction) {
    const { rawQuery } = await import("./rawdb.js");
    const [acc] = await rawQuery<{ type: string; name: string }>(
      `SELECT type, name FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [ctx.companyId, ca.accountCode],
    );
    if (acc) {
      const allowed = ca.operationKey ? VOUCHER_COUNTER_ACCOUNT_TYPES[ca.operationKey] : undefined;
      const dirLabel = ca.direction === "receipt" ? "سند قبض" : "سند صرف";
      // `acc.type` comes from the DB as a raw string; the shared maps are
      // strongly typed (AccountTypeKey). Look the label up through a loose
      // string view so an unknown/legacy DB type falls back to the raw string
      // — identical runtime behaviour to the pre-unification BE code.
      const labelOf = (t: string): string =>
        (ACCOUNT_TYPE_LABELS as Record<string, string>)[t] ?? t;
      if (allowed) {
        if (!(allowed as string[]).includes(acc.type)) {
          throw new ValidationError(
            `${dirLabel} (${ca.operationKey}) يتوقع حساب ${allowed.map((t) => labelOf(t)).join(" أو ")} — ` +
            `«${ca.accountCode} ${acc.name}» حساب ${labelOf(acc.type)}`,
            {
              field: "accountCode",
              fix: "اختر حساباً من النوع المتوقع لهذا النوع من السندات أو غيّر نوع العملية",
              meta: { operationKey: ca.operationKey, accountType: acc.type, allowedTypes: allowed },
            },
          );
        }
      } else if (ca.direction === "receipt" && acc.type === "expense") {
        throw new ValidationError(
          `سند قبض لا يُقيَّد على حساب مصروف — «${ca.accountCode} ${acc.name}»`,
          { field: "accountCode", fix: "اختر حساب إيراد/ذمم مناسباً، أو استخدم عملية «استرداد مبلغ» لاسترداد مصروف", meta: { accountType: acc.type } },
        );
      } else if (ca.direction === "payment" && acc.type === "revenue") {
        throw new ValidationError(
          `سند صرف لا يُقيَّد على حساب إيراد — «${ca.accountCode} ${acc.name}»`,
          { field: "accountCode", fix: "اختر حساب مصروف/ذمم مناسباً، أو سجّل إشعار دائن إن كان المقصود ردّ إيراد", meta: { accountType: acc.type } },
        );
      }
    }
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
  // #1945 item 5 — the operator-pinned counter account + the voucher
  // operationType, for the direction-aware validation (rule 4).
  counterAccountCode?: string | null;
  operationType?: string | null;
}): FinanceOperationContext {
  const dims = dimsFromLegacy(b.lineAllocation);
  const direction: "receipt" | "payment" = b.type === "receipt" ? "receipt" : "payment";
  return {
    operationType: direction,
    companyId: b.companyId,
    branchId: b.branchId ?? null,
    party: b.relatedEntityType ? { type: b.relatedEntityType, id: b.relatedEntityId ?? null } : undefined,
    moneySource: { accountCode: b.sourceAccountCode ?? null },
    counterAccount: b.counterAccountCode
      ? { accountCode: b.counterAccountCode, operationKey: b.operationType ?? null, direction }
      : undefined,
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
