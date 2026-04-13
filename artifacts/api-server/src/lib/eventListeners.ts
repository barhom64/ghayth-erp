import { eventBus, type EventPayload } from "./eventBus.js";
import { pool, rawQuery, rawExecute } from "./rawdb.js";
import { createNotification, getManagerAssignmentId } from "./businessHelpers.js";
import { computeDiff } from "./auditDiff.js";

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
    console.error(`[EventLog] Failed to log ${event}:`, err);
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

    await pool.query(
      `INSERT INTO audit_logs ("companyId","branchId","userId",action,entity,"entityId","before","after","changes","reason","scope")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
      ]
    );
  } catch (err) {
    console.error(`[AuditLog] Failed to audit ${event}:`, err);
  }
}

export function registerEventListeners() {
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

  eventBus.on("employee.deleted", async (payload) => {
    await logEvent("employee.deleted", payload);
    await logAudit("employee.deleted", { ...payload, action: "delete" });
  });

  eventBus.on("invoice.created", async (payload) => {
    await logEvent("invoice.created", payload);
    await logAudit("invoice.created", { ...payload, action: "create" });
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      if (managerId) {
        await createNotification({
          companyId: payload.companyId,
          assignmentId: managerId,
          type: "finance",
          title: "فاتورة جديدة",
          body: `تم إنشاء فاتورة #${payload.entityId}`,
          priority: "normal",
          refType: "invoice",
          refId: payload.entityId as number,
          actionUrl: `/finance/invoices/${payload.entityId}`,
        });
      }
    }
  });

  eventBus.on("invoice.updated", async (payload) => {
    await logEvent("invoice.updated", payload);
    await logAudit("invoice.updated", { ...payload, action: "update" });
  });

  eventBus.on("invoice.paid", async (payload) => {
    await logEvent("invoice.paid", payload);
    await logAudit("invoice.paid", { ...payload, action: "update" });
  });

  eventBus.on("leave.requested", async (payload) => {
    await logEvent("leave.requested", payload);
    await logAudit("leave.requested", { ...payload, action: "create" });
    if (payload.companyId && payload.branchId) {
      const managerId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
      if (managerId) {
        await createNotification({
          companyId: payload.companyId,
          assignmentId: managerId,
          type: "hr",
          title: "طلب إجازة جديد",
          body: `طلب إجازة من ${payload.employeeName || "موظف"} - ${payload.leaveType || ""}`,
          priority: "high",
          refType: "leave_request",
          refId: payload.entityId as number,
          actionUrl: `/hr/leaves`,
        });
      }
    }
  });

  eventBus.on("leave.approved", async (payload) => {
    await logEvent("leave.approved", payload);
    await logAudit("leave.approved", { ...payload, action: "approve" });
    if (payload.companyId && payload.assignmentId) {
      await createNotification({
        companyId: payload.companyId,
        assignmentId: payload.assignmentId as number,
        type: "hr",
        title: "تمت الموافقة على إجازتك",
        body: "تمت الموافقة على طلب الإجازة الخاص بك",
        priority: "normal",
        refType: "leave_request",
        refId: payload.entityId as number,
      });
    }
  });

  eventBus.on("leave.rejected", async (payload) => {
    await logEvent("leave.rejected", payload);
    await logAudit("leave.rejected", { ...payload, action: "reject" });
    if (payload.companyId && payload.assignmentId) {
      await createNotification({
        companyId: payload.companyId,
        assignmentId: payload.assignmentId as number,
        type: "hr",
        title: "تم رفض إجازتك",
        body: "تم رفض طلب الإجازة الخاص بك",
        priority: "normal",
        refType: "leave_request",
        refId: payload.entityId as number,
      });
    }
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
  });

  eventBus.on("purchase_request.approved", async (payload) => {
    await logEvent("purchase_request.approved", payload);
    await logAudit("purchase_request.approved", { ...payload, action: "approve" });
  });

  eventBus.on("crm.opportunity.created", async (payload) => {
    await logEvent("crm.opportunity.created", payload);
    await logAudit("crm.opportunity.created", { ...payload, action: "create" });
  });

  eventBus.on("crm.opportunity.won", async (payload) => {
    await logEvent("crm.opportunity.won", payload);
    await logAudit("crm.opportunity.won", { ...payload, action: "update" });
  });

  eventBus.on("crm.opportunity.lost", async (payload) => {
    await logEvent("crm.opportunity.lost", payload);
    await logAudit("crm.opportunity.lost", { ...payload, action: "update" });
  });

  eventBus.on("task.created", async (payload) => {
    await logEvent("task.created", payload);
    await logAudit("task.created", { ...payload, action: "create" });
    if (payload.companyId && payload.assigneeAssignmentId) {
      await createNotification({
        companyId: payload.companyId,
        assignmentId: payload.assigneeAssignmentId as number,
        type: "task",
        title: "مهمة جديدة",
        body: `تم تعيين مهمة جديدة لك: ${payload.taskTitle || ""}`,
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

  eventBus.on("maintenance.completed", async (payload) => {
    await logEvent("maintenance.completed", payload);
    await logAudit("maintenance.completed", { ...payload, action: "maintenance_completed" });
  });

  eventBus.on("support.ticket.created", async (payload) => {
    await logEvent("support.ticket.created", payload);
    await logAudit("support.ticket.created", { ...payload, action: "create" });
  });

  eventBus.on("support.ticket.resolved", async (payload) => {
    await logEvent("support.ticket.resolved", payload);
    await logAudit("support.ticket.resolved", { ...payload, action: "update" });
  });

  eventBus.on("fleet.trip.started", async (payload) => {
    await logEvent("fleet.trip.started", payload);
    await logAudit("fleet.trip.started", { ...payload, action: "create" });
  });

  eventBus.on("fleet.trip.completed", async (payload) => {
    await logEvent("fleet.trip.completed", payload);
    await logAudit("fleet.trip.completed", { ...payload, action: "update" });
  });

  eventBus.on("warehouse.movement.created", async (payload) => {
    await logEvent("warehouse.movement.created", payload);
    await logAudit("warehouse.movement.created", { ...payload, action: "create" });
  });

  eventBus.on("payroll.processed", async (payload) => {
    await logEvent("payroll.processed", payload);
    await logAudit("payroll.processed", { ...payload, action: "create" });
  });

  eventBus.on("payroll.completed", async (payload) => {
    await logEvent("payroll.completed", payload);
    await logAudit("payroll.completed", { ...payload, action: "create" });
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

  eventBus.on("leave.stage1_approved", async (payload) => {
    await logEvent("leave.stage1_approved", payload);
    await logAudit("leave.stage1_approved", { ...payload, action: "approve" });
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

  // Official letters — when a letter is approved, queue it for delivery
  // and mark it as sent. Without this subscriber the approval route stops
  // at status='approved' and the letter never reaches the recipient.
  eventBus.on("hr.letter.approved", async (payload) => {
    await logEvent("hr.letter.approved", payload);
    await logAudit("hr.letter.approved", { ...payload, action: "approve", entity: "official_letter" });

    try {
      const letterId = Number(payload.entityId);
      if (!letterId || !payload.companyId) return;

      const [letter] = await rawQuery<any>(
        `SELECT ol.*, e.name AS "employeeName", e.email AS "employeeEmail", e.phone AS "employeePhone"
         FROM official_letters ol
         LEFT JOIN employees e ON e.id = ol."employeeId"
         WHERE ol.id = $1 AND ol."companyId" = $2`,
        [letterId, payload.companyId]
      );

      if (!letter) return;
      if (letter.sentAt) return; // already dispatched

      const subject = letter.subject || `خطاب رسمي #${letterId}`;
      const body = letter.content || subject;

      if (letter.employeeEmail) {
        await rawExecute(
          `INSERT INTO email_queue ("companyId","toEmail","recipientName",subject,body,status,"createdAt","refType","refId")
           VALUES ($1,$2,$3,$4,$5,'pending',NOW(),'official_letter',$6)`,
          [payload.companyId, letter.employeeEmail, letter.employeeName ?? "", subject, body, letterId]
        );
      }

      // Best-effort WhatsApp copy if we have a phone and the queue exists.
      if (letter.employeePhone) {
        try {
          await rawExecute(
            `INSERT INTO whatsapp_queue ("companyId","toPhone",message,status,"createdAt","refType","refId")
             VALUES ($1,$2,$3,'pending',NOW(),'official_letter',$4)`,
            [payload.companyId, letter.employeePhone, `${subject}\n\n${body}`, letterId]
          );
        } catch {
          /* whatsapp_queue may not exist in every deployment — ignore */
        }
      }

      // Mark the letter as dispatched so we never double-queue it.
      await rawExecute(
        `UPDATE official_letters SET "sentAt" = NOW() WHERE id = $1 AND "sentAt" IS NULL`,
        [letterId]
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
      console.error("[hr.letter.approved] dispatch failed:", err);
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
  eventBus.on("voucher.deleted", async (payload) => {
    await logEvent("voucher.deleted", payload);
    await logAudit("voucher.deleted", { ...payload, action: "delete", entity: "voucher" });
  });
  eventBus.on("expense.deleted", async (payload) => {
    await logEvent("expense.deleted", payload);
    await logAudit("expense.deleted", { ...payload, action: "delete", entity: "expense" });
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
  eventBus.on("fiscal_period.close", async (payload) => {
    await logEvent("fiscal_period.close", payload);
    await logAudit("fiscal_period.close", { ...payload, action: "close", entity: "fiscal_period" });
  });
  eventBus.on("fiscal_period.reopen", async (payload) => {
    await logEvent("fiscal_period.reopen", payload);
    await logAudit("fiscal_period.reopen", { ...payload, action: "reopen", entity: "fiscal_period" });
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
  });
  eventBus.on("payroll.posted", async (payload) => {
    await logEvent("payroll.posted", payload);
    await logAudit("payroll.posted", { ...payload, action: "post", entity: "payroll_run" });
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
  });
  eventBus.on("deposit.received", async (payload) => {
    await logEvent("deposit.received", payload);
    await logAudit("deposit.received", { ...payload, action: "receive", entity: "deposit" });
  });
  eventBus.on("deposit.refunded", async (payload) => {
    await logEvent("deposit.refunded", payload);
    await logAudit("deposit.refunded", { ...payload, action: "refund", entity: "deposit" });
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

  const auditEntities = [
    "employee", "client", "invoice", "voucher", "expense", "purchase_request",
    "purchase_order", "salary_advance", "custody", "vendor", "leave_request",
    "attendance", "violation", "official_letter", "performance", "task", "project",
    "support_ticket", "trip", "vehicle", "maintenance", "fuel_log",
    "warehouse_product", "warehouse_movement", "crm_opportunity", "crm_activity",
    "company", "branch", "request", "communication", "property",
  ];
  const auditActions = ["create", "update", "delete"];
  for (const entity of auditEntities) {
    for (const action of auditActions) {
      eventBus.on(`audit.${entity}.${action}`, async (payload) => {
        await logAudit(`${entity}.${action}`, { ...payload, action });
      });
    }
  }

  console.log("[EventSystem] All event listeners registered successfully");
}
