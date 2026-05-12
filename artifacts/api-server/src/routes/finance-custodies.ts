import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
} from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";


export const custodiesRouter = Router();
custodiesRouter.use(authMiddleware);

interface CustodyListRow {
  id: number;
  ref: string;
  description: string;
  approvalStatus: string;
  amount: number | string;
  date: string;
  purpose: string | null;
  expectedReturnDate: string | null;
  employeeName: string | null;
  assignmentId: number | null;
  custodyAccountCode: string | null;
  custodyAccountName: string | null;
}

interface CustodyEnrichedRow extends CustodyListRow {
  settledAmount: number;
  remainingAmount: number;
  status: string;
  daysOverdue: number;
}

interface SettledAmountRow {
  originalRef: string;
  settledAmount: number | string;
}

interface CustodyReportRow {
  id: number;
  ref: string;
  description: string;
  amount: number | string;
  date: string;
  purpose: string | null;
  expectedReturnDate: string | null;
  approvalStatus: string;
  employeeName: string | null;
  assignmentId: number | null;
  employeeId: number | null;
}

interface CustodySummaryRow {
  id: number;
  ref: string;
  expectedReturnDate: string | null;
  amount: number | string;
}

interface CustodyAccountInfoRow {
  code?: string;
  name?: string;
}

interface CustodySettlementRow {
  id: number;
  ref: string;
  description: string;
  amount: number | string;
  date: string;
  settledByName: string | null;
}

interface ApprovalActionRow {
  id: number;
  companyId: number;
  entityType: string;
  entityId: number;
  action: string;
  notes: string | null;
  actionBy: number | null;
  actionByName: string | null;
  createdAt: string;
}

interface EmployeeNameRow {
  name: string;
  id?: number;
}

interface JournalEntryWithLinesRow {
  id: number;
  ref: string;
  description: string;
  status: string;
  companyId: number;
  createdAt: string;
  lines: unknown;
}

interface CustodyRefStatusRow {
  ref: string;
  approvalStatus: string;
}

interface CustodyRefOnlyRow {
  ref: string;
}

interface EmployeeAggregateRow {
  employeeName: string;
  employeeId: number | null;
  assignmentId: number | null;
  totalOutstanding: number;
  overdueAmount: number;
  custodyCount: number;
  overdueCount: number;
  custodies: Array<{
    id: number;
    ref: string;
    description: string;
    purpose: string | null;
    amount: number;
    settledAmount: number;
    remainingAmount: number;
    date: string;
    expectedReturnDate: string | null;
    daysOverdue: number;
    isOverdue: boolean;
  }>;
}

const createCustodySchema = z.object({
  assignmentId: z.coerce.number().optional(),
  employeeName: z.string().optional(),
  amount: z.coerce.number(),
  description: z.string().optional(),
  sourceAccountCode: z.string().optional(),
  purpose: z.string().optional(),
  expectedReturnDate: z.string().optional(),
});

const settleCustodySchema = z.object({
  custodyRef: z.string(),
  amount: z.coerce.number(),
  description: z.string().optional(),
  sourceAccountCode: z.string().optional(),
});

const settleCustodyByIdSchema = z.object({
  amount: z.coerce.number(),
  description: z.string().optional(),
  sourceAccountCode: z.string().optional(),
});

const approveCustodySchema = z.object({
  approved: z.union([z.boolean(), z.literal("returned")]),
  notes: z.string().optional(),
});

custodiesRouter.get("/custodies", authorize({ feature: "finance.custodies", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status: filterStatus, employeeId, page = "1", limit: lim = "50", dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const queryParams: any[] = [scope.companyId];
    let dateFilter = "";
    if (dateFrom) {
      queryParams.push(dateFrom);
      dateFilter += ` AND je."createdAt" >= $${queryParams.length}::date`;
    }
    if (dateTo) {
      queryParams.push(dateTo);
      dateFilter += ` AND je."createdAt" < ($${queryParams.length}::date + interval '1 day')`;
    }

    const rows = await rawQuery<CustodyListRow>(
      `SELECT je.id, je.ref, je.description, je.status AS "approvalStatus",
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.notes AS purpose,
              je."dueDate" AS "expectedReturnDate",
              e.name AS "employeeName",
              ea.id AS "assignmentId",
              (SELECT jl2."accountCode" FROM journal_lines jl2 WHERE jl2."journalId" = je.id AND jl2.debit > 0 LIMIT 1) AS "custodyAccountCode",
              (SELECT ca.name FROM journal_lines jl3 JOIN chart_of_accounts ca ON ca.code = jl3."accountCode" AND ca."companyId" = $1 WHERE jl3."journalId" = je.id AND jl3.debit > 0 LIMIT 1) AS "custodyAccountName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je.notes, je."dueDate", e.name, ea.id
       ORDER BY je."createdAt" DESC`,
      queryParams
    );

    const settledAmounts = await rawQuery<SettledAmountRow>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) {
      settledMap.set(s.originalRef, Number(s.settledAmount));
    }

    const now = new Date();
    let enriched: CustodyEnrichedRow[] = rows.map((r) => {
      const totalAmount = Number(r.amount);
      const settled = settledMap.get(r.ref) ?? 0;
      const remaining = Math.max(0, totalAmount - settled);
      const isPending = r.approvalStatus === "pending_approval" || r.approvalStatus === "draft";
      const isRejected = r.approvalStatus === "rejected";
      const isReturned = r.approvalStatus === "returned";
      let status: string;
      if (isPending) status = "pending";
      else if (isRejected) status = "rejected";
      else if (isReturned) status = "returned";
      else if (remaining <= 0) status = "settled";
      else if (r.expectedReturnDate && new Date(r.expectedReturnDate) < now && remaining > 0) status = "overdue";
      else if (settled > 0) status = "partial";
      else status = "active";
      const daysOverdue = r.expectedReturnDate && remaining > 0
        ? Math.max(0, Math.floor((now.getTime() - new Date(r.expectedReturnDate).getTime()) / 86400000))
        : 0;
      return { ...r, amount: totalAmount, settledAmount: settled, remainingAmount: remaining, status, daysOverdue };
    });

    if (filterStatus) {
      enriched = enriched.filter((r) => r.status === filterStatus);
    }
    if (employeeId) {
      enriched = enriched.filter((r) => String(r.assignmentId) === String(employeeId));
    }

    const totalAmount = enriched.reduce((s, r) => s + Number(r.amount), 0);
    const totalRemaining = enriched.reduce((s, r) => s + r.remainingAmount, 0);
    const overdueCount = enriched.filter((r) => r.status === "overdue").length;
    res.json(maskFields(req, {
      data: enriched,
      summary: {
        total: enriched.length, totalAmount, totalRemaining,
        activeCount: enriched.filter((r) => r.status === "active" || r.status === "partial" || r.status === "overdue").length,
        overdueCount, pendingCount: enriched.filter((r) => r.status === "pending").length,
      },
    }));
  } catch (err) {
    logger.error(err, "Get custodies error:");
    res.json({ data: [], summary: { total: 0, totalAmount: 0, totalRemaining: 0, activeCount: 0, overdueCount: 0, pendingCount: 0 } });
  }
});

custodiesRouter.get("/custodies/report", authorize({ feature: "finance.custodies", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const rows = await rawQuery<CustodyReportRow>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.notes AS purpose,
              je."dueDate" AS "expectedReturnDate",
              je.status AS "approvalStatus",
              e.name AS "employeeName",
              ea.id AS "assignmentId",
              e.id AS "employeeId"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je.notes, je."dueDate", e.name, ea.id, e.id
       ORDER BY e.name, je."createdAt" DESC`,
      [scope.companyId]
    );

    const settledAmounts = await rawQuery<SettledAmountRow>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) {
      settledMap.set(s.originalRef, Number(s.settledAmount));
    }

    const now = new Date();
    const employeeMap = new Map<string, EmployeeAggregateRow>();

    for (const r of rows) {
      const totalAmount = Number(r.amount);
      const settled = settledMap.get(r.ref) ?? 0;
      const remaining = Math.max(0, totalAmount - settled);
      if (remaining <= 0) continue;

      const daysOverdue = r.expectedReturnDate
        ? Math.max(0, Math.floor((now.getTime() - new Date(r.expectedReturnDate).getTime()) / 86400000))
        : 0;
      const isOverdue = daysOverdue > 0;

      const empKey = r.employeeName || "غير محدد";
      if (!employeeMap.has(empKey)) {
        employeeMap.set(empKey, {
          employeeName: empKey,
          employeeId: r.employeeId,
          assignmentId: r.assignmentId,
          totalOutstanding: 0,
          overdueAmount: 0,
          custodyCount: 0,
          overdueCount: 0,
          custodies: [],
        });
      }
      const emp = employeeMap.get(empKey)!;
      emp.totalOutstanding += remaining;
      emp.custodyCount++;
      if (isOverdue) {
        emp.overdueAmount += remaining;
        emp.overdueCount++;
      }
      emp.custodies.push({
        id: r.id, ref: r.ref, description: r.description, purpose: r.purpose,
        amount: totalAmount, settledAmount: settled, remainingAmount: remaining,
        date: r.date, expectedReturnDate: r.expectedReturnDate,
        daysOverdue, isOverdue,
      });
    }

    const employees = Array.from(employeeMap.values()).sort((a, b) => b.overdueAmount - a.overdueAmount);
    const totalOutstanding = employees.reduce((s, e) => s + e.totalOutstanding, 0);
    const totalOverdue = employees.reduce((s, e) => s + e.overdueAmount, 0);

    res.json({
      data: employees,
      summary: {
        totalOutstanding, totalOverdue,
        employeeCount: employees.length,
        totalCustodies: employees.reduce((s, e) => s + e.custodyCount, 0),
        overdueCustodies: employees.reduce((s, e) => s + e.overdueCount, 0),
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Custody aging report error:");
  }
});

custodiesRouter.get("/custodies/summary", authorize({ feature: "finance.custodies", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<CustodySummaryRow>(
      `SELECT je.id, je.ref, je."dueDate" AS "expectedReturnDate",
              COALESCE(SUM(jl.debit), 0) AS amount
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
       GROUP BY je.id, je.ref, je."dueDate"`,
      [scope.companyId]
    );
    const settledAmounts = await rawQuery<SettledAmountRow>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) settledMap.set(s.originalRef, Number(s.settledAmount));

    let totalAmount = 0, totalRemaining = 0, activeCount = 0, overdueCount = 0, settledCount = 0;
    const now = new Date();
    for (const r of rows) {
      const amt = Number(r.amount);
      const settled = settledMap.get(r.ref) ?? 0;
      const remaining = Math.max(0, amt - settled);
      totalAmount += amt;
      totalRemaining += remaining;
      if (remaining <= 0) settledCount++;
      else if (r.expectedReturnDate && new Date(r.expectedReturnDate) < now) overdueCount++;
      else activeCount++;
    }

    res.json({
      total: rows.length, totalAmount, totalRemaining,
      activeCount, overdueCount, settledCount,
    });
  } catch (err) {
    handleRouteError(err, res, "Custody summary error:");
  }
});

custodiesRouter.get("/custodies/:id", authorize({ feature: "finance.custodies", action: "view", resource: { table: "custodies", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [custody] = await rawQuery<CustodyListRow>(
      `SELECT je.id, je.ref, je.description, je.status AS "approvalStatus",
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.notes AS purpose,
              je."dueDate" AS "expectedReturnDate",
              e.name AS "employeeName",
              ea.id AS "assignmentId",
              (SELECT jl2."accountCode" FROM journal_lines jl2 WHERE jl2."journalId" = je.id AND jl2.debit > 0 LIMIT 1) AS "custodyAccountCode",
              (SELECT ca.name FROM journal_lines jl3 JOIN chart_of_accounts ca ON ca.code = jl3."accountCode" AND ca."companyId" = $2 WHERE jl3."journalId" = je.id AND jl3.debit > 0 LIMIT 1) AS "custodyAccountName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je.notes, je."dueDate", e.name, ea.id`,
      [id, scope.companyId]
    );

    if (!custody) throw new NotFoundError("العهدة غير موجودة");

    const settlements = await rawQuery<CustodySettlementRow>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.credit), 0) AS amount,
              je."createdAt" AS date,
              e2.name AS "settledByName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.credit > 0
       LEFT JOIN employee_assignments ea2 ON ea2.id = je."createdBy"
       LEFT JOIN employees e2 ON e2.id = ea2."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE%' AND je.description = $2
       GROUP BY je.id, je.ref, je.description, je."createdAt", e2.name
       ORDER BY je."createdAt" ASC`,
      [scope.companyId, custody.ref]
    );

    const settledAmount = settlements.reduce((s, r) => s + Number(r.amount), 0);
    const remainingAmount = Math.max(0, Number(custody.amount) - settledAmount);
    const now = new Date();
    const daysOverdue = custody.expectedReturnDate && remainingAmount > 0
      ? Math.max(0, Math.floor((now.getTime() - new Date(custody.expectedReturnDate).getTime()) / 86400000))
      : 0;

    let approvalActions: ApprovalActionRow[] = [];
    try {
      approvalActions = await rawQuery<ApprovalActionRow>(
        `SELECT aa.*, COALESCE(e.name, u.email) AS "actionByName"
         FROM approval_actions aa
         LEFT JOIN users u ON u.id = aa."actionBy"
         LEFT JOIN employees e ON e.id = u."employeeId"
         WHERE aa."entityType" = 'custody' AND aa."entityId" = $1 AND aa."companyId" = $2
         ORDER BY aa."createdAt" ASC`,
        [id, scope.companyId]
      );
    } catch (e) { logger.error(e, "custody approval actions fetch error"); }

    const isPending = custody.approvalStatus === "pending_approval" || custody.approvalStatus === "draft";
    const isRejected = custody.approvalStatus === "rejected";
    const isReturned = custody.approvalStatus === "returned";
    let status: string;
    if (isPending) status = "pending";
    else if (isRejected) status = "rejected";
    else if (isReturned) status = "returned";
    else if (remainingAmount <= 0) status = "settled";
    else if (daysOverdue > 0) status = "overdue";
    else if (settledAmount > 0) status = "partial";
    else status = "active";

    const timeline = [
      { action: "created", date: custody.date, label: "إنشاء العهدة", amount: Number(custody.amount) },
      ...approvalActions.map((a) => ({
        action: a.action, date: a.createdAt,
        label: a.action === "approved" ? "تمت الموافقة" : a.action === "rejected" ? "تم الرفض" : a.action === "returned" ? "تم الإرجاع" : a.action,
        notes: a.notes, actionBy: a.actionByName,
      })),
      ...settlements.map((s) => ({
        action: "settlement", date: s.date, label: "تسوية", amount: Number(s.amount),
        ref: s.ref, settledBy: s.settledByName,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json(maskFields(req, {
      ...custody,
      amount: Number(custody.amount),
      settledAmount,
      remainingAmount,
      status,
      daysOverdue,
      settlements,
      timeline,
    }));
  } catch (err) {
    handleRouteError(err, res, "Get custody detail error:");
  }
});

custodiesRouter.post("/custodies", authorize({ feature: "finance.custodies", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { assignmentId, employeeName, amount, description, sourceAccountCode, purpose, expectedReturnDate } = zodParse(createCustodySchema.safeParse(req.body ?? {}));

    if (!amount) {
      throw new ValidationError("المبلغ مطلوب", {
        field: "amount",
        fix: "أدخل مبلغ العهدة",
      });
    }

    let resolvedAssignmentId = assignmentId ? Number(assignmentId) : null;
    let resolvedEmployeeName = employeeName || "";

    if (resolvedAssignmentId) {
      const [emp] = await rawQuery<EmployeeNameRow>(
        `SELECT e.name FROM employee_assignments ea JOIN employees e ON e.id = ea."employeeId" WHERE ea.id = $1 AND ea."companyId" = $2`,
        [resolvedAssignmentId, scope.companyId]
      );
      if (!emp) {
        throw new NotFoundError("الموظف غير موجود");
      }
      resolvedEmployeeName = emp.name;
    } else if (!resolvedEmployeeName) {
      throw new ValidationError("يرجى اختيار الموظف", {
        field: "assignmentId",
        fix: "اختر الموظف من قائمة الموظفين أو أدخل اسمه يدوياً",
      });
    }

    const sourceAcct = sourceAccountCode || "1100";
    const ref = `CUSTODY-${Date.now()}`;
    const custodyAssignmentId = resolvedAssignmentId || scope.activeAssignmentId;

    // Resolve the real employee PK once. Journal lines tag employees by
    // employees.id, NOT employee_assignments.id (golden rule:
    // assignmentId = assignment-level, employeeId = person-level). The old
    // code passed resolvedAssignmentId to the journal line as employeeId,
    // which silently linked subsidiary balances to the wrong row.
    let custodyEmployeeId: number | null = null;
    const { financialEngine } = await import("../lib/engines/index.js");
    let custodyAccountCode = await financialEngine.resolveAccountCode(scope.companyId, "custody_account", "debit", "1400");
    if (resolvedAssignmentId) {
      const [empRow] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employee_assignments ea JOIN employees e ON e.id = ea."employeeId" WHERE ea.id = $1 AND ea."companyId" = $2`,
        [resolvedAssignmentId, scope.companyId]
      );
      if (empRow) {
        custodyEmployeeId = empRow.id;
        const [subAcc] = await rawQuery<CustodyAccountInfoRow>(
          `SELECT ca.code FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
           WHERE sa."companyId" = $1 AND sa."entityType" = 'employee' AND sa."entityId" = $2 AND sa."accountType" = 'custody'`,
          [scope.companyId, empRow.id]
        );
        if (subAcc && subAcc.code) custodyAccountCode = subAcc.code;
      }
    }

    const { journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: custodyAssignmentId,
      ref,
      description: description ?? `عهدة ${resolvedEmployeeName}`,
      sourceType: "custody",
      sourceId: 0,
      sourceKey: `finance:custody:${ref}`,
      lines: [
        { accountCode: custodyAccountCode, debit: Number(amount), credit: 0, employeeId: custodyEmployeeId ?? undefined },
        { accountCode: sourceAcct, debit: 0, credit: Number(amount) },
      ],
    });

    if (purpose || expectedReturnDate) {
      await rawExecute(
        `UPDATE journal_entries SET notes = $1, "dueDate" = $2 WHERE id = $3 AND "companyId" = $4 AND "deletedAt" IS NULL`,
        [purpose || null, expectedReturnDate || null, journalId, scope.companyId]
      );
    }

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "advances", refType: "custody", refId: journalId,
      amount: Number(amount),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`,
        [journalId, scope.companyId]
      );
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.created",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ ref, assignmentId: custodyAssignmentId, employeeName: resolvedEmployeeName, amount, purpose, expectedReturnDate, approvalRequired: approvalResult.requiresApproval }),
    }).catch((e) => logger.error(e, "finance-custodies background task failed"));

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "custodies",
      entityId: journalId,
      after: { ref, employeeName: resolvedEmployeeName, amount, purpose, expectedReturnDate },
    }).catch((e) => logger.error(e, "finance-custodies background task failed"));

    const [createdCustody] = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json(createdCustody || { id: journalId });
  } catch (err) {
    handleRouteError(err, res, "Create custody error:");
  }
});

custodiesRouter.post("/custodies/settle", authorize({ feature: "finance.custodies", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { custodyRef, amount, description, sourceAccountCode } = zodParse(settleCustodySchema.safeParse(req.body ?? {}));

    if (!amount || !custodyRef) {
      throw new ValidationError("مرجع العهدة ومبلغ التسوية مطلوبان", {
        field: !custodyRef ? "custodyRef" : "amount",
        fix: "أدخل مرجع العهدة (CUSTODY-...) ومبلغ التسوية الموجب",
      });
    }

    const settleAmount = Number(amount);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      throw new ValidationError("مبلغ التسوية يجب أن يكون رقم موجب", {
        field: "amount",
        fix: "أدخل مبلغاً أكبر من صفر",
      });
    }

    const { journalId, settleRef, remaining } = await withTransaction(async (client) => {
      // Lock the custody header row to prevent concurrent settlements
      const lockResult = await client.query(
        `SELECT je.id, je.status AS "approvalStatus"
         FROM journal_entries je
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
         FOR UPDATE`,
        [scope.companyId, custodyRef]
      );
      const custodyHeader = lockResult.rows[0];

      if (!custodyHeader) throw new NotFoundError("العهدة غير موجودة");

      const blockedStatuses = ["pending_approval", "draft", "rejected", "returned"];
      if (blockedStatuses.includes(custodyHeader.approvalStatus)) {
        throw new ConflictError(
          "لا يمكن تسوية عهدة في حالة انتظار الموافقة أو مرفوضة أو مُرجعة",
          {
            field: "approvalStatus",
            fix: "اعتمد العهدة أولاً قبل تسويتها",
            meta: { currentStatus: custodyHeader.approvalStatus, blockedStatuses },
          },
        );
      }

      const custodyEntriesResult = await client.query(
        `SELECT je.id, jl.debit, jl.credit, jl."accountCode"
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl.debit > 0`,
        [scope.companyId, custodyRef]
      );
      const custodyEntries = custodyEntriesResult.rows;

      const originalAmount = custodyEntries.reduce(
        (sum: number, e: any) => sum + Number(e.debit || 0), 0
      );
      const custodyAccountCode = custodyEntries[0]?.accountCode || "1400";

      const settlementsResult = await client.query(
        `SELECT jl.credit
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND je.ref LIKE 'CUSTODY-SETTLE-%'
           AND je.description = $2 AND jl."accountCode" = $3`,
        [scope.companyId, custodyRef, custodyAccountCode]
      );
      const settledSoFar = settlementsResult.rows.reduce(
        (sum: number, e: any) => sum + Number(e.credit || 0), 0
      );

      const remaining = originalAmount - settledSoFar;
      if (settleAmount > remaining + 0.01) {
        throw new ConflictError(
          `مبلغ التسوية (${settleAmount}) يتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`,
          {
            field: "amount",
            fix: `أدخل مبلغاً لا يتجاوز ${remaining.toFixed(2)}`,
            meta: { settleAmount, remaining: Number(remaining.toFixed(2)) },
          },
        );
      }

      const sourceAcct = sourceAccountCode || "1100";
      const settleRef = `CUSTODY-SETTLE-${Date.now()}`;
      const { financialEngine } = await import("../lib/engines/index.js");
      const { journalId } = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: settleRef,
        description: custodyRef,
        sourceType: "custody_settlement",
        sourceId: 0,
        sourceKey: `finance:custody_settle:${settleRef}`,
        lines: [
          { accountCode: sourceAcct, debit: Number(amount), credit: 0 },
          { accountCode: custodyAccountCode, debit: 0, credit: Number(amount) },
        ],
      });

      return { journalId, settleRef, remaining };
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.settled",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ custodyRef, amount }),
    }).catch((e) => logger.error(e, "finance-custodies background task failed"));

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "settle",
      entity: "custodies",
      entityId: journalId,
      after: { custodyRef, settleRef, amount: settleAmount, remaining: remaining - settleAmount },
    }).catch((e) => logger.error(e, "finance-custodies background task failed"));

    const [createdSettle] = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json(createdSettle || { id: journalId });
  } catch (err) {
    handleRouteError(err, res, "Settle custody error:");
  }
});

custodiesRouter.post("/custodies/:id/settle", authorize({ feature: "finance.custodies", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const custodyId = parseId(req.params.id, "id");
    const { amount, description, sourceAccountCode } = zodParse(settleCustodyByIdSchema.safeParse(req.body ?? {}));

    const [custody] = await rawQuery<CustodyRefStatusRow>(
      `SELECT je.ref, je.status AS "approvalStatus" FROM journal_entries je
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`,
      [custodyId, scope.companyId]
    );
    if (!custody) throw new NotFoundError("العهدة غير موجودة");

    const blockedStatuses = ["pending_approval", "draft", "rejected", "returned"];
    if (blockedStatuses.includes(custody.approvalStatus)) {
      throw new ConflictError(
        "لا يمكن تسوية عهدة في حالة انتظار الموافقة أو مرفوضة أو مُرجعة",
        {
          field: "approvalStatus",
          fix: "اعتمد العهدة أولاً قبل تسويتها",
          meta: { currentStatus: custody.approvalStatus, blockedStatuses },
        },
      );
    }

    if (!amount) {
      throw new ValidationError("مبلغ التسوية مطلوب", {
        field: "amount",
        fix: "أدخل مبلغ التسوية",
      });
    }

    const settleAmount = Number(amount);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      throw new ValidationError("مبلغ التسوية يجب أن يكون رقم موجب", {
        field: "amount",
        fix: "أدخل مبلغاً أكبر من صفر",
      });
    }

    const { journalId, settleRef, remaining } = await withTransaction(async (client) => {
      // Lock the custody header row to prevent concurrent settlements
      const lockResult = await client.query(
        `SELECT je.id, je.ref FROM journal_entries je
         WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
         FOR UPDATE`,
        [custodyId, scope.companyId]
      );
      if (!lockResult.rows[0]) throw new NotFoundError("العهدة غير موجودة (lock)");

      // Resolve the custody account code from the original journal entry (not hardcoded)
      const custodyLinesResult = await client.query(
        `SELECT jl.debit, jl.credit, jl."accountCode"
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl.debit > 0`,
        [scope.companyId, custody.ref]
      );
      const custodyLines = custodyLinesResult.rows;
      const originalAmount = custodyLines.reduce(
        (sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0
      );
      const custodyAccountCode = custodyLines[0]?.accountCode || "1400";

      const priorSettlementsResult = await client.query(
        `SELECT jl.credit
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND je.ref LIKE 'CUSTODY-SETTLE-%'
           AND je.description = $2 AND jl."accountCode" = $3`,
        [scope.companyId, custody.ref, custodyAccountCode]
      );
      const settledSoFar = priorSettlementsResult.rows.reduce(
        (sum: number, e: any) => sum + Number(e.credit || 0), 0
      );

      const remaining = originalAmount - settledSoFar;
      if (settleAmount > remaining + 0.01) {
        throw new ConflictError(
          `مبلغ التسوية (${settleAmount}) يتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`,
          {
            field: "amount",
            fix: `أدخل مبلغاً لا يتجاوز ${remaining.toFixed(2)}`,
            meta: { settleAmount, remaining: Number(remaining.toFixed(2)) },
          },
        );
      }

      const sourceAcct = sourceAccountCode || "1100";
      const { financialEngine } = await import("../lib/engines/index.js");
      const settleRef = `CUSTODY-SETTLE-${Date.now()}`;
      const { journalId } = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: settleRef,
        description: custody.ref,
        sourceType: "custody_settlement",
        sourceId: 0,
        sourceKey: `finance:custody_settle:${settleRef}`,
        lines: [
          { accountCode: sourceAcct, debit: Number(amount), credit: 0 },
          { accountCode: custodyAccountCode, debit: 0, credit: Number(amount) },
        ],
      });

      return { journalId, settleRef, remaining };
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.settled",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ custodyRef: custody.ref, amount }),
    }).catch((e) => logger.error(e, "finance-custodies background task failed"));

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "settle",
      entity: "custodies",
      entityId: journalId,
      after: { custodyRef: custody.ref, settleRef, amount: settleAmount, remaining: remaining - settleAmount },
    }).catch((e) => logger.error(e, "finance-custodies background task failed"));

    const [createdSettleById] = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json(createdSettleById || { id: journalId });
  } catch (err) {
    handleRouteError(err, res, "Settle custody by ID error:");
  }
});

custodiesRouter.patch("/custodies/:id/approve", authorize({ feature: "finance.custodies", action: "approve", resource: { table: "custodies", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;

    const custodyId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approveCustodySchema.safeParse(req.body ?? {}));

    // Fetch ref for the success message + approval_actions audit row.
    // The engine validates state on the journal_entries row directly.
    const [cust] = await rawQuery<CustodyRefOnlyRow>(
      `SELECT ref FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'CUSTODY%'`,
      [custodyId, scope.companyId]
    );
    if (!cust) throw new NotFoundError("العهدة غير موجودة");

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) {
      throw new ValidationError(
        newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع",
        {
          field: "notes",
          fix: newStatus === "rejected"
            ? "اكتب سبب رفض العهدة"
            : "اكتب سبب إرجاع العهدة لإعادة التقديم",
        },
      );
    }

    // Central lifecycle engine: custody approval goes through the shared
    // `status` column on journal_entries. fromStates=['pending_approval']
    // ensures the same record can't be decided twice. The onApply hook
    // writes the approval_actions audit row inside the same transaction
    // so the approval trail and the state flip are atomic.
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "journal_entries",
      id: custodyId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `custody.${newStatus}`,
      // custodies typically sit in 'pending_approval' until the approver
      // acts. `draft` is included as a fallback for custodies that were
      // created through the bulk-approval chain but never transitioned
      // through the initiator step.
      fromStates: ["pending_approval", "draft"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'CUSTODY%'`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
           VALUES ('custody',$1,$2,$3,$4,$5)`,
          [custodyId, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
      after: { ref: cust.ref, notes: notes ?? null, decision: newStatus },
    });

    const labels: Record<string, string> = {
      approved: "تمت الموافقة",
      rejected: "تم الرفض",
      returned: "تم الإرجاع",
    };
    res.json({
      message: labels[newStatus] || newStatus,
      status: updated.status,
      event: `custody.${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve custody error:");
  }
});
