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
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  createAuditLog,
  emitEvent,
  todayISO,
} from "../lib/businessHelpers.js";

import { pushToDLQ } from "../lib/eventBus.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

export const financeHardeningRouter = Router();
financeHardeningRouter.use(authMiddleware);

// ── Zod schemas ─────────────────────────────────────────────────────────────

const createFiscalPeriodSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  notes: z.string().optional(),
});

const closeFiscalPeriodSchema = z.object({
  notes: z.string().optional(),
});

const reopenFiscalPeriodSchema = z.object({
  reason: z.string().min(1),
});

const journalLineSchema = z.object({
  accountCode: z.string(),
  debit: z.coerce.number().default(0),
  credit: z.coerce.number().default(0),
  description: z.string().optional(),
  costCenter: z.string().optional(),
  departmentId: z.coerce.number().optional(),
  projectId: z.coerce.number().optional(),
  employeeId: z.coerce.number().optional(),
});

const createManualJournalSchema = z.object({
  description: z.string().optional(),
  lines: z.array(journalLineSchema).min(2),
  costCenter: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().optional(),
});

const reviewJournalSchema = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});

const approveJournalSchema = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});

const createBankGuaranteeSchema = z.object({
  ref: z.string().min(1),
  bank: z.string().min(1),
  beneficiary: z.string().min(1),
  amount: z.coerce.number(),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  guaranteeType: z.string().optional(),
  notes: z.string().optional(),
  attachmentUrl: z.string().optional(),
  branchId: z.coerce.number().optional(),
});

const updateBankGuaranteeSchema = z.object({
  bank: z.string().optional(),
  beneficiary: z.string().optional(),
  amount: z.coerce.number().optional(),
  expiryDate: z.string().optional(),
  status: z.enum(["active", "expired", "released", "renewed", "cancelled"]).optional(),
  notes: z.string().optional(),
  attachmentUrl: z.string().optional(),
  guaranteeType: z.string().optional(),
});

const cancelBankGuaranteeSchema = z.object({
  reason: z.string().min(1),
});

const releaseBankGuaranteeSchema = z.object({
  notes: z.string().optional(),
});

const createIntercompanySchema = z.object({
  toCompanyId: z.coerce.number(),
  amount: z.coerce.number(),
  description: z.string().optional(),
  transactionDate: z.string().optional(),
  arAccountCode: z.string().default("1200"),
  apAccountCode: z.string().default("2100"),
  revenueAccountCode: z.string().default("4000"),
  expenseAccountCode: z.string().default("5000"),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  budget: z.coerce.number().default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  branchId: z.coerce.number().optional(),
  ref: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// FISCAL PERIODS — FULL CRUD + OPEN/CLOSE/REOPEN
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/fiscal-periods-v2", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT fp.*,
              ea.id AS "closedByAssignmentId",
              e.name AS "closedByName"
       FROM financial_periods fp
       LEFT JOIN employee_assignments ea ON ea.id = fp."closedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE fp."companyId" = $1 AND fp."deletedAt" IS NULL
       ORDER BY fp."startDate" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List fiscal periods error:");
  }
});

financeHardeningRouter.post("/fiscal-periods-v2", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { name, startDate, endDate, notes } = zodParse(createFiscalPeriodSchema.safeParse(req.body ?? {}));
    const { insertId } = await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status,notes)
       VALUES ($1,$2,$3,$4,'open',$5)`,
      [scope.companyId, name, startDate, endDate, notes ?? null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM financial_periods WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

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
    }).catch((err) => logger.error(err, "[audit] fiscal_period.created:"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create fiscal period error:");
  }
});

financeHardeningRouter.post("/fiscal-periods-v2/:id/close", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const periodId = parseId(req.params.id, "id");
    const { notes } = zodParse(closeFiscalPeriodSchema.safeParse(req.body ?? {}));

    // Pre-flight: refuse close when the period still has unposted manual
    // journals. The business rule lives here (not in applyTransition) so we
    // can surface a ConflictError with structured `pendingCount` meta.
    const [period] = await rawQuery<any>(
      `SELECT id, name, "startDate", "endDate" FROM financial_periods WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [periodId, scope.companyId]
    );
    if (!period) throw new NotFoundError("الفترة غير موجودة");

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

    // Central lifecycle engine: validates fromStates=['open'], writes
    // status='closed' + audit trail + event_logs + eventBus emission
    // atomically. Any attempt to close an already-closed period is rejected
    // by the engine's fromStates check, not by a hand-written guard.
    const updated = await applyTransition<any>({
      entity: "financial_periods",
      id: periodId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "fiscal_period.closed",
      fromStates: ["open"],
      toState: "closed",
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL`,
      setExtras: {
        closedAt: { raw: "NOW()" },
        closedBy: scope.activeAssignmentId,
        ...(notes ? { notes } : {}),
      },
      after: { name: period.name, notes: notes ?? null },
    });

    res.json({
      message: `تم إقفال الفترة المالية "${period.name}" بنجاح`,
      periodId,
      status: updated.status,
      event: "fiscal_period.closed",
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Close fiscal period error:");
  }
});

financeHardeningRouter.post("/fiscal-periods-v2/:id/reopen", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const periodId = parseId(req.params.id, "id");
    const { reason } = zodParse(reopenFiscalPeriodSchema.safeParse(req.body ?? {}));

    // Fetch only the name for the success message; the engine does the
    // state check and row update.
    const [period] = await rawQuery<any>(
      `SELECT name FROM financial_periods WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [periodId, scope.companyId]
    );
    if (!period) throw new NotFoundError("الفترة غير موجودة");

    const updated = await applyTransition<any>({
      entity: "financial_periods",
      id: periodId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "fiscal_period.reopened",
      fromStates: ["closed"],
      toState: "open",
      reason,
      extraWhere: `"deletedAt" IS NULL`,
      setExtras: {
        reopenedAt: { raw: "NOW()" },
        reopenedBy: scope.activeAssignmentId,
        reopenReason: reason,
      },
      after: { name: period.name, reason },
    });

    res.json({
      message: `تم إعادة فتح الفترة المالية "${period.name}"`,
      reason,
      status: updated.status,
      event: "fiscal_period.reopened",
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Reopen fiscal period error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL JOURNAL APPROVAL WORKFLOW
// draft → pending_review → approved → posted
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.post("/journal-manual", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { description, lines, costCenter, notes } = zodParse(createManualJournalSchema.safeParse(req.body ?? {}));

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
    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description: description ?? "قيد يدوي",
      sourceType: "manual_journal",
      sourceId: 0,
      sourceKey: `finance:manual:${Date.now()}`,
      lines,
    });

    await rawExecute(
      `UPDATE journal_entries SET "approvalStatus"='draft', "isManual"=TRUE, "costCenter"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [costCenter ?? null, journalId, scope.companyId]
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
    }).catch((err) => logger.error(err, "[audit] journal.manual_created:"));

    const [createdManualJournal] = await rawQuery<any>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdManualJournal || { id: journalId }), message: "تم إنشاء القيد اليدوي بحالة مسودة — يحتاج مراجعة واعتماد قبل الترحيل" });
  } catch (err) {
    handleRouteError(err, res, "Create manual journal error:");
  }
});

financeHardeningRouter.get("/journal-manual", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
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
       LEFT JOIN employees e_rev ON e_rev.id=ea_rev."employeeId" AND e_rev."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea_apr ON ea_apr.id=je."approvedBy"
       LEFT JOIN employees e_apr ON e_apr.id=ea_apr."employeeId" AND e_apr."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea_cre ON ea_cre.id=je."createdBy"
       LEFT JOIN employees e_cre ON e_cre.id=ea_cre."employeeId" AND e_cre."deletedAt" IS NULL
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

financeHardeningRouter.get("/journal-manual/:id", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT je.*, json_agg(jl.*) FILTER (WHERE jl.id IS NOT NULL) AS lines,
              e_cre.name AS "createdByName"
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId"=je.id
       LEFT JOIN employee_assignments ea_cre ON ea_cre.id=je."createdBy"
       LEFT JOIN employees e_cre ON e_cre.id=ea_cre."employeeId" AND e_cre."deletedAt" IS NULL
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id, e_cre.name`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("القيد اليدوي غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Journal manual detail error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL MANUAL APPROVAL WORKFLOW — fully wired to lifecycleEngine
//
//   draft → pending_review → approved → posted
//                         \→ rejected  (terminal)
//
// Every transition goes through `applyTransition` with statusColumn set to
// "approvalStatus" so the lifecycle engine validates the source state,
// writes the UPDATE, records the event_logs row, fires the audit log, and
// emits on the in-process event bus — all atomically. Hand-rolled UPDATEs
// for approvalStatus are no longer permitted on this entity.
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.patch("/journal-manual/:id/submit", authorize({ feature: "finance.hardening", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const journalId = parseId(req.params.id, "id");

    // Fetch ref only for the success message; engine does state validation.
    const [je] = await rawQuery<any>(
      `SELECT ref FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`,
      [journalId, scope.companyId]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");

    const updated = await applyTransition<any>({
      entity: "journal_entries",
      id: journalId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "journal.submitted_for_review",
      statusColumn: "approvalStatus",
      fromStates: ["draft"],
      toState: "pending_review",
      extraWhere: `"isManual"=TRUE AND "deletedAt" IS NULL`,
      after: { ref: je.ref },
    });

    res.json({
      message: "تم إرسال القيد للمراجعة",
      approvalStatus: updated.approvalStatus,
      event: "journal.submitted_for_review",
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Submit manual journal error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/review", authorize({ feature: "finance.hardening", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const journalId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(reviewJournalSchema.safeParse(req.body ?? {}));

    // Fetch createdBy for the "cannot review your own entry" business rule
    // plus ref for the success message. State validation still happens in
    // the engine.
    const [je] = await rawQuery<any>(
      `SELECT ref, "createdBy" FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`,
      [journalId, scope.companyId]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");

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
    const updated = await applyTransition<any>({
      entity: "journal_entries",
      id: journalId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `journal.reviewed_${newStatus}`,
      statusColumn: "approvalStatus",
      fromStates: ["pending_review"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"isManual"=TRUE AND "deletedAt" IS NULL`,
      setExtras: {
        reviewedBy: scope.activeAssignmentId,
        reviewedAt: { raw: "NOW()" },
        approvalNotes: notes ?? null,
      },
      after: { ref: je.ref, notes: notes ?? null, decision: newStatus },
    });

    res.json({
      message: approved ? "تمت المراجعة والموافقة" : "تم رفض القيد",
      approvalStatus: updated.approvalStatus,
      event: `journal.reviewed_${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Review manual journal error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/approve", authorize({ feature: "finance.hardening", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const journalId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approveJournalSchema.safeParse(req.body ?? {}));

    const [je] = await rawQuery<any>(
      `SELECT ref FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`,
      [journalId, scope.companyId]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");

    if (!approved && !notes) {
      throw new ValidationError("يجب ذكر سبب الرفض", {
        field: "notes",
        fix: "اكتب سبب رفض الاعتماد",
      });
    }

    const newStatus = approved ? "approved" : "rejected";
    const updated = await applyTransition<any>({
      entity: "journal_entries",
      id: journalId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `journal.approved_${newStatus}`,
      statusColumn: "approvalStatus",
      // Approver can only act on journals that are pending_review.
      fromStates: ["pending_review"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"isManual"=TRUE AND "deletedAt" IS NULL`,
      setExtras: {
        approvedBy: scope.activeAssignmentId,
        approvedAt: { raw: "NOW()" },
        ...(notes ? { approvalNotes: notes } : {}),
      },
      after: { ref: je.ref, notes: notes ?? null, decision: newStatus },
    });

    res.json({
      message: approved ? "تمت الموافقة على القيد" : "تم رفض القيد",
      approvalStatus: updated.approvalStatus,
      event: `journal.approved_${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve manual journal error:");
  }
});

financeHardeningRouter.patch("/journal-manual/:id/post", authorize({ feature: "finance.hardening", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const journalId = parseId(req.params.id, "id");

    const [je] = await rawQuery<any>(
      `SELECT ref FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL`,
      [journalId, scope.companyId]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");

    // Posting flips BOTH approvalStatus='posted' AND status='posted'. The
    // engine drives the approvalStatus transition (gate check + row update),
    // and setExtras carries the mirror write to status and the posting
    // metadata columns. This keeps one atomic UPDATE for the whole flip.
    const updated = await applyTransition<any>({
      entity: "journal_entries",
      id: journalId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "journal.posted",
      statusColumn: "approvalStatus",
      fromStates: ["approved"],
      toState: "posted",
      extraWhere: `"isManual"=TRUE AND "deletedAt" IS NULL`,
      setExtras: {
        status: "posted",
        postedAt: { raw: "NOW()" },
        postedBy: scope.activeAssignmentId,
      },
      after: { ref: je.ref, postingStatus: "posted" },
    });

    res.json({
      message: "تم ترحيل القيد اليدوي بنجاح",
      approvalStatus: updated.approvalStatus,
      status: updated.status,
      event: "journal.posted",
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Post manual journal error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BANK GUARANTEES
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/bank-guarantees", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
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
       WHERE bg."companyId"=$1 AND bg."deletedAt" IS NULL
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

financeHardeningRouter.post("/bank-guarantees", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { ref, bank, beneficiary, amount, issueDate, expiryDate, guaranteeType, notes, attachmentUrl, branchId } = zodParse(createBankGuaranteeSchema.safeParse(req.body ?? {}));
    const { insertId } = await rawExecute(
      `INSERT INTO bank_guarantees ("companyId","branchId",ref,bank,beneficiary,amount,"issueDate","expiryDate","guaranteeType",notes,"attachmentUrl","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [scope.companyId, branchId ?? scope.branchId, ref, bank, beneficiary, Number(amount), issueDate, expiryDate, guaranteeType ?? "performance", notes ?? null, attachmentUrl ?? null, scope.activeAssignmentId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM bank_guarantees WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

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
    }).catch((err) => logger.error(err, "[audit] bank_guarantee.created:"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create bank guarantee error:");
  }
});

financeHardeningRouter.patch("/bank-guarantees/:id", authorize({ feature: "finance.hardening", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { id } = req.params;
    const b = zodParse(updateBankGuaranteeSchema.safeParse(req.body ?? {}));
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
      `UPDATE bank_guarantees SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
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
    }).catch((err) => logger.error(err, "[audit] bank_guarantee.updated:"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Update bank guarantee error:");
  }
});

financeHardeningRouter.delete("/bank-guarantees/:id", authorize({ feature: "finance.hardening", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const guaranteeId = parseId(req.params.id, "id");

    const [existing] = await rawQuery<any>(
      `SELECT id, ref, bank, status, amount FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
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

    // Phase 9: bank_guarantees now has a deletedAt column, so DELETE is a
    // soft-delete. Hard-deleting would orphan any paired journal entries
    // that referenced the guarantee by id.
    const [row] = await rawQuery<any>(
      `UPDATE bank_guarantees SET "deletedAt" = NOW(), "updatedAt" = NOW()
       WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL RETURNING id`,
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
      after: { ref: existing.ref, bank: existing.bank, amount: Number(existing.amount), softDelete: true },
    }).catch((err) => logger.error(err, "[audit] bank_guarantee.deleted:"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete bank guarantee error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BANK GUARANTEE LIFECYCLE — Phase 8.1
//
//   active ─┬─► cancelled   (CFO cancels an outstanding guarantee)
//           └─► released    (guarantee obligation discharged / returned)
//
// Before Phase 8.1 the only way to change a bank_guarantees.status was via
// the generic PATCH /bank-guarantees/:id, which let any caller flip the
// status without validating the source state. These two dedicated endpoints
// go through `applyTransition` so the graph is enforced centrally.
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.post("/bank-guarantees/:id/cancel", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const guaranteeId = parseId(req.params.id, "id");
    const { reason } = zodParse(cancelBankGuaranteeSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<any>(
      `SELECT ref, bank, notes FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [guaranteeId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الضمان غير موجود");

    // Note: the bank_guarantees table has no dedicated cancelled/released
    // timestamp columns. The reason is recorded via applyTransition's
    // `reason` field (which lands in event_logs + audit_logs) and
    // prepended onto the row's `notes` column. We build the combined
    // notes here and pass it as a plain parameter so the value is
    // parameterised rather than interpolated into raw SQL.
    const combinedNotes = `${existing.notes ?? ""}${existing.notes ? " | " : ""}إلغاء: ${reason}`;
    const updated = await applyTransition<any>({
      entity: "bank_guarantees",
      id: guaranteeId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "bank_guarantee.cancelled",
      fromStates: ["active"],
      toState: "cancelled",
      reason,
      extraWhere: `"deletedAt" IS NULL`,
      setExtras: {
        notes: combinedNotes,
      },
      after: { ref: existing.ref, bank: existing.bank, reason },
    });

    res.json({
      message: `تم إلغاء الضمان البنكي "${existing.ref}"`,
      status: updated.status,
      event: "bank_guarantee.cancelled",
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Cancel bank guarantee error:");
  }
});

financeHardeningRouter.post("/bank-guarantees/:id/release", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const guaranteeId = parseId(req.params.id, "id");
    const { notes } = zodParse(releaseBankGuaranteeSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<any>(
      `SELECT ref, bank, notes FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [guaranteeId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الضمان غير موجود");

    // Same note as /cancel above: no dedicated releasedAt column; release
    // notes are prepended onto the existing `notes` column via a plain
    // parameterised value (no raw SQL interpolation).
    const releaseNote = notes ?? "تم التحرير";
    const combinedNotes = `${existing.notes ?? ""}${existing.notes ? " | " : ""}تحرير: ${releaseNote}`;
    const updated = await applyTransition<any>({
      entity: "bank_guarantees",
      id: guaranteeId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: "bank_guarantee.released",
      fromStates: ["active"],
      toState: "released",
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL`,
      setExtras: {
        notes: combinedNotes,
      },
      after: { ref: existing.ref, bank: existing.bank, notes: notes ?? null },
    });

    res.json({
      message: `تم تحرير الضمان البنكي "${existing.ref}"`,
      status: updated.status,
      event: "bank_guarantee.released",
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Release bank guarantee error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERCOMPANY TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

financeHardeningRouter.get("/intercompany", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT ic.*,
              fc.name AS "fromCompanyName",
              tc.name AS "toCompanyName"
       FROM intercompany_transactions ic
       LEFT JOIN companies fc ON fc.id=ic."fromCompanyId"
       LEFT JOIN companies tc ON tc.id=ic."toCompanyId"
       WHERE (ic."fromCompanyId"=$1 OR ic."toCompanyId"=$1) AND ic."deletedAt" IS NULL
       ORDER BY ic."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List intercompany transactions error:");
  }
});

financeHardeningRouter.post("/intercompany", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { toCompanyId, amount, description, transactionDate, arAccountCode, apAccountCode, revenueAccountCode, expenseAccountCode } = zodParse(createIntercompanySchema.safeParse(req.body ?? {}));

    if (toCompanyId === scope.companyId) {
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
    const txDate = transactionDate ?? todayISO();

    const { financialEngine } = await import("../lib/engines/index.js");

    // postJournalEntry manages its own transaction internally, so we use a
    // compensating-reversal pattern: if the second post fails we soft-delete the first.
    const fromTimestamp = Date.now();
    const fromResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description: description ?? `معاملة بين الشركات ${ref}`,
      type: "intercompany",
      sourceType: "intercompany",
      sourceId: 0,
      sourceKey: `finance:intercompany:from:${fromTimestamp}`,
      lines: [
        { accountCode: arAccountCode, debit: Number(amount), credit: 0, description: "ذمم مدينة شركة شقيقة" },
        { accountCode: revenueAccountCode, debit: 0, credit: Number(amount), description: "إيراد شركة شقيقة" },
      ],
    });

    let toResult: { journalId: number };
    try {
      toResult = await financialEngine.postJournalEntry({
        companyId: Number(toCompanyId),
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref,
        description: description ?? `معاملة بين الشركات ${ref}`,
        type: "intercompany",
        sourceType: "intercompany",
        sourceId: 0,
        sourceKey: `finance:intercompany:to:${fromTimestamp}`,
        lines: [
          { accountCode: expenseAccountCode, debit: Number(amount), credit: 0, description: "مصروف شركة شقيقة" },
          { accountCode: apAccountCode, debit: 0, credit: Number(amount), description: "ذمم دائنة شركة شقيقة" },
        ],
      });
    } catch (err) {
      // Compensating reversal outside any transaction so it actually persists
      await rawExecute(
        `UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2`,
        [fromResult.journalId, scope.companyId]
      );
      throw err;
    }

    await rawExecute(
      `INSERT INTO intercompany_transactions (ref,"fromCompanyId","toCompanyId",amount,description,"transactionDate",status,"fromJournalId","toJournalId","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,'posted',$7,$8,$9)`,
      [ref, scope.companyId, Number(toCompanyId), Number(amount), description ?? null, txDate, fromResult.journalId, toResult.journalId, scope.activeAssignmentId]
    );

    const fromJournalId = fromResult.journalId;
    const toJournalId = toResult.journalId;

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
    }).catch((err) => logger.error(err, "[audit] intercompany.created:"));

    const [createdIntercompany] = await rawQuery<any>(
      `SELECT ic.*, fc.name AS "fromCompanyName", tc.name AS "toCompanyName"
       FROM intercompany_transactions ic
       LEFT JOIN companies fc ON fc.id = ic."fromCompanyId"
       LEFT JOIN companies tc ON tc.id = ic."toCompanyId"
       WHERE ic.ref = $1 AND (ic."fromCompanyId" = $2 OR ic."toCompanyId" = $2) AND ic."deletedAt" IS NULL
       LIMIT 1`,
      [ref, scope.companyId]
    );
    res.status(201).json({ ...(createdIntercompany || { ref, fromJournalId, toJournalId, amount: Number(amount) }), message: `تم تسجيل المعاملة البينية ${ref} وإنشاء قيدين محاسبيين` });
  } catch (err) {
    handleRouteError(err, res, "Create intercompany transaction error:");
  }
});

financeHardeningRouter.get("/intercompany/consolidation", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
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
       WHERE je."companyId" = ANY($1) AND je."deletedAt" IS NULL AND je.status = 'posted' AND je.type != 'intercompany'`,
      [companies]
    );

    const intercompanyTotal = await rawQuery<any>(
      `SELECT SUM(amount) AS total FROM intercompany_transactions
       WHERE ("fromCompanyId" = ANY($1) OR "toCompanyId" = ANY($1))
         AND status='posted' AND "deletedAt" IS NULL`,
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
       WHERE je."companyId" = ANY($1) AND je."deletedAt" IS NULL AND je.status = 'posted'
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

financeHardeningRouter.get("/projects", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT p.*,
              COALESCE(SUM(jl.debit),0) AS "actualCost",
              p.budget - COALESCE(SUM(jl.debit),0) AS "budgetRemaining"
       FROM projects p
       LEFT JOIN journal_entries je ON je."projectId"=p.id AND je."deletedAt" IS NULL AND je.status = 'posted'
       LEFT JOIN journal_lines jl ON jl."journalId"=je.id AND jl.debit > 0
       WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
       GROUP BY p.id
       ORDER BY p."createdAt" DESC
       LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List projects error:");
  }
});

financeHardeningRouter.post("/projects", authorize({ feature: "finance.hardening", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { name, description, budget, startDate, endDate, branchId, ref } = zodParse(createProjectSchema.safeParse(req.body ?? {}));
    const projectRef = ref ?? `PRJ-${Date.now()}`;
    const { insertId } = await rawExecute(
      `INSERT INTO projects ("companyId","branchId",ref,name,description,budget,"startDate","endDate","managerId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, branchId ?? scope.branchId, projectRef, name, description ?? null, Number(budget ?? 0), startDate ?? null, endDate ?? null, scope.activeAssignmentId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

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
    }).catch((err) => logger.error(err, "[audit] finance_project.created:"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create project error:");
  }
});

financeHardeningRouter.get("/projects/:id", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT p.*, COALESCE(p.budget - p."spentAmount", 0) AS "budgetRemaining"
       FROM projects p
       WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المشروع غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Project detail error:");
  }
});

financeHardeningRouter.get("/projects/:id/costs", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [project] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!project) throw new NotFoundError("المشروع غير موجود");

    const costs = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt" AS date,
              COALESCE(SUM(jl.debit),0) AS amount,
              je."costCenter", je."operationType"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId"=je.id AND jl.debit > 0
       WHERE je."projectId"=$1 AND je."companyId"=$2 AND je."deletedAt" IS NULL AND je.status = 'posted'
       GROUP BY je.id
       ORDER BY je."createdAt" DESC`,
      [id, scope.companyId]
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

financeHardeningRouter.get("/cash-flow-forecast", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const inflow30 = await rawQuery<any>(
      `SELECT i.ref, i.total - i."paidAmount" AS expected, i."dueDate", c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id=i."clientId" AND c."deletedAt" IS NULL
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY i."dueDate"`,
      [scope.companyId]
    );

    const inflow60 = await rawQuery<any>(
      `SELECT i.ref, i.total - i."paidAmount" AS expected, i."dueDate", c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id=i."clientId" AND c."deletedAt" IS NULL
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '60 days'
       ORDER BY i."dueDate"`,
      [scope.companyId]
    );

    const inflow90 = await rawQuery<any>(
      `SELECT i.ref, i.total - i."paidAmount" AS expected, i."dueDate", c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id=i."clientId" AND c."deletedAt" IS NULL
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
       WHERE po."companyId"=$1 AND po."deletedAt" IS NULL AND po.status IN ('approved','pending')
         AND po."expectedDelivery" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       UNION ALL
       SELECT 'PAYROLL' AS ref, COALESCE(SUM(ea.salary),0) AS expected,
              (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date AS "dueDate",
              'رواتب الموظفين' AS "supplierName", 'payroll' AS type
       FROM employee_assignments ea
       JOIN employees em ON em.id=ea."employeeId"
       WHERE ea."companyId"=$1 AND ea.status='active' AND ea.salary IS NOT NULL
       GROUP BY 1,3,4,5`,
      [scope.companyId]
    );

    const [cashBalance] = await rawQuery<any>(
      `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl."journalId"
       WHERE je."companyId"=$1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND jl."accountCode" LIKE '11%'`,
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

financeHardeningRouter.get("/cost-center-report", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, costCenter } = req.query as any;
    const conditions = [`je."companyId"=$1`, `je."deletedAt" IS NULL`, `je.status = 'posted'`, `je."costCenter" IS NOT NULL`];
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
       LEFT JOIN chart_of_accounts coa ON coa.code=jl."accountCode" AND coa."companyId"=je."companyId" AND coa."deletedAt" IS NULL
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
       WHERE je."companyId"=$1 AND je."costCenter"=$2 AND je."deletedAt" IS NULL AND je.status = 'posted'
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 50`,
      [scope.companyId, costCenter]
    ) : [];

    res.json({ data: rows, details: costCenterDetails, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Cost center report error:");
  }
});

// Financial Posting Failures dashboard — surfaces operations where GL entry failed
financeHardeningRouter.get("/posting-failures", authorize({ feature: "finance.hardening", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const resolved = req.query.resolved === "true";
    const rows = await rawQuery<any>(
      `SELECT * FROM financial_posting_failures
       WHERE "companyId" = $1 AND resolved = $2
       ORDER BY "createdAt" DESC LIMIT 100`,
      [scope.companyId, resolved]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Posting failures error:");
  }
});

financeHardeningRouter.patch("/posting-failures/:id/resolve", authorize({ feature: "finance.hardening", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE financial_posting_failures SET resolved = true, "resolvedAt" = NOW(), "resolvedBy" = $1
       WHERE id = $2 AND "companyId" = $3 AND resolved = false`,
      [scope.userId, id, scope.companyId]
    );
    if (!affectedRows) throw new NotFoundError("السجل غير موجود أو مغلق مسبقاً");
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "posting_failure.resolved", entity: "financial_posting_failures", entityId: id }).catch((e) => logger.error(e, "finance-hardening background task failed"));
    res.json({ message: "تم إغلاق المشكلة" });
  } catch (err) {
    handleRouteError(err, res, "Resolve posting failure error:");
  }
});

export default financeHardeningRouter;
