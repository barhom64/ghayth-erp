import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import {
  emitEvent,
  createAuditLog,
  createJournalEntry,
  initiateApprovalChain,
  getAccountCodeFromMapping,
} from "../lib/businessHelpers.js";
import { assertRole } from "../lib/roleGuards.js";

export const custodiesRouter = Router();
custodiesRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];

custodiesRouter.get("/custodies", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status: filterStatus, employeeId, page = "1", limit: lim = "50", dateFrom, dateTo } = req.query as any;

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

    const rows = await rawQuery<any>(
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

    const settledAmounts = await rawQuery<any>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) {
      settledMap.set(s.originalRef, Number(s.settledAmount));
    }

    const now = new Date();
    let enriched = rows.map((r: any) => {
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
      enriched = enriched.filter((r: any) => r.status === filterStatus);
    }
    if (employeeId) {
      enriched = enriched.filter((r: any) => String(r.assignmentId) === String(employeeId));
    }

    const totalAmount = enriched.reduce((s: number, r: any) => s + r.amount, 0);
    const totalRemaining = enriched.reduce((s: number, r: any) => s + r.remainingAmount, 0);
    const overdueCount = enriched.filter((r: any) => r.status === "overdue").length;
    res.json({
      data: enriched,
      summary: {
        total: enriched.length, totalAmount, totalRemaining,
        activeCount: enriched.filter((r: any) => r.status === "active" || r.status === "partial" || r.status === "overdue").length,
        overdueCount, pendingCount: enriched.filter((r: any) => r.status === "pending").length,
      },
    });
  } catch (err) {
    console.error("Get custodies error:", err);
    res.json({ data: [], summary: { total: 0, totalAmount: 0, totalRemaining: 0, activeCount: 0, overdueCount: 0, pendingCount: 0 } });
  }
});

custodiesRouter.get("/custodies/report", async (req, res) => {
  try {
    const scope = req.scope!;

    const rows = await rawQuery<any>(
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

    const settledAmounts = await rawQuery<any>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) {
      settledMap.set(s.originalRef, Number(s.settledAmount));
    }

    const now = new Date();
    const employeeMap = new Map<string, any>();

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
      const emp = employeeMap.get(empKey);
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

custodiesRouter.get("/custodies/summary", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref,
              COALESCE(SUM(jl.debit), 0) AS amount
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
       GROUP BY je.id, je.ref`,
      [scope.companyId]
    );
    const settledAmounts = await rawQuery<any>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0
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

custodiesRouter.get("/custodies/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    const [custody] = await rawQuery<any>(
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
      [Number(id), scope.companyId]
    );

    if (!custody) throw new NotFoundError("العهدة غير موجودة");

    const settlements = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.credit), 0) AS amount,
              je."createdAt" AS date,
              e2.name AS "settledByName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       LEFT JOIN employee_assignments ea2 ON ea2.id = je."createdBy"
       LEFT JOIN employees e2 ON e2.id = ea2."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE%' AND je.description = $2
       GROUP BY je.id, je.ref, je.description, je."createdAt", e2.name
       ORDER BY je."createdAt" ASC`,
      [scope.companyId, custody.ref]
    );

    const settledAmount = settlements.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const remainingAmount = Math.max(0, Number(custody.amount) - settledAmount);
    const now = new Date();
    const daysOverdue = custody.expectedReturnDate && remainingAmount > 0
      ? Math.max(0, Math.floor((now.getTime() - new Date(custody.expectedReturnDate).getTime()) / 86400000))
      : 0;

    let approvalActions: any[] = [];
    try {
      approvalActions = await rawQuery<any>(
        `SELECT aa.*, u.name AS "actionByName"
         FROM approval_actions aa
         LEFT JOIN users u ON u.id = aa."actionBy"
         WHERE aa."entityType" = 'custody' AND aa."entityId" = $1
         ORDER BY aa."createdAt" ASC`,
        [Number(id)]
      );
    } catch { }

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
      ...approvalActions.map((a: any) => ({
        action: a.action, date: a.createdAt,
        label: a.action === "approved" ? "تمت الموافقة" : a.action === "rejected" ? "تم الرفض" : a.action === "returned" ? "تم الإرجاع" : a.action,
        notes: a.notes, actionBy: a.actionByName,
      })),
      ...settlements.map((s: any) => ({
        action: "settlement", date: s.date, label: "تسوية", amount: Number(s.amount),
        ref: s.ref, settledBy: s.settledByName,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      ...custody,
      amount: Number(custody.amount),
      settledAmount,
      remainingAmount,
      status,
      daysOverdue,
      settlements,
      timeline,
    });
  } catch (err) {
    handleRouteError(err, res, "Get custody detail error:");
  }
});

custodiesRouter.post("/custodies", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { assignmentId, employeeName, amount, description, sourceAccountCode, purpose, expectedReturnDate } = req.body as any;

    if (!amount) {
      throw new ValidationError("المبلغ مطلوب", {
        field: "amount",
        fix: "أدخل مبلغ العهدة",
      });
    }

    let resolvedAssignmentId = assignmentId ? Number(assignmentId) : null;
    let resolvedEmployeeName = employeeName || "";

    if (resolvedAssignmentId) {
      const [emp] = await rawQuery<any>(
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
    let custodyAccountCode = await getAccountCodeFromMapping(scope.companyId, "custody_account", "debit", "1400");
    if (resolvedAssignmentId) {
      const [empRow] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employee_assignments ea JOIN employees e ON e.id = ea."employeeId" WHERE ea.id = $1`,
        [resolvedAssignmentId]
      );
      if (empRow) {
        custodyEmployeeId = empRow.id;
        const [subAcc] = await rawQuery<any>(
          `SELECT ca.code FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
           WHERE sa."companyId" = $1 AND sa."entityType" = 'employee' AND sa."entityId" = $2 AND sa."accountType" = 'custody'`,
          [scope.companyId, empRow.id]
        );
        if (subAcc) custodyAccountCode = subAcc.code;
      }
    }

    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: custodyAssignmentId,
      ref,
      description: description ?? `عهدة ${resolvedEmployeeName}`,
      sourceType: "custody", sourceId: undefined,
      lines: [
        { accountCode: custodyAccountCode, debit: Number(amount), credit: 0, employeeId: custodyEmployeeId ?? undefined },
        { accountCode: sourceAcct, debit: 0, credit: Number(amount) },
      ],
    });

    if (purpose || expectedReturnDate) {
      await rawExecute(
        `UPDATE journal_entries SET notes = $1, "dueDate" = $2 WHERE id = $3`,
        [purpose || null, expectedReturnDate || null, journalId]
      );
    }

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "advances", refType: "custody", refId: journalId,
      amount: Number(amount),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1`,
        [journalId]
      );
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.created",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ ref, assignmentId: custodyAssignmentId, employeeName: resolvedEmployeeName, amount, purpose, expectedReturnDate, approvalRequired: approvalResult.requiresApproval }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "custodies",
      entityId: journalId,
      after: { ref, employeeName: resolvedEmployeeName, amount, purpose, expectedReturnDate },
    }).catch(console.error);

    const entityStatus = approvalResult.requiresApproval ? "pending_approval" : "active";
    res.status(201).json({ id: journalId, ref, employeeName: resolvedEmployeeName, assignmentId: custodyAssignmentId, amount, description, purpose, expectedReturnDate, status: entityStatus, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Create custody error:");
  }
});

custodiesRouter.post("/custodies/settle", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { custodyRef, amount, description, sourceAccountCode } = req.body as any;

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

    const [custodyHeader] = await rawQuery<any>(
      `SELECT je.id, je.status AS "approvalStatus"
       FROM journal_entries je
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`,
      [scope.companyId, custodyRef]
    );

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

    const custodyEntries = await rawQuery<any>(
      `SELECT je.id, jl.debit, jl.credit, jl."accountCode"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl.debit > 0`,
      [scope.companyId, custodyRef]
    );

    const originalAmount = custodyEntries.reduce(
      (sum: number, e: any) => sum + Number(e.debit || 0), 0
    );
    const custodyAccountCode = custodyEntries[0]?.accountCode || "1400";

    const settlements = await rawQuery<any>(
      `SELECT jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE-%'
         AND je.description = $2 AND jl."accountCode" = $3`,
      [scope.companyId, custodyRef, custodyAccountCode]
    );
    const settledSoFar = settlements.reduce(
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
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: settleRef,
      description: custodyRef,
      sourceType: "custody_settlement",
      lines: [
        { accountCode: sourceAcct, debit: Number(amount), credit: 0 },
        { accountCode: custodyAccountCode, debit: 0, credit: Number(amount) },
      ],
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.settled",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ custodyRef, amount }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "settle",
      entity: "custodies",
      entityId: journalId,
      after: { custodyRef, settleRef, amount: settleAmount, remaining: remaining - settleAmount },
    }).catch(console.error);

    res.status(201).json({ id: journalId, ref: settleRef, custodyRef, amount, description });
  } catch (err) {
    handleRouteError(err, res, "Settle custody error:");
  }
});

custodiesRouter.post("/custodies/:id/settle", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const custodyId = Number(req.params.id);
    const { amount, description, sourceAccountCode } = req.body as any;

    const [custody] = await rawQuery<any>(
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

    const custodyLines = await rawQuery<any>(
      `SELECT jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl."accountCode" = '1400'`,
      [scope.companyId, custody.ref]
    );
    const originalAmount = custodyLines.reduce(
      (sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0
    );

    const priorSettlements = await rawQuery<any>(
      `SELECT jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE-%'
         AND je.description = $2 AND jl."accountCode" = '1400'`,
      [scope.companyId, custody.ref]
    );
    const settledSoFar = priorSettlements.reduce(
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
    const custodyAcctCode = await getAccountCodeFromMapping(scope.companyId, "custody_account", "debit", "1400");
    const settleRef = `CUSTODY-SETTLE-${Date.now()}`;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: settleRef,
      description: custody.ref,
      sourceType: "custody_settlement",
      lines: [
        { accountCode: sourceAcct, debit: Number(amount), credit: 0 },
        { accountCode: custodyAcctCode, debit: 0, credit: Number(amount) },
      ],
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.settled",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ custodyRef: custody.ref, amount }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "settle",
      entity: "custodies",
      entityId: journalId,
      after: { custodyRef: custody.ref, settleRef, amount: settleAmount, remaining: remaining - settleAmount },
    }).catch(console.error);

    res.status(201).json({ id: journalId, ref: settleRef, custodyRef: custody.ref, amount, description });
  } catch (err) {
    handleRouteError(err, res, "Settle custody by ID error:");
  }
});

custodiesRouter.patch("/custodies/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const custodyId = Number(req.params.id);
    const { approved, notes } = req.body as any;

    // Fetch ref for the success message + approval_actions audit row.
    // The engine validates state on the journal_entries row directly.
    const [cust] = await rawQuery<any>(
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
    const updated = await applyTransition<any>({
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
