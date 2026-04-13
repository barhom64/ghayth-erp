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
