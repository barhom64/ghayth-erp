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
import { z } from "zod";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { checkFinancialPeriodOpen, updateAccountBalances, todayISO, currentPeriod, currentYear, currentDateInTz, toDateISO, roundTo2, roundTo4, emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { internalTechRef } from "../lib/internalRef.js";
import { scopeCan } from "../lib/rbac/authzEngine.js";
import { logger } from "../lib/logger.js";
import { requestIdempotencyToken, markIdempotencyReplay } from "../lib/requestIdempotency.js";
import { resolveAssetAccounts } from "../lib/finance/assetClassAccounts.js";

export const financeAlgorithmsRouter = Router();
financeAlgorithmsRouter.use(authMiddleware);

// ── Zod schemas ─────────────────────────────────────────────────────────────

const bankReconciliationRowSchema = z.object({
  amount: z.coerce.number().optional(),
  debit: z.coerce.number().optional(),
  credit: z.coerce.number().optional(),
  date: z.string().optional(),
  reference: z.string().optional(),
  ref: z.string().optional(),
  description: z.string().optional(),
  narration: z.string().optional(),
});

const bankImportSchema = z.object({
  rows: z.array(bankReconciliationRowSchema).min(1),
  accountCode: z.string().default("1124"),
  statementDate: z.string().optional(),
});

const bankAutoMatchSchema = z.object({
  batchId: z.string().min(1),
  accountCode: z.string().default("1124"),
  toleranceDays: z.coerce.number().default(3),
});

const bankManualMatchSchema = z.object({
  bankStatementId: z.coerce.number(),
  journalLineId: z.coerce.number(),
});

// #1945 FIN-18 — post the missing adjustment JE for a statement row that has
// no journal counterpart (bank fee / interest). Accounts come from the
// accounting engine, not the request.
const bankPostAdjustmentSchema = z.object({
  bankStatementId: z.coerce.number(),
  notes: z.string().max(1000).optional(),
});

const VALID_DEPRECIATION_METHODS = [
  "straight_line", "declining_balance", "declining_balance_200",
  "declining_balance_150", "sum_of_years_digits", "units_of_production",
] as const;

const createFixedAssetSchema = z.object({
  name: z.string().min(1),
  purchaseCost: z.coerce.number(),
  purchaseDate: z.string().min(1),
  usefulLifeYears: z.coerce.number().default(5),
  salvageValue: z.coerce.number().default(0),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  branchId: z.coerce.number().optional(),
  depreciationMethod: z.string().default("straight_line"),
  assetAccountCode: z.string().default("1280"),
  depreciationAccountCode: z.string().default("5790"),
  accDepreciationAccountCode: z.string().default("1290"),
  // Asset Acquisition Center: when a payment-source (credit) account is
  // supplied, the create also posts a balanced acquisition entry
  // (Dr asset account / Cr payment source) so the purchase is capitalised,
  // not expensed. Omit it to only register the asset without a GL entry.
  paymentAccountCode: z.string().optional().nullable(),
});

const updateFixedAssetSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  salvageValue: z.coerce.number().optional(),
  usefulLifeYears: z.coerce.number().optional(),
  depreciationMethod: z.string().optional(),
  status: z.string().optional(),
});

const depreciateAssetSchema = z.object({
  period: z.string().min(1),
  unitsThisPeriod: z.coerce.number().optional(),
});

const depreciateAllSchema = z.object({
  period: z.string().min(1),
});

// Asset lifecycle schemas — IFRS-compliant transfers / disposal /
// impairment / revaluation. Each posts a JE through financialEngine
// (period gate + sourceKey idempotency enforced) and updates the
// fixed_assets row in the same transaction so the register stays in
// sync with the ledger.
const transferAssetSchema = z.object({
  toBranchId: z.coerce.number().int().positive().optional(),
  toDepartmentId: z.coerce.number().int().positive().optional(),
  toCostCenterId: z.coerce.number().int().positive().optional(),
  transferDate: z.string().optional(),
  reason: z.string().min(3, "سبب النقل مطلوب (3 أحرف على الأقل)"),
});

const disposeAssetSchema = z.object({
  disposalDate: z.string(),
  disposalProceeds: z.coerce.number().min(0).default(0),
  disposalType: z.enum(["sale", "scrap", "donation"]).default("sale"),
  reason: z.string().min(3, "سبب التخلص مطلوب"),
});

const impairAssetSchema = z.object({
  impairmentDate: z.string(),
  // The amount being charged against the asset (DR impairment-loss,
  // CR accumulated-impairment). Must be positive and ≤ current book value.
  impairmentAmount: z.coerce.number().positive("قيمة الانخفاض يجب أن تكون أكبر من صفر"),
  reason: z.string().min(3, "سبب الانخفاض مطلوب"),
});

const revalueAssetSchema = z.object({
  revaluationDate: z.string(),
  // Positive = upward revaluation (DR asset, CR revaluation surplus equity)
  // Negative = downward revaluation (DR revaluation loss, CR asset)
  revaluationDelta: z.coerce.number().refine((v) => v !== 0, "قيمة إعادة التقييم لا يمكن أن تكون صفراً"),
  reason: z.string().min(3, "سبب إعادة التقييم مطلوب"),
});

// CIP (Construction-in-Progress) schemas
const createCipSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, "اسم المشروع مطلوب"),
  description: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  expectedCompletionDate: z.string().optional(),
  cipAccountCode: z.string().optional(),
  targetAssetCategory: z.string().optional(),
  targetAssetAccountCode: z.string().optional(),
  targetDepreciationAccountCode: z.string().optional(),
  targetAccDepreciationAccountCode: z.string().optional(),
  targetUsefulLifeYears: z.coerce.number().int().positive().optional(),
  targetDepreciationMethod: z.string().optional(),
});

const addCipCostSchema = z.object({
  costDate: z.string().min(1, "تاريخ التكلفة مطلوب"),
  description: z.string().min(1, "وصف التكلفة مطلوب"),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  cashAccountCode: z.string().optional(),
  sourceType: z.string().optional(),
  sourceId: z.coerce.number().optional(),
});

const capitalizeCipSchema = z.object({
  capitalizationDate: z.string().min(1, "تاريخ الرسملة مطلوب"),
  assetName: z.string().optional(),
  assetCode: z.string().optional(),
  usefulLifeYears: z.coerce.number().int().positive().optional(),
  depreciationMethod: z.string().optional(),
});

const roundingDiffSchema = z.object({
  journalEntryId: z.coerce.number(),
  roundingAmount: z.coerce.number(),
  description: z.string().optional(),
});

const fxRateUpsertSchema = z.object({
  rateDate: z.string().min(1),
  fromCurrency: z.string().min(1),
  toCurrency: z.string().default("SAR"),
  rate: z.coerce.number().positive(),
  type: z.string().default("spot"),
});

const fxRevaluationPostSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

function assertFinanceRole(scope: any): void {
  // HR-REV-1 #1 — grant-derived: finance write authority (finance:update),
  // held by finance_manager/gm (finance.*) and owner. Replaces FINANCE_ROLES.
  if (!scopeCan(scope, "finance", "update")) {
    throw new ForbiddenError("هذه العملية مخصصة لموظفي المالية فقط", {
      fix: "تتطلب هذه العملية صلاحية كتابة في المالية (finance:update).",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AR AGING — تقادم الذمم المدينة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/ar-aging", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOfDate = (req.query.asOfDate as string) || todayISO();

    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT
         i.id, i.ref, i.status,
         i."dueDate",
         i.total,
         i."paidAmount",
         (i.total - i."paidAmount") AS outstanding,
         ($1::date - i."dueDate"::date) AS "daysOverdue",
         c.id AS "clientId",
         c.name AS "clientName",
         c.phone AS "clientPhone",
         c.email AS "clientEmail"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
       WHERE i."companyId" = $2
         AND i."deletedAt" IS NULL
         AND i.status NOT IN ('paid','cancelled','draft')
         AND (i.total - i."paidAmount") > 0.009
         AND i."dueDate" IS NOT NULL
         AND i."createdAt"::date <= $1::date
       ORDER BY c.name, i."dueDate" ASC
       LIMIT 500`,
      [asOfDate, scope.companyId]
    );

    // Keying by `string` lets each NULL-clientId invoice get its own
    // bucket ("orphan:<invoiceId>") instead of collapsing every NULL
    // under cid=0. Before this fix, an AR aging report with 50 invoices
    // missing clientId (real-estate self-rentals, legacy data, etc.)
    // all aggregated under "عميل #0" and were unactionable. Real
    // clients still bucket by their numeric id rendered as a string.
    const clientMap: Record<string, any> = {};
    let totalCurrent = 0, total1_30 = 0, total31_60 = 0, total61_90 = 0, totalOver90 = 0;

    for (const inv of invoices) {
      const days = Number(inv.daysOverdue ?? 0);
      const outstanding = Number(inv.outstanding ?? 0);
      const realCid = inv.clientId as number | null;
      const cidKey: string = realCid != null ? String(realCid) : `orphan:${inv.id}`;
      const cid: number = realCid ?? 0;
      const clientName = (inv.clientName as string | null)
        || (realCid != null ? `عميل #${realCid}` : `فاتورة بدون عميل #${inv.ref ?? inv.id}`);

      if (!clientMap[cidKey]) {
        clientMap[cidKey] = {
          clientId: cid, clientName, clientPhone: inv.clientPhone, clientEmail: inv.clientEmail,
          current: 0, "1_30": 0, "31_60": 0, "61_90": 0, over90: 0, total: 0, invoices: [],
        };
      }

      const bucket =
        days <= 0 ? "current" :
        days <= 30 ? "1_30" :
        days <= 60 ? "31_60" :
        days <= 90 ? "61_90" : "over90";

      clientMap[cidKey][bucket] += outstanding;
      clientMap[cidKey].total += outstanding;
      clientMap[cidKey].invoices.push({
        id: inv.id, ref: inv.ref, dueDate: inv.dueDate,
        outstanding, daysOverdue: days, bucket,
      });

      if (bucket === "current") totalCurrent += outstanding;
      else if (bucket === "1_30") total1_30 += outstanding;
      else if (bucket === "31_60") total31_60 += outstanding;
      else if (bucket === "61_90") total61_90 += outstanding;
      else totalOver90 += outstanding;
    }

    const clients = Object.values(clientMap).sort((a: any, b: any) => b.total - a.total);
    const grandTotal = totalCurrent + total1_30 + total31_60 + total61_90 + totalOver90;

    res.json({
      asOfDate,
      clients,
      summary: {
        current: totalCurrent,
        "1_30": total1_30,
        "31_60": total31_60,
        "61_90": total61_90,
        over90: totalOver90,
        grandTotal,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "AR Aging error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DSO TREND — Days Sales Outstanding بمرور الزمن
// Computes DSO per month for the last N months:
//   DSO_month = AR_end_of_month / (revenue_in_month / days_in_month)
// Surfaces collection-quality drift the AR aging snapshot can't show.
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/dso-trend", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const months = Math.min(Math.max(Number(req.query.months) || 12, 3), 24);

    // Build the period series in JS so we don't depend on a date-table
    // and can keep the SQL trivially portable across Postgres versions.
    // Anchor on Riyadh wall-clock (currentDateInTz) — using new Date()
    // would walk the UTC month, which trips finance-period-drift in any
    // tenant whose fiscal calendar is local-time-based.
    const todayRiyadh = currentDateInTz("Asia/Riyadh");
    const refYear = Number(todayRiyadh.slice(0, 4));
    const refMonth = Number(todayRiyadh.slice(5, 7)); // 1-12
    const series: Array<{ period: string; year: number; month: number; startDate: string; endDate: string; daysInMonth: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      // Step back i months on (refYear, refMonth) without bouncing off
      // a Date object — pure arithmetic so no TZ deduction happens.
      const monthsFromZero = refYear * 12 + (refMonth - 1) - i;
      const year = Math.floor(monthsFromZero / 12);
      const month = (monthsFromZero % 12) + 1;
      // Last day of (year, month) — pass month as next-month + day 0.
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const period = `${year}-${String(month).padStart(2, "0")}`;
      series.push({
        period,
        year,
        month,
        startDate: `${period}-01`,
        endDate: `${period}-${String(lastDay).padStart(2, "0")}`,
        daysInMonth: lastDay,
      });
    }

    // Revenue per month — sum invoice subtotals approved within the
    // month (excluding cancelled / draft).
    const revenueRows = await rawQuery<{ period: string; revenue: string }>(
      `SELECT TO_CHAR(i."createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM(i.subtotal), 0)::text AS revenue
         FROM invoices i
        WHERE i."companyId" = $1
          AND i."deletedAt" IS NULL
          AND i.status NOT IN ('draft','cancelled','rejected','returned')
          AND i."createdAt" >= $2
        GROUP BY period`,
      [scope.companyId, series[0].startDate]
    );
    const revenueByPeriod = new Map<string, number>();
    for (const r of revenueRows) revenueByPeriod.set(r.period, Number(r.revenue));

    // AR end-of-month — outstanding (total - paid) for every approved
    // invoice whose createdAt ≤ end-of-month and either hasn't been
    // paid yet or was paid AFTER end-of-month. We compute via separate
    // queries per period for clarity; a single windowed query is
    // possible but harder to verify.
    const trend: any[] = [];
    for (const p of series) {
      const [arRow] = await rawQuery<{ ar: string }>(
        `SELECT COALESCE(SUM(i.total - COALESCE(i."paidAmount",0)), 0)::text AS ar
           FROM invoices i
          WHERE i."companyId" = $1
            AND i."deletedAt" IS NULL
            AND i.status NOT IN ('draft','cancelled','rejected','returned')
            AND i."createdAt"::date <= $2::date
            AND (i."paidAt" IS NULL OR i."paidAt"::date > $2::date)`,
        [scope.companyId, p.endDate]
      );
      const arBalance = Number(arRow?.ar ?? 0);
      const revenue = revenueByPeriod.get(p.period) ?? 0;
      const dailyRevenue = revenue / p.daysInMonth;
      const dso = dailyRevenue > 0 ? roundTo2(arBalance / dailyRevenue) : 0;
      trend.push({
        period: p.period,
        endDate: p.endDate,
        revenue: roundTo2(revenue),
        arBalance: roundTo2(arBalance),
        dso,
      });
    }

    // Headline: latest DSO + delta vs 3-month avg
    const latest = trend[trend.length - 1];
    const last3 = trend.slice(-3);
    const avg3 = last3.length === 3
      ? roundTo2(last3.reduce((s, t) => s + t.dso, 0) / 3)
      : null;
    const deltaVs3moAvg = avg3 != null && latest ? roundTo2(latest.dso - avg3) : null;

    res.json({
      months,
      trend,
      summary: {
        latest: latest?.dso ?? 0,
        avg3mo: avg3,
        deltaVs3moAvg,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "DSO trend error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER 360 — ملف عميل شامل
// One endpoint that hands the frontend everything a sales/finance
// reviewer needs about a customer: open AR, paid revenue YTD, last
// payment, oldest unpaid invoice, top buying products, last contact.
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/customer-360/:clientId", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const clientId = parseId(req.params.clientId, "clientId");

    const [client] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, phone, email, address, "taxNumber", "createdAt"
         FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!client) throw new NotFoundError("العميل غير موجود");

    const ytdStart = `${currentYear()}-01-01`;

    const [summary, oldestUnpaid, lastPayment, recentInvoices, topProducts] = await Promise.all([
      // AR summary + lifetime revenue.
      rawQuery<{ openAr: string; ytdRevenue: string; ltdRevenue: string; invoiceCount: string; overdueCount: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled','rejected','returned','paid') THEN (i.total - COALESCE(i."paidAmount",0)) ELSE 0 END), 0)::text AS "openAr",
           COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled','rejected','returned') AND i."createdAt" >= $3::date THEN i.subtotal ELSE 0 END), 0)::text AS "ytdRevenue",
           COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled','rejected','returned') THEN i.subtotal ELSE 0 END), 0)::text AS "ltdRevenue",
           COUNT(CASE WHEN i.status NOT IN ('draft','cancelled','rejected','returned') THEN 1 END)::text AS "invoiceCount",
           COUNT(CASE WHEN i.status NOT IN ('draft','cancelled','rejected','returned','paid')
                       AND i."dueDate" IS NOT NULL
                       AND i."dueDate" < CURRENT_DATE THEN 1 END)::text AS "overdueCount"
         FROM invoices i
        WHERE i."companyId" = $1 AND i."clientId" = $2 AND i."deletedAt" IS NULL`,
        [scope.companyId, clientId, ytdStart]
      ),
      // Oldest unpaid invoice.
      rawQuery<Record<string, unknown>>(
        `SELECT id, ref, total, "paidAmount", (total - COALESCE("paidAmount",0)) AS outstanding,
                "dueDate", (CURRENT_DATE - "dueDate"::date) AS "daysOverdue"
           FROM invoices
          WHERE "companyId" = $1 AND "clientId" = $2 AND "deletedAt" IS NULL
            AND status NOT IN ('draft','cancelled','rejected','returned','paid')
            AND (total - COALESCE("paidAmount",0)) > 0.009
            AND "dueDate" IS NOT NULL
          ORDER BY "dueDate" ASC
          LIMIT 1`,
        [scope.companyId, clientId]
      ),
      // Last cash receipt — read from journal_entries where ref starts with PAY-.
      rawQuery<{ ref: string; date: string; amount: string }>(
        `SELECT je.ref, je."createdAt" AS date, COALESCE(SUM(jl.debit), 0)::text AS amount
           FROM journal_entries je
           JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL AND jl."clientId" = $2
          WHERE je."companyId" = $1
            AND je."deletedAt" IS NULL
            AND je.type = 'payment'
          GROUP BY je.id, je.ref, je."createdAt"
          ORDER BY je."createdAt" DESC
          LIMIT 1`,
        [scope.companyId, clientId]
      ),
      // Last 10 invoices (any status except draft).
      rawQuery<Record<string, unknown>>(
        `SELECT id, ref, status, total, "paidAmount",
                (total - COALESCE("paidAmount",0)) AS outstanding,
                "createdAt", "dueDate", "paidAt"
           FROM invoices
          WHERE "companyId" = $1 AND "clientId" = $2 AND "deletedAt" IS NULL
            AND status NOT IN ('draft')
          ORDER BY "createdAt" DESC
          LIMIT 10`,
        [scope.companyId, clientId]
      ),
      // Top 5 products by spend YTD — joins invoice_lines on this client.
      rawQuery<Record<string, unknown>>(
        `SELECT il."productId",
                COUNT(*)::int AS "lineCount",
                COALESCE(SUM(il.quantity * il."unitPrice"), 0) AS spend,
                COALESCE(MAX(p.name), 'منتج محذوف') AS name
           FROM invoice_lines il
           JOIN invoices i ON i.id = il."invoiceId"
           LEFT JOIN store_products p ON p.id = il."productId"
          WHERE i."companyId" = $1 AND i."clientId" = $2 AND i."deletedAt" IS NULL
            AND i.status NOT IN ('draft','cancelled','rejected','returned')
            AND i."createdAt" >= $3::date
            AND il."productId" IS NOT NULL
          GROUP BY il."productId"
          ORDER BY spend DESC
          LIMIT 5`,
        [scope.companyId, clientId, ytdStart]
      ).catch(() => [] as Record<string, unknown>[]),
    ]);

    res.json({
      client,
      summary: {
        openAr: Number(summary[0]?.openAr ?? 0),
        ytdRevenue: Number(summary[0]?.ytdRevenue ?? 0),
        ltdRevenue: Number(summary[0]?.ltdRevenue ?? 0),
        invoiceCount: Number(summary[0]?.invoiceCount ?? 0),
        overdueCount: Number(summary[0]?.overdueCount ?? 0),
      },
      oldestUnpaid: oldestUnpaid[0] ?? null,
      lastPayment: lastPayment[0] ?? null,
      recentInvoices,
      topProducts,
    });
  } catch (err) {
    handleRouteError(err, res, "Customer 360 error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AP AGING — تقادم الذمم الدائنة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/ap-aging", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOfDate = (req.query.asOfDate as string) || todayISO();

    const orders = await rawQuery<Record<string, unknown>>(
      `SELECT
         po.id, po.ref, po.status,
         'purchase_order' AS "sourceType",
         po."createdAt" AS "orderDate",
         COALESCE(po."expectedDelivery", po."createdAt"::date + INTERVAL '30 days') AS "dueDate",
         po."totalAmount",
         0::numeric AS "paidAmount",
         po."totalAmount" AS outstanding,
         ($1::date - COALESCE(po."expectedDelivery", po."createdAt"::date + INTERVAL '30 days')::date) AS "daysOverdue",
         s.id AS "supplierId",
         s.name AS "supplierName",
         s.phone AS "supplierPhone",
         s.email AS "supplierEmail"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       WHERE po."companyId" = $2 AND po."deletedAt" IS NULL
         AND po.status NOT IN ('cancelled','draft','delivered')
         AND po."totalAmount" > 0.009
         AND po."createdAt"::date <= $1::date
       UNION ALL
       SELECT
         pr.id, pr.ref, pr.status,
         'purchase_request' AS "sourceType",
         pr."createdAt" AS "orderDate",
         (pr."createdAt"::date + INTERVAL '30 days') AS "dueDate",
         COALESCE(pr."totalAmount", 0) AS "totalAmount",
         0::numeric AS "paidAmount",
         COALESCE(pr."totalAmount", 0) AS outstanding,
         ($1::date - (pr."createdAt"::date + INTERVAL '30 days')::date) AS "daysOverdue",
         s2.id AS "supplierId",
         s2.name AS "supplierName",
         s2.phone AS "supplierPhone",
         s2.email AS "supplierEmail"
       FROM purchase_requests pr
       LEFT JOIN suppliers s2 ON s2.id = pr."supplierId" AND s2."deletedAt" IS NULL
       WHERE pr."companyId" = $2
         AND pr.status NOT IN ('cancelled','rejected','completed','draft')
         AND pr."supplierId" IS NOT NULL
         AND COALESCE(pr."totalAmount", 0) > 0.009
         AND pr."createdAt"::date <= $1::date
       UNION ALL
       SELECT
         je.id, je.ref, je.status,
         'accrued_expense' AS "sourceType",
         je."createdAt" AS "orderDate",
         (je."createdAt"::date + INTERVAL '30 days') AS "dueDate",
         (SUM(jl.credit) - SUM(jl.debit)) AS "totalAmount",
         0::numeric AS "paidAmount",
         (SUM(jl.credit) - SUM(jl.debit)) AS outstanding,
         ($1::date - (je."createdAt"::date + INTERVAL '30 days')::date) AS "daysOverdue",
         NULL::integer AS "supplierId",
         je.description AS "supplierName",
         NULL::text AS "supplierPhone",
         NULL::text AS "supplierEmail"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $2
         AND je."deletedAt" IS NULL
         AND je."balancesApplied" = true
         AND (jl."accountCode" LIKE '21%' OR jl."accountCode" LIKE '23%')
         AND je."createdAt"::date <= $1::date
         AND COALESCE(je."sourceType",'') NOT IN ('purchase_order','purchase_request')
       GROUP BY je.id, je.ref, je.status, je."createdAt", je.description
       HAVING (SUM(jl.credit) - SUM(jl.debit)) > 0.009
       ORDER BY "supplierName", "orderDate" ASC
       LIMIT 500`,
      [asOfDate, scope.companyId]
    );

    const supplierMap: Record<string, any> = {};
    let totalCurrent = 0, total1_30 = 0, total31_60 = 0, total61_90 = 0, totalOver90 = 0;

    for (const po of orders) {
      const days = Number(po.daysOverdue ?? 0);
      const outstanding = Number(po.outstanding ?? 0);
      const sid = po.supplierId != null ? String(po.supplierId) : `nosupp_${po.id}`;
      const supplierName = po.supplierName || `مورد #${po.supplierId}`;

      if (!supplierMap[sid]) {
        supplierMap[sid] = {
          supplierId: po.supplierId, supplierName, supplierPhone: po.supplierPhone, supplierEmail: po.supplierEmail,
          current: 0, "1_30": 0, "31_60": 0, "61_90": 0, over90: 0, total: 0, orders: [],
        };
      }

      const bucket =
        days <= 0 ? "current" :
        days <= 30 ? "1_30" :
        days <= 60 ? "31_60" :
        days <= 90 ? "61_90" : "over90";

      supplierMap[sid][bucket] += outstanding;
      supplierMap[sid].total += outstanding;
      supplierMap[sid].orders.push({
        id: po.id, ref: po.ref, dueDate: po.dueDate, sourceType: po.sourceType,
        outstanding, daysOverdue: days, bucket,
      });

      if (bucket === "current") totalCurrent += outstanding;
      else if (bucket === "1_30") total1_30 += outstanding;
      else if (bucket === "31_60") total31_60 += outstanding;
      else if (bucket === "61_90") total61_90 += outstanding;
      else totalOver90 += outstanding;
    }

    const suppliers = Object.values(supplierMap).sort((a: any, b: any) => b.total - a.total);
    const grandTotal = totalCurrent + total1_30 + total31_60 + total61_90 + totalOver90;

    res.json({
      asOfDate,
      suppliers,
      summary: {
        current: totalCurrent,
        "1_30": total1_30,
        "31_60": total31_60,
        "61_90": total61_90,
        over90: totalOver90,
        grandTotal,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "AP Aging error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BANK RECONCILIATION — التسوية البنكية
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.post("/bank-reconciliation/import", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const { rows, accountCode, statementDate } = zodParse(bankImportSchema.safeParse(req.body ?? {}));

    // Internal batch id for grouping the statement lines processed
    // in this run — NOT a customer-visible doc number (Issue #1141).
    const batchId = internalTechRef("BANK");
    let imported = 0;

    await withTransaction(async (client) => {
      for (const row of rows) {
        const amount = Math.abs(Number(row.amount ?? row.debit ?? row.credit ?? 0));
        const type = Number(row.credit ?? 0) > 0 ? "credit" :
                     Number(row.debit ?? 0) > 0 ? "debit" :
                     Number(row.amount ?? 0) >= 0 ? "debit" : "credit";
        let date = statementDate;
        if (row.date) {
          const parsed = new Date(row.date);
          if (!isNaN(parsed.getTime())) {
            date = toDateISO(parsed);
          }
        }
        if (!amount || amount <= 0) continue;

        await client.query(
          `INSERT INTO bank_statements ("companyId","branchId","accountCode","statementDate",reference,description,amount,type,"importBatchId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [scope.companyId, scope.branchId, accountCode, date,
           row.reference ?? row.ref ?? null, row.description ?? row.narration ?? null,
           amount, type, batchId]
        );
        imported++;
      }
    });

    await emitEvent({
      action: "finance.bank_reconciliation.imported",
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "bank_reconciliation",
      entityId: 0,
      details: `imported ${imported} rows, batch ${batchId}`,
      after: { batchId, accountCode, imported },
    });
    // #670 — batch-level audit entry (not per-row, per the issue's
    // bulk-operation guideline). Forensic review needs to attribute
    // the import to a user; the per-row inserts already carry
    // `importBatchId`, so the linking key is `batchId`.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "bank_reconciliation.import",
      entity: "bank_reconciliation",
      entityId: 0,
      after: { batchId, accountCode, statementDate, imported },
    }).catch((e) => logger.error(e, "finance-algorithms bank import audit failed"));
    res.status(201).json({ batchId, imported, message: `تم استيراد ${imported} سطر من الكشف البنكي` });
  } catch (err) {
    handleRouteError(err, res, "Bank reconciliation import error:");
  }
});

financeAlgorithmsRouter.post("/bank-reconciliation/auto-match", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const { batchId, accountCode, toleranceDays } = zodParse(bankAutoMatchSchema.safeParse(req.body ?? {}));

    const bankRows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM bank_statements
       WHERE "companyId" = $1
         AND "importBatchId" = $2
         AND "matchStatus" = 'unmatched'`,
      [scope.companyId, batchId]
    );

    let matched = 0;

    for (const bRow of bankRows) {
      const amount = Number(bRow.amount);
      const date = new Date(bRow.statementDate as string | Date);
      const minDate = new Date(date);
      minDate.setDate(minDate.getDate() - Number(toleranceDays));
      const maxDate = new Date(date);
      maxDate.setDate(maxDate.getDate() + Number(toleranceDays));

      const creditOrDebit = bRow.type === "credit" ? "debit" : "credit";
      if (creditOrDebit !== "debit" && creditOrDebit !== "credit") throw new Error("Invalid column");

      const [jLine] = await rawQuery<Record<string, unknown>>(
        `SELECT jl.id, je."createdAt"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
         WHERE je."companyId" = $1
           AND jl."accountCode" = $2
           AND je."deletedAt" IS NULL
           AND jl.${creditOrDebit} BETWEEN $3 AND $4
           AND je."createdAt"::date BETWEEN $5 AND $6
           AND NOT EXISTS (
             SELECT 1 FROM bank_statements bs
             WHERE bs."matchedJournalLineId" = jl.id
           )
         ORDER BY ABS(jl.${creditOrDebit} - $7), ABS(je."createdAt"::date - $8::date)
         LIMIT 1`,
        [scope.companyId, accountCode,
         amount * 0.99, amount * 1.01,
         toDateISO(minDate), toDateISO(maxDate),
         amount, bRow.statementDate]
      );

      if (jLine) {
        await rawExecute(
          `UPDATE bank_statements SET "matchStatus" = 'matched', "matchedJournalLineId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [jLine.id, bRow.id, scope.companyId]
        );
        matched++;
      }
    }

    const unmatched = bankRows.length - matched;
    await emitEvent({
      action: "finance.bank_reconciliation.matched",
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "bank_reconciliation",
      entityId: 0,
      details: `auto-matched ${matched}/${bankRows.length}, batch ${batchId}`,
      after: { batchId, matched, method: "auto" },
    });
    // #670 — batch-level audit entry. Per-row attribution lives on
    // `bank_statements.matchedJournalLineId`; the audit log records
    // who ran the auto-match, with which tolerance, and how many
    // rows the algorithm matched out of how many candidates.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "bank_reconciliation.auto_match",
      entity: "bank_reconciliation",
      entityId: 0,
      after: { batchId, accountCode, toleranceDays, candidates: bankRows.length, matched, unmatched, method: "auto" },
    }).catch((e) => logger.error(e, "finance-algorithms bank auto-match audit failed"));
    res.json({ matched, unmatched, total: bankRows.length, message: `تمت المطابقة التلقائية: ${matched} متطابق، ${unmatched} غير متطابق` });
  } catch (err) {
    handleRouteError(err, res, "Auto-match error:");
  }
});

financeAlgorithmsRouter.get("/bank-reconciliation/:batchId", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { batchId } = req.params;

    const bankRows = await rawQuery<Record<string, unknown>>(
      `SELECT bs.*,
              jl.debit AS "jeDebit", jl.credit AS "jeCredit",
              je.ref AS "jeRef", je.description AS "jeDescription", je."createdAt" AS "jeDate"
       FROM bank_statements bs
       LEFT JOIN journal_lines jl ON jl.id = bs."matchedJournalLineId" AND jl."deletedAt" IS NULL
       LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL
       WHERE bs."companyId" = $1 AND bs."importBatchId" = $2
       ORDER BY bs."statementDate" ASC
       LIMIT 500`,
      [scope.companyId, batchId]
    );

    const matched = bankRows.filter((r: Record<string, unknown>) => r.matchStatus === "matched");
    const unmatched = bankRows.filter((r: Record<string, unknown>) => r.matchStatus !== "matched");
    const totalDebits = bankRows.filter((r: Record<string, unknown>) => r.type === "debit").reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
    const totalCredits = bankRows.filter((r: Record<string, unknown>) => r.type === "credit").reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);

    res.json({
      batchId,
      rows: bankRows,
      matched,
      unmatched,
      summary: {
        total: bankRows.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        totalDebits,
        totalCredits,
        netBalance: totalDebits - totalCredits,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Bank reconciliation fetch error:");
  }
});

/**
 * GAP_MATRIX item #6 (FIN-008) — bank reconciliation design note.
 *
 * The sweep audit flagged this endpoint as "updates a flag only without
 * posting a GL entry". Re-inspection confirms the design is correct:
 *
 *   - Every bank statement row represents a real-world bank transaction.
 *   - A matching journal_line ALREADY EXISTS from the original payment
 *     or receipt that the operator entered when the payment was made
 *     (DR Bank / CR AR for receipts; DR AP / CR Bank for payments).
 *   - Reconciliation matches a `bank_statements` row to that pre-existing
 *     journal_line — both rows are just FLAGGED as matched. Posting a new
 *     GL entry here would double-count the transaction.
 *
 * The previously-open feature gap — a bank row with no matching journal
 * (bank fee, interest income) — is closed by #1945 FIN-18: POST
 * /bank-reconciliation/post-adjustment below posts the real adjustment JE
 * (DR fee-expense / CR bank, or DR bank / CR interest income) through the
 * accounting engine and matches the row to the freshly-posted bank line.
 */
financeAlgorithmsRouter.post("/bank-reconciliation/manual-match", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { bankStatementId, journalLineId } = zodParse(bankManualMatchSchema.safeParse(req.body ?? {}));
    const [bs] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM bank_statements WHERE id=$1 AND "companyId"=$2 AND "matchStatus"='unmatched'`,
      [bankStatementId, scope.companyId]
    );
    if (!bs) { throw new NotFoundError("سطر الكشف البنكي غير موجود أو تمت مطابقته مسبقاً"); return; }

    const [jl] = await rawQuery<Record<string, unknown>>(
      `SELECT jl.id FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
       WHERE jl.id=$1 AND je."companyId"=$2
         AND je."deletedAt" IS NULL
         AND jl."accountCode"=$3
         AND NOT EXISTS (SELECT 1 FROM bank_statements bs2 WHERE bs2."matchedJournalLineId"=jl.id)`,
      [journalLineId, scope.companyId, bs.accountCode]
    );
    if (!jl) throw new NotFoundError("سطر القيد غير موجود أو لا يتبع نفس الشركة/الحساب أو تمت مطابقته");

    await rawExecute(
      `UPDATE bank_statements SET "matchStatus"='matched', "matchedJournalLineId"=$1 WHERE id=$2 AND "companyId"=$3`,
      [journalLineId, bankStatementId, scope.companyId]
    );
    await emitEvent({
      action: "finance.bank_reconciliation.matched",
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "bank_statements",
      entityId: bankStatementId,
      details: `manually matched bank_statement=${bankStatementId} ↔ journal_line=${journalLineId}`,
      after: { bankStatementId, journalLineId, method: "manual" },
    });
    // #670 — single-row audit entry. entityId points at the
    // bank_statements row that just transitioned to "matched"; the
    // matched journal-line is in `after` so the trail can reconstruct
    // the pairing even if the row is later re-matched.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "bank_reconciliation.manual_match",
      entity: "bank_statements",
      entityId: bankStatementId,
      after: { bankStatementId, journalLineId, accountCode: bs.accountCode, method: "manual" },
    }).catch((e) => logger.error(e, "finance-algorithms bank manual-match audit failed"));
    res.json({ success: true, message: "تمت المطابقة اليدوية" });
  } catch (err) {
    handleRouteError(err, res, "Manual match error:");
  }
});

// #1945 FIN-18 — التسوية البنكية: قيد تسوية حقيقي لسطر كشف بلا قيد مقابل
// (رسوم بنكية / فوائد). الحسابات عبر محرك الحسابات، والقيد يَلِد على تاريخ
// الكشف، والسطر يُطابَق ذرّيًا مع سطر البنك في القيد المُرحَّل.
financeAlgorithmsRouter.post("/bank-reconciliation/post-adjustment", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { bankStatementId, notes } = zodParse(bankPostAdjustmentSchema.safeParse(req.body ?? {}));

    const { postBankAdjustment } = await import("../lib/bankReconciliationService.js");
    const result = await postBankAdjustment({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      bankStatementId,
      notes: notes ?? null,
    });

    await emitEvent({
      action: "finance.bank_reconciliation.matched",
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "bank_statements",
      entityId: bankStatementId,
      details: `adjustment JE ${result.ref} posted (${result.direction}) and matched line ${result.matchedJournalLineId}`,
      after: { bankStatementId, journalId: result.journalId, direction: result.direction, amount: result.amount },
    });
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "bank_reconciliation.post_adjustment",
      entity: "bank_statements",
      entityId: bankStatementId,
      after: {
        journalId: result.journalId, ref: result.ref, direction: result.direction,
        bankAccountCode: result.bankAccountCode, counterAccountCode: result.counterAccountCode, amount: result.amount,
      },
    }).catch((e) => logger.error(e, "finance-algorithms bank post-adjustment audit failed"));

    markIdempotencyReplay(req, res, result.alreadyExists);
    res.status(result.alreadyExists ? 200 : 201).json({
      ...result,
      message: result.alreadyExists ? "قيد التسوية موجود مسبقًا" : "تم ترحيل قيد التسوية ومطابقة السطر",
    });
  } catch (err) {
    handleRouteError(err, res, "Bank post-adjustment error:");
  }
});

financeAlgorithmsRouter.get("/journal-lines/search", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode: acc, search, amount, pageSize = "20" } = req.query as Record<string, string | undefined>;

    let conditions = [`je."companyId"=$1`, `je."deletedAt" IS NULL`];
    const params: unknown[] = [scope.companyId];

    if (acc) { params.push(acc); conditions.push(`jl."accountCode"=$${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(je.ref ILIKE $${params.length} OR je.description ILIKE $${params.length})`); }
    if (amount) {
      const amt = Number(amount);
      params.push(amt * 0.99, amt * 1.01);
      conditions.push(`(jl.debit BETWEEN $${params.length - 1} AND $${params.length} OR jl.credit BETWEEN $${params.length - 1} AND $${params.length})`);
    }
    conditions.push(`NOT EXISTS (SELECT 1 FROM bank_statements bs WHERE bs."matchedJournalLineId"=jl.id)`);

    params.push(Math.min(Number(pageSize), 50));
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT jl.id, jl."accountCode", jl.debit, jl.credit, jl.description,
              je.ref AS "jeRef", je.description AS "jeDescription", je."createdAt" AS "jeDate"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl."journalId" AND jl."deletedAt" IS NULL
       WHERE ${conditions.join(" AND ")}
       ORDER BY je."createdAt" DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Journal lines search error:");
  }
});

financeAlgorithmsRouter.get("/bank-reconciliation", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const batches = await rawQuery<Record<string, unknown>>(
      `SELECT "importBatchId" AS "batchId",
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE "matchStatus"='matched') AS matched,
              MIN("statementDate") AS "fromDate",
              MAX("statementDate") AS "toDate",
              "accountCode",
              MIN("createdAt") AS "importedAt"
       FROM bank_statements
       WHERE "companyId" = $1
       GROUP BY "importBatchId", "accountCode"
       ORDER BY MIN("createdAt") DESC
       LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: batches });
  } catch (err) {
    handleRouteError(err, res, "List bank reconciliation batches error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIXED ASSETS & DEPRECIATION — الأصول الثابتة والإهلاك
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/fixed-assets", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE "companyId" = $1 ORDER BY "purchaseDate" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List fixed assets error:");
  }
});

financeAlgorithmsRouter.post("/fixed-assets", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const b = zodParse(createFixedAssetSchema.safeParse(req.body ?? {}));
    const usefulYears = b.usefulLifeYears;
    if (!usefulYears || usefulYears <= 0) {
      throw new ValidationError("العمر الإنتاجي يجب أن يكون أكبر من صفر");
    }
    const purchaseCost = b.purchaseCost;
    const salvageValue = b.salvageValue;

    const insertSql = `INSERT INTO fixed_assets (
         "companyId","branchId",code,name,description,category,
         "purchaseDate","purchaseCost","salvageValue","usefulLifeYears",
         "depreciationMethod","currentBookValue","accumulatedDepreciation",
         "assetAccountCode","depreciationAccountCode","accDepreciationAccountCode",status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15,'active')`;
    // Book the asset into its per-class accounts (by category) instead of the
    // generic "other" defaults; an explicit per-asset code still wins.
    const acct = resolveAssetAccounts(b);
    const insertParams = [scope.companyId, b.branchId ?? scope.branchId, b.code ?? null, b.name,
       b.description ?? null, b.category ?? null, b.purchaseDate,
       purchaseCost, salvageValue, usefulYears,
       b.depreciationMethod, purchaseCost,
       acct.asset, acct.dep,
       acct.accDep];

    let insertId = 0;
    if (b.paymentAccountCode) {
      // Asset Acquisition Center: capitalise the purchase rather than
      // expensing it. The register row and the acquisition journal entry
      // (Dr asset account / Cr payment source, balanced by construction)
      // commit atomically so the GL and the asset register can never
      // diverge — same withTransaction pattern as depreciate/dispose.
      const paymentAcct = b.paymentAccountCode;
      const { financialEngine } = await import("../lib/engines/index.js");
      await withTransaction(async (client) => {
        const ins = await client.query(`${insertSql} RETURNING id`, insertParams);
        insertId = ins.rows[0].id as number;
        await financialEngine.postJournalEntry({
          companyId: scope.companyId,
          branchId: b.branchId ?? scope.branchId,
          createdBy: scope.activeAssignmentId,
          ref: `ACQ-${b.code ?? insertId}`,
          description: `اقتناء أصل ثابت: ${b.name}`,
          type: "fixed_asset_acquisition",
          sourceType: "fixed_asset_acquisition",
          sourceId: insertId,
          sourceKey: `finance:asset_acquisition:${insertId}`,
          lines: [
            { accountCode: acct.asset, debit: purchaseCost, credit: 0, description: `اقتناء ${b.name}`, assetId: insertId },
            { accountCode: paymentAcct, debit: 0, credit: purchaseCost, description: `سداد اقتناء ${b.name}` },
          ],
        });
      });
      assertInsert(insertId, "fixed_assets");
    } else {
      const res = await rawExecute(insertSql, insertParams);
      insertId = assertInsert(res.insertId, "fixed_assets");
    }
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fixed_assets WHERE id = $1 AND "companyId" = $2`, [insertId, scope.companyId]);
    // #670 — fixed_assets create audit. Captures the immutable input
    // contract (cost, salvage, useful life, depreciation method,
    // account mapping) so forensic review can reconstruct the asset's
    // initial conditions even after subsequent updates.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fixed_assets.create",
      entity: "fixed_assets",
      entityId: insertId,
      after: {
        code: b.code ?? null,
        name: b.name,
        category: b.category ?? null,
        purchaseDate: b.purchaseDate,
        purchaseCost,
        salvageValue,
        usefulLifeYears: usefulYears,
        depreciationMethod: b.depreciationMethod,
        assetAccountCode: acct.asset,
        depreciationAccountCode: acct.dep,
        accDepreciationAccountCode: acct.accDep,
        paymentAccountCode: b.paymentAccountCode ?? null,
        acquisitionPosted: Boolean(b.paymentAccountCode),
      },
    }).catch((e) => logger.error(e, "finance-algorithms fixed_assets create audit failed"));
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create fixed asset error:");
  }
});

financeAlgorithmsRouter.get("/fixed-assets/:id", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!asset) { throw new NotFoundError("الأصل غير موجود"); return; }
    const schedule = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM depreciation_entries WHERE "assetId"=$1 AND "companyId"=$2 ORDER BY period ASC`,
      [asset.id, scope.companyId]
    );
    res.json({ ...asset, schedule });
  } catch (err) {
    handleRouteError(err, res, "Get fixed asset error:");
  }
});

financeAlgorithmsRouter.patch("/fixed-assets/:id", authorize({ feature: "finance.algorithms", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateFixedAssetSchema.safeParse(req.body ?? {}));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: unknown[] = [];
    if (b.usefulLifeYears !== undefined && b.usefulLifeYears <= 0) {
      throw new ValidationError("العمر الإنتاجي يجب أن يكون أكبر من صفر");
    }
    const f = (col: string, val: unknown) => { if (val !== undefined) { params.push(val); sets.push(`"${col}"=$${params.length}`); } };
    f("name", b.name); f("description", b.description); f("category", b.category);
    f("salvageValue", b.salvageValue); f("usefulLifeYears", b.usefulLifeYears);
    f("depreciationMethod", b.depreciationMethod); f("status", b.status);
    if (sets.length === 1) { throw new ValidationError("لا توجد تغييرات"); return; }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fixed_assets SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!row) { throw new NotFoundError("الأصل غير موجود"); return; }
    // #670 — fixed_assets update audit. Logs only the validated patch
    // payload (zod-parsed `b`) so the trail records exactly what was
    // changed. Status flips (status field) are captured here too,
    // pending a separate Lifecycle migration to applyTransition
    // (tracked under #664 — direct UPDATE bypass).
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fixed_assets.update",
      entity: "fixed_assets",
      entityId: id,
      after: {
        name: b.name,
        description: b.description,
        category: b.category,
        salvageValue: b.salvageValue,
        usefulLifeYears: b.usefulLifeYears,
        depreciationMethod: b.depreciationMethod,
        status: b.status,
      },
    }).catch((e) => logger.error(e, "finance-algorithms fixed_assets update audit failed"));
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Update fixed asset error:");
  }
});

/**
 * Calculate monthly depreciation for an asset, capped at remaining
 * depreciable amount. Supports:
 *   * straight_line           — (cost - salvage) / lifeMonths
 *   * declining_balance       — 200% DB on current book value
 *   * declining_balance_150   — 150% DB
 *   * sum_of_years_digits     — SYD weighted each year, split by month
 *   * units_of_production     — pass unitsThisPeriod + totalLifetimeUnits
 * Falls back to straight-line for unknown methods.
 */
function calcDepreciationAmount(asset: any, _period: string, opts?: { unitsThisPeriod?: number }): number {
  const purchaseCost = Number(asset.purchaseCost);
  const salvageValue = Number(asset.salvageValue);
  const usefulLife = Number(asset.usefulLifeYears);
  const accumulatedDepreciation = Number(asset.accumulatedDepreciation ?? 0);
  const accumulatedImpairment = Number(asset.accumulatedImpairment ?? 0);
  // currentBookValue (if stored) already reflects both depreciation and impairment.
  // Fallback recomputes it from components to handle assets created before migration 338.
  const currentBookValue = Number(asset.currentBookValue ?? (purchaseCost - accumulatedDepreciation - accumulatedImpairment));
  const remainingDepreciable = Math.max(0, currentBookValue - salvageValue);

  if (remainingDepreciable <= 0) return 0;
  if (!usefulLife || usefulLife <= 0) return 0;

  const method = asset.depreciationMethod || "straight_line";
  const depreciable = purchaseCost - salvageValue;
  let monthlyAmount: number;

  if (method === "declining_balance" || method === "declining_balance_200") {
    const annualRate = 2 / usefulLife;
    monthlyAmount = roundTo2(currentBookValue * (annualRate / 12));
  } else if (method === "declining_balance_150") {
    const annualRate = 1.5 / usefulLife;
    monthlyAmount = roundTo2(currentBookValue * (annualRate / 12));
  } else if (method === "sum_of_years_digits") {
    if (depreciable === 0) return 0;
    const monthsElapsed = Math.max(0,
      Math.round((Number(asset.accumulatedDepreciation) / depreciable) * (usefulLife * 12))
    );
    const yearIndex = Math.min(usefulLife - 1, Math.floor(monthsElapsed / 12));
    const weight = (usefulLife - yearIndex) / ((usefulLife * (usefulLife + 1)) / 2);
    const yearAmount = depreciable * weight;
    monthlyAmount = roundTo2(yearAmount / 12);
  } else if (method === "units_of_production") {
    const total = Number(asset.totalLifetimeUnits || 0);
    const units = Number(opts?.unitsThisPeriod || 0);
    if (total <= 0 || units <= 0) return 0;
    monthlyAmount = roundTo2((depreciable * units) / total);
  } else {
    monthlyAmount = roundTo2(depreciable / (usefulLife * 12));
  }

  return Math.min(monthlyAmount, remainingDepreciable);
}

financeAlgorithmsRouter.get("/fixed-assets/:id/schedule", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!asset) { throw new NotFoundError("الأصل غير موجود"); return; }

    const purchaseCost = Number(asset.purchaseCost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLifeYears = Number(asset.usefulLifeYears);
    if (!usefulLifeYears || usefulLifeYears <= 0) {
      throw new ValidationError("العمر الإنتاجي غير محدد لهذا الأصل — لا يمكن حساب جدول الإهلاك");
    }
    const usefulLifeMonths = usefulLifeYears * 12;
    const depreciable = purchaseCost - salvageValue;
    const scheduleRows: any[] = [];
    let bookValue = purchaseCost;
    let accumulated = 0;

    const method = asset.depreciationMethod || "straight_line";
    const sydDenom = (usefulLifeYears * (usefulLifeYears + 1)) / 2;

    if (method === "units_of_production") {
      res.json({
        assetId: asset.id,
        assetName: asset.name,
        schedule: [],
        totalDepreciable: depreciable,
        note: "طريقة وحدات الإنتاج لا يمكن جدولتها مسبقاً — يتم تسجيلها شهرياً حسب الوحدات المنتجة فعلياً",
      });
      return;
    }

    const purchaseDate = new Date(asset.purchaseDate as string | Date);
    for (let m = 0; m < usefulLifeMonths; m++) {
      const d = new Date(purchaseDate);
      d.setMonth(d.getMonth() + m + 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      let monthlyDep: number;
      if (method === "declining_balance" || method === "declining_balance_200") {
        const annualRate = 2 / usefulLifeYears;
        monthlyDep = Math.max(0, roundTo2(bookValue * (annualRate / 12)));
      } else if (method === "declining_balance_150") {
        const annualRate = 1.5 / usefulLifeYears;
        monthlyDep = Math.max(0, roundTo2(bookValue * (annualRate / 12)));
      } else if (method === "sum_of_years_digits") {
        const yearIndex = Math.min(usefulLifeYears - 1, Math.floor(m / 12));
        const weight = (usefulLifeYears - yearIndex) / sydDenom;
        const yearAmount = depreciable * weight;
        monthlyDep = roundTo2(yearAmount / 12);
      } else {
        monthlyDep = roundTo2(depreciable / usefulLifeMonths);
      }

      if (bookValue - monthlyDep < salvageValue) {
        monthlyDep = Math.max(0, bookValue - salvageValue);
      }
      if (monthlyDep <= 0) break;

      accumulated += monthlyDep;
      bookValue -= monthlyDep;

      scheduleRows.push({ period, depreciationAmount: monthlyDep, accumulatedDepreciation: accumulated, bookValue: Math.max(bookValue, salvageValue) });
    }

    res.json({ assetId: asset.id, assetName: asset.name, method, schedule: scheduleRows, totalDepreciable: depreciable });
  } catch (err) {
    handleRouteError(err, res, "Depreciation schedule error:");
  }
});

financeAlgorithmsRouter.post("/fixed-assets/:id/depreciate", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const { period, unitsThisPeriod } = zodParse(depreciateAssetSchema.safeParse(req.body ?? {}));
    const targetPeriod = period;

    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [id, scope.companyId]
    );
    if (!asset) { throw new NotFoundError("الأصل غير موجود أو غير نشط"); return; }

    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM depreciation_entries WHERE "assetId"=$1 AND period=$2 AND "companyId"=$3`,
      [id, targetPeriod, scope.companyId]
    );
    if (existing) {
      throw new ConflictError(`تم إهلاك هذا الأصل لفترة ${targetPeriod} مسبقاً`);
    }

    const depAmount = calcDepreciationAmount(asset, targetPeriod, { unitsThisPeriod: Number(unitsThisPeriod) || 0 });
    if (depAmount <= 0) {
      throw new ValidationError("لا يوجد إهلاك متبقي لهذا الأصل");
    }

    const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
    const newBookValue = Math.max(
      Number(asset.purchaseCost) - newAccumulated - Number(asset.accumulatedImpairment ?? 0),
      Number(asset.salvageValue),
    );

    let entryId: number | undefined;
    let journalId: number | undefined;

    const { financialEngine } = await import("../lib/engines/index.js");
    // Atomicity: JE post + depreciation_entries INSERT + fixed_assets
    // UPDATE all commit or roll back together. The earlier shape called
    // engine.post FIRST, then opened a withTransaction. A throw from
    // the txn (FK on assetId, depreciation_entries unique constraint
    // on (assetId, period)) left the JE committed without a
    // depreciation_entries row. Retry then hit the engine's sourceKey
    // check (`finance:depreciation:${assetId}:${period}`) → returned
    // alreadyExists=true → skipped the JE post → withTransaction still
    // failed (or succeeded with wrong journalId reference) → silent
    // mismatch between GL and depreciation schedule. Same fix pattern
    // as #1004 / #1012 / #1014 / #1015.
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId ?? asset.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `DEP-${asset.code ?? asset.id}-${targetPeriod}`,
        description: `إهلاك شهري: ${asset.name} — ${targetPeriod}`,
        type: "depreciation",
        sourceType: "depreciation",
        sourceId: asset.id as number,
        sourceKey: `finance:depreciation:${asset.id}:${targetPeriod}`,
        lines: [
          { accountCode: (asset.depreciationAccountCode as string | null) ?? "5790", debit: depAmount, credit: 0, description: `إهلاك ${asset.name}`, assetId: asset.id as number },
          { accountCode: (asset.accDepreciationAccountCode as string | null) ?? "1290", debit: 0, credit: depAmount, description: `مجمع إهلاك ${asset.name}`, assetId: asset.id as number },
        ],
      });
      journalId = posted.journalId;

      const entRes = await client.query(
        `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
         VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW()) RETURNING id`,
        [id, scope.companyId, targetPeriod, depAmount, newBookValue, journalId]
      );
      entryId = entRes.rows[0].id;

      await client.query(
        `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
        [newAccumulated, newBookValue, id, scope.companyId]
      );
    });

    // #670 — single-asset depreciation audit. Financially material
    // (touches P&L via the depreciation_account, balance sheet via
    // accumulated depreciation). Links to the journal entry that was
    // posted by financialEngine.postJournalEntry above so a reviewer
    // can trace asset → audit → depreciation_entries → journal_entries
    // → journal_lines from the trail alone.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fixed_assets.depreciate",
      entity: "fixed_assets",
      entityId: id,
      after: {
        period: targetPeriod,
        depreciationAmount: depAmount,
        bookValueBefore: Number(asset.currentBookValue ?? asset.purchaseCost),
        bookValueAfter: newBookValue,
        accumulatedDepreciationAfter: newAccumulated,
        depreciationEntryId: entryId,
        journalId,
      },
    }).catch((e) => logger.error(e, "finance-algorithms fixed_assets depreciate audit failed"));
    res.status(201).json({
      entryId,
      period: targetPeriod,
      depreciationAmount: depAmount,
      newBookValue,
      newAccumulatedDepreciation: newAccumulated,
      message: `تم تسجيل إهلاك ${depAmount.toFixed(2)} ﷼ للفترة ${targetPeriod}`,
    });
  } catch (err) {
    handleRouteError(err, res, "Depreciate asset error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY DEPRECIATION BATCH — إهلاك دفعي لجميع الأصول
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.post("/fixed-assets/depreciate-all", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { period } = zodParse(depreciateAllSchema.safeParse(req.body ?? {}));
    const targetPeriod = period;

    const assets = await rawQuery<Record<string, unknown>>(
      `SELECT fa.* FROM fixed_assets fa WHERE fa."companyId"=$1 AND fa.status='active'
       AND NOT EXISTS (SELECT 1 FROM depreciation_entries de WHERE de."assetId"=fa.id AND de.period=$2)`,
      [scope.companyId, targetPeriod]
    );

    let processed = 0, skipped = 0;
    const results: any[] = [];

    for (const asset of assets) {
      const depAmount = calcDepreciationAmount(asset, targetPeriod);
      if (depAmount <= 0) { skipped++; continue; }

      const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
      const newBookValue = Math.max(
        Number(asset.purchaseCost) - newAccumulated - Number(asset.accumulatedImpairment ?? 0),
        Number(asset.salvageValue),
      );

      const { financialEngine } = await import("../lib/engines/index.js");
      // Per-asset atomicity: same shape as the single-asset depreciation
      // route above. Engine post + depreciation_entries INSERT + fixed_
      // assets UPDATE must all commit or roll back together so the GL
      // and the asset schedule stay in sync. Failing one asset's
      // depreciation does NOT halt the whole batch (each iteration is
      // its own txn — intentional design for monthly bulk processing).
      await withTransaction(async (client) => {
        const posted = await financialEngine.postJournalEntry({
          companyId: scope.companyId,
          branchId: (asset.branchId as number | null) ?? scope.branchId,
          createdBy: scope.activeAssignmentId,
          ref: `DEP-${asset.code ?? asset.id}-${targetPeriod}`,
          description: `إهلاك شهري: ${asset.name} — ${targetPeriod}`,
          type: "depreciation",
          sourceType: "depreciation",
          sourceId: asset.id as number,
          sourceKey: `finance:depreciation:${asset.id}:${targetPeriod}`,
          lines: [
            { accountCode: (asset.depreciationAccountCode as string | null) ?? "5790", debit: depAmount, credit: 0, assetId: asset.id as number },
            { accountCode: (asset.accDepreciationAccountCode as string | null) ?? "1290", debit: 0, credit: depAmount, assetId: asset.id as number },
          ],
        });

        await client.query(
          `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW())`,
          [asset.id, scope.companyId, targetPeriod, depAmount, newBookValue, posted.journalId]
        );
        await client.query(
          `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
          [newAccumulated, newBookValue, asset.id, scope.companyId]
        );
      });

      results.push({ assetId: asset.id, assetName: asset.name, depAmount, newBookValue });
      processed++;
    }

    const totalDepreciation = results.reduce((s: number, r: any) => s + Number(r.depAmount || 0), 0);
    await emitEvent({
      action: "finance.fixed_assets.batch_depreciated",
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "fixed_assets",
      entityId: 0,
      details: `period=${targetPeriod} processed=${processed} skipped=${skipped} total=${roundTo2(totalDepreciation)}`,
      after: { period: targetPeriod, assetsCount: processed, totalDepreciation: roundTo2(totalDepreciation) },
    });
    // #670 — batch-level audit entry. Per-asset attribution lives in
    // depreciation_entries.assetId + journal_entries.sourceKey; the
    // audit row records who triggered the batch run and the period
    // aggregate. Mirrors the bank-reconciliation batch shape (#672).
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fixed_assets.depreciate_all",
      entity: "fixed_assets",
      entityId: 0,
      after: {
        period: targetPeriod,
        eligibleAssets: assets.length,
        processed,
        skipped,
        totalDepreciation: roundTo2(totalDepreciation),
      },
    }).catch((e) => logger.error(e, "finance-algorithms fixed_assets depreciate-all audit failed"));
    res.json({
      period: targetPeriod,
      processed,
      skipped,
      total: assets.length,
      results,
      message: `تم تسجيل إهلاك ${processed} أصل للفترة ${targetPeriod}`,
    });
  } catch (err) {
    handleRouteError(err, res, "Depreciate all error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ASSET LIFECYCLE — TRANSFER / DISPOSAL / IMPAIRMENT / REVALUATION
// IFRS-compliant flows. Each posts a GL entry through financialEngine
// (period gate + sourceKey idempotency) and updates fixed_assets in the
// same transaction so the register stays in sync with the ledger.
// ─────────────────────────────────────────────────────────────────────────────

// POST /fixed-assets/:id/transfer — move an asset between branches /
// departments / cost-centres. No DR/CR pair on the asset code itself
// (the asset doesn't change value) — the journal carries DIM rebooks
// only. We still post a balanced entry on the asset's own account so
// the dim aggregates flip cleanly.
financeAlgorithmsRouter.post("/fixed-assets/:id/transfer", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(transferAssetSchema.safeParse(req.body ?? {}));
    const transferDate = b.transferDate || todayISO();

    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [id, scope.companyId]
    );
    if (!asset) throw new NotFoundError("الأصل غير موجود أو غير نشط");

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, transferDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن نقل أصل في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "transferDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const oldBranchId = (asset.branchId as number | null) ?? null;
    const newBranchId = b.toBranchId ?? oldBranchId;
    if (oldBranchId === newBranchId && !b.toDepartmentId && !b.toCostCenterId) {
      throw new ValidationError("لا يوجد تغيير في الفرع / القسم / مركز التكلفة");
    }

    const bookValue = Number(asset.currentBookValue ?? 0);
    const { financialEngine } = await import("../lib/engines/index.js");
    // R1: use intent-resolved account; stored code overrides if not the known-bad default "1500"
    const storedCode = asset.assetAccountCode as string | null;
    const assetCode = (storedCode && storedCode !== "1500")
      ? storedCode
      : await financialEngine.resolveAccountCode(scope.companyId, "asset_cost", "debit", "1270");

    let journalId: number | null = null;
    await withTransaction(async (client) => {
      // Post a zero-net reclassification entry: DR + CR on the SAME asset
      // code, the DR line tagged with the new dims and the CR line tagged
      // with the old dims. Per-branch / per-dept asset roll-ups flip on
      // the next period because both legs land on dim-aggregated lines.
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: newBranchId ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `XFER-${asset.code ?? asset.id}-${transferDate}`,
        description: `نقل أصل: ${asset.name} — ${b.reason}`,
        type: "asset_transfer",
        sourceType: "fixed_asset_transfer",
        sourceId: id,
        sourceKey: `finance:asset_transfer:${id}:${transferDate}`,
        lines: [
          { accountCode: assetCode, debit: bookValue, credit: 0, assetId: id, departmentId: b.toDepartmentId, costCenterId: b.toCostCenterId },
          { accountCode: assetCode, debit: 0, credit: bookValue, assetId: id, departmentId: (asset.departmentId as number | null) ?? undefined, costCenterId: (asset.costCenterId as number | null) ?? undefined },
        ],
      });
      journalId = posted.journalId;
      // يحفظ الفرع والقسم ومركز التكلفة في سجل الأصل — لا يكتفى بأبعاد GL.
      // b.toDepartmentId / b.toCostCenterId قد تكون undefined (لم يتغيرا) فتبقى
      // القيمة الحالية؛ لذلك نستخدم COALESCE لتجنب مسحها بـ NULL.
      await client.query(
        `UPDATE fixed_assets
            SET "branchId"    = $1,
                "departmentId" = COALESCE($2, "departmentId"),
                "costCenterId" = COALESCE($3, "costCenterId"),
                "updatedAt"   = NOW()
          WHERE id = $4 AND "companyId" = $5`,
        [newBranchId, b.toDepartmentId ?? null, b.toCostCenterId ?? null, id, scope.companyId]
      );
    });

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fixed_assets.transfer", entity: "fixed_assets", entityId: id,
      before: {
        branchId: oldBranchId,
        departmentId: (asset.departmentId as number | null) ?? null,
        costCenterId: (asset.costCenterId as number | null) ?? null,
      },
      after: {
        branchId: newBranchId,
        departmentId: b.toDepartmentId ?? (asset.departmentId as number | null) ?? null,
        costCenterId: b.toCostCenterId ?? (asset.costCenterId as number | null) ?? null,
        transferDate,
        reason: b.reason,
        journalEntryId: journalId,
      },
    }).catch((e) => logger.error(e, "fixed_assets transfer audit failed"));

    res.json({ message: "تم نقل الأصل بنجاح", journalEntryId: journalId, transferDate });
  } catch (err) {
    handleRouteError(err, res, "Transfer asset error:");
  }
});

// POST /fixed-assets/:id/dispose — retire / sell / scrap / donate an
// asset. The entry pattern:
//   DR Cash / Receivable          ← proceeds (if any)
//   DR Accumulated-Depreciation   ← reverse the dep schedule
//   DR/CR Loss/Gain on disposal   ← plug to balance
//        CR Fixed-Asset           ← original cost
financeAlgorithmsRouter.post("/fixed-assets/:id/dispose", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(disposeAssetSchema.safeParse(req.body ?? {}));

    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!asset) throw new NotFoundError("الأصل غير موجود");
    if (asset.status !== "active") throw new ConflictError(`لا يمكن التخلص من أصل بحالة "${asset.status}"`);

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, b.disposalDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن التخلص من أصل في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "disposalDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const cost = Number(asset.purchaseCost ?? 0);
    const accDep = Number(asset.accumulatedDepreciation ?? 0);
    const accImpairment = roundTo2(Number(asset.accumulatedImpairment ?? 0));
    // R4: use currentBookValue (reflects both depreciation AND impairment);
    // fallback recomputes from components for assets without stored currentBookValue.
    const bookValue = roundTo2(Number(asset.currentBookValue ?? (cost - accDep - accImpairment)));
    const proceeds = roundTo2(b.disposalProceeds);
    const gainLoss = roundTo2(proceeds - bookValue);

    const { financialEngine } = await import("../lib/engines/index.js");
    // R1: resolve via intent when stored code is the legacy default
    const storedAssetCode = asset.assetAccountCode as string | null;
    const storedAccDepCode = asset.accDepreciationAccountCode as string | null;
    const [assetCode, accDepCode, cashCode, lossCode, gainCode] = await Promise.all([
      (storedAssetCode && storedAssetCode !== "1500")
        ? Promise.resolve(storedAssetCode)
        : financialEngine.resolveAccountCode(scope.companyId, "asset_cost", "credit", "1270"),
      (storedAccDepCode && storedAccDepCode !== "1290")
        ? Promise.resolve(storedAccDepCode)
        : financialEngine.resolveAccountCode(scope.companyId, "asset_accumulated_depreciation", "debit", "1290"),
      // fallback 1111 (نقدية صندوق — postable leaf) — main أصلح هذا في #2192
      financialEngine.resolveAccountCode(scope.companyId, "asset_disposal_cash", "debit", "1111"),
      // fallback 5810 (خسائر بيع أصول ثابتة) وليس 5999 — 5999 غير موجود في القالب
      financialEngine.resolveAccountCode(scope.companyId, "asset_disposal_loss", "debit", "5810"),
      // fallback 4920 (أرباح بيع أصول ثابتة) وليس 4999 — 4999 غير موجود في القالب
      financialEngine.resolveAccountCode(scope.companyId, "asset_disposal_gain", "credit", "4920"),
    ]);

    // R4: also resolve accumulated-impairment account so we can reverse it on disposal
    const accImpairmentCode = await financialEngine.resolveAccountCode(
      scope.companyId, "asset_accumulated_impairment", "debit", "1291"
    );

    const lines: any[] = [];
    if (proceeds > 0) {
      lines.push({ accountCode: cashCode, debit: proceeds, credit: 0, assetId: id, description: `حصيلة بيع الأصل ${asset.name}` });
    }
    if (accDep > 0) {
      lines.push({ accountCode: accDepCode, debit: accDep, credit: 0, assetId: id, description: `تخلص — إلغاء مجمع الإهلاك` });
    }
    // R4: reverse accumulated impairment on disposal (closes the IAS 36 contra-asset)
    if (accImpairment > 0) {
      lines.push({ accountCode: accImpairmentCode, debit: accImpairment, credit: 0, assetId: id, description: `تخلص — إلغاء مجمع هبوط القيمة` });
    }
    lines.push({ accountCode: assetCode, debit: 0, credit: cost, assetId: id, description: `تخلص — إلغاء أصل ثابت` });
    if (gainLoss < 0) {
      lines.push({ accountCode: lossCode, debit: Math.abs(gainLoss), credit: 0, assetId: id, description: `خسارة تخلص من أصل` });
    } else if (gainLoss > 0) {
      lines.push({ accountCode: gainCode, debit: 0, credit: gainLoss, assetId: id, description: `ربح تخلص من أصل` });
    }

    let journalId: number | null = null;
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (asset.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `DISP-${asset.code ?? asset.id}-${b.disposalDate}`,
        description: `تخلص من أصل: ${asset.name} (${b.disposalType}) — ${b.reason}`,
        type: "asset_disposal",
        sourceType: "fixed_asset_disposal",
        sourceId: id,
        sourceKey: `finance:asset_disposal:${id}`,
        lines,
      });
      journalId = posted.journalId;
      await client.query(
        `UPDATE fixed_assets SET status='disposed', "disposedAt"=$1, "disposalValue"=$2, "updatedAt"=NOW()
         WHERE id=$3 AND "companyId"=$4`,
        [b.disposalDate, proceeds, id, scope.companyId]
      );
    });

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fixed_assets.dispose", entity: "fixed_assets", entityId: id,
      before: { status: "active", bookValue },
      after: { status: "disposed", disposalDate: b.disposalDate, proceeds, gainLoss, journalEntryId: journalId, reason: b.reason },
    }).catch((e) => logger.error(e, "fixed_assets dispose audit failed"));

    res.json({ message: "تم تسجيل التخلص من الأصل", journalEntryId: journalId, bookValueAtDisposal: bookValue, proceeds, gainLoss });
  } catch (err) {
    handleRouteError(err, res, "Dispose asset error:");
  }
});

// POST /fixed-assets/:id/impair — IAS 36 impairment loss. The entry:
//   DR Impairment loss (P&L)         ← impairment amount
//        CR Accumulated impairment   ← impairment amount
// We accumulate into a separate ledger (impairment-account, default 1591)
// so the asset's purchase-cost column stays intact and the depreciation
// schedule continues on the post-impairment book value.
financeAlgorithmsRouter.post("/fixed-assets/:id/impair", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(impairAssetSchema.safeParse(req.body ?? {}));

    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [id, scope.companyId]
    );
    if (!asset) throw new NotFoundError("الأصل غير موجود أو غير نشط");

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, b.impairmentDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن تسجيل انخفاض القيمة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "impairmentDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const bookValue = Number(asset.currentBookValue ?? 0);
    if (b.impairmentAmount > bookValue) {
      throw new ValidationError(
        `قيمة الانخفاض (${b.impairmentAmount}) تتجاوز القيمة الدفترية الحالية (${bookValue})`,
        { field: "impairmentAmount", fix: `الحد الأقصى ${bookValue}` }
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [lossCode, accImpairmentCode] = await Promise.all([
      // fallback 5850 (خسارة انخفاض قيمة الأصول الثابتة) وليس 5995/5810 — #2140-5a
      financialEngine.resolveAccountCode(scope.companyId, "asset_impairment_loss", "debit", "5850"),
      // fallback 1291 (مجمع انخفاض قيمة) — مستقل عن مجمع الإهلاك IAS 36 ≠ IAS 16 — #2140-5a
      financialEngine.resolveAccountCode(scope.companyId, "asset_accumulated_impairment", "credit", "1291"),
    ]);

    const newImpairmentAccumulated = roundTo2(Number(asset.accumulatedImpairment ?? 0) + b.impairmentAmount);
    const newBookValue = roundTo2(bookValue - b.impairmentAmount);

    let journalId: number | null = null;
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (asset.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `IMPAIR-${asset.code ?? asset.id}-${b.impairmentDate}`,
        description: `انخفاض قيمة أصل: ${asset.name} — ${b.reason}`,
        type: "asset_impairment",
        sourceType: "fixed_asset_impairment",
        sourceId: id,
        sourceKey: `finance:asset_impairment:${id}:${b.impairmentDate}`,
        lines: [
          { accountCode: lossCode, debit: b.impairmentAmount, credit: 0, assetId: id, description: `خسارة انخفاض قيمة` },
          { accountCode: accImpairmentCode, debit: 0, credit: b.impairmentAmount, assetId: id, description: `مجمع انخفاض قيمة` },
        ],
      });
      journalId = posted.journalId;
      // accumulatedImpairment (IAS 36) مستقل عن accumulatedDepreciation (IAS 16).
      // currentBookValue يتأثر بالاثنين. لا نمس accumulatedDepreciation هنا.
      await client.query(
        `UPDATE fixed_assets
            SET "accumulatedImpairment" = $1,
                "currentBookValue"      = $2,
                "updatedAt"             = NOW()
          WHERE id = $3 AND "companyId" = $4`,
        [newImpairmentAccumulated, newBookValue, id, scope.companyId]
      );
    });

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fixed_assets.impair", entity: "fixed_assets", entityId: id,
      before: {
        bookValue,
        accumulatedDepreciation: Number(asset.accumulatedDepreciation),
        accumulatedImpairment: Number(asset.accumulatedImpairment ?? 0),
      },
      after: {
        bookValue: newBookValue,
        accumulatedImpairment: newImpairmentAccumulated,
        impairmentAmount: b.impairmentAmount,
        impairmentDate: b.impairmentDate,
        reason: b.reason,
        journalEntryId: journalId,
      },
    }).catch((e) => logger.error(e, "fixed_assets impair audit failed"));

    res.json({ message: "تم تسجيل انخفاض قيمة الأصل", journalEntryId: journalId, newBookValue, impairmentAmount: b.impairmentAmount, accumulatedImpairment: newImpairmentAccumulated });
  } catch (err) {
    handleRouteError(err, res, "Impair asset error:");
  }
});

// POST /fixed-assets/:id/revalue — IFRS revaluation model. The entry:
//   delta > 0 (upward):
//     DR Fixed-Asset                ← delta
//          CR Revaluation Surplus   ← delta  (equity 3300)
//   delta < 0 (downward):
//     DR Revaluation Loss           ← abs(delta)  (P&L 5996)
//          CR Fixed-Asset
// purchaseCost is rebased to the revalued amount so depreciation
// continues on the new carrying value.
financeAlgorithmsRouter.post("/fixed-assets/:id/revalue", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(revalueAssetSchema.safeParse(req.body ?? {}));

    const [asset] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [id, scope.companyId]
    );
    if (!asset) throw new NotFoundError("الأصل غير موجود أو غير نشط");

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, b.revaluationDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن إعادة تقييم أصل في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "revaluationDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const bookValue = Number(asset.currentBookValue ?? 0);
    const delta = roundTo2(b.revaluationDelta);
    if (delta < 0 && Math.abs(delta) > bookValue) {
      throw new ValidationError(
        `قيمة إعادة التقييم السلبية (${delta}) تتجاوز القيمة الدفترية (${bookValue})`,
        { field: "revaluationDelta", fix: `الحد الأدنى -${bookValue}` }
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    // R1: resolve via intent when stored code is the legacy default
    const storedAssetCode = asset.assetAccountCode as string | null;
    const [assetCode, surplusCode, lossCode] = await Promise.all([
      (storedAssetCode && storedAssetCode !== "1500")
        ? Promise.resolve(storedAssetCode)
        : financialEngine.resolveAccountCode(scope.companyId, "asset_cost", "debit", "1270"),
      // fallback 3600 (فائض إعادة التقييم) وليس 3300 (الأرباح المحتجزة) — #2140-5a
      financialEngine.resolveAccountCode(scope.companyId, "asset_revaluation_surplus", "credit", "3600"),
      // fallback 5860 (خسارة إعادة تقييم) وليس 5996/5810 — #2140-5a
      financialEngine.resolveAccountCode(scope.companyId, "asset_revaluation_loss", "debit", "5860"),
    ]);

    // R3: IAS 16 — downward revaluation should first offset existing surplus (3600)
    // before charging P&L (5860). Track per-asset surplus in revaluationSurplus column.
    const existingSurplus = roundTo2(Number(asset.revaluationSurplus ?? 0));
    let lines: any[];
    let newSurplus: number;
    if (delta > 0) {
      // Upward: DR asset, CR surplus; accumulate surplus
      lines = [
        { accountCode: assetCode, debit: delta, credit: 0, assetId: id, description: `إعادة تقييم — زيادة` },
        { accountCode: surplusCode, debit: 0, credit: delta, assetId: id, description: `فائض إعادة تقييم` },
      ];
      newSurplus = roundTo2(existingSurplus + delta);
    } else {
      // Downward: first offset existing surplus, remainder to P&L
      const absDelta = Math.abs(delta);
      const surplusOffset = Math.min(absDelta, existingSurplus);
      const lossAmount = roundTo2(absDelta - surplusOffset);
      newSurplus = roundTo2(existingSurplus - surplusOffset);
      lines = [
        { accountCode: assetCode, debit: 0, credit: absDelta, assetId: id, description: `إعادة تقييم — نقص` },
      ];
      if (surplusOffset > 0) {
        lines.push({ accountCode: surplusCode, debit: surplusOffset, credit: 0, assetId: id, description: `مقاصة فائض إعادة تقييم` });
      }
      if (lossAmount > 0) {
        lines.push({ accountCode: lossCode, debit: lossAmount, credit: 0, assetId: id, description: `خسارة إعادة تقييم` });
      }
    }

    const newBookValue = roundTo2(bookValue + delta);
    const newPurchaseCost = roundTo2(Number(asset.purchaseCost) + delta);

    let journalId: number | null = null;
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (asset.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `REVAL-${asset.code ?? asset.id}-${b.revaluationDate}`,
        description: `إعادة تقييم أصل: ${asset.name} (${delta > 0 ? "زيادة" : "نقص"}) — ${b.reason}`,
        type: "asset_revaluation",
        sourceType: "fixed_asset_revaluation",
        sourceId: id,
        sourceKey: `finance:asset_revaluation:${id}:${b.revaluationDate}`,
        lines,
      });
      journalId = posted.journalId;
      await client.query(
        `UPDATE fixed_assets SET "purchaseCost"=$1, "currentBookValue"=$2, "revaluationSurplus"=$3, "updatedAt"=NOW() WHERE id=$4 AND "companyId"=$5`,
        [newPurchaseCost, newBookValue, newSurplus, id, scope.companyId]
      );
    });

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fixed_assets.revalue", entity: "fixed_assets", entityId: id,
      before: { purchaseCost: Number(asset.purchaseCost), bookValue },
      after: { purchaseCost: newPurchaseCost, bookValue: newBookValue, revaluationDelta: delta, revaluationDate: b.revaluationDate, reason: b.reason, journalEntryId: journalId },
    }).catch((e) => logger.error(e, "fixed_assets revalue audit failed"));

    res.json({ message: "تم إعادة تقييم الأصل", journalEntryId: journalId, newBookValue, revaluationDelta: delta });
  } catch (err) {
    handleRouteError(err, res, "Revalue asset error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION-IN-PROGRESS (CIP) — IAS 16 staging for assets under construction
// Accumulate costs against a CIP account; capitalize to a single Fixed Asset
// on project completion. Migration 234 defines the tables.
// ─────────────────────────────────────────────────────────────────────────────

// GET /cip — list active CIP projects.
financeAlgorithmsRouter.get("/cip", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Pre-aggregate cip_costs once instead of running a scalar
    // subquery per row. Original was N+1: 500 construction projects
    // × COUNT subquery = 501 lookups through cip_costs. CTE collapses
    // to one scan + hash aggregate.
    const rows = await rawQuery<Record<string, unknown>>(
      `WITH cost_counts AS (
         SELECT "cipId", COUNT(*) AS "costEntryCount"
         FROM cip_costs
         WHERE "deletedAt" IS NULL
         GROUP BY "cipId"
       )
       SELECT cip.*,
              COALESCE(cc."costEntryCount", 0) AS "costEntryCount"
         FROM construction_in_progress cip
         LEFT JOIN cost_counts cc ON cc."cipId" = cip.id
        WHERE cip."companyId" = $1 AND cip."deletedAt" IS NULL
        ORDER BY cip.id DESC
        LIMIT 500`,
      [scope.companyId]
    ).catch(() => [] as Record<string, unknown>[]);
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List CIP error:");
  }
});

// GET /cip/:id — detail + cost history
financeAlgorithmsRouter.get("/cip/:id", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [cip] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM construction_in_progress WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!cip) throw new NotFoundError("مشروع CIP غير موجود");
    const costs = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM cip_costs WHERE "cipId"=$1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "costDate" ASC, id ASC`,
      [id, scope.companyId]
    );
    res.json({ ...cip, costs });
  } catch (err) {
    handleRouteError(err, res, "Get CIP error:");
  }
});

// POST /cip — create a new CIP project (no GL yet — pure register entry)
financeAlgorithmsRouter.post("/cip", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const b = zodParse(createCipSchema.safeParse(req.body ?? {}));

    let insertId: number | null = null;
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO construction_in_progress
             ("companyId","branchId",code,name,description,category,"startDate","expectedCompletionDate",
              "cipAccountCode","targetAssetCategory","targetAssetAccountCode","targetDepreciationAccountCode",
              "targetAccDepreciationAccountCode","targetUsefulLifeYears","targetDepreciationMethod",
              "totalCost",status,"createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,'in_progress',$16) RETURNING id`,
          [scope.companyId, scope.branchId, b.code ?? null, b.name, b.description ?? null,
           b.category ?? null, b.startDate, b.expectedCompletionDate ?? null,
           b.cipAccountCode ?? "1270", b.targetAssetCategory ?? null,
           b.targetAssetAccountCode ?? "1280", b.targetDepreciationAccountCode ?? "5790",
           b.targetAccDepreciationAccountCode ?? "1290", b.targetUsefulLifeYears ?? null,
           b.targetDepreciationMethod ?? "straight_line", scope.userId]
        );
        insertId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          throw new Error("جدول CIP غير موجود — قم بترحيل migration 234");
        }
        throw e;
      }
    });

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "cip.create", entity: "construction_in_progress", entityId: insertId!,
      after: { name: b.name, startDate: b.startDate, targetAssetCategory: b.targetAssetCategory },
    }).catch((e) => logger.error(e, "cip create audit failed"));

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM construction_in_progress WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [insertId, scope.companyId]
    );
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create CIP error:");
  }
});

// POST /cip/:id/costs — add a cost entry to a CIP project.
//   DR CIP (1530, project-specific assetId)
//        CR Cash / Payable (1100 or specified)
financeAlgorithmsRouter.post("/cip/:id/costs", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(addCipCostSchema.safeParse(req.body ?? {}));

    const [cip] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM construction_in_progress WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!cip) throw new NotFoundError("مشروع CIP غير موجود");
    if (cip.status !== "in_progress") {
      throw new ConflictError(`لا يمكن إضافة تكاليف لمشروع بحالة "${cip.status}"`);
    }

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, b.costDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن تسجيل تكلفة CIP في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "costDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const amt = roundTo2(b.amount);
    const { financialEngine } = await import("../lib/engines/index.js");
    const cipCode = (cip.cipAccountCode as string | null) ?? "1270";
    const cashCode = b.cashAccountCode
      ?? await financialEngine.resolveAccountCode(scope.companyId, "cip_funding_cash", "credit", "1111");

    let costId: number | null = null;
    let journalId: number | null = null;
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (cip.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: internalTechRef(`CIP-COST-${cip.code ?? cip.id}`),
        description: `تكلفة CIP: ${cip.name} — ${b.description}`,
        type: "cip_cost",
        sourceType: "cip_cost",
        sourceId: id,
        sourceKey: `finance:cip_cost:${id}:${b.costDate}:${requestIdempotencyToken(req)}`,
        lines: [
          { accountCode: cipCode, debit: amt, credit: 0, description: b.description },
          { accountCode: cashCode, debit: 0, credit: amt, description: `سداد تكلفة CIP ${cip.name}` },
        ],
      });
      journalId = posted.journalId;

      const costInsRes = await client.query(
        `INSERT INTO cip_costs ("companyId","cipId","costDate",description,amount,"sourceType","sourceId","journalEntryId","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [scope.companyId, id, b.costDate, b.description, amt, b.sourceType ?? null, b.sourceId ?? null, journalId, scope.userId]
      );
      costId = costInsRes.rows[0].id;

      await client.query(
        `UPDATE construction_in_progress SET "totalCost" = "totalCost" + $1, "updatedAt"=NOW()
         WHERE id=$2 AND "companyId"=$3`,
        [amt, id, scope.companyId]
      );
    });

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "finance.cip.cost_added",
      entity: "construction_in_progress",
      entityId: id,
      after: { costId, journalEntryId: journalId, amount: amt, costDate: b.costDate },
    }).catch((e) => logger.error(e, "finance-algorithms cip-cost audit failed"));
    res.status(201).json({ costId, journalEntryId: journalId, amount: amt, cipId: id });
  } catch (err) {
    handleRouteError(err, res, "Add CIP cost error:");
  }
});

// POST /cip/:id/capitalize — transfer accumulated CIP cost to a Fixed Asset.
//   DR Fixed Asset (1500)         ← totalCost
//        CR CIP (1530)             ← totalCost
// Marks the CIP row as capitalized and links it to the new asset row.
financeAlgorithmsRouter.post("/cip/:id/capitalize", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = parseId(req.params.id, "id");
    const b = zodParse(capitalizeCipSchema.safeParse(req.body ?? {}));

    const [cip] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM construction_in_progress WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!cip) throw new NotFoundError("مشروع CIP غير موجود");
    if (cip.status !== "in_progress") {
      throw new ConflictError(`لا يمكن رسملة مشروع بحالة "${cip.status}"`);
    }
    const totalCost = Number(cip.totalCost ?? 0);
    if (totalCost <= 0) {
      throw new ValidationError("لا توجد تكاليف متراكمة للرسملة");
    }

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, b.capitalizationDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن رسملة CIP في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "capitalizationDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const usefulYears = b.usefulLifeYears ?? (cip.targetUsefulLifeYears as number | null) ?? 5;
    const depMethod = b.depreciationMethod ?? (cip.targetDepreciationMethod as string | null) ?? "straight_line";
    const assetName = b.assetName ?? `${cip.name} (مرسمل)`;
    const assetCode = b.assetCode ?? (cip.code as string | null) ?? null;
    // Book the capitalised asset into its per-class accounts (by target
    // category) instead of the generic "other" defaults.
    const cipAcct = resolveAssetAccounts({
      category: (cip.targetAssetCategory as string | null) ?? (cip.category as string | null),
      assetAccountCode: cip.targetAssetAccountCode,
      depreciationAccountCode: cip.targetDepreciationAccountCode,
      accDepreciationAccountCode: cip.targetAccDepreciationAccountCode,
    });
    const targetAssetCode = cipAcct.asset;
    const targetDepCode = cipAcct.dep;
    const targetAccDepCode = cipAcct.accDep;
    const cipCode = (cip.cipAccountCode as string | null) ?? "1270";

    let newAssetId: number | null = null;
    let journalId: number | null = null;
    const { financialEngine } = await import("../lib/engines/index.js");

    await withTransaction(async (client) => {
      // 1. Create the finished fixed-asset row.
      const assetRes = await client.query(
        `INSERT INTO fixed_assets (
           "companyId","branchId",code,name,description,category,
           "purchaseDate","purchaseCost","salvageValue","usefulLifeYears",
           "depreciationMethod","currentBookValue","accumulatedDepreciation",
           "assetAccountCode","depreciationAccountCode","accDepreciationAccountCode",status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,0,$12,$13,$14,'active') RETURNING id`,
        [scope.companyId, (cip.branchId as number | null) ?? scope.branchId,
         assetCode, assetName, cip.description, cip.targetAssetCategory ?? cip.category,
         b.capitalizationDate, totalCost, usefulYears, depMethod, totalCost,
         targetAssetCode, targetDepCode, targetAccDepCode]
      );
      newAssetId = assetRes.rows[0].id;

      // 2. Post the GL transfer DR new asset / CR CIP.
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: (cip.branchId as number | null) ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `CIP-CAP-${cip.code ?? cip.id}-${b.capitalizationDate}`,
        description: `رسملة CIP: ${cip.name} → أصل ثابت #${newAssetId}`,
        type: "cip_capitalization",
        sourceType: "cip_capitalization",
        sourceId: id,
        sourceKey: `finance:cip_capitalize:${id}`,
        lines: [
          { accountCode: targetAssetCode, debit: totalCost, credit: 0, assetId: newAssetId!, description: `رسملة أصل من CIP` },
          { accountCode: cipCode, debit: 0, credit: totalCost, description: `تصفية CIP` },
        ],
      });
      journalId = posted.journalId;

      // 3. Mark CIP as capitalized + link.
      await client.query(
        `UPDATE construction_in_progress
           SET status='capitalized', "capitalizedAt"=$1, "capitalizedAssetId"=$2,
               "capitalizationJournalId"=$3, "updatedAt"=NOW()
         WHERE id=$4 AND "companyId"=$5`,
        [b.capitalizationDate, newAssetId, journalId, id, scope.companyId]
      );
    });

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "cip.capitalize", entity: "construction_in_progress", entityId: id,
      after: { capitalizationDate: b.capitalizationDate, assetId: newAssetId, journalEntryId: journalId, totalCost },
    }).catch((e) => logger.error(e, "cip capitalize audit failed"));

    res.json({
      message: "تمت رسملة CIP إلى أصل ثابت",
      capitalizedAssetId: newAssetId,
      journalEntryId: journalId,
      totalCost,
    });
  } catch (err) {
    handleRouteError(err, res, "Capitalize CIP error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEIGHTED AVERAGE INVENTORY COST — المتوسط المرجح للمخزون
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/inventory-costing", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const products = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p.sku, p.name, p."currentStock", p."costPrice", p."lastWaCost",
              p."costingMethod", p."sellPrice",
              c.name AS "categoryName",
              (p."currentStock" * p."costPrice") AS "stockValue"
       FROM warehouse_products p
       LEFT JOIN warehouse_categories c ON c.id = p."categoryId"
       WHERE p."companyId" = $1 AND p.status = 'active' AND p."deletedAt" IS NULL
       ORDER BY p.name
       LIMIT 500`,
      [scope.companyId]
    );

    const totalValue = products.reduce((s: number, p) => s + Number(p.stockValue ?? 0), 0);
    const totalItems = products.reduce((s: number, p) => s + Number(p.currentStock ?? 0), 0);

    res.json({
      products,
      summary: { totalProducts: products.length, totalValue, totalItems },
    });
  } catch (err) {
    handleRouteError(err, res, "Inventory costing error:");
  }
});

financeAlgorithmsRouter.get("/inventory-costing/:productId", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const productId = parseId(req.params.productId, "productId");

    const [product] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [productId, scope.companyId]
    );
    if (!product) { throw new NotFoundError("المنتج غير موجود"); return; }

    const movements = await rawQuery<Record<string, unknown>>(
      `SELECT m.*, m."createdAt" AS date
       FROM warehouse_movements m
       WHERE m."productId"=$1 AND m."companyId"=$2
       ORDER BY m."createdAt" ASC
       LIMIT 500`,
      [productId, scope.companyId]
    );

    let runningQty = 0;
    let runningValue = 0;
    let waHistory: any[] = [];

    for (const mv of movements) {
      const qty = Number(mv.quantity ?? 0);
      const cost = Number(mv.unitCost ?? 0);
      const isIn = ["in", "return", "transfer_in"].includes(mv.type as string);
      const isOut = ["out", "transfer_out"].includes(mv.type as string);

      if (isIn) {
        const addValue = roundTo2(qty * cost);
        runningQty += qty;
        runningValue = roundTo2(runningValue + addValue);
        const waCost = runningQty > 0 ? runningValue / runningQty : cost;
        waHistory.push({
          date: mv.date, type: mv.type, quantity: qty, unitCost: cost,
          totalCost: addValue, runningQty, runningValue, waCost: roundTo4(waCost),
        });
      } else if (isOut) {
        const waCost = runningQty > 0 ? runningValue / runningQty : 0;
        const cogsValue = roundTo2(qty * waCost);
        runningQty = Math.max(0, runningQty - qty);
        runningValue = roundTo2(runningQty * waCost);
        waHistory.push({
          date: mv.date, type: mv.type, quantity: -qty, unitCost: waCost,
          totalCost: -cogsValue, runningQty, runningValue, waCost: roundTo4(waCost),
        });
      }
    }

    const currentWa = runningQty > 0 ? roundTo4(runningValue / runningQty) : 0;

    res.json({
      product,
      currentWaCost: currentWa,
      currentStockValue: roundTo2(currentWa * Number(product.currentStock)),
      movements: waHistory,
    });
  } catch (err) {
    handleRouteError(err, res, "Product inventory costing error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUNDING DIFFERENCES — فروقات التقريب
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/rounding-account", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [account] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM chart_of_accounts WHERE "companyId"=$1 AND (code='9999' OR name LIKE '%تقريب%') AND "deletedAt" IS NULL ORDER BY code LIMIT 1`,
      [scope.companyId]
    );
    res.json({ account: account ?? null });
  } catch (err) {
    handleRouteError(err, res, "Rounding account error:");
  }
});

financeAlgorithmsRouter.post("/rounding-account/setup", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999' AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    if (existing) {
      res.json({ account: existing, message: "حساب فروقات التقريب موجود مسبقاً" });
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId",code,name,"nameEn",type,level,"parentCode","isActive")
       VALUES ($1,'9999','فروقات التقريب','Rounding Differences','expense',2,null,true)`,
      [scope.companyId]
    );
    assertInsert(insertId, "chart_of_accounts");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM chart_of_accounts WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    await emitEvent({
      action: "finance.rounding_account.configured",
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "chart_of_accounts",
      entityId: (row?.id as number) ?? 0,
      details: `created rounding account 9999`,
      after: { accountCode: "9999" },
    });
    // #670 — rounding-account setup audit. One-shot configuration
    // change that creates the GL account used for rounding diffs;
    // recording who configured it is essential for compliance.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "rounding_account.setup",
      entity: "chart_of_accounts",
      entityId: (row?.id as number) ?? 0,
      after: { accountCode: "9999", accountName: "فروقات التقريب" },
    }).catch((e) => logger.error(e, "finance-algorithms rounding-account setup audit failed"));
    res.status(201).json({ account: row, message: "تم إنشاء حساب فروقات التقريب (9999)" });
  } catch (err) {
    handleRouteError(err, res, "Setup rounding account error:");
  }
});

// Audit F5 — DOC. Defensive endpoint with no frontend caller (UI uses
// `/rounding-differences/auto-clear`). Kept because
// `financeVendorsReportsSmoke.test.ts` asserts its existence as part
// of the algorithms-router smoke contract.
financeAlgorithmsRouter.post("/rounding-differences/apply", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const { journalEntryId, roundingAmount, description } = zodParse(roundingDiffSchema.safeParse(req.body ?? {}));
    const diff = roundTo2(roundingAmount);

    // All journal_lines mutations route through the financial engine — see
    // financialEngine.appendRoundingAdjustment for the validation rules
    // (non-zero, |diff| ≤ 0.05, rounding account 9999 must exist, JE must
    // belong to the scoped company).
    const { financialEngine } = await import("../lib/engines/index.js");
    try {
      const { applied } = await financialEngine.appendRoundingAdjustment({
        companyId: scope.companyId,
        journalEntryId,
        amount: diff,
        description,
      });

      await updateAccountBalances(scope.companyId, [
        { accountCode: "9999", debit: applied > 0 ? applied : 0, credit: applied < 0 ? Math.abs(applied) : 0 },
      ]);

      // #670 — rounding-difference apply audit. Adjusts an existing
      // journal entry with a sub-cent rounding diff; the `entityId`
      // points at the journal entry that was modified, and `after`
      // records exactly what amount was applied so a reviewer can
      // attribute the 9999-account hit to a specific user + JE.
      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "rounding_difference.apply",
        entity: "journal_entries",
        entityId: journalEntryId,
        after: { journalEntryId, requested: diff, applied, description: description ?? null },
      }).catch((e) => logger.error(e, "finance-algorithms rounding-diff apply audit failed"));
      res.json({ message: `تم تسجيل فرق التقريب (${applied.toFixed(2)} ﷼) في حساب 9999` });
    } catch (engineErr) {
      const msg = engineErr instanceof Error ? engineErr.message : String(engineErr);
      if (msg.includes("القيد اليومي غير موجود")) throw new NotFoundError(msg);
      throw new ValidationError(msg);
    }
  } catch (err) {
    handleRouteError(err, res, "Apply rounding difference error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FX RATES & REVALUATION — إعادة تقييم العملات الأجنبية
// ─────────────────────────────────────────────────────────────────────────────
//
// Functional currency = SAR. Foreign-currency-denominated monetary balances
// (invoices, POs, bank accounts) must be restated at period-end using the
// closing rate. The difference vs. the booked value is posted as unrealized
// FX gain/loss.
//
// Tables are created lazily so no extra migration is needed:
//   fx_rates(id, companyId, effectiveDate, fromCurrency, toCurrency, rate, source)
// NOTE: fx_revaluations is NOT created here — it is owned by the canonical
// schema (db/schema_pre.sql: companyId, period, journalEntryId, totalGain,
// totalLoss, details, postedBy, postedAt; UNIQUE(companyId, period)). The
// stale lazy CREATE that used a divergent shape (currency/oldRate/newRate/
// revaluationDate/totalImpact) was removed — it was shadowed by the dump and
// was the root cause of the `revaluationDate` mismatch fixed in #2897.

async function ensureFxTables(client?: any) {
  const exec = client ? (sql: string, params?: any[]) => client.query(sql, params) : rawExecute;
  await exec(`
    CREATE TABLE IF NOT EXISTS fx_rates (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "effectiveDate" DATE NOT NULL,
      "fromCurrency" VARCHAR(8) NOT NULL,
      "toCurrency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
      rate NUMERIC(18,8) NOT NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'manual',
      "createdAt" TIMESTAMP DEFAULT NOW(),
      UNIQUE ("companyId","effectiveDate","fromCurrency","toCurrency",source)
    )
  `);
  // fx_revaluations is owned by the canonical schema (migrations/dump) —
  // not created here. See note above ensureFxTables.
  // Ensure foreign-currency columns exist on invoices & purchase_orders
  await exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'SAR'`);
  await exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(18,8) DEFAULT 1`);
  await exec(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'SAR'`);
  await exec(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(18,8) DEFAULT 1`);
}

// List FX rates
financeAlgorithmsRouter.get("/fx/rates", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureFxTables();
    const { from, to, type } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId"=$1`;
    if (from) { params.push(from); where += ` AND "fromCurrency"=$${params.length}`; }
    if (to) { params.push(to); where += ` AND "toCurrency"=$${params.length}`; }
    if (type) { params.push(type); where += ` AND source=$${params.length}`; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fx_rates WHERE ${where} ORDER BY "effectiveDate" DESC, "fromCurrency" ASC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "FX rates list error:");
  }
});

// Upsert FX rate
financeAlgorithmsRouter.post("/fx/rates", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { rateDate, fromCurrency, toCurrency, rate, type } = zodParse(fxRateUpsertSchema.safeParse(req.body ?? {}));
    await ensureFxTables();
    // `rateDate` is the legacy NOT NULL column; the FX subsystem keys on
    // `effectiveDate`, so mirror the request date into both. The upsert key
    // is the existing uq_fx_rates_company_pair_date unique index — the same
    // conflict target the FX fetch cron (lib/fx/jobs.ts) uses.
    const [row] = await rawQuery<Record<string, unknown>>(
      `INSERT INTO fx_rates ("companyId","rateDate","effectiveDate","fromCurrency","toCurrency",rate,source)
       VALUES ($1,$2,$2,$3,$4,$5,$6)
       ON CONFLICT ("companyId","fromCurrency","toCurrency","effectiveDate")
       DO UPDATE SET rate=EXCLUDED.rate, source=EXCLUDED.source
       RETURNING *`,
      [scope.companyId, rateDate, fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rate, type]
    );
    // #670 — fx_rates upsert audit. FX rates feed every downstream
    // revaluation calculation; recording who set which rate, when,
    // and from which source is essential for forensic review of
    // multi-currency P&L impact.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fx_rate.upsert",
      entity: "fx_rates",
      entityId: (row?.id as number) ?? 0,
      after: {
        effectiveDate: rateDate,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate,
        source: type,
      },
    }).catch((e) => logger.error(e, "finance-algorithms fx-rate upsert audit failed"));
    res.status(201).json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "FX rate upsert error:");
  }
});

// Preview FX revaluation for a period (no posting)
financeAlgorithmsRouter.get("/fx/revaluation/preview", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const period = (req.query.period as string) ?? currentPeriod();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("period يجب أن يكون بصيغة YYYY-MM", { field: "period", fix: "استخدم صيغة YYYY-MM مثل 2026-04" });
    }
    await ensureFxTables();

    // Period-end date = last day of month
    const [y, m] = period.split("-").map(Number);
    const periodEnd = toDateISO(new Date(y, m, 0));

    // Open foreign-currency invoices
    const openInvoices = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, currency, "exchangeRate", total, "paidAmount", "clientId"
       FROM invoices
       WHERE "companyId"=$1
         AND currency IS NOT NULL AND currency <> 'SAR'
         AND status <> 'paid' AND status <> 'cancelled'
         AND "deletedAt" IS NULL
         AND "createdAt"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );

    // Open foreign-currency POs (AP proxy)
    const openPOs = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, currency, "exchangeRate", "totalAmount", status, "supplierId"
       FROM purchase_orders
       WHERE "companyId"=$1
         AND "deletedAt" IS NULL
         AND currency IS NOT NULL AND currency <> 'SAR'
         AND status NOT IN ('paid','cancelled','draft')
         AND "createdAt"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );

    // Find closing rate per currency (latest effectiveDate <= periodEnd with source='period_end' or 'manual')
    const currencies = Array.from(
      new Set<string>([...openInvoices.map((i) => i.currency as string), ...openPOs.map((p) => p.currency as string)])
    );
    const rateMap: Record<string, number> = {};
    if (currencies.length > 0) {
      const rateRows = await rawQuery<Record<string, unknown>>(
        `SELECT DISTINCT ON ("fromCurrency") "fromCurrency", rate FROM fx_rates
         WHERE "companyId"=$1 AND "fromCurrency" = ANY($2::text[]) AND "toCurrency"='SAR'
           AND "effectiveDate"::date <= $3::date
         ORDER BY "fromCurrency", (source='period_end') DESC, "effectiveDate" DESC`,
        [scope.companyId, currencies, periodEnd]
      );
      for (const r of rateRows) rateMap[r.fromCurrency as string] = Number(r.rate);
      for (const cur of currencies) if (!(cur in rateMap)) rateMap[cur] = 0;
    }

    let totalGain = 0;
    let totalLoss = 0;
    const details: any[] = [];

    for (const inv of openInvoices) {
      const booked = Number(inv.exchangeRate) || 1;
      const closing = rateMap[inv.currency as string] || 0;
      if (!closing) continue;
      const outstandingFc = Number(inv.total) - Number(inv.paidAmount ?? 0); // foreign currency
      const bookedSar = roundTo2(outstandingFc * booked);
      const revaluedSar = roundTo2(outstandingFc * closing);
      const diff = roundTo2(revaluedSar - bookedSar); // AR asset → gain if positive
      if (Math.abs(diff) < 0.01) continue;
      if (diff > 0) totalGain += diff; else totalLoss += -diff;
      details.push({
        kind: "AR",
        refType: "invoice",
        refId: inv.id,
        refNumber: inv.ref,
        currency: inv.currency,
        outstandingFc,
        bookedRate: booked,
        closingRate: closing,
        bookedSar,
        revaluedSar,
        diff,
      });
    }

    for (const po of openPOs) {
      const booked = Number(po.exchangeRate) || 1;
      const closing = rateMap[po.currency as string] || 0;
      if (!closing) continue;
      const outstandingFc = Number(po.totalAmount);
      const bookedSar = roundTo2(outstandingFc * booked);
      const revaluedSar = roundTo2(outstandingFc * closing);
      // AP liability → loss if closing > booked (liability grew)
      const diff = roundTo2(revaluedSar - bookedSar);
      if (Math.abs(diff) < 0.01) continue;
      if (diff > 0) totalLoss += diff; else totalGain += -diff;
      details.push({
        kind: "AP",
        refType: "purchase_order",
        refId: po.id,
        refNumber: po.ref,
        currency: po.currency,
        outstandingFc,
        bookedRate: booked,
        closingRate: closing,
        bookedSar,
        revaluedSar,
        diff,
      });
    }

    res.json({
      period,
      periodEnd,
      rates: rateMap,
      totalGain: roundTo2(totalGain),
      totalLoss: roundTo2(totalLoss),
      netImpact: roundTo2(totalGain - totalLoss),
      lineCount: details.length,
      details,
    });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation preview error:");
  }
});

// Compute FX revaluation into the deferred posting queue (لا ترحيل GL هنا).
// مُشغِّل الحساب لمسار الطابور: يستدعي runPeriodEndRevaluation فيملأ
// fx_revaluation_log + fx_revaluation_lines، فيظهر البند في طابور ترحيل GL
// (POST /finance/gl-helpers/fx-revaluation/:revaluationLogId). نفس RBAC المسار
// المباشر (finance.algorithms/create). حارس الازدواج: يرفض إن كانت الفترة
// مُرحَّلة مباشرةً (صف fx_revaluations)، أو مُحسَبة في الطابور سلفًا (idempotency).
financeAlgorithmsRouter.post("/fx/revaluation/compute", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { period } = zodParse(fxRevaluationPostSchema.safeParse(req.body ?? {}));
    await ensureFxTables();

    const [y, m] = period.split("-").map(Number);
    const periodEnd = toDateISO(new Date(y, m, 0)); // آخر يوم في الشهر = asOfDate

    // الفترة المالية يجب أن تكون مُعرَّفة ومفتوحة (runPeriodEndRevaluation يطلب periodId FK).
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, periodEnd);
    if (!periodCheck.open) {
      throw new ValidationError(`لا يمكن الحساب — الفترة ${periodCheck.periodName ?? period} مقفلة`);
    }
    const [finPeriod] = await rawQuery<{ id: number }>(
      `SELECT id FROM financial_periods
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND "startDate" <= $2::date AND "endDate" >= $2::date
        ORDER BY id ASC LIMIT 1`,
      [scope.companyId, periodEnd]
    );
    if (!finPeriod) {
      throw new ValidationError(
        `لا توجد فترة مالية مُعرَّفة تشمل ${periodEnd} — عرّف الفترة المالية أولاً`,
        { field: "period", fix: "أنشئ الفترة المالية المطابقة في إعدادات المالية ثم أعد المحاولة" },
      );
    }

    // حارس الازدواج (1) — رُحّلت مباشرةً؟ صف fx_revaluations للفترة = ممنوع الحساب.
    const [postedDirect] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2 LIMIT 1`,
      [scope.companyId, period]
    );
    if (postedDirect) {
      throw new ConflictError(
        `تم تسجيل إعادة تقييم العملات لفترة ${period} مسبقاً عبر الترحيل المباشر — لا حاجة لحسابها في الطابور`,
      );
    }
    // حارس الازدواج (2) — idempotency: محسوبة في الطابور سلفًا (سجل غير مُرحَّل)؟
    const [pendingQueue] = await rawQuery<{ id: number }>(
      `SELECT id FROM fx_revaluation_log
        WHERE "companyId"=$1 AND to_char("asOfDate",'YYYY-MM')=$2 AND "journalEntryId" IS NULL
        LIMIT 1`,
      [scope.companyId, period]
    );
    if (pendingQueue) {
      throw new ConflictError(
        `إعادة تقييم فترة ${period} محسوبة بالفعل في طابور الترحيل — رحّلها من الطابور`,
      );
    }

    const { runPeriodEndRevaluation } = await import("../lib/fx/revaluation.js");
    const result = await runPeriodEndRevaluation({
      companyId: scope.companyId,
      periodId: finPeriod.id,
      asOfDate: periodEnd,
      ranBy: scope.activeAssignmentId,
    });

    // أثر تدقيق — حساب أُدرج في طابور الترحيل (لا قيد بعد).
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fx_revaluation.compute",
      entity: "fx_revaluation_log",
      entityId: result.revaluationLogId,
      after: {
        period,
        periodEnd,
        periodId: finPeriod.id,
        totalGain: result.totalGain,
        totalLoss: result.totalLoss,
        scanned: result.scanned,
        reported: result.reported,
        skippedCount: result.skipped.length,
      },
    }).catch((e) => logger.error(e, "finance-algorithms fx-revaluation compute audit failed"));

    res.status(201).json({
      revaluationLogId: result.revaluationLogId,
      period,
      periodEnd,
      totalGain: result.totalGain,
      totalLoss: result.totalLoss,
      scanned: result.scanned,
      reported: result.reported,
      skipped: result.skipped,
      message: `تم حساب إعادة تقييم العملات لفترة ${period} وإدراجها في طابور الترحيل`,
    });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation compute error:");
  }
});

// Post FX revaluation journal entry for the period
financeAlgorithmsRouter.post("/fx/revaluation/post", authorize({ feature: "finance.algorithms", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { period } = zodParse(fxRevaluationPostSchema.safeParse(req.body ?? {}));
    await ensureFxTables();
    const [yPeriod, mPeriod] = period.split("-").map(Number);
    const periodEndDate = toDateISO(new Date(yPeriod, mPeriod, 0));
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, periodEndDate);
    if (!periodCheck.open) {
      throw new ValidationError(`لا يمكن الترحيل — الفترة ${periodCheck.periodName ?? period} مقفلة`);
    }

    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2`,
      [scope.companyId, period]
    );
    if (existing) {
      throw new ConflictError(`تم تسجيل إعادة تقييم العملات لفترة ${period} مسبقاً`);
    }

    // حارس الازدواج (الجهة الأخرى) — فحص مبكر ودود: إن وُجد صف
    // fx_revaluation_log غير مُرحَّل لنفس الفترة فالطابور قد حسبها (وربما هو في
    // طريقه للترحيل) → ارفض الترحيل المباشر كي لا يتسابق المساران. الحاجز الصلب
    // يبقى قيد UNIQUE(companyId, period) على fx_revaluations (يكتبه كلا المسارين)؛
    // هذا الفحص رسالة ودودة قبل بلوغه. مطابقة الفترة عبر to_char(asOfDate,'YYYY-MM').
    const [pendingQueue] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fx_revaluation_log
        WHERE "companyId"=$1 AND to_char("asOfDate", 'YYYY-MM')=$2
          AND "journalEntryId" IS NULL
        LIMIT 1`,
      [scope.companyId, period]
    );
    if (pendingQueue) {
      throw new ConflictError(
        `توجد إعادة تقييم محسوبة في طابور الترحيل لفترة ${period} — رحّلها من الطابور أو احذفها قبل الترحيل المباشر`,
      );
    }

    // Reuse preview logic by calling it inline via the same query shape
    const [y, m] = period.split("-").map(Number);
    const periodEnd = toDateISO(new Date(y, m, 0));

    const openInvoices = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, currency, "exchangeRate", total, "paidAmount", "clientId"
       FROM invoices
       WHERE "companyId"=$1 AND currency IS NOT NULL AND currency<>'SAR'
         AND status NOT IN ('paid','cancelled') AND "deletedAt" IS NULL
         AND "createdAt"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );
    const openPOs = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, currency, "exchangeRate", "totalAmount", "supplierId"
       FROM purchase_orders
       WHERE "companyId"=$1 AND "deletedAt" IS NULL AND currency IS NOT NULL AND currency<>'SAR'
         AND status NOT IN ('paid','cancelled','draft')
         AND "createdAt"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );

    const currencies = Array.from(new Set<string>([
      ...openInvoices.map((i) => i.currency as string),
      ...openPOs.map((p) => p.currency as string),
    ]));
    const rateMap: Record<string, number> = {};
    if (currencies.length > 0) {
      const rateRows = await rawQuery<Record<string, unknown>>(
        `SELECT DISTINCT ON ("fromCurrency") "fromCurrency", rate FROM fx_rates
         WHERE "companyId"=$1 AND "fromCurrency" = ANY($2::text[]) AND "toCurrency"='SAR'
           AND "effectiveDate"::date <= $3::date
         ORDER BY "fromCurrency", (source='period_end') DESC, "effectiveDate" DESC`,
        [scope.companyId, currencies, periodEnd]
      );
      for (const r of rateRows) rateMap[r.fromCurrency as string] = Number(r.rate);
      for (const cur of currencies) if (!(cur in rateMap)) rateMap[cur] = 0;
    }

    // Account codes (configurable via accounting_mappings). 1131/2111 إلزاميان
    // للبُعد (عقد البُعد في lib/gl/ledgerTruth.ts): سطر AR على 1131 يجب أن يحمل
    // clientId وسطر AP على 2111 يجب أن يحمل vendorId وإلا يرفض الترحيل.
    const { financialEngine } = await import("../lib/engines/index.js");
    const arCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_ar", "debit", "1131");
    const apCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_ap", "credit", "2111");
    const gainCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_gain", "credit", "4910");
    const lossCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_loss", "debit", "5910");

    // بناء سطور القيد مفصّلة لكل كيان (الخيار أ): سطر AR لكل عميل يحمل clientId،
    // سطر AP لكل مورد يحمل vendorId، + سطرَي مكسب/خسارة إجماليين بلا بُعد.
    // التفصيل لا يغيّر الإجمالي ولا التوازن — يوزّع طرف AR/AP على الكيانات فقط.
    // فاتورة بلا clientId / أمر شراء بلا supplierId → تُتخطّى وتُسجَّل في skipped.
    const { buildPeriodRevalLines } = await import("../lib/fx/build-period-reval-lines.js");
    const built = buildPeriodRevalLines({
      invoices: openInvoices as any,
      purchaseOrders: openPOs as any,
      rateMap,
      accounts: { arCode, apCode, gainCode, lossCode },
      period,
    });
    const { lines, arDiff, apDiff, totalGain, totalLoss, details, skipped } = built;

    if (lines.length === 0) {
      // لا سطور قابلة للترحيل: إمّا لا فروق، أو كل البنود متخطّاة لغياب البُعد.
      if (skipped.length > 0) {
        throw new ValidationError(
          "تعذّر تسجيل إعادة التقييم — كل البنود ذات الفروق بلا بُعد مطلوب (عميل/مورد). اربط الكيانات أولاً.",
          { field: "dimension", meta: { skipped } as any },
        );
      }
      throw new ValidationError("لا توجد فروق إعادة تقييم لهذه الفترة");
    }
    if (skipped.length > 0) {
      logger.warn(
        { companyId: scope.companyId, period, skipped },
        "[fx-revaluation] بنود متخطّاة لغياب بُعد العميل/المورد — لم تُدرَج في القيد",
      );
    }

    // Atomicity: FX revaluation JE + per-currency fx_revaluations
    // audit rows commit or roll back together. Earlier shape posted
    // the JE first (engine commits), then looped INSERTs into
    // fx_revaluations. A mid-loop failure (constraint, FK) left the
    // GL with the FX revaluation entry but only PARTIAL audit rows;
    // the operator's view of "what was revalued for currency X" then
    // didn't tie out to the GL movement.
    let journalEntryId!: number;
    const revalIds: number[] = [];
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId ?? 0,
        createdBy: scope.activeAssignmentId,
        ref: `FX-REVAL-${period}`,
        description: `إعادة تقييم العملات الأجنبية — ${period}`,
        type: "fx_revaluation",
        sourceType: "fx_revaluation",
        sourceId: 0,
        sourceKey: `finance:fx_reval:${scope.companyId}:${period}`,
        lines,
      });
      journalEntryId = posted.journalId;

      // صف fx_revaluations واحد لكل فترة — يحترم قيد UNIQUE(companyId, period)
      // ويطابق مسار الطابور (صف واحد) والقيد الواحد. التفصيل لكل عملة محفوظ في
      // details.perCurrency. (الشكل السابق أدرج صفًا لكل عملة بنفس period → كان
      // يفشل بـ23505 عند وجود عملتين أجنبيتين أو أكثر في الفترة الواحدة.)
      const perCurrency = currencies.map((cur) => ({
        currency: cur,
        impact: roundTo2(details.filter((d: any) => d.currency === cur).reduce((s: number, d: any) => s + d.diff, 0)),
      }));
      const { rows: revRows } = await client.query(
        `INSERT INTO fx_revaluations ("companyId","period","journalEntryId","totalGain","totalLoss",details,"postedBy","postedAt")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW()) RETURNING id`,
        [scope.companyId, period, journalEntryId,
         roundTo2(totalGain), roundTo2(totalLoss),
         JSON.stringify({ periodEnd, perCurrency }), scope.activeAssignmentId]
      );
      if (revRows[0]?.id) revalIds.push(revRows[0].id as number);
    });
    const revalId = revalIds[0];

    // #670 — FX revaluation post audit. Critical P&L-impacting
    // operation: posts the period-end revaluation journal that
    // restates foreign-currency monetary balances to closing rate.
    // The audit row carries the journalEntryId (the GL entry just
    // posted by financialEngine.postJournalEntry above) AND the
    // full per-currency `revalIds` list so the trail can reconstruct
    // the linkage: audit → fx_revaluations → journal_entries.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fx_revaluation.post",
      entity: "fx_revaluations",
      entityId: revalId ?? 0,
      after: {
        period,
        periodEnd,
        arDiff,
        apDiff,
        totalGain: roundTo2(totalGain),
        totalLoss: roundTo2(totalLoss),
        journalEntryId,
        revaluationIds: revalIds,
        currencies,
        lineCount: details.length,
        // بنود متخطّاة لغياب البُعد (عميل/مورد) — أثر قابل للتتبع، لا إسقاط صامت.
        skippedCount: skipped.length,
        skipped,
      },
    }).catch((e) => logger.error(e, "finance-algorithms fx-revaluation post audit failed"));
    res.status(201).json({
      revaluationId: revalId,
      journalEntryId,
      period,
      arDiff,
      apDiff,
      lineCount: details.length,
      skippedCount: skipped.length,
      skipped,
      message: `تم تسجيل إعادة تقييم العملات لفترة ${period}`,
    });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation post error:");
  }
});

// List past revaluations
financeAlgorithmsRouter.get("/fx/revaluation", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureFxTables();
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fx_revaluations WHERE "companyId"=$1 ORDER BY "postedAt" DESC NULLS LAST, id DESC LIMIT 120`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation list error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TREASURY — الخزينة وإدارة السيولة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/treasury", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const cashAccounts = await rawQuery<Record<string, unknown>>(
      `SELECT ca.id, ca.code, ca.name, ca.nature, ca."currentBalance",
              ca."allowPosting", ca."parentCode", ca.level
       FROM chart_of_accounts ca
       WHERE ca."companyId" = $1
         AND ca."deletedAt" IS NULL
         AND ca."allowPosting" = true
         AND (ca.code LIKE '11%' OR ca.code LIKE '12%')
       ORDER BY ca.code
       LIMIT 500`,
      [scope.companyId]
    );

    const totalCash = cashAccounts.reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);
    const cashOnHand = cashAccounts.filter((a: any) => a.code?.startsWith("110")).reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);
    const bankBalances = cashAccounts.filter((a: any) => a.code?.startsWith("11") && !a.code?.startsWith("110")).reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);
    const receivables = cashAccounts.filter((a: any) => a.code?.startsWith("12")).reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);

    const today = todayISO();
    const thirtyDaysAgo = toDateISO(new Date(Date.now() - 30 * 86400000));

    const recentMovements = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je.type, je."createdAt",
              json_agg(json_build_object(
                'accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit
              )) AS lines,
              SUM(CASE WHEN jl.debit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.debit ELSE 0 END) AS "cashIn",
              SUM(CASE WHEN jl.credit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.credit ELSE 0 END) AS "cashOut"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $1
         AND je."deletedAt" IS NULL
         AND je."balancesApplied" = true
         AND je."createdAt" >= $2
         AND EXISTS (
           SELECT 1 FROM journal_lines jl2
           WHERE jl2."journalId" = je.id AND jl2."deletedAt" IS NULL AND (jl2."accountCode" LIKE '11%' OR jl2."accountCode" LIKE '12%')
         )
       GROUP BY je.id
       ORDER BY je."createdAt" DESC
       LIMIT 50`,
      [scope.companyId, thirtyDaysAgo]
    );

    const dailySummary = await rawQuery<Record<string, unknown>>(
      `SELECT DATE(je."createdAt") AS day,
              SUM(CASE WHEN jl.debit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.debit ELSE 0 END) AS "totalIn",
              SUM(CASE WHEN jl.credit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.credit ELSE 0 END) AS "totalOut"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
         AND je."balancesApplied" = true
         AND je."createdAt" >= $2
         AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%')
       GROUP BY DATE(je."createdAt")
       ORDER BY day DESC
       LIMIT 500`,
      [scope.companyId, thirtyDaysAgo]
    );

    const custodySummary = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) FILTER (WHERE remaining > 0) AS "activeCustodies",
              COALESCE(SUM(remaining) FILTER (WHERE remaining > 0), 0) AS "totalOutstanding"
       FROM (
         SELECT je.id,
                SUM(CASE WHEN jl.debit > 0 THEN jl.debit ELSE 0 END)
                - COALESCE((SELECT SUM(jl2.credit) FROM journal_lines jl2 JOIN journal_entries je2 ON je2.id = jl2."journalId" AND jl2."deletedAt" IS NULL
                   WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2."balancesApplied" = true AND je2.ref LIKE 'CUSTODY-SETTLE%'
                   AND je2.description LIKE '%' || je.ref || '%'), 0) AS remaining
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
           AND je."balancesApplied" = true
           AND je.ref LIKE 'CUSTODY-%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
         GROUP BY je.id, je.ref
       ) sub`,
      [scope.companyId]
    );

    res.json({
      accounts: cashAccounts,
      summary: {
        totalCash,
        cashOnHand,
        bankBalances,
        receivables,
        activeCustodies: Number(custodySummary[0]?.activeCustodies ?? 0),
        outstandingCustodies: Number(custodySummary[0]?.totalOutstanding ?? 0),
      },
      recentMovements,
      dailySummary,
    });
  } catch (err) {
    handleRouteError(err, res, "Treasury overview error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY FINANCIAL PROFILE — الملف المالي الشامل لأي كيان
// Returns all GL transactions, subsidiary accounts, and cost breakdown
// for a given entity (vehicle, employee, property, project, product, vendor)
// ─────────────────────────────────────────────────────────────────────────────
financeAlgorithmsRouter.get("/entity-financial-profile", authorize({ feature: "finance.algorithms", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.query as { entityType: string; entityId: string };
    if (!entityType || !entityId) throw new ValidationError("entityType و entityId مطلوبان");
    const eid = Number(entityId);
    const cid = scope.companyId;

    const safeColumns: Record<string, string> = {
      vehicle: 'jl."vehicleId"',
      employee: 'jl."employeeId"',
      property: 'jl."propertyId"',
      project: 'jl."projectId"',
      contract: 'jl."contractId"',
      department: 'jl."departmentId"',
      client: 'jl."clientId"',
      // "customer" is the label used by the voucher / expense forms;
      // it maps to the same clientId column as "client".
      customer: 'jl."clientId"',
      // journal_lines uses `vendorId` for the supplier dimension —
      // "supplier" stays as the entityType alias for backwards compat
      // with frontend pages that label it as "supplier", but the SQL
      // column is `vendorId`. Pre-fix the mapping pointed at a
      // non-existent `supplierId` column, so this endpoint threw a
      // "column not found" SQL error for entityType=supplier silently.
      supplier: 'jl."vendorId"',
      vendor: 'jl."vendorId"',
      asset: 'jl."assetId"',
      unit: 'jl."unitId"',
      umrahAgent: 'jl."umrahAgentId"',
      umrahSeason: 'jl."umrahSeasonId"',
      driver: 'jl."driverId"',
      product: 'jl."productId"',
      costCenter: 'jl."costCenterId"',
    };
    const safeCol = safeColumns[entityType];

    if (!safeCol) throw new ValidationError("نوع الكيان غير مدعوم", { field: "entityType" });

    const [subsidiaryAccounts, transactions, costBreakdown, totalSummary] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType",
                COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) FROM journal_lines jl
                  JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL AND je."companyId" = $1
                  WHERE jl."accountCode" = ca.code AND je."balancesApplied" = true AND je."deletedAt" IS NULL), 0) AS balance
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts ca ON ca.id = sa."accountId"
         WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."entityType" = $2 AND sa."entityId" = $3`,
        [cid, entityType, eid]
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT je.id, je.ref, je.description, je."createdAt", je.type AS "journalType",
                je."sourceType", je."sourceId",
                jl."accountCode", ca.name AS "accountName",
                jl.debit, jl.credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL AND je."companyId" = $1
         LEFT JOIN chart_of_accounts ca ON ca.code = jl."accountCode" AND ca."companyId" = $1
         WHERE ${safeCol} = $2 AND je."deletedAt" IS NULL
         ORDER BY je."createdAt" DESC
         LIMIT 50`,
        [cid, eid]
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT ca.code, ca.name,
                SUM(jl.debit) AS "totalDebit",
                SUM(jl.credit) AS "totalCredit",
                SUM(jl.debit) - SUM(jl.credit) AS "netAmount",
                COUNT(*) AS "transactionCount"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL AND je."companyId" = $1
         LEFT JOIN chart_of_accounts ca ON ca.code = jl."accountCode" AND ca."companyId" = $1
         WHERE ${safeCol} = $2 AND je."balancesApplied" = true AND je."deletedAt" IS NULL
         GROUP BY ca.code, ca.name
         ORDER BY SUM(jl.debit) DESC
         LIMIT 500`,
        [cid, eid]
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT
           COUNT(DISTINCT je.id) AS "journalCount",
           SUM(jl.debit) AS "totalDebit",
           SUM(jl.credit) AS "totalCredit",
           MIN(je."createdAt") AS "firstTransaction",
           MAX(je."createdAt") AS "lastTransaction"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL AND je."companyId" = $1
         WHERE ${safeCol} = $2 AND je."balancesApplied" = true AND je."deletedAt" IS NULL`,
        [cid, eid]
      ),
    ]);

    res.json({
      entityType,
      entityId: eid,
      subsidiaryAccounts,
      summary: totalSummary[0] || { journalCount: 0, totalDebit: 0, totalCredit: 0 },
      costBreakdown,
      recentTransactions: transactions,
    });
  } catch (err) {
    handleRouteError(err, res, "Entity financial profile error:");
  }
});

export default financeAlgorithmsRouter;
