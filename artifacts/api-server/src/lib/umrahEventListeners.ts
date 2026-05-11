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

  // 6b. Sales invoice generated via /umrah/invoices/generate
  eventBus.on("umrah.sales_invoice.generated", async (payload) => {
    await logEvent("umrah.sales_invoice.generated", payload);
    await logAudit("umrah.sales_invoice.generated", { ...payload, action: "create" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyManager(payload, "صدرت فاتورة عمرة",
      `فاتورة ${d?.ref ?? ""} — إجمالي ${d?.total ?? 0} ر.س (${d?.groupCount ?? 0} مجموعة)`,
      "normal", `/finance/invoices`);
    await notifyCfo(payload, "فاتورة عمرة جديدة",
      `فاتورة ${d?.ref ?? ""} — تحتاج متابعة التحصيل`,
      "normal", `/finance/invoices`);
  });

  // 6c. NUSK purchase invoice posted into the GL (from voucher import)
  eventBus.on("umrah.nusk_invoice.created", async (payload) => {
    await logEvent("umrah.nusk_invoice.created", payload);
    await logAudit("umrah.nusk_invoice.created", { ...payload, action: "create" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyCfo(payload, "فاتورة شراء نسك جديدة",
      `فاتورة ${d?.nuskInvoiceNumber ?? ""} — تكلفة ${d?.netCost ?? 0} ر.س`,
      "normal", `/umrah/nusk-invoices`);
  });

  // 6d. Letter generated (official_letters draft)
  eventBus.on("umrah.letter.generated", async (payload) => {
    await logEvent("umrah.letter.generated", payload);
    await logAudit("umrah.letter.generated", { ...payload, action: "create" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyManager(payload, "تم إنشاء خطاب رسمي",
      `نوع: ${d?.type ?? "general"} — يحتاج مراجعة واعتماد`,
      "normal", `/umrah/letters/${payload.entityId}`);
  });

  // 6. Sub-agent linked to a client (or re-linked)
  eventBus.on("umrah.agent.linked", async (payload) => {
    await logEvent("umrah.agent.linked", payload);
    await logAudit("umrah.agent.linked", { ...payload, action: "link" });
    await notifyManager(payload, "ربط وكيل فرعي بعميل",
      `تم ربط وكيل فرعي بعميل — يمكن الآن إصدار فواتير المبيعات`,
      "normal", `/umrah/sub-agents`);
  });

  // 7. Commission calculated (per employee per month) — links to HR
  //    payroll_lines via the existing payroll engine. The listener:
  //      * finds the matching payroll_run (same year + month + company)
  //      * inserts a payroll_lines row (or updates if one already exists)
  //        with the commission as `overtime` (the only allowance bucket
  //        already in the runtime schema that finance treats as a positive
  //        adjustment to net salary)
  //      * back-links the payrollLineId onto the calculation row
  eventBus.on("umrah.commission.calculated", async (payload) => {
    await logEvent("umrah.commission.calculated", payload);
    await logAudit("umrah.commission.calculated", { ...payload, action: "calculate" });
    const d = typeof payload.details === "string" ? safeParse(payload.details) : (payload.details as any);
    await notifyManager(payload, "تم حساب عمولة موظف",
      `الموظف #${d?.employeeId ?? "?"} — شهر ${d?.hijri?.month ?? "?"}/${d?.hijri?.year ?? "?"} — المبلغ النهائي ${d?.finalAmount ?? 0} ر.س`,
      "normal", `/umrah/commission-plans`);

    // Skip payroll write when amount is 0 (excluded months / failed
    // conditions) — but still keep the audit/notification rows above.
    if (!d || !Number.isFinite(d.finalAmount) || d.finalAmount <= 0) return;

    try {
      const companyId = payload.companyId as number;
      const calcId = payload.entityId as number;
      const employeeId = d.employeeId as number;
      const finalAmount = Number(d.finalAmount);
      const hijriMonth = d.hijri?.month;
      const hijriYear = d.hijri?.year;

      // 1. Resolve the employee's active assignment.
      const a = await pool.query(
        `SELECT id, "branchId" FROM employee_assignments
          WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active'
          ORDER BY "isPrimary" DESC, id DESC LIMIT 1`,
        [employeeId, companyId]
      );
      if (a.rowCount === 0) {
        console.warn(`[UmrahPayroll] no active assignment for employee ${employeeId} — skipping payroll write`);
        return;
      }
      const assignmentId = a.rows[0].id as number;

      // 2. Locate the payroll_run that owns this period (same Hijri
      //    month/year on the run header). If no run yet → no write;
      //    when HR generates the run it'll pick up the commission via
      //    a follow-up sweep (cron C32 + manual recalculate also re-emit
      //    the event so the listener re-fires).
      const r = await pool.query(
        `SELECT id FROM payroll_runs
          WHERE "companyId"=$1 AND month=$2 AND year=$3
            AND status NOT IN ('cancelled','rejected')
          ORDER BY id DESC LIMIT 1`,
        [companyId, hijriMonth, hijriYear]
      );
      if (r.rowCount === 0) return;
      const runId = r.rows[0].id as number;

      // 3. UPSERT the payroll line — keyed on (runId, assignmentId).
      const existing = await pool.query(
        `SELECT id, overtime, "grossSalary", "netSalary"
           FROM payroll_lines
          WHERE "runId"=$1 AND "assignmentId"=$2`,
        [runId, assignmentId]
      );
      let payrollLineId: number;
      if ((existing.rowCount ?? 0) > 0) {
        const row = existing.rows[0];
        const newOvertime = Number(row.overtime ?? 0) + finalAmount;
        const newGross = Number(row.grossSalary ?? 0) + finalAmount;
        const newNet = Number(row.netSalary ?? 0) + finalAmount;
        await pool.query(
          `UPDATE payroll_lines
              SET overtime=$1, "grossSalary"=$2, "netSalary"=$3
            WHERE id=$4`,
          [newOvertime, newGross, newNet, row.id]
        );
        payrollLineId = row.id as number;
      } else {
        const ins = await pool.query(
          `INSERT INTO payroll_lines
             ("runId","assignmentId","employeeId",
              basic, overtime, "grossSalary", "netSalary",
              gosi, "gosiEmployer", "lateDeduction", "absenceDeduction",
              "violationDeduction", "loanDeduction", "overtimeHours")
           VALUES ($1,$2,$3, 0,$4,$4,$4, 0,0,0,0,0,0,0) RETURNING id`,
          [runId, assignmentId, employeeId, finalAmount]
        );
        payrollLineId = ins.rows[0].id as number;
      }

      // 4. Back-link onto the calculation row.
      await pool.query(
        `UPDATE employee_commission_calculations
            SET "payrollLineId"=$1, "updatedAt"=NOW()
          WHERE id=$2`,
        [payrollLineId, calcId]
      );
    } catch (err) {
      console.error("[UmrahPayroll] payroll line write failed:", err);
    }
  });
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
