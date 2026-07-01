import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireOwnership } from "../middlewares/contextualRbac.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { checkAccess } from "../lib/rbac/authzEngine.js";
import type { JournalEntryLine } from "../lib/businessHelpers.js";
import { issueNumber } from "../lib/numberingService.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  checkFinancialPeriodOpen,
  reverseAccountBalances,
  computeVat,
  extractBaseFromGross,
  getCompanyVatRate,
  roundTo2,
  todayISO,
  currentPeriod,
  currentYear,
  toDateISO,
  currentMonthPadded,
  currentDateInTz,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { markIdempotencyReplay, requestIdempotencyToken } from "../lib/requestIdempotency.js";
import { resolveTransactionBranch, assertDocumentBranchAccess } from "../lib/branchResolution.js";
import { resolveBadDebtPolicy, STANDARD_BAD_DEBT_RATES, BAD_DEBT_POLICY_SETTING_KEY } from "../lib/badDebtPolicy.js";
import { postBadDebtProvision, readAllowanceBalance } from "../lib/finance/badDebtProvision.js";
import { postBadDebtWriteOff } from "../lib/finance/badDebtWriteOff.js";
import { resolveSettings, upsertSetting } from "../lib/settings.js";
import { resolveVatLegAccount, buildVatLeg } from "../lib/vatLeg.js";
import { z } from "zod";

// ── Zod schemas for POST route validation ──────────────────────────────────
const createInvoiceSchema = z.object({
  clientId: z.coerce.number({ required_error: "العميل مطلوب" }),
  // Per-line dimensional fields land on invoice_lines (migration 200) and
  // flow through to journal_lines on /approve so reports can compute
  // per-vehicle / per-property / per-project / per-season profitability.
  // All optional — a line with only description+quantity+unitPrice
  // still works exactly as today, falling back to the company-level
  // generic revenue account on approval.
  lines: z.array(z.object({
    description: z.string().max(2000, "الوصف طويل جدًا").optional(),
    quantity: z.coerce.number().optional(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    accountCode: z.string().optional(),
    accountId: z.coerce.number().optional(),
    costCenterId: z.coerce.number().optional(),
    activityType: z.string().optional(),
    projectId: z.coerce.number().optional(),
    vehicleId: z.coerce.number().optional(),
    propertyId: z.coerce.number().optional(),
    unitId: z.coerce.number().optional(),
    assetId: z.coerce.number().optional(),
    employeeId: z.coerce.number().optional(),
    driverId: z.coerce.number().optional(),
    contractId: z.coerce.number().optional(),
    umrahSeasonId: z.coerce.number().optional(),
    umrahAgentId: z.coerce.number().optional(),
    productId: z.coerce.number().optional(),
    taxCode: z.string().optional(),
    // When true, `unitPrice` (and `total` if given) are gross of VAT
    // and the helper extracts net + tax. When false (or omitted), the
    // values are net and tax is added on top. Default inherits from
    // the invoice header's `taxInclusive` flag (set on the outer
    // schema below). This is the Daftra-style flow.
    taxInclusive: z.boolean().optional(),
    allocationRuleId: z.coerce.number().optional(),
    dimensionJson: z.record(z.any()).optional(),
    manualOverrideReason: z.string().optional(),
    total: z.coerce.number().optional(),
  })).min(1, "يجب إضافة بند واحد على الأقل").max(500, "عدد بنود الفاتورة يتجاوز الحدّ المسموح (500)").optional(),
  // `vatRate` retained for backwards compatibility — old API callers
  // that don't know about tax_codes can still pass a literal rate.
  // New flow: pick a `taxCode` (header default) and the line math is
  // driven by tax_codes.rate. taxInclusive declares whether the entered
  // amount is gross or net.
  vatRate: z.coerce.number().nonnegative().max(100, "نسبة الضريبة يجب ألا تتجاوز 100").optional(),
  taxCode: z.string().optional(),
  taxInclusive: z.boolean().optional(),
  dueDate: z.string().optional(),
  date: z.string().optional(),
  description: z.string().max(1000).optional(),
  subtotal: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  notes: z.string().max(2000, "الملاحظات طويلة جدًا").optional(),
  paymentTermsDays: z.coerce.number().optional(),
  branchId: z.coerce.number().optional(),
  companyId: z.coerce.number().optional(),
  isTaxLinked: z.boolean().optional(),
  invoiceTypeCode: z.string().optional(),
  taxCategoryCode: z.string().optional(),
  exemptionReason: z.string().optional(),
  costCenter: z.string().optional(),
  // Header-level discount — choose ONE of:
  //   discountAmount: flat reduction off subtotal
  //   discountPercent: percentage of subtotal
  // Mutually exclusive; both → 422. Discount applies BEFORE VAT
  // (the standard Saudi ZATCA invoice flow). The result lands on
  // invoices.discountAmount / invoices.discountPercent (schema
  // columns since invoices_pre.sql line 22-23).
  discountAmount: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});

const createPaymentSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.string().optional(),
});

const createCreditMemoSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  reason: z.string().min(1, "السبب مطلوب").max(2000, "النص طويل جدًا"),
  vatIncluded: z.boolean().optional(),
  memoDate: z.string().optional(),
  // شريحة 4 — ربط اختياري بمرشّح خصم نقل: عند الإصدار تُطلق المالية حدثًا
  // يربط المرشّح بالإشعار في مسار النقل (لا تكتب المالية جدول النقل).
  deductionCandidateId: z.coerce.number().int().positive().optional(),
});

// Preview-time schema — same shape, but `reason` is optional since the
// operator may not have settled on a justification yet when previewing.
const previewCreditMemoSchema = createCreditMemoSchema.omit({ reason: true }).extend({
  reason: z.string().max(2000, "النص طويل جدًا").optional(),
});

// ZATCA invoice amendment — the only legal way to "edit" an approved
// (issued) tax invoice in Saudi Arabia. Wraps three operations atomically:
//   1. Credit memo against the original for the full amount.
//   2. New invoice with a fresh sequential ref + the operator's overrides.
//   3. Bidirectional link via amendedFromInvoiceId / amendedToInvoiceId.
//
// Body shape mirrors the create-invoice schema (so the frontend can
// pre-populate the form from the original), but every field is optional
// — omitted fields fall back to the original invoice's value. `reason`
// is mandatory because ZATCA filings include it on the chain.
const amendInvoiceSchema = z.object({
  reason: z.string().min(1, "سبب التعديل مطلوب").max(2000, "النص طويل جدًا"),
  // Optional overrides — when set, the new invoice carries this value;
  // when omitted, the value carries over from the original. Same shape
  // as createInvoiceSchema so the orchestrator can spread it through.
  clientId: z.coerce.number().optional(),
  lines: createInvoiceSchema.shape.lines.optional(),
  dueDate: z.string().optional(),
  date: z.string().optional(),
  description: z.string().max(1000).optional(),
  notes: z.string().max(2000, "الملاحظات طويلة جدًا").optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxCode: z.string().optional(),
  taxInclusive: z.boolean().optional(),
});

const createCustomerAdvanceSchema = z.object({
  clientId: z.coerce.number({ required_error: "العميل مطلوب" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().max(2000, "الملاحظات طويلة جدًا").optional(),
  receivedDate: z.string().optional(),
  // Operator's explicit branch pick. Required for multi-branch users;
  // single-branch users auto-resolve via the resolver. The advance JE
  // lands on this branch instead of the operator's working branch.
  branchId: z.coerce.number().optional(),
  // #1715 §6 — optional operation context (project / cost-center / …). The
  // dims ride on the cash (DR) line so the advance shows up in those reports.
  lineAllocation: z.record(z.string(), z.any()).optional(),
});

// #1945 FIN-03 — customer receipt wizard. GL accounts are NOT accepted from
// the client; the service resolves them through the accounting engine.
const createCustomerReceiptSchema = z.object({
  clientId: z.coerce.number({ required_error: "العميل مطلوب" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.enum(["cash", "bank", "transfer", "check", "bank_transfer"]).default("bank"),
  // Caller-stable idempotency key (UUID generated once per wizard session) —
  // a network retry must not double-apply the invoice payments.
  receiptKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "receiptKey غير صالح"),
  date: z.string().optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  applications: z.array(z.object({
    invoiceId: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive(),
  })).max(200).default([]),
  branchId: z.coerce.number().optional(),
  lineAllocation: z.record(z.string(), z.any()).optional(),
  // #2698 — خزنة/بنك الإيداع صراحةً (يتجاوز الحلّ الآلي بالطريقة في سند القبض).
  cashAccountCode: z.string().max(40).optional(),
});

const impactPreviewSchema = z.object({
  clientId: z.coerce.number().optional(),
  lines: z.array(z.any()).optional(),
  taxRate: z.coerce.number().nonnegative().max(100, "نسبة الضريبة يجب ألا تتجاوز 100").optional(),
  // البند ٤ — رمز ضريبة رأس الفاتورة (اختياري) كي تعكس المعاينة حساب الرمز
  // الفعلي الذي سيرحّل عند الاعتماد، لا الحساب العام فقط.
  taxCode: z.string().trim().min(1).optional(),
  dueInDays: z.coerce.number().optional(),
});

const patchInvoiceSchema = z.object({
  status: z.enum(["draft", "pending_approval", "approved", "sent", "partial", "partially_paid", "paid", "overdue", "void", "rejected", "cancelled", "returned", "delivered", "ordered", "posted", "closed", "invoiced"]).optional(),
  description: z.string().max(2000, "الوصف طويل جدًا").optional(),
  dueDate: z.string().optional(),
});

const createDebitMemoSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب ويجب أن يكون أكبر من صفر"),
  reason: z.string().min(1, "سبب الإشعار المدين مطلوب").max(2000, "النص طويل جدًا"),
  vatIncluded: z.boolean().optional(),
  memoDate: z.string().optional(),
});

// Preview-time schema — same shape, but `reason` is optional since the
// operator may not have settled on a justification yet when previewing.
const previewDebitMemoSchema = createDebitMemoSchema.omit({ reason: true }).extend({
  reason: z.string().max(2000, "النص طويل جدًا").optional(),
});

const badDebtPostSchema = z.object({
  period: z.string().optional(),
  asOf: z.string().optional(),
  rates: z.object({
    current: z.coerce.number().optional(),
    d30: z.coerce.number().optional(),
    d60: z.coerce.number().optional(),
    d90: z.coerce.number().optional(),
    d90plus: z.coerce.number().optional(),
  }).optional(),
  notes: z.string().max(2000, "الملاحظات طويلة جدًا").optional(),
});

const applyAdvanceSchema = z.object({
  invoiceId: z.coerce.number({ required_error: "الفاتورة مطلوبة" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
});

const invoiceApprovalActionSchema = z.object({
  notes: z.string().max(2000, "الملاحظات طويلة جدًا").optional(),
});

const dunningSendSchema = z.object({
  invoiceIds: z.array(z.coerce.number()).min(1, "invoiceIds مطلوبة (قائمة معرفات الفواتير)"),
  sentVia: z.string().optional(),
});

// ── عقد المالية: إنشاء فاتورة خدمة مسوّدة + سطورها ─────────────────────────
// المالية تملك جدولَي `invoices` و`invoice_lines`. المسارات الخادمة (النقل…)
// التي تُسعّر بنودها وتحتاج إصدار فاتورة لا تكتب الجدولين مباشرةً — تستدعي هذا
// العقد عبر import ديناميكي **ضمن معاملتها** (rawExecute ينضمّ لـtxStore الذي
// يربطه withTransaction، فيبقى الإدراج ذرّيًا مع كتابات المسار الخادم).
//
// العقد يُرسّخ ثوابت الفاتورة المسوّدة المملوكة للمالية (لا يقرّرها المستدعي):
// status='draft' وpaidAmount=0 — كل فاتورة تنشأ مسوّدة ثم يعتمدها المحاسب
// فيُرحّل القيد عبر مسار الاعتماد القياسي (لا قيد محاسبي هنا). وقيم فاتورة
// المبيعات القياسية (ZATCA): isTaxLinked=true، invoiceTypeCode='388' (فاتورة
// ضريبية)، taxCategoryCode='S' (نسبة قياسية)، taxInclusive=false، بلا خصم.
//
// المستدعي يبقى مالكًا لكل ما عداه: الترقيم، تحليل الحسابات/الضريبة، مراكز
// التكلفة، جداوله الخادمة (روابط/حالة فوترة). يستقبل invoiceId + معرّفات
// السطور بالترتيب نفسه ليكمل ربطه.
export interface ServiceInvoiceLineInput {
  description: string;
  quantity: string;
  unitPrice: string | null;
  lineTotal: number;
  vatAmount: number;
  lineGross: number;
  accountCode: string;
  costCenterId: number | null;
  vehicleId: number | null;
  driverId: number | null;
  taxCode: string | null;
}

export async function createServiceInvoiceWithLines(params: {
  companyId: number;
  branchId: number | null;
  clientId: number;
  ref: string;
  description: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  dueDate: string | null;
  createdBy: number;
  notes: string | null;
  taxCode: string | null;
  lines: ServiceInvoiceLineInput[];
}): Promise<{ invoiceId: number; lineIds: number[] }> {
  const inv = await rawExecute(
    `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
            subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,
            "isTaxLinked","invoiceTypeCode","taxCategoryCode","exemptionReason","costCenter",
            "taxCode","taxInclusive","discountAmount","discountPercent")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,
            true,'388','S',NULL,NULL,$13,false,0,0)
     RETURNING id`,
    [
      params.companyId, params.branchId ?? null, params.clientId, params.ref, params.description,
      params.subtotal, params.vatRate, params.vatAmount, params.total, params.dueDate ?? null,
      params.createdBy, params.notes ?? null, params.taxCode ?? null,
    ],
  );
  const invoiceId = assertInsert(inv.insertId, "invoices");

  const lineIds: number[] = [];
  for (const l of params.lines) {
    const lineRes = await rawExecute(
      `INSERT INTO invoice_lines (
         "invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross",
         "accountId","accountCode","costCenterId","activityType",
         "projectId","vehicleId","propertyId","unitId","assetId",
         "employeeId","driverId","contractId","umrahSeasonId","umrahAgentId",
         "productId","taxCode","taxInclusive","allocationRuleId","allocationStatus",
         "dimensionJson","manualOverrideReason"
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,NULL,
               NULL,$10,NULL,NULL,NULL,NULL,$11,NULL,NULL,NULL,
               NULL,$12,false,NULL,'resolved',NULL,NULL)
       RETURNING id`,
      [
        invoiceId, l.description, l.quantity, l.unitPrice, l.lineTotal, l.vatAmount, l.lineGross,
        l.accountCode, l.costCenterId, l.vehicleId, l.driverId, l.taxCode,
      ],
    );
    lineIds.push(assertInsert(lineRes.insertId, "invoice_lines"));
  }

  return { invoiceId, lineIds };
}

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware);



// ─────────────────────────────────────────────────────────────────────────────
// INVOICE STATE MACHINE — Phase C.7 Finance audit
// ─────────────────────────────────────────────────────────────────────────────
const INVOICE_STATUSES = [
  "draft", "approved", "rejected", "returned", "sent", "partial", "paid",
  "overdue", "cancelled", "closed", "posted",
] as const;
const INVOICE_TRANSITIONS: Record<string, readonly string[]> = {
  // Creation → /send to go to `sent`. /payment moves sent → partial → paid.
  // Approval gate moves draft ↔ approved / rejected / returned.
  draft:     ["approved", "rejected", "returned", "sent", "cancelled"],
  approved:  ["sent", "cancelled", "rejected"],
  returned:  ["draft", "approved", "cancelled"],
  rejected:  ["draft", "cancelled"],
  sent:      ["partial", "paid", "overdue", "cancelled"],
  partial:   ["paid", "overdue", "cancelled"],
  overdue:   ["partial", "paid", "cancelled"],
  paid:      ["closed"],   // paid is terminal for payments; /close moves to closed
  closed:    [],
  cancelled: [],
  posted:    [],
};

// Impact preview — lets the create form show exactly what will happen
invoicesRouter.post("/invoices/impact-preview", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(impactPreviewSchema.safeParse(req.body ?? {}));
    // as-any-reason: justified-pragmatic - destructuring on zodParse inferred type whose property names are not directly indexable at the call site
    const raw = b as any;
    const clientId = raw.clientId;
    const lines = raw.lines ?? [];
    const dueInDays = raw.dueInDays ?? 30;
    const taxRate = raw.taxRate ?? await getCompanyVatRate(scope.companyId);

    let clientName = "";
    if (clientId) {
      const [client] = await rawQuery<Record<string, unknown>>(
        `SELECT name, "isBlacklisted" FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(clientId), scope.companyId]
      );
      clientName = (client?.name as string | undefined) || "";
      // Spec ملف 03 §تحصيل 6 مراحل (يوم 30): when the daily overdue cron
      // blacklists a client, this MUST actually block new invoices —
      // otherwise the GM-escalation email lies. Codex review on PR #3012.
      // Override is available via PATCH /clients/:id (admin) which lifts
      // the flag once the GM decides to accept the risk or the client pays.
      if (client?.isBlacklisted === true) {
        throw new ForbiddenError(
          `العميل ${clientName || `#${clientId}`} محظور بسبب فواتير متأخرة. لا يمكن إصدار فاتورة جديدة قبل تحصيل المستحقات أو رفع الحظر من قِبَل المدير العام.`,
          { field: "clientId", fix: "حصّل المستحقات المتأخرة أو اطلب من المدير العام رفع الحظر من ملف العميل." }
        );
      }
    }

    const subtotal = (Array.isArray(lines) ? lines : []).reduce((sum: number, l: any) => {
      const qty = Number(l?.quantity || 0);
      const price = Number(l?.unitPrice || 0);
      return sum + qty * price;
    }, 0);
    const tax = subtotal * (Number(taxRate) / 100);
    const total = subtotal + tax;

    // #1945 (S7) — resolve the SAME accounts the posting uses (invoice_ar /
    // invoice_revenue / invoice_vat_payable) so the preview shows the real
    // resolved codes («التوجيه المحاسبي المتوقّع»), not just generic names.
    // Read-only: this never pre-fills the line override; the server still
    // resolves the account at save.
    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [arAccountCode, revenueAccountCode, vatFallback, vatSpecific] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4111"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2131"),
      // البند ٤ — حساب رمز الضريبة إن أُرسل في المعاينة، وإلا الاحتياطي العام.
      raw.taxCode
        ? getOutputVatAccountCode(scope.companyId, raw.taxCode as string)
        : Promise.resolve(null),
    ]);
    const vatAccountCode = resolveVatLegAccount(vatSpecific, vatFallback);

    const items: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [];

    items.push({
      category: "مالي",
      label: "المبلغ الإجمالي",
      value: `${total.toLocaleString("ar-SA")} ر.س (${subtotal.toLocaleString("ar-SA")} + ضريبة ${tax.toLocaleString("ar-SA")})`,
      severity: "info",
    });

    items.push({
      category: "محاسبي",
      label: "قيد يومية",
      value: `قيد جديد: مدين ذمم العملاء (${arAccountCode}) ${total.toLocaleString("ar-SA")} / دائن إيرادات (${revenueAccountCode}) ${subtotal.toLocaleString("ar-SA")}${tax > 0 ? ` + ض.م.م مخرجة (${vatAccountCode}) ${tax.toLocaleString("ar-SA")}` : ""}`,
      severity: "info",
    });

    if (clientName) {
      const [[openInvoices]] = await Promise.all([
        rawQuery<Record<string, unknown>>(
          `SELECT COUNT(*)::int AS c, COALESCE(SUM(total - COALESCE("paidAmount",0)),0)::numeric AS outstanding
           FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND status NOT IN ('paid','cancelled') AND "deletedAt" IS NULL`,
          [Number(clientId), scope.companyId]
        ),
      ]);
      const outstanding = Number(openInvoices?.outstanding || 0);
      if (outstanding > 0) {
        items.push({
          category: "ذمم العميل",
          label: `${clientName} — فواتير مفتوحة`,
          value: `${openInvoices.c} فاتورة بمبلغ ${outstanding.toLocaleString("ar-SA")} ر.س قبل هذه الفاتورة`,
          severity: outstanding > total * 3 ? "warning" : "info",
        });
      }
    }

    if (dueInDays) {
      items.push({
        category: "التزامات",
        label: "موعد الاستحقاق",
        value: `سيتم تسجيل التزام مطالبة خلال ${dueInDays} يوم من تاريخ الإصدار`,
        severity: "info",
      });
    }

    items.push({
      category: "تقارير",
      label: "الميزانية والتقارير",
      value: "سيتم تحديث تقارير الإيرادات، ضريبة القيمة المضافة، وذمم العملاء",
      severity: "info",
    });

    const hasWarning = items.some((i) => i.severity === "warning");
    res.json({
      actionType: "create_invoice",
      employeeId: 0,
      employeeName: clientName,
      items,
      // #1945 (S7) — the resolved revenue/AR/VAT accounts, surfaced for
      // transparency (read-only; the form does not pre-fill any picker).
      revenueAccountCode,
      arAccountCode,
      vatAccountCode,
      summary: hasWarning
        ? `فاتورة بمبلغ ${total.toLocaleString("ar-SA")} ر.س — راجع رصيد العميل قبل الإصدار`
        : `فاتورة بمبلغ ${total.toLocaleString("ar-SA")} ر.س جاهزة للإصدار`,
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في معاينة أثر الفاتورة");
  }
});

invoicesRouter.get("/invoices", authorize({ feature: "finance.invoices", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status = "", page = "1", limit: lim = "20" } = req.query as Record<string, string | undefined>;
    const safeLim = Math.min(Number(lim) || 50, 500);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLim;

    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'i."companyId"',
      branchColumn: 'i."branchId"',
      enforceBranchScope: true,
      includeNullBranch: true,
      softDeleteColumn: 'i."deletedAt"',
    });

    let paramIdx = nextParamIndex;
    let where = baseWhere;
    if (status) {
      where += ` AND i.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    params.push(safeLim);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i.ref, i.status, i."createdAt" AS "issueDate", i."dueDate",
              i.total, i."paidAmount", i."vatAmount", i.subtotal, i."vatRate",
              i."clientId", i.description, i."paymentTerms", i.notes,
              i."isTaxLinked", i."zatcaStatus",
              c.name AS "clientName",
              e_cre.name AS "createdByName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea_cre ON ea_cre.id = i."createdBy"
       LEFT JOIN employees e_cre ON e_cre.id = ea_cre."employeeId" AND e_cre."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY i."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total FROM invoices i WHERE ${where}`,
      countParams
    );

    res.json({ data: invoices, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "List invoices error:");
  }
});

invoicesRouter.post("/invoices", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const parsed = zodParse(createInvoiceSchema.safeParse(req.body));
    const {
      clientId, description, subtotal, total: rawTotal, lines: lineItems,
      vatRate: rawVatRate, taxCode: headerTaxCode, taxInclusive: headerTaxInclusive,
      dueDate, date: invoiceBodyDate, paymentTermsDays, branchId, companyId: bodyCompanyId, notes,
      isTaxLinked, invoiceTypeCode, taxCategoryCode, exemptionReason,
      discountAmount: rawDiscountAmount, discountPercent: rawDiscountPercent,
      // as-any-reason: justified-pragmatic - destructuring on zodParse inferred type whose property names are not directly indexable at the call site
    } = parsed as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    // Tax-code-driven flow (preferred):
    //   - The body declares a header `taxCode` (e.g. "VAT15"). Lines may
    //     override per-line.
    //   - `taxInclusive` says whether the input amounts are gross or net.
    //   - tax_codes.rate is the source of truth — no scattered `15`
    //     literals.
    // Backwards-compat: when no taxCode is provided, fall back to the
    // legacy `vatRate` numeric the route used to expect.
    const { computeTaxFromTaxCode, splitFromRate, getDefaultTaxCode } = await import("../lib/taxCodes.js");
    let defaultTaxCode = headerTaxCode as string | undefined;
    let defaultTaxInclusive: boolean = headerTaxInclusive ?? false;
    if (!defaultTaxCode && rawVatRate == null) {
      // No explicit choice — auto-pick the tenant's standard code.
      const def = await getDefaultTaxCode(effectiveCompanyId);
      if (def) {
        defaultTaxCode = def.code;
        defaultTaxInclusive = def.isInclusiveDefault;
      }
    }
    const vatRate = rawVatRate ?? await getCompanyVatRate(effectiveCompanyId);

    if (!clientId) {
      throw new ValidationError("العميل مطلوب لإنشاء الفاتورة", { field: "clientId", fix: "حدد العميل الذي ستُصدر له الفاتورة" });
    }
    // Owner / GM bypasses the resolver: they have global access and can
    // post to any branch (the resolver throws BranchRequired for users
    // with allowedBranches.length > 1, which is the right behaviour for
    // managers but wrong for owners on the global scope).
    let resolvedBranchId: number;
    if (scope.isOwner || OWNER_GM_ROLES.includes(scope.role)) {
      resolvedBranchId = (branchId ?? scope.branchId) as number;
      if (!resolvedBranchId) {
        throw new ValidationError("الفرع مطلوب لإنشاء الفاتورة", { field: "branchId", fix: "حدد الفرع الذي تنتمي إليه الفاتورة" });
      }
    } else {
      // Multi-branch user without an explicit branchId in the payload
      // gets a typed BranchRequired error → frontend renders a branch
      // picker. Single-branch user auto-resolves silently.
      const r = resolveTransactionBranch({
        scope: { companyId: effectiveCompanyId, branchId: scope.branchId, allowedBranches: scope.allowedBranches },
        bodyBranchId: branchId,
      });
      resolvedBranchId = r.branchId;
    }
    // Validate the resolved branch actually belongs to the effective
    // company (cross-tenant guard) and is active.
    const [branchRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM branches WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [resolvedBranchId, effectiveCompanyId]
    );
    if (!branchRow) {
      throw new ValidationError("الفرع غير موجود أو لا ينتمي لهذه الشركة", { field: "branchId" });
    }
    // FK pre-check on clientId so the frontend can light up the input.
    const [clientRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [clientId, effectiveCompanyId]
    );
    if (!clientRow) {
      throw new ValidationError("العميل غير موجود", { field: "clientId", fix: "اختر عميلاً مسجلاً في النظام" });
    }
    if (isTaxLinked) {
      const validInvoiceTypes = ["388", "381", "383"];
      const validTaxCategories = ["S", "Z", "E", "O"];
      if (invoiceTypeCode && !validInvoiceTypes.includes(invoiceTypeCode)) {
        throw new ValidationError(
          "نوع الفاتورة غير صالح",
          { field: "invoiceTypeCode", fix: `القيم المسموحة: ${validInvoiceTypes.join(", ")}` }
        );
      }
      if (taxCategoryCode && !validTaxCategories.includes(taxCategoryCode)) {
        throw new ValidationError(
          "فئة الضريبة غير صالحة",
          { field: "taxCategoryCode", fix: `القيم المسموحة: ${validTaxCategories.join(", ")}` }
        );
      }
    }
    const parsedTerms = paymentTermsDays != null && paymentTermsDays !== "" ? Number(paymentTermsDays) : null;
    if (parsedTerms == null && !dueDate) {
      throw new ValidationError("شروط الدفع أو تاريخ الاستحقاق مطلوبة", { field: "paymentTermsDays", fix: "حدد شروط الدفع (عدد الأيام) أو تاريخ الاستحقاق" });
    }
    if (parsedTerms != null && (Number.isNaN(parsedTerms) || parsedTerms < 0)) {
      throw new ValidationError("شروط الدفع غير صالحة", { field: "paymentTermsDays", fix: "أدخل عدد أيام صحيح (0 أو أكثر)" });
    }

    let baseAmount = 0;
    // ValidatedLine now carries the per-line dimensional allocation
    // fields from createInvoiceSchema (migration 200). All optional —
    // when a line has no `accountCode`, allocationStatus stays
    // "unmapped" and the approval flow falls back to the company-level
    // generic revenue account for that line (preserves the original
    // header-level posting behaviour for legacy callers).
    type ValidatedLine = {
      description: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      vatAmount: number;
      lineGross: number;
      accountId: number | null;
      accountCode: string | null;
      costCenterId: number | null;
      activityType: string | null;
      projectId: number | null;
      vehicleId: number | null;
      propertyId: number | null;
      unitId: number | null;
      assetId: number | null;
      employeeId: number | null;
      driverId: number | null;
      contractId: number | null;
      umrahSeasonId: number | null;
      umrahAgentId: number | null;
      productId: number | null;
      taxCode: string | null;
      taxInclusive: boolean;
      allocationRuleId: number | null;
      allocationStatus: string;
      dimensionJson: Record<string, unknown> | null;
      manualOverrideReason: string | null;
    };
    let validatedLines: ValidatedLine[] = [];

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      for (const line of lineItems) {
        if (!line.unitPrice || line.unitPrice <= 0) {
          throw new ValidationError("سعر الوحدة يجب أن يكون أكبر من صفر", { field: "lines.unitPrice", fix: "أدخل سعراً موجباً لكل بند" });
        }
        if (!line.quantity || line.quantity <= 0) {
          throw new ValidationError("الكمية يجب أن تكون أكبر من صفر", { field: "lines.quantity", fix: "أدخل كمية موجبة لكل بند" });
        }
        const rawLineAmount = roundTo2(Number(line.quantity) * Number(line.unitPrice));

        // Tax math — three flows in priority order:
        //
        //   1. Line declares a taxCode → look it up, use its rate +
        //      ZATCA category. Operator can override inclusive flag
        //      per line (e.g. mixed inclusive + exclusive on one
        //      invoice).
        //   2. Header declares a taxCode → inherit it.
        //   3. Legacy fallback → use the line's `vatRate` literal or
        //      the company default.
        //
        // `rawLineAmount` is the input amount (qty × unitPrice). The
        // helper produces a balanced { net, tax, gross } that we
        // store as { lineTotal, vatAmount, lineGross }.
        const effectiveTaxCode = (line.taxCode ?? defaultTaxCode) as string | undefined;
        const lineInclusive = (line as any).taxInclusive != null
          ? Boolean((line as any).taxInclusive)
          : defaultTaxInclusive;
        let lineNet: number;
        let lineVat: number;
        if (effectiveTaxCode) {
          const split = await computeTaxFromTaxCode({
            companyId: effectiveCompanyId,
            amount: rawLineAmount,
            taxInclusive: lineInclusive,
            taxCode: effectiveTaxCode,
          });
          lineNet = split.net;
          lineVat = split.tax;
        } else {
          // Legacy path — preserves the old `vatRate` literal behaviour.
          const lineVatRate = (line as any).vatRate != null ? Number((line as any).vatRate) : Number(vatRate);
          if (lineInclusive) {
            const split = splitFromRate(rawLineAmount, true, "LEGACY", lineVatRate);
            lineNet = split.net;
            lineVat = split.tax;
          } else {
            lineNet = rawLineAmount;
            lineVat = (line as any).vatAmount != null
              ? roundTo2(Number((line as any).vatAmount))
              : roundTo2(rawLineAmount * (lineVatRate / 100));
          }
        }
        baseAmount += lineNet;
        validatedLines.push({
          description: line.description ?? "",
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          lineTotal: lineNet,
          vatAmount: lineVat,
          lineGross: roundTo2(lineNet + lineVat),
          accountId: line.accountId ?? null,
          accountCode: line.accountCode ?? null,
          costCenterId: line.costCenterId ?? null,
          activityType: line.activityType ?? null,
          projectId: line.projectId ?? null,
          vehicleId: line.vehicleId ?? null,
          propertyId: line.propertyId ?? null,
          unitId: line.unitId ?? null,
          assetId: line.assetId ?? null,
          employeeId: line.employeeId ?? null,
          driverId: line.driverId ?? null,
          contractId: line.contractId ?? null,
          umrahSeasonId: line.umrahSeasonId ?? null,
          umrahAgentId: line.umrahAgentId ?? null,
          productId: line.productId ?? null,
          taxCode: effectiveTaxCode ?? null,
          taxInclusive: lineInclusive,
          allocationRuleId: line.allocationRuleId ?? null,
          // resolved → caller mapped this line directly to a specific
          // account; unmapped → falls back to the company-level
          // invoice_revenue account on approval.
          allocationStatus: line.accountCode || line.accountId ? "resolved" : "unmapped",
          dimensionJson: (line.dimensionJson as Record<string, unknown> | undefined) ?? null,
          manualOverrideReason: line.manualOverrideReason ?? null,
        });
      }
    } else {
      baseAmount = Number(subtotal ?? rawTotal ?? 0);
    }

    if (!baseAmount || baseAmount <= 0) {
      throw new ValidationError("لا يمكن إنشاء فاتورة بقيمة صفر أو سالبة", { field: "total", fix: "أدخل مبلغاً موجباً أكبر من صفر للفاتورة" });
    }

    const invoiceDate = invoiceBodyDate
      ? toDateISO(invoiceBodyDate)
      : todayISO();
    const periodCheck = await checkFinancialPeriodOpen(effectiveCompanyId, invoiceDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن إنشاء فاتورة في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "date", fix: "اختر تاريخاً ضمن فترة مالية مفتوحة أو اطلب من المدير المالي فتح الفترة" }
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [invArCode, invRevenueCode, invVatPayableCode] = await Promise.all([
      financialEngine.resolveAccountCode(effectiveCompanyId, "invoice_ar", "debit", "1131"),
      financialEngine.resolveAccountCode(effectiveCompanyId, "invoice_revenue", "credit", "4111"),
      financialEngine.resolveAccountCode(effectiveCompanyId, "invoice_vat_payable", "credit", "2131"),
    ]);

    // Numbering center (Issue #1141) — invoice number from central authority.
    // Scheme: `finance.sales_invoice`. Scope policy is `company` so all
    // branches share the same counter (matches the previous behaviour of
    // the global `invoice_number_seq`).
    const issued = await issueNumber({
      companyId: effectiveCompanyId,
      branchId: resolvedBranchId,
      moduleKey: "finance",
      entityKey: "sales_invoice",
      entityTable: "invoices",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const ref = issued.number;

    // Header-level discount (applied to subtotal BEFORE VAT — Saudi
    // ZATCA convention). discountAmount and discountPercent are
    // mutually exclusive; if both are supplied → 422.
    if (rawDiscountAmount != null && rawDiscountPercent != null) {
      throw new ValidationError(
        "لا يمكن إدخال نسبة وقيمة خصم معاً — اختر واحدة فقط",
        { field: "discount", fix: "أدخل discountAmount (قيمة ثابتة) أو discountPercent (نسبة) لا كليهما" }
      );
    }
    let discountAmount = 0;
    let discountPercent = 0;
    if (rawDiscountPercent != null) {
      discountPercent = roundTo2(Number(rawDiscountPercent));
      discountAmount = roundTo2(baseAmount * (discountPercent / 100));
    } else if (rawDiscountAmount != null) {
      discountAmount = roundTo2(Number(rawDiscountAmount));
      discountPercent = baseAmount > 0 ? roundTo2((discountAmount / baseAmount) * 100) : 0;
    }
    if (discountAmount > baseAmount + 0.005) {
      throw new ValidationError(
        `قيمة الخصم (${discountAmount.toFixed(2)}) تتجاوز المبلغ قبل الضريبة (${baseAmount.toFixed(2)})`,
        { field: "discountAmount", fix: "قلّل قيمة الخصم أو راجع بنود الفاتورة" }
      );
    }
    const discountedSubtotal = roundTo2(baseAmount - discountAmount);

    // VAT now computed against the DISCOUNTED net. Per-line VAT was
    // calculated against gross-of-discount line totals so it needs
    // adjustment: scale by (discountedSubtotal / baseAmount) so the
    // line-level breakdown stays proportional to the new total.
    let vatAmount: number;
    if (validatedLines.length > 0) {
      const grossVat = roundTo2(validatedLines.reduce((sum, l) => sum + l.vatAmount, 0));
      vatAmount = baseAmount > 0
        ? roundTo2(grossVat * (discountedSubtotal / baseAmount))
        : 0;
    } else {
      vatAmount = computeVat(discountedSubtotal, Number(vatRate));
    }
    const total = roundTo2(discountedSubtotal + vatAmount);
    // The "subtotal" persisted on the invoice header is the DISCOUNTED
    // net so downstream reports compute revenue net of discount.
    baseAmount = discountedSubtotal;

    let finalDueDate = dueDate ?? null;
    if (!finalDueDate && parsedTerms != null) {
      // تاريخ الاستحقاق من تقويم الرياض لا من UTC: كان `new Date()`+`toDateISO`
      // (يمرّ عبر toISOString UTC) يزيح يومًا للفواتير المُنشأة 00:00–02:59
      // بتوقيت الرياض (لا يزال اليوم السابق في UTC) — «صافي N يومًا» يُحسب من
      // أمسٍ. نبني اليوم من تقويم الرياض ونضيف المدة بأمان UTC.
      const due = new Date(`${currentDateInTz("Asia/Riyadh")}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + parsedTerms);
      finalDueDate = toDateISO(due);
    }

    let insertId!: number;
    await withTransaction(async (client) => {
      const invResult = await client.query(
        `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
                subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,
                "isTaxLinked","invoiceTypeCode","taxCategoryCode","exemptionReason","costCenter",
                "taxCode","taxInclusive","discountAmount","discountPercent")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
        [effectiveCompanyId, resolvedBranchId, clientId ?? null, ref, description ?? null,
          baseAmount, Number(vatRate), vatAmount, total, finalDueDate, scope.activeAssignmentId, notes ?? null,
          isTaxLinked ? true : false, invoiceTypeCode ?? "388", taxCategoryCode ?? "S", exemptionReason ?? null,
          // as-any-reason: justified-pragmatic - defensive read of optional costCenter field not yet in createInvoiceSchema; behavior unchanged
          (req.body as any).costCenter ?? null,
          defaultTaxCode ?? null,
          defaultTaxInclusive,
          discountAmount,
          discountPercent,
        ]
      );
      insertId = invResult.rows[0].id;

      if (validatedLines.length > 0) {
        // Single bulk INSERT, now carrying the full per-line allocation
        // payload (migration 200). Lines that didn't specify an account
        // land as allocationStatus='unmapped' — the approval flow falls
        // back to the company-level invoice_revenue for those.
        const COLS_PER_ROW = 28;
        const valuesSql: string[] = [];
        const params: unknown[] = [];
        for (const l of validatedLines) {
          const base = params.length;
          valuesSql.push(
            `(${Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`).join(",")})`
          );
          params.push(
            insertId, l.description, l.quantity, l.unitPrice, l.lineTotal, l.vatAmount, l.lineGross,
            l.accountId, l.accountCode, l.costCenterId, l.activityType,
            l.projectId, l.vehicleId, l.propertyId, l.unitId, l.assetId,
            l.employeeId, l.driverId, l.contractId, l.umrahSeasonId, l.umrahAgentId,
            l.productId, l.taxCode, l.taxInclusive, l.allocationRuleId, l.allocationStatus,
            l.dimensionJson ? JSON.stringify(l.dimensionJson) : null,
            l.manualOverrideReason
          );
        }
        await client.query(
          `INSERT INTO invoice_lines (
             "invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross",
             "accountId","accountCode","costCenterId","activityType",
             "projectId","vehicleId","propertyId","unitId","assetId",
             "employeeId","driverId","contractId","umrahSeasonId","umrahAgentId",
             "productId","taxCode","taxInclusive","allocationRuleId","allocationStatus",
             "dimensionJson","manualOverrideReason"
           )
           VALUES ${valuesSql.join(",")}`,
          params
        );
      }

      // totalRevenue update deferred to approval (POST /invoices/:id/approve)
      // to prevent unapproved drafts from inflating client revenue.

      // Budget consumption deferred to approval (POST /invoices/:id/approve)
      // to prevent unapproved drafts from inflating budget usage.

      if (finalDueDate) {
        const collectionDate = new Date(finalDueDate);
        collectionDate.setDate(collectionDate.getDate() + 30);
        await client.query(
          `INSERT INTO collection_follow_ups ("companyId","invoiceId","scheduledDate",type,notes,status,"assignedTo")
           VALUES ($1,$2,$3,'collection_task',$4,'pending',$5)`,
          [effectiveCompanyId, insertId, toDateISO(collectionDate),
            `مهمة تحصيل فاتورة ${ref} – بعد 30 يوم من تاريخ الاستحقاق`, scope.activeAssignmentId]
        );
      }

      // Link the numbering assignment back to the invoice row id so the
      // audit log can drill from `numbering_assignments` to the invoice.
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [insertId, issued.assignmentId]
      );
    });

    // GL entry deferred to approval (POST /invoices/:id/approve)
    // to prevent unapproved drafts from affecting the ledger.

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.created", entity: "invoices", entityId: insertId, details: JSON.stringify({ ref, total, dueDate: finalDueDate, vatAmount, lineCount: validatedLines.length }) }).catch((e) => logger.error(e, "finance-invoices background task failed"));
    createNotification({ companyId: scope.companyId, assignmentId: scope.activeAssignmentId, type: "invoice_created", title: "تم إنشاء فاتورة جديدة", body: `فاتورة ${ref} بمبلغ ${total.toLocaleString()} ﷼`, priority: "normal", refType: "invoices", refId: insertId }).catch((e) => logger.error(e, "finance-invoices background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "create", entity: "invoices", entityId: insertId, after: { ref, total, vatAmount, clientId: clientId ?? null } }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [invoice] = await rawQuery<Record<string, unknown>>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`, [insertId, scope.companyId]);
    res.status(201).json({ ...invoice, lines: validatedLines });
  } catch (err) {
    handleRouteError(err, res, "Create invoice error:");
  }
});

invoicesRouter.post("/invoices/:id/send", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");

    // Read the joined invoice+client view first — we need the contact info to
    // decide which delivery channels to log, and the ref/clientName for the
    // audit trail. The lifecycle engine will re-lock the invoice row FOR
    // UPDATE inside its transaction so this read is purely for display data.
    const [invoice] = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i.ref, i.status, i.total, i."vatAmount", i."dueDate",
              c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail"
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    const channels: string[] = [];
    if (invoice.clientEmail) { channels.push("email"); logger.info({ clientEmail: invoice.clientEmail, ref: invoice.ref }, "Invoice email PDF notification"); }
    if (invoice.clientPhone) { channels.push("whatsapp"); logger.info({ clientPhone: invoice.clientPhone, ref: invoice.ref }, "Invoice WhatsApp link notification"); }

    // Atomic draft→sent transition via the shared lifecycle engine. The
    // engine writes the event_log row + audit_logs row + bus emission, so
    // this handler only keeps the channel notification as a side-effect.
    try {
      await applyTransition({
        entity: "invoices",
        id,
        scope: {
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
        },
        action: "invoice.sent",
        fromStates: ["draft", "approved"],
        toState: "sent",
        setExtras: { sentAt: { raw: "NOW()" } },
        extraWhere: `"deletedAt" IS NULL`,
        after: { ref: invoice.ref, channels, clientName: invoice.clientName },
        skipUpdatedAt: true,
      });
    } catch (err) {
      const mapped = lifecycleErrorResponse(err);
      if (mapped) {
        // Surface the typed error directly — the frontend gets the full
        // { error, code, field, fix } shape and can highlight the status
        // field. Dropping the old 409→400 downgrade; client code already
        // handles CONFLICT codes consistently across the app.
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    createNotification({ companyId: scope.companyId, assignmentId: scope.activeAssignmentId, type: "invoice_sent", title: `تم إرسال الفاتورة ${invoice.ref}`, body: `تم إرسال الفاتورة للعميل ${invoice.clientName || ""} عبر ${channels.join(" + ") || "النظام"}`, priority: "normal", refType: "invoices", refId: id }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.json({ message: "تم إرسال الفاتورة بنجاح", status: "sent", channels, ref: invoice.ref });
  } catch (err) {
    handleRouteError(err, res, "Send invoice error:");
  }
});

// RBAC v2: enforces approval limits — if the role's
// rbac_approval_limits.max_amount for finance.invoices.approve is set,
// invoices whose total exceeds that limit are rejected with
// APPROVAL_LIMIT_EXCEEDED. The amount is pulled from the invoice's
// `total` column directly, not from the request body, so callers
// cannot bypass it by sending a smaller amount.
invoicesRouter.post("/invoices/:id/approve", authorize({
  feature: "finance.invoices",
  action: "approve",
  resource: { table: "invoices", idParam: "id", columns: ['"companyId"', '"branchId"', '"departmentId"', '"createdBy"', 'total'] },
  amount: { from: "resource", field: "total", currency: "SAR" },
}), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [invoice] = await rawQuery<Record<string, unknown>>(
      `SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    // GL accounts resolved up-front (reads, no transaction needed).
    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [invArCode, invRevenueCode, invVatFallback, invVatSpecific] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4111"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2131"),
      // البند ٤ — حساب رمز ضريبة الفاتورة إن هُيِّئ، وإلا الاحتياطي العام أدناه.
      invoice.taxCode
        ? getOutputVatAccountCode(scope.companyId, invoice.taxCode as string)
        : Promise.resolve(null),
    ]);
    const invVatPayableCode = resolveVatLegAccount(invVatSpecific, invVatFallback);

    // Atomic approval: status flip + GL post + denormalised counters
    // either all commit or all roll back. Without this wrapping, a DB
    // hiccup between applyTransition and the totalRevenue UPDATE would
    // leave the invoice `approved`, the JE on the books, but the
    // client's totalRevenue counter unchanged — a phantom-revenue
    // condition that no compensating path catches. withTransaction is
    // reentrant via SAVEPOINT (PR #885) so the engine's internal
    // transaction nests cleanly when we pass the same client through.
    let journalId: number;
    let alreadyExists = false;
    await withTransaction(async (client) => {
      await applyTransition({
        entity: "invoices",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
        action: "invoice.approved",
        // Issue #663 #1: dropped "sent" — once an invoice has been sent
        // to the customer it is a financial commitment, not a draft
        // pending approval. The engine's invoices state machine reflects
        // this: `sent: ["partial","paid","overdue","cancelled"]` has no
        // `approved` target, so the previous `["draft","sent","returned"]`
        // whitelist threw `LifecycleError` at runtime for any sent-state
        // invoice. The UI (finance/invoice-detail.tsx:316) only exposes
        // the approve action when `status === "draft"`, so the
        // unreachable `sent` entry was latent drift, not an exercised
        // path — but the route is now in agreement with engine + UI.
        fromStates: ["draft", "returned"],
        toState: "approved",
        setExtras: { approvedBy: scope.userId, approvedAt: { raw: "NOW()" } },
        extraWhere: `"deletedAt" IS NULL`,
        after: { ref: invoice.ref, total: invoice.total },
        client,
      });

      // GL entry created ONLY upon approval — BLOCKING (financial integrity guard).
      //
      // Phase 1 P0 — per-line revenue posting (Finance Line-Level Allocation).
      // Read invoice_lines and emit one CR line per (accountCode + dimensions)
      // bucket. Lines that didn't carry an accountCode (allocationStatus=
      // 'unmapped') fall back to the company-level invoice_revenue account,
      // preserving the legacy single-revenue posting for callers that haven't
      // adopted per-line mapping yet. The AR debit + VAT credit stay
      // header-level since they are not per-line concepts.
      const dimLines = await client.query<{
        id: number;
        accountCode: string | null;
        accountId: number | null;
        lineTotal: string;
        quantity: string;
        costCenterId: number | null;
        activityType: string | null;
        projectId: number | null;
        vehicleId: number | null;
        propertyId: number | null;
        unitId: number | null;
        assetId: number | null;
        employeeId: number | null;
        driverId: number | null;
        contractId: number | null;
        productId: number | null;
        umrahSeasonId: number | null;
        umrahAgentId: number | null;
        taxCode: string | null;
      }>(
        `SELECT id, "accountCode", "accountId", "lineTotal"::text AS "lineTotal",
                quantity::text AS quantity,
                "costCenterId", "activityType",
                "projectId", "vehicleId", "propertyId", "unitId", "assetId",
                "employeeId", "driverId", "contractId", "productId",
                "umrahSeasonId", "umrahAgentId", "taxCode"
           FROM invoice_lines
          WHERE "invoiceId" = $1
          ORDER BY id`,
        [id]
      );

      // Phase 5.3 — run the allocation resolver. For each line that
      // doesn't already carry an accountCode, the resolver consults
      // accounting_allocation_rules (#972) to pick the right revenue
      // account + cost-centre + required dimensions. Lines with
      // pre-set accountCode return status='manual_override' so the
      // operator's pin always wins. Lines with no rule match fall
      // through to the generic invoice_revenue account (legacy
      // backwards-compat).
      const {
        resolveLineAllocation,
        writeAllocationResult,
        validateAllocationCompleteness,
        getEnforceLineAllocation,
        logAllocationOverride,
        getProductRevenueCodes,
      } = await import("../lib/accountingAllocation.js");
      // #2102 — batch-load the product→revenue-account map ONCE, then inject
      // it into the resolver so product-revenue selection happens INSIDE
      // resolveLineAllocation at the right precedence (manual pin > rule >
      // product revenue > generic). No per-line DB call; the old
      // post-resolver bolt-on that read this map after the resolver is gone.
      const productRevenueCodes = await getProductRevenueCodes(
        scope.companyId,
        dimLines.rows
          .filter((ln) => ln.productId != null)
          .map((ln) => Number(ln.productId)),
      );
      const lineResolutions = await Promise.all(
        dimLines.rows.map((ln) =>
          resolveLineAllocation({
            companyId: scope.companyId,
            documentType: "invoice",
            lineType: "product",
            accountCode: ln.accountCode,
            accountId: ln.accountId,
            costCenterId: ln.costCenterId,
            taxCode: ln.taxCode,
            productId: ln.productId,
            productRevenueCodes,
            dimensions: {
              vehicleId: ln.vehicleId,
              propertyId: ln.propertyId,
              unitId: ln.unitId,
              assetId: ln.assetId,
              projectId: ln.projectId,
              employeeId: ln.employeeId,
              driverId: ln.driverId,
              contractId: ln.contractId,
              umrahSeasonId: ln.umrahSeasonId,
              umrahAgentId: ln.umrahAgentId,
              productId: ln.productId,
              clientId: invoice.clientId as number | null,
            },
            sourceTable: "invoice_lines",
            sourceLineId: ln.id,
          })
        )
      );

      // ── Enforce gate (migration 223 / finance.enforce_line_allocation).
      // When the company has enforce_line_allocation=ON, refuse to post a
      // JE that contains any line the resolver flagged as 'unmapped' or
      // 'failed'. A user holding finance.allocation.override may still
      // approve by supplying req.body.overrideReason; the bypass is
      // recorded on allocation_override_log for audit. With the flag
      // OFF (default) the code falls through to the legacy fallback-to-
      // generic-account behavior below, exactly as before — opt-in.
      const enforce = await getEnforceLineAllocation({ companyId: scope.companyId, branchId: scope.branchId });
      if (enforce) {
        const { ok, blockers } = validateAllocationCompleteness(lineResolutions);
        if (!ok) {
          const overrideReason = String(req.body?.overrideReason ?? "").trim();
          if (overrideReason.length < 10) {
            throw new ValidationError(
              "لا يمكن اعتماد فاتورة تحتوي على بنود بدون تخصيص محاسبي",
              {
                field: "lines",
                fix: "حدد الحساب ومركز التكلفة لكل بند، أو زوّد سببًا مكتوبًا (overrideReason ≥ 10 حرف) إن كان لديك صلاحية finance.allocation.override.",
                meta: { blockers, unmappedLineCount: lineResolutions.filter((r) => r.status === "unmapped" || r.status === "failed").length },
              } as any,
            );
          }
          const overrideAllowed = (await checkAccess(scope, {
            feature: "finance.allocation.override",
            action: "create",
          })).allowed;
          if (!overrideAllowed) {
            throw new ForbiddenError(
              "تجاوز تخصيص البنود يحتاج صلاحية finance.allocation.override",
              { fix: "اطلب من المدير المالي اعتماد هذه الفاتورة، أو خصّص البنود قبل الاعتماد.", meta: { blockers } } as any,
            );
          }
          await logAllocationOverride({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            actorAssignmentId: scope.activeAssignmentId ?? null,
            actorUserId: scope.userId,
            documentType: "invoice",
            documentId: id,
            sourceTable: "invoice_lines",
            blockers,
            overrideReason,
          });
        }
      }

      const totalNet = Number(invoice.total) - Number(invoice.vatAmount || 0);
      const revenueLines: JournalEntryLine[] = [];

      if (dimLines.rows.length > 0) {
        // Group lines that share the SAME revenue account + dimension
        // signature into one journal_line, so the GL stays compact
        // for tenants with many small lines on the same account.
        const buckets = new Map<string, {
          accountCode: string;
          amount: number;
          costCenter: string | null;
          costCenterId: number | null;
          activityType: string | null;
          projectId: number | null;
          vehicleId: number | null;
          propertyId: number | null;
          employeeId: number | null;
          driverId: number | null;
          contractId: number | null;
          productId: number | null;
          unitId: number | null;
          assetId: number | null;
          umrahSeasonId: number | null;
          umrahAgentId: number | null;
        }>();
        let postedNet = 0;
        for (let i = 0; i < dimLines.rows.length; i++) {
          const ln = dimLines.rows[i];
          const res = lineResolutions[i];
          // #2102 — the resolver now returns the account at the right
          // precedence (manual pin > rule > product revenue); the route
          // only supplies the generic invoice_revenue fallback. The
          // dimensions used in the bucket key come from the RESOLVER OUTPUT
          // — for an 'explicit' or 'from_vehicle' strategy that may differ
          // from the raw line.
          const acct = res.resolvedAccountCode || invRevenueCode;
          const dims = res.dimensions;
          const cc = res.costCenterId;
          const key = [
            acct,
            cc ?? "",
            ln.activityType ?? "",
            dims.projectId ?? "",
            dims.vehicleId ?? "",
            dims.propertyId ?? "",
            dims.employeeId ?? "",
            dims.driverId ?? "",
            dims.contractId ?? "",
            dims.productId ?? "",
            dims.unitId ?? "",
            dims.assetId ?? "",
            dims.umrahSeasonId ?? "",
            dims.umrahAgentId ?? "",
          ].join("|");
          const amt = roundTo2(Number(ln.lineTotal));
          postedNet += amt;
          const prev = buckets.get(key);
          if (prev) {
            prev.amount = roundTo2(prev.amount + amt);
          } else {
            buckets.set(key, {
              accountCode: acct,
              amount: amt,
              costCenter: cc != null ? String(cc) : null,
              // Numeric FK — when set (e.g. a pinned trip cost-center), the
              // enricher keeps it instead of deriving from vehicleId.
              costCenterId: cc != null ? Number(cc) : null,
              activityType: ln.activityType,
              projectId: dims.projectId,
              vehicleId: dims.vehicleId,
              propertyId: dims.propertyId,
              employeeId: dims.employeeId,
              driverId: dims.driverId,
              contractId: dims.contractId,
              productId: dims.productId,
              unitId: dims.unitId,
              assetId: dims.assetId,
              umrahSeasonId: dims.umrahSeasonId,
              umrahAgentId: dims.umrahAgentId,
            });
          }
        }

        // #1715 correctness review (M4) — prorate a header discount across the
        // dimension-tagged revenue buckets. The buckets sum GROSS line totals
        // (postedNet), but the invoice recognises NET revenue (totalNet); the
        // old code dumped the whole discount onto the generic account below, so
        // per-dimension revenue was overstated and the generic account absorbed
        // the entire discount. Scaling every bucket by totalNet/postedNet spreads
        // the discount proportionally; the tiny rounding residual still falls on
        // the generic fallback. Only fires when there's a real divergence (a
        // discount), so the no-discount path is unchanged. Σ revenue is
        // preserved, so the JE still balances against the AR debit.
        if (postedNet > 0.005 && Math.abs(totalNet - postedNet) >= 0.005) {
          const ratio = totalNet / postedNet;
          let scaledSum = 0;
          for (const b of buckets.values()) {
            b.amount = roundTo2(b.amount * ratio);
            scaledSum = roundTo2(scaledSum + b.amount);
          }
          postedNet = scaledSum;
        }

        // If the sum of line totals diverges from invoice.total-vat (e.g.
        // legacy invoice with header-level total and no lines, or the rounding
        // residual from the proration above), let the remainder fall on the
        // generic account so the entry still balances against the AR debit.
        const diff = roundTo2(totalNet - postedNet);
        if (Math.abs(diff) >= 0.005) {
          // Bucket key has 14 dimension slots after `acct` — keep them
          // all empty (13 pipes for 14 empty slots after acct) for the
          // fallback bucket so it doesn't collide with any resolved
          // bucket that happens to use invRevenueCode.
          const fallbackKey = `${invRevenueCode}|||||||||||||`;
          const prev = buckets.get(fallbackKey);
          if (prev) {
            prev.amount = roundTo2(prev.amount + diff);
          } else {
            buckets.set(fallbackKey, {
              accountCode: invRevenueCode, amount: diff,
              costCenter: null, costCenterId: null, activityType: null, projectId: null,
              vehicleId: null, propertyId: null, employeeId: null,
              driverId: null, contractId: null, productId: null,
              unitId: null, assetId: null,
              umrahSeasonId: null, umrahAgentId: null,
            });
          }
        }

        for (const b of buckets.values()) {
          if (Math.abs(b.amount) < 0.005) continue;
          revenueLines.push({
            accountCode: b.accountCode, debit: 0, credit: b.amount,
            costCenter: b.costCenter ?? undefined,
            costCenterId: b.costCenterId ?? undefined,
            activityType: b.activityType ?? undefined,
            projectId: b.projectId ?? undefined,
            vehicleId: b.vehicleId ?? undefined,
            propertyId: b.propertyId ?? undefined,
            employeeId: b.employeeId ?? undefined,
            driverId: b.driverId ?? undefined,
            contractId: b.contractId ?? undefined,
            productId: b.productId ?? undefined,
            unitId: b.unitId ?? undefined,
            assetId: b.assetId ?? undefined,
            umrahSeasonId: b.umrahSeasonId ?? undefined,
            umrahAgentId: b.umrahAgentId ?? undefined,
            clientId: invoice.clientId as number | undefined,
          } as any);
        }
      }

      // Header-level fallback: no invoice_lines stored at all → one
      // generic-revenue CR line so the JE still balances.
      if (revenueLines.length === 0) {
        revenueLines.push({
          accountCode: invRevenueCode, debit: 0, credit: totalNet,
          clientId: invoice.clientId as number | undefined,
        } as any);
      }

      // ── COGS planning (Audit P1 #7) ────────────────────────────────────
      // For every invoice line carrying an inventoried productId, run the
      // valuation picker (FIFO/LIFO/avg per product.costingMethod) to
      // figure out which lots feed the sale. Returns the DR COGS / CR
      // Inventory journal lines we splice into the same JE, plus the
      // per-line snapshot we write back to invoice_lines (so a future
      // sales-return reversal credits the SAME lots back).
      const { planCogsForInvoice, applyStockMovements } = await import(
        "../lib/inventory/cogsPosting.js"
      );
      const cogsPlan = await planCogsForInvoice(client as any, {
        companyId: scope.companyId,
        invoiceId: id,
        branchId: scope.branchId ?? null,
        lines: dimLines.rows.map((r) => ({
          invoiceLineId: r.id,
          quantity: Number(r.quantity ?? 0),
          productId: r.productId,
          costCenterId: r.costCenterId,
          projectId: r.projectId,
          employeeId: r.employeeId,
        })),
      });
      // Hard-block approval on insufficient stock — selling what we
      // don't have is the bug we're trying to fix, not a fall-through
      // case. `product_not_tracked` etc. are warnings (logged); only
      // insufficient_stock is fatal.
      const shortages = cogsPlan.warnings.filter((w) => w.reason === "insufficient_stock");
      if (shortages.length > 0) {
        throw new ValidationError(
          `مخزون غير كافٍ للسطر #${shortages[0].invoiceLineId}: ${shortages[0].detail ?? ""}`.trim(),
          { field: "invoice_lines", meta: { shortages } },
        );
      }
      // Other warnings (product_not_found / product_not_tracked / no_active_lots
      // / no_cogs_account / no_inventory_account) are non-fatal but logged so
      // ops can clean up the master data. The invoice posts revenue but no
      // COGS for those lines.
      if (cogsPlan.warnings.length > 0) {
        logger.warn(
          { invoiceId: id, warnings: cogsPlan.warnings },
          "invoice approve: some lines skipped COGS posting",
        );
      }

      const result = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        createdBy: scope.activeAssignmentId,
        ref: `JE-${invoice.ref}`,
        description: `فاتورة ${invoice.ref}${invoice.description ? ` – ${invoice.description}` : ""}`,
        type: "invoice",
        sourceType: "invoice",
        sourceId: id,
        sourceKey: `finance:invoice_approval:${id}`,
        lines: [
          { accountCode: invArCode, debit: Number(invoice.total), credit: 0, clientId: invoice.clientId as number | undefined } as any,
          ...revenueLines,
          // VAT payable carries clientId so per-customer VAT analysis (and
          // VAT-collected-by-customer reports) tie out from the GL. Without
          // this, the AR shows the gross-up against the customer but the
          // VAT obligation is unattributed. البند ٤ — invVatPayableCode هو حساب
          // رمز الضريبة إن هُيِّئ. keepZero يُبقي السطر غير مشروط كما كان.
          ...buildVatLeg({ amount: Number(invoice.vatAmount || 0), side: "credit", accountCode: invVatPayableCode, clientId: invoice.clientId as number | undefined, keepZero: true }) as any[],
          ...cogsPlan.journalLines,
        ],
        guardTable: "invoices",
        guardId: id,
      });
      journalId = result.journalId;
      alreadyExists = result.alreadyExists;

      // Persist the JE link on invoices.journalEntryId so tax-summary
      // and VAT-return queries (which JOIN journal_entries via this
      // column) can find the invoice's GL row. Without this UPDATE
      // the column stayed NULL forever and the tax declaration
      // returned 0 for invoice VAT — silent for any tenant with
      // real data because guard.sh's check-schema-drift is skipped
      // in CI (no DATABASE_URL).
      await client.query(
        `UPDATE invoices SET "journalEntryId" = $1, "cogsTotal" = $2
          WHERE id = $3 AND "companyId" = $4 AND "deletedAt" IS NULL`,
        [journalId, cogsPlan.totalCogs, id, scope.companyId]
      );

      // ── Apply COGS side-effects (stock + per-line snapshots) ─────────
      // Done inside the same withTransaction as the JE post so any
      // failure rolls everything back. Skip on idempotent replay since
      // the lots were already decremented + snapshots written.
      if (!alreadyExists && cogsPlan.journalLines.length > 0) {
        // journalId is already known here — the JE was just posted
        // above. Pass it so warehouse_movements.journalEntryId carries
        // the link the auditor needs.
        await applyStockMovements(
          client as any, scope.companyId,
          cogsPlan.stockMovements, scope.activeAssignmentId ?? 0,
          journalId,
        );
        for (const snap of cogsPlan.lineSnapshots) {
          await client.query(
            `UPDATE invoice_lines
                SET "cogsAmount" = $1, "cogsUnitCost" = $2,
                    "cogsAllocationJson" = $3::jsonb, "cogsPostedAt" = NOW()
              WHERE id = $4`,
            [
              snap.cogsAmount, snap.cogsUnitCost,
              JSON.stringify(snap.allocations), snap.invoiceLineId,
            ],
          );
        }
      }

      // Phase 5.3 — persist the allocation resolution per line so the
      // accounting_allocation_results table reflects which rule moved
      // each line to which account. Runs after the JE posts so a
      // failed post doesn't leave orphan resolution rows. UPSERTs on
      // (sourceTable, sourceLineId, companyId) so re-approving an
      // invoice (after correction) overwrites the previous result.
      if (!alreadyExists) {
        for (let i = 0; i < dimLines.rows.length; i++) {
          const ln = dimLines.rows[i];
          const res = lineResolutions[i];
          await writeAllocationResult(
            {
              companyId: scope.companyId,
              documentType: "invoice",
              sourceTable: "invoice_lines",
              sourceLineId: ln.id,
            },
            res,
            scope.activeAssignmentId,
          );
        }
      }

      // Update client totalRevenue upon approval (revenue recognition).
      if (invoice.clientId) {
        await client.query(
          `UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) + $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
          [Number(invoice.total) - Number(invoice.vatAmount || 0), invoice.clientId, scope.companyId]
        );
      }

      // Budget consumption at approval (not at draft creation). No row
      // for the (account, period) pair → no-op, which is the right
      // behaviour when a company hasn't seeded a budget. A genuine
      // error here (e.g. column missing) now rolls back the approval
      // instead of being silently swallowed — at-fault data still
      // surfaces, but the books and the counter never disagree.
      const baseAmount = Number(invoice.total) - Number(invoice.vatAmount || 0);
      await client.query(
        `UPDATE budgets SET used = used + $1 WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
        [baseAmount, scope.companyId, invRevenueCode, currentPeriod()]
      );
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.approved", entity: "invoices", entityId: id, details: JSON.stringify({ ref: invoice.ref, total: invoice.total }) }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [updated] = await rawQuery<Record<string, unknown>>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!updated) throw new NotFoundError("الفاتورة غير موجودة");
    res.json(updated);
  } catch (err) {
    if (typeof lifecycleErrorResponse === 'function') {
      const mapped = lifecycleErrorResponse(err);
      if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    }
    handleRouteError(err, res, "Approve invoice error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POSTING PREVIEW — Finance Line-Level Allocation Phase 3 P0.
//
// Returns the journal lines that WOULD be posted if the operator approved
// this invoice right now, plus a list of blockers (which prevent approval)
// and warnings (informational). The shape mirrors the structure built
// inside /approve so the UI can render the exact same posting.
//
// Read-only — no GL movement, no transaction, no idempotency token needed.
//
// Blockers (preventing approval):
//   * Financial period is closed/locked for the invoice's date
//   * Invoice is in a non-approvable state (paid, cancelled, void, …)
//
// Warnings (rendered but non-blocking):
//   * Some lines have allocationStatus = 'unmapped'    → they will fall
//     back to the company-level invoice_revenue account
//   * No invoice_lines stored                          → header-level
//     single-revenue fallback
//   * Sum-of-lines differs from invoice.total-vat      → rounding-
//     difference correction will land on the generic account
// ─────────────────────────────────────────────────────────────────────────────
invoicesRouter.post("/invoices/:id/preview-posting", authorize({
  feature: "finance.invoices",
  action: "view",
  resource: { table: "invoices", idParam: "id", columns: ['"companyId"', '"branchId"'] },
}), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [invoice] = await rawQuery<Record<string, unknown>>(
      `SELECT i.*, c.name AS "clientName"
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
        WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    const blockers: { field: string; message: string }[] = [];
    const warnings: { field: string; message: string; lineIds?: number[] }[] = [];

    // Blocker — invoice not in approvable state.
    const approvableStates = ["draft", "returned"];
    if (!approvableStates.includes(String(invoice.status))) {
      blockers.push({
        field: "status",
        message: `الفاتورة بحالة "${invoice.status}" — الاعتماد يتطلب draft أو returned`,
      });
    }

    // Blocker — financial period closed/locked for invoice.createdAt.
    const invoiceDate = (invoice.createdAt as Date | string | null)
      ? toDateISO(invoice.createdAt as Date | string)
      : null;
    if (invoiceDate) {
      const periodCheck = await checkFinancialPeriodOpen(scope.companyId, invoiceDate);
      if (!periodCheck.open) {
        blockers.push({
          field: "period",
          message: `الفترة المالية مغلقة (${periodCheck.periodName ?? invoiceDate}) — لا يمكن الاعتماد`,
        });
      }
    }

    // Resolve GL accounts (read-only; doesn't post).
    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [invArCode, invRevenueCode, invVatFallback, invVatSpecific] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4111"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2131"),
      // البند ٤ — المعاينة تعكس حساب رمز الضريبة الذي سيستخدمه الاعتماد (صدق المعاينة).
      invoice.taxCode
        ? getOutputVatAccountCode(scope.companyId, invoice.taxCode as string)
        : Promise.resolve(null),
    ]);
    const invVatPayableCode = resolveVatLegAccount(invVatSpecific, invVatFallback);

    // Read invoice_lines with dimensional fields (migration 200).
    const lines = await rawQuery<{
      id: number;
      description: string | null;
      lineTotal: string;
      quantity: string;
      accountCode: string | null;
      accountId: number | null;
      allocationStatus: string | null;
      costCenterId: number | null;
      activityType: string | null;
      projectId: number | null;
      vehicleId: number | null;
      propertyId: number | null;
      unitId: number | null;
      assetId: number | null;
      employeeId: number | null;
      driverId: number | null;
      contractId: number | null;
      umrahSeasonId: number | null;
      umrahAgentId: number | null;
      productId: number | null;
      taxCode: string | null;
    }>(
      `SELECT id, description,
              "lineTotal"::text AS "lineTotal",
              quantity::text     AS quantity,
              "accountCode", "accountId", "allocationStatus",
              "costCenterId", "activityType",
              "projectId", "vehicleId", "propertyId", "unitId", "assetId",
              "employeeId", "driverId", "contractId",
              "umrahSeasonId", "umrahAgentId", "productId", "taxCode"
         FROM invoice_lines
        WHERE "invoiceId" = $1
        ORDER BY id`,
      [id]
    );

    const totalNet = Number(invoice.total) - Number(invoice.vatAmount || 0);

    // Phase 5.5 — run the same resolver the /approve handler uses so
    // the preview reflects rule-driven account selection, not just the
    // raw line's accountCode. A line with no accountCode but a matching
    // rule shows as "resolved" with the rule's chosen account in the
    // preview, matching exactly what /approve would post.
    const { resolveLineAllocation, getProductRevenueCodes } = await import("../lib/accountingAllocation.js");
    // #2102 — batch-load the product→revenue map ONCE and inject it so the
    // resolver applies product-revenue selection internally (same precedence
    // as /approve). The post-resolver bolt-on below is gone.
    const productRevenueCodes = await getProductRevenueCodes(
      scope.companyId,
      lines
        .filter((ln: any) => ln.productId != null)
        .map((ln: any) => Number(ln.productId)),
    );
    const lineResolutions = await Promise.all(
      lines.map((ln) =>
        resolveLineAllocation({
          companyId: scope.companyId,
          documentType: "invoice",
          lineType: "product",
          accountCode: ln.accountCode,
          accountId: ln.accountId,
          costCenterId: ln.costCenterId,
          taxCode: ln.taxCode,
          productId: ln.productId,
          productRevenueCodes,
          dimensions: {
            vehicleId: ln.vehicleId,
            propertyId: ln.propertyId,
            unitId: ln.unitId,
            assetId: ln.assetId,
            projectId: ln.projectId,
            employeeId: ln.employeeId,
            driverId: ln.driverId,
            contractId: ln.contractId,
            umrahSeasonId: ln.umrahSeasonId,
            umrahAgentId: ln.umrahAgentId,
            productId: ln.productId,
            clientId: invoice.clientId as number | null,
          },
          sourceTable: "invoice_lines",
          sourceLineId: ln.id,
        })
      )
    );

    // Build the preview journal lines using the SAME algorithm as
    // /approve. Kept in sync deliberately — if /approve evolves the
    // preview must match.
    type PreviewLine = {
      accountCode: string;
      debit: number;
      credit: number;
      description?: string;
      dimensions: Record<string, unknown>;
    };
    const previewLines: PreviewLine[] = [];

    previewLines.push({
      accountCode: invArCode,
      debit: Number(invoice.total),
      credit: 0,
      description: `ذمم مدينة — فاتورة ${invoice.ref}`,
      dimensions: { clientId: invoice.clientId },
    });

    const unmappedLineIds: number[] = [];
    // Aggregate resolver warnings so the operator sees them in the preview.
    const resolverWarnings: Array<{ lineId: number; code: string; message: string }> = [];
    if (lines.length > 0) {
      const buckets = new Map<string, PreviewLine & { _amount: number }>();
      let postedNet = 0;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const res = lineResolutions[i];

        // Resolver output drives the bucket — same as /approve so the
        // preview shows exactly what would post. Product-revenue selection
        // is now inside the resolver (#2102); the route only adds the
        // generic fallback.
        const acct = res.resolvedAccountCode || invRevenueCode;
        const cc = res.costCenterId;
        const dims = res.dimensions;
        if (res.status === "unmapped") unmappedLineIds.push(ln.id);
        for (const w of res.warnings) {
          resolverWarnings.push({ lineId: ln.id, code: w.code, message: w.message });
        }
        const key = [
          acct, cc ?? "", ln.activityType ?? "",
          dims.projectId ?? "", dims.vehicleId ?? "", dims.propertyId ?? "",
          dims.employeeId ?? "", dims.driverId ?? "", dims.contractId ?? "",
          dims.productId ?? "",
        ].join("|");
        const amt = roundTo2(Number(ln.lineTotal));
        postedNet += amt;
        const prev = buckets.get(key);
        if (prev) {
          prev._amount = roundTo2(prev._amount + amt);
          prev.credit = prev._amount;
        } else {
          buckets.set(key, {
            accountCode: acct,
            debit: 0,
            credit: amt,
            _amount: amt,
            description: `إيرادات — ${ln.description ?? ""}`.trim(),
            dimensions: {
              clientId: invoice.clientId,
              costCenterId: cc,
              activityType: ln.activityType,
              projectId: dims.projectId,
              vehicleId: dims.vehicleId,
              propertyId: dims.propertyId,
              unitId: dims.unitId,
              assetId: dims.assetId,
              employeeId: dims.employeeId,
              driverId: dims.driverId,
              contractId: dims.contractId,
              umrahSeasonId: dims.umrahSeasonId,
              umrahAgentId: dims.umrahAgentId,
              productId: dims.productId,
              ruleId: res.ruleId,
              resolutionStatus: res.status,
            },
          });
        }
      }
      const diff = roundTo2(totalNet - postedNet);
      if (Math.abs(diff) >= 0.005) {
        warnings.push({
          field: "rounding",
          message: `فرق تقريب ${diff.toFixed(2)} ﷼ سيُرحَّل على حساب الإيرادات العام (${invRevenueCode})`,
        });
        const fallbackKey = `${invRevenueCode}|||||||||`;
        const prev = buckets.get(fallbackKey);
        if (prev) {
          prev._amount = roundTo2(prev._amount + diff);
          prev.credit = prev._amount;
        } else {
          buckets.set(fallbackKey, {
            accountCode: invRevenueCode,
            debit: 0,
            credit: diff,
            _amount: diff,
            description: `إيرادات — فرق تقريب`,
            dimensions: { clientId: invoice.clientId },
          });
        }
      }
      for (const b of buckets.values()) {
        if (Math.abs(b._amount) < 0.005) continue;
        // strip the private _amount field before returning to the client
        const { _amount: _omit, ...clean } = b;
        previewLines.push(clean);
      }
    } else {
      previewLines.push({
        accountCode: invRevenueCode,
        debit: 0,
        credit: totalNet,
        description: `إيرادات — فاتورة ${invoice.ref}`,
        dimensions: { clientId: invoice.clientId },
      });
      warnings.push({
        field: "lines",
        message: "الفاتورة ليس لها بنود مخزنة — سيتم ترحيل سطر إيرادات عام واحد",
      });
    }

    if (Number(invoice.vatAmount || 0) > 0) {
      previewLines.push({
        accountCode: invVatPayableCode,
        debit: 0,
        credit: Number(invoice.vatAmount || 0),
        description: `ضريبة قيمة مضافة — فاتورة ${invoice.ref}`,
        dimensions: {},
      });
    }

    if (unmappedLineIds.length > 0) {
      warnings.push({
        field: "allocation",
        message: `${unmappedLineIds.length} بند بدون حساب محدد — سيُرحَّل على حساب الإيرادات العام (${invRevenueCode}). افتح كل بند وأضف الحساب لتوزيع أدق.`,
        lineIds: unmappedLineIds,
      });
    }

    // COGS preview (Audit follow-up to #1013).
    // Mirror the COGS planner the /approve handler calls so the UI can
    // show stock shortages BEFORE the operator clicks approve. The
    // planner only does SELECTs — we pass `pool` directly so the
    // preview never holds a transaction open. applyStockMovements is
    // NEVER called from this path.
    const { planCogsForInvoice } = await import("../lib/inventory/cogsPosting.js");
    const { pool: cogsPool } = await import("../lib/rawdb.js");
    type CogsLine = import("../lib/inventory/cogsPosting.js").CogsJournalLine;
    let cogsPreviewLines: CogsLine[] = [];
    let cogsTotal = 0;
    const cogsWarnings: Array<{ lineId: number; productId: number | null; reason: string; detail?: string }> = [];
    try {
      // Use the pool directly so the preview never holds a
      // transaction open. The planner only does SELECTs;
      // pool.query() is structurally compatible with PoolClient.query.
      const cogsPlan = await planCogsForInvoice(cogsPool as never, {
        companyId: scope.companyId,
        invoiceId: id,
        branchId: (invoice.branchId as number) ?? null,
        lines: lines.map((r) => ({
          invoiceLineId: r.id,
          quantity: Number(r.quantity ?? 0),
          productId: r.productId,
          costCenterId: r.costCenterId,
          projectId: r.projectId,
          employeeId: r.employeeId,
        })),
      });
      cogsPreviewLines = cogsPlan.journalLines;
      cogsTotal = cogsPlan.totalCogs;
      for (const w of cogsPlan.warnings) {
        cogsWarnings.push({
          lineId: w.invoiceLineId, productId: w.productId,
          reason: w.reason, detail: w.detail,
        });
        // insufficient_stock is the same fatal condition /approve treats
        // as a ValidationError. Surface it as a BLOCKER here so the UI
        // can disable the approve button and explain WHY.
        if (w.reason === "insufficient_stock") {
          blockers.push({
            field: `invoice_lines[${w.invoiceLineId}]`,
            message: `مخزون غير كافٍ للسطر #${w.invoiceLineId}${w.detail ? ` — ${w.detail}` : ""}`,
          });
        }
      }
      // Splice the bucketed DR COGS / CR Inventory pairs into the
      // preview so the operator sees the COMPLETE JE that will post,
      // not a half view that hides the inventory side.
      for (const cl of cogsPreviewLines) {
        previewLines.push({
          accountCode: cl.accountCode,
          debit: cl.debit,
          credit: cl.credit,
          description: cl.description,
          dimensions: {
            costCenterId: cl.costCenterId,
            branchId: cl.branchId,
            projectId: cl.projectId,
            departmentId: cl.departmentId,
          },
        });
      }
    } catch (err) {
      // Don't let a preview-time failure break the rest of the response —
      // the operator can still see the revenue/AR/VAT view. Surface as a
      // soft warning so they know COGS isn't shown.
      logger.warn({ err, invoiceId: id }, "posting-preview: COGS plan failed");
      warnings.push({
        field: "cogs",
        message: "تعذّر حساب تكلفة البضاعة في المعاينة — راجع المخزون قبل الاعتماد",
      });
    }

    const totalDebit = roundTo2(previewLines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = roundTo2(previewLines.reduce((s, l) => s + l.credit, 0));
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005;

    res.json({
      invoiceId: id,
      invoiceRef: invoice.ref,
      canApprove: blockers.length === 0 && isBalanced,
      blockers,
      warnings,
      // Phase 5.5 — per-line resolver warnings (rule matched / no match
      // / required entity missing) so the UI can pin each warning to
      // the line it came from. Distinct from `warnings` above which
      // are document-level (period closed / no lines / rounding diff).
      resolverWarnings,
      // Audit follow-up to #1013 — per-line COGS warnings (product not
      // found / not tracked / insufficient stock). The UI can pin each
      // to the line so the operator knows which item to fix.
      cogsWarnings,
      cogsTotal,
      journalLines: previewLines,
      totals: { debit: totalDebit, credit: totalCredit, balanced: isBalanced },
    });
  } catch (err) {
    handleRouteError(err, res, "Preview posting error:");
  }
});

// Audit F5 — DOC. Defensive endpoint. Posting happens inside the
// approve flow (PATCH /invoices/:id/approve); this explicit /post
// variant is kept because `cogsPostingPreviewSmoke.test.ts` and
// `financeGoldenPath.test.ts:27` validate the posting flow via this
// path — deleting would lose the behavioural smoke contract.
invoicesRouter.post("/invoices/:id/post", authorize({ feature: "finance.invoices", action: "approve" }), requireOwnership({ table: "invoices", checks: ["company", "branch"] }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    await applyTransition({
      entity: "invoices",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "invoice.posted",
      fromStates: ["approved"],
      toState: "posted",
      setExtras: { postedBy: scope.userId, postedAt: { raw: "NOW()" } },
      extraWhere: `"deletedAt" IS NULL`,
    });

    // Verify GL entry exists
    const [glEntry] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "sourceType"='invoice' AND "sourceId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (!glEntry) {
      logger.warn(`[invoice-post] Invoice #${id} has no GL entry — should have been created on approval`);
    }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.posted", entity: "invoices", entityId: id }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [updated] = await rawQuery<Record<string, unknown>>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!updated) throw new NotFoundError("الفاتورة غير موجودة");
    res.json(updated);
  } catch (err) {
    if (typeof lifecycleErrorResponse === 'function') {
      const mapped = lifecycleErrorResponse(err);
      if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    }
    handleRouteError(err, res, "Post invoice error:");
  }
});

invoicesRouter.post("/invoices/:id/payment", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { amount, method = "bank_transfer" } = zodParse(createPaymentSchema.safeParse(req.body));

    // FIN-AUD-07 — payment recording into a closed period would post
    // DR Cash / CR AR onto the GL inside that period, moving balances
    // after close. The downstream postJournalEntry would reject it,
    // but the invoice's paidAmount UPDATE runs in a separate transaction
    // BEFORE the GL post — so a closed-period payment used to leave
    // invoices.paidAmount bumped while the GL had no matching entry
    // (silent AR overstatement). Gate the whole flow up front.
    const paymentDate = todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, paymentDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن تسجيل دفعة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "date", meta: { periodName: periodCheck.periodName } },
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [cashAccountCode, arAccountCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1111" : "1124"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_payment_ar", "credit", "1131"),
    ]);

    let invoiceRef!: string;
    let newPaid!: number;
    let newStatus!: string;
    let invoiceClientId: number | undefined;
    let invoiceBranchId: number | null = null;
    await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, total, "paidAmount", status, ref, "clientId", "branchId" FROM invoices
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [id, scope.companyId]
      );
      const invoice = invRes.rows[0];
      if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
      invoiceClientId = (invoice.clientId as number | null) ?? undefined;
      // Payment lands on the INVOICE's branch, not the operator's
      // active branch. Pre-fix the payment JE was hardcoded to
      // scope.branchId, so paying an Invoice-in-BranchA from a session
      // working in BranchB silently posted the cash inflow + AR
      // clearing to Branch B's books — per-branch AR aging diverged
      // from per-branch revenue forever. Validate the operator has
      // access to the invoice's branch (security check, not UX prompt).
      invoiceBranchId = (invoice.branchId as number | null) ?? null;
      if (invoiceBranchId != null) {
        assertDocumentBranchAccess(invoiceBranchId, {
          companyId: scope.companyId,
          branchId: scope.branchId,
          allowedBranches: (scope as any).allowedBranches,
        });
      }

      const lockedStatuses = ["paid", "closed", "cancelled"];
      if (lockedStatuses.includes(invoice.status)) {
        throw new ConflictError(
          `لا يمكن تسجيل دفعة على فاتورة بحالة "${invoice.status}" — الفاتورة مُقفلة`,
          { field: "status", fix: "لا يمكن تسجيل دفعات إضافية بعد الإقفال" }
        );
      }

      const remaining = Number(invoice.total) - Number(invoice.paidAmount);
      if (Number(amount) > remaining + 0.01) {
        throw new ValidationError(
          `مبلغ الدفع (${Number(amount).toFixed(2)}) يتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`,
          { field: "amount", fix: `المبلغ الأقصى المسموح هو ${remaining.toFixed(2)}` }
        );
      }

      invoiceRef = invoice.ref;
      newPaid = Number(invoice.paidAmount) + Number(amount);
      newStatus = newPaid >= Number(invoice.total) - 0.01 ? "paid" : "partial";
      const paidAt = newStatus === "paid" ? new Date().toISOString() : null;

      if (paidAt) {
        await client.query(
          `UPDATE invoices SET "paidAmount" = $1, status = $2, "paidAt" = $3 WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL`,
          [newPaid, newStatus, paidAt, id, scope.companyId]
        );
      } else {
        await client.query(
          `UPDATE invoices SET "paidAmount" = $1, status = $2 WHERE id = $3 AND "companyId" = $4 AND "deletedAt" IS NULL`,
          [newPaid, newStatus, id, scope.companyId]
        );
      }

      await client.query(
        `INSERT INTO event_logs ("companyId", "userId", action, entity, "entityId", details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [scope.companyId, scope.userId, "invoice.payment", "invoices", String(id),
         JSON.stringify({ fromStatus: invoice.status, toStatus: newStatus, amount: Number(amount), newPaidAmount: newPaid })]
      );

    });

    // Create the payment journal entry via the centralized helper (handles
    // balance validation, rounding-difference auto-correction,
    // updateAccountBalances, and event bus emission).
    //
    // sourceKey is anchored to the invoice + cumulative paidAmount so two
    // payments of the same magnitude on the same invoice each produce a
    // unique-but-stable key (paid amount is strictly monotonic per payment),
    // and a duplicated request is idempotent against the same journal.
    //
    // B1 (silent → visible) — the business UPDATE above committed in its own
    // transaction; the GL post here is outside it, and a GL failure (closed
    // period, bad account mapping, balance mismatch) would otherwise leave
    // the invoice paid with no corresponding cash/AR entry — silent AR
    // overstatement. Routing through createGuardedJournalEntry via
    // guardTable + guardId records the failure into financial_posting_failures
    // so the reconciliation queue can replay it instead of the inconsistency
    // staying invisible. Full atomicity would require threading a client
    // through the engine — out of scope for this small guarded fix.
    const paymentAmount = Number(amount);
    const paidScaled = Math.round(newPaid * 100);
    const { journalId, alreadyExists } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      // Payment JE lands on the invoice's own branch, not the operator's
      // working branch. Falls back to scope.branchId only if the invoice
      // has no branchId (legacy data — should be rare now that the create
      // route enforces it).
      branchId: invoiceBranchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: `PAY-${invoiceRef}-${paidScaled}`,
      description: `سداد فاتورة ${invoiceRef}`,
      type: "payment",
      sourceType: "invoice",
      sourceId: id,
      sourceKey: `finance:payment:${id}:${paidScaled}`,
      lines: [
        // Both legs carry clientId so per-customer cash inflow + AR
        // clearing reports drill cleanly from the GL — without this
        // the payment was attributable on the invoice header only,
        // not on the GL line.
        { accountCode: cashAccountCode, debit: paymentAmount, credit: 0, clientId: invoiceClientId },
        { accountCode: arAccountCode, debit: 0, credit: paymentAmount, clientId: invoiceClientId },
      ],
      guardTable: "invoices",
      guardId: id,
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.paid", entity: "invoices", entityId: id, after: { id }, details: JSON.stringify({ amount, method, newStatus }) }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.json({ message: "تم تسجيل الدفعة", newPaidAmount: newPaid, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "Record payment error:");
  }
});

// RBAC v2: scope check on invoice + field masking. Roles can mask
// sensitive fields like amount/vatAmount/discount via field policies.
invoicesRouter.get("/invoices/:id", authorize({ feature: "finance.invoices", action: "view", resource: { table: "invoices", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [invoice] = await rawQuery<Record<string, unknown>>(
      `SELECT i.*, c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail",
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL LEFT JOIN branches b ON b.id = i."branchId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
    const lines = await rawQuery<Record<string, unknown>>(`SELECT * FROM invoice_lines WHERE "invoiceId" = $1 ORDER BY id LIMIT 500`, [id]);
    const [payments, journalEntries] = await Promise.all([
      // #1715 correctness review (M3) — identify the payment by its PAY-<ref>
      // JE and sum its single DEBIT leg (the cash/bank inflow = paymentAmount).
      // The old `accountCode = '1100'` filter dropped bank/other-cash payments
      // entirely (DR 1110 or a tenant-mapped account); the payment JE has
      // exactly one debit leg, so SUM(debit) is the amount for ANY cash account.
      rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, je.description, je."createdAt" AS date, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE $2 AND jl.debit > 0 GROUP BY je.id, je.ref, je.description, je."createdAt" ORDER BY je."createdAt" DESC LIMIT 500`, [scope.companyId, `PAY-${invoice.ref}%`]),
      rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, je.description, je."createdAt" AS date FROM journal_entries je WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND (je.ref LIKE $2 OR je.ref LIKE $3) ORDER BY je."createdAt" DESC LIMIT 500`, [scope.companyId, `JE-${invoice.ref}%`, `PAY-${invoice.ref}%`]),
    ]);
    res.json(maskFields(req, { ...invoice, lines, payments, journalEntries }));
  } catch (err) {
    handleRouteError(err, res, "Invoice detail error:");
  }
});

invoicesRouter.patch("/invoices/:id", authorize({ feature: "finance.invoices", action: "update", resource: { table: "invoices", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { status, description, dueDate } = zodParse(patchInvoiceSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الفاتورة غير موجودة");

    // ZATCA compliance: an approved/sent tax invoice cannot be edited
    // in place. The Saudi tax authority requires the issuer to:
    //   1. Issue a credit memo against the original (full reversal).
    //   2. Issue a new invoice with a fresh sequential number reflecting
    //      the corrected lines.
    // The orchestrator at POST /invoices/:id/amend does both atomically.
    // PATCH stays open for in-place edits on drafts only (the operator's
    // working copy before issuance).
    const issuedStatuses = ["approved", "sent", "partial", "paid", "overdue", "posted", "delivered", "ordered", "invoiced", "closed"];
    if (issuedStatuses.includes(existing.status as string)) {
      throw new ConflictError(
        `لا يمكن تعديل فاتورة مُصدَرة (${existing.status}) مباشرةً — أنظمة هيئة الزكاة والضرائب تستوجب إصدار إشعار دائن للفاتورة الأصلية ثم فاتورة جديدة بترقيم متسلسل`,
        {
          field: "status",
          fix: `استخدم POST /invoices/${id}/amend — سيُصدر النظام تلقائياً إشعاراً دائناً للفاتورة الأصلية ثم فاتورة جديدة مرتبطة بها`,
          meta: { code: "ZATCA_AMEND_REQUIRED", amendEndpoint: `/api/finance/invoices/${id}/amend` },
        }
      );
    }

    // State machine: lifecycle transitions (draft→sent, sent→paid,
    // paid→closed) must go through the dedicated endpoints. PATCH is
    // limited to allowlist edits.
    if (status !== undefined && status !== existing.status) {
      if (!(INVOICE_STATUSES as readonly string[]).includes(status)) {
        throw new ValidationError(
          `حالة فاتورة غير صالحة: ${status}`,
          { field: "status", fix: `اختر من: ${INVOICE_STATUSES.join(", ")}` }
        );
      }
      if (["sent", "paid", "partial"].includes(status)) {
        throw new ConflictError(
          `لا يمكن نقل الفاتورة إلى "${status}" عبر PATCH`,
          { field: "status", fix: "استخدم /invoices/:id/send أو /invoices/:id/payment" }
        );
      }
      const allowedNext = INVOICE_TRANSITIONS[existing.status as string] ?? [];
      if (!allowedNext.includes(status)) {
        throw new ConflictError(
          `لا يمكن نقل الفاتورة من "${existing.status}" إلى "${status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد (حالة نهائية)"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let idx = 1;
    if (status !== undefined && status !== existing.status) {
      sets.push(`status = $${idx++}`); params.push(status);
      before.status = existing.status; after.status = status;
    }
    if (description !== undefined && description !== existing.description) {
      // ZATCA-mutation guard: once an invoice has been submitted to ZATCA
      // (zatcaStatus IS NOT NULL — values include 'submitted', 'accepted',
      // 'rejected' per finance-zatca.ts), its description is part of the
      // record sent to the tax authority (finance-zatca.ts uses
      // invoice.description as the line-description fallback). Editing it
      // here creates a local-vs-ZATCA divergence: the regulator's record
      // shows the original text while the local DB shows the new one.
      // The sanctioned correction path for a submitted invoice is a credit
      // memo + re-issue, not an in-place description rewrite.
      if (existing.zatcaStatus !== null && existing.zatcaStatus !== undefined) {
        throw new ConflictError(
          `لا يمكن تعديل وصف فاتورة مُسجَّلة في ZATCA (الحالة: ${existing.zatcaStatus}) — استخدم إشعار دائن + إعادة إصدار`,
          {
            field: "description",
            fix: "أنشئ إشعار دائن (credit memo) ثم أعد إصدار الفاتورة بالوصف الصحيح",
            meta: { zatcaStatus: existing.zatcaStatus },
          }
        );
      }
      sets.push(`description = $${idx++}`); params.push(description);
      before.description = existing.description; after.description = description;
    }
    if (dueDate !== undefined && dueDate !== existing.dueDate) {
      sets.push(`"dueDate" = $${idx++}`); params.push(dueDate);
      before.dueDate = existing.dueDate; after.dueDate = dueDate;
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", { fix: "أرسل حقلاً واحداً على الأقل لتعديله" });
    }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE invoices SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`, params);
    if (!row) throw new NotFoundError("الفاتورة غير موجودة");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "invoices",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "invoice.status_changed" : "invoice.updated",
      entity: "invoices",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Patch invoice error:");
  }
});

invoicesRouter.delete("/invoices/:id", authorize({ feature: "finance.invoices", action: "delete", resource: { table: "invoices", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const [inv] = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, status, "paidAmount", "createdAt", "clientId", total, "vatAmount" FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!inv) throw new NotFoundError("الفاتورة غير موجودة");
    if (Number(inv.paidAmount) > 0) {
      throw new ConflictError(
        "لا يمكن حذف فاتورة عليها تحصيلات",
        { field: "paidAmount", fix: "قم بعكس التحصيل أولاً ثم أعد المحاولة" }
      );
    }
    // Statuses past approval bumped clients.totalRevenue; cancelling /
    // soft-deleting must put that revenue back.
    const REVENUE_RECOGNIZED_STATUSES = new Set(["approved", "sent", "partial", "overdue", "paid"]);
    const wasRecognised = REVENUE_RECOGNIZED_STATUSES.has(String(inv.status));

    // FIN-AUD-06 — block soft-delete in a closed period. The DELETE reverses
    // the original GL push, so allowing it in a locked period would move
    // GL balances inside that period after close. CREATE / PATCH already
    // call checkFinancialPeriodOpen; deletion was the lone gap.
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, toDateISO(inv.createdAt as string | Date));
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن حذف فاتورة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "createdAt", meta: { periodName: periodCheck.periodName } },
      );
    }

    // Reverse the GL balances that were pushed at creation time so AR /
    // Revenue / VAT payable drop back. The journal_entries row is located via
    // its ref (JE-<invoice ref>) since invoices don't store a journalId column.
    // `createdAt` is needed to derive the period that the approval-time
    // budgets.used bump targeted (currentPeriod() at approval = JE createdAt
    // period), so the decrement hits the same bucket.
    const [je] = await rawQuery<Record<string, unknown>>(
      `SELECT id, status, "createdAt" FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, `JE-${inv.ref}`]
    );
    await withTransaction(async (client: any) => {
      if (je) {
        // A4 (silent ledger corruption) — only reverse the GL deltas if the JE
        // has not already been cancelled. A reject/return leaves the JE with
        // status='cancelled' but deletedAt=NULL, so without this guard deleting
        // a previously-rejected invoice would reverse currentBalance a second
        // time, overshooting by the invoice amount. The reject/return path
        // applies the symmetric `status !== 'cancelled'` guard at its own
        // reversal site (see invoiceApprovalAction).
        if (je.status !== "cancelled") {
          const { rows: lines } = await client.query(
            `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId" = $1 AND "deletedAt" IS NULL`,
            [Number(je.id)]
          );
          for (const line of lines) {
            const delta = -(Number(line.debit) - Number(line.credit));
            if (Math.abs(delta) < 0.001) continue;
            await client.query(
              `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1 WHERE "companyId" = $2 AND code = $3`,
              [delta, scope.companyId, line.accountCode]
            );
          }
        }
        await client.query(
          `UPDATE journal_entries SET "deletedAt" = NOW(), status = 'cancelled' WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [Number(je.id), scope.companyId]
        );
      }
      await client.query(
        `UPDATE invoices SET "deletedAt" = NOW(), status = 'cancelled' WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );
      // Reverse the revenue recognised at approval — without this the
      // denormalised counter inflates over time as approved invoices get
      // cancelled.
      if (wasRecognised && inv.clientId) {
        const net = Number(inv.total) - Number(inv.vatAmount || 0);
        if (net > 0) {
          await client.query(
            `UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) - $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
            [net, inv.clientId, scope.companyId]
          );
        }
      }

      // Reverse the budgets.used bump that approval applied. Same gate
      // (revenue-recognized status + JE exists) so the decrement only
      // fires when the bump actually happened. Period is the JE's
      // createdAt month — the same value `currentPeriod()` had at
      // approval time — so the decrement lands in the bucket that was
      // inflated.
      if (wasRecognised && je && je.createdAt) {
        const net = Number(inv.total) - Number(inv.vatAmount || 0);
        if (net > 0) {
          const { financialEngine } = await import("../lib/engines/index.js");
          const invRevenueCode = await financialEngine.resolveAccountCode(
            scope.companyId, "invoice_revenue", "credit", "4111"
          );
          const approvalPeriod = String(je.createdAt).slice(0, 7);
          await client.query(
            `UPDATE budgets SET used = GREATEST(used - $1, 0)
             WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
            [net, scope.companyId, invRevenueCode, approvalPeriod]
          );
        }
      }

      // Audit finding F6: cancelling a revenue-recognised invoice that
      // had product lines must reverse the COGS draw + restock lots,
      // exactly like the credit-memo route does. Without this the
      // inventory side stays drawn while the sale side is gone —
      // stock report shows the goods out but the books show no sale.
      // Same shape as the amend orchestrator fix in #1525.
      if (wasRecognised && je && je.status !== "cancelled") {
        const { planCogsReversal, applyStockReversals } = await import(
          "../lib/inventory/cogsPosting.js"
        );
        const reversalPlan = await planCogsReversal(client as any, {
          companyId: scope.companyId,
          invoiceId: id,
          ratio: 1.0,
          memoId: 0,
        });
        if (reversalPlan.lineUpdates.length > 0) {
          await applyStockReversals(
            client as any, scope.companyId,
            reversalPlan.stockMovements, scope.activeAssignmentId ?? 0,
          );
          for (const u of reversalPlan.lineUpdates) {
            await client.query(
              `UPDATE invoice_lines
                  SET "cogsReversedAmount" = $1,
                      "cogsReversedAt"     = NOW(),
                      "cogsReversalJson"   = COALESCE("cogsReversalJson", '[]'::jsonb) || $2::jsonb
                WHERE id = $3`,
              [u.newReversedAmount, JSON.stringify([u.snapshot]), u.invoiceLineId],
            );
          }
        }
      }
    });
    rawExecute(
      `INSERT INTO event_logs ("companyId", "userId", action, entity, "entityId", details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [scope.companyId, scope.userId, "invoice.deleted", "invoices", String(id),
       JSON.stringify({ fromStatus: inv.status, toStatus: "cancelled" })]
    ).catch((e) => logger.error(e, "finance-invoices background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "invoices", entityId: id,
      before: { status: inv.status }, after: { status: "cancelled" },
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "invoice.deleted", entity: "invoices", entityId: id,
      details: `تم حذف الفاتورة ${inv.ref} وعكس رصيد GL`,
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete invoice error:");
  }
});

async function invoiceApprovalAction(req: any, res: any, newStatus: "approved" | "rejected" | "returned") {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    // #1715 correctness review (H1) — approval MUST post the revenue/AR/VAT JE.
    // This status-only path posted NO GL, stranding the invoice as "approved"
    // with no ledger impact (and POST /invoices/:id/post then only flips
    // approved→posted, so the JE never appeared). The GL-posting approval lives
    // at POST /invoices/:id/approve — route approvals there. This function keeps
    // serving reject/return (which correctly post the GL reversal).
    if (newStatus === "approved") {
      throw new ConflictError(
        "اعتماد الفاتورة يجب أن يمرّ عبر مسار الترحيل المحاسبي",
        { field: "status", fix: "استخدم POST /finance/invoices/:id/approve لاعتماد الفاتورة مع ترحيل القيد (إيراد/ذمم/ضريبة)" }
      );
    }
    const { notes } = zodParse(invoiceApprovalActionSchema.safeParse(req.body ?? {}));
    if ((newStatus === "rejected" || newStatus === "returned") && (!notes || !String(notes).trim())) {
      throw new ValidationError(
        newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع",
        { field: "notes", fix: "أدخل سبب القرار في حقل الملاحظات" }
      );
    }

    const fromStates = Object.entries(INVOICE_TRANSITIONS)
      .filter(([, targets]) => (targets as readonly string[]).includes(newStatus))
      .map(([src]) => src);

    const row = await applyTransition({
      entity: "invoices",
      id,
      scope,
      action: `invoice.${newStatus}`,
      fromStates,
      toState: newStatus,
      extraWhere: `"deletedAt" IS NULL`,
      reason: notes ?? undefined,
      after: { notes: notes ?? null },
      onApply: async (inv, client) => {
        if (newStatus === "rejected" || newStatus === "returned") {
          const jeRes = await client.query(
            `SELECT id, status, "createdAt" FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL`,
            [scope.companyId, `JE-${inv.ref}`]
          );
          const je = jeRes.rows[0];
          if (je && je.status !== "cancelled") {
            try {
              await reverseAccountBalances(scope.companyId, Number(je.id));
              await client.query(
                `UPDATE journal_entries SET status = 'cancelled' WHERE id = $1 AND "companyId" = $2 AND status IN ('posted', 'approved') AND "deletedAt" IS NULL`,
                [Number(je.id), scope.companyId]
              );

              // C2 follow-up — approval bumped clients.totalRevenue and
              // budgets.used by the invoice net amount. Reject/return on a
              // previously-approved invoice must reverse those same
              // counters or downstream dashboards inflate forever (PR #892
              // closed this for credit_memo + DELETE; this is the third
              // exit point: approved → rejected/returned).
              const net = Number(inv.total) - Number(inv.vatAmount || 0);
              if (inv.clientId && net > 0) {
                await client.query(
                  `UPDATE clients SET "totalRevenue" = GREATEST(COALESCE("totalRevenue",0) - $1, 0)
                   WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
                  [net, inv.clientId, scope.companyId]
                );
              }
              // Budget decrement targets the period that the approval
              // bumped (= the JE's createdAt month, not currentPeriod()
              // which may be a different calendar month).
              if (net > 0) {
                const { financialEngine } = await import("../lib/engines/index.js");
                const invRevenueCode = await financialEngine.resolveAccountCode(
                  scope.companyId, "invoice_revenue", "credit", "4111"
                );
                const approvalPeriod = String(je.createdAt).slice(0, 7); // YYYY-MM
                await client.query(
                  `UPDATE budgets SET used = GREATEST(used - $1, 0)
                   WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
                  [net, scope.companyId, invRevenueCode, approvalPeriod]
                );
              }

              // Audit finding F6: reject/return on a previously-approved
              // product invoice must reverse the inventory + COGS draw,
              // not just AR/VAT/revenue. Same shape as DELETE above and
              // the amend orchestrator fix in #1525.
              const { planCogsReversal, applyStockReversals } = await import(
                "../lib/inventory/cogsPosting.js"
              );
              const reversalPlan = await planCogsReversal(client as any, {
                companyId: scope.companyId,
                invoiceId: id,
                ratio: 1.0,
                memoId: 0,
              });
              if (reversalPlan.lineUpdates.length > 0) {
                await applyStockReversals(
                  client as any, scope.companyId,
                  reversalPlan.stockMovements, scope.activeAssignmentId ?? 0,
                );
                for (const u of reversalPlan.lineUpdates) {
                  await client.query(
                    `UPDATE invoice_lines
                        SET "cogsReversedAmount" = $1,
                            "cogsReversedAt"     = NOW(),
                            "cogsReversalJson"   = COALESCE("cogsReversalJson", '[]'::jsonb) || $2::jsonb
                      WHERE id = $3`,
                    [u.newReversedAmount, JSON.stringify([u.snapshot]), u.invoiceLineId],
                  );
                }
              }
            } catch (e) { logger.error(e, "Failed to reverse invoice GL on rejection:"); }
          }
        }
        try {
          await client.query(
            `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('invoice',$1,$2,$3,$4,$5)`,
            [id, newStatus, notes || null, scope.userId, scope.companyId]
          );
        } catch (e) { logger.error(e, "finance-invoices error"); }
      },
    });

    if (row.createdBy) {
      const titleMap: Record<string, string> = { approved: "تم اعتماد الفاتورة", rejected: "تم رفض الفاتورة", returned: "تم إرجاع الفاتورة" };
      createNotification({
        companyId: scope.companyId,
        assignmentId: Number(row.createdBy),
        type: `invoice_${newStatus}`,
        title: titleMap[newStatus] || `حالة الفاتورة: ${newStatus}`,
        body: `الفاتورة ${row.ref || id}${notes ? ` — ${notes}` : ''}`,
        priority: newStatus === "rejected" ? "high" : "normal",
        refType: "invoice",
        refId: id,
        actionUrl: `/finance/invoices/${id}`,
      }).catch((e) => logger.error(e, "finance-invoices background task failed"));
    }

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    const le = lifecycleErrorResponse(err);
    if (le) { res.status(le.status).json(le.body); return; }
    handleRouteError(err, res, `Invoice ${newStatus} error:`);
  }
}

// PATCH /invoices/:id/approve was retired (#1715): it approved WITHOUT GL
// posting and the FE never called it. Approval now goes through
// POST /invoices/:id/approve (GL-posting). reject/return keep the PATCH verb.
invoicesRouter.patch("/invoices/:id/reject", authorize({ feature: "finance.invoices", action: "update" }), (req, res) => invoiceApprovalAction(req, res, "rejected"));
invoicesRouter.patch("/invoices/:id/return", authorize({ feature: "finance.invoices", action: "update" }), (req, res) => invoiceApprovalAction(req, res, "returned"));

invoicesRouter.get("/tax/summary", authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as Record<string, string | undefined>;
    const targetPeriod = period ?? currentPeriod();
    const { financialEngine } = await import("../lib/engines/index.js");
    const inputVatCode = await financialEngine.resolveAccountCode(scope.companyId, "vat_input", "debit", "1180");
    // Output VAT for the period:
    //   + invoice VAT (customer charged)
    //   - credit-memo VAT (customer credited — output VAT reverses)
    //   + debit-memo VAT (customer additionally charged — extra output VAT)
    //
    // Each source must be filtered by its journal entry being on the books
    // (`balancesApplied = true`) and not reversed (`reversedById IS NULL`),
    // matching the input-VAT query semantics. Otherwise draft and reversed
    // entries inflate the VAT return.
    const [outputVatInvoices] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(i."vatAmount"), 0) AS total
         FROM invoices i
         JOIN journal_entries je ON je.id = i."journalEntryId"
        WHERE i."companyId" = $1
          AND to_char(i."createdAt", 'YYYY-MM') = $2
          AND i."deletedAt" IS NULL
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL`,
      [scope.companyId, targetPeriod]
    );
    const [outputVatCreditMemos] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(cm."vatAmount"), 0) AS total
         FROM credit_memos cm
         JOIN journal_entries je ON je.id = cm."journalId"
        WHERE cm."companyId" = $1
          AND to_char(cm."memoDate", 'YYYY-MM') = $2
          AND cm."deletedAt" IS NULL
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL`,
      [scope.companyId, targetPeriod]
    );
    const [outputVatDebitMemos] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(dm."vatAmount"), 0) AS total
         FROM debit_memos dm
         JOIN journal_entries je ON je.id = dm."journalId"
        WHERE dm."companyId" = $1
          AND to_char(dm."memoDate", 'YYYY-MM') = $2
          AND dm."deletedAt" IS NULL
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL`,
      [scope.companyId, targetPeriod]
    );
    const [inputVat] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(jl.debit), 0) AS total
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL
        WHERE je."companyId" = $1
          AND jl."deletedAt" IS NULL
          AND jl."accountCode" = $3
          AND to_char(je."createdAt", 'YYYY-MM') = $2`,
      [scope.companyId, targetPeriod, inputVatCode]
    );
    const outputTotal =
      Number(outputVatInvoices?.total ?? 0)
      - Number(outputVatCreditMemos?.total ?? 0)
      + Number(outputVatDebitMemos?.total ?? 0);
    const inputTotal = Number(inputVat?.total ?? 0);
    const vatRate = await getCompanyVatRate(scope.companyId);
    res.json({ period: targetPeriod, outputVat: outputTotal, inputVat: inputTotal, netVat: outputTotal - inputTotal, vatRate, status: outputTotal - inputTotal > 0 ? "payable" : "refundable" });
  } catch (err) {
    handleRouteError(err, res, "Tax summary error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT & DEBIT MEMOS
// A credit memo (إشعار دائن) reduces a customer's outstanding invoice — we
// recognize a sales return/allowance and reduce AR:
//   DR 4100 sales_returns   (contra-revenue)
//   DR 2300 VAT payable     (reverse output VAT)
//   CR 1200 accounts rec.   (reduces the customer's AR)
//
// A debit memo (إشعار مدين) charges the customer extra — a mirror of an
// invoice:
//   DR 1200 AR
//   CR 4000 revenue  (additional charge)
//   CR 2300 VAT payable
// ─────────────────────────────────────────────────────────────────────────────

// Credit-memo PREVIEW (audit follow-up to #1017).
//
// Mirrors the GL + COGS-reversal math the /credit-memo handler runs
// at commit time, but writes nothing. Lets the UI show:
//
//   * the full JE that WILL post (contra-revenue + VAT reversal + AR
//     credit + DR Inventory / CR COGS),
//   * blockers (closed period, amount over open balance, …) so the
//     "Create Memo" button is grey BEFORE the user clicks,
//   * the per-line COGS-reversal snapshot so the operator can see
//     exactly which lots will be restocked at what cost.
//
// Read-only, no transaction, no idempotency token.
invoicesRouter.post("/invoices/:id/credit-memo/preview", authorize({
  feature: "finance.invoices",
  action: "view",
  resource: { table: "invoices", idParam: "id", columns: ['"companyId"', '"branchId"'] },
}), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { amount, vatIncluded = true, memoDate } = zodParse(previewCreditMemoSchema.safeParse(req.body));

    const creditAmount = roundTo2(Number(amount));
    const memoDateStr = memoDate ? toDateISO(memoDate) : todayISO();

    const blockers: { field: string; message: string }[] = [];
    const warnings: { field: string; message: string }[] = [];

    const [invoice] = await rawQuery<{
      id: number; ref: string; total: string | number;
      paidAmount: string | number; vatRate: string | number | null;
      branchId: number | null; clientId: number | null; taxCode: string | null;
    }>(
      `SELECT id, ref, total, "paidAmount", "vatRate", "branchId", "clientId", "taxCode"
         FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    // Period gate — same as the commit-time check.
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      blockers.push({
        field: "memoDate",
        message: `الفترة المالية مغلقة (${periodCheck.periodName ?? memoDateStr}) — لا يمكن إصدار إشعار دائن`,
      });
    }

    // Cap-gate — credit can't exceed remaining open balance.
    const openBalance = roundTo2(Number(invoice.total) - Number(invoice.paidAmount));
    if (creditAmount > openBalance + 0.01) {
      blockers.push({
        field: "amount",
        message: `المبلغ (${creditAmount}) يتجاوز الرصيد المفتوح (${openBalance})`,
      });
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [previewSalesReturnsCode, previewVatFallback, previewArCode, previewVatSpecific] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_sales_returns", "debit", "4113"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "debit", "2131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "credit", "1131"),
      // البند ٤ — المعاينة تعكس حساب رمز الضريبة الذي سيعكسه إصدار الإشعار.
      invoice.taxCode
        ? getOutputVatAccountCode(scope.companyId, invoice.taxCode as string)
        : Promise.resolve(null),
    ]);
    const previewVatPayableCode = resolveVatLegAccount(previewVatSpecific, previewVatFallback);

    const vatRate = Number(invoice.vatRate ?? await getCompanyVatRate(scope.companyId));
    const previewNet = vatIncluded ? extractBaseFromGross(creditAmount, vatRate) : creditAmount;
    const previewVat = roundTo2(creditAmount - previewNet);

    // Plan the COGS reversal via the SAME helper /credit-memo uses, so
    // the preview reflects whatever the commit would do — including
    // the "remaining unreversed COGS" cap (a third 0.5-memo can't
    // restock anything).
    const { planCogsReversal } = await import("../lib/inventory/cogsPosting.js");
    const { pool: cogsPool } = await import("../lib/rawdb.js");
    const invoiceTotal = Number(invoice.total) || 0;
    const reversalRatio = invoiceTotal > 0 ? creditAmount / invoiceTotal : 0;
    let cogsReversalPreview: Awaited<ReturnType<typeof planCogsReversal>> = {
      journalLines: [], stockMovements: [], lineUpdates: [], totalReversed: 0,
      warnings: [],
    };
    try {
      cogsReversalPreview = await planCogsReversal(cogsPool as never, {
        companyId: scope.companyId,
        invoiceId: id,
        ratio: reversalRatio,
        memoId: 0, // preview only — no memo row yet
      });
    } catch (err) {
      logger.warn({ err, invoiceId: id }, "credit-memo preview: COGS plan failed");
      warnings.push({
        field: "cogs",
        message: "تعذّر حساب عكس تكلفة البضاعة في المعاينة — راجع المخزون قبل الإصدار",
      });
    }

    const previewLines = [
      { accountCode: previewSalesReturnsCode, debit: previewNet, credit: 0,
        description: `مرتجع مبيعات — فاتورة ${invoice.ref}` },
      ...(previewVat > 0
        ? [{ accountCode: previewVatPayableCode, debit: previewVat, credit: 0,
             description: `استرداد ضريبة قيمة مضافة — فاتورة ${invoice.ref}` }]
        : []),
      { accountCode: previewArCode, debit: 0, credit: creditAmount,
        description: `إشعار دائن — فاتورة ${invoice.ref}` },
      ...cogsReversalPreview.journalLines,
    ];
    const totalDebit = roundTo2(previewLines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = roundTo2(previewLines.reduce((s, l) => s + l.credit, 0));
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005;

    res.json({
      invoiceId: id,
      invoiceRef: invoice.ref,
      canIssue: blockers.length === 0 && isBalanced,
      blockers,
      warnings,
      memoDate: memoDateStr,
      creditAmount,
      netAmount: previewNet,
      vatAmount: previewVat,
      reversalRatio: roundTo2(Math.min(reversalRatio, 1)),
      cogsTotal: cogsReversalPreview.totalReversed,
      // Per-line snapshot so the UI can show the operator EXACTLY which
      // lots will be restocked + at what unit cost.
      cogsLineSnapshots: cogsReversalPreview.lineUpdates.map((u) => ({
        invoiceLineId: u.invoiceLineId,
        newReversedAmount: u.newReversedAmount,
        cogsReversed: u.snapshot.cogsReversed,
        allocations: u.snapshot.allocations,
      })),
      // Lot-status warnings (quarantine / recalled / expired / disposed /
      // qc-rejected / lot deleted) so the UI can show "review before
      // approval" BEFORE the operator commits the memo.
      cogsReversalWarnings: cogsReversalPreview.warnings,
      journalLines: previewLines,
      totals: { debit: totalDebit, credit: totalCredit, balanced: isBalanced },
    });
  } catch (err) {
    handleRouteError(err, res, "Credit memo preview error:");
  }
});

invoicesRouter.post("/invoices/:id/credit-memo", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { amount, reason, vatIncluded = true, memoDate, deductionCandidateId } = zodParse(createCreditMemoSchema.safeParse(req.body));

    const creditAmount = roundTo2(Number(amount));
    const memoDateStr = memoDate
      ? toDateISO(memoDate)
      : todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن إصدار إشعار دائن في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [salesReturnsCode, vatPayableFallback, arCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_sales_returns", "debit", "4113"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "debit", "2131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "credit", "1131"),
    ]);

    let memoId: number | null = null;
    let invoice: any;
    let net!: number;
    let vat!: number;
    let memoJournalResult: { journalId: number; alreadyExists: boolean } | null = null;
    // Plan COGS reversal alongside the financial entries — the planner
    // runs inside the same withTransaction so a JE failure rolls the
    // stock restock back automatically. See lib/inventory/cogsPosting.ts.
    // Initialised to the empty plan so the spread below stays typed
    // without `?.` narrowing through a closure.
    type CogsReversalPlanT = import("../lib/inventory/cogsPosting.js").CogsReversalPlan;
    let cogsReversalPlan: CogsReversalPlanT = {
      journalLines: [], stockMovements: [], lineUpdates: [], totalReversed: 0,
      warnings: [],
    };
    // Atomicity guarantee: credit_memos INSERT, invoice paidAmount/status
    // bump, clients.totalRevenue reversal, budgets.used decrement, AND the
    // GL post all commit or roll back together. The previous shape ran the
    // first four inside withTransaction and called financialEngine.post
    // OUTSIDE — a JE post that threw (closed period, missing accounting_
    // mapping, account allowPosting=false) left the credit_memos row +
    // counters committed with no ledger movement. Worse, there's no
    // idempotency on the credit_memos INSERT itself: a retry creates a
    // duplicate memo row AND double-counts paidAmount + totalRevenue +
    // budgets.used. financialEngine.postJournalEntry's internal
    // withTransaction joins this outer one reentrantly via SAVEPOINT
    // (rawdb.ts:108).
    await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, ref, "clientId", "companyId", "branchId", total, "vatAmount",
                "paidAmount", "vatRate", "taxCode"
           FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [id, scope.companyId]
      );
      invoice = invRes.rows[0];
      if (!invoice) {
        throw new NotFoundError("الفاتورة غير موجودة");
      }
      // البند ٤ — يُعكَس سطر الضريبة على نفس حساب رمز ضريبة الفاتورة الذي رُحّل
      // عند الاعتماد، وإلا الاحتياطي العام؛ فتُغلق تسوية الحساب صفرًا.
      const vatPayableCode = resolveVatLegAccount(
        invoice.taxCode ? await getOutputVatAccountCode(scope.companyId, invoice.taxCode) : null,
        vatPayableFallback,
      );
      const openBalance = roundTo2(Number(invoice.total) - Number(invoice.paidAmount));
      if (creditAmount > openBalance + 0.01) {
        throw new ValidationError(`المبلغ (${creditAmount}) يتجاوز الرصيد المفتوح (${openBalance})`);
      }

      const vatRate = Number(invoice.vatRate ?? await getCompanyVatRate(scope.companyId));
      net = vatIncluded
        ? extractBaseFromGross(creditAmount, vatRate)
        : creditAmount;
      vat = roundTo2(creditAmount - net);

      // G12 fix (Issue #1141 coverage report 2026-05-27 §3 G12) —
      // issue a real credit_memo ref through the numbering center
      // (scheme `finance.credit_memo`, seeded by migration 213). The
      // previous code created the row with ref = NULL. issueNumber's
      // inner withTransaction joins this outer one via SAVEPOINT.
      const issuedMemo = await issueNumber({
        companyId: scope.companyId,
        branchId: invoice.branchId,
        moduleKey: "finance",
        entityKey: "credit_memo",
        entityTable: "credit_memos",
        actorId: scope.userId,
        metadata: { sourceInvoiceId: id },
        expectedTiming: "on_draft",
      });

      try {
        const ins = await client.query(
          `INSERT INTO credit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy",ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [scope.companyId, invoice.branchId, id, invoice.clientId, creditAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId, issuedMemo.number]
        );
        memoId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          // Table does not exist — create it lazily
          await client.query(
            `CREATE TABLE IF NOT EXISTS credit_memos (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               "invoiceId" INTEGER NOT NULL,
               "clientId" INTEGER,
               amount NUMERIC(18,2) NOT NULL,
               "netAmount" NUMERIC(18,2) NOT NULL,
               "vatAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               reason TEXT NOT NULL,
               "memoDate" DATE NOT NULL,
               "journalId" INTEGER,
               "createdBy" INTEGER,
               ref TEXT,
               "createdAt" TIMESTAMP DEFAULT NOW()
             )`
          );
          const ins2 = await client.query(
            `INSERT INTO credit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy",ref)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [scope.companyId, invoice.branchId, id, invoice.clientId, creditAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId, issuedMemo.number]
          );
          memoId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [memoId, issuedMemo.assignmentId]
      );

      // Reduce invoice effective total via paidAmount adjustment (treat memo as
      // virtual payment so aging / collection logic treats it as settled).
      await client.query(
        `UPDATE invoices SET "paidAmount" = COALESCE("paidAmount",0) + $1,
                             status = CASE
                               WHEN COALESCE("paidAmount",0) + $1 >= total THEN 'paid'
                               WHEN COALESCE("paidAmount",0) + $1 > 0 THEN 'partial'
                               ELSE status END
         WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [creditAmount, id, scope.companyId]
      );

      // Reverse the revenue recognised at invoice approval. The approval
      // route bumped clients.totalRevenue by the invoice net; the credit
      // memo refunds part of that revenue, so the denormalised counter
      // must come back down by the memo's net or it inflates forever.
      if (invoice.clientId && net > 0) {
        await client.query(
          `UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) - $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
          [net, invoice.clientId, scope.companyId]
        );
      }

      // ── COGS reversal (Audit follow-up to #1002/#1013) ──────────────
      // Plan the inverted DR Inventory / CR COGS lines + the lot
      // restock for this memo's slice of the original sale.
      // ratio = creditAmount / invoice.total → 1.0 for a full return,
      // < 1 for partials. Skipped (empty plan) when the invoice had
      // no COGS to begin with (service-only invoice).
      const { planCogsReversal, applyStockReversals } = await import(
        "../lib/inventory/cogsPosting.js"
      );
      const invoiceTotal = Number(invoice.total) || 0;
      const reversalRatio = invoiceTotal > 0 ? creditAmount / invoiceTotal : 0;
      cogsReversalPlan = await planCogsReversal(client as any, {
        companyId: scope.companyId,
        invoiceId: id,
        ratio: reversalRatio,
        memoId: memoId ?? 0,
      });
      if (cogsReversalPlan.lineUpdates.length > 0) {
        await applyStockReversals(
          client as any, scope.companyId,
          cogsReversalPlan.stockMovements, scope.activeAssignmentId ?? 0,
        );
        for (const u of cogsReversalPlan.lineUpdates) {
          await client.query(
            `UPDATE invoice_lines
                SET "cogsReversedAmount" = $1,
                    "cogsReversedAt"     = NOW(),
                    "cogsReversalJson"   = COALESCE("cogsReversalJson", '[]'::jsonb) || $2::jsonb
              WHERE id = $3`,
            [u.newReversedAmount, JSON.stringify([u.snapshot]), u.invoiceLineId],
          );
        }
        await client.query(
          `UPDATE credit_memos SET "cogsReversedTotal" = $1
            WHERE id = $2 AND "companyId" = $3`,
          [cogsReversalPlan.totalReversed, memoId, scope.companyId],
        );
      }

      // Reverse the budgets.used bump proportional to the memo's net. The
      // approval bumped the revenue budget by the full invoice net for the
      // JE's createdAt month; a credit memo refunds part of that revenue,
      // so the same bucket is decremented by the memo's net.
      if (net > 0) {
        const origJeRes = await client.query(
          `SELECT "createdAt" FROM journal_entries
            WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL
            LIMIT 1`,
          [scope.companyId, `JE-${invoice.ref}`]
        );
        const origJe = origJeRes.rows[0];
        if (origJe && origJe.createdAt) {
          const { financialEngine } = await import("../lib/engines/index.js");
          const invRevenueCode = await financialEngine.resolveAccountCode(
            scope.companyId, "invoice_revenue", "credit", "4111"
          );
          const approvalPeriod = String(origJe.createdAt).slice(0, 7);
          await client.query(
            `UPDATE budgets SET used = GREATEST(used - $1, 0)
             WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
            [net, scope.companyId, invRevenueCode, approvalPeriod]
          );
        }
      }

      // GL post INSIDE the txn so a throw rolls back the memo row +
      // counter updates. Engine's internal withTransaction joins
      // reentrantly via SAVEPOINT.
      memoJournalResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: invoice.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `CM-${invoice.ref}-${memoId}`,
        description: `إشعار دائن على الفاتورة ${invoice.ref}: ${reason}`,
        sourceType: "credit_memo",
        sourceId: memoId ?? 0,
        sourceKey: `finance:credit_memo:${memoId}`,
        lines: [
          { accountCode: salesReturnsCode, debit: net, credit: 0, clientId: invoice.clientId },
          ...buildVatLeg({ amount: vat, side: "debit", accountCode: vatPayableCode, clientId: invoice.clientId }),
          { accountCode: arCode, debit: 0, credit: creditAmount, clientId: invoice.clientId },
          // COGS reversal lines (DR Inventory / CR COGS) — only present
          // when the original sale had inventoried lines. Service-only
          // invoices keep the byte-identical pre-PR JE shape.
          ...cogsReversalPlan.journalLines,
        ],
        guardTable: "credit_memos",
        guardId: memoId ?? 0,
      });

      // Stamp the JE id back on the credit memo inside the same txn so
      // the credit_memos.journalId FK invariant either lands complete
      // or rolls back with everything else.
      if (memoJournalResult.journalId && memoId) {
        await client.query(
          `UPDATE credit_memos SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [memoJournalResult.journalId, memoId, scope.companyId]
        );

        // Retroactively stamp the JE id onto the warehouse_movements
        // rows we wrote above (applyStockReversals runs BEFORE the JE
        // post, so it couldn't pass the id at insert-time). Match by
        // (companyId, reference, type='return', journalEntryId IS NULL)
        // — the reference is unique-per-memo so this targets exactly
        // the rows from this run. Migration 211 added the column.
        if (cogsReversalPlan.lineUpdates.length > 0) {
          // حدّ المخزون (#2839): ختم معرّف القيد على حركات المخزون عبر عقد المخزون المالك.
          const { stampMovementsJournalEntry } = await import("./warehouse.js");
          await stampMovementsJournalEntry({
            companyId: scope.companyId, reference: `CM-${memoId}`, type: "return",
            journalEntryId: memoJournalResult.journalId,
          });
        }
      }
    });

    const journalId: number | null = memoJournalResult!.journalId;
    markIdempotencyReplay(req, res, memoJournalResult!.alreadyExists);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.credit_memo",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ memoId, amount: creditAmount, net, vat, reason }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    // شريحة 4 — اربط مرشّح خصم النقل بهذا الإشعار عبر حدث عابر للمسار؛ مستمع
    // النقل يحدّث مرشّحه (status=issued + creditMemoId). المالية لا تكتب جدول النقل.
    if (deductionCandidateId && memoId) {
      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "transport.deduction.materialized",
        entity: "credit_memos",
        entityId: memoId,
        deductionCandidateId,
        creditMemoId: memoId,
      }).catch((e) => logger.error(e, "transport deduction link emit failed"));
    }

    const [memo] = await rawQuery<Record<string, unknown>>(`SELECT * FROM credit_memos WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [memoId, scope.companyId]);
    // cogsReversalWarnings is non-fatal — flagged when a restored lot's
    // status drifted between sale and return (quarantine / recalled /
    // expired / disposed / qc-rejected / lot deleted). UI should
    // surface these for QC review without blocking the refund.
    const responsePayload: Record<string, unknown> = memo
      ? { ...memo, cogsReversalWarnings: cogsReversalPlan.warnings }
      : { memoId, journalId, invoiceId: id, amount: creditAmount, netAmount: net, vatAmount: vat, reason, memoDate: memoDateStr, cogsReversalWarnings: cogsReversalPlan.warnings };
    res.status(201).json(responsePayload);
  } catch (err) {
    handleRouteError(err, res, "Credit memo error:");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /invoices/:id/amend — ZATCA-COMPLIANT INVOICE EDIT
//
// Per Saudi tax authority rules, an issued tax invoice is immutable.
// "Editing" one means:
//   1. Issue a credit memo against the original for the full amount.
//      This reverses AR + VAT output and, when the original had COGS
//      (product / inventory lines), reverses the inventory + COGS too.
//   2. Issue a NEW invoice with a fresh sequential ref, carrying the
//      operator's modifications. The new invoice posts independently:
//      fresh AR DR, fresh VAT output CR, fresh COGS / inventory.
//   3. Link the chain: original.amendedToInvoiceId → new.id and
//      new.amendedFromInvoiceId → original.id. The detail page renders
//      "this is an amendment of #N" banner on both sides.
//
// The orchestrator wraps all three in a single SQL transaction. If
// either the credit memo or the new invoice creation fails, the whole
// amend rolls back — no half-state where one is issued and the other
// isn't. The frontend gets {originalId, creditMemoId, newInvoiceId,
// newInvoiceRef} back so it can navigate the operator to the new doc.
// ═══════════════════════════════════════════════════════════════════════════════

invoicesRouter.post("/invoices/:id/amend", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(amendInvoiceSchema.safeParse(req.body ?? {}));

    // Load the original invoice + its lines. We need every field that
    // could carry over to the new invoice (clientId, branchId, dim
    // payload on each line, tax settings, etc.) so omitted body fields
    // fall back gracefully.
    const [original] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!original) throw new NotFoundError("الفاتورة الأصلية غير موجودة");

    // ZATCA correction only applies to ISSUED invoices. A draft hasn't
    // entered the tax register yet — operator should edit it directly
    // via PATCH instead.
    const draftStatuses = ["draft", "rejected", "returned", "cancelled"];
    if (draftStatuses.includes(original.status as string)) {
      throw new ConflictError(
        `الفاتورة في حالة "${original.status}" — التعديل المباشر متاح بدون إصدار إشعار دائن`,
        { field: "status", fix: `استخدم PATCH /invoices/${id} للتعديل المباشر` }
      );
    }
    // A previously amended invoice has already burned its slot in the
    // chain. The operator should amend the NEW invoice it produced.
    if (original.amendedToInvoiceId) {
      throw new ConflictError(
        `هذه الفاتورة تم تعديلها مسبقاً إلى الفاتورة #${original.amendedToInvoiceId} — قم بتعديل الفاتورة الجديدة بدلاً منها`,
        { field: "amendedToInvoiceId", fix: `اذهب للفاتورة #${original.amendedToInvoiceId} وعدّلها`,
          meta: { code: "ALREADY_AMENDED", chainTo: original.amendedToInvoiceId } }
      );
    }

    const amendDate = b.date || todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, amendDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن تعديل فاتورة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "date", meta: { periodName: periodCheck.periodName } }
      );
    }

    // STEP 1: Build the credit-memo payload. Full reversal of the
    // original's total (vatIncluded: true since the original's stored
    // total is gross). The reason flows through to the credit memo's
    // own reason field for audit + ZATCA filings.
    const originalTotal = roundTo2(Number(original.total));

    // STEP 2: Build the new-invoice payload. Each field falls back to
    // the original if not overridden in the body. Lines fall back to a
    // SELECT of invoice_lines so the new invoice carries the same dim
    // payload, account codes, and quantities by default.
    const originalLines = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM invoice_lines WHERE "invoiceId"=$1 ORDER BY id ASC LIMIT 500`,
      [id]
    );
    const newLines = b.lines && b.lines.length > 0
      ? b.lines
      : originalLines.map((l) => ({
          description: l.description as string | undefined,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          accountCode: l.accountCode as string | undefined,
          accountId: l.accountId as number | undefined,
          costCenterId: l.costCenterId as number | undefined,
          activityType: l.activityType as string | undefined,
          projectId: l.projectId as number | undefined,
          vehicleId: l.vehicleId as number | undefined,
          propertyId: l.propertyId as number | undefined,
          unitId: l.unitId as number | undefined,
          assetId: l.assetId as number | undefined,
          employeeId: l.employeeId as number | undefined,
          driverId: l.driverId as number | undefined,
          contractId: l.contractId as number | undefined,
          umrahSeasonId: l.umrahSeasonId as number | undefined,
          umrahAgentId: l.umrahAgentId as number | undefined,
          productId: l.productId as number | undefined,
          taxCode: l.taxCode as string | undefined,
        }));

    const amendmentToken = requestIdempotencyToken(req);

    // STEP 3: Both operations live inside the same outer transaction
    // (financialEngine.postJournalEntry's internal withTransaction joins
    // via SAVEPOINT, so the nested credit-memo and new-invoice GL posts
    // commit/rollback together). If either step throws, the whole amend
    // is undone — no half-state.
    const result = await withTransaction(async (client) => {
      // Lock the original to prevent concurrent amend or payment.
      const lockRes = await client.query(
        `SELECT id, status, "amendedToInvoiceId" FROM invoices
         WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [id, scope.companyId]
      );
      const lockedOriginal = lockRes.rows[0];
      if (!lockedOriginal) throw new NotFoundError("الفاتورة الأصلية اختفت أثناء التعديل");
      if (lockedOriginal.amendedToInvoiceId) {
        throw new ConflictError("الفاتورة تم تعديلها بين قراءة وإقفال — أعد التحميل");
      }

      // ── STEP 3a: Issue the credit memo. The full reversal must
      // mirror the standalone POST /credit-memo route — that means
      // not only the AR/VAT JE lines, but also: revenue counter
      // decrement on clients.totalRevenue, budgets.used decrement on
      // the revenue bucket, AND inventory/COGS reversal (DR Inventory
      // / CR COGS + restock lots) for any product lines. Without the
      // COGS reversal, an amended invoice would double-draw stock once
      // the new invoice posts — user explicitly required this
      // ("ومخزون اذا فيه مخزون").
      const { financialEngine } = await import("../lib/engines/index.js");
      const { planCogsReversal, applyStockReversals } = await import(
        "../lib/inventory/cogsPosting.js"
      );
      const [salesReturnsCode, vatPayableFallback, arCode] = await Promise.all([
        financialEngine.resolveAccountCode(scope.companyId, "invoice_sales_returns", "debit", "4113"),
        financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "debit", "2131"),
        financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "credit", "1131"),
      ]);
      // البند ٤ — يُعكَس سطر ضريبة الأصل على نفس حساب رمز ضريبته الذي رُحّل عند
      // اعتماده، وإلا الاحتياطي العام؛ فتُغلق تسوية الحساب صفرًا.
      const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
      const vatPayableCode = resolveVatLegAccount(
        original.taxCode ? await getOutputVatAccountCode(scope.companyId, original.taxCode as string) : null,
        vatPayableFallback,
      );
      const originalVat = roundTo2(Number(original.vatAmount));
      const originalNet = roundTo2(originalTotal - originalVat);
      const memoIssued = await issueNumber({
        companyId: scope.companyId,
        branchId: (original.branchId as number | null) ?? null,
        moduleKey: "finance",
        entityKey: "credit_memo",
        entityTable: "credit_memos",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      const memoRef = memoIssued.number;
      const memoInsRes = await client.query(
        `INSERT INTO credit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy",ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [scope.companyId, original.branchId, id, original.clientId, originalTotal, originalNet, originalVat,
         `تعديل ZATCA: ${b.reason}`, amendDate, scope.activeAssignmentId, memoRef]
      );
      const memoId = memoInsRes.rows[0].id;
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [memoId, memoIssued.assignmentId]
      );

      // Bump paidAmount so the original's open balance becomes zero
      // (the credit memo settles it). Status is overridden to 'amended'
      // below — that's a terminal state distinct from 'paid', signalling
      // the chain.
      await client.query(
        `UPDATE invoices SET "paidAmount" = COALESCE("paidAmount",0) + $1
         WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [originalTotal, id, scope.companyId]
      );

      // Decrement the denormalised revenue counter the original
      // invoice approval bumped, so it doesn't inflate forever.
      if (original.clientId && originalNet > 0) {
        await client.query(
          `UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) - $1
           WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
          [originalNet, original.clientId, scope.companyId]
        );
      }

      // Plan + apply COGS reversal for any product lines on the
      // original. ratio = 1.0 (full reversal). Service-only invoices
      // get an empty plan and skip the loop.
      const cogsReversalPlan = await planCogsReversal(client as any, {
        companyId: scope.companyId,
        invoiceId: id,
        ratio: 1.0,
        memoId,
      });
      if (cogsReversalPlan.lineUpdates.length > 0) {
        await applyStockReversals(
          client as any, scope.companyId,
          cogsReversalPlan.stockMovements, scope.activeAssignmentId ?? 0,
        );
        for (const u of cogsReversalPlan.lineUpdates) {
          await client.query(
            `UPDATE invoice_lines
                SET "cogsReversedAmount" = $1,
                    "cogsReversedAt"     = NOW(),
                    "cogsReversalJson"   = COALESCE("cogsReversalJson", '[]'::jsonb) || $2::jsonb
              WHERE id = $3`,
            [u.newReversedAmount, JSON.stringify([u.snapshot]), u.invoiceLineId],
          );
        }
        await client.query(
          `UPDATE credit_memos SET "cogsReversedTotal" = $1
            WHERE id = $2 AND "companyId" = $3`,
          [cogsReversalPlan.totalReversed, memoId, scope.companyId],
        );
      }

      // Decrement the budget bucket that the original revenue line
      // bumped at approval (matched by the approval-period and the
      // revenue account).
      if (originalNet > 0) {
        const origJeRes = await client.query(
          `SELECT "createdAt" FROM journal_entries
            WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL
            LIMIT 1`,
          [scope.companyId, `JE-${original.ref}`]
        );
        const origJe = origJeRes.rows[0];
        if (origJe && origJe.createdAt) {
          const invRevenueCode = await financialEngine.resolveAccountCode(
            scope.companyId, "invoice_revenue", "credit", "4111"
          );
          const approvalPeriod = String(origJe.createdAt).slice(0, 7);
          await client.query(
            `UPDATE budgets SET used = GREATEST(used - $1, 0)
             WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
            [originalNet, scope.companyId, invRevenueCode, approvalPeriod]
          );
        }
      }

      const memoPost = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (original.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `CM-${memoRef}`,
        description: `إشعار دائن (تعديل ZATCA): ${b.reason} — فاتورة ${original.ref}`,
        type: "credit_memo",
        sourceType: "credit_memo",
        sourceId: memoId,
        sourceKey: `finance:credit_memo:${memoId}`,
        lines: [
          { accountCode: salesReturnsCode, debit: originalNet, credit: 0, clientId: original.clientId as number | undefined },
          ...buildVatLeg({ amount: originalVat, side: "debit", accountCode: vatPayableCode, clientId: original.clientId as number | undefined }),
          { accountCode: arCode, debit: 0, credit: originalTotal, clientId: original.clientId as number | undefined },
          // COGS reversal lines (DR Inventory / CR COGS) — empty for service-only invoices.
          ...cogsReversalPlan.journalLines,
        ],
        guardTable: "credit_memos",
        guardId: memoId,
      });

      // Stamp the JE id back on the memo + on any return-type warehouse
      // movements applied above, to close the FK invariant.
      if (memoPost.journalId) {
        await client.query(
          `UPDATE credit_memos SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [memoPost.journalId, memoId, scope.companyId]
        );
        if (cogsReversalPlan.lineUpdates.length > 0) {
          // حدّ المخزون (#2839): ختم معرّف القيد على حركات المخزون عبر عقد المخزون المالك.
          const { stampMovementsJournalEntry } = await import("./warehouse.js");
          await stampMovementsJournalEntry({
            companyId: scope.companyId, reference: `CM-${memoId}`, type: "return",
            journalEntryId: memoPost.journalId,
          });
        }
      }

      // Mark the original as amended (terminal state distinct from
      // 'paid' — chain link is set below once newInvoiceId exists).
      await client.query(
        `UPDATE invoices SET status = 'amended', "amendmentReason" = $1, "amendedAt" = NOW()
         WHERE id = $2 AND "companyId" = $3`,
        [b.reason, id, scope.companyId]
      );

      // ── STEP 3b: Issue the new invoice with a fresh ref + carried-
      // over fields. Discount + tax-code + line dims come from the body
      // overrides or fall back to original.
      const newIssued = await issueNumber({
        companyId: scope.companyId,
        branchId: (original.branchId as number | null) ?? null,
        moduleKey: "finance",
        entityKey: "sales_invoice",
        entityTable: "invoices",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      const newRef = newIssued.number;
      const newClientId = b.clientId ?? (original.clientId as number);
      const newDueDate = b.dueDate ?? (original.dueDate as string | null);
      const newDescription = b.description ?? `تعديل ZATCA للفاتورة ${original.ref} — ${b.reason}`;
      const newNotes = b.notes ?? (original.notes as string | null);
      const newDiscountAmount = b.discountAmount ?? Number(original.discountAmount ?? 0);
      const newDiscountPercent = b.discountPercent ?? Number(original.discountPercent ?? 0);
      const newTaxCode = b.taxCode ?? (original.taxCode as string | null);
      const newTaxInclusive = b.taxInclusive ?? Boolean(original.taxInclusive);

      // Compute subtotal + vat + total from the lines. The full create-
      // invoice route does a fancy resolver pass with per-line tax
      // codes; here we do a simpler header-rate computation that
      // matches what the create flow defaults to. Operators wanting
      // per-line tax overrides should hit the full create route or
      // include taxCode on each line in the body.
      const vatRate = await getCompanyVatRate(scope.companyId);
      let subtotal = 0;
      for (const l of newLines) {
        const qty = Number(l.quantity || 1);
        const price = Number(l.unitPrice || 0);
        subtotal += qty * price;
      }
      subtotal = roundTo2(subtotal);
      const afterDiscountSubtotal = roundTo2(
        newDiscountPercent > 0
          ? subtotal * (1 - newDiscountPercent / 100)
          : Math.max(0, subtotal - newDiscountAmount)
      );
      const newVat = newTaxInclusive
        ? roundTo2(afterDiscountSubtotal - extractBaseFromGross(afterDiscountSubtotal, vatRate))
        : computeVat(afterDiscountSubtotal, vatRate);
      const newTotal = newTaxInclusive
        ? afterDiscountSubtotal
        : roundTo2(afterDiscountSubtotal + newVat);

      const newInvIns = await client.query(
        `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,"discountAmount","discountPercent","taxCode","taxInclusive","amendedFromInvoiceId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [scope.companyId, original.branchId, newClientId, newRef, newDescription, afterDiscountSubtotal,
         vatRate, newVat, newTotal, newDueDate, scope.activeAssignmentId, newNotes,
         newDiscountAmount, newDiscountPercent, newTaxCode, newTaxInclusive, id]
      );
      const newInvoiceId = newInvIns.rows[0].id;
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [newInvoiceId, newIssued.assignmentId]
      );

      // Copy invoice_lines to the new invoice with the carried-over dims.
      for (const l of newLines) {
        const qty = Number(l.quantity || 1);
        const price = Number(l.unitPrice || 0);
        const lineTotal = roundTo2(qty * price);
        await client.query(
          `INSERT INTO invoice_lines ("invoiceId",description,quantity,"unitPrice","lineTotal","accountCode","accountId","costCenterId","activityType","projectId","vehicleId","propertyId","unitId","assetId","employeeId","driverId","contractId","umrahSeasonId","umrahAgentId","productId","taxCode")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [newInvoiceId, l.description ?? null, qty, price, lineTotal,
           l.accountCode ?? null, l.accountId ?? null, l.costCenterId ?? null,
           l.activityType ?? null, l.projectId ?? null, l.vehicleId ?? null,
           l.propertyId ?? null, l.unitId ?? null, l.assetId ?? null,
           l.employeeId ?? null, l.driverId ?? null, l.contractId ?? null,
           l.umrahSeasonId ?? null, l.umrahAgentId ?? null, l.productId ?? null,
           l.taxCode ?? null]
        );
      }

      // ── STEP 3c: Close the chain — point the original at the new.
      await client.query(
        `UPDATE invoices SET "amendedToInvoiceId" = $1 WHERE id = $2 AND "companyId" = $3`,
        [newInvoiceId, id, scope.companyId]
      );

      return { memoId, memoRef, creditJournalId: memoPost.journalId, newInvoiceId, newRef, newTotal, cogsReversalWarnings: cogsReversalPlan.warnings, cogsReversedTotal: cogsReversalPlan.totalReversed };
    });

    // Audit trail + event emission outside the transaction.
    await createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "invoice.amend",
      entity: "invoices",
      entityId: id,
      after: {
        originalId: id,
        originalRef: original.ref,
        creditMemoId: result.memoId,
        creditMemoRef: result.memoRef,
        newInvoiceId: result.newInvoiceId,
        newInvoiceRef: result.newRef,
        reason: b.reason,
        token: amendmentToken,
      },
    }).catch((e) => logger.error(e, "invoice.amend audit failed"));

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.amended",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ newInvoiceId: result.newInvoiceId, creditMemoId: result.memoId }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.status(201).json({
      message: "تم إصدار إشعار دائن للفاتورة الأصلية وفاتورة جديدة بنجاح",
      originalInvoiceId: id,
      originalInvoiceRef: original.ref,
      creditMemoId: result.memoId,
      creditMemoRef: result.memoRef,
      creditJournalId: result.creditJournalId,
      newInvoiceId: result.newInvoiceId,
      newInvoiceRef: result.newRef,
      newInvoiceTotal: result.newTotal,
      cogsReversalWarnings: result.cogsReversalWarnings,
      cogsReversedTotal: result.cogsReversedTotal,
    });
  } catch (err) {
    handleRouteError(err, res, "Amend invoice error:");
  }
});

// Debit-memo PREVIEW (audit follow-up to #1024).
//
// AR-side mirror of /credit-memo/preview. Lets the UI render the GL
// that WILL post + raise period/scope blockers BEFORE the operator
// commits. No inventory side-effect — a debit memo charges the
// customer extra; nothing leaves the warehouse.
//
// Read-only, no transaction, no idempotency token.
invoicesRouter.post("/invoices/:id/debit-memo/preview", authorize({
  feature: "finance.invoices",
  action: "view",
  resource: { table: "invoices", idParam: "id", columns: ['"companyId"', '"branchId"'] },
}), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { amount, vatIncluded = true, memoDate } = zodParse(previewDebitMemoSchema.safeParse(req.body ?? {}));

    const chargeAmount = roundTo2(Number(amount));
    const memoDateStr = memoDate ? toDateISO(memoDate) : todayISO();

    const blockers: { field: string; message: string }[] = [];
    const warnings: { field: string; message: string }[] = [];

    const [invoice] = await rawQuery<{
      id: number; ref: string; vatRate: string | number | null;
      branchId: number | null; clientId: number | null; taxCode: string | null;
    }>(
      `SELECT id, ref, "vatRate", "branchId", "clientId", "taxCode"
         FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      blockers.push({
        field: "memoDate",
        message: `الفترة المالية مغلقة (${periodCheck.periodName ?? memoDateStr}) — لا يمكن إصدار إشعار مدين`,
      });
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [arCode, revenueCode, vatFallback, vatSpecific] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4111"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2131"),
      // البند ٤ — المعاينة تعكس حساب رمز الضريبة الذي سيحمل الضريبة الإضافية.
      invoice.taxCode
        ? getOutputVatAccountCode(scope.companyId, invoice.taxCode as string)
        : Promise.resolve(null),
    ]);
    const vatPayableCode = resolveVatLegAccount(vatSpecific, vatFallback);

    const vatRate = Number(invoice.vatRate ?? await getCompanyVatRate(scope.companyId));
    const previewNet = vatIncluded ? extractBaseFromGross(chargeAmount, vatRate) : chargeAmount;
    const previewVat = roundTo2(chargeAmount - previewNet);

    const previewLines = [
      { accountCode: arCode, debit: chargeAmount, credit: 0,
        description: `إشعار مدين — فاتورة ${invoice.ref}` },
      { accountCode: revenueCode, debit: 0, credit: previewNet,
        description: `إيرادات إضافية — فاتورة ${invoice.ref}` },
      ...(previewVat > 0
        ? [{ accountCode: vatPayableCode, debit: 0, credit: previewVat,
             description: `ضريبة قيمة مضافة — إشعار مدين ${invoice.ref}` }]
        : []),
    ];
    const totalDebit = roundTo2(previewLines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = roundTo2(previewLines.reduce((s, l) => s + l.credit, 0));
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005;

    res.json({
      invoiceId: id,
      invoiceRef: invoice.ref,
      canIssue: blockers.length === 0 && isBalanced,
      blockers,
      warnings,
      memoDate: memoDateStr,
      chargeAmount,
      netAmount: previewNet,
      vatAmount: previewVat,
      journalLines: previewLines,
      totals: { debit: totalDebit, credit: totalCredit, balanced: isBalanced },
    });
  } catch (err) {
    handleRouteError(err, res, "Debit memo preview error:");
  }
});

invoicesRouter.post("/invoices/:id/debit-memo", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { amount, reason, vatIncluded = true, memoDate } = zodParse(createDebitMemoSchema.safeParse(req.body ?? {}));

    const [invoice] = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "clientId", "companyId", "branchId", total, "vatRate", "taxCode"
         FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) {
      throw new NotFoundError("الفاتورة غير موجودة");
    }

    const chargeAmount = roundTo2(Number(amount));
    const memoDateStr = memoDate
      ? toDateISO(memoDate)
      : todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن إصدار إشعار مدين في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const vatRate = Number(invoice.vatRate ?? await getCompanyVatRate(scope.companyId));
    const net = vatIncluded
      ? extractBaseFromGross(chargeAmount, vatRate)
      : chargeAmount;
    const vat = roundTo2(chargeAmount - net);

    const { financialEngine } = await import("../lib/engines/index.js");
    const { getOutputVatAccountCode } = await import("../lib/taxCodes.js");
    const [arCode, revenueCode, vatPayableFallback, vatSpecific] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1131"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4111"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2131"),
      // البند ٤ — الضريبة الإضافية تُحمَّل على حساب رمز ضريبة الفاتورة إن هُيِّئ.
      invoice.taxCode
        ? getOutputVatAccountCode(scope.companyId, invoice.taxCode as string)
        : Promise.resolve(null),
    ]);
    const vatPayableCode = resolveVatLegAccount(vatSpecific, vatPayableFallback);

    let memoId: number | null = null;
    let debitMemoResult: { journalId: number; alreadyExists: boolean } | null = null;
    // Atomicity guarantee — same shape as credit-memo above: debit_memos
    // INSERT, invoice subtotal/vat/total bump, clients.totalRevenue
    // bump, budgets.used bump, AND the GL post all commit or roll back
    // together. The earlier shape ran the first four inside this
    // withTransaction and called financialEngine.post AFTER — a JE post
    // that threw left a half-formed memo + inflated invoice + inflated
    // client/budget counters with no GL trace. A retry would create a
    // duplicate memo row (no idempotency on debit_memos INSERT) AND
    // double-count the counters.
    await withTransaction(async (client) => {
      // G13 fix (Issue #1141 coverage report 2026-05-27 §3 G13) —
      // issue a real debit_memo ref through the numbering center
      // (scheme `finance.debit_memo`, seeded by migration 213).
      const issuedMemo = await issueNumber({
        companyId: scope.companyId,
        branchId: (invoice.branchId as number | null) ?? null,
        moduleKey: "finance",
        entityKey: "debit_memo",
        entityTable: "debit_memos",
        actorId: scope.userId,
        metadata: { sourceInvoiceId: id },
        expectedTiming: "on_draft",
      });
      try {
        const ins = await client.query(
          `INSERT INTO debit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy",ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [scope.companyId, invoice.branchId, id, invoice.clientId, chargeAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId, issuedMemo.number]
        );
        memoId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          await client.query(
            `CREATE TABLE IF NOT EXISTS debit_memos (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               "invoiceId" INTEGER NOT NULL,
               "clientId" INTEGER,
               amount NUMERIC(18,2) NOT NULL,
               "netAmount" NUMERIC(18,2) NOT NULL,
               "vatAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               reason TEXT NOT NULL,
               "memoDate" DATE NOT NULL,
               "journalId" INTEGER,
               "createdBy" INTEGER,
               ref TEXT,
               "createdAt" TIMESTAMP DEFAULT NOW()
             )`
          );
          const ins2 = await client.query(
            `INSERT INTO debit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy",ref)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [scope.companyId, invoice.branchId, id, invoice.clientId, chargeAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId, issuedMemo.number]
          );
          memoId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [memoId, issuedMemo.assignmentId]
      );

      // Increase invoice subtotal + VAT + total to reflect the additional
      // charge. Missing subtotal here broke the `subtotal = total - vatAmount`
      // invariant and made any report that read `subtotal` for "net revenue"
      // under-report by the debit-memo net.
      await client.query(
        `UPDATE invoices SET subtotal = subtotal + $1, "vatAmount" = "vatAmount" + $2, total = total + $3 WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL`,
        [net, vat, chargeAmount, id, scope.companyId]
      );

      // Mirror invoice-approval's revenue-recognition bump: a debit memo
      // is supplementary revenue (DR AR / CR Revenue at line 1500), so
      // `clients.totalRevenue` and `budgets.used` must rise by the
      // memo's net. Credit memos already decrement these (#892, #905);
      // debit memos previously never incremented them, leaving the
      // denormalised counters lagging reality by every memo's net.
      if (invoice.clientId && net > 0) {
        await client.query(
          `UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) + $1
            WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
          [net, invoice.clientId, scope.companyId]
        );
      }
      if (net > 0) {
        await client.query(
          `UPDATE budgets SET used = used + $1
            WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
          [net, scope.companyId, revenueCode, currentPeriod()]
        );
      }

      // GL post INSIDE the txn so a throw rolls back the memo row +
      // counter bumps. Engine's internal withTransaction joins
      // reentrantly via SAVEPOINT.
      debitMemoResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: invoice.branchId as number,
        createdBy: scope.activeAssignmentId,
        ref: `DM-${invoice.ref}-${memoId}`,
        description: `إشعار مدين على الفاتورة ${invoice.ref}: ${reason}`,
        sourceType: "debit_memo",
        sourceId: memoId ?? 0,
        sourceKey: `finance:debit_memo:${memoId}`,
        lines: [
          { accountCode: arCode, debit: chargeAmount, credit: 0, clientId: invoice.clientId as number | undefined },
          { accountCode: revenueCode, debit: 0, credit: net, clientId: invoice.clientId as number | undefined },
          ...buildVatLeg({ amount: vat, side: "credit", accountCode: vatPayableCode, clientId: invoice.clientId as number | undefined }),
        ],
        guardTable: "debit_memos",
        guardId: memoId ?? 0,
      });

      // Link memo → JE inside the same txn so debit_memos.journalId is
      // never NULL-after-commit. The earlier shape did this via
      // rawExecute after the txn, so a crash between the txn commit and
      // the rawExecute left journalId NULL forever.
      if (debitMemoResult.journalId && memoId) {
        await client.query(
          `UPDATE debit_memos SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [debitMemoResult.journalId, memoId, scope.companyId]
        );
      }
    });

    const journalId: number | null = debitMemoResult!.journalId;
    markIdempotencyReplay(req, res, debitMemoResult!.alreadyExists);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.debit_memo",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ memoId, amount: chargeAmount, net, vat, reason }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [memo] = await rawQuery<Record<string, unknown>>(`SELECT * FROM debit_memos WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [memoId, scope.companyId]);
    res.status(201).json(memo || { memoId, journalId, invoiceId: id, amount: chargeAmount, netAmount: net, vatAmount: vat, reason, memoDate: memoDateStr });
  } catch (err) {
    handleRouteError(err, res, "Debit memo error:");
  }
});

invoicesRouter.get("/invoices/:id/memos", authorize({ feature: "finance.invoices", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    let creditMemos: any[] = [];
    let debitMemos: any[] = [];
    try {
      creditMemos = await rawQuery<Record<string, unknown>>(
        `SELECT id, amount, "netAmount", "vatAmount", reason, "memoDate", "journalEntryId", "createdAt"
           FROM credit_memos WHERE "invoiceId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "memoDate" DESC`,
        [id, scope.companyId]
      );
    } catch (e) { logger.warn(e, "credit_memos table may not exist yet"); }
    try {
      debitMemos = await rawQuery<Record<string, unknown>>(
        `SELECT id, amount, "netAmount", "vatAmount", reason, "memoDate", "createdAt"
           FROM debit_memos WHERE "invoiceId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "memoDate" DESC`,
        [id, scope.companyId]
      );
    } catch (e) { logger.warn(e, "debit_memos table may not exist yet"); }
    res.json({ creditMemos, debitMemos });
  } catch (err) {
    handleRouteError(err, res, "List memos error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BAD DEBT PROVISIONING
// Posts an allowance-for-doubtful-accounts entry based on aging buckets:
//   DR 5820 Bad debt expense
//   CR 1135 Allowance for doubtful accounts (contra-AR)
// Rates are the per-company controllable bad-debt policy (settings key
// `finance.bad_debt_policy`) — STANDARD default current=0% / 1-30=5% /
// 31-60=25% / 61-90=50% / 90+=75% — with an optional per-request override on
// top (see lib/badDebtPolicy.ts). Idempotent per period via ref `BAD-DEBT-{period}`.
// ─────────────────────────────────────────────────────────────────────────────

// ── سطح التحكم بسياسة مخصّص الديون (قابلة للتحكم لكل شركة + قياسي) ─────────────
// GET: النِسَب المُحلّة لشركة المُستدعي (القياسي ← تهيئة الشركة) + القياسي للمرجع.
invoicesRouter.get("/bad-debt/policy", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rates = await resolveBadDebtPolicy(scope.companyId);
    res.json({ key: BAD_DEBT_POLICY_SETTING_KEY, rates, standard: STANDARD_BAD_DEBT_RATES });
  } catch (err) { handleRouteError(err, res, "Get bad-debt policy error:"); }
});

// PUT: يضبط نِسَب الشركة (تحديث جزئي — يُبقي الحقول غير المُرسَلة). كل نسبة ∈ [0,1].
// يخزّن تجاوزات الشركة فقط فوق القياسي (لا يُجمّد القياسي للحقول غير المضبوطة).
const badDebtPolicySchema = z.object({
  rates: z.object({
    current: z.coerce.number().min(0).max(1).optional(),
    d30: z.coerce.number().min(0).max(1).optional(),
    d60: z.coerce.number().min(0).max(1).optional(),
    d90: z.coerce.number().min(0).max(1).optional(),
    d90plus: z.coerce.number().min(0).max(1).optional(),
  }),
});
invoicesRouter.put("/bad-debt/policy", authorize({ feature: "finance.collection", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(badDebtPolicySchema.safeParse(req.body ?? {}));
    // ادمج فوق تجاوزات الشركة الخام (لا المُحلّ) حتى تبقى الحقول غير المضبوطة
    // ديناميكية على القياسي.
    const storedRaw = await resolveSettings(BAD_DEBT_POLICY_SETTING_KEY, scope.companyId).catch(() => undefined);
    const base = storedRaw && typeof storedRaw === "object" && !Array.isArray(storedRaw)
      ? (storedRaw as Record<string, unknown>) : {};
    const incoming = Object.fromEntries(
      Object.entries(body.rates).filter(([, v]) => v !== undefined),
    );
    const merged = { ...base, ...incoming };
    await upsertSetting("company", scope.companyId, BAD_DEBT_POLICY_SETTING_KEY, merged);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "settings", entityId: 0,
      after: { key: BAD_DEBT_POLICY_SETTING_KEY, rates: merged },
    }).catch((e) => logger.error(e, "bad-debt policy audit failed"));
    // أعد النِسَب المُحلّة بعد الحفظ (شفافية: ما الذي سيُطبَّق فعلًا).
    const rates = await resolveBadDebtPolicy(scope.companyId);
    res.json({ key: BAD_DEBT_POLICY_SETTING_KEY, rates, standard: STANDARD_BAD_DEBT_RATES });
  } catch (err) { handleRouteError(err, res, "Set bad-debt policy error:"); }
});

invoicesRouter.get("/bad-debt/preview", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOf = (req.query.asOf as string) || todayISO();
    // النِسَب: القياسي ← تهيئة الشركة (settings) ← تجاوز الطلب (query). مصدر واحد.
    const override = {
      current: Number.isFinite(Number(req.query.rateCurrent)) ? Number(req.query.rateCurrent) : undefined,
      d30: Number.isFinite(Number(req.query.rate30)) ? Number(req.query.rate30) : undefined,
      d60: Number.isFinite(Number(req.query.rate60)) ? Number(req.query.rate60) : undefined,
      d90: Number.isFinite(Number(req.query.rate90)) ? Number(req.query.rate90) : undefined,
      d90plus: Number.isFinite(Number(req.query.rate90plus)) ? Number(req.query.rate90plus) : undefined,
    };
    const rates = await resolveBadDebtPolicy(scope.companyId, override);

    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "clientId", "createdAt", "dueDate", total, "paidAmount",
              (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL
          AND "createdAt" <= $2
          AND status <> 'written_off'
          AND (total - COALESCE("paidAmount",0)) > 0.01`,
      [scope.companyId, asOf]
    );

    const asOfMs = new Date(asOf).getTime();
    const buckets: any = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    for (const inv of invoices) {
      const due = inv.dueDate ? new Date(inv.dueDate as string | Date).getTime()
        : new Date(inv.createdAt as string | Date).getTime() + 30 * 86400000;
      const daysOverdue = Math.floor((asOfMs - due) / 86400000);
      const amt = Number(inv.outstanding);
      const ra = roundTo2(amt);
      if (daysOverdue <= 0) buckets.current = roundTo2(buckets.current + ra);
      else if (daysOverdue <= 30) buckets.d30 = roundTo2(buckets.d30 + ra);
      else if (daysOverdue <= 60) buckets.d60 = roundTo2(buckets.d60 + ra);
      else if (daysOverdue <= 90) buckets.d90 = roundTo2(buckets.d90 + ra);
      else buckets.d90plus = roundTo2(buckets.d90plus + ra);
    }

    const provision = {
      current: roundTo2(buckets.current * rates.current),
      d30: roundTo2(buckets.d30 * rates.d30),
      d60: roundTo2(buckets.d60 * rates.d60),
      d90: roundTo2(buckets.d90 * rates.d90),
      d90plus: roundTo2(buckets.d90plus * rates.d90plus),
    };
    const totalProvision = roundTo2(provision.current + provision.d30 + provision.d60 + provision.d90 + provision.d90plus);

    // الأثر المتوقع: المخصّص (1135) رصيدٌ مستهدف، فنعرض الرصيد الحالي والفرق الذي
    // سيُرحَّل فعليًّا (delta-to-target) — لا الإجمالي الكامل.
    const previewPeriod = (asOf || todayISO()).slice(0, 7);
    const { financialEngine } = await import("../lib/engines/index.js");
    const allowanceCode = await financialEngine.resolveAccountCode(scope.companyId, "bad_debt_allowance", "credit", "1135");
    const currentAllowance = await readAllowanceBalance(scope.companyId, allowanceCode, `BAD-DEBT-${previewPeriod}`);
    const delta = roundTo2(totalProvision - currentAllowance);

    res.json({ asOf, rates, buckets, provision, totalProvision, currentAllowance, delta, invoiceCount: invoices.length });
  } catch (err) {
    handleRouteError(err, res, "Bad debt preview error:");
  }
});

// عتبة افتراضية للنظر في الشطب: ١٢ شهرًا (٣٦٥ يومًا) — تطابق شرط تخفيف ضريبة الديون
// المعدومة لدى ZATCA (المادة ٤٠: مرور ١٢ شهرًا على التوريد). قابلة للتجاوز بـ ?minDaysOverdue=.
const WRITEOFF_DEFAULT_DAYS = 365;

// مرشّحو الشطب: ذمم مدينة متأخّرة فوق العتبة وغير مشطوبة بعد — للعرض والترشيح فقط.
// لا ترحيل دفتر هنا؛ الترحيل (مدين 1135 المخصّص / دائن 1111 الذمم) يتمّ في مسار
// الاعتماد المنفصل (الدفعة ٢) بعد اعتماد بشري + assertion. نفس تعريف الذمم القائمة
// المستخدَم في المخصّص، مضافًا إليه استبعاد 'written_off'.
invoicesRouter.get("/bad-debt/write-off-candidates", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOf = (req.query.asOf as string) || todayISO();
    const minDaysOverdue = Number.isFinite(Number(req.query.minDaysOverdue)) && Number(req.query.minDaysOverdue) > 0
      ? Math.floor(Number(req.query.minDaysOverdue))
      : WRITEOFF_DEFAULT_DAYS;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "clientId", "createdAt", "dueDate", total, "paidAmount",
              (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" <= $2
          AND status NOT IN ('draft','cancelled','paid','rejected','returned','written_off')
          AND (total - COALESCE("paidAmount",0)) > 0.01`,
      [scope.companyId, asOf]
    );

    const asOfMs = new Date(asOf).getTime();
    const candidates = rows
      .map((inv) => {
        const due = inv.dueDate ? new Date(inv.dueDate as string | Date).getTime()
          : new Date(inv.createdAt as string | Date).getTime() + 30 * 86400000;
        const daysOverdue = Math.floor((asOfMs - due) / 86400000);
        return { ...inv, outstanding: roundTo2(Number(inv.outstanding)), daysOverdue };
      })
      .filter((c) => c.daysOverdue >= minDaysOverdue)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    res.json({
      asOf,
      minDaysOverdue,
      count: candidates.length,
      totalOutstanding: roundTo2(candidates.reduce((s, c) => s + Number(c.outstanding), 0)),
      candidates,
    });
  } catch (err) {
    handleRouteError(err, res, "Write-off candidates error:");
  }
});

// شطب دين معدوم على فاتورة (الدفعة ٢ — يمسّ الدفتر). القيد: مدين مخصص الديون (الصافي)
// + مدين ضريبة المخرجات (عكس — تخفيف ZATCA مادة ٤٠) / دائن ذمم العميل (الإجمالي)، ثم
// إطفاء الفاتورة written_off. اعتماد بشري + إشعار العميل كتابيًّا شرطان (مادة ٤٠).
const badDebtWriteOffSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
  customerNotified: z.boolean().optional().default(false),
});

invoicesRouter.post("/bad-debt/write-off", authorize({ feature: "finance.collection", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { invoiceId, reason, customerNotified } = zodParse(badDebtWriteOffSchema.safeParse(req.body ?? {}));

    // تخفيف ضريبة الديون المعدومة (ZATCA مادة ٤٠) يشترط إشعار العميل كتابيًّا بالمشطوب.
    if (!customerNotified) {
      throw new ValidationError(
        "يلزم تأكيد إشعار العميل كتابيًّا بالمبلغ المشطوب (شرط تخفيف الضريبة — المادة ٤٠)",
        { field: "customerNotified" },
      );
    }

    const result = await postBadDebtWriteOff({
      companyId: scope.companyId,
      branchId: scope.branchId,
      invoiceId,
      createdBy: scope.activeAssignmentId,
      reason,
    }).catch((je) => {
      logger.error(je, "Bad debt write-off JE error:");
      throw new IntegrationError(
        "فشل ترحيل قيد شطب الدين المعدوم",
        { field: "journalEntry", fix: "راجع إعدادات الحسابات (1135/2131/1131) ثم أعد المحاولة" },
      );
    });

    if (result.reason === "not_found") throw new NotFoundError("الفاتورة غير موجودة");
    if (result.reason === "period_closed") throw new ConflictError("لا يمكن الشطب في فترة مُقفلة");
    if (result.reason === "no_balance") throw new ConflictError("لا يوجد رصيد قائم على الفاتورة للشطب");

    // مشطوبة مسبقًا → لا عملية (idempotent).
    if (!result.posted) {
      res.status(200).json({ ...result, posted: false, message: "الفاتورة مشطوبة مسبقًا" });
      return;
    }

    markIdempotencyReplay(req, res, false);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bad_debt.written_off",
      entity: "invoices",
      entityId: invoiceId,
      details: JSON.stringify({ journalId: result.journalId, outstanding: result.outstanding, net: result.net, vat: result.vat, reason, customerNotified }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.status(201).json({ ...result, posted: true });
  } catch (err) {
    handleRouteError(err, res, "Bad debt write-off error:");
  }
});

invoicesRouter.post("/bad-debt/post", authorize({ feature: "finance.collection", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { period, asOf, rates, notes } = zodParse(badDebtPostSchema.safeParse(req.body ?? {}));

    const targetPeriod = period || currentPeriod();
    if (!/^\d{4}-\d{2}$/.test(targetPeriod)) {
      throw new ValidationError("صيغة الفترة غير صحيحة (YYYY-MM)");
    }
    const ref = `BAD-DEBT-${targetPeriod}`;
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existing) {
      throw new ConflictError(
        "تم تسجيل مخصص ديون مشكوك فيها لهذه الفترة مسبقاً",
        { field: "period", fix: "استعرض القيد الموجود بدلاً من إعادة التسجيل", meta: { journalId: existing.id } }
      );
    }

    // Delta-to-target: post only (aging target − current allowance balance) so the
    // allowance (1135) reflects the aging-based target each period without the
    // cumulative over-provision a full-total-per-period posting would cause. The
    // engine resolves rates (standard←company←request), reads the current 1135
    // balance, computes the signed delta, and posts it — shared with the monthly
    // cron via the same ref/sourceKey (idempotent per period).
    const result = await postBadDebtProvision({
      companyId: scope.companyId,
      branchId: scope.branchId,
      period: targetPeriod,
      asOf,
      rates: rates ?? undefined,
      createdBy: scope.activeAssignmentId,
      notes,
    }).catch((je) => {
      logger.error(je, "Bad debt JE error:");
      throw new IntegrationError(
        "فشل تسجيل قيد مخصص الديون المشكوك فيها",
        { field: "journalEntry", fix: "راجع إعدادات الحسابات (5820/1135) ثم أعد المحاولة" }
      );
    });

    if (result.reason === "period_closed") {
      throw new ConflictError("لا يمكن تسجيل مخصص ديون في فترة مُقفلة");
    }

    // Already at target → no journal entry needed (not an error — a no-op).
    if (!result.posted) {
      res.status(200).json({
        ref, period: targetPeriod, posted: false,
        message: "المخصّص مطابق للهدف بالتقادم — لا حاجة لتعديل",
        target: result.target, currentAllowance: result.currentAllowance, delta: 0,
        total: result.target, buckets: result.buckets, rates: result.rates,
      });
      return;
    }

    markIdempotencyReplay(req, res, false);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bad_debt.posted",
      entity: "journal_entries",
      entityId: result.journalId ?? 0,
      details: JSON.stringify({ period: targetPeriod, target: result.target, delta: result.delta, currentAllowance: result.currentAllowance, buckets: result.buckets, rates: result.rates }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.status(201).json({
      journalId: result.journalId, ref, period: targetPeriod, posted: true,
      target: result.target, currentAllowance: result.currentAllowance, delta: result.delta,
      total: result.target, buckets: result.buckets, rates: result.rates,
    });
  } catch (err) {
    handleRouteError(err, res, "Bad debt post error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER ADVANCE PAYMENTS
// Accepts a prepayment from a customer before any invoice is issued. Booked
// as a liability (unearned revenue) until an invoice consumes it:
//   DR 1100 Cash
//   CR 2400 Customer advances (liability)
// Applying an advance to an invoice clears the liability and reduces AR:
//   DR 2400 Customer advances
//   CR 1200 AR
// ─────────────────────────────────────────────────────────────────────────────

invoicesRouter.post("/customer-advances", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { clientId, amount, method = "bank_transfer", reference, notes, receivedDate, branchId: bodyBranchId, lineAllocation } = zodParse(createCustomerAdvanceSchema.safeParse(req.body));

    // #1715 §6 — whitelist the operation-context dims that ride on the JE line.
    const advDims: Record<string, number | string> = {};
    if (lineAllocation) {
      for (const k of ["costCenterId", "projectId", "departmentId", "vehicleId", "propertyId", "unitId", "contractId", "assetId", "driverId", "vendorId", "umrahAgentId", "umrahSeasonId"] as const) {
        const v = (lineAllocation as Record<string, unknown>)[k];
        if (v != null && v !== "") advDims[k] = Number(v);
      }
      const at = (lineAllocation as Record<string, unknown>).activityType;
      if (typeof at === "string" && at) advDims.activityType = at;
    }

    const [client] = await rawQuery<{ id: number }>(`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [clientId, scope.companyId]);
    if (!client) throw new ValidationError("العميل غير موجود", { field: "clientId", fix: "اختر عميلاً من قائمة العملاء." });

    // Resolve the branch the advance JE will land on. Multi-branch users
    // who didn't pick a branch get the typed BRANCH_REQUIRED error so the
    // frontend can render the picker. Single-branch users auto-resolve.
    let advanceBranchId: number;
    if (scope.isOwner || OWNER_GM_ROLES.includes(scope.role)) {
      advanceBranchId = (bodyBranchId ?? scope.branchId) as number;
      if (!advanceBranchId) {
        throw new ValidationError("الفرع مطلوب لتسجيل دفعة مقدمة", { field: "branchId" });
      }
    } else {
      const r = resolveTransactionBranch({
        scope: { companyId: scope.companyId, branchId: scope.branchId, allowedBranches: scope.allowedBranches },
        bodyBranchId,
      });
      advanceBranchId = r.branchId;
    }

    const recvDate = receivedDate || todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, recvDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تسجيل دفعة مقدمة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const amt = roundTo2(Number(amount));

    let advanceId: number | null = null;
    // #1141 cleanup — customer_advance ref through the numbering center
    // (scheme `finance.customer_advance`, seeded by migration 231).
    // The `reference` query-param is still honoured for legacy imports.
    let advRef: string;
    let issuedAdv: Awaited<ReturnType<typeof issueNumber>> | null = null;
    if (reference) {
      advRef = reference;
    } else {
      issuedAdv = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "finance",
        entityKey: "customer_advance",
        entityTable: "customer_advances",
        actorId: scope.userId,
        metadata: { clientId },
        expectedTiming: "on_draft",
      });
      advRef = issuedAdv.number;
    }
    // F2 (audit fix): post the GL inside the SAME withTransaction as the
    // INSERT, with the journalId stamp also inside. The previous shape
    // (INSERT in txn A, JE outside, DELETE compensator on JE failure)
    // could leave the row stranded if the DELETE itself failed; worse,
    // a crash between the JE commit and the rawExecute() journalId
    // stamp left the FK NULL permanently. financialEngine's internal
    // withTransaction joins this outer one reentrantly via SAVEPOINT
    // (same pattern as credit-memo / debit-memo).
    const { financialEngine } = await import("../lib/engines/index.js");
    const [cashCode, advLiabCode] = await Promise.all([
      // A customer advance is customer money coming IN — resolve the cash/bank
      // account the SAME way the customer-payment route does (invoice_payment_cash),
      // not the payroll-payout purpose. The old "payroll_bank_payout" key has no
      // debit-side mapping, so it fell through to the non-postable header 1100 and
      // the advance failed to post on tenants whose 1100 isn't a posting account.
      financialEngine.resolveAccountCode(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1111" : "1124"),
      financialEngine.resolveAccountCode(scope.companyId, "customer_advance_liability", "credit", "2160"),
    ]);

    let journalId: number | null = null;
    let advanceAlreadyExists = false;
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO customer_advances ("companyId","branchId","clientId",ref,amount,"appliedAmount",method,"receivedDate",notes,"createdBy",status)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'open') RETURNING id`,
          [scope.companyId, advanceBranchId, clientId, advRef, amt, method, recvDate, notes ?? null, scope.activeAssignmentId]
        );
        advanceId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          await client.query(
            `CREATE TABLE IF NOT EXISTS customer_advances (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               "clientId" INTEGER NOT NULL,
               ref TEXT NOT NULL,
               amount NUMERIC(18,2) NOT NULL,
               "appliedAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               method TEXT,
               "receivedDate" DATE NOT NULL,
               notes TEXT,
               status TEXT NOT NULL DEFAULT 'open',
               "journalId" INTEGER,
               "createdBy" INTEGER,
               "createdAt" TIMESTAMP DEFAULT NOW()
             )`
          );
          const ins2 = await client.query(
            `INSERT INTO customer_advances ("companyId","branchId","clientId",ref,amount,"appliedAmount",method,"receivedDate",notes,"createdBy",status)
             VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'open') RETURNING id`,
            [scope.companyId, advanceBranchId, clientId, advRef, amt, method, recvDate, notes ?? null, scope.activeAssignmentId]
          );
          advanceId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }
      if (issuedAdv && advanceId) {
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [advanceId, issuedAdv.assignmentId]
        );
      }

      const advanceResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: advanceBranchId,
        createdBy: scope.activeAssignmentId,
        ref: advRef,
        description: `دفعة مقدمة من العميل ${clientId}: ${amt}`,
        sourceType: "customer_advance",
        sourceId: advanceId ?? 0,
        sourceKey: `finance:customer_advance:${advanceId}`,
        lines: [
          { accountCode: cashCode, debit: amt, credit: 0, clientId: Number(clientId), ...advDims },
          { accountCode: advLiabCode, debit: 0, credit: amt, clientId: Number(clientId) },
        ],
        guardTable: "customer_advances",
        guardId: advanceId ?? 0,
      });
      journalId = advanceResult.journalId;
      advanceAlreadyExists = advanceResult.alreadyExists;

      if (journalId && advanceId) {
        await client.query(
          `UPDATE customer_advances SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [journalId, advanceId, scope.companyId],
        );
      }
    });
    markIdempotencyReplay(req, res, advanceAlreadyExists);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.customer_advance.created", entity: "customer_advances", entityId: advanceId ?? 0,
      after: { ref: advRef, clientId, amount: amt, journalId },
    }).catch((e) => logger.error(e, "finance-invoices customer-advance-create audit failed"));

    res.status(201).json({ advanceId, ref: advRef, clientId, amount: amt, journalId, status: "open" });
  } catch (err) {
    handleRouteError(err, res, "Customer advance create error:");
  }
});

// #1945 FIN-03 — customer receipt wizard (سند قبض). Replaces the old flow
// where the BROWSER built raw GL lines with hardcoded accounts (1200/1220/
// 2110 — a non-postable header, the furniture account, and the vendors
// header on a SOCPA tree) and POSTed them to /finance/journal without ever
// updating the invoices. All account resolution + invoice application +
// leftover-advance + the single balanced JE live in customerReceiptService,
// routed through the accounting engine.
invoicesRouter.post("/customer-receipts", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createCustomerReceiptSchema.safeParse(req.body));

    // Branch resolution — same policy as POST /customer-advances.
    let receiptBranchId: number;
    if (scope.isOwner || OWNER_GM_ROLES.includes(scope.role)) {
      receiptBranchId = (body.branchId ?? scope.branchId) as number;
      if (!receiptBranchId) throw new ValidationError("الفرع مطلوب لتسجيل سند قبض", { field: "branchId" });
    } else {
      const r = resolveTransactionBranch({
        scope: { companyId: scope.companyId, branchId: scope.branchId, allowedBranches: scope.allowedBranches },
        bodyBranchId: body.branchId,
      });
      receiptBranchId = r.branchId;
    }

    // #1715 §6 — whitelist the operation-context dims for the cash line.
    const dims: Record<string, number | string> = {};
    if (body.lineAllocation) {
      for (const k of ["costCenterId", "projectId", "departmentId", "vehicleId", "propertyId", "unitId", "contractId", "assetId", "driverId", "vendorId", "umrahAgentId", "umrahSeasonId"] as const) {
        const v = (body.lineAllocation as Record<string, unknown>)[k];
        if (v != null && v !== "") dims[k] = Number(v);
      }
      const at = (body.lineAllocation as Record<string, unknown>).activityType;
      if (typeof at === "string" && at) dims.activityType = at;
    }

    const { postCustomerReceipt } = await import("../lib/customerReceiptService.js");
    const result = await postCustomerReceipt({
      companyId: scope.companyId,
      branchId: receiptBranchId,
      createdBy: scope.activeAssignmentId,
      clientId: body.clientId,
      amount: body.amount,
      method: body.method === "bank" || body.method === "transfer" ? "bank_transfer" : body.method,
      cashAccountCode: body.cashAccountCode ?? null,
      receiptKey: body.receiptKey,
      receivedDate: body.date,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      applications: body.applications,
      dims,
      // An applied invoice may live on another branch — the receipt clears
      // ITS receivable, so the operator must have access to that branch.
      assertBranchAccess: (documentBranchId) => assertDocumentBranchAccess(documentBranchId, {
        companyId: scope.companyId,
        branchId: scope.branchId,
        allowedBranches: (scope as any).allowedBranches,
      }),
    });
    markIdempotencyReplay(req, res, result.alreadyExists);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "finance.payment.received", entity: "journal_entries", entityId: result.journalId,
      after: { voucherId: result.journalId, clientId: body.clientId, amount: body.amount },
      details: JSON.stringify({ voucherId: result.journalId, clientId: body.clientId, amount: body.amount, applied: result.applied.length, leftover: result.leftover }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "Customer receipt error:");
  }
});

invoicesRouter.post("/customer-advances/:id/apply", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const advanceId = parseId(req.params.id, "id");
    const { invoiceId, amount } = zodParse(applyAdvanceSchema.safeParse(req.body ?? {}));

    const applyAmt = roundTo2(Number(amount));

    // F4 (audit follow-up): gate the period up front so a closed-period
    // attempt surfaces as a typed ConflictError instead of an opaque
    // engine-internal throw. The engine still guards the JE post itself,
    // but the txn would roll back with an engine message; operators
    // expect a `ConflictError` with `meta.periodName`.
    const applyPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, todayISO());
    if (!applyPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن تطبيق دفعة مقدمة في فترة مُقفلة: ${applyPeriodCheck.periodName ?? ""}`,
        { meta: { periodName: applyPeriodCheck.periodName } },
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [advLiabCode, arCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "customer_advance_liability", "debit", "2160"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "credit", "1131"),
    ]);

    let advance: any;
    let invoice: any;
    let applyResult: { journalId: number; alreadyExists: boolean } | null = null;
    // Atomicity guarantee: customer_advances.appliedAmount, invoices.paidAmount,
    // AND the GL posting all commit (or all roll back) together. The earlier
    // shape did the counter updates inside a withTransaction and then called
    // financialEngine.postJournalEntry OUTSIDE — so a JE post that threw
    // (closed period, missing account, network blip during the engine's
    // own period rawQuery) left counters inflated but no ledger movement.
    // The engine's internal withTransaction joins this one reentrantly via
    // SAVEPOINT (rawdb.ts:108), so commits / rollbacks remain atomic across
    // both layers.
    await withTransaction(async (client: any) => {
      let advRes;
      try {
        advRes = await client.query(
          `SELECT id, "clientId", amount, "appliedAmount", "branchId", status
             FROM customer_advances WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
          [advanceId, scope.companyId]
        );
      } catch (e) {
        logger.error(e, "failed to query customer_advances");
        throw new NotFoundError("الدفعة المقدمة غير موجودة");
      }
      advance = advRes.rows[0];
      if (!advance) throw new NotFoundError("الدفعة المقدمة غير موجودة");

      const remaining = Number(advance.amount) - Number(advance.appliedAmount);
      if (applyAmt > remaining + 0.01) {
        throw new ValidationError(`المبلغ يتجاوز المتبقي من الدفعة المقدمة (${remaining})`);
      }

      const invRes = await client.query(
        `SELECT id, ref, "clientId", total, "paidAmount" FROM invoices
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [Number(invoiceId), scope.companyId]
      );
      invoice = invRes.rows[0];
      if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
      if (invoice.clientId !== advance.clientId) {
        throw new ValidationError("العميل في الفاتورة لا يطابق العميل في الدفعة المقدمة");
      }
      const invoiceOpen = Number(invoice.total) - Number(invoice.paidAmount);
      if (applyAmt > invoiceOpen + 0.01) {
        throw new ValidationError(`المبلغ يتجاوز الرصيد المفتوح للفاتورة (${invoiceOpen})`);
      }

      await client.query(
        `UPDATE customer_advances SET "appliedAmount" = COALESCE("appliedAmount",0) + $1,
           status = CASE WHEN COALESCE("appliedAmount",0) + $1 >= amount THEN 'applied' ELSE status END
         WHERE id = $2`,
        [applyAmt, advanceId]
      );
      await client.query(
        `UPDATE invoices SET "paidAmount" = COALESCE("paidAmount",0) + $1,
           status = CASE
             WHEN COALESCE("paidAmount",0) + $1 >= total THEN 'paid'
             WHEN COALESCE("paidAmount",0) + $1 > 0 THEN 'partial'
             ELSE status END
         WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [applyAmt, Number(invoiceId), scope.companyId]
      );

      // GL post lives INSIDE the same transaction so a throw here (closed
      // period, missing account, etc.) rolls the counter updates back.
      // financialEngine.postJournalEntry's internal withTransaction joins
      // this one via SAVEPOINT (rawdb.ts:108 reentrant logic), so the
      // nested call doesn't open a second connection.
      applyResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: advance.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `ADV-APPLY-${advanceId}-${invoiceId}`,
        description: `تطبيق دفعة مقدمة على الفاتورة ${invoice.ref}`,
        sourceType: "advance_application",
        sourceId: advanceId,
        sourceKey: `finance:advance_apply:${advanceId}:${invoiceId}`,
        lines: [
          { accountCode: advLiabCode, debit: applyAmt, credit: 0, clientId: advance.clientId },
          { accountCode: arCode, debit: 0, credit: applyAmt, clientId: advance.clientId },
        ],
        guardTable: "customer_advances",
        guardId: advanceId,
      });
    });

    // After-commit response wiring. `applyResult` is guaranteed non-null
    // here — the transaction would have thrown otherwise (and the catch
    // below would have responded with the error).
    const journalId = applyResult!.journalId;
    markIdempotencyReplay(req, res, applyResult!.alreadyExists);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.customer_advance.applied", entity: "customer_advances", entityId: advanceId,
      after: { invoiceId: Number(invoiceId), amount: applyAmt, journalId },
    }).catch((e) => logger.error(e, "finance-invoices customer-advance-apply audit failed"));

    res.json({ advanceId, invoiceId: Number(invoiceId), amount: applyAmt, journalId });
  } catch (err) {
    handleRouteError(err, res, "Apply customer advance error:");
  }
});

invoicesRouter.get("/customer-advances", authorize({ feature: "finance.invoices", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { clientId, status } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1`;
    if (clientId) { params.push(Number(clientId)); where += ` AND "clientId" = $${params.length}`; }
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    let rows: any[] = [];
    try {
      rows = await rawQuery<Record<string, unknown>>(
        `SELECT ca.id, ca.ref, ca.amount, ca."appliedAmount",
                (ca.amount - ca."appliedAmount") AS remaining,
                ca.method, ca."receivedDate", ca.status, ca."journalId", ca."createdAt",
                c.name AS "clientName"
           FROM customer_advances ca
           LEFT JOIN clients c ON c.id = ca."clientId" AND c."companyId" = ca."companyId" AND c."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY ca."receivedDate" DESC, ca.id DESC`,
        params
      );
    } catch (e) { logger.warn(e, "customer_advances table not yet created"); }
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List customer advances error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DUNNING WORKFLOW — مسار متابعة تحصيل الذمم المتأخرة
// ─────────────────────────────────────────────────────────────────────────────
// Stages (configurable thresholds):
//   1. Friendly reminder     (1-14 days past due)
//   2. First notice          (15-30 days)
//   3. Second notice         (31-60 days)
//   4. Final notice          (61-90 days)
//   5. Collection / legal    (90+ days)
// Each invoice tracks last sent stage + last sent date. Bulk-run endpoint
// computes eligible invoices and produces the letters to send.

async function ensureDunningTables() {
  // Schema matches production: stage (int), daysPastDue, outstandingAmount,
  // letterContent. NO `level`, `subject`, `body`, or `deletedAt` columns.
  await rawQuery(`
    CREATE TABLE IF NOT EXISTS dunning_letters (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "invoiceId" INTEGER NOT NULL,
      "clientId" INTEGER,
      stage INTEGER NOT NULL,
      "daysPastDue" INTEGER NOT NULL,
      "outstandingAmount" NUMERIC(18,2) NOT NULL,
      "letterContent" TEXT,
      "sentAt" TIMESTAMPTZ DEFAULT NOW(),
      "sentBy" INTEGER,
      "sentVia" VARCHAR(16) DEFAULT 'manual',
      status VARCHAR(16) DEFAULT 'sent'
    )
  `, []);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_dunning_letters_invoice
      ON dunning_letters ("invoiceId")
  `, []);
  await rawQuery(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningStage" INTEGER DEFAULT 0
  `, []);
  await rawQuery(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningAt" TIMESTAMP
  `, []);
}

function stageFromDaysPastDue(days: number): { stage: number; title: string; tone: string } | null {
  if (days < 1) return null;
  if (days <= 14) return { stage: 1, title: "تذكير ودي بالسداد", tone: "friendly" };
  if (days <= 30) return { stage: 2, title: "إشعار أول بالتأخر في السداد", tone: "formal" };
  if (days <= 60) return { stage: 3, title: "إشعار ثانٍ — يرجى المبادرة بالسداد", tone: "firm" };
  if (days <= 90) return { stage: 4, title: "إشعار نهائي قبل إجراءات التحصيل", tone: "final" };
  return { stage: 5, title: "إحالة للتحصيل / الإجراءات القانونية", tone: "legal" };
}

function composeDunningLetter(opts: {
  clientName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  daysPastDue: number;
  outstanding: number;
  stageTitle: string;
  tone: string;
}): string {
  const base = `السيد/ة ${opts.clientName} المحترم/ة،

${opts.stageTitle}

نحيطكم علماً بأن الفاتورة رقم ${opts.invoiceNumber} المؤرخة في ${opts.invoiceDate} قد استحقت بتاريخ ${opts.dueDate}، وقد تجاوزت تاريخ الاستحقاق بعدد ${opts.daysPastDue} يوم.

المبلغ المستحق: ${opts.outstanding.toFixed(2)} ر.س`;

  const footers: Record<string, string> = {
    friendly: `\n\nربما تكون قد سددت المبلغ بالفعل، وفي هذه الحالة نرجو إهمال هذا التذكير. وإن لم يكن، نرجو المبادرة بالسداد في أقرب وقت ممكن.\n\nشكراً لتعاونكم المستمر.`,
    formal: `\n\nيرجى العلم أن المبلغ أصبح متأخراً ونطلب منكم المبادرة بالسداد خلال 7 أيام من تاريخ هذا الإشعار.`,
    firm: `\n\nرغم إشعارنا السابق، لم نستلم السداد حتى الآن. نرجو منكم جدياً تسوية المبلغ خلال 5 أيام، وإلا سنضطر لاتخاذ إجراءات إضافية.`,
    final: `\n\nهذا إشعار نهائي. إذا لم يتم السداد خلال 3 أيام من تاريخ هذا الإشعار، سنقوم بإحالة الملف لإجراءات التحصيل القانوني، وقد يتم تسجيل المبلغ كذمم معدومة مع تحمل الطرف المدين كافة الرسوم القانونية.`,
    legal: `\n\nنظراً لعدم استجابتكم للإشعارات السابقة، تم إحالة الملف للإدارة القانونية للمباشرة بإجراءات التحصيل الرسمية. للتواصل العاجل يرجى الرد خلال 24 ساعة.`,
  };
  return base + (footers[opts.tone] ?? "");
}

// Preview eligible invoices for dunning
invoicesRouter.get("/dunning/preview", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureDunningTables();
    const minDays = Number(req.query.minDaysPastDue) || 1;
    const today = todayISO();

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i.ref AS "invoiceNumber", i."createdAt"::date AS "invoiceDate", i."dueDate",
              i.total, COALESCE(i."paidAmount",0) AS "paidAmount",
              i."clientId", i."lastDunningStage", i."lastDunningAt",
              c.name AS "clientName", c.email AS "clientEmail", c.phone AS "clientPhone",
              GREATEST(0, ($1::date - i."dueDate"::date))::int AS "daysPastDue"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
       WHERE i."companyId"=$2
         AND i.status NOT IN ('paid','cancelled')
         AND i."deletedAt" IS NULL
         AND i."dueDate" IS NOT NULL
         AND i."dueDate"::date < $1::date
         AND ($1::date - i."dueDate"::date) >= $3
         AND (i.total - COALESCE(i."paidAmount",0)) > 0
       ORDER BY i."dueDate" ASC
       LIMIT 500`,
      [today, scope.companyId, minDays]
    );

    const eligible: any[] = [];
    for (const r of rows) {
      const days = Number(r.daysPastDue);
      const stg = stageFromDaysPastDue(days);
      if (!stg) continue;
      // Skip if same stage already sent today
      const lastStage = Number(r.lastDunningStage ?? 0);
      if (lastStage >= stg.stage && r.lastDunningAt) {
        const lastAt = new Date(r.lastDunningAt as string | Date);
        const hoursSince = (Date.now() - lastAt.getTime()) / 36e5;
        if (hoursSince < 24) continue;
      }
      const outstanding = roundTo2(Number(r.total) - Number(r.paidAmount));
      eligible.push({
        invoiceId: r.id,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        dueDate: r.dueDate,
        daysPastDue: days,
        clientId: r.clientId,
        clientName: r.clientName,
        clientEmail: r.clientEmail,
        clientPhone: r.clientPhone,
        outstanding,
        proposedStage: stg.stage,
        stageTitle: stg.title,
        tone: stg.tone,
        lastSentStage: lastStage,
        lastSentAt: r.lastDunningAt,
      });
    }

    res.json({
      asOf: today,
      total: eligible.length,
      byStage: {
        1: eligible.filter(e => e.proposedStage === 1).length,
        2: eligible.filter(e => e.proposedStage === 2).length,
        3: eligible.filter(e => e.proposedStage === 3).length,
        4: eligible.filter(e => e.proposedStage === 4).length,
        5: eligible.filter(e => e.proposedStage === 5).length,
      },
      totalOutstanding: roundTo2(eligible.reduce((s, e) => s + e.outstanding, 0)),
      invoices: eligible,
    });
  } catch (err) {
    handleRouteError(err, res, "Dunning preview error:");
  }
});

// Send dunning letters (record them)
invoicesRouter.post("/dunning/send", authorize({ feature: "finance.collection", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    await ensureDunningTables();
    const { invoiceIds, sentVia = "manual" } = zodParse(dunningSendSchema.safeParse(req.body ?? {}));

    const today = todayISO();
    const results: any[] = [];

    // Batch-fetch all invoices in one query
    const invoiceIdNums = invoiceIds.map(Number);
    const allInvoices = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i.ref AS "invoiceNumber", i."createdAt"::date AS "invoiceDate", i."dueDate",
              i.total, COALESCE(i."paidAmount",0) AS "paidAmount", i."clientId",
              c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
       WHERE i.id = ANY($1::int[]) AND i."companyId"=$2
         AND i.status NOT IN ('paid','cancelled')
         AND i."deletedAt" IS NULL`,
      [invoiceIdNums, scope.companyId]
    );
    const invoiceMap = new Map(allInvoices.map((inv: any) => [inv.id, inv]));

    for (const invId of invoiceIds) {
      const inv = invoiceMap.get(Number(invId));
      if (!inv) { results.push({ invoiceId: invId, status: "skipped", reason: "not_found_or_paid" }); continue; }

      if (!inv.dueDate) { results.push({ invoiceId: invId, status: "skipped", reason: "no_due_date" }); continue; }
      const days = Math.max(
        0,
        Math.floor((new Date(today).getTime() - new Date(inv.dueDate).getTime()) / 86400000)
      );
      const stg = stageFromDaysPastDue(days);
      if (!stg) { results.push({ invoiceId: invId, status: "skipped", reason: "not_past_due" }); continue; }

      const outstanding = roundTo2(Number(inv.total) - Number(inv.paidAmount));
      if (outstanding <= 0) { results.push({ invoiceId: invId, status: "skipped", reason: "fully_paid" }); continue; }

      const letter = composeDunningLetter({
        clientName: inv.clientName ?? "العميل",
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: String(inv.invoiceDate).slice(0, 10),
        dueDate: String(inv.dueDate).slice(0, 10),
        daysPastDue: days,
        outstanding,
        stageTitle: stg.title,
        tone: stg.tone,
      });

      const [row] = await rawQuery<Record<string, unknown>>(
        `INSERT INTO dunning_letters
         ("companyId","invoiceId","clientId",stage,"daysPastDue","outstandingAmount","letterContent","sentAt",status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'sent') RETURNING id`,
        [scope.companyId, inv.id, inv.clientId, stg.stage, days, outstanding, letter]
      );
      results.push({ invoiceId: inv.id, letterId: row.id, stage: stg.stage, daysPastDue: days, outstanding, status: "sent" });
    }

    const sentCount = results.filter(r => r.status === "sent").length;
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.dunning.sent", entity: "dunning_letters", entityId: scope.companyId,
      after: { sent: sentCount, total: results.length, sentVia },
    }).catch((e) => logger.error(e, "finance-invoices dunning audit failed"));

    res.status(201).json({
      total: results.length,
      sent: sentCount,
      skipped: results.filter(r => r.status === "skipped").length,
      results,
    });
  } catch (err) {
    handleRouteError(err, res, "Dunning send error:");
  }
});

// History of dunning letters
invoicesRouter.get("/dunning/history", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureDunningTables();
    const { invoiceId, clientId, stage } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `dl."companyId"=$1`;
    if (invoiceId) { params.push(Number(invoiceId)); where += ` AND dl."invoiceId"=$${params.length}`; }
    if (clientId) { params.push(Number(clientId)); where += ` AND dl."clientId"=$${params.length}`; }
    if (stage) { params.push(Number(stage)); where += ` AND dl.stage=$${params.length}`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT dl.*, i.ref AS "invoiceNumber", c.name AS "clientName"
       FROM dunning_letters dl
       LEFT JOIN invoices i ON i.id = dl."invoiceId" AND i."deletedAt" IS NULL
       LEFT JOIN clients c ON c.id = dl."clientId" AND c."companyId" = dl."companyId" AND c."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY dl."sentAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Dunning history error:");
  }
});

invoicesRouter.get("/tax/declarations", authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const thisYear = currentYear();
    const { financialEngine } = await import("../lib/engines/index.js");
    const inputVatCode = await financialEngine.resolveAccountCode(scope.companyId, "vat_input", "debit", "1180");
    // Per-month output VAT (invoices), credit-memo VAT (refunds), input VAT
    // (from the resolved input-VAT account). The old route hardcoded
    // inputVat=0 and never subtracted credit memos, so the VAT figure
    // declared to ZATCA was overstated by every refund's VAT plus the
    // entire input VAT eligible for offset.
    const vatRows = await rawQuery<Record<string, unknown>>(
      `SELECT to_char("createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM("vatAmount"), 0) AS "outputVat",
              COUNT(*) AS "invoiceCount"
       FROM invoices
       WHERE "companyId" = $1 AND "deletedAt" IS NULL
         AND "createdAt" >= make_date($2, 1, 1) AND "createdAt" < make_date($2 + 1, 1, 1)
       GROUP BY to_char("createdAt", 'YYYY-MM')`,
      [scope.companyId, thisYear]
    );
    const memoRows = await rawQuery<{ period: string; total: string | number }>(
      `SELECT to_char("memoDate", 'YYYY-MM') AS period,
              COALESCE(SUM("vatAmount"), 0) AS total
       FROM credit_memos
       WHERE "companyId" = $1
         AND "deletedAt" IS NULL
         AND "memoDate" >= make_date($2, 1, 1) AND "memoDate" < make_date($2 + 1, 1, 1)
       GROUP BY to_char("memoDate", 'YYYY-MM')`,
      [scope.companyId, thisYear]
    );
    const inputRows = await rawQuery<{ period: string; total: string | number }>(
      `SELECT to_char(je."createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM(jl.debit), 0) AS total
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL AND je."balancesApplied" = true
       WHERE je."companyId" = $1 AND jl."deletedAt" IS NULL AND jl."accountCode" = $3
         AND je."createdAt" >= make_date($2, 1, 1) AND je."createdAt" < make_date($2 + 1, 1, 1)
       GROUP BY to_char(je."createdAt", 'YYYY-MM')`,
      [scope.companyId, thisYear, inputVatCode]
    );
    const memoByPeriod = new Map<string, number>(memoRows.map((r) => [r.period, Number(r.total)]));
    const inputByPeriod = new Map<string, number>(inputRows.map((r) => [r.period, Number(r.total)]));
    const currentMonth = Number(currentMonthPadded());
    const declarations = vatRows
      .filter((r) => Number(r.invoiceCount ?? 0) > 0)
      .map((r) => {
        const period = r.period as string;
        const m = Number(period.split("-")[1]);
        const outputVat = Number(r.outputVat) - (memoByPeriod.get(period) ?? 0);
        const inputVat = inputByPeriod.get(period) ?? 0;
        return { period, outputVat, inputVat, netVat: outputVat - inputVat, invoiceCount: Number(r.invoiceCount), status: m < currentMonth ? "submitted" : "pending" };
      });
    res.json({ data: declarations });
  } catch (err) {
    handleRouteError(err, res, "Finance route error:");
  }
});
