import { eventBus, registerCrossDomainHandler, type EventPayload } from "./eventBus.js";
import { pool, rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import { createNotification, getManagerAssignmentId, createJournalEntry, getAccountCodeFromMapping, todayISO, toDateISO, currentYear } from "./businessHelpers.js";
import { computeDiff } from "./auditDiff.js";
import { calculateAllForCompany } from "./umrahCommissionEngine.js";
import { registerObligation, markObligationMet } from "./obligationsEngine.js";

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
    logger.error(err, `[AuditLog] Failed to audit ${event}:`);
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

    // Cross-module: mark financial obligation as fulfilled
    if (payload.companyId && payload.entityId) {
      await markObligationMet(payload.companyId, "invoices", payload.entityId as number, "payment").catch((e) => logger.error(e, "event listener background task failed"));
    }
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
  });

  eventBus.on("crm.deal.lost", async (payload) => {
    await logEvent("crm.deal.lost", payload);
    await logAudit("crm.deal.lost", { ...payload, action: "update" });
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

  eventBus.on("support.ticket.created", async (payload) => {
    await logEvent("support.ticket.created", payload);
    await logAudit("support.ticket.created", { ...payload, action: "create" });
  });

  eventBus.on("support.ticket.resolved", async (payload) => {
    await logEvent("support.ticket.resolved", payload);
    await logAudit("support.ticket.resolved", { ...payload, action: "resolve", entity: "support_tickets" });
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
        } catch (e) {
          logger.warn(e, "whatsapp_queue table may not exist in this deployment");
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
        const month = Number(details.month) || new Date().getMonth() + 1;
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

    // Cross-module: when payroll is posted, create GL journal entry for total salaries
    if (payload.companyId && payload.entityId) {
      try {
        const [runTotals] = await rawQuery<any>(
          `SELECT COALESCE(SUM("grossSalary"),0)::numeric(12,2) AS gross,
                  COALESCE(SUM(commission),0)::numeric(12,2) AS comm,
                  COALESCE(SUM("netSalary"),0)::numeric(12,2) AS net
           FROM payroll_lines WHERE "runId"=$1 AND "deletedAt" IS NULL`,
          [payload.entityId]
        );
        const gross = Number(runTotals?.gross) || 0;
        const comm = Number(runTotals?.comm) || 0;
        if (gross + comm > 0) {
          const [salaryExpCode, salaryPayableCode] = await Promise.all([
            getAccountCodeFromMapping(payload.companyId, "salary_expense", "debit", "6100"),
            getAccountCodeFromMapping(payload.companyId, "salary_payable", "credit", "2100"),
          ]);
          const lines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [
            { accountCode: salaryExpCode, debit: gross, credit: 0, description: "مصروف رواتب" },
            { accountCode: salaryPayableCode, debit: 0, credit: gross, description: "رواتب مستحقة" },
          ];
          if (comm > 0) {
            const commPayableCode = await getAccountCodeFromMapping(payload.companyId, "commission_payable", "credit", "2150");
            lines.push({ accountCode: commPayableCode, debit: comm, credit: 0, description: "تسوية عمولات مستحقة سابقاً" });
            lines.push({ accountCode: salaryPayableCode, debit: 0, credit: comm, description: "عمولات ضمن الرواتب" });
          }
          await createJournalEntry({
            companyId: payload.companyId,
            branchId: (payload.branchId as number) || 0,
            createdBy: (payload.userId as number) || 0,
            ref: `JE-PAY-${payload.entityId}`,
            description: `ترحيل مسيّر رواتب #${payload.entityId}`,
            type: "payroll",
            sourceType: "payroll_runs",
            sourceId: payload.entityId as number,
            lines,
          });
        }
      } catch (glErr) {
        await rawExecute(
          `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
           VALUES ($1,$2,$3,$4,false)`,
          [payload.companyId, "payroll_gl_posting", payload.entityId ?? 0,
           `فشل ترحيل قيد الرواتب: ${String(glErr)}`]
        ).catch((e) => logger.error(e, "event listener background task failed"));
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

    // Cross-module: verify GL journal entry was posted
    const [glEntry] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "sourceType"='umrah_sales_invoices' AND "sourceId"=$1 AND "companyId"=$2 LIMIT 1`,
      [payload.entityId, payload.companyId]
    );
    if (!glEntry) {
      logger.warn(`[EventReaction] Invoice #${payload.entityId} missing GL entry — will be posted on approval`);
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

  eventBus.on("umrah.payment.received", async (payload) => {
    await logEvent("umrah.payment.received", payload);
    await logAudit("umrah.payment.received", { ...payload, action: "create", entity: "umrah_payments" });
    if (!payload.companyId) return;

    const details = typeof payload.details === "string" ? JSON.parse(payload.details) : (payload.details ?? {});

    // Cross-module: verify GL journal entry was posted for the payment
    const [glEntry] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "sourceType"='umrah_payments' AND "sourceId"=$1 AND "companyId"=$2 LIMIT 1`,
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
            getAccountCodeFromMapping(payload.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1100" : "1110"),
            getAccountCodeFromMapping(payload.companyId, "invoice_payment_ar", "credit", "1200"),
          ]);
          await createJournalEntry({
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
          });
        }
      } catch (glErr) {
        await rawExecute(
          `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
           VALUES ($1,$2,$3,$4,false)`,
          [payload.companyId, "payment_gl_recovery", payload.entityId ?? 0,
           `فشل استعادة قيد الدفعة: ${String(glErr)}`]
        ).catch((e) => logger.error(e, "event listener background task failed"));
      }
    }

    // Cross-module: mark obligation as fulfilled for fully-paid invoices
    if (details.allocations && Array.isArray(details.allocations)) {
      for (const alloc of details.allocations as Array<{ invoiceId: number }>) {
        const [inv] = await rawQuery<any>(
          `SELECT status FROM umrah_sales_invoices WHERE id=$1 AND "companyId"=$2`,
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
      const [glEntry] = await rawQuery<any>(
        `SELECT id FROM journal_entries WHERE "sourceType"='employee_commission_calculations' AND "sourceId"=$1 AND "companyId"=$2 LIMIT 1`,
        [planId, payload.companyId]
      );
      if (!glEntry) {
        logger.warn(`[EventReaction] Commission plan #${planId} missing GL accrual — attempting recovery`);
        try {
          const [expenseCode, payableCode] = await Promise.all([
            getAccountCodeFromMapping(payload.companyId, "commission_expense", "debit", "6200"),
            getAccountCodeFromMapping(payload.companyId, "commission_payable", "credit", "2150"),
          ]);
          await createJournalEntry({
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
          });
        } catch (glErr) {
          await rawExecute(
            `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
             VALUES ($1,$2,$3,$4,false)`,
            [payload.companyId, "commission_gl_recovery", planId,
             `فشل استعادة قيد العمولة: ${String(glErr)}`]
          ).catch((e) => logger.error(e, "event listener background task failed"));
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
      const [activeRun] = await rawQuery<any>(
        `SELECT id FROM payroll_runs WHERE "companyId"=$1 AND period=$2 AND status IN ('draft','processing') AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 1`,
        [payload.companyId, periodKey]
      );
      if (activeRun && assignmentId) {
        try {
          const [existingLine] = await rawQuery<any>(
            `SELECT id FROM payroll_lines WHERE "runId"=$1 AND "assignmentId"=$2 AND "deletedAt" IS NULL`,
            [activeRun.id, assignmentId]
          );
          if (existingLine) {
            await rawExecute(
              `UPDATE payroll_lines SET commission=$1, "netSalary"="netSalary"+$1 WHERE id=$2`,
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
    await rawExecute(
      `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,15,0,'draft',$8,$9)`,
      [
        payload.companyId,
        payload.clientId ?? null,
        ref,
        payload.description ?? "",
        subtotal,
        total,
        vatAmount,
        payload.dueDate ?? toDateISO(new Date(Date.now() + 14 * 86400000)),
        payload.userId ?? 0,
      ]
    );
  };

  registerCrossDomainHandler("property.invoice.requested", invoiceRequestHandler);
  registerCrossDomainHandler("crm.deal.invoice_requested", invoiceRequestHandler);
  registerCrossDomainHandler("legal.invoice.requested", invoiceRequestHandler);
  registerCrossDomainHandler("project.invoice.requested", invoiceRequestHandler);

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
    for (const part of parts) {
      await rawExecute(
        `UPDATE warehouse_products SET "currentStock"="currentStock"-$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`,
        [part.quantity, part.productId, payload.companyId]
      );
      await rawExecute(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy") VALUES ($1,$2,'out',$3,$4,$5,$6,$7)`,
        [payload.companyId, part.productId, part.quantity, part.unitCost || 0, `MAINT-${maintenanceId}`, `صيانة مركبة - طلب #${maintenanceId}`, payload.userId ?? 0]
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

  logger.info("All event listeners registered successfully");
}
