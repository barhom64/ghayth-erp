import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  createJournalEntry,
  initiateApprovalChain,
  getAccountCodeFromMapping,
  checkFinancialPeriodOpen,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];

function requireRole(scope: any, allowedRoles: string[], res: any): boolean {
  if (!allowedRoles.includes(scope.role)) {
    res.status(403).json({
      error: "ليس لديك الصلاحية للقيام بهذا الإجراء",
      requiredRoles: allowedRoles,
      yourRole: scope.role,
    });
    return false;
  }
  return true;
}

const COLLECTION_STAGES = [
  { stage: 1, name: "sms_email_reminder", label: "تذكير SMS + إيميل", daysOverdue: 1 },
  { stage: 2, name: "accountant_notification", label: "إشعار محاسب + إيميل ثاني", daysOverdue: 7 },
  { stage: 3, name: "field_collection", label: "مهمة تحصيل ميداني", daysOverdue: 14 },
  { stage: 4, name: "cfo_escalation", label: "تصعيد للمدير المالي", daysOverdue: 21 },
  { stage: 5, name: "gm_penalty", label: "إشعار GM + غرامة 2%", daysOverdue: 30 },
  { stage: 6, name: "legal_churned", label: "إشعار القانونية + تصنيف churned", daysOverdue: 60 },
];

invoicesRouter.get("/invoices", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status = "", page = "1", limit: lim = "20" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'i."companyId"',
      branchColumn: 'i."branchId"',
      enforceBranchScope: true,
    });

    let paramIdx = nextParamIndex;
    let where = baseWhere + ` AND i."deletedAt" IS NULL`;
    if (status) {
      where += ` AND i.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    params.push(Number(lim));
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const invoices = await rawQuery<any>(
      `SELECT i.id, i.ref, i.status, i."createdAt" AS "issueDate", i."dueDate",
              i.total, i."paidAmount", i."vatAmount",
              i."isTaxLinked", i."zatcaStatus",
              c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE ${where}
       ORDER BY i."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM invoices i WHERE ${where} AND i."deletedAt" IS NULL`,
      countParams
    );

    res.json({ data: invoices, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "List invoices error:");
  }
});

invoicesRouter.post("/invoices", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const {
      clientId, description, subtotal, total: rawTotal, lines: lineItems,
      vatRate = 15, dueDate, date: invoiceBodyDate, paymentTermsDays, branchId, companyId: bodyCompanyId, notes,
      isTaxLinked, invoiceTypeCode, taxCategoryCode, exemptionReason,
    } = req.body as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!clientId) { validationError(res, "العميل مطلوب لإنشاء الفاتورة", "clientId", "حدد العميل الذي ستُصدر له الفاتورة"); return; }
    if (!branchId && !scope.branchId) { validationError(res, "الفرع مطلوب لإنشاء الفاتورة", "branchId", "حدد الفرع الذي تنتمي إليه الفاتورة"); return; }
    if (isTaxLinked) {
      const validInvoiceTypes = ["388", "381", "383"];
      const validTaxCategories = ["S", "Z", "E", "O"];
      if (invoiceTypeCode && !validInvoiceTypes.includes(invoiceTypeCode)) { res.status(400).json({ error: `نوع الفاتورة غير صالح. القيم المسموحة: ${validInvoiceTypes.join(", ")}` }); return; }
      if (taxCategoryCode && !validTaxCategories.includes(taxCategoryCode)) { res.status(400).json({ error: `فئة الضريبة غير صالحة. القيم المسموحة: ${validTaxCategories.join(", ")}` }); return; }
    }
    const parsedTerms = paymentTermsDays != null && paymentTermsDays !== "" ? Number(paymentTermsDays) : null;
    if (parsedTerms == null && !dueDate) { validationError(res, "شروط الدفع أو تاريخ الاستحقاق مطلوبة", "paymentTermsDays", "حدد شروط الدفع (عدد الأيام) أو تاريخ الاستحقاق"); return; }
    if (parsedTerms != null && (Number.isNaN(parsedTerms) || parsedTerms < 0)) { validationError(res, "شروط الدفع غير صالحة", "paymentTermsDays", "أدخل عدد أيام صحيح (0 أو أكثر)"); return; }

    let baseAmount = 0;
    let validatedLines: { description: string; quantity: number; unitPrice: number; lineTotal: number; vatAmount: number; lineGross: number }[] = [];

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      for (const line of lineItems) {
        if (!line.unitPrice || line.unitPrice <= 0) { res.status(400).json({ error: "سعر الوحدة يجب أن يكون أكبر من صفر" }); return; }
        if (!line.quantity || line.quantity <= 0) { res.status(400).json({ error: "الكمية يجب أن تكون أكبر من صفر" }); return; }
        const lineTotal = Math.round(Number(line.quantity) * Number(line.unitPrice) * 100) / 100;
        const lineVatRate = line.vatRate != null ? Number(line.vatRate) : Number(vatRate);
        const lineVat = line.vatAmount != null
          ? Math.round(Number(line.vatAmount) * 100) / 100
          : Math.round(lineTotal * (lineVatRate / 100) * 100) / 100;
        baseAmount += lineTotal;
        validatedLines.push({ description: line.description ?? "", quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), lineTotal, vatAmount: lineVat, lineGross: lineTotal + lineVat });
      }
    } else {
      baseAmount = Number(subtotal ?? rawTotal ?? 0);
    }

    if (!baseAmount || baseAmount <= 0) { validationError(res, "لا يمكن إنشاء فاتورة بقيمة صفر أو سالبة", "total", "أدخل مبلغاً موجباً أكبر من صفر للفاتورة"); return; }

    const invoiceDate = invoiceBodyDate
      ? new Date(invoiceBodyDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    const periodCheck = await checkFinancialPeriodOpen(effectiveCompanyId, invoiceDate);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن إنشاء فاتورة في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }

    const [invArCode, invRevenueCode, invVatPayableCode] = await Promise.all([
      getAccountCodeFromMapping(effectiveCompanyId, "invoice_ar", "debit", "1200"),
      getAccountCodeFromMapping(effectiveCompanyId, "invoice_revenue", "credit", "4000"),
      getAccountCodeFromMapping(effectiveCompanyId, "invoice_vat_payable", "credit", "2300"),
    ]);

    const [seqRow] = await rawQuery<any>(`SELECT nextval('invoice_number_seq') AS seq`);
    const seqNum = Number(seqRow.seq);
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const ref = `INV-${year}${month}-${String(seqNum).padStart(4, "0")}`;

    const vatAmount = validatedLines.length > 0
      ? Math.round(validatedLines.reduce((sum, l) => sum + l.vatAmount, 0) * 100) / 100
      : Math.round(baseAmount * (Number(vatRate) / 100) * 100) / 100;
    const total = Math.round((baseAmount + vatAmount) * 100) / 100;

    let finalDueDate = dueDate ?? null;
    if (!finalDueDate && parsedTerms != null) {
      const due = new Date();
      due.setDate(due.getDate() + parsedTerms);
      finalDueDate = due.toISOString().split("T")[0];
    }

    let insertId!: number;
    await withTransaction(async (client) => {
      const invResult = await client.query(
        `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
                subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,
                "isTaxLinked","invoiceTypeCode","taxCategoryCode","exemptionReason")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [effectiveCompanyId, branchId ?? scope.branchId, clientId ?? null, ref, description ?? null,
          baseAmount, Number(vatRate), vatAmount, total, finalDueDate, scope.activeAssignmentId, notes ?? null,
          isTaxLinked ? true : false, invoiceTypeCode ?? "388", taxCategoryCode ?? "S", exemptionReason ?? null]
      );
      insertId = invResult.rows[0].id;

      if (validatedLines.length > 0) {
        // Single bulk INSERT instead of one round-trip per line.
        const COLS_PER_ROW = 7;
        const valuesSql: string[] = [];
        const params: any[] = [];
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

      const effectiveBranchId = branchId ?? scope.branchId;
      const jeResult = await client.query(
        `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [effectiveCompanyId, effectiveBranchId, scope.activeAssignmentId,
          `JE-${ref}`, `فاتورة ${ref}${description ? ` – ${description}` : ""}`]
      );
      const journalId = jeResult.rows[0].id;
      const journalLines = [
        { accountCode: invArCode, debit: total, credit: 0 },
        { accountCode: invRevenueCode, debit: 0, credit: baseAmount },
        { accountCode: invVatPayableCode, debit: 0, credit: vatAmount },
      ];
      const jlValuesSql: string[] = [];
      const jlParams: any[] = [];
      for (const jl of journalLines) {
        const base = jlParams.length;
        jlValuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4})`);
        jlParams.push(journalId, jl.accountCode, jl.debit, jl.credit);
      }
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ${jlValuesSql.join(",")}`,
        jlParams
      );

      if (clientId) {
        await client.query(
          `UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) + $1 WHERE id = $2 AND "companyId" = $3`,
          [total, clientId, effectiveCompanyId]
        );
      }

      await client.query(
        `UPDATE budgets SET used = used + $1 WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4`,
        [baseAmount, effectiveCompanyId, invRevenueCode, new Date().toISOString().slice(0, 7)]
      ).catch(() => {});

      if (finalDueDate) {
        const collectionDate = new Date(finalDueDate);
        collectionDate.setDate(collectionDate.getDate() + 30);
        await client.query(
          `INSERT INTO collection_follow_ups ("companyId","invoiceId","scheduledDate",type,notes,status,"assignedTo")
           VALUES ($1,$2,$3,'collection_task',$4,'pending',$5)`,
          [effectiveCompanyId, insertId, collectionDate.toISOString().split("T")[0],
            `مهمة تحصيل فاتورة ${ref} – بعد 30 يوم من تاريخ الاستحقاق`, scope.activeAssignmentId]
        );
      }
    });

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.created", entity: "invoices", entityId: insertId, details: JSON.stringify({ ref, total, dueDate: finalDueDate, vatAmount, lineCount: validatedLines.length }) }).catch(console.error);
    createNotification({ companyId: scope.companyId, assignmentId: scope.activeAssignmentId, type: "invoice_created", title: "تم إنشاء فاتورة جديدة", body: `فاتورة ${ref} بمبلغ ${total.toLocaleString()} ﷼`, priority: "normal", refType: "invoices", refId: insertId }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "create", entity: "invoices", entityId: insertId, after: { ref, total, vatAmount, clientId: clientId ?? null } }).catch(console.error);

    const [invoice] = await rawQuery<any>(`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" WHERE i.id = $1`, [insertId]);
    res.status(201).json({ ...invoice, lines: validatedLines });
  } catch (err) {
    handleRouteError(err, res, "Create invoice error:");
  }
});

invoicesRouter.post("/invoices/:id/send", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;

    // Read the joined invoice+client view first — we need the contact info to
    // decide which delivery channels to log, and the ref/clientName for the
    // audit trail. The lifecycle engine will re-lock the invoice row FOR
    // UPDATE inside its transaction so this read is purely for display data.
    const [invoice] = await rawQuery<any>(
      `SELECT i.id, i.ref, i.status, i.total, i."vatAmount", i."dueDate",
              c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail"
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }

    const channels: string[] = [];
    if (invoice.clientEmail) { channels.push("email"); console.log(`[INVOICE-SEND] Email PDF → ${invoice.clientEmail} for ${invoice.ref}`); }
    if (invoice.clientPhone) { channels.push("whatsapp"); console.log(`[INVOICE-SEND] WhatsApp link → ${invoice.clientPhone} for ${invoice.ref}`); }

    // Atomic draft→sent transition via the shared lifecycle engine. The
    // engine writes the event_log row + audit_logs row + bus emission, so
    // this handler only keeps the channel notification as a side-effect.
    try {
      await applyTransition({
        entity: "invoices",
        id: Number(id),
        scope: {
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
        },
        action: "invoice.sent",
        fromStates: ["draft"],
        toState: "sent",
        setExtras: { sentAt: { raw: "NOW()" } },
        extraWhere: `"deletedAt" IS NULL`,
        after: { ref: invoice.ref, channels, clientName: invoice.clientName },
      });
    } catch (err) {
      const mapped = lifecycleErrorResponse(err);
      if (mapped) {
        // Preserve the pre-existing error surface (400 "الفاتورة مرسلة مسبقاً"
        // instead of 409) for backwards compat with UI error handling.
        if (mapped.status === 409) {
          res.status(400).json({ error: "الفاتورة مرسلة مسبقاً" });
          return;
        }
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    createNotification({ companyId: scope.companyId, assignmentId: scope.activeAssignmentId, type: "invoice_sent", title: `تم إرسال الفاتورة ${invoice.ref}`, body: `تم إرسال الفاتورة للعميل ${invoice.clientName || ""} عبر ${channels.join(" + ") || "النظام"}`, priority: "normal", refType: "invoices", refId: Number(id) }).catch(console.error);

    res.json({ message: "تم إرسال الفاتورة بنجاح", status: "sent", channels, ref: invoice.ref });
  } catch (err) {
    handleRouteError(err, res, "Send invoice error:");
  }
});

invoicesRouter.post("/invoices/:id/payment", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { amount, method = "bank_transfer" } = req.body as any;

    if (!amount) { res.status(400).json({ error: "المبلغ مطلوب" }); return; }
    if (Number(amount) <= 0) { res.status(400).json({ error: "يجب أن يكون المبلغ أكبر من صفر" }); return; }

    const [cashAccountCode, arAccountCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1100" : "1110"),
      getAccountCodeFromMapping(scope.companyId, "invoice_payment_ar", "credit", "1200"),
    ]);

    let invoiceRef!: string;
    let newPaid!: number;
    let newStatus!: string;
    await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, total, "paidAmount", status, ref FROM invoices
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [Number(id), scope.companyId]
      );
      const invoice = invRes.rows[0];
      if (!invoice) throw Object.assign(new Error("الفاتورة غير موجودة"), { statusCode: 404 });

      const lockedStatuses = ["paid", "closed", "posted"];
      if (lockedStatuses.includes(invoice.status)) {
        throw Object.assign(
          new Error(`لا يمكن تسجيل دفعة على فاتورة بحالة "${invoice.status}" — الفاتورة مُقفلة`),
          { statusCode: 422 }
        );
      }

      const remaining = Number(invoice.total) - Number(invoice.paidAmount);
      if (Number(amount) > remaining + 0.01) {
        throw Object.assign(
          new Error(`مبلغ الدفع (${Number(amount).toFixed(2)}) يتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`),
          { statusCode: 422 }
        );
      }

      invoiceRef = invoice.ref;
      newPaid = Number(invoice.paidAmount) + Number(amount);
      newStatus = newPaid >= Number(invoice.total) - 0.01 ? "paid" : "partial";
      const paidAt = newStatus === "paid" ? new Date().toISOString() : null;

      if (paidAt) {
        await client.query(
          `UPDATE invoices SET "paidAmount" = $1, status = $2, "paidAt" = $3 WHERE id = $4`,
          [newPaid, newStatus, paidAt, Number(id)]
        );
      } else {
        await client.query(
          `UPDATE invoices SET "paidAmount" = $1, status = $2 WHERE id = $3`,
          [newPaid, newStatus, Number(id)]
        );
      }

      const jeRes = await client.query(
        `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"sourceType","sourceId")
         VALUES ($1,$2,$3,$4,$5,'payment','invoice',$6) RETURNING id`,
        [scope.companyId, scope.branchId, scope.activeAssignmentId,
          `PAY-${invoiceRef}-${Date.now()}`, `سداد فاتورة ${invoiceRef}`, Number(id)]
      );
      const journalId = jeRes.rows[0].id;

      const paymentAmount = Number(amount);
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,$2,$3,$4)`,
        [journalId, cashAccountCode, paymentAmount, 0]
      );
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,$2,$3,$4)`,
        [journalId, arAccountCode, 0, paymentAmount]
      );
    });

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.paid", entity: "invoices", entityId: Number(id), details: JSON.stringify({ amount, method, newStatus }) }).catch(console.error);

    res.json({ message: "تم تسجيل الدفعة", newPaidAmount: newPaid, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "Record payment error:");
  }
});

invoicesRouter.get("/invoices/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
    const [invoice] = await rawQuery<any>(
      `SELECT i.*, c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail",
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" LEFT JOIN branches b ON b.id = i."branchId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    const lines = await rawQuery<any>(`SELECT * FROM invoice_lines WHERE "invoiceId" = $1 ORDER BY id`, [Number(id)]);
    const [payments, journalEntries] = await Promise.all([
      rawQuery<any>(`SELECT je.id, je.ref, je.description, je."createdAt" AS date, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE $2 AND jl."accountCode" = '1100' AND jl.debit > 0 GROUP BY je.id, je.ref, je.description, je."createdAt" ORDER BY je."createdAt" DESC`, [scope.companyId, `PAY-${invoice.ref}%`]),
      rawQuery<any>(`SELECT je.id, je.ref, je.description, je."createdAt" AS date FROM journal_entries je WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND (je.ref LIKE $2 OR je.ref LIKE $3) ORDER BY je."createdAt" DESC`, [scope.companyId, `JE-${invoice.ref}%`, `PAY-${invoice.ref}%`]),
    ]);
    res.json({ ...invoice, lines, payments, journalEntries });
  } catch (err) {
    handleRouteError(err, res, "Invoice detail error:");
  }
});

invoicesRouter.patch("/invoices/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const { status, description, dueDate } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (status) { sets.push(`status = $${idx++}`); params.push(status); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
    if (dueDate !== undefined) { sets.push(`"dueDate" = $${idx++}`); params.push(dueDate); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(Number(id), scope.companyId);
    const [row] = await rawQuery<any>(`UPDATE invoices SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`, params);
    if (!row) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Patch invoice error:");
  }
});

invoicesRouter.delete("/invoices/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE invoices SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete invoice error:");
  }
});

invoicesRouter.patch("/invoices/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;
    const [inv] = await rawQuery<any>(`SELECT * FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!inv) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) { res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return; }
    await rawExecute(`UPDATE invoices SET status = $1 WHERE id = $2`, [newStatus, Number(id)]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('invoice',$1,$2,$3,$4,$5)`, [Number(id), newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { console.error(e); }
    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.get("/collection", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'i."companyId"', branchColumn: 'i."branchId"', enforceBranchScope: true });
    const overdueInvoices = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", i."dueDate",
              i.status, c.name AS "clientName", c.phone AS "clientPhone",
              CURRENT_DATE - i."dueDate" AS "daysOverdue",
              ics.stage AS "currentStage", ics."stageName" AS "currentStageName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       LEFT JOIN LATERAL (
         SELECT stage, "stageName" FROM invoice_collection_stages
         WHERE "invoiceId" = i.id ORDER BY id DESC LIMIT 1
       ) ics ON true
       WHERE ${where} AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue') AND i."dueDate" < CURRENT_DATE
       ORDER BY i."dueDate" ASC`,
      params
    );
    const enriched = overdueInvoices.map((inv: any) => {
      const daysOverdue = Number(inv.daysOverdue ?? 0);
      const recommendedStage = COLLECTION_STAGES.reduce((acc, s) => (daysOverdue >= s.daysOverdue ? s : acc), COLLECTION_STAGES[0]);
      return { ...inv, daysOverdue, currentStage: inv.currentStage ?? 0, recommendedStage: recommendedStage.stage, recommendedAction: recommendedStage.label };
    });
    res.json(enriched);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.post("/collection/:invoiceId/action", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { invoiceId } = req.params;
    const { stage, notes } = req.body as any;
    const [invoice] = await rawQuery<any>(`SELECT id, ref, status, "dueDate", EXTRACT(DAY FROM NOW() - "dueDate"::timestamptz)::int AS "daysOverdue" FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(invoiceId), scope.companyId]);
    if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    const requestedStage = Number(stage);
    const stageInfo = COLLECTION_STAGES.find((s) => s.stage === requestedStage);
    if (!stageInfo) { res.status(400).json({ error: "مرحلة التحصيل غير معرّفة", validStages: COLLECTION_STAGES.map((s) => s.stage) }); return; }
    const daysOverdue = Number(invoice.daysOverdue ?? 0);
    if (daysOverdue < stageInfo.daysOverdue) { res.status(400).json({ error: `هذه المرحلة تتطلب تأخراً ${stageInfo.daysOverdue} يوم على الأقل. التأخر الحالي: ${daysOverdue} يوم`, requiredDaysOverdue: stageInfo.daysOverdue, currentDaysOverdue: daysOverdue }); return; }
    const [lastStageRecord] = await rawQuery<any>(`SELECT stage FROM invoice_collection_stages WHERE "invoiceId" = $1 ORDER BY id DESC LIMIT 1`, [Number(invoiceId)]);
    const lastStage = lastStageRecord ? Number(lastStageRecord.stage) : 0;
    if (requestedStage <= lastStage || requestedStage > lastStage + 1) { res.status(400).json({ error: `يجب اتباع المراحل بالتسلسل. المرحلة المتوقعة: ${lastStage + 1}، المطلوب: ${requestedStage}`, expectedStage: lastStage + 1, requestedStage }); return; }
    if (invoice.status !== "overdue") { await rawExecute(`UPDATE invoices SET status = 'overdue' WHERE id = $1`, [Number(invoiceId)]); }
    await rawExecute(`INSERT INTO invoice_collection_stages ("companyId","invoiceId",stage,"stageName",notes,"performedBy") VALUES ($1,$2,$3,$4,$5,$6)`, [scope.companyId, Number(invoiceId), stageInfo.stage, stageInfo.name, notes ?? null, scope.activeAssignmentId]);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `collection.${stageInfo.name}`, entity: "invoices", entityId: Number(invoiceId), details: JSON.stringify({ stage: stageInfo.stage, label: stageInfo.label, notes }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: `collection.stage_${stage}`, entity: "invoices", entityId: Number(invoiceId), after: { stage: stageInfo.stage, action: stageInfo.name, notes } }).catch(console.error);
    res.json({ message: `تم تسجيل إجراء التحصيل: ${stageInfo.label}`, stage: stageInfo });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.get("/collection/:invoiceId/history", async (req, res) => {
  try {
    const scope = req.scope!;
    const { invoiceId } = req.params;
    const [invoice] = await rawQuery<any>(`SELECT id FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(invoiceId), scope.companyId]);
    if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    const history = await rawQuery<any>(`SELECT ics.*, e.name AS "performedByName" FROM invoice_collection_stages ics LEFT JOIN employee_assignments ea ON ea.id = ics."performedBy" LEFT JOIN employees e ON e.id = ea."employeeId" WHERE ics."invoiceId" = $1 ORDER BY ics.id ASC`, [Number(invoiceId)]);
    res.json(history);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.get("/receivables", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", (i.total - i."paidAmount") AS "remainingAmount",
              i."dueDate", i.status, i."createdAt", c.name AS "clientName", c.phone AS "clientPhone"
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL AND i.status IN ('draft','sent','pending','partial','overdue') AND i.total > i."paidAmount"
       ORDER BY i."dueDate" ASC NULLS LAST`,
      [scope.companyId]
    );
    const totalReceivable = rows.reduce((s: number, r: any) => s + Number(r.remainingAmount), 0);
    const overdueAmount = rows.filter((r: any) => r.status === "overdue").reduce((s: number, r: any) => s + Number(r.remainingAmount), 0);
    res.json({ data: rows, summary: { totalReceivable, overdueAmount, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters);
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    params.push(monthStart);
    const [stats] = await rawQuery<any>(
      `SELECT COALESCE(SUM("paidAmount"), 0) AS "totalRevenue",
              COALESCE(SUM(total - "paidAmount") FILTER (WHERE status IN ('sent','partial')), 0) AS "pendingAmount",
              COALESCE(SUM(total - "paidAmount") FILTER (WHERE status = 'overdue'), 0) AS "overdueAmount",
              COALESCE(SUM("paidAmount") FILTER (WHERE DATE("createdAt") >= $${nextParamIndex}), 0) AS "paidThisMonth"
       FROM invoices WHERE ${where} AND "deletedAt" IS NULL`,
      params
    );
    res.json({ totalRevenue: Number(stats?.totalRevenue ?? 0), pendingAmount: Number(stats?.pendingAmount ?? 0), overdueAmount: Number(stats?.overdueAmount ?? 0), paidThisMonth: Number(stats?.paidThisMonth ?? 0) });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.get("/summary", async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<any>(`SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM("paidAmount"),0) AS paid, COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial','overdue')),0) AS outstanding FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [scope.companyId]);
    const [exp] = await rawQuery<any>(`SELECT COUNT(*) AS count, COALESCE(SUM(jl.debit),0) AS total FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL`, [scope.companyId]);
    res.json({ invoicesCount: Number(inv?.count ?? 0), totalRevenue: Number(inv?.total ?? 0), totalPaid: Number(inv?.paid ?? 0), outstanding: Number(inv?.outstanding ?? 0), expensesCount: Number(exp?.count ?? 0), totalExpenses: Number(exp?.total ?? 0) });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

invoicesRouter.get("/tax/summary", async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as any;
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const [outputVat] = await rawQuery<any>(`SELECT COALESCE(SUM("vatAmount"), 0) AS total FROM invoices WHERE "companyId" = $1 AND to_char("createdAt", 'YYYY-MM') = $2 AND "deletedAt" IS NULL`, [scope.companyId, targetPeriod]);
    const [inputVat] = await rawQuery<any>(`SELECT COALESCE(SUM(jl.debit), 0) AS total FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL WHERE je."companyId" = $1 AND jl."accountCode" = '2310' AND to_char(je."createdAt", 'YYYY-MM') = $2`, [scope.companyId, targetPeriod]);
    const outputTotal = Number(outputVat?.total ?? 0);
    const inputTotal = Number(inputVat?.total ?? 0);
    res.json({ period: targetPeriod, outputVat: outputTotal, inputVat: inputTotal, netVat: outputTotal - inputTotal, vatRate: 15, status: outputTotal - inputTotal > 0 ? "payable" : "refundable" });
  } catch (err) {
    handleRouteError(err, res, "Tax summary error:");
  }
});

invoicesRouter.get("/tax/declarations", async (req, res) => {
  try {
    const scope = req.scope!;
    const currentYear = new Date().getFullYear();
    const declarations = [];
    for (let m = 1; m <= 12; m++) {
      const period = `${currentYear}-${String(m).padStart(2, "0")}`;
      const [stats] = await rawQuery<any>(`SELECT COALESCE(SUM("vatAmount"), 0) AS "outputVat", COUNT(*) AS "invoiceCount" FROM invoices WHERE "companyId" = $1 AND to_char("createdAt", 'YYYY-MM') = $2 AND "deletedAt" IS NULL`, [scope.companyId, period]);
      if (Number(stats?.invoiceCount ?? 0) > 0) {
        declarations.push({ period, outputVat: Number(stats.outputVat), inputVat: 0, netVat: Number(stats.outputVat), invoiceCount: Number(stats.invoiceCount), status: m < new Date().getMonth() + 1 ? "submitted" : "pending" });
      }
    }
    res.json({ data: declarations });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});
