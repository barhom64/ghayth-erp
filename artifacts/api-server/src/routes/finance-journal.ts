import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { FINANCE_ROLES, OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { issueNumber } from "../lib/numberingService.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  reverseAccountBalances,
  checkFinancialPeriodOpen,
  computeVat,
  currentPeriod,
  currentDateInTz,
  toDateISO,
  roundTo2,
  applyJournalEntryBalances,
} from "../lib/businessHelpers.js";
import {
  requestIdempotencyToken,
  markIdempotencyReplay,
  idempotencyResponseMeta,
  isDryRun,
} from "../lib/requestIdempotency.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { closeFiscalPeriodCanonical } from "../lib/fiscalPeriodLifecycle.js";
import { logAllocationOverride } from "../lib/accountingAllocation.js";
import { resolveTransactionBranch } from "../lib/branchResolution.js";
import { costCenterSplitSchema, resolveCostCenterSplits } from "../lib/costCenterSplit.js";
import { logger } from "../lib/logger.js";

export const journalRouter = Router();
journalRouter.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// ZOD SCHEMAS — request body validation
// ─────────────────────────────────────────────────────────────────────────────

const expenseImpactPreviewSchema = z.object({
  amount: z.any().optional(),
  expenseType: z.string().optional(),
  paymentMethod: z.string().optional(),
  costCenter: z.string().optional(),
  supplierId: z.any().optional(),
  branchId: z.any().optional(),
  // #1715 (comment 9) — the allocation target drives a specialized-account hint.
  targetType: z.string().optional(),
  itemType: z.string().optional(),
});

// Shared line-allocation payload (the LineAllocationPanel /
// AllocationTargetSelect output). Accepted by expense + voucher create so
// both flows carry the same dim parity into the JE. #1715.
const lineAllocationSchema = z.object({
  accountCode: z.string().optional(),
  costCenterId: z.coerce.number().optional(),
  activityType: z.string().optional(),
  projectId: z.coerce.number().optional(),
  vehicleId: z.coerce.number().optional(),
  propertyId: z.coerce.number().optional(),
  unitId: z.coerce.number().optional(),
  assetId: z.coerce.number().optional(),
  contractId: z.coerce.number().optional(),
  umrahAgentId: z.coerce.number().optional(),
  clientId: z.coerce.number().optional(),
  vendorId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  productId: z.coerce.number().optional(),
  umrahSeasonId: z.coerce.number().optional(),
  departmentId: z.coerce.number().optional(),
  employeeId: z.coerce.number().optional(),
  manualOverrideReason: z.string().optional(),
}).optional();

// #1715 — operational-effect inputs shared by BOTH the expense and voucher
// create schemas (an expense and a سند صرف can each trigger the same
// maintenance-ticket / fixed-asset / fuel-log effect). Defined once and spread
// into both schemas so they can never drift — same model as lineAllocationSchema.
const operationalEffectsShape = {
  maintenanceTicket: z.object({
    create: z.boolean().optional(),
    maintenanceType: z.string().optional(),
    odometer: z.coerce.number().optional(),
    costBearer: z.string().optional(),
    performedBy: z.string().optional(),
    // #1715 §5 — link to an existing ticket instead of creating a new one.
    existingTicketId: z.coerce.number().int().positive().optional(),
  }).optional(),
  assetCreation: z.object({
    create: z.boolean().optional(),
    name: z.string().optional(),
    usefulLifeYears: z.coerce.number().int().positive().optional(),
    category: z.string().optional(),
    depreciationMethod: z.string().optional(),
    salvageValue: z.coerce.number().optional(),
  }).optional(),
  fuelLog: z.object({
    create: z.boolean().optional(),
    liters: z.coerce.number().optional(),
    costPerLiter: z.coerce.number().optional(),
    odometer: z.coerce.number().optional(),
    stationName: z.string().optional(),
  }).optional(),
};

const createExpenseSchema = z.object({
  accountCode: z.string().optional(),
  amount: z.any().optional(),
  description: z.string().optional(),
  period: z.string().optional(),
  sourceAccountCode: z.string().optional(),
  branchId: z.any().optional(),
  companyId: z.any().optional(),
  departmentId: z.any().optional(),
  costCenter: z.string().optional(),
  expenseType: z.string().optional(),
  subAccountCode: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.any().optional(),
  relatedEntityName: z.string().optional(),
  paymentMethod: z.string().optional(),
  vatRate: z.any().optional(),
  vatAmount: z.any().optional(),
  reference: z.string().optional(),
  status: z.enum(["draft", "posted", "pending_approval", "approved", "rejected", "returned", "cancelled"]).optional(),
  isPaid: z.any().optional(),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string().optional(),
  operationType: z.string().optional(),
  autoDescription: z.any().optional(),
  projectId: z.any().optional(),
  taxCategory: z.string().optional(),
  govSyncEnabled: z.any().optional(),
  govIntegrationId: z.any().optional(),
  govEntityType: z.string().optional(),
  govEntityId: z.any().optional(),
  date: z.string().optional(),
  isTaxLinked: z.boolean().optional(),
  invoiceTypeCode: z.string().optional(),
  taxCategoryCode: z.string().optional(),
  exemptionReason: z.string().optional(),
  // Audit item #2 — operator-supplied per-line allocation overrides.
  // Mirrors the LineAllocationPanel schema in the frontend. Fields here
  // override the auto-resolved allocation (rule-driven) on the expense
  // JE line. `manualOverrideReason` is required when overriding any
  // resolved dimension and gets logged via logAllocationOverride().
  lineAllocation: lineAllocationSchema,
  // #1715 — optional multi cost-center distribution for the expense DR.
  costCenterDistribution: z.array(costCenterSplitSchema).optional(),
  // #1715 — maintenance-ticket / fixed-asset / fuel-log effect inputs.
  ...operationalEffectsShape,
});

const updateDescriptionSchema = z.object({
  description: z.string().optional(),
});

const approvalSchema = z.object({
  approved: z.any().optional(),
  notes: z.string().optional(),
});

const voucherAllocationSchema = z.object({
  obligationType: z.enum(["purchase_order", "nusk_invoice", "expense", "manual"]),
  obligationId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().finite(),
  notes: z.string().optional(),
});

const createVoucherSchema = z.object({
  type: z.string().optional(),
  amount: z.any().optional(),
  description: z.string().optional(),
  payee: z.string().optional(),
  accountCode: z.string().optional(),
  method: z.string().optional().default("cash"),
  sourceAccountCode: z.string().optional(),
  subAccountCode: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.any().optional(),
  relatedEntityName: z.string().optional(),
  contractId: z.any().optional(),
  invoiceId: z.any().optional(),
  reference: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string().optional(),
  vatRate: z.any().optional(),
  vatAmount: z.any().optional(),
  beneficiaryType: z.string().optional(),
  entitlementType: z.string().optional(),
  branchId: z.any().optional(),
  departmentId: z.any().optional(),
  autoDescription: z.any().optional(),
  operationType: z.string().optional(),
  date: z.string().optional(),
  costCenter: z.string().optional(),
  allocations: z.array(voucherAllocationSchema).optional(),
  // #1715: master «ربط السند بـ» allocation dims (AllocationTargetSelect).
  lineAllocation: lineAllocationSchema,
  // #1715 (owner gap-closure) — a سند صرف pays for the same operations as an
  // expense (maintenance / fuel / asset), so it fires the SAME effects via the
  // SAME shared shape (no copy-paste — can't drift from the expense schema).
  ...operationalEffectsShape,
});

const createSalaryAdvanceSchema = z.object({
  employeeName: z.string().optional(),
  amount: z.any().optional(),
  description: z.string().optional(),
  deductMonths: z.any().optional().default(1),
  sourceAccountCode: z.string().optional(),
  employeeId: z.any().optional(),
});

const journalLineSchema = z.object({
  accountCode: z.string(),
  description: z.string().optional(),
  debit: z.any().optional(),
  credit: z.any().optional(),
  // Pre-fix the schema accepted only 4 of 17 dim FK columns —
  // LineAllocationPanel (frontend) submitted all 17 in buildAllocationPayload,
  // but Zod silently stripped 12 of them at the validation boundary, so
  // the route handler never saw vehicleId / propertyId / contractId /
  // assetId / driverId / productId / vendorId / clientId / umrahAgentId /
  // umrahSeasonId / costCenterId / activityType / unitId. Users saw the
  // form fields working in the UI but every drilldown report came back
  // empty — exactly the "cosmetic pictures" complaint. Accept all 17 +
  // the activityType string + costCenter free-text fallback now.
  costCenter: z.string().optional(),
  costCenterId: z.any().optional(),
  departmentId: z.any().optional(),
  projectId: z.any().optional(),
  employeeId: z.any().optional(),
  vehicleId: z.any().optional(),
  propertyId: z.any().optional(),
  unitId: z.any().optional(),
  assetId: z.any().optional(),
  contractId: z.any().optional(),
  driverId: z.any().optional(),
  productId: z.any().optional(),
  vendorId: z.any().optional(),
  clientId: z.any().optional(),
  umrahAgentId: z.any().optional(),
  umrahSeasonId: z.any().optional(),
  activityType: z.string().optional(),
  templateId: z.any().optional(),
});

const createJournalSchema = z.object({
  description: z.string().optional(),
  lines: z.array(journalLineSchema).optional(),
  date: z.string().optional(),
  // Operator's explicit branch pick. Required for multi-branch users; single-
  // branch users auto-derive. branchSplits[] allows splitting one JE across
  // multiple branches in the same company — when provided, each line in
  // the JE inherits its branch from the matching split entry.
  branchId: z.coerce.number().optional(),
  branchSplits: z.array(z.object({
    branchId: z.coerce.number(),
    percentage: z.coerce.number().optional(),
    amount: z.coerce.number().optional(),
  })).optional(),
});

const reverseJournalSchema = z.object({
  reason: z.string().optional(),
  reverseDate: z.string().optional(),
});

const yearEndCloseSchema = z.object({
  retainedEarningsAccountCode: z.string().optional().default("3300"),
  force: z.boolean().optional().default(false),
});

const openingBalanceLineSchema = z.object({
  accountCode: z.string(),
  debit: z.coerce.number(),
  credit: z.coerce.number(),
});

const openingBalancesSchema = z.object({
  periodStart: z.string().optional(),
  lines: z.array(openingBalanceLineSchema).optional(),
  force: z.boolean().optional(),
});

const openingBalancesImportCsvSchema = z.object({
  periodStart: z.string().optional(),
  csv: z.string().optional(),
  force: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY STATE MACHINE — Phase C.7 Finance audit
// ─────────────────────────────────────────────────────────────────────────────
const JOURNAL_TRANSITIONS: Record<string, readonly string[]> = {
  draft:            ["pending_approval", "approved", "cancelled", "rejected", "returned"],
  pending_approval: ["approved", "rejected", "returned", "cancelled"],
  approved:         ["posted", "cancelled"],
  returned:         ["draft", "pending_approval", "cancelled"],
  rejected:         ["draft", "cancelled"],
  posted:           ["reversed"],
  reversed:         [],
  cancelled:        [],
};

function generateAutoDescription(params: { operationType: string; relatedEntityName?: string; period?: string; branchName?: string; amount?: number; expenseType?: string }): string {
  const { operationType, relatedEntityName, period, branchName, amount, expenseType } = params;
  const periodLabel = period ? ` / شهر ${period}` : "";
  const branchLabel = branchName ? ` / فرع ${branchName}` : "";
  const entityLabel = relatedEntityName ? ` / ${relatedEntityName}` : "";
  const amountLabel = amount ? ` / ${amount.toLocaleString("ar-SA")} ريال` : "";
  const typeMap: Record<string, string> = {
    salary: `صرف راتب${entityLabel}${periodLabel}${branchLabel}`,
    advance: `صرف سلفة للموظف${entityLabel}${periodLabel}${branchLabel}`,
    fuel: `مصروف وقود${entityLabel}${branchLabel}${amountLabel}`,
    maintenance: `مصروف صيانة مركبة${entityLabel}${branchLabel}${amountLabel}`,
    rent: `تحصيل إيجار${entityLabel}${branchLabel}${periodLabel}`,
    vendor_invoice: `فاتورة مورد${entityLabel}${amountLabel}`,
    legal_fee: `أتعاب قانونية${entityLabel}${amountLabel}`,
    purchase: `مشتريات${entityLabel}${amountLabel}`,
    custody: `عهدة${entityLabel}${periodLabel}`,
    insurance: `تأمين${entityLabel}${amountLabel}`,
    receipt: `قبض إيراد${entityLabel}${amountLabel}`,
    payment: `صرف مبلغ${entityLabel}${amountLabel}`,
    expense: `مصروف ${expenseType || "عام"}${entityLabel}${branchLabel}${amountLabel}`,
  };
  return typeMap[operationType] || `عملية مالية${entityLabel}${branchLabel}${amountLabel}`;
}

function checkAttachmentRequired(params: { operationType: string; amount?: number; hasAttachment?: boolean }): { required: boolean; reason?: string } {
  const { operationType, amount = 0 } = params;
  const HIGH_VALUE_THRESHOLD = 5000;
  const attachmentRequiredTypes = ["vendor_invoice", "purchase", "custody_settlement", "advance_claim", "legal_fee"];
  if (attachmentRequiredTypes.includes(operationType)) { return { required: true, reason: `المرفقات إلزامية لعمليات من نوع: ${operationType}` }; }
  if (amount >= HIGH_VALUE_THRESHOLD && operationType === "payment") { return { required: true, reason: `المرفقات إلزامية لسندات الصرف الكبيرة (أكثر من ${HIGH_VALUE_THRESHOLD.toLocaleString()} ريال)` }; }
  return { required: false };
}

journalRouter.get("/expenses", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true, includeNullBranch: true });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je."createdAt", je.status,
              je."costCenter", je."departmentId", je."relatedEntityType", je."relatedEntityId",
              je."paymentMethod", je.reference, je."isPaid", je."attachmentUrl", je."attachmentType",
              je."expenseType", je."operationType",
              je."govSyncEnabled", je."govIntegrationId", je."govEntityType", je."govEntityId",
              json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines,
              MAX(coa.name) FILTER (WHERE jl.debit > 0) AS "accountName",
              COALESCE(SUM(jl.debit), 0) AS amount,
              e_cre.name AS "createdByName",
              (SELECT COALESCE(e_apr.name, u_apr.email)
                 FROM approval_actions aa
                 LEFT JOIN users u_apr ON u_apr.id = aa."actionBy"
                 LEFT JOIN employees e_apr ON e_apr.id = u_apr."employeeId" AND e_apr."deletedAt" IS NULL
                WHERE aa."entityType" = 'expense' AND aa."entityId" = je.id
                  AND aa.action = 'approved' AND aa."companyId" = je."companyId"
                ORDER BY aa.id DESC LIMIT 1) AS "approvedByName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId" AND coa."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea_cre ON ea_cre.id = je."createdBy"
       LEFT JOIN employees e_cre ON e_cre.id = ea_cre."employeeId" AND e_cre."deletedAt" IS NULL
       WHERE ${where} AND je.ref LIKE 'EXP%' AND je."deletedAt" IS NULL
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status,
                je."costCenter", je."departmentId", je."relatedEntityType", je."relatedEntityId",
                je."paymentMethod", je.reference, je."isPaid", je."attachmentUrl", je."attachmentType",
                je."expenseType", je."operationType",
                je."govSyncEnabled", je."govIntegrationId", je."govEntityType", je."govEntityId",
                e_cre.name
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    logger.error(err, "Get expenses error:");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

// #1715 §5 — finance-owned helper for «ربط بتذكرة قائمة». Returns the OPEN
// (unlinked) maintenance tickets the operator can link an expense to. Scoped
// to finance.journal so a finance user needn't hold the fleet/properties
// maintenance permission, and only ever exposes id + a short label.
journalRouter.get("/maintenance-ticket-options", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const target = String(req.query.target ?? "");
    const vehicleId = req.query.vehicleId != null ? Number(req.query.vehicleId) : null;
    const unitId = req.query.unitId != null ? Number(req.query.unitId) : null;
    let options: { id: number; label: string }[] = [];
    if (target === "vehicle" && vehicleId) {
      const rows = await rawQuery<{ id: number; type: string | null; serviceDate: string | null }>(
        `SELECT id, type, "serviceDate"::text AS "serviceDate"
           FROM fleet_maintenance
          WHERE "companyId" = $1 AND "vehicleId" = $2 AND "deletedAt" IS NULL AND "linkedExpenseId" IS NULL
          ORDER BY id DESC LIMIT 50`,
        [scope.companyId, vehicleId],
      );
      options = rows.map((r) => ({ id: r.id, label: `#${r.id} · ${r.type ?? "صيانة"}${r.serviceDate ? ` · ${r.serviceDate}` : ""}` }));
    } else if (target === "property" && unitId) {
      const rows = await rawQuery<{ id: number; category: string | null; status: string | null }>(
        `SELECT id, category, status
           FROM maintenance_requests
          WHERE "companyId" = $1 AND "unitId" = $2 AND "deletedAt" IS NULL AND "linkedExpenseId" IS NULL
          ORDER BY id DESC LIMIT 50`,
        [scope.companyId, unitId],
      );
      options = rows.map((r) => ({ id: r.id, label: `#${r.id} · ${r.category ?? "صيانة"}${r.status ? ` · ${r.status}` : ""}` }));
    }
    res.json({ data: options });
  } catch (err) {
    logger.error(err, "Get maintenance ticket options error:");
    res.json({ data: [] });
  }
});

// Impact preview — shows what will happen when the expense is created
journalRouter.post("/expenses/impact-preview", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { amount, expenseType, paymentMethod, costCenter, supplierId, branchId, targetType, itemType } = zodParse(expenseImpactPreviewSchema.safeParse(req.body ?? {}));
    const amt = Number(amount || 0);

    const items: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [];

    items.push({
      category: "مالي",
      label: "المبلغ",
      value: `${amt.toLocaleString("ar-SA")} ر.س ${expenseType ? `(${expenseType})` : ""}`.trim(),
      severity: "info",
    });

    items.push({
      category: "محاسبي",
      label: "قيد مصروف",
      value: paymentMethod === "cash"
        ? `مدين حساب المصروف ${amt.toLocaleString("ar-SA")} / دائن النقدية`
        : paymentMethod === "bank"
        ? `مدين حساب المصروف ${amt.toLocaleString("ar-SA")} / دائن البنك`
        : `مدين حساب المصروف ${amt.toLocaleString("ar-SA")} / دائن الذمم الدائنة`,
      severity: "info",
    });

    // #1715 (comment 9) — when the operation is linked to an entity, suggest
    // the specialized posting account derived from the target + item kind so
    // the operator sees where it will land (and whether it capitalises) before
    // saving. Read-only hint; the actual JE still uses the chosen account.
    // #1945 (owner review #3) — expose the resolved suggested account as a
    // STRUCTURED field (not only the text hint) so the form can pre-fill it as
    // the real default at save instead of leaving the operator to pick blind.
    let suggestedAccountCode: string | null = null;
    let suggestedCapitalize = false;
    if (targetType && targetType !== "none") {
      const { deriveSpecializedAccount } = await import("../lib/financeSpecializedAccount.js");
      const spec = deriveSpecializedAccount({ targetType, itemType });
      const { financialEngine } = await import("../lib/engines/index.js");
      const resolvedCode = await financialEngine.resolveAccountCode(scope.companyId, spec.purpose, "debit", spec.defaultCode);
      suggestedAccountCode = resolvedCode;
      suggestedCapitalize = spec.capitalize;
      items.push({
        category: "محاسبي",
        label: spec.capitalize ? "حساب الرسملة المقترح" : "حساب المصروف المقترح",
        value: `${spec.label} (${resolvedCode})${spec.capitalize ? " — يُرسمَل كأصل/مخزون بدل قيده مصروفًا" : ""}`,
        severity: spec.capitalize ? "warning" : "info",
      });

      // #1715 (owner feedback) — surface the full «التوجيه المحاسبي المتوقّع»:
      // the linked entity, the OPERATIONAL EFFECT the link produces, and any
      // future task it schedules — so the operator sees the consequence before
      // saving («لا يوجد ربط بلا أثر»).
      const { deriveOperationalEffectHint } = await import("../lib/financeSpecializedAccount.js");
      const hint = deriveOperationalEffectHint({ targetType, spec });
      if (hint.entityLabel) {
        items.push({ category: "الكيان المرتبط", label: "مربوط بـ", value: hint.entityLabel, severity: "info" });
      }
      if (hint.effect) {
        items.push({ category: "الأثر التشغيلي", label: "الأثر", value: hint.effect, severity: "success" });
      }
      if (hint.futureTask) {
        items.push({ category: "مهمة مستقبلية", label: "لاحقًا", value: hint.futureTask, severity: "info" });
      }
    }

    if (costCenter) {
      const [budget] = await rawQuery<Record<string, unknown>>(
        `SELECT cc.name, cc."allocatedAmount",
                COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" WHERE je."companyId" = $2 AND jl."costCenter" = cc.name AND je."deletedAt" IS NULL), 0) AS "usedAmount"
         FROM cost_centers cc WHERE cc.name = $1 AND cc."companyId" = $2 LIMIT 1`,
        [costCenter, scope.companyId]
      );
      if (budget) {
        const allocated = Number(budget.allocatedAmount || 0);
        const used = Number(budget.usedAmount || 0);
        const remaining = allocated - used;
        const afterThis = remaining - amt;
        items.push({
          category: "الميزانية",
          label: `مركز تكلفة ${budget.name}`,
          value: `المتاح ${remaining.toLocaleString("ar-SA")} — بعد هذا المصروف ${afterThis.toLocaleString("ar-SA")} ر.س`,
          severity: afterThis < 0 ? "danger" : afterThis < allocated * 0.1 ? "warning" : "info",
        });
        if (afterThis < 0) {
          items.push({
            category: "الميزانية",
            label: "تجاوز ميزانية",
            value: `سيتم تجاوز ميزانية مركز التكلفة بـ ${Math.abs(afterThis).toLocaleString("ar-SA")} ر.س — يتطلب اعتماد إضافي`,
            severity: "danger",
          });
        }
      }
    }

    if (amt >= 10000) {
      items.push({
        category: "مسار الاعتماد",
        label: "الموافقات",
        value: amt >= 50000 ? "مدير عام + مدير مالي" : "مدير مالي",
        severity: amt >= 50000 ? "warning" : "info",
      });
    }

    if (supplierId) {
      const [supplier] = await rawQuery<Record<string, unknown>>(
        `SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(supplierId), scope.companyId]
      );
      if (supplier) {
        items.push({
          category: "المورد",
          label: "إضافة دفعة",
          value: `ستُسجل كـ "مستحقة" على حساب ${supplier.name} إذا لم تكن نقدية`,
          severity: "info",
        });
      }
    }

    items.push({
      category: "تقارير",
      label: "تقارير الأداء",
      value: "سيظهر المصروف في التقارير المالية وتحليل المصروفات",
      severity: "info",
    });

    const hasDanger = items.some((i) => i.severity === "danger");
    const hasWarning = items.some((i) => i.severity === "warning");
    res.json({
      actionType: "create_expense",
      employeeId: 0,
      employeeName: "",
      items,
      suggestedAccountCode,
      suggestedCapitalize,
      summary: hasDanger
        ? "مصروف يتجاوز الميزانية — مطلوب اعتماد إضافي"
        : hasWarning
        ? `مصروف ${amt.toLocaleString("ar-SA")} ر.س — راجع الاعتمادات`
        : `مصروف ${amt.toLocaleString("ar-SA")} ر.س جاهز للتسجيل`,
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في معاينة أثر المصروف");
  }
});

// RBAC v2: SoD-critical — finance.journal create vs approve are
// guarded by the seeded `finance_journal_create_approve` SoD rule.
journalRouter.post("/expenses", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createExpenseSchema.safeParse(req.body ?? {}));
    const {
      accountCode, amount, description, period, sourceAccountCode,
      branchId, companyId: bodyCompanyId, departmentId, costCenter, expenseType, subAccountCode,
      relatedEntityType, relatedEntityId, relatedEntityName,
      paymentMethod, vatRate: rawVatRate, vatAmount: rawVatAmount,
      reference, status: reqStatus, isPaid,
      attachmentUrl, attachmentType, operationType,
      autoDescription, projectId, taxCategory,
      govSyncEnabled, govIntegrationId, govEntityType, govEntityId,
      costCenterDistribution,
      lineAllocation,
      maintenanceTicket,
      assetCreation,
      fuelLog,
      date: expenseDate,
    } = b;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!accountCode) { throw new ValidationError("لا يمكن صرف بدون حساب محاسبي واضح", { field: "accountCode", fix: "حدد الحساب المحاسبي للمصروف (مثل 5100 رواتب، 5200 وقود)" }); }
    if (!amount || Number(amount) <= 0) { throw new ValidationError("لا يمكن تسجيل مصروف بقيمة صفر أو سالبة", { field: "amount", fix: "أدخل مبلغ المصروف بقيمة موجبة" }); }
    if (!branchId && !scope.branchId) { throw new ValidationError("الفرع مطلوب لتسجيل المصروف", { field: "branchId", fix: "حدد الفرع الذي ينتمي إليه هذا المصروف" }); }
    if (branchId != null &&
        !scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) &&
        scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(Number(branchId))) {
      throw new ForbiddenError("لا تملك صلاحية تسجيل مصروفات في هذا الفرع", { field: "branchId" });
    }
    if (!costCenter) { throw new ValidationError("مركز التكلفة مطلوب لتسجيل المصروف", { field: "costCenter", fix: "حدد مركز التكلفة (مثل: مشروع-001، فرع-الرياض)" }); }

    let costCenterValidationEnabled = false;
    try {
      const [costCenterSettingRow] = await rawQuery<Record<string, unknown>>(
        `SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'costCenterEnabled' LIMIT 1`,
        [effectiveCompanyId]
      );
      costCenterValidationEnabled = costCenterSettingRow?.value === "true";
    } catch (e) { logger.warn(e, "system_settings table may not exist yet"); }
    if (costCenterValidationEnabled) {
      const [ccRow] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM departments WHERE "companyId" = ANY($1) AND name = $2 LIMIT 1`,
        [[effectiveCompanyId], costCenter]
      );
      if (!ccRow) {
        throw new ValidationError(`مركز التكلفة "${costCenter}" غير موجود في بيانات الشركة`, { field: "costCenter", fix: "أدخل مركز تكلفة معرّف في إعدادات الأقسام" });
      }
    }

    const attachCheck = checkAttachmentRequired({ operationType: operationType || expenseType || "expense", amount: Number(amount), hasAttachment: !!attachmentUrl });
    if (attachCheck.required && !attachmentUrl) {
      throw new ValidationError(
        attachCheck.reason ?? "المرفق مطلوب",
        { field: "attachmentUrl", fix: "ارفع المستند الداعم (فاتورة، إشعار تحويل، وصل استلام) قبل الحفظ" }
      );
    }

    const targetPeriod = period ?? currentPeriod();
    const sourceAcct = sourceAccountCode || "1100";

    // #1715 wave-1 consolidation: the expense create flow now converges on
    // the unified FinanceOperationContext (guardrail #6 — no finance
    // operation without a context). The adapter maps this legacy payload
    // into a context; assertOperationValid wraps the same posting policy
    // (cash→cash_box, bank_transfer→bank, custody→custody, …) so a UI
    // bypass still can't post a cash expense against a bank account.
    // Behaviour is identical — the policy receives the same money account +
    // method — but the operation is now described by one object the rest of
    // the waves build on. Soft-allows unclassified accounts.
    {
      const { assertOperationValid, fromLegacyExpenseForm } = await import("../lib/financeOperationContext.js");
      const opCtx = fromLegacyExpenseForm({
        companyId: effectiveCompanyId,
        branchId: branchId ?? scope.branchId ?? null,
        sourceAccountCode: sourceAcct,
        paymentMethod,
        relatedEntityType,
        relatedEntityId: relatedEntityId != null ? Number(relatedEntityId) : null,
        lineAllocation,
      });
      await assertOperationValid(opCtx);
    }

    // F3 (audit follow-up): pre-flight ONLY validates the budget here;
    // the actual UPDATE budgets SET used = newUsed happens inside the
    // same withTransaction as the JE post below. The previous shape
    // bumped used in its own (already-committed) txn, then posted the
    // JE in a second one. A closed-period throw from the engine left
    // budgets.used inflated forever with no GL — same family as the
    // PR #1421 ar-payment bug.
    if (accountCode && amount) {
      const [budget] = await rawQuery<Record<string, unknown>>(
        `SELECT amount, used FROM budgets
          WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3 AND "deletedAt" IS NULL
          LIMIT 1`,
        [effectiveCompanyId, accountCode, targetPeriod]
      );
      if (budget) {
        const budgetAmount = Number(budget.amount);
        const currentUsed = Number(budget.used);
        const newUsed = currentUsed + Number(amount);
        const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;

        if (utilization > 110) {
          throw new ConflictError(
            "تجاوز الميزانية أكثر من 110% – رفض نهائي",
            { field: "amount", fix: "أعد تقييم الميزانية أو قلل المبلغ المطلوب", meta: { utilization: Math.round(utilization), status: "rejected" } }
          );
        }
        if (utilization > 99 && !OWNER_GM_ROLES.includes(scope.role)) {
          throw new ForbiddenError(
            "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط",
            { fix: "اطلب موافقة المدير العام قبل المتابعة", meta: { utilization: Math.round(utilization), status: "blocked_gm" } }
          );
        }
        if (utilization > 80 && !FINANCE_ROLES.includes(scope.role)) {
          throw new ForbiddenError(
            "استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
            { fix: "اطلب موافقة المدير المالي قبل المتابعة", meta: { utilization: Math.round(utilization), status: "warning_cfo" } }
          );
        }
      }
    }

    const baseAmount = roundTo2(Number(amount) || 0);
    if (!baseAmount || isNaN(baseAmount)) throw new ValidationError("المبلغ غير صالح", { field: "amount" });
    const vatRateVal = rawVatRate != null ? (Number(rawVatRate) || 0) : 0;
    const computedVat = roundTo2(rawVatAmount != null ? (Number(rawVatAmount) || 0) : computeVat(baseAmount, vatRateVal));
    const totalWithVat = roundTo2(baseAmount + computedVat);

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || expenseType || "expense", relatedEntityName, period: targetPeriod, amount: baseAmount, expenseType });
    }

    const idempotencyToken = requestIdempotencyToken(req);
    const ref = `EXP-${idempotencyToken}`;
    const entityLink: Record<string, any> = {};
    if (relatedEntityType === "employee" && relatedEntityId) entityLink.employeeId = Number(relatedEntityId);
    if (relatedEntityType === "vehicle" && relatedEntityId) entityLink.vehicleId = Number(relatedEntityId);
    if (relatedEntityType === "property" && relatedEntityId) entityLink.propertyId = Number(relatedEntityId);
    if (relatedEntityType === "contract" && relatedEntityId) entityLink.contractId = Number(relatedEntityId);
    // Supplier / vendor / customer / client coverage — the expense form
    // (expenses-create.tsx) ships "supplier"; older callers may use the
    // dimension-name variants. Pre-fix the expense JE never carried
    // vendorId/clientId on the expense line even though the operator
    // explicitly tagged the supplier — per-supplier expense reports
    // were silently incomplete.
    if ((relatedEntityType === "supplier" || relatedEntityType === "vendor") && relatedEntityId) entityLink.vendorId = Number(relatedEntityId);
    if ((relatedEntityType === "customer" || relatedEntityType === "client") && relatedEntityId) entityLink.clientId = Number(relatedEntityId);
    if (projectId) entityLink.projectId = Number(projectId);
    if (costCenter) entityLink.costCenter = costCenter;

    // Audit item #2 — apply operator-supplied allocation overrides on top
    // of the auto-derived entityLink. Each field that the operator pinned
    // through the LineAllocationPanel wins over the rule-resolved value.
    // The override gets logged via logAllocationOverride() INSIDE the
    // withTransaction block below (after the JE id is known) so the
    // allocation_override_log row rolls back with the JE on failure.
    let overrideAccountCode = accountCode;
    if (lineAllocation) {
      if (lineAllocation.accountCode) overrideAccountCode = lineAllocation.accountCode;
      if (lineAllocation.costCenterId != null) entityLink.costCenterId = lineAllocation.costCenterId;
      if (lineAllocation.activityType) entityLink.activityType = lineAllocation.activityType;
      if (lineAllocation.projectId != null) entityLink.projectId = lineAllocation.projectId;
      if (lineAllocation.vehicleId != null) entityLink.vehicleId = lineAllocation.vehicleId;
      if (lineAllocation.propertyId != null) entityLink.propertyId = lineAllocation.propertyId;
      if (lineAllocation.unitId != null) entityLink.unitId = lineAllocation.unitId;
      if (lineAllocation.assetId != null) entityLink.assetId = lineAllocation.assetId;
      if (lineAllocation.contractId != null) entityLink.contractId = lineAllocation.contractId;
      if (lineAllocation.umrahAgentId != null) entityLink.umrahAgentId = lineAllocation.umrahAgentId;
      // Propagate the 6 fields that the upstream schema previously dropped
      // silently. Without these, an expense line could carry a clientId in
      // the form payload that vanished by the time the JE was posted.
      if (lineAllocation.clientId != null) entityLink.clientId = lineAllocation.clientId;
      if (lineAllocation.vendorId != null) entityLink.vendorId = lineAllocation.vendorId;
      if (lineAllocation.driverId != null) entityLink.driverId = lineAllocation.driverId;
      if (lineAllocation.productId != null) entityLink.productId = lineAllocation.productId;
      if (lineAllocation.umrahSeasonId != null) entityLink.umrahSeasonId = lineAllocation.umrahSeasonId;
      if (lineAllocation.departmentId != null) entityLink.departmentId = lineAllocation.departmentId;
      if (lineAllocation.employeeId != null) entityLink.employeeId = lineAllocation.employeeId;
      if (lineAllocation.manualOverrideReason) entityLink.manualOverrideReason = lineAllocation.manualOverrideReason;
    }

    // Activate the centralised resolver (migration 256 seeds the
    // default Saudi rules). When the operator left accountCode empty
    // but picked an operationType + relatedEntity, the resolver looks
    // up the matching rule and fills in:
    //   • the expense account (e.g. fuel → 5350)
    //   • the cost-centre (e.g. from_vehicle → CC linked to the vehicle)
    // When the operator pinned an accountCode manually, the resolver
    // returns status='manual_override' and proposedAccountCode for
    // audit — operator's pick still wins on the JE itself.
    if (operationType || relatedEntityType) {
      const { resolveLineAllocation } = await import("../lib/accountingAllocation.js");
      const resolved = await resolveLineAllocation({
        companyId: effectiveCompanyId,
        documentType: "expense",
        lineType: operationType || expenseType || undefined,
        entityType: relatedEntityType || undefined,
        accountCode: overrideAccountCode || undefined,
        costCenterId: entityLink.costCenterId != null ? Number(entityLink.costCenterId) : null,
        dimensions: {
          vehicleId: entityLink.vehicleId ?? null,
          propertyId: entityLink.propertyId ?? null,
          unitId: entityLink.unitId ?? null,
          assetId: entityLink.assetId ?? null,
          projectId: entityLink.projectId ?? null,
          employeeId: entityLink.employeeId ?? null,
          driverId: entityLink.driverId ?? null,
          contractId: entityLink.contractId ?? null,
          umrahSeasonId: entityLink.umrahSeasonId ?? null,
          umrahAgentId: entityLink.umrahAgentId ?? null,
          productId: entityLink.productId ?? null,
          clientId: entityLink.clientId ?? null,
          vendorId: entityLink.vendorId ?? null,
        },
        sourceTable: "journal_lines",
        sourceLineId: 0, // populated post-insert
      });
      if (resolved.status === "resolved" || resolved.status === "manual_override") {
        if (!overrideAccountCode && resolved.resolvedAccountCode) {
          overrideAccountCode = resolved.resolvedAccountCode;
        }
        if (entityLink.costCenterId == null && resolved.costCenterId != null) {
          entityLink.costCenterId = resolved.costCenterId;
        }
      }
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    // Carry the full entityLink on EVERY leg of the expense JE — expense DR,
    // VAT input DR, and cash CR. Without this the VAT obligation + cash
    // movement are dim-less even though the expense line is fully tagged.
    // Per-vendor cash outflow + per-property VAT input reports were
    // silently broken (the expense DR ties to the property/vehicle but
    // the cash CR didn't tie to anything, so cashflow-by-dim summed
    // only half the picture).
    const journalLines: any[] = [{ accountCode: overrideAccountCode ?? "5000", debit: baseAmount, credit: 0, ...entityLink }];
    if (computedVat > 0) {
      const inputVatCode = await financialEngine.resolveAccountCode(effectiveCompanyId, "vat_input", "debit", "1400");
      journalLines.push({ accountCode: inputVatCode, debit: computedVat, credit: 0, ...entityLink });
    }
    journalLines.push({ accountCode: sourceAcct, debit: 0, credit: totalWithVat, ...entityLink });
    if (subAccountCode && subAccountCode !== accountCode) { journalLines[0].accountCode = subAccountCode; }

    // #1715 multi cost-center distribution: when supplied, replace the single
    // expense DR (journalLines[0]) with one balanced leg per cost center —
    // same account + full entityLink, its own costCenterId and prorated
    // amount. The legs sum exactly to baseAmount (remainder absorbed by the
    // last) so the entry stays balanced; the VAT DR and cash CR are untouched.
    if (costCenterDistribution && costCenterDistribution.length > 0) {
      const debitAccount = journalLines[0].accountCode;
      const splitLines = resolveCostCenterSplits(costCenterDistribution, baseAmount).map((leg) => ({
        accountCode: debitAccount, debit: leg.amount, credit: 0, ...entityLink, costCenterId: leg.costCenterId,
      }));
      journalLines.splice(0, 1, ...splitLines);
    }

    // C3 — the journal entry, its header metadata and the approval chain are
    // created in ONE transaction. A failure anywhere (or a crash) rolls the
    // whole thing back, so there is never a posted expense entry without its
    // approval request, nor an approval chain pointing at a missing entry.
    // postJournalEntry's own withTransaction joins this one via savepoint;
    // rawExecute joins via the transaction async-context.
    const { journalId, alreadyExists, approvalResult } = await withTransaction(async (client) => {
      // Re-lock and bump the budget inside the same txn as the JE post.
      // A closed-period throw from the engine now rolls the bump back
      // atomically — no more inflated used counter with no GL.
      if (accountCode && amount) {
        const lockRes = await client.query(
          `SELECT id, amount, used FROM budgets
            WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3 AND "deletedAt" IS NULL
            FOR UPDATE`,
          [effectiveCompanyId, accountCode, targetPeriod]
        );
        if (lockRes.rows.length > 0) {
          const lockedNewUsed = Number(lockRes.rows[0].used) + Number(amount);
          await client.query(
            `UPDATE budgets SET used = $1 WHERE id = $2`,
            [lockedNewUsed, lockRes.rows[0].id]
          );
        }
      }

      // #1715 correctness review (L1) — honour the entered date as the posting
      // date so a backdated expense lands in the right period + carries the
      // right JE date (invoices/memos already thread their date; expense was an
      // outlier defaulting to today). The engine's period gate then validates
      // the entered date.
      const posted = await financialEngine.postJournalEntry({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, type: "expense", sourceType: operationType || "expense", sourceId: 0, sourceKey: `finance:expense:${idempotencyToken}`, lines: journalLines, postingDate: expenseDate ? toDateISO(expenseDate) : undefined });

      await rawExecute(
        `UPDATE journal_entries SET "costCenter" = $1, "departmentId" = $2, "relatedEntityType" = $3, "relatedEntityId" = $4, "paymentMethod" = $5, reference = $6, "isPaid" = $7, "attachmentUrl" = $8, "attachmentType" = $9, "expenseType" = $10, "operationType" = $11, "projectId" = $12, "taxCategory" = $13, "govSyncEnabled" = $14, "govIntegrationId" = $15, "govEntityType" = $16, "govEntityId" = $17 WHERE id = $18 AND "companyId" = $19 AND "deletedAt" IS NULL`,
        [costCenter ?? null, departmentId ?? null, relatedEntityType ?? null, relatedEntityId ?? null, paymentMethod ?? "cash", reference ?? null, isPaid != null ? !!isPaid : true, attachmentUrl ?? null, attachmentType ?? null, expenseType ?? null, operationType ?? "expense", projectId ?? null, taxCategory ?? null, govSyncEnabled ? true : false, govIntegrationId ? Number(govIntegrationId) : null, govEntityType ?? null, govEntityId ? Number(govEntityId) : null, posted.journalId, effectiveCompanyId]
      );

      if (govSyncEnabled && govIntegrationId && govEntityType && govEntityId) {
        const [validIntegration] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM gov_integrations WHERE id = $1 AND "companyId" = $2`,
          [Number(govIntegrationId), effectiveCompanyId]
        );
        if (validIntegration) {
          // Best-effort — isolated in its own savepoint so a failed link
          // insert rolls back alone and never poisons the expense txn.
          await withTransaction(async () => {
            await rawExecute(
              `INSERT INTO gov_integration_links ("companyId", "integrationId", "entityType", "entityId", "externalRef", enabled, "syncStatus")
               VALUES ($1, $2, $3, $4, $5, true, 'pending')
               ON CONFLICT ("companyId", "integrationId", "entityType", "entityId") DO NOTHING`,
              [effectiveCompanyId, Number(govIntegrationId), govEntityType, Number(govEntityId), ref]
            );
          }).catch((e) => logger.error(e, "finance-journal background task failed"));
        }
      }

      // Item #2 follow-through — actually log the override (the previous
      // comment claimed this would happen "downstream in the resolver
      // pipeline" but no downstream code fires for the expense path).
      // Fires only when the operator pinned BOTH an override reason AND
      // at least one dimension/accountCode — otherwise the operator is
      // accepting the auto-derived allocation and no override exists.
      if (lineAllocation?.manualOverrideReason) {
        const blockers: string[] = [];
        if (lineAllocation.accountCode) blockers.push(`account:${lineAllocation.accountCode}`);
        if (lineAllocation.costCenterId != null) blockers.push(`costCenter:${lineAllocation.costCenterId}`);
        if (lineAllocation.activityType) blockers.push(`activityType:${lineAllocation.activityType}`);
        if (lineAllocation.projectId != null) blockers.push(`project:${lineAllocation.projectId}`);
        if (lineAllocation.vehicleId != null) blockers.push(`vehicle:${lineAllocation.vehicleId}`);
        if (lineAllocation.propertyId != null) blockers.push(`property:${lineAllocation.propertyId}`);
        if (lineAllocation.unitId != null) blockers.push(`unit:${lineAllocation.unitId}`);
        if (lineAllocation.assetId != null) blockers.push(`asset:${lineAllocation.assetId}`);
        if (lineAllocation.contractId != null) blockers.push(`contract:${lineAllocation.contractId}`);
        if (lineAllocation.umrahAgentId != null) blockers.push(`umrahAgent:${lineAllocation.umrahAgentId}`);
        if (blockers.length > 0) {
          await logAllocationOverride({
            companyId: effectiveCompanyId,
            branchId: branchId ?? scope.branchId ?? null,
            actorAssignmentId: scope.activeAssignmentId ?? null,
            actorUserId: scope.userId,
            documentType: "expense",
            documentId: posted.journalId,
            sourceTable: "journal_lines",
            blockers,
            overrideReason: lineAllocation.manualOverrideReason,
          });
        }
      }

      // #1715 §5 — operational effect: open + link the maintenance ticket
      // when the operator tagged this expense as a vehicle/property
      // maintenance op (gated on maintenanceTicket.create, so ordinary
      // expenses are untouched). Runs in THIS txn, so a JE/approval failure
      // rolls the ticket back too — never a ticket without its expense.
      // `!posted.alreadyExists` guards idempotent replays: a retried expense
      // returns the existing JE without re-posting, so we must NOT insert a
      // second maintenance ticket for it.
      if (maintenanceTicket?.create && !posted.alreadyExists) {
        const isVehicle = entityLink.vehicleId != null;
        const isProperty = entityLink.unitId != null || entityLink.propertyId != null;
        if (isVehicle || isProperty) {
          const { applyMaintenanceTicketEffect } = await import("../lib/financeOperationalEffect.js");
          const eff = await applyMaintenanceTicketEffect(client, {
            companyId: effectiveCompanyId,
            branchId: branchId ?? scope.branchId ?? null,
            journalId: posted.journalId,
            target: isVehicle ? "vehicle" : "property",
            vehicleId: entityLink.vehicleId ?? null,
            propertyId: entityLink.propertyId ?? null,
            unitId: entityLink.unitId ?? null,
            contractId: entityLink.contractId ?? null,
            cost: baseAmount,
            maintenanceType: maintenanceTicket.maintenanceType ?? expenseType ?? null,
            odometer: maintenanceTicket.odometer ?? null,
            costBearer: maintenanceTicket.costBearer ?? null,
            performedBy: maintenanceTicket.performedBy ?? null,
            description: finalDescription ?? null,
            existingTicketId: maintenanceTicket.existingTicketId ?? null,
          });
          // Linking to a non-existent ticket must abort the whole expense —
          // never post an expense that claims a link it didn't make.
          if (maintenanceTicket.existingTicketId != null && eff.action === "none") {
            throw new ValidationError("تذكرة الصيانة المحددة غير موجودة", {
              field: "maintenanceTicket.existingTicketId",
              fix: "اختر تذكرة صيانة قائمة صحيحة أو أنشئ تذكرة جديدة",
            });
          }
          logger.info({ journalId: posted.journalId, effect: eff }, "[finance] maintenance ticket effect applied");
        }
      }

      // #1715 (owner acceptance: «شراء مركبة يفتح أصل وإهلاك») — a capital
      // purchase creates a fixed asset; the depreciation engine takes over.
      // In-txn + idempotency-guarded so a retry never creates a duplicate asset.
      if (assetCreation?.create && assetCreation.name && !posted.alreadyExists) {
        const { applyAssetCreationEffect } = await import("../lib/financeOperationalEffect.js");
        const a = await applyAssetCreationEffect(client, {
          companyId: effectiveCompanyId,
          branchId: branchId ?? scope.branchId ?? null,
          journalId: posted.journalId,
          name: assetCreation.name,
          cost: baseAmount,
          usefulLifeYears: assetCreation.usefulLifeYears ?? null,
          category: assetCreation.category ?? null,
          depreciationMethod: assetCreation.depreciationMethod ?? null,
          salvageValue: assetCreation.salvageValue ?? null,
          purchaseDate: expenseDate ?? null,
        });
        logger.info({ journalId: posted.journalId, assetId: a.assetId }, "[finance] capital asset created from expense");
      }

      // #1715 (owner acceptance: «وقود مركبة يظهر الممشى واللترات وسعر اللتر») —
      // a vehicle fuel expense opens a fuel log + updates the odometer.
      if (fuelLog?.create && entityLink.vehicleId != null && !posted.alreadyExists) {
        const { applyFuelLogEffect } = await import("../lib/financeOperationalEffect.js");
        const fl = await applyFuelLogEffect(client, {
          companyId: effectiveCompanyId,
          branchId: branchId ?? scope.branchId ?? null,
          journalId: posted.journalId,
          vehicleId: entityLink.vehicleId,
          totalCost: baseAmount,
          liters: fuelLog.liters ?? null,
          costPerLiter: fuelLog.costPerLiter ?? null,
          mileageAtFuel: fuelLog.odometer ?? null,
          stationName: fuelLog.stationName ?? null,
          fuelDate: expenseDate ?? null,
        });
        logger.info({ journalId: posted.journalId, fuelLogId: fl.fuelLogId }, "[finance] fuel log created from expense");
      }

      const approval = await initiateApprovalChain({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, chainType: "expenses", refType: "expense", refId: posted.journalId, amount: Number(amount ?? 0) });
      if (approval.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`, [posted.journalId, effectiveCompanyId]); }

      return { journalId: posted.journalId, alreadyExists: posted.alreadyExists, approvalResult: approval };
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({ companyId: effectiveCompanyId, userId: scope.userId, action: "expense.created", entity: "expenses", entityId: journalId, details: JSON.stringify({ ref, accountCode, amount: baseAmount, vatAmount: computedVat, totalWithVat, sourceAccountCode: sourceAcct, approvalRequired: approvalResult.requiresApproval, operationType, expenseType, relatedEntityType, relatedEntityId }) }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdExpense] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, effectiveCompanyId]
    );
    res.status(201).json({ ...(createdExpense || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Create expense error:");
  }
});

journalRouter.patch("/expenses/:id", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { description } = zodParse(updateDescriptionSchema.safeParse(req.body ?? {}));
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id, status, "createdAt" FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المصروف غير موجود");
    // PD-4: a posted journal entry is immutable — a posted expense is
    // corrected via a reversing entry, never an in-place description edit.
    if (existing.status === "posted") {
      throw new ConflictError("لا يمكن تعديل مصروف مُرحَّل — صحّحه عبر قيد عاكس", {
        field: "status",
        fix: "أنشئ قيداً عاكساً بدل تعديل المصروف المُرحَّل",
      });
    }
    const expenseDate = toDateISO(existing.createdAt as string);
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, expenseDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تعديل مصروف في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}`);
    }
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *`, [description, id, scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

// Audit F5 — DOC. Defensive endpoint with maintained guards. The UI
// uses the soft-status `void` flow, but `financeGoldenPath.test.ts:358`
// validates the "budget reservation release" behaviour on hard delete —
// the route exists to keep that safety net green.
journalRouter.delete("/expenses/:id", authorize({ feature: "finance.journal", action: "delete", resource: { table: "expenses", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Wrap the soft-delete + ledger reversal + budget release in ONE
    // transaction so a partial failure rolls all three back. Without
    // this, a release that crashed mid-flight could leave the expense
    // marked deleted but budgets.used still inflated by its amount.
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE journal_entries SET "deletedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'draft'
          RETURNING id`,
        [id, scope.companyId]
      );
      if (rows.length === 0) return null;
      const expenseId = Number(rows[0].id);

      // reverseAccountBalances is a no-op on drafts (balancesApplied=false),
      // so this is belt + braces against a future caller that flips the
      // status before calling DELETE.
      await reverseAccountBalances(scope.companyId, expenseId);

      // Budget-release: the CREATE path (finance-journal.ts:474) bumps
      // `budgets.used` by the expense amount BEFORE the JE is even posted,
      // so every draft holds a soft reservation. The reject/return path
      // (finance-journal.ts:672) releases that reservation; DELETE was the
      // only sibling path that didn't, leaving budgets.used permanently
      // inflated by the deleted draft's amount. Mirrors the reject-path
      // SQL exactly so a single bug fix here doesn't drift from there.
      // GREATEST() floors at zero, matching the reject path's defensive
      // shape.
      await client.query(
        `UPDATE budgets b
            SET used = GREATEST(0, b.used - sub.total)
           FROM (
             SELECT jl."accountCode",
                    to_char(je."createdAt", 'YYYY-MM') AS period,
                    SUM(jl.debit) AS total
               FROM journal_lines jl
               JOIN journal_entries je ON je.id = jl."journalId"
              WHERE jl."journalId" = $1
                AND jl.debit > 0
                AND jl."deletedAt" IS NULL
              GROUP BY jl."accountCode", to_char(je."createdAt", 'YYYY-MM')
           ) sub
          WHERE b."companyId" = $2
            AND b."accountCode" = sub."accountCode"
            AND b.period = sub.period
            AND b."deletedAt" IS NULL`,
        [expenseId, scope.companyId]
      );
      return expenseId;
    });
    if (result === null) throw new NotFoundError("المصروف غير موجود");
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.patch("/expenses/:id/approve", authorize({ feature: "finance.journal", action: "approve", resource: { table: "expenses", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;

    const expenseId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));

    // Fetch ref for the audit trail; state gating handled by the engine.
    const [exp] = await rawQuery<Record<string, unknown>>(
      `SELECT ref FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'EXP%'`,
      [expenseId, scope.companyId]
    );
    if (!exp) throw new NotFoundError("المصروف غير موجود");

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && (!notes || !String(notes).trim())) {
      throw new ValidationError(
        newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع",
        { field: "notes", fix: "أدخل سبب القرار في حقل الملاحظات" }
      );
    }

    // Central lifecycle engine: expense approval uses the shared `status`
    // column on journal_entries. fromStates restricts the decision to
    // pending/draft — an already-approved or already-rejected expense
    // cannot be flipped again without going through a separate re-open
    // flow. The onApply hook writes the approval_actions trail in the
    // same transaction.
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "journal_entries",
      id: expenseId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `expense.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'EXP%'`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
           VALUES ('expense',$1,$2,$3,$4,$5)`,
          [expenseId, newStatus, notes || null, scope.userId, scope.companyId]
        );
        // The expense moved GL balances at creation time; a rejected /
        // returned expense must reverse them or the books stay overstated.
        // This runs in the SAME transaction as the status change — if the
        // reversal fails the whole decision rolls back, so the status can
        // never flip without the matching reversal. reverseAccountBalances'
        // rawQuery/rawExecute join this transaction via the async context.
        if (newStatus === "rejected" || newStatus === "returned") {
          await reverseAccountBalances(scope.companyId, expenseId);
          // Also unwind the budget reservation. The creation path
          // (lines 437-480 in this file) bumped `budgets.used` by the
          // expense's debit amount when (companyId, accountCode, period)
          // matched a budget row. Without this matching decrement on
          // rejection/return the row stayed inflated forever — every
          // future expense on the same code saw inflated utilization and
          // hit the 80/100/110% gates against a phantom balance.
          //
          // GREATEST() floors at zero so any prior manual edit can't push
          // `used` negative even if the linked budget row was already
          // adjusted.
          await client.query(
            `UPDATE budgets b
                SET used = GREATEST(0, b.used - sub.total)
               FROM (
                 SELECT jl."accountCode",
                        to_char(je."createdAt", 'YYYY-MM') AS period,
                        SUM(jl.debit) AS total
                   FROM journal_lines jl
                   JOIN journal_entries je ON je.id = jl."journalId"
                  WHERE jl."journalId" = $1
                    AND jl.debit > 0
                    AND jl."deletedAt" IS NULL
                  GROUP BY jl."accountCode", to_char(je."createdAt", 'YYYY-MM')
               ) sub
              WHERE b."companyId" = $2
                AND b."accountCode" = sub."accountCode"
                AND b.period = sub.period
                AND b."deletedAt" IS NULL`,
            [expenseId, scope.companyId]
          );
        }
      },
      after: { ref: exp.ref, decision: newStatus, notes: notes ?? null },
    });

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({
      message: labels[newStatus] || newStatus,
      status: updated.status,
      event: `expense.${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve expense error:");
  }
});

journalRouter.get("/vouchers", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true, includeNullBranch: true });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description,
              CASE WHEN je.ref LIKE 'RV%' THEN 'receipt' ELSE 'payment' END AS type,
              je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
              je."relatedEntityType", je."relatedEntityId", je."operationType", je."costCenter",
              COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, je.status,
              e_cre.name AS "createdByName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       LEFT JOIN employee_assignments ea_cre ON ea_cre.id = je."createdBy"
       LEFT JOIN employees e_cre ON e_cre.id = ea_cre."employeeId" AND e_cre."deletedAt" IS NULL
       WHERE ${where} AND je."deletedAt" IS NULL AND (je.ref LIKE 'RV%' OR je.ref LIKE 'PV%')
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status,
                je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
                je."relatedEntityType", je."relatedEntityId", je."operationType", je."costCenter",
                e_cre.name
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    logger.error(err, "Get vouchers error:");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

journalRouter.get("/vouchers/:id", authorize({ feature: "finance.journal", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description,
              CASE WHEN je.ref LIKE 'RV%' THEN 'receipt' ELSE 'payment' END AS "voucherType",
              je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
              je."relatedEntityType", je."relatedEntityId", je."operationType",
              COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt", je.status
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
         AND (je.ref LIKE 'RV%' OR je.ref LIKE 'PV%')
       GROUP BY je.id`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("السند غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get voucher detail error:"); }
});

journalRouter.post("/vouchers", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createVoucherSchema.safeParse(req.body ?? {}));
    const {
      type, amount, description, payee, accountCode, method, sourceAccountCode,
      subAccountCode, relatedEntityType, relatedEntityId, relatedEntityName,
      contractId, invoiceId, reference, attachmentUrl, attachmentType,
      vatRate: rawVatRate, vatAmount: rawVatAmount,
      beneficiaryType, entitlementType, branchId, departmentId,
      autoDescription, operationType, allocations, lineAllocation,
      maintenanceTicket, assetCreation, fuelLog, date: voucherDate,
    } = b;

    // C4 + C5 — allocations tie this voucher to specific AP obligations
    // (purchase_orders, umrah_nusk_invoices, …). Σ allocations must not
    // exceed the voucher amount and only PV (payment) vouchers carry them.
    // Σ-vs-amount is re-checked once baseAmount is resolved below.
    if (allocations && allocations.length > 0 && type !== "payment") {
      throw new ValidationError("التخصيصات مدعومة لسندات الصرف فقط", {
        field: "allocations",
        fix: "احذف التخصيصات أو غيّر نوع السند إلى صرف",
      });
    }

    if (!type) {
      throw new ValidationError("نوع السند مطلوب", { field: "type", fix: "اختر receipt (قبض) أو payment (صرف)" });
    }
    if (!amount) {
      throw new ValidationError("المبلغ مطلوب", { field: "amount", fix: "أدخل مبلغ السند" });
    }
    if (Number(amount) <= 0) {
      throw new ValidationError("لا يمكن إنشاء سند بمبلغ صفر أو سالب", { field: "amount", fix: "أدخل مبلغاً موجباً للسند" });
    }
    if (!branchId && !scope.branchId) {
      throw new ValidationError("الفرع مطلوب لإنشاء السند", { field: "branchId", fix: "حدد الفرع الذي ينتمي إليه هذا السند" });
    }
    // BR-3: a branch-scoped user must not be able to stamp a voucher onto a
    // branch they are not assigned to — mirrors the same membership guard
    // the /expenses route applies above. Owners / general managers bypass
    // branch scope, as everywhere.
    if (branchId != null &&
        !scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) &&
        scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(Number(branchId))) {
      throw new ForbiddenError("لا تملك صلاحية إنشاء سند في هذا الفرع", { field: "branchId" });
    }
    if (!accountCode) {
      throw new ValidationError("الحساب المحاسبي مطلوب", { field: "accountCode", fix: "حدد الحساب المحاسبي الرئيسي للسند" });
    }

    const voucherAttachCheck = checkAttachmentRequired({ operationType: type === "payment" ? "payment" : "receipt", amount: Number(amount) });
    if (voucherAttachCheck.required && !attachmentUrl) {
      throw new ValidationError(
        voucherAttachCheck.reason ?? "المرفق مطلوب",
        { field: "attachmentUrl", fix: "ارفع وصل الاستلام أو أمر التحويل للسندات الكبيرة" }
      );
    }

    const resolvedSourceAccount = sourceAccountCode || "1100";
    const [sourceAcctRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id, code, name, type, subtype, "accountSubtype" FROM chart_of_accounts
       WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, resolvedSourceAccount]
    );
    if (!sourceAcctRow) {
      throw new ValidationError(
        `حساب المصدر "${resolvedSourceAccount}" غير موجود في دليل الحسابات`,
        { field: "sourceAccountCode", fix: "استخدم حساباً نقدياً مثل 1100 (الصندوق) أو 1110 (البنك)" }
      );
    }
    const cashBankSubtypes = ["cash", "bank", "cash_and_bank"];
    const isCashOrBank =
      cashBankSubtypes.includes((sourceAcctRow.subtype as string) ?? "") ||
      cashBankSubtypes.includes((sourceAcctRow.accountSubtype as string) ?? "") ||
      /^11[01]\d/.test(sourceAcctRow.code as string);
    if (!isCashOrBank) {
      throw new ValidationError(
        `حساب المصدر "${sourceAcctRow.code} - ${sourceAcctRow.name}" ليس حساباً نقدياً أو بنكياً`,
        { field: "sourceAccountCode", fix: "استخدم حساباً نقدياً أو بنكياً (عادةً كود يبدأ بـ 11)" }
      );
    }

    const baseAmount = roundTo2(Number(amount) || 0);
    if (!baseAmount || isNaN(baseAmount)) throw new ValidationError("المبلغ غير صالح", { field: "amount" });

    if (allocations && allocations.length > 0) {
      const allocTotal = roundTo2(allocations.reduce((s, a) => s + Number(a.amount), 0));
      if (allocTotal > baseAmount + 0.005) {
        throw new ValidationError(
          `مجموع التخصيصات (${allocTotal}) يتجاوز مبلغ السند (${baseAmount})`,
          { field: "allocations", fix: "خفّض مبالغ التخصيصات أو ارفع مبلغ السند" }
        );
      }
    }

    const vatRateVal = rawVatRate != null ? (Number(rawVatRate) || 0) : 0;
    const computedVat = roundTo2(rawVatAmount != null ? (Number(rawVatAmount) || 0) : computeVat(baseAmount, vatRateVal));
    const totalWithVat = roundTo2(baseAmount + computedVat);

    const isReceipt = type === "receipt";
    const prefix = isReceipt ? "RV" : "PV";
    const idempotencyToken = requestIdempotencyToken(req);
    const ref = `${prefix}-${idempotencyToken}`;

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || type, relatedEntityName, amount: baseAmount });
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const cashAcct = sourceAccountCode || "1100";

    // #1715 wave-1 consolidation: the voucher create flow converges on the
    // unified FinanceOperationContext (guardrail #6). The adapter maps the
    // legacy voucher fields into a context; assertOperationValid wraps the
    // same posting policy (نقدي→صندوق, تحويل→بنك, شيك→بنك/شيكات, …) so the
    // money account must still match the chosen method. Behaviour-identical,
    // backend-enforced.
    {
      const { assertOperationValid, fromLegacyVoucherForm } = await import("../lib/financeOperationContext.js");
      const opCtx = fromLegacyVoucherForm({
        companyId: scope.companyId,
        branchId: branchId ?? scope.branchId ?? null,
        type,
        sourceAccountCode: cashAcct,
        method,
        relatedEntityType,
        relatedEntityId: relatedEntityId != null ? Number(relatedEntityId) : null,
        lineAllocation,
        // #1945 item 5 — direction-aware counter account (صرف=مصروف /
        // قبض=إيراد): the chosen revenue/expense/AR/AP leg must match the
        // voucher direction + operationType (rule 4 in assertOperationValid).
        counterAccountCode: subAccountCode || accountCode,
        operationType: operationType || null,
      });
      await assertOperationValid(opCtx);
    }

    const outputVatCode = computedVat > 0 ? await financialEngine.resolveAccountCode(scope.companyId, "vat_output", "credit", "2300") : "2300";
    const inputVatCode2 = computedVat > 0 ? await financialEngine.resolveAccountCode(scope.companyId, "vat_input", "debit", "1400") : "1400";

    // ── WHT computation for payment vouchers w/ purchase-order allocations ──
    // Walk every allocation pointing at a purchase_order, look up the
    // PO's supplier, and run computeWHT on the allocation amount (NOT
    // the PO total — partial payments must withhold proportionally).
    // Resident suppliers short-circuit inside computeWHT → applies=false.
    // Receipts (RV-…) never withhold; they're the AR side, not AP.
    interface AllocWht { wht: number; net: number; rate: number; category: string | null; payableAccountCode: string | null }
    const allocWht: (AllocWht | null)[] = (allocations ?? []).map(() => null);
    let totalWht = 0;
    const whtCreditByAccount = new Map<string, number>();
    let whtPayableFallback = "2330";
    if (!isReceipt && allocations && allocations.length > 0) {
      const { computeWHT } = await import("../lib/withholdingTax.js");
      whtPayableFallback = await financialEngine.resolveAccountCode(
        scope.companyId, "wht_payable", "credit", "2330",
      );
      for (let i = 0; i < allocations.length; i++) {
        const a = allocations[i];
        if (a.obligationType !== "purchase_order") continue;
        const [po] = await rawQuery<{ supplierId: number | null }>(
          `SELECT "supplierId" FROM purchase_orders
            WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [a.obligationId, scope.companyId]
        );
        if (!po?.supplierId) continue;
        const split = await computeWHT({
          companyId: scope.companyId,
          supplierId: Number(po.supplierId),
          grossAmount: Number(a.amount),
        });
        if (!split.applies || split.wht <= 0) continue;
        allocWht[i] = {
          wht: split.wht, net: split.net, rate: split.rate,
          category: split.category, payableAccountCode: split.payableAccountCode,
        };
        totalWht = roundTo2(totalWht + split.wht);
        const code = split.payableAccountCode || whtPayableFallback;
        whtCreditByAccount.set(code, roundTo2((whtCreditByAccount.get(code) ?? 0) + split.wht));
      }
    }

    // Net cash leaving the company = totalWithVat − totalWht. The
    // withheld portion sits in WHT Payable until the next ZATCA filing.
    const netCashOut = roundTo2(totalWithVat - totalWht);

    // Derive line-level dims from the voucher's relatedEntity / contract /
    // department / costCenter so EVERY leg of the voucher JE carries the
    // same attribution. Pre-fix the voucher posted with bare lines —
    // per-supplier voucher analysis, per-tenant payment history, and
    // per-department cashflow drilldowns were all silently broken.
    //
    // The frontend voucher form (vouchers-create.tsx) ships the
    // relatedEntityType values: employee, supplier, customer, contract,
    // property. Map each to the canonical journal_lines column. "client"
    // + "vendor" + "vehicle" are accepted too for callers that use the
    // dimension-name variants.
    const voucherDims: Record<string, any> = {};
    if ((relatedEntityType === "supplier" || relatedEntityType === "vendor") && relatedEntityId) voucherDims.vendorId = Number(relatedEntityId);
    if ((relatedEntityType === "customer" || relatedEntityType === "client") && relatedEntityId) voucherDims.clientId = Number(relatedEntityId);
    if (relatedEntityType === "employee" && relatedEntityId) voucherDims.employeeId = Number(relatedEntityId);
    if (relatedEntityType === "vehicle" && relatedEntityId) voucherDims.vehicleId = Number(relatedEntityId);
    if (relatedEntityType === "property" && relatedEntityId) voucherDims.propertyId = Number(relatedEntityId);
    // When relatedEntityType=contract the contractId is encoded both in
    // relatedEntityId (form path) and in the top-level contractId field
    // (legacy path). Honour either.
    if (relatedEntityType === "contract" && relatedEntityId) voucherDims.contractId = Number(relatedEntityId);
    if (contractId) voucherDims.contractId = Number(contractId);
    if (departmentId) voucherDims.departmentId = Number(departmentId);
    if (b.costCenter) voucherDims.costCenter = b.costCenter;

    // #1715: merge the master «ربط السند بـ» allocation dims on top of the
    // relatedEntity-derived ones. The AllocationTargetSelect ships the full
    // dim set (vehicle / property / unit / contract / project / umrah / …)
    // so vouchers reach the same dim parity as expenses + manual journals.
    if (lineAllocation) {
      const la = lineAllocation as Record<string, any>;
      for (const k of [
        "costCenterId", "activityType", "projectId", "vehicleId", "propertyId",
        "unitId", "assetId", "contractId", "umrahAgentId", "umrahSeasonId",
        "clientId", "vendorId", "driverId", "productId", "departmentId",
        "employeeId", "manualOverrideReason",
      ]) {
        if (la[k] != null && la[k] !== "") voucherDims[k] = la[k];
      }
    }

    // Centralised resolver — fills cost-centre from rule when operator
    // left it empty + records the rule reference for the Manual
    // Overrides report. Voucher accountCode is operator-pinned (it's
    // the revenue/expense account they explicitly chose), so the
    // resolver runs in manual_override mode and only the costCenterId
    // slot benefits — but that's the whole point for vouchers: pick
    // employee/supplier/vehicle/property and the per-entity CC drops
    // in without the operator having to know which CC to pick. Same
    // pattern as the expenses route fix in #1662.
    if (relatedEntityType) {
      const { resolveLineAllocation } = await import("../lib/accountingAllocation.js");
      const voucherDocType = isReceipt ? "voucher_receipt" : "voucher_payment";
      const resolved = await resolveLineAllocation({
        companyId: scope.companyId,
        documentType: voucherDocType,
        lineType: operationType || type || undefined,
        entityType: relatedEntityType || undefined,
        accountCode: (subAccountCode || accountCode) || undefined,
        costCenterId: voucherDims.costCenterId != null ? Number(voucherDims.costCenterId) : null,
        dimensions: {
          vehicleId: voucherDims.vehicleId ?? null,
          propertyId: voucherDims.propertyId ?? null,
          unitId: null,
          assetId: null,
          projectId: voucherDims.projectId ?? null,
          employeeId: voucherDims.employeeId ?? null,
          driverId: null,
          contractId: voucherDims.contractId ?? null,
          umrahSeasonId: null,
          umrahAgentId: null,
          productId: null,
          clientId: voucherDims.clientId ?? null,
          vendorId: voucherDims.vendorId ?? null,
        },
        sourceTable: "journal_lines",
        sourceLineId: 0,
      });
      if ((resolved.status === "resolved" || resolved.status === "manual_override") &&
          voucherDims.costCenterId == null && resolved.costCenterId != null) {
        voucherDims.costCenterId = resolved.costCenterId;
      }
    }

    const whtCreditLines = Array.from(whtCreditByAccount.entries()).map(
      ([accountCode, amount]) => ({ accountCode, debit: 0, credit: amount, ...voucherDims })
    );

    const journalLines: { accountCode: string; debit: number; credit: number; [k: string]: any }[] = isReceipt
      ? [
          { accountCode: cashAcct, debit: totalWithVat, credit: 0, ...voucherDims },
          ...(computedVat > 0 ? [{ accountCode: outputVatCode, debit: 0, credit: computedVat, ...voucherDims }] : []),
          { accountCode: subAccountCode || accountCode, debit: 0, credit: baseAmount, ...voucherDims },
        ]
      : [
          { accountCode: subAccountCode || accountCode, debit: baseAmount, credit: 0, ...voucherDims },
          ...(computedVat > 0 ? [{ accountCode: inputVatCode2, debit: computedVat, credit: 0, ...voucherDims }] : []),
          ...whtCreditLines,
          { accountCode: cashAcct, debit: 0, credit: netCashOut, ...voucherDims },
        ];

    if (isDryRun(req)) {
      res.json({
        dryRun: true,
        ref,
        type,
        description: finalDescription,
        lines: journalLines,
        totals: {
          totalDebit: roundTo2(journalLines.reduce((s, l) => s + l.debit, 0)),
          totalCredit: roundTo2(journalLines.reduce((s, l) => s + l.credit, 0)),
          baseAmount,
          vatAmount: computedVat,
          totalWithVat,
          whtAmount: totalWht,
          netCashOut,
        },
      });
      return;
    }

    // FIN-007 — the voucher is recorded as a draft entry that does NOT move
    // account balances; balances are applied only when the voucher is
    // approved (PATCH /vouchers/:id/approve). A rejected voucher therefore
    // never touches the ledger.
    // Atomicity guarantee: voucher JE, metadata UPDATE, and N
    // supplier_payment_allocations inserts (with their per-row cap
    // validation) commit or roll back together. The earlier shape ran
    // the engine post, then the metadata UPDATE (with .catch logging),
    // then the allocations loop with per-row throws — so a Validation
    // Error on allocation #N left allocations #1..#N-1 + the JE
    // committed, with the route returning 4xx. The voucher then
    // existed in a partial state: idempotency replay (sourceKey match)
    // returns alreadyExists=true and SKIPS the allocations loop
    // entirely (line below), so the missing allocations stay missing
    // forever. financialEngine.postJournalEntry's internal
    // withTransaction joins this outer one reentrantly via SAVEPOINT
    // (rawdb.ts:108).
    const { journalId, alreadyExists } = await withTransaction(async (client) => {
      // #1715 correctness review (L1) — honour the entered voucher date as the
      // posting date (was defaulting to today, unlike invoices/memos).
      const posted = await financialEngine.postJournalEntry({ companyId: scope.companyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, sourceType: "voucher", sourceId: 0, sourceKey: `finance:voucher:${idempotencyToken}`, lines: journalLines, deferBalances: true, postingDate: voucherDate ? toDateISO(voucherDate) : undefined });

      await rawExecute(
        `UPDATE journal_entries SET "paymentMethod" = $1, reference = $2, "attachmentUrl" = $3, "attachmentType" = $4, "relatedEntityType" = $5, "relatedEntityId" = $6, "operationType" = $7, "departmentId" = $8 WHERE id = $9 AND "companyId" = $10 AND "deletedAt" IS NULL`,
        [method ?? "cash", reference ?? null, attachmentUrl ?? null, attachmentType ?? null, relatedEntityType ?? null, relatedEntityId ?? null, operationType ?? type, departmentId ?? null, posted.journalId, scope.companyId]
      );

      // #1715 (owner gap-closure) — fire the SAME operational effects an expense
      // would, so a سند صرف for maintenance/fuel/asset is not «ربط بلا أثر».
      // Entity ids come from voucherDims (relatedEntity + lineAllocation). All
      // gated on create + !alreadyExists (idempotent replay never double-fires).
      if (!posted.alreadyExists) {
        const vehId = voucherDims.vehicleId != null ? Number(voucherDims.vehicleId) : null;
        const unitId = voucherDims.unitId != null ? Number(voucherDims.unitId) : null;
        const propId = voucherDims.propertyId != null ? Number(voucherDims.propertyId) : null;
        if (maintenanceTicket?.create && (vehId != null || unitId != null || propId != null)) {
          const { applyMaintenanceTicketEffect } = await import("../lib/financeOperationalEffect.js");
          const eff = await applyMaintenanceTicketEffect(client, {
            companyId: scope.companyId,
            branchId: branchId ?? scope.branchId ?? null,
            journalId: posted.journalId,
            target: vehId != null ? "vehicle" : "property",
            vehicleId: vehId,
            propertyId: propId,
            unitId: unitId,
            contractId: voucherDims.contractId != null ? Number(voucherDims.contractId) : null,
            cost: baseAmount,
            maintenanceType: maintenanceTicket.maintenanceType ?? null,
            odometer: maintenanceTicket.odometer ?? null,
            costBearer: maintenanceTicket.costBearer ?? null,
            performedBy: maintenanceTicket.performedBy ?? null,
            description: finalDescription ?? null,
            existingTicketId: maintenanceTicket.existingTicketId ?? null,
          });
          if (maintenanceTicket.existingTicketId != null && eff.action === "none") {
            throw new ValidationError("تذكرة الصيانة المحددة غير موجودة", {
              field: "maintenanceTicket.existingTicketId",
              fix: "اختر تذكرة صيانة قائمة صحيحة أو أنشئ تذكرة جديدة",
            });
          }
        }
        if (assetCreation?.create && assetCreation.name) {
          const { applyAssetCreationEffect } = await import("../lib/financeOperationalEffect.js");
          await applyAssetCreationEffect(client, {
            companyId: scope.companyId,
            branchId: branchId ?? scope.branchId ?? null,
            journalId: posted.journalId,
            name: assetCreation.name,
            cost: baseAmount,
            usefulLifeYears: assetCreation.usefulLifeYears ?? null,
            category: assetCreation.category ?? null,
            depreciationMethod: assetCreation.depreciationMethod ?? null,
            salvageValue: assetCreation.salvageValue ?? null,
            purchaseDate: voucherDate ?? null,
          });
        }
        if (fuelLog?.create && vehId != null) {
          const { applyFuelLogEffect } = await import("../lib/financeOperationalEffect.js");
          await applyFuelLogEffect(client, {
            companyId: scope.companyId,
            branchId: branchId ?? scope.branchId ?? null,
            journalId: posted.journalId,
            vehicleId: vehId,
            totalCost: baseAmount,
            liters: fuelLog.liters ?? null,
            costPerLiter: fuelLog.costPerLiter ?? null,
            mileageAtFuel: fuelLog.odometer ?? null,
            stationName: fuelLog.stationName ?? null,
            fuelDate: voucherDate ?? null,
          });
        }
      }

      // C4 + C5 — link the voucher to the AP obligation(s) it pays. Skip
      // on idempotent replay (rows already exist from the original insert).
      if (allocations && allocations.length > 0 && !posted.alreadyExists) {
        for (let i = 0; i < allocations.length; i++) {
          const a = allocations[i];
          const wht = allocWht[i];
          const allocAmt = roundTo2(Number(a.amount));
          // The obligation is discharged by the FULL gross — the
          // supplier sees the buyer paid 100K (85K cash + 15K to ZATCA
          // on its behalf). So `amount` (= cash to supplier) stays net
          // and the gross-discharged is `allocAmt + wht.wht`.
          const grossDischarged = roundTo2(allocAmt + (wht?.wht ?? 0));

          // #901 cap: Σ existing allocations to this obligation + the new
          // amount must not exceed the obligation's total. Without this
          // check, two vouchers each ≤ their own amount can still
          // over-allocate a PO/Nusk invoice. Σ must include withheld
          // amounts on previous allocations (gross discharged), so the
          // SUM picks up amount + whtAmount.
          let obligationCap: number | null = null;
          if (a.obligationType === "purchase_order") {
            const [po] = await rawQuery<{ totalAmount: string | number }>(
              `SELECT "totalAmount" FROM purchase_orders
                WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
              [a.obligationId, scope.companyId]
            );
            if (po) obligationCap = Number(po.totalAmount);
          } else if (a.obligationType === "nusk_invoice") {
            const [ni] = await rawQuery<{ totalAmount: string | number; refundAmount: string | number }>(
              `SELECT "totalAmount", "refundAmount" FROM umrah_nusk_invoices
                WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
              [a.obligationId, scope.companyId]
            );
            if (ni) obligationCap = Number(ni.totalAmount) - Number(ni.refundAmount ?? 0);
          }
          if (obligationCap !== null) {
            const [{ already }] = await rawQuery<{ already: string | number }>(
              `SELECT COALESCE(SUM(amount + COALESCE("whtAmount", 0)), 0) AS already
                 FROM supplier_payment_allocations
                WHERE "companyId" = $1
                  AND "obligationType" = $2
                  AND "obligationId" = $3
                  AND "deletedAt" IS NULL`,
              [scope.companyId, a.obligationType, a.obligationId]
            );
            const alreadyAllocated = Number(already);
            if (alreadyAllocated + grossDischarged > roundTo2(obligationCap) + 0.005) {
              throw new ValidationError(
                `إجمالي التخصيصات (${roundTo2(alreadyAllocated + grossDischarged)}) يتجاوز قيمة الالتزام (${roundTo2(obligationCap)})`,
                {
                  field: "allocations",
                  fix: `الالتزام (${a.obligationType} #${a.obligationId}) قُيِّد له ${roundTo2(alreadyAllocated)} سابقًا. خفّض المبلغ.`,
                }
              );
            }
          }

          await rawExecute(
            `INSERT INTO supplier_payment_allocations
               ("companyId", "branchId", "journalEntryId",
                "obligationType", "obligationId", amount, notes, "createdBy",
                "whtAmount", "whtRate", "whtCategory")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              scope.companyId,
              branchId ?? scope.branchId ?? null,
              posted.journalId,
              a.obligationType,
              a.obligationId,
              allocAmt,                              // comment-anchor: amount = net
              a.notes ?? null,
              scope.activeAssignmentId ?? null,
              wht?.wht ?? 0,
              wht?.rate ?? null,
              wht?.category ?? null,
            ]
          );
        }
      }

      return { journalId: posted.journalId, alreadyExists: posted.alreadyExists };
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `voucher.${type}`, entity: "vouchers", entityId: journalId, details: JSON.stringify({ ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat, accountCode, payee, method }) }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdVoucher] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdVoucher || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Create voucher error:");
  }
});

// Audit F5 — DOC. Defensive endpoint with the **VL-1 guard contract**
// (ref-prefix filter, terminal-state rejection, period gate). The UI
// uses approve/reject flows, but `financeGoldenPath.test.ts:316+`
// validates each VL-1 guard on this exact route — deleting would lose
// the contract that protects against silent rewrites of approved
// vouchers.
journalRouter.patch("/vouchers/:id", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { description } = zodParse(updateDescriptionSchema.safeParse(req.body ?? {}));

    // VL-1 — fetch the voucher (and only a voucher, per the RV/PV ref
    // filter) so we can verify status + period BEFORE any UPDATE. The
    // ref filter is critical: without it, the route was a generic
    // "edit description on any journal_entries row" — sending an
    // expense or manual-journal id would silently rewrite that row's
    // description, bypassing every domain-specific guard.
    const [existing] = await rawQuery<{ status: string; entryDate: string }>(
      `SELECT status, date::text AS "entryDate"
         FROM journal_entries
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          AND (ref LIKE 'RV%' OR ref LIKE 'PV%')`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("السند غير موجود");

    // VL-1 (mirrors PD-4 on PATCH /expenses/:id): an approved or terminal-
    // state voucher is immutable — corrections happen via a reversing
    // entry through POST /journal/:id/reverse, never an in-place edit.
    // Pre-approval states (draft, pending_approval, returned) are still
    // editable.
    const TERMINAL_VOUCHER_STATES = new Set([
      "approved", "rejected", "cancelled", "reversed", "posted",
    ]);
    if (TERMINAL_VOUCHER_STATES.has(existing.status)) {
      throw new ConflictError(
        `لا يمكن تعديل سند بحالة "${existing.status}" — التصحيح يكون عبر قيد عاكس`,
        { field: "status", fix: "أنشئ قيداً عاكساً عبر POST /journal/:id/reverse بدلاً من تعديل السند المُرحَّل" }
      );
    }

    // Period gate: even a draft voucher whose date sits in a now-closed
    // period must not be edited — the eventual approval would be blocked
    // by H2 anyway. Catching it here gives the operator a clear error
    // pointing at the period, not a confusing "approval failed" later.
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, existing.entryDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن تعديل سند بتاريخ في فترة مُقفلة: ${periodCheck.periodName ?? existing.entryDate}`,
        { field: "financialPeriod", meta: { periodName: periodCheck.periodName } }
      );
    }

    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE journal_entries SET description = $1
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL
          AND (ref LIKE 'RV%' OR ref LIKE 'PV%') RETURNING *`,
      [description, id, scope.companyId]
    );
    if (!row) throw new NotFoundError("السند غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

// Audit F5 — DOC. Defensive sibling to the VL-1-guarded PATCH.
// `financeGoldenPath.test.ts:141` asserts existence; the handler only
// deletes drafts so the audit invariant of "approved JE is immutable"
// stays intact.
journalRouter.delete("/vouchers/:id", authorize({ feature: "finance.journal", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'draft' RETURNING id`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("السند غير موجود");
    await reverseAccountBalances(scope.companyId, row.id as number);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

// Audit F2 — Intentional split, not duplication.
// /finance/salary-advances posts a one-shot advance against
// salary_advance_receivable (default 1410) with no installment plan,
// no employee_loans row, no monthly amortization. Approval flows through
// the finance "advances" chain. Idempotency: SALARY-ADV-<token>.
// hr-loans (loanType='salary_advance') posts to staff_loans (default 1400),
// creates an employee_loans row with deductMonths, schedules payroll
// auto-deductions, and flows through the HR loan-approval chain.
// Idempotency: LOAN-<id>. Different account, different table, different
// workflow — keep both.
journalRouter.get("/salary-advances", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, je.description, COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, je.status FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%' GROUP BY je.id, je.ref, je.description, je.status, je."createdAt" ORDER BY je."createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows, summary: { total: rows.length, totalAmount: rows.reduce((s: number, r) => s + Number(r.amount), 0) } }));
  } catch (err) {
    res.json({ data: [], summary: { total: 0, totalAmount: 0 } });
  }
});

journalRouter.get("/salary-advances/:id", authorize({ feature: "finance.journal", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je.status, je."createdAt", je."updatedAt",
              je."branchId", je."companyId",
              COALESCE(SUM(jl.debit), 0) AS amount,
              CONCAT('SA-', je.id) AS "refDisplay"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%'
       GROUP BY je.id, je.ref, je.description, je.status, je."createdAt", je."updatedAt", je."branchId", je."companyId"`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("السلفة غير موجودة");
    res.json(maskFields(req, item));
  } catch (err) { handleRouteError(err, res, "Get salary advance detail error:"); }
});

journalRouter.post("/salary-advances", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { employeeName, amount, description, deductMonths, sourceAccountCode, employeeId } = zodParse(createSalaryAdvanceSchema.safeParse(req.body ?? {}));
    if (!amount || !employeeName) { throw new ValidationError("اسم الموظف والمبلغ مطلوبان"); return; }
    const sourceAcct = sourceAccountCode || "1100";
    const idempotencyToken = requestIdempotencyToken(req);
    const ref = `SALARY-ADV-${idempotencyToken}`;

    const { financialEngine } = await import("../lib/engines/index.js");
    let advanceAccountCode = await financialEngine.resolveAccountCode(scope.companyId, "salary_advance_receivable", "debit", "1410");
    if (employeeId) {
      const [subAcc] = await rawQuery<Record<string, unknown>>(
        `SELECT ca.code FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
         WHERE sa."companyId" = $1 AND sa."entityType" = 'employee' AND sa."entityId" = $2 AND sa."accountType" = 'advance'`,
        [scope.companyId, Number(employeeId)]
      );
      if (subAcc) advanceAccountCode = subAcc.code as string;
    }

    const advanceLines = [
      { accountCode: advanceAccountCode, debit: Number(amount), credit: 0, employeeId: employeeId ? Number(employeeId) : undefined },
      // Cash CR carries employeeId so per-employee advance-receivable
      // aging stays in sync with the cashflow drilldown (without this,
      // the DR ties to the employee but the matching cash outflow is
      // unattributed in per-employee treasury reports).
      { accountCode: sourceAcct, debit: 0, credit: Number(amount), employeeId: employeeId ? Number(employeeId) : undefined },
    ];
    const advanceDescription = description ?? `سلفة راتب ${employeeName} – خصم على ${deductMonths} شهر`;

    if (isDryRun(req)) {
      res.json({
        dryRun: true,
        ref,
        description: advanceDescription,
        lines: advanceLines,
        totals: {
          totalDebit: roundTo2(advanceLines.reduce((s, l) => s + l.debit, 0)),
          totalCredit: roundTo2(advanceLines.reduce((s, l) => s + l.credit, 0)),
          amount: Number(amount),
        },
      });
      return;
    }

    // Atomicity guarantee: salary-advance JE post, approval-chain init,
    // and the pending_approval status flip all commit or roll back
    // together. The earlier shape ran them sequentially — a throw on
    // initiateApprovalChain (FK / chain definition / amount tier) left
    // the JE committed without an approval chain (the C3 silent-
    // corruption pattern that #885 closed on /expenses and #1021
    // closed on /custodies). Same fix pattern. The engine's internal
    // withTransaction joins this outer one reentrantly via SAVEPOINT
    // (rawdb.ts:108).
    let journalId!: number;
    let alreadyExists = false;
    await withTransaction(async () => {
      const posted = await financialEngine.postJournalEntry({ companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId, ref, description: advanceDescription, type: "salary_advance", sourceType: "salary_advance", sourceId: 0, sourceKey: `finance:salary_advance:${idempotencyToken}`, lines: advanceLines });
      journalId = posted.journalId;
      alreadyExists = posted.alreadyExists;
      const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "advances", refType: "salary_advance", refId: journalId, amount: Number(amount) });
      if (approvalResult.requiresApproval) {
        const { affectedRows } = await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`, [journalId, scope.companyId]);
        if (!affectedRows) throw new NotFoundError("القيد غير موجود");
      }
    });
    markIdempotencyReplay(req, res, alreadyExists);
    const [createdAdvance] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdAdvance || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.patch("/salary-advances/:id/approve", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const advanceId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));

    const [entry] = await rawQuery<Record<string, unknown>>(
      `SELECT ref FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'SALARY-ADV%'`,
      [advanceId, scope.companyId]
    );
    if (!entry) throw new NotFoundError("السلفة غير موجودة");

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) {
      throw new ValidationError("يجب ذكر سبب الرفض", {
        field: "notes",
        fix: "اكتب سبب رفض السلفة",
      });
    }

    // Central lifecycle engine: salary advances live on journal_entries
    // with the standard `status` column. fromStates allows decisions only
    // when the advance is still pending — approved or rejected advances
    // cannot be re-decided without going through a fresh approval chain.
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "journal_entries",
      id: advanceId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `salary_advance.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'SALARY-ADV%'`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
           VALUES ('salary_advance',$1,$2,$3,$4,$5)`,
          [advanceId, newStatus, notes || null, scope.userId, scope.companyId]
        );
        // FIN-005 — the advance posts a GL entry at creation (DR advance
        // receivable / CR cash). Rejecting it must undo that movement, in
        // the SAME transaction as the status change so a rejected advance
        // can never leave the receivable and cash shifted.
        if (newStatus === "rejected") {
          await reverseAccountBalances(scope.companyId, advanceId);
        }
      },
      after: { ref: entry.ref, decision: newStatus, notes: notes ?? null },
    });

    res.json({
      id: advanceId,
      status: updated.status,
      event: `salary_advance.${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve salary advance error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY DETAIL + REVERSAL (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

journalRouter.get("/journal", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true, includeNullBranch: true });
    const rows = await rawQuery<Record<string, unknown>>(
      // FIN-SUB-03b (#2118) slice 1 — this read now surfaces the three status
      // axes alongside the legacy `status` (kept, not removed). The axes are
      // maintained by the trigger from migration 311, and `postingStatus` is
      // derived from the ACTUAL posting (`balancesApplied`), so a directly
      // posted entry that still carries status='draft' (balancesApplied=true)
      // reads truthfully as postingStatus='posted' here — where the legacy
      // `status` alone would mislabel it as a draft/unposted entry.
      `SELECT je.id, je.ref, je.description, je.status, je."createdAt",
              je."documentStatus", je."paymentStatus", je."postingStatus",
              je."reversalOfId", je."reversedById", je."operationType",
              COALESCE(SUM(jl.debit), 0) AS "totalDebit",
              COALESCE(SUM(jl.credit), 0) AS "totalCredit",
              COALESCE(json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) FILTER (WHERE jl.id IS NOT NULL), '[]') AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 200`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "List journal entries error:"); }
});

journalRouter.post("/journal", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { description, lines, date, branchId: bodyBranchId, branchSplits } = zodParse(createJournalSchema.safeParse(req.body ?? {}));
    // Resolve the entry-level branch. Owner / GM short-circuits the
    // resolver and uses body || scope. Multi-branch users get the
    // BranchRequired typed error so the frontend can render a picker.
    let manualBranchId: number;
    if (scope.isOwner || OWNER_GM_ROLES.includes(scope.role)) {
      manualBranchId = (bodyBranchId ?? scope.branchId) as number;
      if (!manualBranchId) {
        throw new ValidationError("الفرع مطلوب لإنشاء القيد", { field: "branchId", fix: "حدد الفرع الذي ينتمي إليه القيد" });
      }
    } else {
      const r = resolveTransactionBranch({
        scope: { companyId: scope.companyId, branchId: scope.branchId, allowedBranches: scope.allowedBranches },
        bodyBranchId,
        bodySplits: branchSplits,
      });
      manualBranchId = r.branchId;
    }
    if (!description) throw new ValidationError("وصف القيد مطلوب", { field: "description" });
    if (!Array.isArray(lines) || lines.length < 2) throw new ValidationError("القيد يجب أن يحتوي على بندين على الأقل", { field: "lines" });
    for (const l of lines) { l.debit = roundTo2(Number(l.debit) || 0); l.credit = roundTo2(Number(l.credit) || 0); }
    // Reject negative amounts up front. Without this guard a user passing
    // `{debit:-100, credit:0}` produces a "negative debit" that survives
    // the imbalance check (sums match if mirrored on the credit side) and
    // then reverses the chart_of_accounts movement at apply time —
    // posting a balanced-but-inverted entry on the GL. The accounting
    // convention is non-negative amounts in the proper column, period.
    for (const l of lines) {
      if (l.debit < 0 || l.credit < 0) {
        throw new ValidationError("لا يُسمح بمبالغ سالبة في بنود القيد", {
          field: "lines",
          fix: "استعمل الجانب المقابل (مدين/دائن) لعكس الإشارة بدل الرقم السالب",
        });
      }
      if (l.debit > 0 && l.credit > 0) {
        throw new ValidationError("لا يُسمح بمدين ودائن في نفس البند", {
          field: "lines",
          fix: "اقسم البند إلى بندين منفصلين",
        });
      }
    }
    const totalDebit = roundTo2(lines.reduce((s: number, l) => s + l.debit, 0));
    const totalCredit = roundTo2(lines.reduce((s: number, l) => s + l.credit, 0));
    // Aligned with createJournalEntry (businessHelpers.ts:529) which rejects
    // at `>= 0.005`. The previous `> 0.01` route-level threshold let a
    // 1-cent imbalance through into the engine where it failed with a less
    // helpful error — same correctness, worse UX.
    if (Math.abs(totalDebit - totalCredit) >= 0.005) throw new ValidationError(`القيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`, { field: "lines", fix: "تأكد من تساوي المدين والدائن" });

    const postingDate = date ? toDateISO(date) : currentDateInTz("Asia/Riyadh");
    const engineLines = lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
      // Map all 17 dim FK columns. Pre-fix this mapping covered only 4
      // (costCenter / departmentId / projectId / employeeId) — the
      // remaining 12 were stripped by the journalLineSchema Zod validator
      // upstream AND would have been dropped here even if the schema let
      // them through. createJournalEntry (businessHelpers.ts) writes all
      // 17 to journal_lines, so the entire chain works end-to-end now.
      costCenter: l.costCenter,
      costCenterId: l.costCenterId != null ? Number(l.costCenterId) : undefined,
      departmentId: l.departmentId != null ? Number(l.departmentId) : undefined,
      projectId: l.projectId != null ? Number(l.projectId) : undefined,
      employeeId: l.employeeId != null ? Number(l.employeeId) : undefined,
      vehicleId: l.vehicleId != null ? Number(l.vehicleId) : undefined,
      propertyId: l.propertyId != null ? Number(l.propertyId) : undefined,
      unitId: l.unitId != null ? Number(l.unitId) : undefined,
      assetId: l.assetId != null ? Number(l.assetId) : undefined,
      contractId: l.contractId != null ? Number(l.contractId) : undefined,
      driverId: l.driverId != null ? Number(l.driverId) : undefined,
      productId: l.productId != null ? Number(l.productId) : undefined,
      vendorId: l.vendorId != null ? Number(l.vendorId) : undefined,
      clientId: l.clientId != null ? Number(l.clientId) : undefined,
      umrahAgentId: l.umrahAgentId != null ? Number(l.umrahAgentId) : undefined,
      umrahSeasonId: l.umrahSeasonId != null ? Number(l.umrahSeasonId) : undefined,
      activityType: l.activityType,
      templateId: l.templateId != null ? Number(l.templateId) : undefined,
    }));

    if (isDryRun(req)) {
      res.json({
        dryRun: true,
        description,
        postingDate,
        lines: engineLines,
        totals: { totalDebit, totalCredit },
      });
      return;
    }

    // Numbering center (Issue #1141) — manual journal number from the
    // central authority (scheme: finance.journal_entry). No random
    // fallback: if numbering fails, the manual JE creation fails too.
    const issued = await issueNumber({
      companyId: scope.companyId,
      branchId: manualBranchId,
      moduleKey: "finance",
      entityKey: "journal_entry",
      entityTable: "journal_entries",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const ref = issued.number;
    const idempotencyToken = requestIdempotencyToken(req);

    // Multi-branch split: if branchSplits[] was provided, stamp the
    // matching branchId on each line (operator's choice). Otherwise
    // every line inherits the header's manualBranchId (engine default).
    if (branchSplits && branchSplits.length > 0) {
      for (let i = 0; i < engineLines.length; i++) {
        const split = branchSplits[i] ?? branchSplits[branchSplits.length - 1];
        (engineLines[i] as any).branchId = split.branchId;
      }
    }

    // FIN-013 — manual journals now follow a draft → approved → posted
    // workflow instead of posting directly. `deferBalances: true` keeps
    // the JE off the GL until the `/journal/:id/post` step runs
    // `applyJournalEntryBalances` against it. This matches the voucher
    // and salary-advance lifecycle and gives finance teams an approval
    // gate before money moves.
    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId: insertId, alreadyExists } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: manualBranchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description,
      type: "manual",
      sourceType: "manual_journal",
      sourceId: 0,
      sourceKey: `finance:manual_je:${ref}:${idempotencyToken}`,
      lines: engineLines,
      status: "draft",
      deferBalances: true,
      postingDate,
    });
    markIdempotencyReplay(req, res, alreadyExists);

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "journal_entries", entityId: insertId, after: { ref, description, totalDebit } }).catch((e) => logger.error(e, "finance-journal background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "finance.journal.created", entity: "journal_entries", entityId: insertId, details: JSON.stringify({ ref }) }).catch((e) => logger.error(e, "finance-journal background task failed"));
    const [createdJournal] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [insertId, scope.companyId]
    );
    res.status(201).json({ ...(createdJournal || { id: insertId }), idempotentReplay: alreadyExists });
  } catch (err) { handleRouteError(err, res, "Create journal entry error:"); }
});

journalRouter.get("/journal/:id", authorize({ feature: "finance.journal", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!Number.isFinite(id)) { throw new ValidationError("معرّف القيد غير صالح"); return; }
    // Branch isolation (RCA BR-2): a branch-scoped user must not read a
    // journal entry outside their assigned branches — apply the same
    // company + branch scope the /journal list endpoints already enforce.
    const { where: scopeWhere, params: scopeParams } = buildScopedWhere(
      scope, parseScopeFilters(req),
      { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true, includeNullBranch: true },
      2,
    );
    const [je] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*,
              ro.ref AS "reversalOfRef", ro.description AS "reversalOfDescription",
              rb.ref AS "reversedByRef", rb.description AS "reversedByDescription"
       FROM journal_entries je
       LEFT JOIN journal_entries ro ON ro.id = je."reversalOfId" AND ro."deletedAt" IS NULL
       LEFT JOIN journal_entries rb ON rb.id = je."reversedById" AND rb."deletedAt" IS NULL
       WHERE je.id = $1 AND ${scopeWhere} AND je."deletedAt" IS NULL
       LIMIT 1`,
      [id, ...scopeParams]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");
    const lines = await rawQuery<Record<string, unknown>>(
      `SELECT jl.*, coa.name AS "accountName"
       FROM journal_lines jl
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $2 AND coa."deletedAt" IS NULL
       WHERE jl."journalId" = $1
       ORDER BY jl.id ASC`,
      [id, je.companyId]
    );
    res.json(maskFields(req, {
      ...je,
      lines,
      reversalOf: je.reversalOfId
        ? { id: je.reversalOfId, ref: je.reversalOfRef, description: je.reversalOfDescription }
        : null,
      reversedBy: je.reversedById
        ? { id: je.reversedById, ref: je.reversedByRef, description: je.reversedByDescription }
        : null,
    }));
  } catch (err) {
    handleRouteError(err, res, "Get journal error:");
  }
});

// FIN-013 — approve a draft manual journal. Pure status transition; no GL
// movement yet. The companion `/post` endpoint runs the balance push.
journalRouter.post("/journal/:id/approve", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    try {
      const updated = await applyTransition<Record<string, unknown>>({
        entity: "journal_entries",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
        action: "manual_journal.approved",
        fromStates: ["draft", "pending_approval", "returned"],
        toState: "approved",
        extraWhere: `"deletedAt" IS NULL AND "sourceType" = 'manual_journal'`,
        setExtras: {
          "approvedBy": scope.userId,
          "approvedAt": new Date(),
        },
      });
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "approve", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "finance.journal.approved", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      res.json(updated);
    } catch (err) {
      const lifecycle = lifecycleErrorResponse(err);
      if (lifecycle) { res.status(lifecycle.status).json(lifecycle.body); return; }
      throw err;
    }
  } catch (err) {
    handleRouteError(err, res, "Approve manual journal error:");
  }
});

// FIN-013 — post (transition approved → posted AND push GL balances). Runs
// inside one transaction so the status change and ledger movement commit
// together; if balancesApply fails (e.g. period reclosed in the interim)
// the status reverts.
journalRouter.post("/journal/:id/post", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    try {
      const updated = await applyTransition<Record<string, unknown>>({
        entity: "journal_entries",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
        action: "manual_journal.posted",
        fromStates: ["approved"],
        toState: "posted",
        extraWhere: `"deletedAt" IS NULL AND "sourceType" = 'manual_journal'`,
        setExtras: {
          "postedBy": scope.userId,
          "postedAt": new Date(),
        },
        onApply: async (_row, client) => {
          // Push the deferred balances. Throws if the journal's period
          // has since closed — the transaction rolls back and the
          // status stays at 'approved'.
          await applyJournalEntryBalances(client, scope.companyId, id);
        },
      });
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "post", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "finance.journal.posted", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      res.json(updated);
    } catch (err) {
      const lifecycle = lifecycleErrorResponse(err);
      if (lifecycle) { res.status(lifecycle.status).json(lifecycle.body); return; }
      throw err;
    }
  } catch (err) {
    handleRouteError(err, res, "Post manual journal error:");
  }
});

journalRouter.post("/journal/:id/reverse", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    if (!Number.isFinite(id)) { throw new ValidationError("معرّف القيد غير صالح"); return; }
    const { reason, reverseDate } = zodParse(reverseJournalSchema.safeParse(req.body ?? {}));
    if (!reason || !String(reason).trim()) {
      throw new ValidationError("سبب عكس القيد مطلوب", { field: "reason", fix: "أدخل سبب عكس القيد" });
    }

    // Branch isolation (RCA BR-2): a branch-scoped user must not reverse a
    // journal entry outside their assigned branches.
    const { where: revScopeWhere, params: revScopeParams } = buildScopedWhere(
      scope, parseScopeFilters(req),
      { enforceBranchScope: true },
      2,
    );
    const { financialEngine } = await import("../lib/engines/index.js");

    // Wrap the whole flow in a single transaction with FOR UPDATE on the
    // original row so two concurrent /reverse requests can't both pass
    // the "already reversed?" check and produce two reversal entries.
    // `postJournalEntry` inside is reentrant via SAVEPOINT (#885).
    const { newJournalId, newRef, originalRef } = await withTransaction(async (client: any) => {
      const { rows: [original] } = await client.query(
        `SELECT * FROM journal_entries
         WHERE id = $1 AND ${revScopeWhere} AND "deletedAt" IS NULL
         FOR UPDATE`,
        [id, ...revScopeParams]
      );
      if (!original) throw new NotFoundError("القيد الأصلي غير موجود");
      if (original.reversedById) {
        throw new ValidationError(`هذا القيد معكوس مسبقاً بالقيد #${original.reversedById}`);
      }
      if (original.reversalOfId) {
        throw new ValidationError("لا يمكن عكس قيد هو أصلاً قيد عاكس");
      }

      // Defense in depth — even if `reversedById` was manually
      // unset on the original (legacy data, partial recovery), make
      // sure no OTHER reversal already references this id. Two
      // active reversals on the same original double-reverse the
      // chart_of_accounts deltas and corrupt the trial balance.
      const { rows: [existingReversal] } = await client.query(
        `SELECT id, ref FROM journal_entries
          WHERE "reversalOfId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL
          LIMIT 1`,
        [id, scope.companyId]
      );
      if (existingReversal) {
        throw new ValidationError(
          `هذا القيد معكوس مسبقاً بالقيد #${existingReversal.id} (${existingReversal.ref}) — لا يمكن إنشاء عكس ثانٍ`,
          { field: "id", fix: "افحص القيد العاكس القائم أو اعكسه بدلاً من إنشاء واحد جديد" }
        );
      }

      // Carry the FULL dimensional payload onto the reversal entry so
      // every drilldown (vehicle/property/contract/umrah-agent/asset/
      // activity-type) reverses cleanly. The previous SELECT pulled only
      // 4 of ~18 dim columns, so per-vehicle profitability reports
      // showed the original posting but not the reversal — silently
      // double-counting the cost. Audit-trail dims (sourceLineTable/Id,
      // activityType) propagate too so the reversal links back to the
      // same source row.
      //
      // NOTE: `branchId` on the journal_line is intentionally NOT carried
      // here because the JournalEntryLine interface in businessHelpers
      // omits it — branchId lives on the journal_entries header. PR #1304
      // adds it to the line shape; once merged, this SELECT + map can
      // grow to include "branchId" too.
      const { rows: originalLines } = await client.query(
        `SELECT "accountCode", debit, credit, description,
                "costCenter", "departmentId", "projectId", "employeeId",
                "costCenterId", "vehicleId", "propertyId",
                "unitId", "assetId", "contractId",
                "umrahSeasonId", "umrahAgentId", "activityType",
                "productId", "clientId", "vendorId", "driverId",
                "templateId", "dimensionJson",
                "sourceLineTable", "sourceLineId"
         FROM journal_lines WHERE "journalId" = $1 AND "deletedAt" IS NULL ORDER BY id ASC`,
        [id]
      );
      if (originalLines.length === 0) {
        throw new ValidationError("القيد الأصلي لا يحتوي على بنود");
      }

      const reversedLines = originalLines.map((l: Record<string, unknown>) => ({
        accountCode: l.accountCode as string,
        debit: Number(l.credit || 0),
        credit: Number(l.debit || 0),
        description: l.description as string | undefined,
        costCenter: l.costCenter as string | undefined,
        departmentId: l.departmentId as number | undefined,
        projectId: l.projectId as number | undefined,
        employeeId: l.employeeId as number | undefined,
        costCenterId: l.costCenterId as number | undefined,
        vehicleId: l.vehicleId as number | undefined,
        propertyId: l.propertyId as number | undefined,
        unitId: l.unitId as number | undefined,
        assetId: l.assetId as number | undefined,
        contractId: l.contractId as number | undefined,
        umrahSeasonId: l.umrahSeasonId as number | undefined,
        umrahAgentId: l.umrahAgentId as number | undefined,
        activityType: l.activityType as string | undefined,
        productId: l.productId as number | undefined,
        clientId: l.clientId as number | undefined,
        vendorId: l.vendorId as number | undefined,
        driverId: l.driverId as number | undefined,
        templateId: l.templateId as number | undefined,
        dimensionJson: l.dimensionJson as Record<string, unknown> | undefined,
        sourceLineTable: l.sourceLineTable as string | undefined,
        sourceLineId: l.sourceLineId as number | undefined,
      }));

      const newRef = `REV-${original.ref}`;
      const newDescription = `عكس قيد: ${original.description ?? ""} — ${reason}`.trim();

      const { journalId: newId } = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (original.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: newRef,
        description: newDescription,
        type: "reversal",
        sourceType: "journal_reversal",
        sourceId: id,
        sourceKey: `finance:reversal:${id}`,
        // Stamp the reversal on its requested date so the period-close check
        // validates the entry's true ledger date, not today. Defaults to today
        // when the caller gives no reverseDate.
        postingDate: reverseDate ? toDateISO(reverseDate) : currentDateInTz("Asia/Riyadh"),
        lines: reversedLines,
      });

      await client.query(
        `UPDATE journal_entries
           SET "reversalOfId" = $1,
               "reversalReason" = $2
         WHERE id = $3 AND "companyId" = $4`,
        [id, reason, newId, scope.companyId]
      );
      await client.query(
        `UPDATE journal_entries
           SET "reversedById" = $1,
               "reversedAt" = NOW(),
               "reversalReason" = $2,
               status = 'reversed'
         WHERE id = $3 AND "companyId" = $4`,
        [newId, reason, id, scope.companyId]
      );

      // C4 + C5 follow-up (#901) — a payment voucher reversed via
      // /journal/:id/reverse must also retire its supplier_payment_allocations
      // rows. Without this soft-delete, the vendor statement keeps counting
      // the reversed voucher as a payment against the obligation, so the
      // PO/Nusk-invoice outstanding stays artificially low and aging
      // double-counts the next legitimate payment. Soft-delete keeps the
      // row for audit while the partial index in migration 198 already
      // excludes `deletedAt IS NOT NULL` from the obligation lookup.
      await client.query(
        `UPDATE supplier_payment_allocations
            SET "deletedAt" = NOW()
          WHERE "journalEntryId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );

      // Symmetric rollback for the customer side: when reversing a
      // payment JE that was sourced from a customer invoice, decrement
      // the invoice's paidAmount + recompute its status. Without this,
      // the invoice still shows as paid/partial after the reversal —
      // AR aging + customer statements are wrong.
      //
      // The payment JE was created in finance-invoices.ts with
      // sourceType='invoice' AND type='payment'. The amount to roll
      // back is the JE's total debit (the cash side of the original
      // posting).
      if (original.sourceType === "invoice" && original.type === "payment" && original.sourceId) {
        const { rows: [paymentTotals] } = await client.query(
          `SELECT COALESCE(SUM(debit), 0)::text AS total
             FROM journal_lines
            WHERE "journalId" = $1 AND "deletedAt" IS NULL`,
          [id]
        );
        const paidDelta = Number(paymentTotals?.total ?? 0);
        if (paidDelta > 0) {
          // Decrement paidAmount but never below zero (defensive
          // floor; matches the existing GREATEST() idiom elsewhere
          // in the finance code). Re-derive status from the
          // resulting balance.
          await client.query(
            `UPDATE invoices
                SET "paidAmount" = GREATEST(COALESCE("paidAmount",0) - $1, 0),
                    status = CASE
                      WHEN GREATEST(COALESCE("paidAmount",0) - $1, 0) >= total - 0.01 THEN 'paid'
                      WHEN GREATEST(COALESCE("paidAmount",0) - $1, 0) > 0           THEN 'partial'
                      ELSE 'draft'
                    END,
                    "updatedAt" = NOW()
              WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
            [paidDelta, original.sourceId, scope.companyId]
          );
        }
      }

      return { newJournalId: newId, newRef, originalRef: original.ref as string };
    });

    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.reversed",
      entity: "journal_entries",
      entityId: id,
      reason,
      after: { newJournalId, newRef, reverseDate },
    }).catch((err) => logger.error(err, "Failed to create reversal audit log:"));

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.reversed",
      entity: "journal_entries",
      entityId: id,
      details: JSON.stringify({ reason, newJournalId, newRef }),
    }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdReversal] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [newJournalId, scope.companyId]
    );
    res.status(201).json({ ...(createdReversal || { id: newJournalId }), originalId: id, originalRef, reason });
  } catch (err) {
    handleRouteError(err, res, "Reverse journal error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// YEAR-END CLOSE WIZARD (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

async function buildYearEndClosingLines(companyId: number, year: number, retainedEarningsCode: string) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Use journal_entries.date (the accounting date) rather than
  // createdAt (the insertion timestamp). A JE backdated to 2025-12-31
  // but inserted on 2026-01-02 must still belong to 2025's year-end
  // closing. createdAt was the wrong filter — it bucketed late-inserted
  // entries into the wrong year's P&L.
  const revenues = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true AND je."reversedById" IS NULL
          AND je.date >= $2 AND je.date <= $3::date
     WHERE coa."companyId" = $1 AND coa.type = 'revenue' AND coa."deletedAt" IS NULL
     GROUP BY coa.code, coa.name
     HAVING COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) <> 0
     ORDER BY coa.code`,
    [companyId, startDate, endDate]
  );
  const expenses = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name,
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true AND je."reversedById" IS NULL
          AND je.date >= $2 AND je.date <= $3::date
     WHERE coa."companyId" = $1 AND coa.type = 'expense' AND coa."deletedAt" IS NULL
     GROUP BY coa.code, coa.name
     HAVING COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) <> 0
     ORDER BY coa.code`,
    [companyId, startDate, endDate]
  );

  const totalRevenue = revenues.reduce((s: number, r) => s + Number(r.balance), 0);
  const totalExpense = expenses.reduce((s: number, r) => s + Number(r.balance), 0);
  const netIncome = totalRevenue - totalExpense;

  const lines: { accountCode: string; debit: number; credit: number; description?: string }[] = [];
  // Zero out each revenue account — debit the revenue account
  for (const r of revenues) {
    const bal = Number(r.balance);
    const code = r.code as string;
    const name = r.name as string;
    if (bal > 0) {
      lines.push({ accountCode: code, debit: bal, credit: 0, description: `إقفال ${name}` });
    } else if (bal < 0) {
      lines.push({ accountCode: code, debit: 0, credit: -bal, description: `إقفال ${name}` });
    }
  }
  // Zero out each expense account — credit the expense account
  for (const e of expenses) {
    const bal = Number(e.balance);
    const code = e.code as string;
    const name = e.name as string;
    if (bal > 0) {
      lines.push({ accountCode: code, debit: 0, credit: bal, description: `إقفال ${name}` });
    } else if (bal < 0) {
      lines.push({ accountCode: code, debit: -bal, credit: 0, description: `إقفال ${name}` });
    }
  }
  // Balancing line — retained earnings
  if (netIncome > 0) {
    lines.push({ accountCode: retainedEarningsCode, debit: 0, credit: netIncome, description: "صافي الربح إلى الأرباح المحتجزة" });
  } else if (netIncome < 0) {
    lines.push({ accountCode: retainedEarningsCode, debit: -netIncome, credit: 0, description: "صافي الخسارة من الأرباح المحتجزة" });
  }

  return { revenues, expenses, totalRevenue, totalExpense, netIncome, lines };
}

// GAP_MATRIX item #2 — year-end close is permanent: it generates the
// closing journal and locks every period in the year. Floor at level 70
// (CFO/controller) on top of the per-feature authorize check.
journalRouter.post("/fiscal-periods/:period/year-end-close", requireMinLevel(70), authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const period = String(req.params.period);
    const dryRun = String(req.query.dryRun ?? "").toLowerCase() === "true";
    const { retainedEarningsAccountCode, force } = zodParse(yearEndCloseSchema.safeParse(req.body ?? {}));

    if (!/^\d{4}$/.test(period)) {
      throw new ValidationError("صيغة السنة غير صحيحة", { field: "period", fix: "استخدم صيغة السنة YYYY مثل 2025" });
    }
    const year = Number(period);

    // Verify retained earnings account exists
    const [reAcc] = await rawQuery<Record<string, unknown>>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, retainedEarningsAccountCode]
    );
    if (!reAcc) {
      throw new ValidationError(`حساب الأرباح المحتجزة "${retainedEarningsAccountCode}" غير موجود`, { field: "retainedEarningsAccountCode", fix: "أنشئ الحساب أولاً في شجرة الحسابات" });
    }

    // Verify all 12 periods are closed, unless force=true
    const closedPeriods = await rawQuery<Record<string, unknown>>(
      `SELECT to_char("startDate", 'YYYY-MM') AS period FROM financial_periods WHERE "companyId" = $1 AND status = 'closed' AND "deletedAt" IS NULL AND EXTRACT(YEAR FROM "startDate") = $2`,
      [scope.companyId, year]
    );
    const closedSet = new Set(closedPeriods.map((p) => p.period));
    const missing: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const p = `${year}-${String(m).padStart(2, "0")}`;
      if (!closedSet.has(p)) missing.push(p);
    }
    if (missing.length > 0 && !force && !dryRun) {
      throw new ConflictError(
        `لا يمكن إقفال السنة ${year}: توجد ${missing.length} فترة غير مُقفلة`,
        { field: "period", fix: "أقفل الفترات الشهرية أولاً أو استخدم force=true", meta: { missingPeriods: missing } }
      );
    }

    const { revenues, expenses, totalRevenue, totalExpense, netIncome, lines } =
      await buildYearEndClosingLines(scope.companyId, year, retainedEarningsAccountCode);

    if (lines.length === 0) {
      throw new ValidationError("لا توجد حسابات إيرادات أو مصروفات بأرصدة للسنة المحددة");
    }

    if (dryRun) {
      res.json({
        dryRun: true,
        year,
        retainedEarningsAccountCode,
        totalRevenue,
        totalExpense,
        netIncome,
        revenues,
        expenses,
        lines,
        missingPeriods: missing,
      });
      return;
    }

    if (force && missing.length > 0) {
      // F3 — Force-close path. Previously this block ran its own raw
      // UPDATE that bypassed the pending-JE guard, the lifecycle engine,
      // the audit log, and the event bus — so a year-end on a year with
      // unposted manual journals would silently close the periods and
      // post the YE entry without those journals. The fix: for any
      // missing period that already exists in `financial_periods`,
      // close it through `closeFiscalPeriodCanonical` (the same helper
      // /fiscal-periods-v2/:id/close uses). Periods that don't exist
      // at all are created on-the-fly already-closed (this is a backfill
      // case for historic data — by definition no journals were ever
      // posted into a period the system didn't know about, so there are
      // no pending JEs to guard).
      await withTransaction(async (client: any) => {
        for (const p of missing) {
          const startDate = `${p}-01`;
          const endDate = toDateISO(new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0));
          const { rows: [existing] } = await client.query(
            `SELECT id, status FROM financial_periods WHERE "companyId"=$1 AND to_char("startDate",'YYYY-MM')=$2 AND "deletedAt" IS NULL LIMIT 1`,
            [scope.companyId, p]
          );
          if (existing) {
            if (existing.status !== "open") continue;
            await closeFiscalPeriodCanonical({
              periodId: Number(existing.id),
              scope: {
                companyId: scope.companyId,
                branchId: scope.branchId ?? null,
                userId: scope.userId,
                activeAssignmentId: scope.activeAssignmentId,
              },
              reason: `إقفال تلقائي عبر إقفال السنة المالية ${year}`,
              client,
            });
          } else {
            await client.query(
              `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status,"closedAt","closedBy")
               VALUES ($1,$2,$3,$4,'closed',NOW(),$5)`,
              [scope.companyId, `فترة ${p}`, startDate, endDate, scope.activeAssignmentId]
            );
          }
        }
      });
    }

    const ref = `YE-${year}`;
    const [existingYE] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existingYE) throw new ConflictError(`قيد إقفال السنة ${year} موجود مسبقاً`);
    const description = `قيد إقفال السنة المالية ${year} — صافي الدخل ${netIncome.toFixed(2)}`;
    const { financialEngine } = await import("../lib/engines/index.js");
    // Year-end closing entry: accounting practice dictates the entry is
    // dated 12/31 of the year being closed (not today). By the time this
    // endpoint runs all 12 monthly periods of that year are closed (the
    // route validates this above), so the period gate would otherwise
    // reject the post — `skipPeriodCheck: true` is the sanctioned escape
    // hatch for type='closing' specifically (financialEngine enforces the
    // type guard so the flag can't be used as a generic bypass).
    const { journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description,
      type: "closing",
      sourceType: "year_end_close",
      sourceId: 0,
      sourceKey: `finance:year_end:${scope.companyId}:${year}`,
      lines,
      postingDate: `${year}-12-31`,
      skipPeriodCheck: true,
    });

    // Mark all fiscal periods for the year as yearEndClosed = true
    await rawExecute(
      `UPDATE financial_periods
         SET "yearEndClosed" = TRUE,
             "yearEndClosedAt" = NOW(),
             "yearEndClosingJournalId" = $1
       WHERE "companyId" = $2 AND EXTRACT(YEAR FROM "startDate") = $3
         AND "deletedAt" IS NULL`,
      [journalId, scope.companyId, year]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fiscal.year_end_closed",
      entity: "financial_periods",
      entityId: journalId,
      details: JSON.stringify({ year, netIncome, totalRevenue, totalExpense, journalId, ref }),
    }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdYearEnd] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdYearEnd || { id: journalId }), year, netIncome, totalRevenue, totalExpense, retainedEarningsAccountCode });
  } catch (err) {
    handleRouteError(err, res, "Year-end close error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OPENING BALANCES (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

journalRouter.get("/opening-balances", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { periodStart } = req.query as { periodStart?: string };
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, {
      companyColumn: 'je."companyId"',
      branchColumn: 'je."branchId"',
      enforceBranchScope: true,
      includeNullBranch: true,
    });

    let extraWhere = " AND je.ref LIKE 'OB-%' AND je.\"deletedAt\" IS NULL";
    if (periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      params.push(`OB-${periodStart}`);
      extraWhere += ` AND je.ref = $${params.length}`;
    }

    const entries = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je."createdAt", je.status,
              je."branchId", je."companyId",
              COALESCE(SUM(jl.debit), 0) AS "totalDebit",
              COALESCE(SUM(jl.credit), 0) AS "totalCredit",
              json_agg(json_build_object(
                'accountCode', jl."accountCode",
                'accountName', coa.name,
                'debit', jl.debit,
                'credit', jl.credit
              ) ORDER BY jl.id) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId" AND coa."deletedAt" IS NULL
       WHERE ${where}${extraWhere}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je."branchId", je."companyId"
       ORDER BY je."createdAt" DESC`,
      params
    );
    res.json(maskFields(req, { data: entries, total: entries.length }));
  } catch (err) {
    handleRouteError(err, res, "Get opening balances error:");
  }
});

async function createOpeningBalanceEntry(params: {
  scope: any;
  periodStart: string;
  lines: { accountCode: string; debit: number; credit: number }[];
  force?: boolean;
}): Promise<{ id: number; ref: string; description: string } | { error: string; status: number; details?: any }> {
  const { scope, periodStart, lines, force } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return { error: "تاريخ بداية الفترة غير صحيح، استخدم صيغة YYYY-MM-DD", status: 400 };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "يجب إدخال بنود الأرصدة الافتتاحية", status: 400 };
  }
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return { error: `الأرصدة الافتتاحية غير متوازنة: مدين=${totalDebit.toFixed(2)} ≠ دائن=${totalCredit.toFixed(2)}`, status: 400 };
  }

  const ref = `OB-${periodStart}`;
  if (!force) {
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existing) {
      return { error: `يوجد قيد أرصدة افتتاحية مسبقاً لهذه الفترة (#${existing.id})`, status: 409, details: { existingId: existing.id } };
    }
  }

  // Validate accounts exist
  const codes = Array.from(new Set(lines.map((l) => String(l.accountCode).trim()).filter(Boolean)));
  const accRows = await rawQuery<Record<string, unknown>>(
    `SELECT code FROM chart_of_accounts WHERE "companyId" = $1 AND code = ANY($2) AND "deletedAt" IS NULL`,
    [scope.companyId, codes]
  );
  const known = new Set(accRows.map((a) => a.code));
  const missing = codes.filter((c) => !known.has(c));
  if (missing.length > 0) {
    return { error: `الحسابات التالية غير موجودة: ${missing.join(", ")}`, status: 400 };
  }

  const description = `أرصدة افتتاحية ${periodStart}`;
  const { financialEngine } = await import("../lib/engines/index.js");
  // #1715 correctness review (L2) — the force-replacement reversal + soft-delete
  // and the replacement post must be ONE transaction. Pre-fix they ran in
  // sequence outside any txn, so if the post threw (e.g. a closed period) the
  // prior OB was already reversed + soft-deleted with NO replacement. Wrapping
  // them rolls the deletion back on failure. reverseAccountBalances is txn-aware
  // (same pattern as the /expenses/:id + /vouchers/:id delete routes), and
  // postJournalEntry's internal transaction joins this one reentrantly.
  let journalId!: number;
  await withTransaction(async () => {
    // Soft-delete + reverse prior OB if force (A2: without the reverse the
    // replacement OB would double-count the opening balance on currentBalance).
    if (force) {
      const priorObs = await rawQuery<{ id: number }>(
        `UPDATE journal_entries SET "deletedAt" = NOW()
         WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL
         RETURNING id`,
        [scope.companyId, ref]
      );
      for (const prior of priorObs) {
        await reverseAccountBalances(scope.companyId, prior.id);
      }
    }

    ({ journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description,
      type: "opening_balance",
      sourceType: "opening_balance",
      sourceId: 0,
      sourceKey: `finance:opening_balance:${scope.companyId}:${periodStart}`,
      lines: lines.map((l) => ({
        accountCode: String(l.accountCode),
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
      })),
    }));
  });

  return { id: journalId, ref, description };
}

journalRouter.post("/opening-balances", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { periodStart, lines, force } = zodParse(openingBalancesSchema.safeParse(req.body ?? {}));
    const result = await createOpeningBalanceEntry({ scope, periodStart: periodStart ?? "", lines: (lines ?? []) as { accountCode: string; debit: number; credit: number }[], force: !!force });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, ...(result.details ?? {}) });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "Create opening balances error:");
  }
});

journalRouter.post("/opening-balances/import-csv", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { periodStart, csv, force } = zodParse(openingBalancesImportCsvSchema.safeParse(req.body ?? {}));
    if (!csv || typeof csv !== "string") {
      throw new ValidationError("محتوى CSV مطلوب");
    }
    const rawLines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (rawLines.length === 0) {
      throw new ValidationError("ملف CSV فارغ");
    }
    // Detect header
    const startIdx = /account/i.test(rawLines[0]) ? 1 : 0;
    const parsed: { accountCode: string; debit: number; credit: number }[] = [];
    for (let i = startIdx; i < rawLines.length; i++) {
      const parts = rawLines[i].split(",").map((p) => p.trim());
      if (parts.length < 3) {
        throw new ValidationError(`سطر CSV غير صالح (${i + 1}): يتطلب 3 أعمدة accountCode,debit,credit`);
      }
      const [code, d, c] = parts;
      const debit = Number(d || 0);
      const credit = Number(c || 0);
      if (!code || (Number.isNaN(debit) && Number.isNaN(credit))) {
        throw new ValidationError(`سطر CSV غير صالح (${i + 1})`);
      }
      parsed.push({ accountCode: code, debit: Number.isNaN(debit) ? 0 : debit, credit: Number.isNaN(credit) ? 0 : credit });
    }
    const result = await createOpeningBalanceEntry({ scope, periodStart: periodStart ?? "", lines: parsed, force: !!force });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, ...(result.details ?? {}) });
      return;
    }
    res.status(201).json({ ...result, linesCount: parsed.length });
  } catch (err) {
    handleRouteError(err, res, "Import opening balances CSV error:");
  }
});
