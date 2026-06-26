/**
 * Wiring stubs — backend routes that frontend pages call but had no handler.
 * Identified by scripts/src/check-frontend-backend-wiring.mjs.
 *
 * Split into 5 domain sub-routers so each can be mounted behind its proper
 * `requireModule(...)` guard in routes/index.ts (warehouse / documents / hr /
 * finance / admin). Do NOT mount a single combined router at "/" — that would
 * bypass module-level RBAC.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { logger } from "../lib/logger.js";

interface AuthedReq {
  scope?: { companyId?: number | null; branchId?: number | null; userId?: number | null };
  user?: { companyId?: number | null; branchId?: number | null; id?: number | null };
}
class ScopeError extends Error { status = 403; }
function scope(req: AuthedReq): { companyId: number; branchId: number | null } {
  const cid = Number(req.scope?.companyId ?? req.user?.companyId);
  if (!cid || !Number.isFinite(cid)) {
    throw new ScopeError("companyId missing from session");
  }
  return { companyId: cid, branchId: (req.scope?.branchId ?? req.user?.branchId) ?? null };
}

export const warehouseStubsRouter = Router();
// documentsStubsRouter أُزيل: نقاط OCR الأربع صارت تنفيذًا حقيقيًا في routes/documents.ts (م٢-ج).
export const hrStubsRouter = Router();
export const financeStubsRouter = Router();
export const adminStubsRouter = Router();

/* ============================================================
 * Warehouse — cycle counts: REAL implementation lives in
 * routes/warehouse-cycle-counts.ts (mounted before this router).
 * Only plan GENERATION remains a stub here.
 * ============================================================ */
// 501 helper — every fake-success stub below returns the same shape so the
// SPA can pattern-match on it and render a "feature in development" banner
// instead of treating ok:true as a real success. The honest contract: this
// endpoint exists in the catalog so the front-end can call it, but the
// backend logic that would persist the action hasn't been written yet.
function notImplemented(res: Response, feature: string): void {
  res.status(501).json({
    error: "feature_not_implemented",
    feature,
    message:
      "هذه العملية قيد التطوير — الواجهة موجودة لكن المنطق المحاسبي/التنفيذي لم يُكتمل بعد. لا تعتمد عليها للعمليات الفعلية.",
  });
}



/* ============================================================
 * Documents — OCR: نُقِلت الأربع نقاط (extractions/confirm/reject/rerun) إلى
 * routes/documents.ts بتنفيذ حقيقي (خدمة documentOcrService + تأكيد بشري + Audit).
 * أُزيلت الـstubs هنا تفاديًا لتعارض المسارات تحت /documents (م٢-ج).
 * ============================================================ */

/* ============================================================
 * HR Saudi compliance — banks / WPS / Mudad / credentials (7).
 * Mounted under /hr.
 * ============================================================ */
hrStubsRouter.get("/saudi/banks", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "list" }), async (_req, res) => {
  res.json({
    data: [
      { code: "RJHI", name: "مصرف الراجحي", swift: "RJHISARI" },
      { code: "NCB", name: "البنك الأهلي", swift: "NCBKSAJE" },
      { code: "SAMBA", name: "سامبا", swift: "SAMBSARI" },
      { code: "RIBL", name: "بنك الرياض", swift: "RIBLSARI" },
      { code: "BSF", name: "البنك السعودي الفرنسي", swift: "BSFRSARI" },
      { code: "ALBI", name: "بنك البلاد", swift: "ALBISARI" },
      { code: "SIBC", name: "البنك السعودي للاستثمار", swift: "SIBCSARI" },
      { code: "ARNB", name: "البنك العربي الوطني", swift: "ARNBSARI" },
    ],
  });
});
hrStubsRouter.get("/saudi/wps/runs", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "list" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const period = (req.query.period as string) || null;
    const params: unknown[] = [companyId];
    let sql = `SELECT id, period, status, "totalNet", reference, notes, "createdAt"
               FROM payroll_runs WHERE "companyId"=$1 AND "deletedAt" IS NULL`;
    if (period) { sql += ` AND period=$2`; params.push(period); }
    sql += ` ORDER BY id DESC LIMIT 50`;
    const data = await rawQuery(sql, params).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
hrStubsRouter.get("/saudi/wps/runs/:id", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "view" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const id = Number(req.params.id);
    const rows = await rawQuery(
      `SELECT * FROM payroll_runs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, companyId]
    ).catch(() => []);
    if (!rows.length) { res.status(404).json({ message: "غير موجود" }); return; }
    const lines = await rawQuery(
      `SELECT pl.*, e.name as "employeeName", e."empNumber"
       FROM payroll_lines pl
       LEFT JOIN employees e ON e.id = pl."employeeId" AND e."deletedAt" IS NULL
       WHERE pl."runId"=$1 AND e."companyId"=$2 AND pl."deletedAt" IS NULL`,
      [id, companyId]
    ).catch(() => []);
    res.json({ ...rows[0], lines });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
hrStubsRouter.get("/saudi/mudad/settlements", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "list" }), async (req, res) => {
  const period = (req.query.period as string) || null;
  res.json({ data: [], period, note: "Mudad integration not configured" });
});
hrStubsRouter.get("/saudi/wps/credentials", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "list" }), async (_req, res) => {
  // Collection view for the WPS bank-credentials settings page. WPS direct
  // delivery is not configured yet, so no banks are returned; the page renders
  // its empty-state. Shape matches the page's CredentialsResponse contract.
  res.json({ data: [], fieldSpecs: {} });
});
hrStubsRouter.get("/saudi/wps/credentials/:bankCode", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "view" }), async (req, res) => {
  res.json({
    bankCode: req.params.bankCode,
    configured: false,
    lastTestedAt: null,
    message: "لم يتم تكوين بيانات WPS لهذا البنك بعد",
  });
});
hrStubsRouter.put("/saudi/wps/credentials/:bankCode", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "update" }), async (_req, res) => {
  notImplemented(res, "hr.wps.credentials.save");
});
hrStubsRouter.delete("/saudi/wps/credentials/:bankCode", requireMinLevel(10), authorize({ feature: "hr.payroll.wps", action: "update" }), async (_req, res) => {
  notImplemented(res, "hr.wps.credentials.clear");
});

/* ============================================================
 * Finance — ZATCA (4). Mounted under /finance.
 *
 * Pricing rules (6) graduated out of stubs — the real CRUD + engine
 * preview now lives in routes/finance-pricing.ts (pricingRouter, mounted
 * BEFORE financeStubsRouter in routes/index.ts).
 * ============================================================ */
financeStubsRouter.get("/zatca/missing-tax-numbers", requireMinLevel(10), authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    // A "B2C candidate" is the exact class the spike-pause gate
    // (checkB2cSpike in lib/zatca/worker.ts) watches: a tax-linked,
    // unreported invoice (zatcaStatus IS NULL && zatcaReportedAt IS NULL)
    // belonging to a client whose taxNumber is missing/short — i.e. an
    // invoice that would ship through the wrong (Simplified/B2C) UBL
    // endpoint. We surface one row per offending client so finance can
    // backfill the tax number and unblock the drain.
    //   - todayCount  = candidates created today (worst-offender signal)
    //   - pendingCount = all outstanding candidates for the client
    //   - lastInvoiceAt = most recent candidate invoice
    const data = await rawQuery(
      `SELECT c.id AS "clientId", c.name AS "clientName",
              c.email, c.phone,
              COUNT(*) FILTER (WHERE i."createdAt" >= date_trunc('day', NOW()))::int AS "todayCount",
              COUNT(*)::int AS "pendingCount",
              MAX(i."createdAt") AS "lastInvoiceAt"
       FROM clients c
       JOIN invoices i ON i."clientId" = c.id AND i."deletedAt" IS NULL
       WHERE c."companyId" = $1 AND c."deletedAt" IS NULL
         AND (c."taxNumber" IS NULL OR c."taxNumber" = '' OR LENGTH(c."taxNumber") < 15)
         AND i."isTaxLinked" = TRUE
         AND i."zatcaStatus" IS NULL
         AND i."zatcaReportedAt" IS NULL
       GROUP BY c.id, c.name, c.email, c.phone
       ORDER BY "todayCount" DESC, c.id ASC
       LIMIT 200`,
      [companyId]
    ).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
financeStubsRouter.patch("/zatca/missing-tax-numbers/:id", requireMinLevel(10), authorize({ feature: "finance.zatca", action: "update" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const id = Number(req.params.id);
    const taxNumber = String(req.body?.taxNumber || "");
    if (!/^3\d{14}$/.test(taxNumber)) {
      res.status(400).json({ message: "رقم ضريبي غير صالح — يجب أن يكون 15 رقماً ويبدأ بـ 3" });
      return;
    }
    await rawQuery(
      `UPDATE clients SET "taxNumber"=$3 WHERE id=$1 AND "companyId"=$2`,
      [id, companyId, taxNumber]
    );
    res.json({ id, taxNumber, ok: true });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
financeStubsRouter.get("/zatca/pause-history", requireMinLevel(10), authorize({ feature: "finance.zatca", action: "update" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    // One row per (company, calendar day) the B2C spike gate paused the
    // drain (see migration 178_zatca_b2c_pause_events). Snapshot fields
    // are refreshed on every tick, so this is the live evidence finance
    // uses to tune ZATCA_B2C_SPIKE_MULTIPLIER / ZATCA_B2C_SPIKE_MIN_ABS.
    const data = await rawQuery(
      `SELECT id, "pauseDate", "createdAt", "todayCount", "baseline",
              "multiplier", "minAbs", "topClientId", "topClientName",
              "topClientCount", "reason"
       FROM zatca_b2c_pause_events
       WHERE "companyId" = $1
       ORDER BY "pauseDate" DESC, id DESC
       LIMIT 100`,
      [companyId]
    ).catch(() => []);
    // "invoices prevented" == the day's candidate count (one paused day
    // == one saved batch from the wrong UBL endpoint).
    const kpiRows = await rawQuery(
      `SELECT
         COUNT(*) FILTER (WHERE "pauseDate" >= CURRENT_DATE - INTERVAL '7 days')::int  AS "pauses7d",
         COUNT(*) FILTER (WHERE "pauseDate" >= CURRENT_DATE - INTERVAL '30 days')::int AS "pauses30d",
         COALESCE(SUM("todayCount") FILTER (WHERE "pauseDate" >= CURRENT_DATE - INTERVAL '7 days'), 0)::int  AS "invoicesPrevented7d",
         COALESCE(SUM("todayCount") FILTER (WHERE "pauseDate" >= CURRENT_DATE - INTERVAL '30 days'), 0)::int AS "invoicesPrevented30d"
       FROM zatca_b2c_pause_events
       WHERE "companyId" = $1`,
      [companyId]
    ).catch(() => []);
    const kpi = kpiRows[0] ?? {
      pauses7d: 0,
      pauses30d: 0,
      invoicesPrevented7d: 0,
      invoicesPrevented30d: 0,
    };
    res.json({ data, total: data.length, kpi });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
financeStubsRouter.get("/zatca/misrouted-b2c-invoices", requireMinLevel(10), authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const data = await rawQuery(
      `SELECT i.id, i.ref, i.total, i."createdAt", i."clientId", c.name as "clientName",
              c."taxNumber"
       FROM invoices i
       JOIN clients c ON c.id=i."clientId" AND c."deletedAt" IS NULL
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL
         AND i."invoiceTypeCode"='388'
         AND (c."taxNumber" IS NULL OR LENGTH(c."taxNumber") < 15)
       ORDER BY i.id DESC LIMIT 100`,
      [companyId]
    ).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});

/* ============================================================
 * Admin — api-health widget (1). Mounted under /admin.
 * ============================================================ */
adminStubsRouter.get("/api-health", async (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: { database: "ok", api: "ok", storage: "ok" },
    note: "stub widget — replace with real health aggregator",
  });
});

/* Scope-error → 403 (instead of 500). */
export const wiringScopeErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (err instanceof ScopeError) {
    res.status(403).json({ message: err.message });
    return;
  }
  next(err);
};

logger.info("wiring-stubs sub-routers registered (warehouse/documents/hr/finance/admin)");

export default warehouseStubsRouter; // legacy
