import { eventBus, registerCrossDomainHandler, type EventPayload } from "./eventBus.js";
import { pool, rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import { createNotification, getManagerAssignmentId, createGuardedJournalEntry, getAccountCodeFromMapping, todayISO, toDateISO, currentYear, currentMonthPadded, createAuditLog } from "./businessHelpers.js";
import { computeDiff } from "./auditDiff.js";
import {
  INBOX_RULES,
  SLA_HOURS_BY_PRIORITY,
  classifyInboxMessage,
  liftPriorityForClassification,
  type Priority,
} from "./inboxClassifier.js";
import { calculateAllForCompany } from "./umrahCommissionEngine.js";
import { registerObligation, markObligationMet } from "./obligationsEngine.js";
import { warehouseEngine } from "./engines/warehouseEngine.js";
import { notifyBusinessEvent } from "./notifyBusinessEvent.js";
import { sendMessage } from "./messageSender.js";
import { pickBestMatch, composeAutoReplyBody } from "./inboxAutoReply.js";

async function logEvent(event: string, payload: EventPayload) {
  try {
    await pool.query(
      `INSERT INTO event_logs ("companyId","userId",action,entity,"entityId",details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        payload.companyId ?? null,
        payload.userId ?? null,
        event,
        payload.entity ?? event.split(".")[0],
        payload.entityId ?? null,
        payload.details ? JSON.stringify(payload.details) : null,
      ]
    );
  } catch (err) {
    logger.error(err, `[EventLog] Failed to log ${event}:`);
  }
}

async function logAudit(event: string, payload: EventPayload) {
  try {
    const before = payload.before as Record<string, unknown> | null | undefined;
    const after = payload.after as Record<string, unknown> | null | undefined;
    const changes = payload.changes || computeDiff(before ?? null, after ?? null);
    const reason = (payload.reason as string) ?? null;
    const approvalStep = (payload.approvalStep as string) ?? null;
    const workflowId = (payload.workflowId as string) ?? null;

    const scope = approvalStep || workflowId
      ? JSON.stringify({ approvalStep, workflowId })
      : null;

    // RBAC-001 (#1413 §9): persist the role (capacity) the action was
    // performed under, supplied by auditMiddleware from scope.selectedRoleKey.
    const activeRoleKey = (payload.activeRoleKey as string) ?? null;

    // IGOC-001 (migration 284): three additional context fields. All
    // back-compatible — when the emitter didn't pass them, the columns
    // stay null and existing audit rows are unaffected.
    const activeDepartmentId = (payload.activeDepartmentId as number) ?? null;
    const resolvedScope = (payload.resolvedScope as string) ?? null;
    const impersonationSourceUser = (payload.impersonationSourceUser as number) ?? null;

    await pool.query(
      `INSERT INTO audit_logs (
         "companyId","branchId","userId",action,entity,"entityId",
         "before","after","changes","reason","scope",
         "active_role_key","active_department_id","resolved_scope","impersonation_source_user"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        payload.companyId ?? null,
        payload.branchId ?? null,
        payload.userId ?? null,
        payload.action ?? event,
        payload.entity ?? event.split(".")[0],
        payload.entityId ? String(payload.entityId) : null,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        changes && (Array.isArray(changes) ? changes.length > 0 : true) ? JSON.stringify(changes) : null,
        reason,
        scope,
        activeRoleKey,
        activeDepartmentId,
        resolvedScope,
        impersonationSourceUser,
      ]
    );
  } catch (err) {
    logger.error(err, `[AuditLog] Failed to audit ${event}:`);
  }
}

// M1 — guard against duplicate registration. A second call (test setup,
// hot-reload, blue/green) would otherwise double every audit/log/GL
// listener; the payroll-commission reclass at line ~820 would attempt to
// post the same journal entry twice (sourceKey dedupe still saves the
// books, but the second attempt logs "duplicate" errors and burns
// connections).
let _registered = false;

export function registerEventListeners() {
  if (_registered) return;
  _registered = true;
  eventBus.on("employee.created", async (payload) => {
    await logEvent("employee.created", payload);
    await logAudit("employee.created", { ...payload, action: "create" });
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      if (managerId) {
        await createNotification({
          companyId: payload.companyId,
          assignmentId: managerId,
          type: "hr",
          title: "موظف جديد",
          body: `تم إضافة موظف جديد: ${payload.employeeName || ""}`,
          priority: "normal",
          refType: "employee",
          refId: payload.entityId as number,
          actionUrl: `/employees/${payload.entityId}`,
        });
      }
    }
  });

  eventBus.on("employee.updated", async (payload) => {
    await logEvent("employee.updated", payload);
    await logAudit("employee.updated", { ...payload, action: "update" });
  });

  eventBus.on("invoice.created", async (payload) => {
    await logEvent("invoice.created", payload);
    await logAudit("invoice.created", { ...payload, action: "create" });
    if (payload.companyId && payload.entityId) {
      const [inv] = await rawQuery<{
        ref: string | null;
        total: string | number | null;
        clientId: number | null;
        clientName: string | null;
        branchId: number | null;
      }>(
        `SELECT i.ref, i.total, i."clientId", c."name" AS "clientName", i."branchId"
         FROM invoices i LEFT JOIN clients c ON c.id = i."clientId"
         WHERE i.id = $1 AND i."companyId" = $2 LIMIT 1`,
        [payload.entityId as number, payload.companyId],
      ).catch(() => [] as Array<{ ref: string | null; total: string | number | null; clientId: number | null; clientName: string | null; branchId: number | null }>);

      const branchId = inv?.branchId ?? (payload.branchId as number | undefined) ?? null;
      const managerId = branchId ? await getManagerAssignmentId(payload.companyId, branchId) : null;
      const invoiceRef = inv?.ref ?? `${payload.entityId}`;
      const customerName = inv?.clientName ?? "—";
      const amount = inv?.total != null ? String(inv.total) : "0";

      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "invoice.created",
        templateVars: { invoiceRef, customerName, amount },
        fallbackTitle: "فاتورة جديدة",
        fallbackBody: `تم إنشاء فاتورة #${invoiceRef}`,
        assignmentId: managerId ?? undefined,
        recipientUser: inv?.clientId ? { type: "client", id: inv.clientId } : undefined,
        priority: "normal",
        refType: "invoice",
        refId: payload.entityId as number,
        actionUrl: `/finance/invoices/${payload.entityId}`,
      });
    }
  });

  eventBus.on("invoice.updated", async (payload) => {
    await logEvent("invoice.updated", payload);
    await logAudit("invoice.updated", { ...payload, action: "update" });
  });

  eventBus.on("invoice.paid", async (payload) => {
    await logEvent("invoice.paid", payload);
    await logAudit("invoice.paid", { ...payload, action: "update" });

    // Cross-module: mark financial obligation as fulfilled
    if (payload.companyId && payload.entityId) {
      await markObligationMet(payload.companyId, "invoices", payload.entityId as number, "payment").catch((e) => logger.error(e, "event listener background task failed"));

      const [inv] = await rawQuery<{
        ref: string | null;
        total: string | number | null;
        clientId: number | null;
      }>(
        `SELECT ref, total, "clientId" FROM invoices WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
        [payload.entityId as number, payload.companyId],
      ).catch(() => [] as Array<{ ref: string | null; total: string | number | null; clientId: number | null }>);

      const invoiceRef = inv?.ref ?? `${payload.entityId}`;
      const amount = inv?.total != null ? String(inv.total) : "0";

      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "invoice.paid",
        templateVars: { invoiceRef, amount },
        fallbackTitle: "تم سداد الفاتورة",
        fallbackBody: `تم سداد الفاتورة #${invoiceRef}`,
        recipientUser: inv?.clientId ? { type: "client", id: inv.clientId } : undefined,
        priority: "normal",
        refType: "invoice",
        refId: payload.entityId as number,
        actionUrl: `/finance/invoices/${payload.entityId}`,
      });
    }
  });

  eventBus.on("leave.requested", async (payload) => {
    await logEvent("leave.requested", payload);
    await logAudit("leave.requested", { ...payload, action: "create" });
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      const employeeName = String(payload.employeeName ?? "موظف");
      const leaveType = String(payload.leaveType ?? "—");
      const startDate = String(payload.startDate ?? "—");
      const endDate = String(payload.endDate ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "leave.request.created",
        templateVars: { employeeName, leaveType, startDate, endDate },
        fallbackTitle: "طلب إجازة جديد",
        fallbackBody: `طلب إجازة من ${employeeName} - ${leaveType}`,
        assignmentId: managerId ?? undefined,
        priority: "high",
        refType: "leave_request",
        refId: payload.entityId as number,
        actionUrl: `/hr/leaves`,
      });
    }
  });

  eventBus.on("leave.approved", async (payload) => {
    await logEvent("leave.approved", payload);
    await logAudit("leave.approved", { ...payload, action: "approve" });
    if (payload.companyId && payload.assignmentId) {
      const leaveType = String(payload.leaveType ?? "—");
      const startDate = String(payload.startDate ?? "—");
      const endDate = String(payload.endDate ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "leave.request.approved",
        templateVars: { leaveType, startDate, endDate },
        fallbackTitle: "تمت الموافقة على إجازتك",
        fallbackBody: "تمت الموافقة على طلب الإجازة الخاص بك",
        assignmentId: payload.assignmentId as number,
        priority: "normal",
        refType: "leave_request",
        refId: payload.entityId as number,
        actionUrl: `/hr/leaves/${payload.entityId}`,
      });
    }
  });

  eventBus.on("leave.rejected", async (payload) => {
    await logEvent("leave.rejected", payload);
    await logAudit("leave.rejected", { ...payload, action: "reject" });
    if (payload.companyId && payload.assignmentId) {
      const leaveType = String(payload.leaveType ?? "—");
      const reason = String(payload.reason ?? "غير محدد");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "leave.request.rejected",
        templateVars: { leaveType, reason },
        fallbackTitle: "تم رفض إجازتك",
        fallbackBody: `تم رفض طلب الإجازة الخاص بك. السبب: ${reason}`,
        assignmentId: payload.assignmentId as number,
        priority: "normal",
        refType: "leave_request",
        refId: payload.entityId as number,
        actionUrl: `/hr/leaves/${payload.entityId}`,
      });
    }
  });

  // Return-to-work closure (emitted by the daily leave_return_to_work_closure
  // cron when an approved leave's endDate has passed). Without this subscriber
  // the completion transition would leave no row in audit_logs.
  eventBus.on("leave.completed", async (payload) => {
    await logEvent("leave.completed", payload);
    await logAudit("leave.completed", { ...payload, action: "complete" });
  });

  eventBus.on("attendance.checkin", async (payload) => {
    await logEvent("attendance.checkin", payload);
    await logAudit("attendance.checkin", { ...payload, action: "create" });
  });

  eventBus.on("attendance.checkout", async (payload) => {
    await logEvent("attendance.checkout", payload);
    await logAudit("attendance.checkout", { ...payload, action: "update" });
  });

  eventBus.on("purchase_request.created", async (payload) => {
    await logEvent("purchase_request.created", payload);
    await logAudit("purchase_request.created", { ...payload, action: "create" });
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      const prNumber = String(payload.entityId ?? "—");
      const requesterName = String(payload.requesterName ?? "—");
      const amount = String(payload.amount ?? "0");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "purchase_request.created",
        templateVars: { prNumber, requesterName, amount },
        fallbackTitle: "طلب شراء",
        fallbackBody: `طلب شراء جديد #${prNumber} من ${requesterName}`,
        assignmentId: managerId ?? undefined,
        priority: "normal",
        refType: "purchase_request",
        refId: payload.entityId as number,
        actionUrl: `/finance/purchase-requests/${payload.entityId}`,
      });
    }
  });

  eventBus.on("purchase_request.approved", async (payload) => {
    await logEvent("purchase_request.approved", payload);
    await logAudit("purchase_request.approved", { ...payload, action: "approve" });
  });

  eventBus.on("crm.opportunity.created", async (payload) => {
    await logEvent("crm.opportunity.created", payload);
    await logAudit("crm.opportunity.created", { ...payload, action: "create" });
  });

  eventBus.on("crm.deal.won", async (payload) => {
    await logEvent("crm.deal.won", payload);
    await logAudit("crm.deal.won", { ...payload, action: "update" });
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      const opportunityName = String(payload.opportunityName ?? payload.title ?? "—");
      const amount = String(payload.amount ?? payload.value ?? "0");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "opportunity.won",
        templateVars: { opportunityName, amount },
        fallbackTitle: "فرصة بيع مكتسبة",
        fallbackBody: `تم كسب الفرصة ${opportunityName}`,
        assignmentId: managerId ?? undefined,
        priority: "high",
        refType: "opportunity",
        refId: payload.entityId as number,
        actionUrl: `/crm/${payload.entityId}`,
      });
    }
  });

  eventBus.on("crm.deal.lost", async (payload) => {
    await logEvent("crm.deal.lost", payload);
    await logAudit("crm.deal.lost", { ...payload, action: "update" });
  });

  eventBus.on("task.created", async (payload) => {
    await logEvent("task.created", payload);
    await logAudit("task.created", { ...payload, action: "create" });
    if (payload.companyId && payload.assigneeAssignmentId) {
      const taskTitle = String(payload.taskTitle ?? "");
      const dueDate = String(payload.dueDate ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "task.assigned",
        templateVars: { taskTitle, dueDate },
        fallbackTitle: "مهمة جديدة",
        fallbackBody: `تم تعيين مهمة جديدة لك: ${taskTitle}`,
        assignmentId: payload.assigneeAssignmentId as number,
        priority: "normal",
        refType: "task",
        refId: payload.entityId as number,
        actionUrl: `/tasks/${payload.entityId}`,
      });
    }
  });

  eventBus.on("task.completed", async (payload) => {
    await logEvent("task.completed", payload);
    await logAudit("task.completed", { ...payload, action: "update" });
  });

  eventBus.on("support.ticket.created", async (payload) => {
    await logEvent("support.ticket.created", payload);
    await logAudit("support.ticket.created", { ...payload, action: "create" });
    if (payload.companyId && payload.entityId) {
      const ticketId = String(payload.entityId);
      const subject = String(payload.subject ?? payload.title ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "support.ticket.created",
        templateVars: { ticketId, subject },
        fallbackTitle: "تذكرة دعم جديدة",
        fallbackBody: `تم فتح تذكرة #${ticketId} — ${subject}`,
        priority: "normal",
        refType: "support_ticket",
        refId: payload.entityId as number,
        actionUrl: `/support/${payload.entityId}`,
      });
    }
  });

  eventBus.on("support.ticket.resolved", async (payload) => {
    await logEvent("support.ticket.resolved", payload);
    await logAudit("support.ticket.resolved", { ...payload, action: "resolve", entity: "support_tickets" });
    if (payload.companyId && payload.entityId) {
      const ticketId = String(payload.entityId);
      const subject = String(payload.subject ?? payload.title ?? "—");
      const reporterUserId = (payload.reporterUserId ?? payload.userId) as number | undefined;
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "support.ticket.resolved",
        templateVars: { ticketId, subject },
        fallbackTitle: "تم حل التذكرة",
        fallbackBody: `تم حل التذكرة #${ticketId}`,
        recipientUser: reporterUserId ? { type: "user", id: reporterUserId } : undefined,
        priority: "normal",
        refType: "support_ticket",
        refId: payload.entityId as number,
        actionUrl: `/support/${payload.entityId}`,
      });
    }
  });

  // Phase C — Support domain audit. Every lifecycle transition on a
  // ticket now has a dedicated event and a listener behind it so the
  // support inbox audit trail sees every status change, assignment,
  // and deletion. Was previously only firing on the resolve path.
  eventBus.on("support.ticket.status_changed", async (payload) => {
    await logEvent("support.ticket.status_changed", payload);
    await logAudit("support.ticket.status_changed", { ...payload, action: "status_change", entity: "support_tickets" });
  });
  eventBus.on("support.ticket.closed", async (payload) => {
    await logEvent("support.ticket.closed", payload);
    await logAudit("support.ticket.closed", { ...payload, action: "close", entity: "support_tickets" });
  });
  eventBus.on("support.ticket.assigned", async (payload) => {
    await logEvent("support.ticket.assigned", payload);
    await logAudit("support.ticket.assigned", { ...payload, action: "assign", entity: "support_tickets" });
    if (payload.companyId && payload.entityId && payload.assigneeAssignmentId) {
      const ticketId = String(payload.entityId);
      const subject = String(payload.subject ?? payload.title ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "support.ticket.assigned",
        templateVars: { ticketId, subject },
        fallbackTitle: "تذكرة مُسندة لك",
        fallbackBody: `تم إسناد التذكرة #${ticketId}`,
        assignmentId: payload.assigneeAssignmentId as number,
        priority: "normal",
        refType: "support_ticket",
        refId: payload.entityId as number,
        actionUrl: `/support/${payload.entityId}`,
      });
    }
  });
  eventBus.on("support.ticket.deleted", async (payload) => {
    await logEvent("support.ticket.deleted", payload);
    await logAudit("support.ticket.deleted", { ...payload, action: "delete", entity: "support_tickets" });
  });

  eventBus.on("fleet.trip.started", async (payload) => {
    await logEvent("fleet.trip.started", payload);
    await logAudit("fleet.trip.started", { ...payload, action: "create" });
  });

  eventBus.on("fleet.trip.completed", async (payload) => {
    await logEvent("fleet.trip.completed", payload);
    await logAudit("fleet.trip.completed", { ...payload, action: "update" });
    // سدّ فجوة الدفتر: أي إكمال رحلة (سائق أو مدير) يُرحّل قيد تكلفتها. المسار
    // الإداري يُرحّل مباشرة فيصبح هذا no-op (idempotent عبر fleet:trip:<id>)؛
    // إكمال السائق — الذي لا يُرحّل في مساره — يُكلَّف هنا. «الحقيقة التشغيلية
    // ← المالية تشتق» بصرف النظر عمّن أكمل.
    if (payload.companyId && payload.entityId) {
      try {
        const { fleetEngine } = await import("./engines/index.js");
        await fleetEngine.computeAndPostTripGL(
          { companyId: payload.companyId as number, branchId: (payload.branchId as number) ?? 0, createdBy: (payload.userId as number) ?? 0 },
          payload.entityId as number,
        );
      } catch (err) { logger.error(err, "[trip.completed] deferred trip GL post failed"); }
    }
  });

  // Phase C.8 — warehouse product lifecycle listeners
  eventBus.on("warehouse.product.created", async (payload) => {
    await logEvent("warehouse.product.created", payload);
    await logAudit("warehouse.product.created", { ...payload, action: "create", entity: "warehouse_product" });
  });
  eventBus.on("warehouse.product.updated", async (payload) => {
    await logEvent("warehouse.product.updated", payload);
    await logAudit("warehouse.product.updated", { ...payload, action: "update", entity: "warehouse_product" });
  });
  eventBus.on("warehouse.product.deleted", async (payload) => {
    await logEvent("warehouse.product.deleted", payload);
    await logAudit("warehouse.product.deleted", { ...payload, action: "delete", entity: "warehouse_product" });
  });
  eventBus.on("warehouse.movement.created", async (payload) => {
    await logEvent("warehouse.movement.created", payload);
    await logAudit("warehouse.movement.created", { ...payload, action: "create" });
  });

  eventBus.on("payroll.completed", async (payload) => {
    await logEvent("payroll.completed", payload);
    await logAudit("payroll.completed", { ...payload, action: "create" });
    // Fan out a "payslip ready" notification to every employee in the
    // run — each through their own channels (email/sms/whatsapp) in
    // their preferred language, with their own net amount.
    if (payload.companyId && payload.entityId) {
      const lines = await rawQuery<{
        employeeId: number | null;
        netSalary: string | number | null;
        period: string | null;
        assignmentId: number | null;
      }>(
        `SELECT pl."employeeId", pl."netSalary", pr.period,
                ea.id AS "assignmentId"
         FROM payroll_lines pl
         JOIN payroll_runs pr ON pr.id = pl."runId"
         LEFT JOIN employee_assignments ea
                ON ea."employeeId" = pl."employeeId"
               AND ea."companyId" = pr."companyId"
               AND ea.status = 'active'
         WHERE pl."runId" = $1 AND pr."companyId" = $2 AND pl."deletedAt" IS NULL`,
        [payload.entityId as number, payload.companyId],
      ).catch(() => [] as Array<{ employeeId: number | null; netSalary: string | number | null; period: string | null; assignmentId: number | null }>);

      for (const line of lines) {
        if (!line.employeeId) continue;
        const month = String(line.period ?? "—");
        const amount = line.netSalary != null ? String(line.netSalary) : "0";
        await notifyBusinessEvent({
          companyId: payload.companyId,
          templateKey: "payroll.ready",
          templateVars: { month, amount },
          fallbackTitle: "كشف الراتب جاهز",
          fallbackBody: `كشف راتب شهر ${month} جاهز للمراجعة`,
          assignmentId: line.assignmentId ?? undefined,
          recipientUser: { type: "employee", id: line.employeeId },
          priority: "normal",
          refType: "payroll_run",
          refId: payload.entityId as number,
          actionUrl: `/my-payslip`,
        });
      }
    }
  });

  eventBus.on("journal.entry.created", async (payload) => {
    await logEvent("journal.entry.created", payload);
    await logAudit("journal.entry.created", { ...payload, action: "create" });
  });

  eventBus.on("settings.updated", async (payload) => {
    await logEvent("settings.updated", payload);
    await logAudit("settings.updated", { ...payload, action: "update" });
  });

  eventBus.on("company.created", async (payload) => {
    await logEvent("company.created", payload);
    await logAudit("company.created", { ...payload, action: "create" });
  });

  eventBus.on("expense.created", async (payload) => {
    await logEvent("expense.created", payload);
    await logAudit("expense.created", { ...payload, action: "create" });

    // Cross-module: register payment obligation for the expense
    if (payload.companyId && payload.entityId) {
      try {
        const details = typeof payload.details === "string" ? JSON.parse(payload.details) : (payload.details ?? {});
        if (Number(details.amount) > 0) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 14);
          await registerObligation({
            companyId: payload.companyId,
            branchId: payload.branchId as number,
            entityType: "expenses",
            entityId: payload.entityId as number,
            obligationType: "payment",
            title: `مصروف #${payload.entityId} — ${Number(details.amount)} ر.س`,
            dueAt: dueDate,
            dedupeKey: `expense-${payload.entityId}`,
          });
        }
      } catch (oblErr) {
        await rawExecute(
          `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
           VALUES ($1,$2,$3,$4,false)`,
          [payload.companyId, "expense_obligation", payload.entityId ?? 0,
           `فشل تسجيل التزام المصروف: ${String(oblErr)}`]
        ).catch((e) => logger.error(e, "event listener background task failed"));
      }
    }
  });

  eventBus.on("vendor.created", async (payload) => {
    await logEvent("vendor.created", payload);
    await logAudit("vendor.created", { ...payload, action: "create" });
  });

  eventBus.on("voucher.receipt_created", async (payload) => {
    await logEvent("voucher.receipt_created", payload);
    await logAudit("voucher.receipt_created", { ...payload, action: "create" });
  });

  eventBus.on("voucher.payment_created", async (payload) => {
    await logEvent("voucher.payment_created", payload);
    await logAudit("voucher.payment_created", { ...payload, action: "create" });
  });

  eventBus.on("custody.created", async (payload) => {
    await logEvent("custody.created", payload);
    await logAudit("custody.created", { ...payload, action: "create" });
  });

  eventBus.on("custody.settled", async (payload) => {
    await logEvent("custody.settled", payload);
    await logAudit("custody.settled", { ...payload, action: "update" });
  });

  eventBus.on("purchase_order.created", async (payload) => {
    await logEvent("purchase_order.created", payload);
    await logAudit("purchase_order.created", { ...payload, action: "create" });
  });

  eventBus.on("purchase_request.rejected", async (payload) => {
    await logEvent("purchase_request.rejected", payload);
    await logAudit("purchase_request.rejected", { ...payload, action: "reject" });
  });

  eventBus.on("leave.escalated", async (payload) => {
    await logEvent("leave.escalated", payload);
    await logAudit("leave.escalated", { ...payload, action: "escalate" });
  });

  // ──────────────────────────────────────────────────────────────────────
  // HR discipline — memo lifecycle
  // Every state transition already writes a row into `hr_inquiry_memo_events`
  // (the per-memo timeline), and notifications are dispatched directly from
  // the route handlers. These subscribers add the system-wide audit-log and
  // event-log rows so the memo history is visible in the global audit trail
  // the same way any other entity's history is.
  // ──────────────────────────────────────────────────────────────────────
  eventBus.on("hr.memo.created", async (payload) => {
    await logEvent("hr.memo.created", payload);
    await logAudit("hr.memo.created", { ...payload, action: "create", entity: "hr_inquiry_memo" });
  });

  eventBus.on("hr.memo.justified", async (payload) => {
    await logEvent("hr.memo.justified", payload);
    await logAudit("hr.memo.justified", { ...payload, action: "justify", entity: "hr_inquiry_memo" });
  });

  eventBus.on("hr.memo.manager_recommended", async (payload) => {
    await logEvent("hr.memo.manager_recommended", payload);
    await logAudit("hr.memo.manager_recommended", {
      ...payload,
      action: "manager_recommend",
      entity: "hr_inquiry_memo",
    });
  });

  eventBus.on("hr.memo.gm_decided", async (payload) => {
    await logEvent("hr.memo.gm_decided", payload);
    await logAudit("hr.memo.gm_decided", {
      ...payload,
      action: "gm_decide",
      entity: "hr_inquiry_memo",
    });
  });

  // Auto-escalation fired by the inquiry_memo_escalation cron when a memo
  // has been sitting in pending_employee for >72h. Keeps the global audit
  // trail aligned with the per-memo timeline row inserted by the cron.
  eventBus.on("hr.memo.auto_escalated", async (payload) => {
    await logEvent("hr.memo.auto_escalated", payload);
    await logAudit("hr.memo.auto_escalated", {
      ...payload,
      action: "auto_escalate",
      entity: "hr_inquiry_memo",
    });
  });

  eventBus.on("hr.memo.cancelled", async (payload) => {
    await logEvent("hr.memo.cancelled", payload);
    await logAudit("hr.memo.cancelled", { ...payload, action: "cancel", entity: "hr_inquiry_memo" });
  });

  // HR transfers — Step 3 of the HR operational audit. Every transfer
  // lifecycle event is mirrored into audit_logs + event_logs so the
  // transfer inbox can reconstruct who decided what and when, and so the
  // rules engine can react (e.g. email the employee, update payroll
  // proration) without the routes having to call audit helpers directly.
  eventBus.on("hr.transfer.requested", async (payload) => {
    await logEvent("hr.transfer.requested", payload);
    await logAudit("hr.transfer.requested", { ...payload, action: "request", entity: "employee_transfers" });
  });
  eventBus.on("hr.transfer.hr_approved", async (payload) => {
    await logEvent("hr.transfer.hr_approved", payload);
    await logAudit("hr.transfer.hr_approved", { ...payload, action: "hr_approve", entity: "employee_transfers" });
  });
  eventBus.on("hr.transfer.rejected", async (payload) => {
    await logEvent("hr.transfer.rejected", payload);
    await logAudit("hr.transfer.rejected", { ...payload, action: "reject", entity: "employee_transfers" });
  });
  eventBus.on("hr.transfer.completed", async (payload) => {
    await logEvent("hr.transfer.completed", payload);
    await logAudit("hr.transfer.completed", { ...payload, action: "complete", entity: "employee_transfers" });
  });
  eventBus.on("hr.transfer.rejected_by_receiver", async (payload) => {
    await logEvent("hr.transfer.rejected_by_receiver", payload);
    await logAudit("hr.transfer.rejected_by_receiver", { ...payload, action: "reject_by_receiver", entity: "employee_transfers" });
  });

  // Official letters — when a letter is approved, queue it for delivery
  // and mark it as sent. Without this subscriber the approval route stops
  // at status='approved' and the letter never reaches the recipient.
  eventBus.on("hr.letter.approved", async (payload) => {
    await logEvent("hr.letter.approved", payload);
    await logAudit("hr.letter.approved", { ...payload, action: "approve", entity: "official_letter" });

    try {
      const letterId = Number(payload.entityId);
      if (!letterId || !payload.companyId) return;

      const [letter] = await rawQuery<Record<string, unknown>>(
        `SELECT ol.*, e.name AS "employeeName", e.email AS "employeeEmail", e.phone AS "employeePhone"
         FROM official_letters ol
         LEFT JOIN employees e ON e.id = ol."employeeId" AND e."deletedAt" IS NULL
         WHERE ol.id = $1 AND ol."companyId" = $2 AND ol."deletedAt" IS NULL`,
        [letterId, payload.companyId]
      );

      if (!letter) return;
      if (letter.sentAt) return; // already dispatched

      const subject = letter.subject || `خطاب رسمي #${letterId}`;
      const body = letter.content || subject;

      if (letter.employeeEmail) {
        await rawExecute(
          `INSERT INTO outbound_queue
             ("companyId", channel, recipient, "recipientName", subject, body,
              status, "refType", "refId", "createdAt", "updatedAt")
           VALUES ($1, 'email', $2, $3, $4, $5, 'pending', 'official_letter', $6, NOW(), NOW())`,
          [payload.companyId, letter.employeeEmail, letter.employeeName ?? null, subject, body, letterId]
        );
      }

      // WhatsApp copy if we have a phone.
      if (letter.employeePhone) {
        await rawExecute(
          `INSERT INTO outbound_queue
             ("companyId", channel, recipient, body, status,
              "refType", "refId", "createdAt", "updatedAt")
           VALUES ($1, 'whatsapp', $2, $3, 'pending', 'official_letter', $4, NOW(), NOW())`,
          [payload.companyId, letter.employeePhone, `${subject}\n\n${body}`, letterId]
        );
      }

      // Mark the letter as dispatched so we never double-queue it.
      await rawExecute(
        `UPDATE official_letters SET "sentAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "sentAt" IS NULL AND "deletedAt" IS NULL`,
        [letterId, payload.companyId]
      );

      // Notify HR management that the letter went out.
      if (payload.branchId) {
        const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
        if (managerId) {
          await createNotification({
            companyId: payload.companyId,
            assignmentId: managerId,
            type: "hr",
            title: "تم إرسال خطاب رسمي",
            body: `تم إرسال الخطاب: ${subject}`,
            priority: "normal",
            refType: "official_letter",
            refId: letterId,
            actionUrl: `/hr/letters/${letterId}`,
          });
        }
      }
    } catch (err) {
      await rawExecute(
        `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
         VALUES ($1,$2,$3,$4,false)`,
        [payload.companyId, "hr_letter_dispatch", payload.entityId ?? 0,
         `فشل إرسال الخطاب الرسمي: ${String(err)}`]
      ).catch((e) => logger.error(e, "event listener background task failed"));
    }
  });

  eventBus.on("hr.letter.rejected", async (payload) => {
    await logEvent("hr.letter.rejected", payload);
    await logAudit("hr.letter.rejected", { ...payload, action: "reject", entity: "official_letter" });
  });

  eventBus.on("hr.letter.returned", async (payload) => {
    await logEvent("hr.letter.returned", payload);
    await logAudit("hr.letter.returned", { ...payload, action: "return", entity: "official_letter" });
  });

  eventBus.on("hr.discipline.regulation.create", async (payload) => {
    await logEvent("hr.discipline.regulation.create", payload);
  });
  eventBus.on("hr.discipline.regulation.update", async (payload) => {
    await logEvent("hr.discipline.regulation.update", payload);
  });
  eventBus.on("hr.discipline.regulation.delete", async (payload) => {
    await logEvent("hr.discipline.regulation.delete", payload);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Audit/event-log closure pass — 2026-04-13
  //
  // Static audit of every `emitEvent(action: "...")` call across routes and
  // lib modules revealed 67 distinct event names that were being broadcast
  // without a matching `eventBus.on(...)` subscriber. Their rows still
  // landed in event_logs (emitEvent writes directly), but audit_logs never
  // saw them because logAudit only runs inside listeners. Each listener
  // below follows the same logEvent + logAudit pattern used everywhere
  // else in this file. Grouped by domain for readability.
  // ──────────────────────────────────────────────────────────────────────

  // ── Obligations engine (global system events from obligationsEngine.ts) ──
  eventBus.on("system.obligation.breached", async (payload) => {
    await logEvent("system.obligation.breached", payload);
    await logAudit("system.obligation.breached", { ...payload, action: "breach", entity: "system_obligation" });
  });
  eventBus.on("system.obligation.escalated", async (payload) => {
    await logEvent("system.obligation.escalated", payload);
    await logAudit("system.obligation.escalated", { ...payload, action: "escalate", entity: "system_obligation" });
  });

  // ── Legal — case + contract lifecycle ──
  eventBus.on("legal.case.created", async (payload) => {
    await logEvent("legal.case.created", payload);
    await logAudit("legal.case.created", { ...payload, action: "create", entity: "legal_case" });
  });
  eventBus.on("legal.case.closed", async (payload) => {
    await logEvent("legal.case.closed", payload);
    await logAudit("legal.case.closed", { ...payload, action: "close", entity: "legal_case" });
  });
  eventBus.on("legal.case.judgment", async (payload) => {
    await logEvent("legal.case.judgment", payload);
    await logAudit("legal.case.judgment", { ...payload, action: "judgment", entity: "legal_case" });
  });
  eventBus.on("legal.contract.renewed", async (payload) => {
    await logEvent("legal.contract.renewed", payload);
    await logAudit("legal.contract.renewed", { ...payload, action: "renew", entity: "legal_contract" });
  });
  eventBus.on("legal.contract.terminated", async (payload) => {
    await logEvent("legal.contract.terminated", payload);
    await logAudit("legal.contract.terminated", { ...payload, action: "terminate", entity: "legal_contract" });
  });
  // Phase C.6 — legal contract + case update/delete listeners.
  eventBus.on("legal.contract.created", async (payload) => {
    await logEvent("legal.contract.created", payload);
    await logAudit("legal.contract.created", { ...payload, action: "create", entity: "legal_contract" });
  });
  eventBus.on("legal.contract.updated", async (payload) => {
    await logEvent("legal.contract.updated", payload);
    await logAudit("legal.contract.updated", { ...payload, action: "update", entity: "legal_contract" });
  });
  eventBus.on("legal.contract.status_changed", async (payload) => {
    await logEvent("legal.contract.status_changed", payload);
    await logAudit("legal.contract.status_changed", { ...payload, action: "status_change", entity: "legal_contract" });
  });
  eventBus.on("legal.contract.deleted", async (payload) => {
    await logEvent("legal.contract.deleted", payload);
    await logAudit("legal.contract.deleted", { ...payload, action: "delete", entity: "legal_contract" });
  });
  eventBus.on("legal.case.deleted", async (payload) => {
    await logEvent("legal.case.deleted", payload);
    await logAudit("legal.case.deleted", { ...payload, action: "delete", entity: "legal_case" });
  });

  // ── CRM — deal + opportunity lifecycle ──
  eventBus.on("crm.deal.won", async (payload) => {
    await logEvent("crm.deal.won", payload);
    await logAudit("crm.deal.won", { ...payload, action: "win", entity: "crm_deal" });
  });
  eventBus.on("crm.deal.lost", async (payload) => {
    await logEvent("crm.deal.lost", payload);
    await logAudit("crm.deal.lost", { ...payload, action: "lose", entity: "crm_deal" });
  });
  eventBus.on("crm.opportunity.converted", async (payload) => {
    await logEvent("crm.opportunity.converted", payload);
    await logAudit("crm.opportunity.converted", { ...payload, action: "convert", entity: "crm_opportunity" });
  });
  eventBus.on("crm.opportunity.deleted", async (payload) => {
    await logEvent("crm.opportunity.deleted", payload);
    await logAudit("crm.opportunity.deleted", { ...payload, action: "delete", entity: "crm_opportunity" });
  });
  eventBus.on("crm.opportunity.stage_changed", async (payload) => {
    await logEvent("crm.opportunity.stage_changed", payload);
    await logAudit("crm.opportunity.stage_changed", { ...payload, action: "stage_change", entity: "crm_opportunity" });
  });

  // ── Finance — invoices / vouchers / expenses / journals / fiscal ──
  eventBus.on("invoice.sent", async (payload) => {
    await logEvent("invoice.sent", payload);
    await logAudit("invoice.sent", { ...payload, action: "send", entity: "invoice" });
  });
  eventBus.on("invoice.deleted", async (payload) => {
    await logEvent("invoice.deleted", payload);
    await logAudit("invoice.deleted", { ...payload, action: "delete", entity: "invoice" });
  });
  eventBus.on("invoice.credit_memo", async (payload) => {
    await logEvent("invoice.credit_memo", payload);
    await logAudit("invoice.credit_memo", { ...payload, action: "credit_memo", entity: "invoice" });
  });
  eventBus.on("invoice.debit_memo", async (payload) => {
    await logEvent("invoice.debit_memo", payload);
    await logAudit("invoice.debit_memo", { ...payload, action: "debit_memo", entity: "invoice" });
  });
  eventBus.on("journal.posted", async (payload) => {
    await logEvent("journal.posted", payload);
    await logAudit("journal.posted", { ...payload, action: "post", entity: "journal_entry" });
  });
  eventBus.on("journal.reversed", async (payload) => {
    await logEvent("journal.reversed", payload);
    await logAudit("journal.reversed", { ...payload, action: "reverse", entity: "journal_entry" });
  });
  eventBus.on("journal.manual_created", async (payload) => {
    await logEvent("journal.manual_created", payload);
    await logAudit("journal.manual_created", { ...payload, action: "create", entity: "journal_entry" });
  });
  eventBus.on("recurring_journal.created", async (payload) => {
    await logEvent("recurring_journal.created", payload);
    await logAudit("recurring_journal.created", { ...payload, action: "create", entity: "recurring_journal" });
  });
  eventBus.on("fiscal.year_end_closed", async (payload) => {
    await logEvent("fiscal.year_end_closed", payload);
    await logAudit("fiscal.year_end_closed", { ...payload, action: "close", entity: "fiscal_year" });
  });
  eventBus.on("fiscal_period.closed", async (payload) => {
    await logEvent("fiscal_period.closed", payload);
    await logAudit("fiscal_period.closed", { ...payload, action: "close", entity: "fiscal_period" });
  });
  eventBus.on("fiscal_period.reopened", async (payload) => {
    await logEvent("fiscal_period.reopened", payload);
    await logAudit("fiscal_period.reopened", { ...payload, action: "reopen", entity: "fiscal_period" });
  });
  eventBus.on("fiscal_period.locked", async (payload) => {
    await logEvent("fiscal_period.locked", payload);
    await logAudit("fiscal_period.locked", { ...payload, action: "lock", entity: "fiscal_period" });
  });
  eventBus.on("payment_run.executed", async (payload) => {
    await logEvent("payment_run.executed", payload);
    await logAudit("payment_run.executed", { ...payload, action: "execute", entity: "payment_run" });
  });
  eventBus.on("bad_debt.posted", async (payload) => {
    await logEvent("bad_debt.posted", payload);
    await logAudit("bad_debt.posted", { ...payload, action: "post", entity: "bad_debt_provision" });
  });
  eventBus.on("hr.accruals.posted", async (payload) => {
    await logEvent("hr.accruals.posted", payload);
    await logAudit("hr.accruals.posted", { ...payload, action: "post", entity: "hr_accruals" });
  });

  // ── HR — employee / leave / payroll / letters ──
  eventBus.on("hr.letter.created", async (payload) => {
    await logEvent("hr.letter.created", payload);
    await logAudit("hr.letter.created", { ...payload, action: "create", entity: "official_letter" });
  });
  eventBus.on("employee.terminated", async (payload) => {
    await logEvent("employee.terminated", payload);
    await logAudit("employee.terminated", { ...payload, action: "terminate", entity: "employee" });

    // Cross-module: deactivate umrah commission plans for terminated employee
    if (payload.companyId && payload.entityId) {
      try {
        const result = await rawExecute(
          `UPDATE employee_commission_plans SET status = 'suspended', "updatedAt" = NOW()
           WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' AND "deletedAt" IS NULL`,
          [payload.entityId, payload.companyId]
        );
        if (result.affectedRows > 0) {
          logger.info({ affectedRows: result.affectedRows, employeeId: payload.entityId }, "Suspended commission plans for terminated employee");
        }
      } catch (err) {
        await rawExecute(
          `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
           VALUES ($1,$2,$3,$4,false)`,
          [payload.companyId, "commission_suspension", payload.entityId ?? 0,
           `فشل تعليق خطط العمولة عند إنهاء خدمة الموظف: ${String(err)}`]
        ).catch((e) => logger.error(e, "event listener background task failed"));
      }
    }
  });
  eventBus.on("leave.cancelled", async (payload) => {
    await logEvent("leave.cancelled", payload);
    await logAudit("leave.cancelled", { ...payload, action: "cancel", entity: "leave_request" });
  });
  eventBus.on("leave.deleted", async (payload) => {
    await logEvent("leave.deleted", payload);
    await logAudit("leave.deleted", { ...payload, action: "delete", entity: "leave_request" });
  });
  eventBus.on("leave.returned", async (payload) => {
    await logEvent("leave.returned", payload);
    await logAudit("leave.returned", { ...payload, action: "return", entity: "leave_request" });
  });
  eventBus.on("payroll.run", async (payload) => {
    await logEvent("payroll.run", payload);
    await logAudit("payroll.run", { ...payload, action: "run", entity: "payroll_run" });

    // Cross-module: auto-calculate umrah commissions when payroll run is created
    if (payload.companyId) {
      try {
        const details = typeof payload.details === "string" ? JSON.parse(payload.details) : (payload.details ?? {});
        const month = Number(details.month) || Number(currentMonthPadded());
        const year = Number(details.year) || currentYear();
        const results = await calculateAllForCompany(payload.companyId, month, year, (payload.userId as number) || 0);
        if (results.length > 0) {
          const total = results.reduce((s, r) => s + r.finalAmount, 0);
          logger.info({ planCount: results.length, totalSAR: total }, "Payroll run triggered commission calculation");
          const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
          if (mgr) {
            await createNotification({
              companyId: payload.companyId, assignmentId: mgr,
              type: "hr", title: "عمولات محسوبة تلقائياً",
              body: `تم حساب ${results.length} عمولة بإجمالي ${total} ر.س وربطها بمسيّر الرواتب`,
              priority: "normal", refType: "payroll_runs", refId: payload.entityId as number,
            });
          }
        }
      } catch (commErr) {
        await rawExecute(
          `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
           VALUES ($1,$2,$3,$4,false)`,
          [payload.companyId, "commission_auto_calc", payload.entityId ?? 0,
           `فشل حساب العمولات التلقائي عند إنشاء مسيّر الرواتب: ${String(commErr)}`]
        ).catch((e) => logger.error(e, "event listener background task failed"));
      }
    }
  });
  eventBus.on("payroll.posted", async (payload) => {
    await logEvent("payroll.posted", payload);
    await logAudit("payroll.posted", { ...payload, action: "post", entity: "payroll_run" });

    // HR-001 — the payroll salary expense is recognised once, by
    // postPayrollRunGL at run creation; re-posting it here on payroll.posted
    // double-counted it. This listener now only reclassifies pre-accrued
    // sales commission into salary_payable, since commission is paid through
    // the payroll run.
    if (payload.companyId && payload.entityId) {
      try {
        const [runTotals] = await rawQuery<Record<string, unknown>>(
          `SELECT COALESCE(SUM(commission),0)::numeric(12,2) AS comm
           FROM payroll_lines WHERE "runId"=$1 AND "deletedAt" IS NULL`,
          [payload.entityId]
        );
        const comm = Number(runTotals?.comm) || 0;
        if (comm > 0) {
          const [commPayableCode, salaryPayableCode] = await Promise.all([
            getAccountCodeFromMapping(payload.companyId, "commission_payable", "debit", "2155"),
            getAccountCodeFromMapping(payload.companyId, "salary_payable", "credit", "2120"),
          ]);
          await createGuardedJournalEntry({
            companyId: payload.companyId,
            branchId: (payload.branchId as number) || 0,
            createdBy: (payload.userId as number) || 0,
            ref: `JE-PAYCOMM-${payload.entityId}`,
            description: `تسوية عمولات ضمن مسيّر رواتب #${payload.entityId}`,
            type: "payroll",
            sourceType: "payroll_runs",
            sourceId: payload.entityId as number,
            lines: [
              { accountCode: commPayableCode, debit: comm, credit: 0, description: "تسوية عمولات مستحقة سابقاً" },
              { accountCode: salaryPayableCode, debit: 0, credit: comm, description: "عمولات ضمن الرواتب المستحقة" },
            ],
          }, { table: "payroll_runs", id: payload.entityId as number });
        }
      } catch (glErr) {
        // createGuardedJournalEntry already records in financial_posting_failures
        logger.error(glErr, `[EventListener] payroll commission GL posting failed for run #${payload.entityId}`);
      }
    }
  });
  eventBus.on("payroll.deleted", async (payload) => {
    await logEvent("payroll.deleted", payload);
    await logAudit("payroll.deleted", { ...payload, action: "delete", entity: "payroll_run" });
  });

  // ── Property — buildings / units / owners / leases / deposits ──
  eventBus.on("property.building.created", async (payload) => {
    await logEvent("property.building.created", payload);
    await logAudit("property.building.created", { ...payload, action: "create", entity: "property_building" });
  });
  eventBus.on("property.unit.created", async (payload) => {
    await logEvent("property.unit.created", payload);
    await logAudit("property.unit.created", { ...payload, action: "create", entity: "property_unit" });
  });
  eventBus.on("property.owner.created", async (payload) => {
    await logEvent("property.owner.created", payload);
    await logAudit("property.owner.created", { ...payload, action: "create", entity: "property_owner" });
  });
  eventBus.on("property.contract.renewed", async (payload) => {
    await logEvent("property.contract.renewed", payload);
    await logAudit("property.contract.renewed", { ...payload, action: "renew", entity: "rental_contract" });
  });
  eventBus.on("property.contract.terminated", async (payload) => {
    await logEvent("property.contract.terminated", payload);
    await logAudit("property.contract.terminated", { ...payload, action: "terminate", entity: "rental_contract" });
  });
  eventBus.on("lease.created", async (payload) => {
    await logEvent("lease.created", payload);
    await logAudit("lease.created", { ...payload, action: "create", entity: "rental_contract" });
  });
  eventBus.on("lease.expired", async (payload) => {
    await logEvent("lease.expired", payload);
    await logAudit("lease.expired", { ...payload, action: "expire", entity: "rental_contract" });
  });
  eventBus.on("lease.renewal_notice", async (payload) => {
    await logEvent("lease.renewal_notice", payload);
    await logAudit("lease.renewal_notice", { ...payload, action: "notice", entity: "rental_contract" });
  });
  eventBus.on("tenant.created", async (payload) => {
    await logEvent("tenant.created", payload);
    await logAudit("tenant.created", { ...payload, action: "create", entity: "tenant" });
  });
  eventBus.on("rent_payment.received", async (payload) => {
    await logEvent("rent_payment.received", payload);
    await logAudit("rent_payment.received", { ...payload, action: "receive", entity: "rent_payment" });
    // N8 fix: cross-module write into CRM client ledger. Without this
    // the rent payment only touches rent_payments + journal_entries —
    // the CRM client card never reflects the tenant's latest payment.
    // Reports that join client_overview pages still query rent_payments
    // directly, but the badge "Last paid: 12 days ago" on /clients lives
    // on clients.lastPaymentAt and stays stale forever otherwise.
    if (payload.companyId && payload.entityId) {
      try {
        // rent_payments has no companyId column — scope flows via the
        // rental_contracts JOIN. The double `companyId = $2` (on
        // rental_contracts and on the outer UPDATE) is intentional:
        // it's a defence-in-depth seatbelt against a cross-tenant
        // payment id (which the route layer already rejects).
        await rawExecute(
          `UPDATE clients
             SET "lastPaymentAt" = NOW(),
                 "lastActivityAt" = NOW(),
                 "updatedAt"      = NOW()
           WHERE id = (
             SELECT t."clientId"
               FROM rent_payments rp
               JOIN rental_contracts rc ON rc.id = rp."contractId" AND rc."companyId" = $2
               JOIN tenants t           ON t.id  = rc."tenantId"
              WHERE rp.id = $1
                AND t."clientId" IS NOT NULL
              LIMIT 1
           )
             AND "companyId" = $2`,
          [payload.entityId, payload.companyId]
        );
      } catch (e) { logger.error(e, "[EventListener] rent_payment.received → clients.lastPaymentAt failed"); }
    }
  });
  eventBus.on("deposit.received", async (payload) => {
    await logEvent("deposit.received", payload);
    await logAudit("deposit.received", { ...payload, action: "receive", entity: "deposit" });
  });
  // Phase C.4 — missing property lifecycle listeners.
  // Before this block PATCH/DELETE on units / contracts / buildings / owners /
  // tenants / inspections was silent in audit_logs + event_logs; the programmer
  // flagged the same gap during the Fleet audit.
  eventBus.on("property.unit.updated", async (payload) => {
    await logEvent("property.unit.updated", payload);
    await logAudit("property.unit.updated", { ...payload, action: "update", entity: "property_unit" });
  });
  eventBus.on("property.unit.status_changed", async (payload) => {
    await logEvent("property.unit.status_changed", payload);
    await logAudit("property.unit.status_changed", { ...payload, action: "status_change", entity: "property_unit" });
  });
  eventBus.on("property.unit.deleted", async (payload) => {
    await logEvent("property.unit.deleted", payload);
    await logAudit("property.unit.deleted", { ...payload, action: "delete", entity: "property_unit" });
  });
  eventBus.on("property.contract.updated", async (payload) => {
    await logEvent("property.contract.updated", payload);
    await logAudit("property.contract.updated", { ...payload, action: "update", entity: "rental_contract" });
  });
  eventBus.on("property.contract.status_changed", async (payload) => {
    await logEvent("property.contract.status_changed", payload);
    await logAudit("property.contract.status_changed", { ...payload, action: "status_change", entity: "rental_contract" });
  });
  eventBus.on("property.contract.deleted", async (payload) => {
    await logEvent("property.contract.deleted", payload);
    await logAudit("property.contract.deleted", { ...payload, action: "delete", entity: "rental_contract" });
  });
  eventBus.on("property.building.updated", async (payload) => {
    await logEvent("property.building.updated", payload);
    await logAudit("property.building.updated", { ...payload, action: "update", entity: "property_building" });
  });
  eventBus.on("property.building.deleted", async (payload) => {
    await logEvent("property.building.deleted", payload);
    await logAudit("property.building.deleted", { ...payload, action: "delete", entity: "property_building" });
  });
  eventBus.on("property.owner.updated", async (payload) => {
    await logEvent("property.owner.updated", payload);
    await logAudit("property.owner.updated", { ...payload, action: "update", entity: "property_owner" });
  });
  eventBus.on("property.owner.deleted", async (payload) => {
    await logEvent("property.owner.deleted", payload);
    await logAudit("property.owner.deleted", { ...payload, action: "delete", entity: "property_owner" });
  });
  eventBus.on("tenant.updated", async (payload) => {
    await logEvent("tenant.updated", payload);
    await logAudit("tenant.updated", { ...payload, action: "update", entity: "tenant" });
  });
  eventBus.on("tenant.deleted", async (payload) => {
    await logEvent("tenant.deleted", payload);
    await logAudit("tenant.deleted", { ...payload, action: "delete", entity: "tenant" });
  });
  eventBus.on("property.inspection.updated", async (payload) => {
    await logEvent("property.inspection.updated", payload);
    await logAudit("property.inspection.updated", { ...payload, action: "update", entity: "property_inspection" });
  });
  eventBus.on("property.inspection.status_changed", async (payload) => {
    await logEvent("property.inspection.status_changed", payload);
    await logAudit("property.inspection.status_changed", { ...payload, action: "status_change", entity: "property_inspection" });
  });

  // ── Fleet — vehicles / drivers / trips / maintenance / violations ──
  eventBus.on("fleet.vehicle.created", async (payload) => {
    await logEvent("fleet.vehicle.created", payload);
    await logAudit("fleet.vehicle.created", { ...payload, action: "create", entity: "fleet_vehicle" });
  });
  eventBus.on("fleet.driver.created", async (payload) => {
    await logEvent("fleet.driver.created", payload);
    await logAudit("fleet.driver.created", { ...payload, action: "create", entity: "fleet_driver" });
  });
  eventBus.on("fleet.trip.cancelled", async (payload) => {
    await logEvent("fleet.trip.cancelled", payload);
    await logAudit("fleet.trip.cancelled", { ...payload, action: "cancel", entity: "fleet_trip" });
  });
  eventBus.on("fleet.maintenance.completed", async (payload) => {
    await logEvent("fleet.maintenance.completed", payload);
    await logAudit("fleet.maintenance.completed", { ...payload, action: "complete", entity: "fleet_maintenance" });
  });
  eventBus.on("fleet.maintenance.cancelled", async (payload) => {
    await logEvent("fleet.maintenance.cancelled", payload);
    await logAudit("fleet.maintenance.cancelled", { ...payload, action: "cancel", entity: "fleet_maintenance" });
  });
  eventBus.on("fleet.preventive.due", async (payload) => {
    await logEvent("fleet.preventive.due", payload);
    await logAudit("fleet.preventive.due", { ...payload, action: "due", entity: "fleet_maintenance" });
  });
  eventBus.on("fleet.traffic_violation.created", async (payload) => {
    await logEvent("fleet.traffic_violation.created", payload);
    await logAudit("fleet.traffic_violation.created", { ...payload, action: "create", entity: "fleet_traffic_violation" });
  });
  eventBus.on("fleet.traffic_violation.paid", async (payload) => {
    await logEvent("fleet.traffic_violation.paid", payload);
    await logAudit("fleet.traffic_violation.paid", { ...payload, action: "pay", entity: "fleet_traffic_violation" });
  });
  // Phase C.3 — missing fleet lifecycle listeners.
  // Every mutation now has an audit + event trail. The programmer's earlier
  // spot-checks found that e.g. vehicle updates, driver deletes and fuel log
  // edits were completely silent in the audit tables.
  eventBus.on("fleet.vehicle.updated", async (payload) => {
    await logEvent("fleet.vehicle.updated", payload);
    await logAudit("fleet.vehicle.updated", { ...payload, action: "update", entity: "fleet_vehicle" });
  });
  eventBus.on("fleet.vehicle.status_changed", async (payload) => {
    await logEvent("fleet.vehicle.status_changed", payload);
    await logAudit("fleet.vehicle.status_changed", { ...payload, action: "status_change", entity: "fleet_vehicle" });
  });
  eventBus.on("fleet.vehicle.deleted", async (payload) => {
    await logEvent("fleet.vehicle.deleted", payload);
    await logAudit("fleet.vehicle.deleted", { ...payload, action: "delete", entity: "fleet_vehicle" });
  });
  eventBus.on("fleet.vehicle.breakdown", async (payload) => {
    await logEvent("fleet.vehicle.breakdown", payload);
    await logAudit("fleet.vehicle.breakdown", { ...payload, action: "breakdown", entity: "fleet_vehicle" });
  });
  eventBus.on("fleet.driver.updated", async (payload) => {
    await logEvent("fleet.driver.updated", payload);
    await logAudit("fleet.driver.updated", { ...payload, action: "update", entity: "fleet_driver" });
  });
  eventBus.on("fleet.driver.status_changed", async (payload) => {
    await logEvent("fleet.driver.status_changed", payload);
    await logAudit("fleet.driver.status_changed", { ...payload, action: "status_change", entity: "fleet_driver" });
  });
  eventBus.on("fleet.driver.deleted", async (payload) => {
    await logEvent("fleet.driver.deleted", payload);
    await logAudit("fleet.driver.deleted", { ...payload, action: "delete", entity: "fleet_driver" });
  });
  eventBus.on("fleet.trip.updated", async (payload) => {
    await logEvent("fleet.trip.updated", payload);
    await logAudit("fleet.trip.updated", { ...payload, action: "update", entity: "fleet_trip" });
  });
  eventBus.on("fleet.trip.deleted", async (payload) => {
    await logEvent("fleet.trip.deleted", payload);
    await logAudit("fleet.trip.deleted", { ...payload, action: "delete", entity: "fleet_trip" });
  });
  eventBus.on("fleet.maintenance.created", async (payload) => {
    await logEvent("fleet.maintenance.created", payload);
    await logAudit("fleet.maintenance.created", { ...payload, action: "create", entity: "fleet_maintenance" });
  });
  eventBus.on("fleet.maintenance.updated", async (payload) => {
    await logEvent("fleet.maintenance.updated", payload);
    await logAudit("fleet.maintenance.updated", { ...payload, action: "update", entity: "fleet_maintenance" });
  });
  eventBus.on("fleet.maintenance.deleted", async (payload) => {
    await logEvent("fleet.maintenance.deleted", payload);
    await logAudit("fleet.maintenance.deleted", { ...payload, action: "delete", entity: "fleet_maintenance" });
  });
  eventBus.on("fleet.fuel_log.deleted", async (payload) => {
    await logEvent("fleet.fuel_log.deleted", payload);
    await logAudit("fleet.fuel_log.deleted", { ...payload, action: "delete", entity: "fleet_fuel_log" });
  });
  eventBus.on("fleet.insurance.deleted", async (payload) => {
    await logEvent("fleet.insurance.deleted", payload);
    await logAudit("fleet.insurance.deleted", { ...payload, action: "delete", entity: "fleet_insurance" });
  });

  // ── Purchase — PO lifecycle + PR conversion ──
  eventBus.on("purchase_order.received", async (payload) => {
    await logEvent("purchase_order.received", payload);
    await logAudit("purchase_order.received", { ...payload, action: "receive", entity: "purchase_order" });
  });
  eventBus.on("purchase_order.vendor_confirmed", async (payload) => {
    await logEvent("purchase_order.vendor_confirmed", payload);
    await logAudit("purchase_order.vendor_confirmed", { ...payload, action: "vendor_confirm", entity: "purchase_order" });
  });
  eventBus.on("purchase_order.payment_scheduled", async (payload) => {
    await logEvent("purchase_order.payment_scheduled", payload);
    await logAudit("purchase_order.payment_scheduled", { ...payload, action: "schedule_payment", entity: "purchase_order" });
  });
  eventBus.on("purchase_request.converted", async (payload) => {
    await logEvent("purchase_request.converted", payload);
    await logAudit("purchase_request.converted", { ...payload, action: "convert", entity: "purchase_request" });
  });

  // ── Projects ──
  eventBus.on("project.created", async (payload) => {
    await logEvent("project.created", payload);
    await logAudit("project.created", { ...payload, action: "create", entity: "project" });
  });
  eventBus.on("project.updated", async (payload) => {
    await logEvent("project.updated", payload);
    await logAudit("project.updated", { ...payload, action: "update", entity: "project" });
  });
  eventBus.on("project.status_changed", async (payload) => {
    await logEvent("project.status_changed", payload);
    await logAudit("project.status_changed", { ...payload, action: "status_change", entity: "project" });
  });
  eventBus.on("project.deleted", async (payload) => {
    await logEvent("project.deleted", payload);
    await logAudit("project.deleted", { ...payload, action: "delete", entity: "project" });
  });
  eventBus.on("project.phase.created", async (payload) => {
    await logEvent("project.phase.created", payload);
    await logAudit("project.phase.created", { ...payload, action: "create", entity: "project_phase" });
  });
  eventBus.on("project.phase.completed", async (payload) => {
    await logEvent("project.phase.completed", payload);
    await logAudit("project.phase.completed", { ...payload, action: "complete", entity: "project_phase" });
  });
  eventBus.on("project.task.updated", async (payload) => {
    await logEvent("project.task.updated", payload);
    await logAudit("project.task.updated", { ...payload, action: "update", entity: "project_task" });
  });
  eventBus.on("project.task.status_changed", async (payload) => {
    await logEvent("project.task.status_changed", payload);
    await logAudit("project.task.status_changed", { ...payload, action: "status_change", entity: "project_task" });
  });
  eventBus.on("project.closed", async (payload) => {
    await logEvent("project.closed", payload);
    await logAudit("project.closed", { ...payload, action: "close", entity: "project" });
  });

  // ── Recruitment ──
  eventBus.on("recruitment.job.closed", async (payload) => {
    await logEvent("recruitment.job.closed", payload);
    await logAudit("recruitment.job.closed", { ...payload, action: "close", entity: "recruitment_job" });
  });
  eventBus.on("recruitment.job.reopened", async (payload) => {
    await logEvent("recruitment.job.reopened", payload);
    await logAudit("recruitment.job.reopened", { ...payload, action: "reopen", entity: "recruitment_job" });
  });

  // ── Generic workflow request lifecycle ──
  eventBus.on("request.approved", async (payload) => {
    await logEvent("request.approved", payload);
    await logAudit("request.approved", { ...payload, action: "approve", entity: "request" });
  });
  eventBus.on("request.rejected", async (payload) => {
    await logEvent("request.rejected", payload);
    await logAudit("request.rejected", { ...payload, action: "reject", entity: "request" });
  });
  eventBus.on("request.returned", async (payload) => {
    await logEvent("request.returned", payload);
    await logAudit("request.returned", { ...payload, action: "return", entity: "request" });
  });

  // ── Umrah module ──
  eventBus.on("umrah.mutamers.imported", async (payload) => {
    await logEvent("umrah.mutamers.imported", payload);
    await logAudit("umrah.mutamers.imported", { ...payload, action: "import", entity: "umrah_pilgrims" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        const after = payload.after as Record<string, unknown> | undefined;
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "استيراد معتمرين",
          body: `تم استيراد دفعة معتمرين — ${after?.newCount ?? 0} جديد، ${after?.updatedCount ?? 0} تحديث`,
          priority: "normal", refType: "umrah_import_batches", refId: payload.entityId as number,
          actionUrl: "/umrah/imports",
        });
      }
    }
  });

  eventBus.on("umrah.vouchers.imported", async (payload) => {
    await logEvent("umrah.vouchers.imported", payload);
    await logAudit("umrah.vouchers.imported", { ...payload, action: "import", entity: "umrah_nusk_invoices" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        const after = payload.after as Record<string, unknown> | undefined;
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "استيراد فواتير نسك",
          body: `تم استيراد ${after?.newCount ?? 0} فاتورة نسك جديدة، ${after?.updatedCount ?? 0} تحديث`,
          priority: "normal", refType: "umrah_import_batches", refId: payload.entityId as number,
          actionUrl: "/umrah/imports",
        });
      }
    }
  });

  eventBus.on("umrah.overstay.detected", async (payload) => {
    await logEvent("umrah.overstay.detected", payload);
    await logAudit("umrah.overstay.detected", { ...payload, action: "detect", entity: "umrah_violations" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "تنبيه تجاوز مدة",
          body: `تم رصد حالة تجاوز مدة الإقامة — مخالفة #${payload.entityId}`,
          priority: "high", refType: "umrah_violations", refId: payload.entityId as number,
          actionUrl: `/umrah/violations/${payload.entityId}`,
        });
      }
    }
  });

  eventBus.on("umrah.absconder.detected", async (payload) => {
    await logEvent("umrah.absconder.detected", payload);
    await logAudit("umrah.absconder.detected", { ...payload, action: "detect", entity: "umrah_violations" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "تنبيه هارب",
          body: `تم رصد حالة هروب معتمر — مخالفة #${payload.entityId}`,
          priority: "urgent", refType: "umrah_violations", refId: payload.entityId as number,
          actionUrl: `/umrah/violations/${payload.entityId}`,
        });
      }
    }
  });

  eventBus.on("umrah.invoice.generated", async (payload) => {
    await logEvent("umrah.invoice.generated", payload);
    await logAudit("umrah.invoice.generated", { ...payload, action: "create", entity: "umrah_sales_invoices" });
    if (!payload.companyId) return;

    const details = typeof payload.details === "string" ? JSON.parse(payload.details) : (payload.details ?? {});

    // Cross-module: auto-post GL journal for umrah agent invoice (AR ↔ Revenue)
    const [glEntry] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "sourceType"='umrah_sales_invoices' AND "sourceId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [payload.entityId, payload.companyId]
    );
    if (!glEntry) {
      try {
        const total = Number((payload as any).after?.total ?? details.total ?? 0);
        const ref = (payload as any).after?.ref ?? details.ref ?? "";
        const subAgentId = (payload as any).after?.subAgentId ?? details.subAgentId ?? "";
        if (total > 0) {
          const arCode = await getAccountCodeFromMapping(payload.companyId, "umrah_receivables", "debit", "1131");
          const revenueCode = await getAccountCodeFromMapping(payload.companyId, "umrah_revenue", "credit", "4130");
          await createGuardedJournalEntry({
            companyId: payload.companyId,
            branchId: (payload.branchId as number) || 0,
            createdBy: (payload.userId as number) || 0,
            ref: `JE-UMR-${payload.entityId}`,
            description: `فاتورة عمرة ${ref} — وكيل فرعي #${subAgentId}`,
            type: "sales",
            sourceType: "umrah_sales_invoices",
            sourceId: payload.entityId as number,
            lines: [
              { accountCode: arCode, debit: total, credit: 0, description: `ذمم مدينة — فاتورة ${ref}` },
              { accountCode: revenueCode, debit: 0, credit: total, description: `إيراد عمرة — فاتورة ${ref}` },
            ],
          }, { table: "umrah_sales_invoices", id: payload.entityId as number });
        }
      } catch (glErr) {
        logger.error(glErr, `[EventListener] umrah invoice GL posting failed for #${payload.entityId}`);
      }
    }

    // Cross-module: register receivable obligation for payment tracking
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      await registerObligation({
        companyId: payload.companyId,
        branchId: payload.branchId as number,
        entityType: "umrah_sales_invoices",
        entityId: payload.entityId as number,
        obligationType: "payment",
        title: `فاتورة عمرة ${details.ref || ""} — ${Number(details.total) || 0} ر.س`,
        dueAt: dueDate,
        dedupeKey: `umrah-inv-${payload.entityId}`,
      });
    } catch (oblErr) {
      await rawExecute(
        `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
         VALUES ($1,$2,$3,$4,false)`,
        [payload.companyId, "obligation_registration", payload.entityId ?? 0,
         `فشل تسجيل الالتزام: ${String(oblErr)}`]
      ).catch((e) => logger.error(e, "event listener background task failed"));
    }

    // Notification to manager
    const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
    if (mgr) {
      await createNotification({
        companyId: payload.companyId, assignmentId: mgr,
        type: "umrah", title: "فاتورة عمرة جديدة",
        body: `تم إصدار فاتورة مبيعات عمرة ${details.ref ?? ""} بقيمة ${details.total ?? 0} ر.س`,
        priority: "normal", refType: "umrah_sales_invoices", refId: payload.entityId as number,
        actionUrl: `/umrah/invoices/${payload.entityId}`,
      });
    }
  });

  // Inbox auto-classifier v2 — closes the gap where v1 read only the
  // subject and ignored body, sender identity, and entity linkage.
  //
  // v2 changes:
  //   1. Reads the full body from message_log (not the slim event
  //      payload) so a "شكوى" buried in the body still matches.
  //   2. Resolves the sender against clients/employees, links the
  //      generated task with linkedEntityType=clients|employees|message_log.
  //   3. VIP clients lift the matched priority one notch
  //      (normal→high, high→urgent).
  //   4. Sets a dueAt based on priority so the SLA worker
  //      (workflowEngine.checkSlaStatus) has a deadline to enforce.
  //   5. Skips silently when a duplicate task already exists for this
  //      message id, so a retry-replay doesn't create twins.
  eventBus.on("inbox.message.received", async (payload) => {
    await logEvent("inbox.message.received", payload);
    if (!payload.companyId || !payload.entityId) return;

    // Hydrate the message row — the event payload was deliberately
    // light, but classification quality wants the full body.
    const [msg] = await rawQuery<{
      subject: string | null; body: string | null;
      fromAddress: string | null; channel: string;
    }>(
      `SELECT subject, body, "fromAddress", channel FROM message_log
        WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [payload.entityId as number, payload.companyId],
    ).catch(() => []);
    if (!msg) return;

    // Match against subject + first 600 chars of body. We cap the body
    // window to keep regex cost predictable on large emails.
    const haystack = `${msg.subject ?? ""}\n${(msg.body ?? "").slice(0, 600)}`.toLowerCase();
    if (!haystack.trim()) return;

    const fromAddress = msg.fromAddress ?? "";

    const matched = classifyInboxMessage(haystack);
    if (!matched) return;

    // Idempotency: skip if we already opened a task for this message.
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM tasks
        WHERE "companyId" = $1 AND "linkedEntityType" = 'message_log' AND "linkedEntityId" = $2
        LIMIT 1`,
      [payload.companyId, payload.entityId as number],
    ).catch(() => []);
    if (existing) return;

    // Sender resolution — last 9 digits of phone match clients; email
    // matches clients then employees. The linked task gets the entity
    // ref so /tasks shows it under the customer/staff record directly.
    let linkedEntityType: "clients" | "employees" | "message_log" = "message_log";
    let linkedEntityId: number = payload.entityId as number;
    let senderName: string = fromAddress || "—";
    let senderClassification: string | null = null;

    if (fromAddress) {
      // Phone match first (sms/whatsapp/pbx). digits-only fast path.
      const digits = fromAddress.replace(/\D/g, "");
      if (digits.length >= 9) {
        const last9 = digits.slice(-9);
        const [client] = await rawQuery<{ id: number; name: string; classification: string | null }>(
          `SELECT id, name, classification FROM clients
            WHERE "companyId" = $1
              AND REPLACE(REPLACE(COALESCE(phone,''),'+',''),'-','') LIKE $2
              AND "deletedAt" IS NULL LIMIT 1`,
          [payload.companyId, `%${last9}`],
        ).catch(() => []);
        if (client) {
          linkedEntityType = "clients"; linkedEntityId = client.id;
          senderName = client.name; senderClassification = client.classification;
        }
      }
      // Email match if phone match missed.
      if (linkedEntityType === "message_log" && fromAddress.includes("@")) {
        const [client] = await rawQuery<{ id: number; name: string; classification: string | null }>(
          `SELECT id, name, classification FROM clients
            WHERE "companyId" = $1 AND LOWER(COALESCE(email,'')) = LOWER($2)
              AND "deletedAt" IS NULL LIMIT 1`,
          [payload.companyId, fromAddress],
        ).catch(() => []);
        if (client) {
          linkedEntityType = "clients"; linkedEntityId = client.id;
          senderName = client.name; senderClassification = client.classification;
        } else {
          const [emp] = await rawQuery<{ id: number; name: string }>(
            `SELECT id, name FROM employees
              WHERE "companyId" = $1 AND (LOWER(COALESCE(email,'')) = LOWER($2)
                                          OR LOWER(COALESCE("personalEmail",'')) = LOWER($2)
                                          OR LOWER(COALESCE("internalEmail",'')) = LOWER($2))
                AND "deletedAt" IS NULL LIMIT 1`,
            [payload.companyId, fromAddress],
          ).catch(() => []);
          if (emp) { linkedEntityType = "employees"; linkedEntityId = emp.id; senderName = emp.name; }
        }
      }
    }

    const priority: Priority = liftPriorityForClassification(matched.priority, senderClassification);
    const slaHours = SLA_HOURS_BY_PRIORITY[priority];
    const dueAt = new Date(Date.now() + slaHours * 3600 * 1000);

    try {
      await rawExecute(
        `INSERT INTO tasks ("companyId", title, description, type, status, priority,
                            "linkedEntityType", "linkedEntityId", "slaDeadline", "createdAt")
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, NOW())`,
        [
          payload.companyId,
          `${matched.titlePrefix} ${senderName}: ${(msg.subject ?? "").slice(0, 120)}`,
          `رسالة واردة من ${fromAddress || "—"}\nالموضوع: ${msg.subject ?? "—"}\nالقناة: ${msg.channel}\n\nتم تصنيفها تلقائياً كـ ${matched.type}${senderClassification ? ` · العميل ${senderClassification}` : ""}.\nموعد الاستجابة: ${dueAt.toISOString()}\nرسالة #${payload.entityId}`,
          matched.type,
          priority,
          linkedEntityType,
          linkedEntityId,
          dueAt,
        ],
      );
    } catch (e) { logger.error(e, "[EventListener] inbox auto-classifier task insert failed"); }
  });

  // PR-D — FAQ auto-reply. Independent listener that runs after the
  // classifier above. If the inbound message's content matches a
  // published kb_articles entry with high confidence (score >= 8),
  // we send an auto-reply with the article so the customer gets an
  // immediate answer instead of waiting for a human pick-up.
  //
  // Guards:
  //   - skips when there's no clear FAQ match (silent confusion is
  //     worse than no reply at all).
  //   - only auto-replies on customer-facing channels (email/whatsapp
  //     /sms) where the sender address is replyable; pbx/internal/in_app
  //     are skipped.
  //   - idempotent: tags the message_log row with relatedType='kb_auto_reply'
  //     after sending so a replay doesn't double-reply.
  eventBus.on("inbox.message.received", async (payload) => {
    if (!payload.companyId || !payload.entityId) return;
    try {
      // Hydrate the inbound message.
      const [msg] = await rawQuery<{
        id: number; channel: string; subject: string | null;
        body: string | null; fromAddress: string | null;
        relatedType: string | null;
      }>(
        `SELECT id, channel, subject, body, "fromAddress", "relatedType"
           FROM message_log WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
        [payload.entityId as number, payload.companyId],
      );
      if (!msg) return;
      if (!msg.fromAddress) return;
      if (msg.channel !== "email" && msg.channel !== "whatsapp" && msg.channel !== "sms") return;

      // Idempotency check — relatedType is set by us after a successful auto-reply.
      if (msg.relatedType === "kb_auto_reply") return;

      // Look for an existing auto-reply log row for this message (covers
      // a crash between sending and the relatedType update).
      const [prior] = await rawQuery<{ id: number }>(
        `SELECT id FROM message_log
          WHERE "companyId" = $1
            AND "relatedType" = 'kb_auto_reply'
            AND "relatedId" = $2
            AND direction = 'outbound'
          LIMIT 1`,
        [payload.companyId, msg.id],
      ).catch(() => []);
      if (prior) return;

      type KbRow = { id: number; title: string; content: string | null; category: string | null; tags: string[] | null };
      const articles: KbRow[] = await rawQuery<KbRow>(
        `SELECT id, title, content, category, tags
           FROM kb_articles
          WHERE ("companyId" = $1 OR "companyId" IS NULL)
            AND status = 'published'
            AND "deletedAt" IS NULL`,
        [payload.companyId],
      ).catch(() => [] as KbRow[]);
      if (articles.length === 0) return;

      const haystack = `${msg.subject ?? ""}\n${msg.body ?? ""}`;
      const match = pickBestMatch(articles, haystack);
      if (!match) return;

      const article = articles.find((a) => a.id === match.articleId);
      if (!article) return;

      const replyBody = composeAutoReplyBody(article, msg.channel);
      const replySubject = msg.channel === "email" ? `Re: ${msg.subject ?? article.title}` : null;

      await sendMessage({
        channel: msg.channel,
        recipient: msg.fromAddress,
        subject: replySubject,
        body: replyBody,
        companyId: payload.companyId,
        userId: null,
        relatedType: "kb_auto_reply",
        relatedId: msg.id,
        templateKey: `kb.article.${article.id}`,
        eventAction: "communications.faq.auto_replied",
      }).catch((e) => logger.warn(e, "[EventListener] FAQ auto-reply send failed"));

      // Mark the inbound message so a replay doesn't fire again.
      await rawExecute(
        `UPDATE message_log
            SET "relatedType" = 'kb_auto_reply', "relatedId" = $1
          WHERE id = $2 AND "companyId" = $3 AND "relatedType" IS NULL`,
        [article.id, msg.id, payload.companyId],
      ).catch((e) => logger.warn(e, "[EventListener] FAQ auto-reply tag update failed"));

      // Visible audit so an operator can review every FAQ auto-reply.
      void createAuditLog({
        companyId: payload.companyId,
        userId: 0,
        action: "create",
        entity: "kb_auto_reply",
        entityId: msg.id,
        after: { articleId: article.id, articleTitle: article.title, score: match.score, matchedTerms: match.matchedTerms },
      }).catch((e) => logger.warn(e, "[audit] kb.auto_reply"));
    } catch (e) {
      logger.error(e, "[EventListener] FAQ auto-reply failed");
    }
  });

  // M9 recovery: umrah AGENT invoice (commission billing) — checks for
  // missing journalEntryId on the row and re-posts the GL if absent.
  // The route at umrah.ts:1623+ already posts the JE inline, but with a
  // non-blocking .catch() outside the withTransaction. If that inline
  // post fails, this listener picks up the slack — matches the sales-
  // invoice recovery pattern above so both paths converge on dual-entry.
  eventBus.on("umrah.agent_invoice.created", async (payload) => {
    await logEvent("umrah.agent_invoice.created", payload);
    if (!payload.companyId) return;

    const details = typeof payload.details === "string" ? JSON.parse(payload.details) : (payload.details ?? {});
    const invoiceId = payload.entityId as number;
    // If the inline post already wrote a journalEntryId, no recovery
    // needed. Re-check from the DB rather than trusting the event
    // payload — payload.journalEntryId may be stale if a concurrent
    // request already healed the row.
    const [row] = await rawQuery<{ journalEntryId: number | null }>(
      `SELECT "journalEntryId" FROM umrah_agent_invoices
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [invoiceId, payload.companyId]
    ).catch(() => []);
    if (row?.journalEntryId) return;

    try {
      const total = Number(details.total ?? 0);
      const servicesTotal = Number(details.servicesTotal ?? 0);
      const penaltiesTotal = Number(details.penaltiesTotal ?? 0);
      const commission = Number(details.commission ?? 0);
      const ref = String(details.ref ?? `INV-${invoiceId}`);
      const agentName = String(details.agentName ?? "");
      if (total <= 0) return;

      const arCode = await getAccountCodeFromMapping(payload.companyId, "umrah_agent_receivable", "debit", "1210");
      const revenueCode = await getAccountCodeFromMapping(payload.companyId, "umrah_revenue", "credit", "4130");
      const penaltyCode = await getAccountCodeFromMapping(payload.companyId, "penalty_revenue", "credit", "4930");
      const commissionCode = await getAccountCodeFromMapping(payload.companyId, "commission_expense", "debit", "5430");

      const lines: Array<{ accountCode: string; debit: number; credit: number; description: string }> = [
        { accountCode: arCode, debit: total, credit: 0, description: `ذمم وكيل — فاتورة ${ref}` },
      ];
      if (servicesTotal > 0) {
        lines.push({ accountCode: revenueCode, debit: 0, credit: servicesTotal, description: `إيراد خدمات — فاتورة ${ref}` });
      }
      if (penaltiesTotal > 0) {
        lines.push({ accountCode: penaltyCode, debit: 0, credit: penaltiesTotal, description: `إيراد غرامات — فاتورة ${ref}` });
      }
      if (commission > 0) {
        lines.push({ accountCode: commissionCode, debit: commission, credit: 0, description: `عمولة وكيل — فاتورة ${ref}` });
      }

      const journalId = await createGuardedJournalEntry({
        companyId: payload.companyId,
        branchId: (payload.branchId as number) || 0,
        createdBy: (payload.userId as number) || 0,
        ref: `JE-UMR-AG-${invoiceId}`,
        description: `فاتورة عمرة — وكيل ${agentName} — ${ref}`,
        type: "sales",
        sourceType: "umrah_agent_invoices",
        sourceId: invoiceId,
        lines,
      }, { table: "umrah_agent_invoices", id: invoiceId });

      // Backfill the row so the next reconciliation pass sees it healed.
      if (journalId) {
        await rawExecute(
          `UPDATE umrah_agent_invoices SET "journalEntryId" = $1
            WHERE id = $2 AND "companyId" = $3 AND "journalEntryId" IS NULL`,
          [journalId, invoiceId, payload.companyId]
        ).catch((e) => logger.error(e, "[EventListener] backfill journalEntryId failed"));
      }
    } catch (glErr) {
      logger.error(glErr, `[EventListener] umrah agent invoice GL recovery failed for #${invoiceId}`);
    }
  });

  eventBus.on("umrah.payment.received", async (payload) => {
    await logEvent("umrah.payment.received", payload);
    await logAudit("umrah.payment.received", { ...payload, action: "create", entity: "umrah_payments" });
    if (!payload.companyId) return;

    const details = typeof payload.details === "string" ? JSON.parse(payload.details) : (payload.details ?? {});

    // Cross-module: verify GL journal entry was posted for the payment
    const [glEntry] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "sourceType"='umrah_payments' AND "sourceId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [payload.entityId, payload.companyId]
    );
    if (!glEntry) {
      logger.warn(`[EventReaction] Payment #${payload.entityId} missing GL entry — attempting recovery`);
      try {
        const sarAmount = Number(details.sarAmount) || 0;
        const method = (details.method as string) || "bank_transfer";
        const payRef = (details.ref as string) || `UPAY-${payload.entityId}`;
        if (sarAmount > 0) {
          const [cashCode, arCode] = await Promise.all([
            getAccountCodeFromMapping(payload.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1111" : "1124"),
            getAccountCodeFromMapping(payload.companyId, "invoice_payment_ar", "credit", "1131"),
          ]);
          await createGuardedJournalEntry({
            companyId: payload.companyId,
            branchId: (payload.branchId as number) || 0,
            createdBy: (payload.userId as number) || 0,
            ref: `JE-${payRef}`,
            description: `سداد وكيل فرعي — ${payRef}`,
            type: "payment",
            sourceType: "umrah_payments",
            sourceId: payload.entityId as number,
            lines: [
              { accountCode: cashCode, debit: sarAmount, credit: 0 },
              { accountCode: arCode, debit: 0, credit: sarAmount },
            ],
          }, { table: "umrah_payments", id: payload.entityId as number });
        }
      } catch (glErr) {
        // createGuardedJournalEntry already records in financial_posting_failures
        logger.error(glErr, `[EventListener] payment GL recovery failed for payment #${payload.entityId}`);
      }
    }

    // Cross-module: mark obligation as fulfilled for fully-paid invoices
    if (details.allocations && Array.isArray(details.allocations)) {
      for (const alloc of details.allocations as Array<{ invoiceId: number }>) {
        const [inv] = await rawQuery<Record<string, unknown>>(
          `SELECT status FROM umrah_sales_invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [alloc.invoiceId, payload.companyId]
        );
        if (inv?.status === "paid") {
          await markObligationMet(payload.companyId, "umrah_sales_invoices", alloc.invoiceId, "payment").catch((e) => logger.error(e, "event listener background task failed"));
        }
      }
    }

    // Notification to manager
    const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
    if (mgr) {
      await createNotification({
        companyId: payload.companyId, assignmentId: mgr,
        type: "umrah", title: "دفعة عمرة مستلمة",
        body: `تم تسجيل دفعة ${details.ref ?? ""} بقيمة ${details.sarAmount ?? 0} ر.س`,
        priority: "normal", refType: "umrah_payments", refId: payload.entityId as number,
        actionUrl: `/umrah/payments`,
      });
    }
  });

  eventBus.on("umrah.commission.calculated", async (payload) => {
    await logEvent("umrah.commission.calculated", payload);
    await logAudit("umrah.commission.calculated", { ...payload, action: "calculate", entity: "employee_commission_plans" });
    if (!payload.companyId) return;

    const after = payload.after as Record<string, unknown> | undefined;
    const finalAmount = Number(after?.finalAmount) || 0;
    const month = after?.month as number;
    const year = after?.year as number;
    const planId = payload.entityId as number;

    // Cross-module: verify GL accrual was posted
    if (finalAmount > 0) {
      const [glEntry] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM journal_entries WHERE "sourceType"='employee_commission_calculations' AND "sourceId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [planId, payload.companyId]
      );
      if (!glEntry) {
        logger.warn(`[EventReaction] Commission plan #${planId} missing GL accrual — attempting recovery`);
        try {
          const [expenseCode, payableCode] = await Promise.all([
            getAccountCodeFromMapping(payload.companyId, "commission_expense", "debit", "5430"),
            getAccountCodeFromMapping(payload.companyId, "commission_payable", "credit", "2155"),
          ]);
          await createGuardedJournalEntry({
            companyId: payload.companyId,
            branchId: (payload.branchId as number) || 0,
            createdBy: (payload.userId as number) || 0,
            ref: `JE-COMM-${planId}-${year}${String(month).padStart(2, "0")}`,
            description: `استحقاق عمولة — خطة ${planId} — ${month}/${year}`,
            type: "accrual",
            sourceType: "employee_commission_calculations",
            sourceId: planId,
            lines: [
              { accountCode: expenseCode, debit: finalAmount, credit: 0, description: `مصروف عمولة` },
              { accountCode: payableCode, debit: 0, credit: finalAmount, description: `عمولة مستحقة` },
            ],
          }, { table: "employee_commission_plans", id: planId });
        } catch (glErr) {
          // createGuardedJournalEntry already records in financial_posting_failures
          logger.error(glErr, `[EventListener] commission GL recovery failed for plan #${planId}`);
        }
      }
    }

    // Notification to employee
    if (after?.assignmentId) {
      await createNotification({
        companyId: payload.companyId,
        assignmentId: after.assignmentId as number,
        type: "umrah", title: "تم حساب عمولتك",
        body: `عمولة شهر ${month}/${year}: ${finalAmount} ر.س`,
        priority: "normal", refType: "employee_commission_plans", refId: planId,
      });
    }

    // Notification to manager
    const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
    if (mgr) {
      await createNotification({
        companyId: payload.companyId, assignmentId: mgr,
        type: "hr", title: "عمولة موظف جديدة",
        body: `تم حساب عمولة بقيمة ${finalAmount} ر.س — خطة #${planId} — ${month}/${year}`,
        priority: "normal", refType: "employee_commission_plans", refId: planId,
      });
    }

    // Cross-module: link commission to payroll run (event-driven, not direct write)
    if (finalAmount > 0) {
      const assignmentId = after?.assignmentId as number | undefined;
      const employeeId = after?.employeeId as number | undefined;
      const periodKey = `${year}-${String(month).padStart(2, "0")}`;
      const [activeRun] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM payroll_runs WHERE "companyId"=$1 AND period=$2 AND status IN ('draft','processing') AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 1`,
        [payload.companyId, periodKey]
      );
      if (activeRun && assignmentId) {
        try {
          const [existingLine] = await rawQuery<Record<string, unknown>>(
            `SELECT id FROM payroll_lines WHERE "runId"=$1 AND "assignmentId"=$2 AND "deletedAt" IS NULL`,
            [activeRun.id, assignmentId]
          );
          if (existingLine) {
            await rawExecute(
              `UPDATE payroll_lines SET commission=$1, "netSalary"="netSalary"+$1 WHERE id=$2 AND "deletedAt" IS NULL`,
              [finalAmount, existingLine.id]
            );
          } else {
            await rawExecute(
              `INSERT INTO payroll_lines ("runId","assignmentId","employeeId",basic,"grossSalary",commission,"netSalary")
               VALUES ($1,$2,$3,0,0,$4,$4)`,
              [activeRun.id, assignmentId, employeeId ?? 0, finalAmount]
            );
          }
        } catch (plErr) {
          await rawExecute(
            `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
             VALUES ($1,$2,$3,$4,false)`,
            [payload.companyId, "commission_payroll_link", planId,
             `فشل ربط العمولة بمسير الرواتب — خطة ${planId} شهر ${month}/${year}: ${String(plErr)}`]
          ).catch((e) => logger.error(e, "event listener background task failed"));
        }
      } else if (!activeRun && mgr) {
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "hr", title: "عمولة بدون مسيّر رواتب",
          body: `عمولة ${finalAmount} ر.س (خطة #${planId}) محسوبة لشهر ${month}/${year} لكن لا يوجد مسيّر رواتب نشط — يرجى إنشاء مسيّر لتضمين العمولة`,
          priority: "high", refType: "employee_commission_plans", refId: planId,
          actionUrl: `/hr/payroll`,
        });
      }
    }
  });

  eventBus.on("umrah.agent.linked", async (payload) => {
    await logEvent("umrah.agent.linked", payload);
    await logAudit("umrah.agent.linked", { ...payload, action: "link", entity: "umrah_sub_agents" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "ربط وكيل فرعي بعميل",
          body: `تم ربط وكيل فرعي بعميل في النظام`,
          priority: "normal", refType: "umrah_sub_agents", refId: payload.entityId as number,
          actionUrl: `/umrah/sub-agents`,
        });
      }
    }
  });

  eventBus.on("umrah.violation.created", async (payload) => {
    await logEvent("umrah.violation.created", payload);
    await logAudit("umrah.violation.created", { ...payload, action: "create", entity: "umrah_violations" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        const after = payload.after as Record<string, unknown> | undefined;
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "مخالفة عمرة جديدة",
          body: `تم تسجيل مخالفة ${after?.type === "absconded" ? "هروب" : "تجاوز"} — غرامة ${after?.penaltyAmount ?? 0} ر.س`,
          priority: after?.type === "absconded" ? "urgent" : "high",
          refType: "umrah_violations", refId: payload.entityId as number,
          actionUrl: `/umrah/violations`,
        });
      }
    }
  });

  eventBus.on("umrah.season.opened", async (payload) => {
    await logEvent("umrah.season.opened", payload);
    await logAudit("umrah.season.opened", { ...payload, action: "create", entity: "umrah_seasons" });
    if (payload.companyId) {
      const mgr = await getManagerAssignmentId(payload.companyId, payload.branchId as number ?? 0);
      if (mgr) {
        const after = payload.after as Record<string, unknown> | undefined;
        await createNotification({
          companyId: payload.companyId, assignmentId: mgr,
          type: "umrah", title: "موسم عمرة جديد",
          body: `تم فتح ${after?.name ?? "موسم جديد"} — يرجى مراجعة ربط الوكلاء`,
          priority: "high", refType: "umrah_seasons", refId: payload.entityId as number,
          actionUrl: `/umrah/sub-agents`,
        });
      }
    }
  });

  const auditEntities = [
    "employee", "client", "invoice", "voucher", "expense", "purchase_request",
    "purchase_order", "salary_advance", "custody", "vendor", "leave_request",
    "attendance", "violation", "official_letter", "performance", "task", "project",
    "support_ticket", "trip", "vehicle", "maintenance", "fuel_log",
    "warehouse_product", "warehouse_movement", "crm_opportunity", "crm_activity",
    "company", "branch", "request", "communication", "property",
    // FND-006: listeners for the newly-mapped tracks (auditMiddleware emits
    // audit.{entity}.{action}; without a listener here the row would be lost).
    "legal_contract", "legal_case", "governance_item", "automation_rule",
    "marketing_campaign", "store_order", "bi_object",
  ];
  const auditActions = ["create", "update", "delete"];
  for (const entity of auditEntities) {
    for (const action of auditActions) {
      eventBus.on(`audit.${entity}.${action}`, async (payload) => {
        await logAudit(`${entity}.${action}`, { ...payload, action });
      });
    }
  }

  // ─── Cross-Domain Invoice Creation ─────────────────────────────────────
  // When Property, CRM, or other domains need to create invoices, they emit
  // events instead of writing directly to the finance-owned invoices table.
  // Finance domain processes these requests here.

  const invoiceRequestHandler = async (payload: EventPayload) => {
    if (!payload?.companyId) return;
    const ref = payload.ref as string;
    const subtotal = Number(payload.subtotal ?? 0);
    const vatAmount = Number(payload.vatAmount ?? 0);
    const total = Number(payload.total ?? subtotal + vatAmount);
    const projectId = payload.projectId != null ? Number(payload.projectId) : null;
    const ins = await rawExecute(
      `INSERT INTO invoices ("companyId","clientId","projectId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,15,0,'draft',$9,$10) RETURNING id`,
      [
        payload.companyId,
        payload.clientId ?? null,
        projectId,
        ref,
        payload.description ?? "",
        subtotal,
        total,
        vatAmount,
        payload.dueDate ?? toDateISO(new Date(Date.now() + 14 * 86400000)),
        payload.userId ?? 0,
      ]
    );
    const invoiceId = ins.insertId;
    // Optional line items (e.g. BOQ): one invoice_line per supplied line.
    // Back-compat — existing emitters pass no `lines` and this loop is skipped.
    const lines = Array.isArray(payload.lines) ? (payload.lines as Array<Record<string, unknown>>) : [];
    for (const ln of lines) {
      const q = Number(ln.quantity ?? 1);
      const up = Number(ln.unitPrice ?? 0);
      const ltot = Number(ln.lineTotal ?? Math.round(q * up * 100) / 100);
      await rawExecute(
        `INSERT INTO invoice_lines ("invoiceId",description,quantity,"unitPrice","lineTotal","projectId")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, String(ln.description ?? ""), q, up, ltot, projectId]
      );
    }
    // Optional: link the source BOQ items to the invoice just created. The
    // emitting route has already claimed them (status='billed'); here we only
    // stamp the resulting invoiceId so the project ledger shows what was billed.
    const boqItemIds = Array.isArray(payload.boqItemIds) ? (payload.boqItemIds as number[]) : [];
    if (boqItemIds.length > 0 && invoiceId > 0) {
      await rawExecute(
        `UPDATE project_boq_items SET "invoiceId"=$1, "updatedAt"=NOW()
         WHERE id = ANY($2::int[]) AND "companyId"=$3`,
        [invoiceId, boqItemIds, payload.companyId]
      );
    }
    // Same back-link for sold development units (Wave C.2).
    const devUnitIds = Array.isArray(payload.devUnitIds) ? (payload.devUnitIds as number[]) : [];
    if (devUnitIds.length > 0 && invoiceId > 0) {
      await rawExecute(
        `UPDATE development_units SET "invoiceId"=$1, "updatedAt"=NOW()
         WHERE id = ANY($2::int[]) AND "companyId"=$3`,
        [invoiceId, devUnitIds, payload.companyId]
      );
    }
  };

  registerCrossDomainHandler("property.invoice.requested", invoiceRequestHandler);
  registerCrossDomainHandler("crm.deal.invoice_requested", invoiceRequestHandler);
  registerCrossDomainHandler("legal.invoice.requested", invoiceRequestHandler);
  registerCrossDomainHandler("project.invoice.requested", invoiceRequestHandler);

  // شريحة 4 — ربط مرشّح خصم النقل بالإشعار الدائن الذي أصدرته المالية.
  // النقل يحدّث مرشّحه فقط (يملك جدوله)؛ المالية أطلقت الحدث (قفل الحدود).
  const transportDeductionLinkHandler = async (payload: EventPayload) => {
    const candidateId = Number(payload.deductionCandidateId);
    const creditMemoId = payload.creditMemoId != null ? Number(payload.creditMemoId) : null;
    if (!candidateId || !payload.companyId) return;
    await rawExecute(
      `UPDATE transport_deduction_candidates
          SET status = 'issued', "creditMemoId" = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3 AND status = 'pending'`,
      [creditMemoId, candidateId, payload.companyId],
    );
  };
  registerCrossDomainHandler("transport.deduction.materialized", transportDeductionLinkHandler);

  // ─── Cross-Domain Fixed Asset Registration ────────────────────────────
  // Fleet and Property domains emit events when they need to register
  // a fixed asset. Finance domain processes these here.
  registerCrossDomainHandler("finance.fixed_asset.requested", async (payload) => {
    if (!payload?.companyId) return;
    await rawExecute(
      `INSERT INTO fixed_assets ("companyId","branchId",code,name,description,category,
        "purchaseDate","purchaseCost","salvageValue","usefulLifeYears",
        "depreciationMethod","currentBookValue","accumulatedDepreciation",
        "assetAccountCode","depreciationAccountCode","accDepreciationAccountCode",status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'straight_line',$8,0,$11,$12,$13,'active')`,
      [
        payload.companyId,
        payload.branchId ?? null,
        payload.code,
        payload.name,
        payload.description ?? "",
        payload.category ?? "أخرى",
        payload.purchaseDate ?? todayISO(),
        Number(payload.purchaseCost ?? 0),
        Number(payload.salvageValue ?? 0),
        Number(payload.usefulLifeYears ?? 5),
        payload.assetAccountCode,
        payload.depreciationAccountCode,
        payload.accDepreciationAccountCode,
      ]
    );
  });

  // ─── Cross-Domain Warehouse Deduction ─────────────────────────────────
  // Fleet domain emits events when maintenance uses spare parts.
  // Warehouse domain processes the stock deduction here.
  registerCrossDomainHandler("fleet.warehouse_deduction.requested", async (payload) => {
    if (!payload?.companyId || !payload?.parts) return;
    const parts = payload.parts as Array<{ productId: number; quantity: number; unitCost?: number }>;
    const maintenanceId = payload.maintenanceId as number;
    // Route each consumed part through the warehouse engine so the issue is a
    // REAL movement with full accounting: FIFO batch depletion + COGS GL
    // posting (DR COGS / CR inventory). The previous raw UPDATE+INSERT skipped
    // FIFO and GL, leaving maintenance parts cost out of COGS — so the part
    // cost never reached the maintenance/owner/project P&L.
    const branchId = (payload.branchId as number | undefined) ?? 0;
    for (const part of parts) {
      await warehouseEngine.issueStock(
        { companyId: payload.companyId, branchId, createdBy: payload.userId ?? 0 },
        {
          productId: part.productId,
          quantity: part.quantity,
          unitCost: part.unitCost,
          reference: `MAINT-${maintenanceId}`,
          notes: `صيانة مركبة - طلب #${maintenanceId}`,
        }
      );
    }
  });

  // ─── Cross-Domain Legal Case Creation ─────────────────────────────────
  // Property domain emits events when overdue rent triggers legal action.
  // Legal domain processes the case creation here.
  registerCrossDomainHandler("property.legal_case.requested", async (payload) => {
    if (!payload?.companyId) return;
    await rawExecute(
      `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType","opposingParty","lawyerName",status,priority,description) VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8)`,
      [
        payload.companyId,
        payload.caseNumber,
        payload.title,
        payload.caseType ?? "civil",
        payload.opposingParty ?? null,
        payload.lawyerName ?? null,
        payload.priority ?? "normal",
        payload.description ?? "",
      ]
    );
  });

  // ─── Cross-Domain Legal Contract Creation ──────────────────────────────
  // CRM domain emits events when a deal is won and a service contract
  // needs to be created. Legal domain processes it here.
  registerCrossDomainHandler("crm.legal_contract.requested", async (payload) => {
    if (!payload?.companyId) return;
    await rawExecute(
      `INSERT INTO legal_contracts ("companyId",ref,title,"contractType","partyName","startDate","endDate",value,status,"createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)`,
      [
        payload.companyId,
        payload.ref,
        payload.title,
        payload.contractType ?? "service",
        payload.partyName ?? "",
        payload.startDate,
        payload.endDate,
        Number(payload.value ?? 0),
        payload.userId ?? 0,
      ]
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // HR operational-events closure pass — 2026-05-21 (functional audit M15)
  //
  // Loans, contracts, overtime, exit and the recruitment posting/application
  // + training lifecycles all `emitEvent(...)` on every transition but had
  // no `eventBus.on(...)` subscriber. `emitEvent` only persists to
  // `event_logs` for critical events or when PERSIST_ALL_EVENTS is set, so
  // these non-critical HR events were emitted into the void — no log row.
  //
  // These subscribers call `logEvent` ONLY, to give each event its
  // `event_logs` row. They deliberately do NOT call `logAudit`: every one
  // of these HR routes already writes `audit_logs` directly via
  // `createAuditLog(...)` in the emitting handler, so a `logAudit` here
  // would insert a duplicate audit row. No GL, no lifecycle side-effects.
  // ──────────────────────────────────────────────────────────────────────

  // ── HR — employee loans ──
  eventBus.on("hr.loan.created", async (payload) => {
    await logEvent("hr.loan.created", payload);
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      const employeeName = String(payload.employeeName ?? "—");
      const amount = String(payload.amount ?? "0");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "loan.request.created",
        templateVars: { employeeName, amount },
        fallbackTitle: "طلب قرض جديد",
        fallbackBody: `طلب قرض من ${employeeName} بمبلغ ${amount} ريال`,
        assignmentId: managerId ?? undefined,
        priority: "normal",
        refType: "employee_loan",
        refId: payload.entityId as number,
        actionUrl: `/hr/loans/${payload.entityId}`,
      });
    }
  });
  eventBus.on("hr.loan.approved", async (payload) => {
    await logEvent("hr.loan.approved", payload);
  });
  eventBus.on("hr.loan.rejected", async (payload) => {
    await logEvent("hr.loan.rejected", payload);
  });

  // ── HR — employee contracts ──
  eventBus.on("hr.contract.created", async (payload) => {
    await logEvent("hr.contract.created", payload);
  });
  eventBus.on("hr.contract.updated", async (payload) => {
    await logEvent("hr.contract.updated", payload);
  });
  eventBus.on("hr.contract.submitted", async (payload) => {
    await logEvent("hr.contract.submitted", payload);
  });
  eventBus.on("hr.contract.approved", async (payload) => {
    await logEvent("hr.contract.approved", payload);
  });
  eventBus.on("hr.contract.rejected", async (payload) => {
    await logEvent("hr.contract.rejected", payload);
  });
  eventBus.on("hr.contract.signed_by_company", async (payload) => {
    await logEvent("hr.contract.signed_by_company", payload);
  });
  eventBus.on("hr.contract.signed_by_employee", async (payload) => {
    await logEvent("hr.contract.signed_by_employee", payload);
  });
  eventBus.on("hr.contract.activated", async (payload) => {
    await logEvent("hr.contract.activated", payload);
  });
  eventBus.on("hr.contract.renewed", async (payload) => {
    await logEvent("hr.contract.renewed", payload);
  });
  eventBus.on("hr.contract.terminated", async (payload) => {
    await logEvent("hr.contract.terminated", payload);
  });

  // ── HR — overtime requests ──
  eventBus.on("hr.overtime.created", async (payload) => {
    await logEvent("hr.overtime.created", payload);
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      const employeeName = String(payload.employeeName ?? "—");
      const hours = String(payload.hours ?? payload.totalHours ?? "0");
      const date = String(payload.date ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "overtime.request.created",
        templateVars: { employeeName, hours, date },
        fallbackTitle: "طلب وقت إضافي",
        fallbackBody: `طلب وقت إضافي من ${employeeName} (${hours} ساعة)`,
        assignmentId: managerId ?? undefined,
        priority: "normal",
        refType: "overtime_request",
        refId: payload.entityId as number,
        actionUrl: `/hr/overtime/${payload.entityId}`,
      });
    }
  });
  eventBus.on("hr.overtime.approved", async (payload) => {
    await logEvent("hr.overtime.approved", payload);
  });
  eventBus.on("hr.overtime.rejected", async (payload) => {
    await logEvent("hr.overtime.rejected", payload);
  });

  // ── HR — exit / end-of-service ──
  eventBus.on("hr.exit.created", async (payload) => {
    await logEvent("hr.exit.created", payload);
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      const employeeName = String(payload.employeeName ?? "—");
      const lastDay = String(payload.lastDay ?? payload.lastWorkingDay ?? "—");
      await notifyBusinessEvent({
        companyId: payload.companyId,
        templateKey: "exit.request.created",
        templateVars: { employeeName, lastDay },
        fallbackTitle: "طلب إخلاء طرف",
        fallbackBody: `طلب إخلاء طرف من ${employeeName}`,
        assignmentId: managerId ?? undefined,
        priority: "high",
        refType: "exit_request",
        refId: payload.entityId as number,
        actionUrl: `/hr/exit-requests/${payload.entityId}`,
      });
    }
  });
  eventBus.on("hr.exit.approved", async (payload) => {
    await logEvent("hr.exit.approved", payload);
  });
  eventBus.on("hr.exit.rejected", async (payload) => {
    await logEvent("hr.exit.rejected", payload);
  });
  eventBus.on("hr.exit.completed", async (payload) => {
    await logEvent("hr.exit.completed", payload);
  });

  // ── HR — training programs + enrollments ──
  eventBus.on("training.program.created", async (payload) => {
    await logEvent("training.program.created", payload);
  });
  eventBus.on("training.program.updated", async (payload) => {
    await logEvent("training.program.updated", payload);
  });
  eventBus.on("training.program.deleted", async (payload) => {
    await logEvent("training.program.deleted", payload);
  });
  eventBus.on("training.program.approved", async (payload) => {
    await logEvent("training.program.approved", payload);
  });
  eventBus.on("training.program.rejected", async (payload) => {
    await logEvent("training.program.rejected", payload);
  });
  eventBus.on("training.enrollment.created", async (payload) => {
    await logEvent("training.enrollment.created", payload);
  });
  eventBus.on("training.enrollment.updated", async (payload) => {
    await logEvent("training.enrollment.updated", payload);
  });
  eventBus.on("training.enrollment.deleted", async (payload) => {
    await logEvent("training.enrollment.deleted", payload);
  });

  // ── HR — recruitment postings + applications ──
  eventBus.on("recruitment.posting.created", async (payload) => {
    await logEvent("recruitment.posting.created", payload);
  });
  eventBus.on("recruitment.posting.updated", async (payload) => {
    await logEvent("recruitment.posting.updated", payload);
  });
  eventBus.on("recruitment.posting.deleted", async (payload) => {
    await logEvent("recruitment.posting.deleted", payload);
  });
  eventBus.on("recruitment.posting.closed", async (payload) => {
    await logEvent("recruitment.posting.closed", payload);
  });
  eventBus.on("recruitment.posting.reopened", async (payload) => {
    await logEvent("recruitment.posting.reopened", payload);
  });
  eventBus.on("recruitment.application.created", async (payload) => {
    await logEvent("recruitment.application.created", payload);
  });
  eventBus.on("recruitment.application.updated", async (payload) => {
    await logEvent("recruitment.application.updated", payload);
  });
  eventBus.on("recruitment.application.deleted", async (payload) => {
    await logEvent("recruitment.application.deleted", payload);
  });

  // ── #1812 — umrah → transport bridge. When an umrah group is
  //    created with mutamerCount > 0, notify the dispatcher that
  //    transport bookings need to be materialized. The "النقل ليس
  //    جزيرة" mandate: the system surfaces the integration
  //    automatically instead of waiting for the operator to remember.
  eventBus.on("umrah.group.created", async (payload) => {
    await logEvent("umrah.group.created", payload);
    if (!payload.companyId) return;
    try {
      const [group] = await rawQuery<{
        id: number; mutamerCount: number | null; nuskGroupNumber: string | null;
      }>(
        `SELECT id, "mutamerCount", "nuskGroupNumber"
           FROM umrah_groups WHERE id = $1 AND "companyId" = $2`,
        [payload.entityId as number, payload.companyId as number],
      );
      if (!group) return;
      const mutamerCount = group.mutamerCount ?? 0;
      if (mutamerCount <= 0) return;
      // Find the fleet dispatcher manager assignment to notify. Falls
      // back to the branch manager if no fleet dispatcher exists.
      const managerId = payload.branchId
        ? await getManagerAssignmentId(payload.companyId as number, payload.branchId as number)
        : null;
      if (managerId) {
        await createNotification({
          companyId: payload.companyId as number,
          assignmentId: managerId,
          type: "fleet",
          title: "مجموعة عمرة جديدة بحاجة لنقل",
          body: `مجموعة ${group.nuskGroupNumber ?? `#${group.id}`} (${mutamerCount} معتمر) تحتاج إلى إنشاء حجوزات نقل. افتح /fleet/transport/integration للمتابعة.`,
          actionUrl: "/fleet/transport/integration",
          refType: "umrah_groups",
          refId: group.id,
        });
      }
    } catch (err) {
      logger.warn({ err }, "umrah→transport bridge failed");
    }
  });

  logger.info("All event listeners registered successfully");
}
