import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createJournalEntry,
  createAuditLog,
  emitEvent,
  createNotification,
} from "../lib/businessHelpers.js";
import { assertRole } from "../lib/roleGuards.js";
import { pushToDLQ } from "../lib/eventBus.js";

export const financeHardeningRouter = Router();
financeHardeningRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];
const CFO_ROLES = ["finance_manager", "general_manager", "owner"];

// ─────────────────────────────────────────────────────────────────────────────
// FISCAL PERIODS — FULL CRUD + OPEN/CLOSE/REOPEN
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/fiscal-periods-v2", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT fp.*,
              ea.id AS "closedByAssignmentId",
              e.name AS "closedByName"
       FROM financial_periods fp
       LEFT JOIN employee_assignments ea ON ea.id = fp."closedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE fp."companyId" = $1
       ORDER BY fp."startDate" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List fiscal periods error:");
  }
});

financeHardeningRouter.post("/fiscal-periods-v2", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, CFO_ROLES);
    const { name, startDate, endDate, notes } = req.body as any;
    if (!name || !startDate || !endDate) {
      throw new ValidationError("الاسم وتاريخ البداية والنهاية مطلوبة", {
        field: !name ? "name" : !startDate ? "startDate" : "endDate",
        fix: "أدخل اسم الفترة وتاريخي البداية والنهاية بصيغة YYYY-MM-DD",
      });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status,notes)
       VALUES ($1,$2,$3,$4,'open',$5)`,
      [scope.companyId, name, startDate, endDate, notes ?? null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM financial_periods WHERE id=$1`, [insertId]);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fiscal_period.created",
      entity: "financial_periods",
      entityId: insertId,
      details: JSON.stringify({ name, startDate, endDate }),
    }).catch((err) => pushToDLQ("event", { action: "fiscal_period.created", entityId: insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "financial_periods",
      entityId: insertId,
      after: { name, startDate, endDate },
    }).catch((err) => console.error("[audit] fiscal_period.created:", err));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create fiscal period error:");
  }
});

financeHardeningRouter.post("/fiscal-periods-v2/:id/close", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, CFO_ROLES);
    const { id } = req.params;
    const { notes } = req.body as any;

    const [period] = await rawQuery<any>(
      `SELECT * FROM financial_periods WHERE id=$1 AND "companyId"=$2`,
      [Number(id), scope.companyId]
    );
    if (!period) throw new NotFoundError("الفترة غير موجودة");
    if (period.status === "closed") {
      throw new ConflictError("الفترة مُقفلة مسبقاً", {
        field: "status",
        fix: "لا يمكن إقفال فترة مُقفلة بالفعل",
        meta: { currentStatus: period.status },
      });
    }

    const pendingJournals = await rawQuery<any>(
      `SELECT id FROM journal_entries
       WHERE "companyId"=$1 AND "deletedAt" IS NULL
         AND "createdAt"::date BETWEEN $2 AND $3
         AND ("approvalStatus" IS NULL OR "approvalStatus" IN ('draft','pending_review'))
         AND "isManual" = TRUE
       LIMIT 5`,
      [scope.companyId, period.startDate, period.endDate]
    );
    if (pendingJournals.length > 0) {
      throw new ConflictError(
        `لا يمكن إقفال الفترة: يوجد ${pendingJournals.length} قيد يدوي لم يُرحّل بعد`,
        {
          field: "journalEntries",
          fix: "ارحّل أو احذف القيود اليدوية المعلّقة قبل إقفال الفترة",
          meta: { pendingCount: pendingJournals.length },
        },
      );
    }

    await rawExecute(
      `UPDATE financial_periods SET status='closed', "closedAt"=NOW(), "closedBy"=$1, notes=COALESCE($2,notes), "updatedAt"=NOW()
       WHERE id=$3`,
      [scope.activeAssignmentId, notes ?? null, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fiscal_period.closed",
      entity: "financial_periods",
      entityId: Number(id),
      after: JSON.stringify({ name: period.name, notes }),
    }).catch((err) => pushToDLQ("event", { action: "fiscal_period.closed", entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fiscal_period.close", entity: "financial_periods", entityId: Number(id),
      after: { status: "closed", notes },
    }).catch(console.error);

    res.json({ message: `تم إقفال الفترة المالية "${period.name}" بنجاح`, periodId: Number(id), status: "closed" });
  } catch (err) {
    handleRouteError(err, res, "Close fiscal period error:");
  }
});

financeHardeningRouter.post("/fiscal-periods-v2/:id/reopen", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["general_manager", "owner"]);
    const { id } = req.params;
    const { reason } = req.body as any;
    if (!reason) {
      throw new ValidationError("سبب فتح الفترة مطلوب", {
        field: "reason",
        fix: "اكتب سبب إعادة فتح الفترة المالية",
      });
    }

    const [period] = await rawQuery<any>(
      `SELECT * FROM financial_periods WHERE id=$1 AND "companyId"=$2`,
      [Number(id), scope.companyId]
    );
    if (!period) throw new NotFoundError("الفترة غير موجودة");
    if (period.status !== "closed") {
      throw new ConflictError("الفترة غير مُقفلة", {
        field: "status",
        fix: "لا يمكن إعادة فتح فترة غير مُقفلة",
        meta: { currentStatus: period.status },
      });
    }

    await rawExecute(
      `UPDATE financial_periods SET status='open', "reopenedAt"=NOW(), "reopenedBy"=$1, "reopenReason"=$2, "updatedAt"=NOW()
       WHERE id=$3`,
      [scope.activeAssignmentId, reason, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fiscal_period.reopened",
      entity: "financial_periods",
      entityId: Number(id),
      details: JSON.stringify({ name: period.name, reason }),
    }).catch((err) => pushToDLQ("event", { action: "fiscal_period.reopened", entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fiscal_period.reopen", entity: "financial_periods", entityId: Number(id),
      after: { status: "open", reason },
    }).catch(console.error);

    res.json({ message: `تم إعادة فتح الفترة المالية "${period.name}"`, reason });
  } catch (err) {
    handleRouteError(err, res, "Reopen fiscal period error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL JOURNAL APPROVAL WORKFLOW
// draft → pending_review → approved → posted
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.post("/journal-manual", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { description, lines, costCenter, notes } = req.body as any;
    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      throw new ValidationError("القيد يجب أن يحتوي على سطرين على الأقل", {
        field: "lines",
        fix: "أرسل سطرين أو أكثر بحيث يكون مجموع المدين = مجموع الدائن",
      });
    }

    const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new ValidationError(
        `القيد غير متوازن: مدين ${totalDebit.toFixed(2)}، دائن ${totalCredit.toFixed(2)}`,
        {
          field: "lines",
          fix: "تأكد من تساوي مجموع المدين مع مجموع الدائن",
          meta: { totalDebit, totalCredit, diff: totalDebit - totalCredit },
        },
      );
    }

    const ref = `MJE-${Date.now()}`;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description: description ?? "قيد يدوي",
      lines,
    });

    await rawExecute(
      `UPDATE journal_entries SET "approvalStatus"='draft', "isManual"=TRUE, "costCenter"=$1 WHERE id=$2`,
      [costCenter ?? null, journalId]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.manual_created",
      entity: "journal_entries",
      entityId: journalId,
      details: JSON.stringify({ ref, totalDebit, lines: lines.length }),
    }).catch((err) => pushToDLQ("event", { action: "journal.manual_created", entityId: journalId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "journal_entries",
      entityId: journalId,
      after: { ref, totalDebit, lineCount: lines.length, approvalStatus: "draft", isManual: true },
    }).catch((err) => console.error("[audit] journal.manual_created:", err));

    res.status(201).json({
      id: journalId, ref, description, totalDebit, totalCredit,
      approvalStatus: "draft", isManual: true,
      message: "تم إنشاء القيد اليدوي بحالة مسودة — يحتاج مراجعة واعتماد قبل الترحيل",
    });
  } catch (err) {
    handleRouteError(err, res, "Create manual journal error:");
  }
});

financeHardeningRouter.get("/journal-manual", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`je."companyId"=$1`, `je."isManual"=TRUE`, `je."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`je."approvalStatus"=$${params.length}`); }

    const rows = await rawQuery<any>(
      `SELECT je.*, json_agg(jl.*) AS lines,
              e_rev.name AS "reviewedByName",
              e_apr.name AS "approvedByName",
              e_cre.name AS "createdByName"
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId"=je.id
       LEFT JOIN employee_assignments ea_rev ON ea_rev.id=je."reviewedBy"
       LEFT JOIN employees e_rev ON e_rev.id=ea_rev."employeeId"
       LEFT JOIN employee_assignments ea_apr ON ea_apr.id=je."approvedBy"
       LEFT JOIN employees e_apr ON e_apr.id=ea_apr."employeeId"
       LEFT JOIN employee_assignments ea_cre ON ea_cre.id=je."createdBy"
       LEFT JOIN employees e_cre ON e_cre.id=ea_cre."employeeId"
       WHERE ${conditions.join(" AND ")}
       GROUP BY je.id, e_rev.name, e_apr.name, e_cre.name
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List manual journals error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/submit", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { id } = req.params;
    const [je] = await rawQuery<any>(`SELECT * FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!je) throw new NotFoundError("القيد غير موجود");
    if (je.approvalStatus !== "draft") {
      throw new ConflictError(
        `لا يمكن إرسال قيد بحالة "${je.approvalStatus}"`,
        {
          field: "approvalStatus",
          fix: "فقط القيود في حالة draft يمكن إرسالها للمراجعة",
          meta: { currentStatus: je.approvalStatus, expected: "draft" },
        },
      );
    }
    await rawExecute(`UPDATE journal_entries SET "approvalStatus"='pending_review', "updatedAt"=NOW() WHERE id=$1`, [Number(id)]);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.submitted_for_review",
      entity: "journal_entries",
      entityId: Number(id),
      after: JSON.stringify({ ref: je.ref }),
    }).catch((err) => pushToDLQ("event", { action: "journal.submitted_for_review", entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "submit",
      entity: "journal_entries",
      entityId: Number(id),
      after: { from: "draft", to: "pending_review", ref: je.ref },
    }).catch((err) => console.error("[audit] journal.submitted_for_review:", err));

    res.json({ message: "تم إرسال القيد للمراجعة", approvalStatus: "pending_review" });
  } catch (err) {
    handleRouteError(err, res, "Submit manual journal error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/review", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { id } = req.params;
    const { approved, notes } = req.body as any;
    const [je] = await rawQuery<any>(`SELECT * FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!je) throw new NotFoundError("القيد غير موجود");
    if (je.approvalStatus !== "pending_review") {
      throw new ConflictError("القيد ليس في مرحلة المراجعة", {
        field: "approvalStatus",
        fix: "فقط القيود بحالة pending_review يمكن مراجعتها",
        meta: { currentStatus: je.approvalStatus, expected: "pending_review" },
      });
    }

    if (Number(je.createdBy) === scope.activeAssignmentId) {
      throw new ForbiddenError(
        "لا يمكن للمنشئ مراجعة قيده الخاص — يجب مراجعة محاسب آخر",
        {
          fix: "اطلب من محاسب آخر مراجعة هذا القيد",
          meta: { reviewerAssignmentId: scope.activeAssignmentId, createdBy: je.createdBy },
        },
      );
    }

    if (!approved && !notes) {
      throw new ValidationError("يجب ذكر سبب الرفض", {
        field: "notes",
        fix: "اكتب سبب رفض القيد لإفادة المنشئ",
      });
    }

    const newStatus = approved ? "approved" : "rejected";
    await rawExecute(
      `UPDATE journal_entries SET "approvalStatus"=$1, "reviewedBy"=$2, "reviewedAt"=NOW(), "approvalNotes"=$3, "updatedAt"=NOW() WHERE id=$4`,
      [newStatus, scope.activeAssignmentId, notes ?? null, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: `journal.reviewed_${newStatus}`,
      entity: "journal_entries",
      entityId: Number(id),
      after: JSON.stringify({ ref: je.ref, notes }),
    }).catch((err) => pushToDLQ("event", { action: `journal.reviewed_${newStatus}`, entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "review",
      entity: "journal_entries",
      entityId: Number(id),
      after: { from: "pending_review", to: newStatus, notes, ref: je.ref },
    }).catch((err) => console.error("[audit] journal.review:", err));

    res.json({ message: approved ? "تمت المراجعة والموافقة" : "تم رفض القيد", approvalStatus: newStatus });
  } catch (err) {
    handleRouteError(err, res, "Review manual journal error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["finance_manager", "general_manager", "owner"]);
    const { id } = req.params;
    const { approved, notes } = req.body as any;
    const [je] = await rawQuery<any>(`SELECT * FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!je) throw new NotFoundError("القيد غير موجود");
    if (je.approvalStatus !== "approved" && je.approvalStatus !== "pending_review") {
      throw new ConflictError(
        `لا يمكن اعتماد قيد بحالة "${je.approvalStatus}"`,
        {
          field: "approvalStatus",
          fix: "فقط القيود بحالة pending_review أو approved يمكن اعتمادها",
          meta: { currentStatus: je.approvalStatus },
        },
      );
    }
    if (!approved && !notes) {
      throw new ValidationError("يجب ذكر سبب الرفض", {
        field: "notes",
        fix: "اكتب سبب رفض الاعتماد",
      });
    }
    const newStatus = approved ? "approved" : "rejected";
    await rawExecute(
      `UPDATE journal_entries SET "approvalStatus"=$1, "approvedBy"=$2, "approvedAt"=NOW(), "approvalNotes"=COALESCE($3,"approvalNotes"), "updatedAt"=NOW() WHERE id=$4`,
      [newStatus, scope.activeAssignmentId, notes ?? null, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: `journal.approved_${newStatus}`,
      entity: "journal_entries",
      entityId: Number(id),
      after: JSON.stringify({ ref: je.ref, notes }),
    }).catch((err) => pushToDLQ("event", { action: `journal.approved_${newStatus}`, entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "approve",
      entity: "journal_entries",
      entityId: Number(id),
      after: { from: je.approvalStatus, to: newStatus, notes, ref: je.ref },
    }).catch((err) => console.error("[audit] journal.approve:", err));

    res.json({ message: approved ? "تمت الموافقة على القيد" : "تم رفض القيد", approvalStatus: newStatus });
  } catch (err) {
    handleRouteError(err, res, "Approve manual journal error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/post", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["finance_manager", "general_manager", "owner"]);
    const { id } = req.params;
    const [je] = await rawQuery<any>(`SELECT * FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!je) throw new NotFoundError("القيد غير موجود");
    if (je.approvalStatus !== "approved") {
      throw new ConflictError(
        "لا يمكن ترحيل قيد يدوي لم يُعتمد بعد — يجب أن يكون القيد بحالة معتمد",
        {
          field: "approvalStatus",
          fix: "اعتمد القيد قبل ترحيله",
          meta: { currentStatus: je.approvalStatus, expected: "approved" },
        },
      );
    }
    await rawExecute(
      `UPDATE journal_entries SET "approvalStatus"='posted', status='posted', "postedAt"=NOW(), "postedBy"=$1, "updatedAt"=NOW() WHERE id=$2`,
      [scope.activeAssignmentId, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.posted",
      entity: "journal_entries",
      entityId: Number(id),
      after: JSON.stringify({ ref: je.ref }),
    }).catch((err) => pushToDLQ("event", { action: "journal.posted", entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "journal.posted", entity: "journal_entries", entityId: Number(id),
      after: { approvalStatus: "posted" },
    }).catch(console.error);
    res.json({ message: "تم ترحيل القيد اليدوي بنجاح", approvalStatus: "posted" });
  } catch (err) {
    handleRouteError(err, res, "Post manual journal error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BANK GUARANTEES
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/bank-guarantees", async (req, res) => {
  try {
    const scope = req.scope!;
    const today = new Date().toISOString().split("T")[0];
    const rows = await rawQuery<any>(
      `SELECT bg.*,
              (bg."expiryDate"::date - CURRENT_DATE) AS "daysToExpiry",
              CASE
                WHEN bg.status != 'active' THEN bg.status
                WHEN bg."expiryDate"::date < CURRENT_DATE THEN 'expired'
                WHEN bg."expiryDate"::date - CURRENT_DATE <= 7 THEN 'expiring_7'
                WHEN bg."expiryDate"::date - CURRENT_DATE <= 14 THEN 'expiring_14'
                WHEN bg."expiryDate"::date - CURRENT_DATE <= 30 THEN 'expiring_30'
                ELSE 'active'
              END AS "alertStatus"
       FROM bank_guarantees bg
       WHERE bg."companyId"=$1
       ORDER BY bg."expiryDate" ASC`,
      [scope.companyId]
    );

    const summary = {
      total: rows.length,
      totalAmount: rows.filter((r: any) => r.status === 'active').reduce((s: number, r: any) => s + Number(r.amount), 0),
      expiring30: rows.filter((r: any) => ['expiring_7', 'expiring_14', 'expiring_30'].includes(r.alertStatus)).length,
      expired: rows.filter((r: any) => r.alertStatus === 'expired').length,
    };

    res.json({ data: rows, summary });
  } catch (err) {
    handleRouteError(err, res, "List bank guarantees error:");
  }
});

financeHardeningRouter.post("/bank-guarantees", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { ref, bank, beneficiary, amount, issueDate, expiryDate, guaranteeType, notes, attachmentUrl, branchId } = req.body as any;
    if (!ref || !bank || !beneficiary || !amount || !issueDate || !expiryDate) {
      throw new ValidationError(
        "رقم الضمان والبنك والجهة المستفيدة والمبلغ والتواريخ مطلوبة",
        {
          field: !ref ? "ref" : !bank ? "bank" : !beneficiary ? "beneficiary" : !amount ? "amount" : !issueDate ? "issueDate" : "expiryDate",
          fix: "أكمل جميع الحقول الأساسية للضمان البنكي",
        },
      );
    }
    const { insertId } = await rawExecute(
      `INSERT INTO bank_guarantees ("companyId","branchId",ref,bank,beneficiary,amount,"issueDate","expiryDate","guaranteeType",notes,"attachmentUrl","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [scope.companyId, branchId ?? scope.branchId, ref, bank, beneficiary, Number(amount), issueDate, expiryDate, guaranteeType ?? "performance", notes ?? null, attachmentUrl ?? null, scope.activeAssignmentId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM bank_guarantees WHERE id=$1`, [insertId]);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bank_guarantee.created",
      entity: "bank_guarantees",
      entityId: insertId,
      details: JSON.stringify({ ref, bank, amount: Number(amount) }),
    }).catch((err) => pushToDLQ("event", { action: "bank_guarantee.created", entityId: insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "bank_guarantees",
      entityId: insertId,
      after: { ref, bank, amount: Number(amount), expiryDate },
    }).catch((err) => console.error("[audit] bank_guarantee.created:", err));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create bank guarantee error:");
  }
});

financeHardeningRouter.patch("/bank-guarantees/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { id } = req.params;
    const b = req.body as any;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    const f = (col: string, val: any) => { if (val !== undefined) { params.push(val); sets.push(`"${col}"=$${params.length}`); } };
    f("bank", b.bank); f("beneficiary", b.beneficiary); f("amount", b.amount);
    f("expiryDate", b.expiryDate); f("status", b.status); f("notes", b.notes);
    f("attachmentUrl", b.attachmentUrl); f("guaranteeType", b.guaranteeType);
    if (sets.length === 1) {
      throw new ValidationError("لا توجد تغييرات", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    params.push(Number(id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE bank_guarantees SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("الضمان غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bank_guarantee.updated",
      entity: "bank_guarantees",
      entityId: Number(id),
      details: JSON.stringify({ fields: Object.keys(b) }),
    }).catch((err) => pushToDLQ("event", { action: "bank_guarantee.updated", entityId: Number(id) }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "bank_guarantees",
      entityId: Number(id),
      after: { fields: Object.keys(b) },
    }).catch((err) => console.error("[audit] bank_guarantee.updated:", err));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Update bank guarantee error:");
  }
});

financeHardeningRouter.delete("/bank-guarantees/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const guaranteeId = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT id, ref, bank, status, amount FROM bank_guarantees WHERE id=$1 AND "companyId"=$2`,
      [guaranteeId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الضمان غير موجود");

    // Refuse delete on active guarantees — they have legal obligation backing.
    if (existing.status === "active") {
      throw new ConflictError(
        "لا يمكن حذف ضمان بنكي ساري — قم بإلغائه أو إنهائه أولاً",
        {
          field: "status",
          fix: "غيّر حالة الضمان إلى cancelled أو released قبل الحذف",
          meta: { currentStatus: existing.status, ref: existing.ref },
        },
      );
    }

    const [row] = await rawQuery<any>(
      `DELETE FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 RETURNING id`,
      [guaranteeId, scope.companyId]
    );
    if (!row) throw new NotFoundError("الضمان غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "bank_guarantee.deleted",
      entity: "bank_guarantees",
      entityId: guaranteeId,
      details: JSON.stringify({ ref: existing.ref, bank: existing.bank }),
    }).catch((err) => pushToDLQ("event", { action: "bank_guarantee.deleted", entityId: guaranteeId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "delete",
      entity: "bank_guarantees",
      entityId: guaranteeId,
      after: { ref: existing.ref, bank: existing.bank, amount: Number(existing.amount), hardDelete: true },
    }).catch((err) => console.error("[audit] bank_guarantee.deleted:", err));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete bank guarantee error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERCOMPANY TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/intercompany", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT ic.*,
              fc.name AS "fromCompanyName",
              tc.name AS "toCompanyName"
       FROM intercompany_transactions ic
       LEFT JOIN companies fc ON fc.id=ic."fromCompanyId"
       LEFT JOIN companies tc ON tc.id=ic."toCompanyId"
       WHERE ic."fromCompanyId"=$1 OR ic."toCompanyId"=$1
       ORDER BY ic."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List intercompany transactions error:");
  }
});

financeHardeningRouter.post("/intercompany", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["general_manager", "owner"]);
    const { toCompanyId, amount, description, transactionDate, arAccountCode = "1200", apAccountCode = "2100", revenueAccountCode = "4000", expenseAccountCode = "5000" } = req.body as any;

    if (!toCompanyId || !amount) {
      throw new ValidationError("الشركة المستلمة والمبلغ مطلوبان", {
        field: !toCompanyId ? "toCompanyId" : "amount",
        fix: "اختر شركة مستلمة وحدّد مبلغ المعاملة",
      });
    }
    if (Number(toCompanyId) === scope.companyId) {
      throw new ValidationError("لا يمكن إنشاء معاملة بين الشركة ونفسها", {
        field: "toCompanyId",
        fix: "اختر شركة مختلفة عن الشركة الحالية",
      });
    }
    if (!scope.allowedCompanies?.includes(Number(toCompanyId))) {
      throw new ForbiddenError("ليس لديك صلاحية على الشركة المستلمة", {
        fix: "تأكد من أن لديك تعييناً نشطاً على الشركة المستلمة",
        meta: { toCompanyId: Number(toCompanyId), allowedCompanies: scope.allowedCompanies ?? [] },
      });
    }

    const ref = `IC-${Date.now()}`;
    const txDate = transactionDate ?? new Date().toISOString().split("T")[0];
    let fromJournalId!: number;
    let toJournalId!: number;

    await withTransaction(async (client) => {
      const jeFrom = await client.query(
        `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type)
         VALUES ($1,$2,$3,$4,$5,'intercompany') RETURNING id`,
        [scope.companyId, scope.branchId, scope.activeAssignmentId, ref, description ?? `معاملة بين الشركات ${ref}`]
      );
      fromJournalId = jeFrom.rows[0].id;
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,$3,0,'ذمم مدينة شركة شقيقة')`,
        [fromJournalId, arAccountCode, Number(amount)]
      );
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,0,$3,'إيراد شركة شقيقة')`,
        [fromJournalId, revenueAccountCode, Number(amount)]
      );

      const jeTo = await client.query(
        `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type)
         VALUES ($1,$2,$3,$4,$5,'intercompany') RETURNING id`,
        [Number(toCompanyId), scope.branchId, scope.activeAssignmentId, ref, description ?? `معاملة بين الشركات ${ref}`]
      );
      toJournalId = jeTo.rows[0].id;
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,$3,0,'مصروف شركة شقيقة')`,
        [toJournalId, expenseAccountCode, Number(amount)]
      );
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,0,$3,'ذمم دائنة شركة شقيقة')`,
        [toJournalId, apAccountCode, Number(amount)]
      );

      await client.query(
        `INSERT INTO intercompany_transactions (ref,"fromCompanyId","toCompanyId",amount,description,"transactionDate",status,"fromJournalId","toJournalId","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,'posted',$7,$8,$9)`,
        [ref, scope.companyId, Number(toCompanyId), Number(amount), description ?? null, txDate, fromJournalId, toJournalId, scope.activeAssignmentId]
      );
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "intercompany.created",
      entity: "intercompany_transactions",
      entityId: fromJournalId, // primary fromCompany journal id is the canonical reference
      details: JSON.stringify({ ref, toCompanyId: Number(toCompanyId), amount: Number(amount), fromJournalId, toJournalId }),
    }).catch((err) => pushToDLQ("event", { action: "intercompany.created", entityId: fromJournalId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "intercompany_transactions",
      entityId: fromJournalId,
      after: { ref, toCompanyId: Number(toCompanyId), amount: Number(amount), txDate },
    }).catch((err) => console.error("[audit] intercompany.created:", err));

    res.status(201).json({
      ref, fromJournalId, toJournalId, amount: Number(amount),
      message: `تم تسجيل المعاملة البينية ${ref} وإنشاء قيدين محاسبيين`,
    });
  } catch (err) {
    handleRouteError(err, res, "Create intercompany transaction error:");
  }
});

financeHardeningRouter.get("/intercompany/consolidation", async (req, res) => {
  try {
    const scope = req.scope!;
    const companies = scope.allowedCompanies ?? [scope.companyId];

    const [balanceSheet] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN coa.type='asset' THEN jl.debit - jl.credit ELSE 0 END),0) AS "totalAssets",
         COALESCE(SUM(CASE WHEN coa.type='liability' THEN jl.credit - jl.debit ELSE 0 END),0) AS "totalLiabilities",
         COALESCE(SUM(CASE WHEN coa.type='equity' THEN jl.credit - jl.debit ELSE 0 END),0) AS "totalEquity"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl."journalId"
       JOIN chart_of_accounts coa ON coa.code=jl."accountCode" AND coa."companyId"=je."companyId"
       WHERE je."companyId" = ANY($1) AND je."deletedAt" IS NULL AND je.type != 'intercompany'`,
      [companies]
    );

    const intercompanyTotal = await rawQuery<any>(
      `SELECT SUM(amount) AS total FROM intercompany_transactions
       WHERE ("fromCompanyId" = ANY($1) OR "toCompanyId" = ANY($1)) AND status='posted'`,
      [companies]
    );

    const byCompany = await rawQuery<any>(
      `SELECT je."companyId", c.name AS "companyName",
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit ELSE 0 END),0) AS expenses
       FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl."journalId"
       JOIN chart_of_accounts coa ON coa.code=jl."accountCode" AND coa."companyId"=je."companyId"
       JOIN companies c ON c.id=je."companyId"
       WHERE je."companyId" = ANY($1) AND je."deletedAt" IS NULL
       GROUP BY je."companyId", c.name`,
      [companies]
    );

    res.json({
      consolidatedBalance: balanceSheet,
      intercompanyElimination: Number(intercompanyTotal[0]?.total ?? 0),
      byCompany,
    });
  } catch (err) {
    handleRouteError(err, res, "Consolidation report error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/projects", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT p.*,
              COALESCE(SUM(jl.debit),0) AS "actualCost",
              p.budget - COALESCE(SUM(jl.debit),0) AS "budgetRemaining"
       FROM projects p
       LEFT JOIN journal_entries je ON je."projectId"=p.id AND je."deletedAt" IS NULL
       LEFT JOIN journal_lines jl ON jl."journalId"=je.id AND jl.debit > 0
       WHERE p."companyId"=$1
       GROUP BY p.id
       ORDER BY p."createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List projects error:");
  }
});

financeHardeningRouter.post("/projects", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { name, description, budget, startDate, endDate, branchId, ref } = req.body as any;
    if (!name) {
      throw new ValidationError("اسم المشروع مطلوب", {
        field: "name",
        fix: "أدخل اسم المشروع",
      });
    }
    const projectRef = ref ?? `PRJ-${Date.now()}`;
    const { insertId } = await rawExecute(
      `INSERT INTO projects ("companyId","branchId",ref,name,description,budget,"startDate","endDate","managerId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, branchId ?? scope.branchId, projectRef, name, description ?? null, Number(budget ?? 0), startDate ?? null, endDate ?? null, scope.activeAssignmentId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1`, [insertId]);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "finance_project.created",
      entity: "projects",
      entityId: insertId,
      details: JSON.stringify({ ref: projectRef, name, budget: Number(budget ?? 0) }),
    }).catch((err) => pushToDLQ("event", { action: "finance_project.created", entityId: insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "projects",
      entityId: insertId,
      after: { ref: projectRef, name, budget: Number(budget ?? 0), startDate, endDate },
    }).catch((err) => console.error("[audit] finance_project.created:", err));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create project error:");
  }
});

financeHardeningRouter.get("/projects/:id/costs", async (req, res) => {
  try {
    const scope = req.scope!;
    const [project] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!project) throw new NotFoundError("المشروع غير موجود");

    const costs = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt" AS date,
              COALESCE(SUM(jl.debit),0) AS amount,
              je."costCenter", je."operationType"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId"=je.id AND jl.debit > 0
       WHERE je."projectId"=$1 AND je."companyId"=$2 AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC`,
      [Number(req.params.id), scope.companyId]
    );

    const totalCost = costs.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const budgetRemaining = Number(project.budget ?? 0) - totalCost;
    const usagePct = project.budget > 0 ? Math.round((totalCost / project.budget) * 100) : 0;

    res.json({
      project,
      costs,
      summary: { totalCost, budget: Number(project.budget ?? 0), budgetRemaining, usagePct },
    });
  } catch (err) {
    handleRouteError(err, res, "Project costs error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CASH FLOW FORECAST
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/cash-flow-forecast", async (req, res) => {
  try {
    const scope = req.scope!;
    const today = new Date();

    const inflow30 = await rawQuery<any>(
      `SELECT i.ref, i.total - i."paidAmount" AS expected, i."dueDate", c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id=i."clientId"
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY i."dueDate"`,
      [scope.companyId]
    );

    const inflow60 = await rawQuery<any>(
      `SELECT i.ref, i.total - i."paidAmount" AS expected, i."dueDate", c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id=i."clientId"
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '60 days'
       ORDER BY i."dueDate"`,
      [scope.companyId]
    );

    const inflow90 = await rawQuery<any>(
      `SELECT i.ref, i.total - i."paidAmount" AS expected, i."dueDate", c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id=i."clientId"
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" BETWEEN CURRENT_DATE + INTERVAL '61 days' AND CURRENT_DATE + INTERVAL '90 days'
       ORDER BY i."dueDate"`,
      [scope.companyId]
    );

    const outflow30 = await rawQuery<any>(
      `SELECT po.ref, po."totalAmount" AS expected, po."expectedDelivery" AS "dueDate", s.name AS "supplierName", 'purchase_order' AS type
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id=po."supplierId"
       WHERE po."companyId"=$1 AND po.status IN ('approved','pending')
         AND po."expectedDelivery" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       UNION ALL
       SELECT 'PAYROLL' AS ref, COALESCE(SUM(em."baseSalary"),0) AS expected,
              (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date AS "dueDate",
              'رواتب الموظفين' AS "supplierName", 'payroll' AS type
       FROM employee_assignments ea
       JOIN employees em ON em.id=ea."employeeId"
       WHERE ea."companyId"=$1 AND ea.status='active' AND em."baseSalary" IS NOT NULL
       GROUP BY 1,3,4,5`,
      [scope.companyId]
    );

    const [cashBalance] = await rawQuery<any>(
      `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl."journalId"
       WHERE je."companyId"=$1 AND je."deletedAt" IS NULL AND jl."accountCode" LIKE '11%'`,
      [scope.companyId]
    );

    const currentBalance = Number(cashBalance?.balance ?? 0);
    const totalInflow30 = inflow30.reduce((s: number, r: any) => s + Number(r.expected), 0);
    const totalInflow60 = inflow60.reduce((s: number, r: any) => s + Number(r.expected), 0);
    const totalInflow90 = inflow90.reduce((s: number, r: any) => s + Number(r.expected), 0);
    const totalOutflow30 = outflow30.reduce((s: number, r: any) => s + Number(r.expected), 0);

    res.json({
      currentBalance,
      forecast: {
        days30: { inflow: totalInflow30, outflow: totalOutflow30, net: totalInflow30 - totalOutflow30, projected: currentBalance + totalInflow30 - totalOutflow30 },
        days60: { inflow: totalInflow30 + totalInflow60, outflow: totalOutflow30, net: (totalInflow30 + totalInflow60) - totalOutflow30, projected: currentBalance + (totalInflow30 + totalInflow60) - totalOutflow30 },
        days90: { inflow: totalInflow30 + totalInflow60 + totalInflow90, outflow: totalOutflow30, net: (totalInflow30 + totalInflow60 + totalInflow90) - totalOutflow30, projected: currentBalance + (totalInflow30 + totalInflow60 + totalInflow90) - totalOutflow30 },
      },
      inflows: { next30: inflow30, next60: inflow60, next90: inflow90 },
      outflows: { next30: outflow30 },
    });
  } catch (err) {
    handleRouteError(err, res, "Cash flow forecast error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COST CENTER REPORT
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/cost-center-report", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, costCenter } = req.query as any;
    const conditions = [`je."companyId"=$1`, `je."deletedAt" IS NULL`, `je."costCenter" IS NOT NULL`];
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); conditions.push(`je."createdAt"::date >= $${params.length}`); }
    if (endDate) { params.push(endDate); conditions.push(`je."createdAt"::date <= $${params.length}`); }
    if (costCenter) { params.push(costCenter); conditions.push(`je."costCenter"=$${params.length}`); }

    const rows = await rawQuery<any>(
      `SELECT
         je."costCenter",
         COUNT(DISTINCT je.id) AS "entryCount",
         COALESCE(SUM(jl.debit),0) AS "totalDebit",
         COALESCE(SUM(jl.credit),0) AS "totalCredit",
         COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit ELSE 0 END),0) AS "totalExpenses",
         COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit ELSE 0 END),0) AS "totalRevenue"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId"=je.id
       LEFT JOIN chart_of_accounts coa ON coa.code=jl."accountCode" AND coa."companyId"=je."companyId"
       WHERE ${conditions.join(" AND ")}
       GROUP BY je."costCenter"
       ORDER BY "totalExpenses" DESC`,
      params
    );

    const costCenterDetails = costCenter ? await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt" AS date,
              COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId"=je.id
       WHERE je."companyId"=$1 AND je."costCenter"=$2 AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 50`,
      [scope.companyId, costCenter]
    ) : [];

    res.json({ data: rows, details: costCenterDetails, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Cost center report error:");
  }
});

export default financeHardeningRouter;
