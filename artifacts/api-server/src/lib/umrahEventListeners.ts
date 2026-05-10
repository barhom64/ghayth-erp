/**
 * Umrah Event Listeners — Phase 6.
 *
 * Wires the seven Umrah-specific event names emitted by the import
 * engine + commission engine + entity routes into the existing event-log
 * + audit-log + notification pipeline. The legacy `eventListeners.ts`
 * registry stays untouched; this file exposes a single
 * `registerUmrahEventListeners()` that the boot sequence calls after
 * `registerEventListeners()`.
 *
 * Listed events (and where they're emitted):
 *   * umrah.mutamers.imported    — umrahImportEngine.confirmImport()
 *   * umrah.vouchers.imported    — umrahImportEngine.confirmImport()
 *   * umrah.overstay.detected    — umrahImportEngine + umrahCronJobs.C27
 *   * umrah.absconder.detected   — umrahImportEngine + umrahCronJobs.C28
 *   * umrah.violation.created    — POST /umrah/violations (manual)
 *   * umrah.agent.linked         — POST/PATCH /umrah/sub-agents
 *   * umrah.commission.calculated — umrahCommissionEngine
 *
 * Conventions inherited from the legacy listener registry:
 *   * always call `logEvent()` first so event_logs gains its single row
 *   * always call `logAudit()` so audit_logs gets the diff row
 *   * notifications target assignmentIds resolved via the existing
 *     `getManagerAssignmentId` / `getCfoAssignmentId` helpers
 *   * failures are caught + console-logged but never propagated — the
 *     listener must NEVER crash the emitting transaction
 */

import { eventBus, type EventPayload } from "./eventBus.js";
import { pool } from "./rawdb.js";
import {
  createNotification,
  getManagerAssignmentId,
  getCfoAssignmentId,
} from "./businessHelpers.js";

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
        payload.details ? (typeof payload.details === "string" ? payload.details : JSON.stringify(payload.details)) : null,
      ]
    );
  } catch (err) {
    console.error(`[UmrahEventLog] Failed to log ${event}:`, err);
  }
}

async function logAudit(event: string, payload: EventPayload) {
  try {
    await pool.query(
      `INSERT INTO audit_logs ("companyId","branchId","userId",action,entity,"entityId","before","after")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        payload.companyId ?? null,
        payload.branchId ?? null,
        payload.userId ?? null,
        event,
        payload.entity ?? event.split(".")[0],
        payload.entityId ? String(payload.entityId) : null,
        payload.before ? JSON.stringify(payload.before) : null,
        payload.after ? JSON.stringify(payload.after) : null,
      ]
    );
  } catch (err) {
    console.error(`[UmrahAuditLog] Failed to audit ${event}:`, err);
  }
}

async function notifyManager(payload: EventPayload, title: string, body: string, priority: "normal" | "high" | "critical", actionUrl: string) {
  try {
    if (!payload.companyId || !payload.branchId) return;
    const assignmentId = await getManagerAssignmentId(payload.companyId, payload.branchId as number);
    if (!assignmentId) return;
    await createNotification({
      companyId: payload.companyId,
      assignmentId,
      type: "umrah",
      title,
      body,
      priority,
      refType: (payload.entity as string) ?? "umrah",
      refId: (payload.entityId as number) ?? 0,
      actionUrl,
    });
  } catch (err) {
    console.error(`[UmrahNotify] ${title} failed:`, err);
  }
}

async function notifyCfo(payload: EventPayload, title: string, body: string, priority: "normal" | "high" | "critical", actionUrl: string) {
  try {
    if (!payload.companyId || !payload.branchId) return;
    const assignmentId = await getCfoAssignmentId(payload.companyId, payload.branchId as number);
    if (!assignmentId) return;
    await createNotification({
      companyId: payload.companyId,
      assignmentId,
      type: "umrah",
      title,
      body,
      priority,
      refType: (payload.entity as string) ?? "umrah",
      refId: (payload.entityId as number) ?? 0,
      actionUrl,
    });
  } catch (err) {
    console.error(`[UmrahNotifyCfo] ${title} failed:`, err);
  }
}

// ---------------------------------------------------------------------------

export function registerUmrahEventListeners(): void {
  // 1. Mutamers import completed
  eventBus.on("umrah.mutamers.imported", async (payload) => {
    await logEvent("umrah.mutamers.imported", payload);
    await logAudit("umrah.mutamers.imported", { ...payload, action: "import" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    const body = `استيراد المعتمرين اكتمل — جديد: ${d?.inserted ?? 0}، مُحدَّث: ${d?.updated ?? 0}، تم تخطّيه: ${d?.skipped ?? 0}`;
    await notifyManager(payload, "تم استيراد ملف المعتمرين", body, "normal",
      `/umrah/import-wizard`);
  });

  // 2. Vouchers import completed
  eventBus.on("umrah.vouchers.imported", async (payload) => {
    await logEvent("umrah.vouchers.imported", payload);
    await logAudit("umrah.vouchers.imported", { ...payload, action: "import" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    const body = `استيراد الفواتير اكتمل — جديد: ${d?.inserted ?? 0}، مُحدَّث: ${d?.updated ?? 0}، فواتير شراء: ${d?.purchaseInvoicesCreated ?? 0}`;
    await notifyManager(payload, "تم استيراد ملف الفواتير", body, "normal",
      `/umrah/import-wizard`);
    await notifyCfo(payload, "فواتير نسك جديدة", body, "normal", `/umrah/nusk-invoices`);
  });

  // 3. Overstay detected (per pilgrim)
  eventBus.on("umrah.overstay.detected", async (payload) => {
    await logEvent("umrah.overstay.detected", payload);
    await logAudit("umrah.overstay.detected", { ...payload, action: "detect" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyManager(payload, "معتمر متجاوز",
      `معتمر تجاوز مدة البرنامج — جواز ${d?.refNumber ?? "غير معروف"}، غرامة ${d?.penaltyAmount ?? 0} ر.س`,
      "high", `/umrah/violations?status=detected`);
  });

  // 4. Absconder detected (per pilgrim — critical priority)
  eventBus.on("umrah.absconder.detected", async (payload) => {
    await logEvent("umrah.absconder.detected", payload);
    await logAudit("umrah.absconder.detected", { ...payload, action: "detect" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    const body =
      `معتمر تم التبليغ عنه — جواز ${d?.refNumber ?? "غير معروف"}، غرامة ${d?.penaltyAmount ?? 2000} ر.س`;
    await notifyManager(payload, "معتمر متغيّب — حرج", body, "critical",
      `/umrah/violations?status=detected`);
    await notifyCfo(payload, "معتمر متغيّب — يحتاج تصعيد", body, "critical",
      `/umrah/violations?status=detected`);
  });

  // 5. Manual violation created
  eventBus.on("umrah.violation.created", async (payload) => {
    await logEvent("umrah.violation.created", payload);
    await logAudit("umrah.violation.created", { ...payload, action: "create" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyManager(payload, "مخالفة جديدة",
      `تم تسجيل مخالفة (${d?.type ?? "أخرى"}) — مرجع ${d?.ref ?? ""}، غرامة ${d?.amount ?? 0} ر.س`,
      "normal", `/umrah/violations`);
  });

  // 6. Sub-agent linked to a client (or re-linked)
  eventBus.on("umrah.agent.linked", async (payload) => {
    await logEvent("umrah.agent.linked", payload);
    await logAudit("umrah.agent.linked", { ...payload, action: "link" });
    await notifyManager(payload, "ربط وكيل فرعي بعميل",
      `تم ربط وكيل فرعي بعميل — يمكن الآن إصدار فواتير المبيعات`,
      "normal", `/umrah/sub-agents`);
  });

  // 7. Commission calculated (per employee per month)
  eventBus.on("umrah.commission.calculated", async (payload) => {
    await logEvent("umrah.commission.calculated", payload);
    await logAudit("umrah.commission.calculated", { ...payload, action: "calculate" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyManager(payload, "تم حساب عمولة موظف",
      `الموظف #${d?.employeeId ?? "?"} — شهر ${d?.hijri?.month ?? "?"}/${d?.hijri?.year ?? "?"} — المبلغ النهائي ${d?.finalAmount ?? 0} ر.س`,
      "normal", `/umrah/commission-plans`);
  });
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
