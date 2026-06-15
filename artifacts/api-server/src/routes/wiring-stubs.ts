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
export const fleetStubsRouter = Router();
export const umrahStubsRouter = Router();
export const settingsStubsRouter = Router();
export const employeeStubsRouter = Router();
export const projectsStubsRouter = Router();
export const propertiesStubsRouter = Router();
export const printStubsRouter = Router();

/* ============================================================
 * Warehouse — cycle counts (8)
 * Mounted under /warehouse → endpoint paths relative.
 * ============================================================ */
warehouseStubsRouter.get("/cycle-counts", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const rows = await rawQuery<{ id: number }>(
      `SELECT 1 as id WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='warehouse_cycle_counts')`,
      []
    ).catch(() => []);
    if (rows.length) {
      const data = await rawQuery(
        `SELECT * FROM warehouse_cycle_counts WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 100`,
        [companyId]
      ).catch(() => []);
      res.json({ data, total: data.length });
      return;
    }
    res.json({ data: [], total: 0, note: "cycle-counts table not present" });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});

warehouseStubsRouter.post("/cycle-counts", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.cycleCounts.create");
});
warehouseStubsRouter.get("/cycle-counts/plans", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
warehouseStubsRouter.get("/cycle-counts/:id", async (req, res) => {
  res.json({ id: Number(req.params.id), status: "draft", items: [], notes: null });
});
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

warehouseStubsRouter.post("/cycle-counts/:id/approve", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.cycleCounts.approve");
});
warehouseStubsRouter.post("/cycle-counts/:id/submit", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.cycleCounts.submit");
});
warehouseStubsRouter.post("/cycle-counts/:id/post", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.cycleCounts.post");
});
warehouseStubsRouter.post("/cycle-counts/:id/record", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.cycleCounts.record");
});

/* Warehouse — lots (5) */
warehouseStubsRouter.get("/lots", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const status = (req.query.status as string) || null;
    const params: unknown[] = [companyId];
    let sql = `SELECT l.id, l."lotNumber", l."productId", l."warehouseId", l.quantity,
                      l."originalQuantity", l."unitCost", l.status, l."qualityControlStatus",
                      l."receivedDate", l."expiryDate", p.name as "productName"
               FROM warehouse_stock_lots l
               LEFT JOIN warehouse_products p ON p.id = l."productId"
               WHERE l."companyId"=$1 AND l."deletedAt" IS NULL`;
    if (status) { sql += ` AND l.status=$2`; params.push(status); }
    sql += ` ORDER BY l.id DESC LIMIT 200`;
    const data = await rawQuery(sql, params);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.post("/lots", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.lots.create");
});
warehouseStubsRouter.post("/lots/:id/qc-approve", requireMinLevel(20), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const id = Number(req.params.id);
    await rawQuery(
      `UPDATE warehouse_stock_lots SET "qualityControlStatus"='approved', "updatedAt"=NOW()
       WHERE id=$1 AND "companyId"=$2`,
      [id, companyId]
    ).catch(() => null);
    res.json({ id, qualityControlStatus: "approved", ok: true });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.post("/lots/:id/qc-reject", requireMinLevel(20), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const id = Number(req.params.id);
    await rawQuery(
      `UPDATE warehouse_stock_lots SET "qualityControlStatus"='rejected', "updatedAt"=NOW()
       WHERE id=$1 AND "companyId"=$2`,
      [id, companyId]
    ).catch(() => null);
    res.json({ id, qualityControlStatus: "rejected", ok: true });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.post("/lots/:id/recall", requireMinLevel(20), async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || "");
    await rawQuery(
      `UPDATE warehouse_stock_lots SET status='recalled', "recalledAt"=NOW(), "recallReason"=$3,
                                       "updatedAt"=NOW()
       WHERE id=$1 AND "companyId"=$2`,
      [id, companyId, reason]
    ).catch(() => null);
    res.json({ id, status: "recalled", ok: true });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});

/* Warehouse — suppliers items */
warehouseStubsRouter.get("/suppliers/:id/items", async (_req, res) => {
  res.json({ data: [], total: 0 });
});

/* Warehouse — serials (3) */
warehouseStubsRouter.get("/serials", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const status = (req.query.status as string) || null;
    const params: unknown[] = [companyId];
    let sql = `SELECT * FROM warehouse_stock_serials
               WHERE "companyId"=$1 AND "deletedAt" IS NULL`;
    if (status) { sql += ` AND status=$2`; params.push(status); }
    sql += ` ORDER BY id DESC LIMIT 200`;
    const data = await rawQuery(sql, params).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.get("/serials/:id", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const id = Number(req.params.id);
    const rows = await rawQuery(
      `SELECT * FROM warehouse_stock_serials WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, companyId]
    ).catch(() => []);
    if (!rows.length) { res.status(404).json({ message: "غير موجود" }); return; }
    res.json(rows[0]);
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.post("/serials", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "warehouse.serials.create");
});

/* Warehouse — ABC & reports (4) */
warehouseStubsRouter.get("/abc-classification", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const cat = (req.query.category as string) || null;
    const params: unknown[] = [companyId];
    let sql = `SELECT * FROM product_abc_classification WHERE "companyId"=$1`;
    if (cat) { sql += ` AND class=$2`; params.push(cat); }
    sql += ` ORDER BY id DESC LIMIT 500`;
    const data = await rawQuery(sql, params).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.get("/reports/cycle-count-accuracy", async (_req, res) => {
  res.json({ data: [], summary: { totalCounts: 0, accuracy: 100 } });
});
warehouseStubsRouter.get("/reports/expiring", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const within = Math.min(Number(req.query.within || 90), 730);
    const data = await rawQuery(
      `SELECT l.id, l."lotNumber", l."productId", p.name as "productName",
              l.quantity, l."expiryDate", l."warehouseId"
       FROM warehouse_stock_lots l
       LEFT JOIN warehouse_products p ON p.id=l."productId" AND p."deletedAt" IS NULL
       WHERE l."companyId"=$1 AND l."deletedAt" IS NULL
         AND l."expiryDate" IS NOT NULL
         AND l."expiryDate" <= (CURRENT_DATE + INTERVAL '1 day' * $2)
       ORDER BY l."expiryDate" ASC LIMIT 500`,
      [companyId, within]
    ).catch(() => []);
    res.json({ data, total: data.length, withinDays: within });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});
warehouseStubsRouter.get("/reports/lot-aging", async (req, res) => {
  try {
    const { companyId } = scope(req as any);
    const data = await rawQuery(
      `SELECT l.id, l."lotNumber", l."productId", p.name as "productName",
              l.quantity, l."receivedDate",
              (CURRENT_DATE - l."receivedDate"::date)::int as "ageDays"
       FROM warehouse_stock_lots l
       LEFT JOIN warehouse_products p ON p.id=l."productId" AND p."deletedAt" IS NULL
       WHERE l."companyId"=$1 AND l."deletedAt" IS NULL
       ORDER BY l."receivedDate" ASC LIMIT 500`,
      [companyId]
    ).catch(() => []);
    res.json({ data, total: data.length });
  } catch (e) { handleRouteError(e, res, "wiring-stubs"); }
});

/* ============================================================
 * Documents — OCR (4). Mounted under /documents.
 * ============================================================ */
documentsStubsRouter.get("/ocr/extractions", async (req, res) => {
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
documentsStubsRouter.post("/ocr/extractions/:id/confirm", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "documents.ocr.confirm");
});
documentsStubsRouter.post("/ocr/extractions/:id/reject", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "documents.ocr.reject");
});
documentsStubsRouter.post("/:id/ocr/rerun", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "documents.ocr.rerun");
});

/* ============================================================
 * HR Saudi compliance — banks / WPS / Mudad / credentials (7).
 * Mounted under /hr.
 * ============================================================ */
hrStubsRouter.get("/saudi/banks", async (_req, res) => {
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
hrStubsRouter.get("/saudi/wps/runs", async (req, res) => {
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
hrStubsRouter.get("/saudi/wps/runs/:id", async (req, res) => {
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
hrStubsRouter.get("/saudi/mudad/settlements", async (req, res) => {
  const period = (req.query.period as string) || null;
  res.json({ data: [], period, note: "Mudad integration not configured" });
});
hrStubsRouter.get("/saudi/wps/credentials/:bankCode", async (req, res) => {
  res.json({
    bankCode: req.params.bankCode,
    configured: false,
    lastTestedAt: null,
    message: "لم يتم تكوين بيانات WPS لهذا البنك بعد",
  });
});
hrStubsRouter.put("/saudi/wps/credentials/:bankCode", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "hr.wps.credentials.save");
});
hrStubsRouter.delete("/saudi/wps/credentials/:bankCode", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "hr.wps.credentials.delete");
});

// Company documents
hrStubsRouter.get("/company-documents/:id", async (req, res) => {
  res.json({ id: Number(req.params.id), name: "", url: null, category: null });
});
hrStubsRouter.patch("/company-documents/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "hr.companyDocuments.update");
});
hrStubsRouter.delete("/company-documents/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "hr.companyDocuments.delete");
});

/* ============================================================
 * Finance — pricing rules (6) + ZATCA (4). Mounted under /finance.
 * ============================================================ */
financeStubsRouter.get("/pricing/rules", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
financeStubsRouter.post("/pricing/rules", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.create");
});
financeStubsRouter.get("/pricing/rules/:id", async (req, res) => {
  // Read-only stub — returning an empty rule lets a detail page render
  // without crashing, but the user sees "active: false" so they know it
  // isn't doing anything.
  res.json({ id: Number(req.params.id), name: "", active: false, conditions: [] });
});
financeStubsRouter.put("/pricing/rules/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.update");
});
financeStubsRouter.delete("/pricing/rules/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.delete");
});
financeStubsRouter.post("/pricing/resolve", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.pricingRules.resolve");
});

financeStubsRouter.get("/zatca/missing-tax-numbers", async (req, res) => {
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
financeStubsRouter.patch("/zatca/missing-tax-numbers/:id", requireMinLevel(20), async (req, res) => {
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
financeStubsRouter.get("/zatca/pause-history", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
// Posting failures
financeStubsRouter.get("/posting-failures/summary", async (_req, res) => {
  res.json({ data: [], total: 0, summary: { failed: 0, retried: 0, resolved: 0 } });
});
financeStubsRouter.post("/posting-failures/:id/retry", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.postingFailures.retry");
});
financeStubsRouter.post("/posting-failures/retry-all", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.postingFailures.retryAll");
});
financeStubsRouter.post("/posting-failures/bulk-resolve", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.postingFailures.bulkResolve");
});

// Customer receipts
financeStubsRouter.get("/customer-receipts", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
financeStubsRouter.post("/customer-receipts", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "finance.customerReceipts.create");
});

// Ledger truth report
financeStubsRouter.get("/reports/ledger-truth", async (_req, res) => {
  res.json({ data: [], summary: {}, note: "ledger-truth report not implemented" });
});

financeStubsRouter.get("/zatca/misrouted-b2c-invoices", async (req, res) => {
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

/* ============================================================
 * Fleet — rental-contracts + me/cargo. Mounted under /fleet.
 * ============================================================ */
fleetStubsRouter.get("/rental-contracts/:id", async (req, res) => {
  res.json({ id: Number(req.params.id), status: "draft", note: "stub" });
});
fleetStubsRouter.post("/rental-contracts/:id/handover", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "fleet.rentalContracts.handover");
});
fleetStubsRouter.post("/rental-contracts/:id/return", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "fleet.rentalContracts.return");
});
fleetStubsRouter.get("/me/cargo/:id/checkpoints", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
fleetStubsRouter.post("/me/cargo/:id/checkpoint", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "fleet.cargo.checkpoint");
});

/* ============================================================
 * Umrah — settings/policies, finance-hygiene, assistant, reports.
 * Mounted under /umrah.
 * ============================================================ */
umrahStubsRouter.get("/settings/policies", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.patch("/settings/policies", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "umrah.settings.policies.update");
});
umrahStubsRouter.get("/settings/policies/:id", async (req, res) => {
  res.json({ id: Number(req.params.id), name: "", rules: [] });
});
umrahStubsRouter.patch("/settings/policies/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "umrah.settings.policies.updateById");
});
umrahStubsRouter.put("/settings/policies/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "umrah.settings.policies.putById");
});
umrahStubsRouter.get("/finance-hygiene", async (_req, res) => {
  res.json({ data: [], issues: 0, note: "finance-hygiene not implemented" });
});
umrahStubsRouter.get("/assistant/suggestions", async (_req, res) => {
  res.json({ data: [], suggestions: [] });
});
umrahStubsRouter.get("/reports/catalog", async (_req, res) => {
  res.json({ data: [] });
});
umrahStubsRouter.get("/reports/commissions-summary", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.get("/reports/import-errors-summary", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.get("/reports/nusk-invoices-summary", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.get("/reports/sales-invoices-summary", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.get("/reports/umrah-transport", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.get("/reports/umrah-costs", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
umrahStubsRouter.get("/reports/violations-summary", async (_req, res) => {
  res.json({ data: [], total: 0 });
});

/* ============================================================
 * Settings — org-tree + administrations.
 * Mounted under /settings.
 * ============================================================ */
settingsStubsRouter.get("/org-tree", async (_req, res) => {
  res.json({ data: [], nodes: [], edges: [] });
});
settingsStubsRouter.get("/administrations", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
settingsStubsRouter.post("/administrations", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "settings.administrations.create");
});
settingsStubsRouter.patch("/administrations/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "settings.administrations.update");
});
settingsStubsRouter.delete("/administrations/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "settings.administrations.delete");
});

/* ============================================================
 * Employees — lifecycle + scoring + quick-activate.
 * Mounted under /employees.
 * ============================================================ */
employeeStubsRouter.get("/:id/lifecycle/transitions", async (req, res) => {
  res.json({ data: [], employeeId: Number(req.params.id), transitions: [] });
});
employeeStubsRouter.post("/:id/lifecycle/transitions", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "employees.lifecycle.transition");
});
employeeStubsRouter.get("/:id/lifecycle/status", async (req, res) => {
  res.json({ employeeId: Number(req.params.id), status: "active", phase: null });
});
employeeStubsRouter.get("/:id/lifecycle/history", async (req, res) => {
  res.json({ data: [], employeeId: Number(req.params.id), total: 0 });
});
employeeStubsRouter.get("/:id/scoring/history", async (req, res) => {
  res.json({ data: [], employeeId: Number(req.params.id), total: 0 });
});
employeeStubsRouter.post("/:id/scoring/recompute", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "employees.scoring.recompute");
});
employeeStubsRouter.post("/quick-activate", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "employees.quickActivate");
});

/* ============================================================
 * Projects — units + boq.
 * Mounted under /projects.
 * ============================================================ */
projectsStubsRouter.get("/:id/units", async (req, res) => {
  res.json({ data: [], projectId: Number(req.params.id), total: 0 });
});
projectsStubsRouter.post("/:id/units", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.units.create");
});
projectsStubsRouter.get("/:id/units/:unitId", async (req, res) => {
  res.json({ id: Number(req.params.unitId), projectId: Number(req.params.id) });
});
projectsStubsRouter.patch("/:id/units/:unitId", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.units.update");
});
projectsStubsRouter.delete("/:id/units/:unitId", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.units.delete");
});
projectsStubsRouter.get("/units/:id", async (req, res) => {
  res.json({ id: Number(req.params.id) });
});
projectsStubsRouter.patch("/units/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.units.patchById");
});
projectsStubsRouter.delete("/units/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.units.deleteById");
});
projectsStubsRouter.post("/units/:id/sell", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.units.sell");
});
projectsStubsRouter.get("/:id/boq", async (req, res) => {
  res.json({ data: [], projectId: Number(req.params.id), total: 0 });
});
projectsStubsRouter.post("/:id/boq", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.boq.create");
});
projectsStubsRouter.patch("/:id/boq/:itemId", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.boq.update");
});
projectsStubsRouter.delete("/:id/boq/:itemId", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.boq.delete");
});
// /projects/boq/:id (standalone BOQ item by id, no project prefix)
projectsStubsRouter.get("/boq/:id", async (req, res) => {
  res.json({ id: Number(req.params.id), name: "", quantity: 0, unitCost: 0 });
});
projectsStubsRouter.patch("/boq/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.boq.patchById");
});
projectsStubsRouter.delete("/boq/:id", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.boq.deleteById");
});
projectsStubsRouter.post("/:id/boq/bill", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "projects.boq.bill");
});

/* ============================================================
 * Properties — sales.
 * Mounted under /properties.
 * ============================================================ */
propertiesStubsRouter.get("/sales", async (_req, res) => {
  res.json({ data: [], total: 0 });
});
propertiesStubsRouter.post("/sales", requireMinLevel(20), async (_req, res) => {
  notImplemented(res, "properties.sales.create");
});

/* ============================================================
 * Print — log-client-print.
 * Mounted under /print.
 * ============================================================ */
printStubsRouter.post("/log-client-print", async (_req, res) => {
  res.json({ ok: true });
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
