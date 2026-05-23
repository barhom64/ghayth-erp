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
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireOwnership } from "../middlewares/contextualRbac.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
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
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { markIdempotencyReplay } from "../lib/requestIdempotency.js";
import { z } from "zod";

// ── Zod schemas for POST route validation ──────────────────────────────────
const createInvoiceSchema = z.object({
  clientId: z.coerce.number({ required_error: "العميل مطلوب" }),
  lines: z.array(z.object({
    description: z.string().optional(),
    quantity: z.coerce.number().optional(),
    unitPrice: z.coerce.number().optional(),
    accountCode: z.string().optional(),
    total: z.coerce.number().optional(),
  })).min(1, "يجب إضافة بند واحد على الأقل").optional(),
  vatRate: z.coerce.number().optional(),
  dueDate: z.string().optional(),
  date: z.string().optional(),
  description: z.string().max(1000).optional(),
  subtotal: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  notes: z.string().optional(),
  paymentTermsDays: z.coerce.number().optional(),
  branchId: z.coerce.number().optional(),
  companyId: z.coerce.number().optional(),
  isTaxLinked: z.boolean().optional(),
  invoiceTypeCode: z.string().optional(),
  taxCategoryCode: z.string().optional(),
  exemptionReason: z.string().optional(),
  costCenter: z.string().optional(),
});

const createPaymentSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.string().optional(),
});

const createCreditMemoSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  reason: z.string().min(1, "السبب مطلوب"),
  vatIncluded: z.boolean().optional(),
  memoDate: z.string().optional(),
});

const createCustomerAdvanceSchema = z.object({
  clientId: z.coerce.number({ required_error: "العميل مطلوب" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  receivedDate: z.string().optional(),
});

const impactPreviewSchema = z.object({
  clientId: z.coerce.number().optional(),
  lines: z.array(z.any()).optional(),
  taxRate: z.coerce.number().optional(),
  dueInDays: z.coerce.number().optional(),
});

const patchInvoiceSchema = z.object({
  status: z.enum(["draft", "pending_approval", "approved", "sent", "partial", "partially_paid", "paid", "overdue", "void", "rejected", "cancelled", "returned", "delivered", "ordered", "posted", "closed", "invoiced"]).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

const createDebitMemoSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب ويجب أن يكون أكبر من صفر"),
  reason: z.string().min(1, "سبب الإشعار المدين مطلوب"),
  vatIncluded: z.boolean().optional(),
  memoDate: z.string().optional(),
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
  notes: z.string().optional(),
});

const applyAdvanceSchema = z.object({
  invoiceId: z.coerce.number({ required_error: "الفاتورة مطلوبة" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
});

const invoiceApprovalActionSchema = z.object({
  notes: z.string().optional(),
});

const dunningSendSchema = z.object({
  invoiceIds: z.array(z.coerce.number()).min(1, "invoiceIds مطلوبة (قائمة معرفات الفواتير)"),
  sentVia: z.string().optional(),
});

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
        `SELECT name FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(clientId), scope.companyId]
      );
      clientName = (client?.name as string | undefined) || "";
    }

    const subtotal = (Array.isArray(lines) ? lines : []).reduce((sum: number, l: any) => {
      const qty = Number(l?.quantity || 0);
      const price = Number(l?.unitPrice || 0);
      return sum + qty * price;
    }, 0);
    const tax = subtotal * (Number(taxRate) / 100);
    const total = subtotal + tax;

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
      value: `قيد جديد: مدين ذمم العملاء ${total.toLocaleString("ar-SA")} / دائن إيرادات ${subtotal.toLocaleString("ar-SA")} + ضريبة مخرجة ${tax.toLocaleString("ar-SA")}`,
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
              c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
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
      vatRate: rawVatRate, dueDate, date: invoiceBodyDate, paymentTermsDays, branchId, companyId: bodyCompanyId, notes,
      isTaxLinked, invoiceTypeCode, taxCategoryCode, exemptionReason,
      // as-any-reason: justified-pragmatic - destructuring on zodParse inferred type whose property names are not directly indexable at the call site
    } = parsed as any;
    const vatRate = rawVatRate ?? await getCompanyVatRate(bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId);
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!clientId) {
      throw new ValidationError("العميل مطلوب لإنشاء الفاتورة", { field: "clientId", fix: "حدد العميل الذي ستُصدر له الفاتورة" });
    }
    if (!branchId && !scope.branchId) {
      throw new ValidationError("الفرع مطلوب لإنشاء الفاتورة", { field: "branchId", fix: "حدد الفرع الذي تنتمي إليه الفاتورة" });
    }
    if (branchId) {
      const [branchRow] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM branches WHERE id=$1 AND "companyId"=$2 AND status='active'`,
        [branchId, effectiveCompanyId]
      );
      if (!branchRow) {
        throw new ValidationError("الفرع غير موجود أو لا ينتمي لهذه الشركة", { field: "branchId" });
      }
      if (!scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) &&
          scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(Number(branchId))) {
        throw new ForbiddenError("لا تملك صلاحية إنشاء فواتير في هذا الفرع", { field: "branchId" });
      }
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
    let validatedLines: { description: string; quantity: number; unitPrice: number; lineTotal: number; vatAmount: number; lineGross: number }[] = [];

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      for (const line of lineItems) {
        if (!line.unitPrice || line.unitPrice <= 0) {
          throw new ValidationError("سعر الوحدة يجب أن يكون أكبر من صفر", { field: "lines.unitPrice", fix: "أدخل سعراً موجباً لكل بند" });
        }
        if (!line.quantity || line.quantity <= 0) {
          throw new ValidationError("الكمية يجب أن تكون أكبر من صفر", { field: "lines.quantity", fix: "أدخل كمية موجبة لكل بند" });
        }
        const lineTotal = roundTo2(Number(line.quantity) * Number(line.unitPrice));
        const lineVatRate = line.vatRate != null ? Number(line.vatRate) : Number(vatRate);
        const lineVat = line.vatAmount != null
          ? roundTo2(Number(line.vatAmount))
          : roundTo2(lineTotal * (lineVatRate / 100));
        baseAmount += lineTotal;
        validatedLines.push({ description: line.description ?? "", quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), lineTotal, vatAmount: lineVat, lineGross: lineTotal + lineVat });
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
      financialEngine.resolveAccountCode(effectiveCompanyId, "invoice_ar", "debit", "1200"),
      financialEngine.resolveAccountCode(effectiveCompanyId, "invoice_revenue", "credit", "4000"),
      financialEngine.resolveAccountCode(effectiveCompanyId, "invoice_vat_payable", "credit", "2300"),
    ]);

    const [seqRow] = await rawQuery<Record<string, unknown>>(`SELECT nextval('invoice_number_seq') AS seq`);
    const seqNum = Number(seqRow?.seq ?? Date.now() % 1000000);
    const year = currentYear();
    const month = currentMonthPadded();
    const ref = `INV-${year}${month}-${String(seqNum).padStart(4, "0")}`;

    const vatAmount = validatedLines.length > 0
      ? roundTo2(validatedLines.reduce((sum, l) => sum + l.vatAmount, 0))
      : computeVat(baseAmount, Number(vatRate));
    const total = roundTo2(baseAmount + vatAmount);

    let finalDueDate = dueDate ?? null;
    if (!finalDueDate && parsedTerms != null) {
      const due = new Date();
      due.setDate(due.getDate() + parsedTerms);
      finalDueDate = toDateISO(due);
    }

    let insertId!: number;
    await withTransaction(async (client) => {
      const invResult = await client.query(
        `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
                subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,
                "isTaxLinked","invoiceTypeCode","taxCategoryCode","exemptionReason","costCenter")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [effectiveCompanyId, branchId ?? scope.branchId, clientId ?? null, ref, description ?? null,
          baseAmount, Number(vatRate), vatAmount, total, finalDueDate, scope.activeAssignmentId, notes ?? null,
          isTaxLinked ? true : false, invoiceTypeCode ?? "388", taxCategoryCode ?? "S", exemptionReason ?? null,
          // as-any-reason: justified-pragmatic - defensive read of optional costCenter field not yet in createInvoiceSchema; behavior unchanged
          (req.body as any).costCenter ?? null]
      );
      insertId = invResult.rows[0].id;

      if (validatedLines.length > 0) {
        // Single bulk INSERT instead of one round-trip per line.
        const COLS_PER_ROW = 7;
        const valuesSql: string[] = [];
        const params: unknown[] = [];
        for (const l of validatedLines) {
          const base = params.length;
          valuesSql.push(
            `(${Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`).join(",")})`
          );
          params.push(insertId, l.description, l.quantity, l.unitPrice, l.lineTotal, l.vatAmount, l.lineGross);
        }
        await client.query(
          `INSERT INTO invoice_lines ("invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross")
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
    });

    // GL entry deferred to approval (POST /invoices/:id/approve)
    // to prevent unapproved drafts from affecting the ledger.

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.created", entity: "invoices", entityId: insertId, details: JSON.stringify({ ref, total, dueDate: finalDueDate, vatAmount, lineCount: validatedLines.length }) }).catch((e) => logger.error(e, "finance-invoices background task failed"));
    createNotification({ companyId: scope.companyId, assignmentId: scope.activeAssignmentId, type: "invoice_created", title: "تم إنشاء فاتورة جديدة", body: `فاتورة ${ref} بمبلغ ${total.toLocaleString()} ﷼`, priority: "normal", refType: "invoices", refId: insertId }).catch((e) => logger.error(e, "finance-invoices background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "create", entity: "invoices", entityId: insertId, after: { ref, total, vatAmount, clientId: clientId ?? null } }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [invoice] = await rawQuery<Record<string, unknown>>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`, [insertId, scope.companyId]);
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
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
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
      `SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    // GL accounts resolved up-front (reads, no transaction needed).
    const { financialEngine } = await import("../lib/engines/index.js");
    const [invArCode, invRevenueCode, invVatPayableCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1200"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4000"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2300"),
    ]);

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

      // GL entry created ONLY upon approval — BLOCKING (financial integrity guard)
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
          { accountCode: invArCode, debit: Number(invoice.total), credit: 0 },
          { accountCode: invRevenueCode, debit: 0, credit: Number(invoice.total) - Number(invoice.vatAmount || 0) },
          { accountCode: invVatPayableCode, debit: 0, credit: Number(invoice.vatAmount || 0) },
        ],
        guardTable: "invoices",
        guardId: id,
      });
      journalId = result.journalId;
      alreadyExists = result.alreadyExists;

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

    const [updated] = await rawQuery<Record<string, unknown>>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`, [id, scope.companyId]);
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

    const [updated] = await rawQuery<Record<string, unknown>>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`, [id, scope.companyId]);
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

    const { financialEngine } = await import("../lib/engines/index.js");
    const [cashAccountCode, arAccountCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1100" : "1110"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_payment_ar", "credit", "1200"),
    ]);

    let invoiceRef!: string;
    let newPaid!: number;
    let newStatus!: string;
    await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, total, "paidAmount", status, ref FROM invoices
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [id, scope.companyId]
      );
      const invoice = invRes.rows[0];
      if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

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
    const paymentAmount = Number(amount);
    const paidScaled = Math.round(newPaid * 100);
    const { journalId, alreadyExists } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: `PAY-${invoiceRef}-${paidScaled}`,
      description: `سداد فاتورة ${invoiceRef}`,
      type: "payment",
      sourceType: "invoice",
      sourceId: id,
      sourceKey: `finance:payment:${id}:${paidScaled}`,
      lines: [
        { accountCode: cashAccountCode, debit: paymentAmount, credit: 0 },
        { accountCode: arAccountCode, debit: 0, credit: paymentAmount },
      ],
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.paid", entity: "invoices", entityId: id, details: JSON.stringify({ amount, method, newStatus }) }).catch((e) => logger.error(e, "finance-invoices background task failed"));

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
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL LEFT JOIN branches b ON b.id = i."branchId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
    const lines = await rawQuery<Record<string, unknown>>(`SELECT * FROM invoice_lines WHERE "invoiceId" = $1 ORDER BY id LIMIT 500`, [id]);
    const [payments, journalEntries] = await Promise.all([
      rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, je.description, je."createdAt" AS date, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE $2 AND jl."accountCode" = '1100' AND jl.debit > 0 GROUP BY je.id, je.ref, je.description, je."createdAt" ORDER BY je."createdAt" DESC LIMIT 500`, [scope.companyId, `PAY-${invoice.ref}%`]),
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
      `SELECT id, "createdAt" FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, `JE-${inv.ref}`]
    );
    await withTransaction(async (client: any) => {
      if (je) {
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
            scope.companyId, "invoice_revenue", "credit", "4000"
          );
          const approvalPeriod = String(je.createdAt).slice(0, 7);
          await client.query(
            `UPDATE budgets SET used = GREATEST(used - $1, 0)
             WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
            [net, scope.companyId, invRevenueCode, approvalPeriod]
          );
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
                  scope.companyId, "invoice_revenue", "credit", "4000"
                );
                const approvalPeriod = String(je.createdAt).slice(0, 7); // YYYY-MM
                await client.query(
                  `UPDATE budgets SET used = GREATEST(used - $1, 0)
                   WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
                  [net, scope.companyId, invRevenueCode, approvalPeriod]
                );
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

invoicesRouter.patch("/invoices/:id/approve", authorize({ feature: "finance.invoices", action: "update" }), (req, res) => invoiceApprovalAction(req, res, "approved"));
invoicesRouter.patch("/invoices/:id/reject", authorize({ feature: "finance.invoices", action: "update" }), (req, res) => invoiceApprovalAction(req, res, "rejected"));
invoicesRouter.patch("/invoices/:id/return", authorize({ feature: "finance.invoices", action: "update" }), (req, res) => invoiceApprovalAction(req, res, "returned"));

invoicesRouter.get("/tax/summary", authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as Record<string, string | undefined>;
    const targetPeriod = period ?? currentPeriod();
    const { financialEngine } = await import("../lib/engines/index.js");
    const inputVatCode = await financialEngine.resolveAccountCode(scope.companyId, "vat_input", "debit", "1180");
    // Output VAT for the period = invoice VAT MINUS credit-memo VAT. Skipping
    // the credit-memo deduction was overstating the VAT payable to ZATCA.
    // Input VAT is read from the resolved input-VAT account, not a hardcoded
    // '1400' code that does not exist in the seed (seed uses '1180').
    const [outputVatInvoices] = await rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("vatAmount"), 0) AS total FROM invoices WHERE "companyId" = $1 AND to_char("createdAt", 'YYYY-MM') = $2 AND "deletedAt" IS NULL`, [scope.companyId, targetPeriod]);
    const [outputVatMemos] = await rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("vatAmount"), 0) AS total FROM credit_memos WHERE "companyId" = $1 AND to_char("memoDate", 'YYYY-MM') = $2`, [scope.companyId, targetPeriod]);
    const [inputVat] = await rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM(jl.debit), 0) AS total FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL AND je."balancesApplied" = true WHERE je."companyId" = $1 AND jl."accountCode" = $3 AND to_char(je."createdAt", 'YYYY-MM') = $2`, [scope.companyId, targetPeriod, inputVatCode]);
    const outputTotal = Number(outputVatInvoices?.total ?? 0) - Number(outputVatMemos?.total ?? 0);
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

invoicesRouter.post("/invoices/:id/credit-memo", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { amount, reason, vatIncluded = true, memoDate } = zodParse(createCreditMemoSchema.safeParse(req.body));

    const creditAmount = roundTo2(Number(amount));
    const memoDateStr = memoDate
      ? toDateISO(memoDate)
      : todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن إصدار إشعار دائن في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [salesReturnsCode, vatPayableCode, arCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_sales_returns", "debit", "4100"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "debit", "2300"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "credit", "1200"),
    ]);

    let memoId: number | null = null;
    let invoice: any;
    let net!: number;
    let vat!: number;
    await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, ref, "clientId", "companyId", "branchId", total, "vatAmount",
                "paidAmount", "vatRate"
           FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [id, scope.companyId]
      );
      invoice = invRes.rows[0];
      if (!invoice) {
        throw new NotFoundError("الفاتورة غير موجودة");
      }
      const openBalance = roundTo2(Number(invoice.total) - Number(invoice.paidAmount));
      if (creditAmount > openBalance + 0.01) {
        throw new ValidationError(`المبلغ (${creditAmount}) يتجاوز الرصيد المفتوح (${openBalance})`);
      }

      const vatRate = Number(invoice.vatRate ?? await getCompanyVatRate(scope.companyId));
      net = vatIncluded
        ? extractBaseFromGross(creditAmount, vatRate)
        : creditAmount;
      vat = roundTo2(creditAmount - net);

      try {
        const ins = await client.query(
          `INSERT INTO credit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [scope.companyId, invoice.branchId, id, invoice.clientId, creditAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId]
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
               "createdAt" TIMESTAMP DEFAULT NOW()
             )`
          );
          const ins2 = await client.query(
            `INSERT INTO credit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [scope.companyId, invoice.branchId, id, invoice.clientId, creditAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId]
          );
          memoId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }

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
            scope.companyId, "invoice_revenue", "credit", "4000"
          );
          const approvalPeriod = String(origJe.createdAt).slice(0, 7);
          await client.query(
            `UPDATE budgets SET used = GREATEST(used - $1, 0)
             WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
            [net, scope.companyId, invRevenueCode, approvalPeriod]
          );
        }
      }
    });

    const memoJournalResult = await financialEngine.postJournalEntry({
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
        ...(vat > 0 ? [{ accountCode: vatPayableCode, debit: vat, credit: 0, clientId: invoice.clientId }] : []),
        { accountCode: arCode, debit: 0, credit: creditAmount, clientId: invoice.clientId },
      ],
      guardTable: "credit_memos",
      guardId: memoId ?? 0,
    });
    let journalId: number | null = memoJournalResult.journalId;
    markIdempotencyReplay(req, res, memoJournalResult.alreadyExists);
    if (journalId && memoId) {
      await rawExecute(`UPDATE credit_memos SET "journalEntryId" = $1 WHERE id = $2 AND "companyId" = $3`, [journalId, memoId, scope.companyId]);
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.credit_memo",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ memoId, amount: creditAmount, net, vat, reason }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [memo] = await rawQuery<Record<string, unknown>>(`SELECT * FROM credit_memos WHERE id=$1 AND "companyId"=$2`, [memoId, scope.companyId]);
    res.status(201).json(memo || { memoId, journalId, invoiceId: id, amount: creditAmount, netAmount: net, vatAmount: vat, reason, memoDate: memoDateStr });
  } catch (err) {
    handleRouteError(err, res, "Credit memo error:");
  }
});

invoicesRouter.post("/invoices/:id/debit-memo", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { amount, reason, vatIncluded = true, memoDate } = zodParse(createDebitMemoSchema.safeParse(req.body ?? {}));

    const [invoice] = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "clientId", "companyId", "branchId", total, "vatRate"
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
    const [arCode, revenueCode, vatPayableCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "debit", "1200"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_revenue", "credit", "4000"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_vat_payable", "credit", "2300"),
    ]);

    let memoId: number | null = null;
    await withTransaction(async (client) => {
      try {
        const ins = await client.query(
          `INSERT INTO debit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [scope.companyId, invoice.branchId, id, invoice.clientId, chargeAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId]
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
               "createdAt" TIMESTAMP DEFAULT NOW()
             )`
          );
          const ins2 = await client.query(
            `INSERT INTO debit_memos ("companyId","branchId","invoiceId","clientId",amount,"netAmount","vatAmount",reason,"memoDate","createdBy")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [scope.companyId, invoice.branchId, id, invoice.clientId, chargeAmount, net, vat, reason, memoDateStr, scope.activeAssignmentId]
          );
          memoId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }

      // Increase invoice subtotal + VAT + total to reflect the additional
      // charge. Missing subtotal here broke the `subtotal = total - vatAmount`
      // invariant and made any report that read `subtotal` for "net revenue"
      // under-report by the debit-memo net.
      await client.query(
        `UPDATE invoices SET subtotal = subtotal + $1, "vatAmount" = "vatAmount" + $2, total = total + $3 WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL`,
        [net, vat, chargeAmount, id, scope.companyId]
      );
    });

    const debitMemoResult = await financialEngine.postJournalEntry({
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
        ...(vat > 0 ? [{ accountCode: vatPayableCode, debit: 0, credit: vat, clientId: invoice.clientId as number | undefined }] : []),
      ],
      guardTable: "debit_memos",
      guardId: memoId ?? 0,
    });
    let journalId: number | null = debitMemoResult.journalId;
    markIdempotencyReplay(req, res, debitMemoResult.alreadyExists);
    if (journalId && memoId) {
      await rawExecute(`UPDATE debit_memos SET "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [memoId, scope.companyId]);
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.debit_memo",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ memoId, amount: chargeAmount, net, vat, reason }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    const [memo] = await rawQuery<Record<string, unknown>>(`SELECT * FROM debit_memos WHERE id=$1 AND "companyId"=$2`, [memoId, scope.companyId]);
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
           FROM credit_memos WHERE "invoiceId" = $1 AND "companyId" = $2 ORDER BY "memoDate" DESC`,
        [id, scope.companyId]
      );
    } catch (e) { logger.warn(e, "credit_memos table may not exist yet"); }
    try {
      debitMemos = await rawQuery<Record<string, unknown>>(
        `SELECT id, amount, "netAmount", "vatAmount", reason, "memoDate", "createdAt"
           FROM debit_memos WHERE "invoiceId" = $1 AND "companyId" = $2 ORDER BY "memoDate" DESC`,
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
//   DR 6200 Bad debt expense
//   CR 1210 Allowance for doubtful accounts (contra-AR)
// Rates default to: 0-30=0%, 31-60=5%, 61-90=25%, 90+=50% and are overridable
// per request. Idempotent per period via ref `BAD-DEBT-{period}`.
// ─────────────────────────────────────────────────────────────────────────────

invoicesRouter.get("/bad-debt/preview", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOf = (req.query.asOf as string) || todayISO();
    const rates = {
      current: Number.isFinite(Number(req.query.rateCurrent)) ? Number(req.query.rateCurrent) : 0,
      d30: Number.isFinite(Number(req.query.rate30)) ? Number(req.query.rate30) : 0.05,
      d60: Number.isFinite(Number(req.query.rate60)) ? Number(req.query.rate60) : 0.25,
      d90: Number.isFinite(Number(req.query.rate90)) ? Number(req.query.rate90) : 0.5,
      d90plus: Number.isFinite(Number(req.query.rate90plus)) ? Number(req.query.rate90plus) : 0.75,
    };

    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "clientId", "createdAt", "dueDate", total, "paidAmount",
              (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL
          AND "createdAt" <= $2
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

    res.json({ asOf, rates, buckets, provision, totalProvision, invoiceCount: invoices.length });
  } catch (err) {
    handleRouteError(err, res, "Bad debt preview error:");
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
    const targetDate = asOf || `${targetPeriod}-28`;
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, targetDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تسجيل مخصص ديون في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
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

    const r = {
      current: Number(rates?.current ?? 0),
      d30: Number(rates?.d30 ?? 0.05),
      d60: Number(rates?.d60 ?? 0.25),
      d90: Number(rates?.d90 ?? 0.5),
      d90plus: Number(rates?.d90plus ?? 0.75),
    };

    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT "createdAt", "dueDate", (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" <= $2
          AND (total - COALESCE("paidAmount",0)) > 0.01`,
      [scope.companyId, targetDate]
    );
    const asOfMs = new Date(targetDate).getTime();
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    for (const inv of invoices) {
      const due = inv.dueDate ? new Date(inv.dueDate as string | Date).getTime()
        : new Date(inv.createdAt as string | Date).getTime() + 30 * 86400000;
      const d = Math.floor((asOfMs - due) / 86400000);
      const amt = Number(inv.outstanding);
      const ra = roundTo2(amt);
      if (d <= 0) buckets.current = roundTo2(buckets.current + ra);
      else if (d <= 30) buckets.d30 = roundTo2(buckets.d30 + ra);
      else if (d <= 60) buckets.d60 = roundTo2(buckets.d60 + ra);
      else if (d <= 90) buckets.d90 = roundTo2(buckets.d90 + ra);
      else buckets.d90plus = roundTo2(buckets.d90plus + ra);
    }
    const total = roundTo2(
      buckets.current * r.current + buckets.d30 * r.d30 + buckets.d60 * r.d60 + buckets.d90 * r.d90 + buckets.d90plus * r.d90plus
    );

    if (total <= 0) {
      throw new ValidationError("لا يوجد مبلغ لمخصص الديون المشكوك فيها");
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [expenseCode, allowanceCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "bad_debt_expense", "debit", "5170"),
      financialEngine.resolveAccountCode(scope.companyId, "bad_debt_allowance", "credit", "1210"),
    ]);

    let journalId: number | null = null;
    try {
      const badDebtResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref,
        description: `مخصص ديون مشكوك فيها ${targetPeriod}${notes ? ` — ${notes}` : ""}`,
        sourceType: "bad_debt_allowance",
        sourceId: 0,
        sourceKey: `finance:bad_debt:${scope.companyId}:${targetPeriod}`,
        lines: [
          { accountCode: expenseCode, debit: total, credit: 0 },
          { accountCode: allowanceCode, debit: 0, credit: total },
        ],
      });
      journalId = badDebtResult.journalId;
      markIdempotencyReplay(req, res, badDebtResult.alreadyExists);
    } catch (je) {
      logger.error(je, "Bad debt JE error:");
      throw new IntegrationError(
        "فشل تسجيل قيد مخصص الديون المشكوك فيها",
        { field: "journalEntry", fix: "راجع إعدادات الحسابات (5170/1210) ثم أعد المحاولة" }
      );
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bad_debt.posted",
      entity: "journal_entries",
      entityId: journalId ?? 0,
      details: JSON.stringify({ period: targetPeriod, total, buckets, rates: r }),
    }).catch((e) => logger.error(e, "finance-invoices background task failed"));

    res.status(201).json({ journalId, ref, period: targetPeriod, total, buckets, rates: r });
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

    const { clientId, amount, method = "bank_transfer", reference, notes, receivedDate } = zodParse(createCustomerAdvanceSchema.safeParse(req.body));

    const [client] = await rawQuery<{ id: number }>(`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [clientId, scope.companyId]);
    if (!client) throw new ValidationError("العميل غير موجود", { field: "clientId", fix: "اختر عميلاً من قائمة العملاء." });

    const recvDate = receivedDate || todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, recvDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تسجيل دفعة مقدمة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const amt = roundTo2(Number(amount));

    let advanceId: number | null = null;
    const advRef = reference || `ADV-${Date.now()}`;
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO customer_advances ("companyId","branchId","clientId",ref,amount,"appliedAmount",method,"receivedDate",notes,"createdBy",status)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'open') RETURNING id`,
          [scope.companyId, scope.branchId, clientId, advRef, amt, method, recvDate, notes ?? null, scope.activeAssignmentId]
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
            [scope.companyId, scope.branchId, clientId, advRef, amt, method, recvDate, notes ?? null, scope.activeAssignmentId]
          );
          advanceId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }
    });

    const { financialEngine } = await import("../lib/engines/index.js");
    const [cashCode, advLiabCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "payroll_bank_payout", "debit", "1100"),
      financialEngine.resolveAccountCode(scope.companyId, "customer_advance_liability", "credit", "2400"),
    ]);

    let journalId: number | null = null;
    try {
      const advanceResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: advRef,
        description: `دفعة مقدمة من العميل ${clientId}: ${amt}`,
        sourceType: "customer_advance",
        sourceId: advanceId ?? 0,
        sourceKey: `finance:customer_advance:${advanceId}`,
        lines: [
          { accountCode: cashCode, debit: amt, credit: 0, clientId: Number(clientId) },
          { accountCode: advLiabCode, debit: 0, credit: amt, clientId: Number(clientId) },
        ],
        guardTable: "customer_advances",
        guardId: advanceId ?? 0,
      });
      journalId = advanceResult.journalId;
      markIdempotencyReplay(req, res, advanceResult.alreadyExists);
      if (journalId && advanceId) {
        await rawExecute(`UPDATE customer_advances SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`, [journalId, advanceId, scope.companyId]);
      }
    } catch (glErr) {
      if (advanceId) {
        await rawExecute(`DELETE FROM customer_advances WHERE id = $1 AND "companyId" = $2`, [advanceId, scope.companyId]);
      }
      throw glErr;
    }

    res.status(201).json({ advanceId, ref: advRef, clientId, amount: amt, journalId, status: "open" });
  } catch (err) {
    handleRouteError(err, res, "Customer advance create error:");
  }
});

invoicesRouter.post("/customer-advances/:id/apply", authorize({ feature: "finance.invoices", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const advanceId = parseId(req.params.id, "id");
    const { invoiceId, amount } = zodParse(applyAdvanceSchema.safeParse(req.body ?? {}));

    const applyAmt = roundTo2(Number(amount));

    const { financialEngine } = await import("../lib/engines/index.js");
    const [advLiabCode, arCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "customer_advance_liability", "debit", "2400"),
      financialEngine.resolveAccountCode(scope.companyId, "invoice_ar", "credit", "1200"),
    ]);

    let advance: any;
    let invoice: any;
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
    });

    const applyResult = await financialEngine.postJournalEntry({
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
    const journalId = applyResult.journalId;
    markIdempotencyReplay(req, res, applyResult.alreadyExists);

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
           LEFT JOIN clients c ON c.id = ca."clientId" AND c."deletedAt" IS NULL
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
  await rawQuery(`
    CREATE TABLE IF NOT EXISTS dunning_letters (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "invoiceId" INTEGER NOT NULL,
      "clientId" INTEGER,
      level INTEGER DEFAULT 1,
      subject VARCHAR(500),
      body TEXT,
      "sentAt" TIMESTAMPTZ,
      "deletedAt" TIMESTAMPTZ,
      status VARCHAR(50) DEFAULT 'pending'
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
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       WHERE i."companyId"=$2
         AND i.status NOT IN ('paid','cancelled')
         AND COALESCE(i."deletedAt",NULL) IS NULL
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
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
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
         ("companyId","invoiceId","clientId","level",subject,body,"sentAt",status)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),'sent') RETURNING id`,
        [scope.companyId, inv.id, inv.clientId, stg.stage, `تذكير سداد - مرحلة ${stg.stage}`, letter]
      );
      results.push({ invoiceId: inv.id, letterId: row.id, stage: stg.stage, daysPastDue: days, outstanding, status: "sent" });
    }

    res.status(201).json({
      total: results.length,
      sent: results.filter(r => r.status === "sent").length,
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
    if (stage) { params.push(Number(stage)); where += ` AND dl.level=$${params.length}`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT dl.*, i.ref AS "invoiceNumber", c.name AS "clientName"
       FROM dunning_letters dl
       LEFT JOIN invoices i ON i.id = dl."invoiceId" AND i."deletedAt" IS NULL
       LEFT JOIN clients c ON c.id = dl."clientId" AND c."deletedAt" IS NULL
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
         AND "memoDate" >= make_date($2, 1, 1) AND "memoDate" < make_date($2 + 1, 1, 1)
       GROUP BY to_char("memoDate", 'YYYY-MM')`,
      [scope.companyId, thisYear]
    );
    const inputRows = await rawQuery<{ period: string; total: string | number }>(
      `SELECT to_char(je."createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM(jl.debit), 0) AS total
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL AND je."balancesApplied" = true
       WHERE je."companyId" = $1 AND jl."accountCode" = $3
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
