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

    const [invoice] = await rawQuery<any>(
      `SELECT i.id, i.ref, i.status, i.total, i."vatAmount", i."dueDate",
              c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail"
       FROM invoices i LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    if (invoice.status !== "draft") { res.status(400).json({ error: "الفاتورة مرسلة مسبقاً" }); return; }

    await rawExecute(`UPDATE invoices SET status = 'sent', "sentAt" = NOW() WHERE id = $1`, [Number(id)]);

    const channels: string[] = [];
    if (invoice.clientEmail) { channels.push("email"); console.log(`[INVOICE-SEND] Email PDF → ${invoice.clientEmail} for ${invoice.ref}`); }
    if (invoice.clientPhone) { channels.push("whatsapp"); console.log(`[INVOICE-SEND] WhatsApp link → ${invoice.clientPhone} for ${invoice.ref}`); }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "invoice.sent", entity: "invoices", entityId: Number(id), details: JSON.stringify({ ref: invoice.ref, channels, clientName: invoice.clientName }) }).catch(console.error);
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

invoicesRouter.post("/invoices/:id/credit-memo", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const id = Number(req.params.id);
    const { amount, reason, vatIncluded = true, memoDate } = req.body as any;

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: "سبب الإشعار الدائن مطلوب" });
      return;
    }

    const [invoice] = await rawQuery<any>(
      `SELECT id, ref, "clientId", "companyId", "branchId", total, "vatAmount",
              "paidAmount", "vatRate", "deletedAt"
         FROM invoices WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!invoice || invoice.deletedAt) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }
    const creditAmount = Math.round(Number(amount) * 100) / 100;
    const openBalance = Math.round((Number(invoice.total) - Number(invoice.paidAmount)) * 100) / 100;
    if (creditAmount > openBalance + 0.01) {
      res.status(400).json({ error: `المبلغ (${creditAmount}) يتجاوز الرصيد المفتوح (${openBalance})` });
      return;
    }

    const memoDateStr = memoDate
      ? new Date(memoDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن إصدار إشعار دائن في فترة مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }

    // If vatIncluded, split the amount into net + VAT based on invoice vatRate
    const vatRate = Number(invoice.vatRate ?? 15);
    const net = vatIncluded
      ? Math.round((creditAmount / (1 + vatRate / 100)) * 100) / 100
      : creditAmount;
    const vat = Math.round((creditAmount - net) * 100) / 100;

    const [salesReturnsCode, vatPayableCode, arCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "invoice_sales_returns", "debit", "4100"),
      getAccountCodeFromMapping(scope.companyId, "invoice_vat_payable", "debit", "2300"),
      getAccountCodeFromMapping(scope.companyId, "invoice_ar", "credit", "1200"),
    ]);

    // Persist credit memo + reduce invoice.total (soft reduce via notes + new line)
    // We store the memo as a negative invoice-adjacent row in a dedicated table
    // if present, else as a journal + notes update.
    let memoId: number | null = null;
    await withTransaction(async (client) => {
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
         WHERE id = $2`,
        [creditAmount, id]
      );
    });

    // Post JE
    let journalId: number | null = null;
    try {
      journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: invoice.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `CM-${invoice.ref}-${memoId}`,
        description: `إشعار دائن على الفاتورة ${invoice.ref}: ${reason}`,
        lines: [
          { accountCode: salesReturnsCode, debit: net, credit: 0 },
          ...(vat > 0 ? [{ accountCode: vatPayableCode, debit: vat, credit: 0 }] : []),
          { accountCode: arCode, debit: 0, credit: creditAmount },
        ],
      });
      if (journalId && memoId) {
        await rawExecute(`UPDATE credit_memos SET "journalId" = $1 WHERE id = $2`, [journalId, memoId]);
      }
    } catch (je) {
      console.error("Credit memo JE error:", je);
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.credit_memo",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ memoId, amount: creditAmount, net, vat, reason }),
    }).catch(console.error);

    res.status(201).json({
      memoId,
      journalId,
      invoiceId: id,
      amount: creditAmount,
      netAmount: net,
      vatAmount: vat,
      reason,
      memoDate: memoDateStr,
    });
  } catch (err) {
    handleRouteError(err, res, "Credit memo error:");
  }
});

invoicesRouter.post("/invoices/:id/debit-memo", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const id = Number(req.params.id);
    const { amount, reason, vatIncluded = true, memoDate } = req.body as any;

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: "سبب الإشعار المدين مطلوب" });
      return;
    }

    const [invoice] = await rawQuery<any>(
      `SELECT id, ref, "clientId", "companyId", "branchId", total, "vatRate", "deletedAt"
         FROM invoices WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!invoice || invoice.deletedAt) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }

    const chargeAmount = Math.round(Number(amount) * 100) / 100;
    const memoDateStr = memoDate
      ? new Date(memoDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن إصدار إشعار مدين في فترة مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }

    const vatRate = Number(invoice.vatRate ?? 15);
    const net = vatIncluded
      ? Math.round((chargeAmount / (1 + vatRate / 100)) * 100) / 100
      : chargeAmount;
    const vat = Math.round((chargeAmount - net) * 100) / 100;

    const [arCode, revenueCode, vatPayableCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "invoice_ar", "debit", "1200"),
      getAccountCodeFromMapping(scope.companyId, "invoice_revenue", "credit", "4000"),
      getAccountCodeFromMapping(scope.companyId, "invoice_vat_payable", "credit", "2300"),
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

      // Increase invoice total to reflect additional charge
      await client.query(
        `UPDATE invoices SET total = total + $1, "vatAmount" = "vatAmount" + $2 WHERE id = $3`,
        [chargeAmount, vat, id]
      );
    });

    let journalId: number | null = null;
    try {
      journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: invoice.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `DM-${invoice.ref}-${memoId}`,
        description: `إشعار مدين على الفاتورة ${invoice.ref}: ${reason}`,
        lines: [
          { accountCode: arCode, debit: chargeAmount, credit: 0 },
          { accountCode: revenueCode, debit: 0, credit: net },
          ...(vat > 0 ? [{ accountCode: vatPayableCode, debit: 0, credit: vat }] : []),
        ],
      });
      if (journalId && memoId) {
        await rawExecute(`UPDATE debit_memos SET "journalId" = $1 WHERE id = $2`, [journalId, memoId]);
      }
    } catch (je) {
      console.error("Debit memo JE error:", je);
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "invoice.debit_memo",
      entity: "invoices",
      entityId: id,
      details: JSON.stringify({ memoId, amount: chargeAmount, net, vat, reason }),
    }).catch(console.error);

    res.status(201).json({
      memoId,
      journalId,
      invoiceId: id,
      amount: chargeAmount,
      netAmount: net,
      vatAmount: vat,
      reason,
      memoDate: memoDateStr,
    });
  } catch (err) {
    handleRouteError(err, res, "Debit memo error:");
  }
});

invoicesRouter.get("/invoices/:id/memos", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    let creditMemos: any[] = [];
    let debitMemos: any[] = [];
    try {
      creditMemos = await rawQuery<any>(
        `SELECT id, amount, "netAmount", "vatAmount", reason, "memoDate", "journalId", "createdAt"
           FROM credit_memos WHERE "invoiceId" = $1 AND "companyId" = $2 ORDER BY "memoDate" DESC`,
        [id, scope.companyId]
      );
    } catch { /* table may not exist yet */ }
    try {
      debitMemos = await rawQuery<any>(
        `SELECT id, amount, "netAmount", "vatAmount", reason, "memoDate", "journalId", "createdAt"
           FROM debit_memos WHERE "invoiceId" = $1 AND "companyId" = $2 ORDER BY "memoDate" DESC`,
        [id, scope.companyId]
      );
    } catch { /* table may not exist yet */ }
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

invoicesRouter.get("/bad-debt/preview", async (req, res) => {
  try {
    const scope = req.scope!;
    const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
    const rates = {
      current: Number(req.query.rateCurrent ?? 0),
      d30: Number(req.query.rate30 ?? 0.05),
      d60: Number(req.query.rate60 ?? 0.25),
      d90: Number(req.query.rate90 ?? 0.5),
      d90plus: Number(req.query.rate90plus ?? 0.75),
    };

    const invoices = await rawQuery<any>(
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
      const due = inv.dueDate ? new Date(inv.dueDate).getTime()
        : new Date(inv.createdAt).getTime() + 30 * 86400000;
      const daysOverdue = Math.floor((asOfMs - due) / 86400000);
      const amt = Number(inv.outstanding);
      if (daysOverdue <= 0) buckets.current += amt;
      else if (daysOverdue <= 30) buckets.d30 += amt;
      else if (daysOverdue <= 60) buckets.d60 += amt;
      else if (daysOverdue <= 90) buckets.d90 += amt;
      else buckets.d90plus += amt;
    }

    const provision = {
      current: Math.round(buckets.current * rates.current * 100) / 100,
      d30: Math.round(buckets.d30 * rates.d30 * 100) / 100,
      d60: Math.round(buckets.d60 * rates.d60 * 100) / 100,
      d90: Math.round(buckets.d90 * rates.d90 * 100) / 100,
      d90plus: Math.round(buckets.d90plus * rates.d90plus * 100) / 100,
    };
    const totalProvision = Math.round(
      (provision.current + provision.d30 + provision.d60 + provision.d90 + provision.d90plus) * 100
    ) / 100;

    res.json({ asOf, rates, buckets, provision, totalProvision, invoiceCount: invoices.length });
  } catch (err) {
    handleRouteError(err, res, "Bad debt preview error:");
  }
});

invoicesRouter.post("/bad-debt/post", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { period, asOf, rates, notes } = req.body as any;

    const targetPeriod = period || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(targetPeriod)) {
      res.status(400).json({ error: "صيغة الفترة غير صحيحة (YYYY-MM)" });
      return;
    }
    const targetDate = asOf || `${targetPeriod}-28`;
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, targetDate);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن تسجيل مخصص ديون في فترة مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }

    const ref = `BAD-DEBT-${targetPeriod}`;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existing) {
      res.status(409).json({ error: "تم تسجيل مخصص ديون مشكوك فيها لهذه الفترة مسبقاً", journalId: existing.id });
      return;
    }

    const r = {
      current: Number(rates?.current ?? 0),
      d30: Number(rates?.d30 ?? 0.05),
      d60: Number(rates?.d60 ?? 0.25),
      d90: Number(rates?.d90 ?? 0.5),
      d90plus: Number(rates?.d90plus ?? 0.75),
    };

    const invoices = await rawQuery<any>(
      `SELECT "createdAt", "dueDate", (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" <= $2
          AND (total - COALESCE("paidAmount",0)) > 0.01`,
      [scope.companyId, targetDate]
    );
    const asOfMs = new Date(targetDate).getTime();
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    for (const inv of invoices) {
      const due = inv.dueDate ? new Date(inv.dueDate).getTime()
        : new Date(inv.createdAt).getTime() + 30 * 86400000;
      const d = Math.floor((asOfMs - due) / 86400000);
      const amt = Number(inv.outstanding);
      if (d <= 0) buckets.current += amt;
      else if (d <= 30) buckets.d30 += amt;
      else if (d <= 60) buckets.d60 += amt;
      else if (d <= 90) buckets.d90 += amt;
      else buckets.d90plus += amt;
    }
    const total = Math.round(
      (buckets.current * r.current + buckets.d30 * r.d30 + buckets.d60 * r.d60 + buckets.d90 * r.d90 + buckets.d90plus * r.d90plus) * 100
    ) / 100;

    if (total <= 0) {
      res.status(400).json({ error: "لا يوجد مبلغ لمخصص الديون المشكوك فيها" });
      return;
    }

    const [expenseCode, allowanceCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "bad_debt_expense", "debit", "5170"),
      getAccountCodeFromMapping(scope.companyId, "bad_debt_allowance", "credit", "1210"),
    ]);

    let journalId: number | null = null;
    try {
      journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref,
        description: `مخصص ديون مشكوك فيها ${targetPeriod}${notes ? ` — ${notes}` : ""}`,
        lines: [
          { accountCode: expenseCode, debit: total, credit: 0 },
          { accountCode: allowanceCode, debit: 0, credit: total },
        ],
      });
    } catch (je) {
      console.error("Bad debt JE error:", je);
      res.status(500).json({ error: "فشل تسجيل قيد مخصص الديون المشكوك فيها" });
      return;
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bad_debt.posted",
      entity: "journal_entries",
      entityId: journalId ?? 0,
      details: JSON.stringify({ period: targetPeriod, total, buckets, rates: r }),
    }).catch(console.error);

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

invoicesRouter.post("/customer-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { clientId, amount, method = "bank_transfer", reference, notes, receivedDate } = req.body as any;

    if (!clientId) { res.status(400).json({ error: "العميل مطلوب" }); return; }
    if (!amount || Number(amount) <= 0) { res.status(400).json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" }); return; }

    const recvDate = receivedDate || new Date().toISOString().slice(0, 10);
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, recvDate);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن تسجيل دفعة مقدمة في فترة مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }

    const amt = Math.round(Number(amount) * 100) / 100;

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

    const [cashCode, advLiabCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "payroll_bank_payout", "debit", "1100"),
      getAccountCodeFromMapping(scope.companyId, "customer_advance_liability", "credit", "2400"),
    ]);

    let journalId: number | null = null;
    try {
      journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: advRef,
        description: `دفعة مقدمة من العميل ${clientId}: ${amt}`,
        lines: [
          { accountCode: cashCode, debit: amt, credit: 0 },
          { accountCode: advLiabCode, debit: 0, credit: amt },
        ],
      });
      if (journalId && advanceId) {
        await rawExecute(`UPDATE customer_advances SET "journalId" = $1 WHERE id = $2`, [journalId, advanceId]);
      }
    } catch (je) {
      console.error("Customer advance JE error:", je);
    }

    res.status(201).json({ advanceId, ref: advRef, clientId, amount: amt, journalId, status: "open" });
  } catch (err) {
    handleRouteError(err, res, "Customer advance create error:");
  }
});

invoicesRouter.post("/customer-advances/:id/apply", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const advanceId = Number(req.params.id);
    const { invoiceId, amount } = req.body as any;

    if (!invoiceId || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: "الفاتورة والمبلغ مطلوبان" });
      return;
    }
    const applyAmt = Math.round(Number(amount) * 100) / 100;

    let advance: any;
    try {
      [advance] = await rawQuery<any>(
        `SELECT id, "clientId", amount, "appliedAmount", "branchId", status
           FROM customer_advances WHERE id = $1 AND "companyId" = $2`,
        [advanceId, scope.companyId]
      );
    } catch {
      res.status(404).json({ error: "الدفعة المقدمة غير موجودة" });
      return;
    }
    if (!advance) { res.status(404).json({ error: "الدفعة المقدمة غير موجودة" }); return; }

    const remaining = Number(advance.amount) - Number(advance.appliedAmount);
    if (applyAmt > remaining + 0.01) {
      res.status(400).json({ error: `المبلغ يتجاوز المتبقي من الدفعة المقدمة (${remaining})` });
      return;
    }

    const [invoice] = await rawQuery<any>(
      `SELECT id, ref, "clientId", total, "paidAmount" FROM invoices
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(invoiceId), scope.companyId]
    );
    if (!invoice) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }
    if (invoice.clientId !== advance.clientId) {
      res.status(400).json({ error: "العميل في الفاتورة لا يطابق العميل في الدفعة المقدمة" });
      return;
    }
    const invoiceOpen = Number(invoice.total) - Number(invoice.paidAmount);
    if (applyAmt > invoiceOpen + 0.01) {
      res.status(400).json({ error: `المبلغ يتجاوز الرصيد المفتوح للفاتورة (${invoiceOpen})` });
      return;
    }

    const [advLiabCode, arCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "customer_advance_liability", "debit", "2400"),
      getAccountCodeFromMapping(scope.companyId, "invoice_ar", "credit", "1200"),
    ]);

    await withTransaction(async (client: any) => {
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
         WHERE id = $2`,
        [applyAmt, Number(invoiceId)]
      );
    });

    let journalId: number | null = null;
    try {
      journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: advance.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `ADV-APPLY-${advanceId}-${invoiceId}`,
        description: `تطبيق دفعة مقدمة على الفاتورة ${invoice.ref}`,
        lines: [
          { accountCode: advLiabCode, debit: applyAmt, credit: 0 },
          { accountCode: arCode, debit: 0, credit: applyAmt },
        ],
      });
    } catch (je) {
      console.error("Apply advance JE error:", je);
    }

    res.json({ advanceId, invoiceId: Number(invoiceId), amount: applyAmt, journalId });
  } catch (err) {
    handleRouteError(err, res, "Apply customer advance error:");
  }
});

invoicesRouter.get("/customer-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    const { clientId, status } = req.query as any;
    const params: any[] = [scope.companyId];
    let where = `"companyId" = $1`;
    if (clientId) { params.push(Number(clientId)); where += ` AND "clientId" = $${params.length}`; }
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    let rows: any[] = [];
    try {
      rows = await rawQuery<any>(
        `SELECT ca.id, ca.ref, ca.amount, ca."appliedAmount",
                (ca.amount - ca."appliedAmount") AS remaining,
                ca.method, ca."receivedDate", ca.status, ca."journalId", ca."createdAt",
                c.name AS "clientName"
           FROM customer_advances ca
           LEFT JOIN clients c ON c.id = ca."clientId"
          WHERE ${where}
          ORDER BY ca."receivedDate" DESC, ca.id DESC`,
        params
      );
    } catch { /* table not yet created */ }
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
  await rawExecute(`
    CREATE TABLE IF NOT EXISTS dunning_letters (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "invoiceId" INTEGER NOT NULL,
      "clientId" INTEGER,
      stage INTEGER NOT NULL,
      "daysPastDue" INTEGER NOT NULL,
      "outstandingAmount" NUMERIC(18,2) NOT NULL,
      "letterContent" TEXT,
      "sentAt" TIMESTAMP DEFAULT NOW(),
      "sentBy" INTEGER,
      "sentVia" VARCHAR(16) DEFAULT 'manual',
      status VARCHAR(16) DEFAULT 'sent'
    )
  `);
  await rawExecute(`
    CREATE INDEX IF NOT EXISTS idx_dunning_letters_invoice
      ON dunning_letters ("invoiceId")
  `);
  await rawExecute(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningStage" INTEGER DEFAULT 0
  `);
  await rawExecute(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningAt" TIMESTAMP
  `);
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
invoicesRouter.get("/dunning/preview", async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureDunningTables();
    const minDays = Number(req.query.minDaysPastDue ?? 1);
    const today = new Date().toISOString().slice(0, 10);

    const rows = await rawQuery<any>(
      `SELECT i.id, i."invoiceNumber", i."invoiceDate", i."dueDate",
              i.total, COALESCE(i."paidAmount",0) AS "paidAmount",
              i."clientId", i."lastDunningStage", i."lastDunningAt",
              c.name AS "clientName", c.email AS "clientEmail", c.phone AS "clientPhone",
              GREATEST(0, ($1::date - i."dueDate"::date))::int AS "daysPastDue"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
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
        const lastAt = new Date(r.lastDunningAt);
        const hoursSince = (Date.now() - lastAt.getTime()) / 36e5;
        if (hoursSince < 24) continue;
      }
      const outstanding = Math.round((Number(r.total) - Number(r.paidAmount)) * 100) / 100;
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
      totalOutstanding: Math.round(eligible.reduce((s, e) => s + e.outstanding, 0) * 100) / 100,
      invoices: eligible,
    });
  } catch (err) {
    handleRouteError(err, res, "Dunning preview error:");
  }
});

// Send dunning letters (record them)
invoicesRouter.post("/dunning/send", async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureDunningTables();
    const { invoiceIds, sentVia = "manual" } = req.body as any;
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      res.status(400).json({ error: "invoiceIds مطلوبة (قائمة معرفات الفواتير)" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const results: any[] = [];

    for (const invId of invoiceIds) {
      const [inv] = await rawQuery<any>(
        `SELECT i.id, i."invoiceNumber", i."invoiceDate", i."dueDate",
                i.total, COALESCE(i."paidAmount",0) AS "paidAmount", i."clientId",
                c.name AS "clientName"
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId"
         WHERE i.id=$1 AND i."companyId"=$2
           AND i.status NOT IN ('paid','cancelled')`,
        [Number(invId), scope.companyId]
      );
      if (!inv) { results.push({ invoiceId: invId, status: "skipped", reason: "not_found_or_paid" }); continue; }

      const days = Math.max(
        0,
        Math.floor((new Date(today).getTime() - new Date(inv.dueDate).getTime()) / 86400000)
      );
      const stg = stageFromDaysPastDue(days);
      if (!stg) { results.push({ invoiceId: invId, status: "skipped", reason: "not_past_due" }); continue; }

      const outstanding = Math.round((Number(inv.total) - Number(inv.paidAmount)) * 100) / 100;
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

      const [row] = await rawQuery<any>(
        `INSERT INTO dunning_letters
         ("companyId","invoiceId","clientId",stage,"daysPastDue","outstandingAmount","letterContent","sentBy","sentVia")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [scope.companyId, inv.id, inv.clientId, stg.stage, days, outstanding, letter, scope.activeAssignmentId, sentVia]
      );
      await rawExecute(
        `UPDATE invoices SET "lastDunningStage"=$1, "lastDunningAt"=NOW() WHERE id=$2`,
        [stg.stage, inv.id]
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
invoicesRouter.get("/dunning/history", async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureDunningTables();
    const { invoiceId, clientId, stage } = req.query as any;
    const params: any[] = [scope.companyId];
    let where = `dl."companyId"=$1`;
    if (invoiceId) { params.push(Number(invoiceId)); where += ` AND dl."invoiceId"=$${params.length}`; }
    if (clientId) { params.push(Number(clientId)); where += ` AND dl."clientId"=$${params.length}`; }
    if (stage) { params.push(Number(stage)); where += ` AND dl.stage=$${params.length}`; }

    const rows = await rawQuery<any>(
      `SELECT dl.*, i."invoiceNumber", c.name AS "clientName"
       FROM dunning_letters dl
       LEFT JOIN invoices i ON i.id = dl."invoiceId"
       LEFT JOIN clients c ON c.id = dl."clientId"
       WHERE ${where}
       ORDER BY dl."sentAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Dunning history error:");
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
