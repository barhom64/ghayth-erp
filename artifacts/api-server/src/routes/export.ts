/**
 * /export/* — every legacy batch endpoint now proxies to Print Engine v2.
 *
 * The bespoke generators that used to live alongside this router (one
 * file per output format) have been deleted; their SQL now lives in
 * lib/print/reportLoaders.ts and is consumed via the regular renderPrint()
 * pipeline. That means each /export/excel/* and /export/pdf/* call now:
 *   • picks the branch's cliché (logo / header / footer / tax number),
 *   • writes a print_jobs row (visible in /reports/print-log),
 *   • is gated by the same RBAC as v2 entities,
 *   • produces the same artifact whether triggered from the UI or a cron.
 *
 * No legacy code path remains.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireModule } from "../middlewares/roleGuard.js";
import { handleRouteError, parseId } from "../lib/errorHandler.js";
import { authorize } from "../lib/rbac/authorize.js";
import { renderPrint } from "../lib/print/printService.js";
import type { PrintFormat } from "../lib/print/types.js";

export const exportRouter = Router();
exportRouter.use(authMiddleware);

const financeGuard = requireModule("finance");
const hrGuard = requireModule("hr");
const fleetGuard = requireModule("fleet");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the synthetic entityId the report loaders parse:
 *  range params → "YYYY-MM-DD..YYYY-MM-DD", monthly period → "YYYY-MM". */
function synthEntityId(req: Request): string {
  const q = req.query as Record<string, string | undefined>;
  if (q.period) return q.period;
  if (q.startDate || q.endDate) return `${q.startDate ?? ""}..${q.endDate ?? ""}`;
  return "all";
}

async function proxyReport(
  req: Request,
  res: Response,
  entityType: string,
  format: PrintFormat,
  filename: string,
) {
  try {
    const scope = req.scope!;
    const result = await renderPrint(
      {
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        userId: scope.userId,
        role: scope.role,
        isOwner: scope.isOwner,
      },
      { entityType, entityId: synthEntityId(req), format },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) {
    handleRouteError(err, res, `[export] ${entityType} (${format}) failed:`);
  }
}

async function proxyEntity(
  req: Request,
  res: Response,
  entityType: string,
  filenamePrefix: string,
) {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await renderPrint(
      {
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        userId: scope.userId,
        role: scope.role,
        isOwner: scope.isOwner,
      },
      { entityType, entityId: String(id), format: "a4" },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filenamePrefix}-${id}.${result.mime.includes("html") ? "html" : "pdf"}`,
    );
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) {
    handleRouteError(err, res, `[export] ${entityType} pdf failed:`);
  }
}

// ─── Excel batch reports ─────────────────────────────────────────────────────

exportRouter.get("/excel/trial-balance",   financeGuard, authorize({ feature: "finance.reports",  action: "export" }), (req, res) => proxyReport(req, res, "report_trial_balance",   "excel", "trial-balance.xlsx"));
exportRouter.get("/excel/income-statement", financeGuard, authorize({ feature: "finance.reports",  action: "export" }), (req, res) => proxyReport(req, res, "report_income_statement", "excel", "income-statement.xlsx"));
exportRouter.get("/excel/invoices",         financeGuard, authorize({ feature: "finance.invoices", action: "export" }), (req, res) => proxyReport(req, res, "report_invoices",         "excel", "invoices.xlsx"));
exportRouter.get("/excel/payroll",          hrGuard,      authorize({ feature: "hr.payroll",       action: "export" }), (req, res) => proxyReport(req, res, "report_payroll",          "excel", "payroll.xlsx"));
exportRouter.get("/excel/attendance",       hrGuard,      authorize({ feature: "hr.attendance",    action: "export" }), (req, res) => proxyReport(req, res, "report_attendance",       "excel", "attendance.xlsx"));
exportRouter.get("/excel/fleet",            fleetGuard,   authorize({ feature: "fleet",            action: "export" }), (req, res) => proxyReport(req, res, "report_fleet",            "excel", "fleet.xlsx"));

// ─── Batch PDF reports ───────────────────────────────────────────────────────

exportRouter.get("/pdf/trial-balance", financeGuard, authorize({ feature: "finance.reports", action: "export" }), (req, res) => proxyReport(req, res, "report_trial_balance", "a4", "trial-balance.pdf"));
exportRouter.get("/pdf/fleet-trips",   fleetGuard,   authorize({ feature: "fleet",           action: "export" }), (req, res) => proxyReport(req, res, "report_fleet_trips",   "a4", "fleet-trips.pdf"));

// ─── Single-entity PDFs (proxied to Print Engine v2) ─────────────────────────
// invoice/voucher/payroll single-entity PDFs were retired — the frontend renders
// them via PrintButton → POST /print/render (renderPrint) directly. Only the
// purchase-order proxy remains wired (FE export button still links it).

exportRouter.get("/pdf/purchase-order/:id", financeGuard, authorize({ feature: "finance.purchase", action: "export" }), (req, res) => proxyEntity(req, res, "purchase_order",  "purchase-order"));
