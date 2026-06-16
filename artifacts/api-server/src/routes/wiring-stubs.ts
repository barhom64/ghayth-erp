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
export const documentsStubsRouter = Router();
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
 * Documents — OCR (4). Mounted under /documents.
 * ============================================================ */
documentsStubsRouter.get("/ocr/extractions", requireMinLevel(10), authorize({ feature: "documents.my", action: "list" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const status = (req.query.status as string) || null;
    const params: unknown[] = [companyId];
    let sql = `SELECT * FROM document_ocr_extractions WHERE "companyId"=$1`;
    if (status) { sql += ` AND status=$2`; params.push(status); }
    sql += ` ORDER BY id DESC LIMIT 100`;
    const data = await rawQuery(sql, params).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
documentsStubsRouter.post("/ocr/extractions/:id/confirm", requireMinLevel(10), authorize({ feature: "documents.my", action: "update" }), async (_req, res) => {
  notImplemented(res, "documents.ocr.confirm");
});
documentsStubsRouter.post("/ocr/extractions/:id/reject", requireMinLevel(10), authorize({ feature: "documents.my", action: "update" }), async (_req, res) => {
  notImplemented(res, "documents.ocr.reject");
});
documentsStubsRouter.post("/:id/ocr/rerun", requireMinLevel(10), authorize({ feature: "documents.my", action: "update" }), async (_req, res) => {
  notImplemented(res, "documents.ocr.rerun");
});

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
 * Finance — pricing rules (6) + ZATCA (4). Mounted under /finance.
 * ============================================================ */
financeStubsRouter.get("/pricing/rules", requireMinLevel(10), authorize({ feature: "finance.invoices", action: "list" }), async (_req, res) => {
  res.json({ data: [], total: 0 });
});
financeStubsRouter.post("/pricing/rules", requireMinLevel(10), authorize({ feature: "finance.invoices", action: "create" }), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.create");
});
financeStubsRouter.get("/pricing/rules/:id", requireMinLevel(10), authorize({ feature: "finance.invoices", action: "view" }), async (req, res) => {
  // Read-only stub — returning an empty rule lets a detail page render
  // without crashing, but the user sees "active: false" so they know it
  // isn't doing anything.
  res.json({ id: Number(req.params.id), name: "", active: false, conditions: [] });
});
financeStubsRouter.put("/pricing/rules/:id", requireMinLevel(10), authorize({ feature: "finance.invoices", action: "update" }), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.update");
});
financeStubsRouter.delete("/pricing/rules/:id", requireMinLevel(10), authorize({ feature: "finance.invoices", action: "delete" }), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.delete");
});
financeStubsRouter.post("/pricing/resolve", requireMinLevel(10), authorize({ feature: "finance.invoices", action: "view" }), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.resolve");
});

financeStubsRouter.get("/zatca/missing-tax-numbers", requireMinLevel(10), authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const data = await rawQuery(
      `SELECT c.id as "clientId", c.code, c.name, c.phone, c.email,
              COUNT(i.id) as "invoiceCount", COALESCE(SUM(i.total),0) as "totalAmount"
       FROM clients c
       LEFT JOIN invoices i ON i."clientId"=c.id AND i."deletedAt" IS NULL
       WHERE c."companyId"=$1 AND c."deletedAt" IS NULL
         AND (c."taxNumber" IS NULL OR c."taxNumber"='' OR LENGTH(c."taxNumber") < 15)
       GROUP BY c.id ORDER BY "invoiceCount" DESC LIMIT 100`,
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
financeStubsRouter.get("/zatca/pause-history", requireMinLevel(10), authorize({ feature: "finance.zatca", action: "list" }), async (_req, res) => {
  res.json({ data: [], total: 0 });
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
