import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireModule } from "../middlewares/roleGuard.js";
import { handleRouteError,
  parseId,
} from "../lib/errorHandler.js";
import {
  exportTrialBalanceExcel,
  exportIncomeStatementExcel,
  exportInvoicesExcel,
  exportPayrollExcel,
  exportAttendanceExcel,
  exportFleetExcel,
} from "../lib/excelExport.js";
import {
  exportTrialBalancePdf,
  exportFleetTripsPdf,
} from "../lib/pdfExport.js";

import { authorize } from "../lib/rbac/authorize.js";
import { renderPrint } from "../lib/print/printService.js";
import { withBatchAudit } from "../lib/print/batchAudit.js";

export const exportRouter = Router();
exportRouter.use(authMiddleware);

const financeGuard = requireModule("finance");
const hrGuard = requireModule("hr");
const fleetGuard = requireModule("fleet");

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF = "application/pdf";

// ─── Excel batch reports ─────────────────────────────────────────────────────
// Every batch export is wrapped in withBatchAudit() — each run writes a row
// to print_jobs and shows up in /reports/print-log alongside v2 prints.
// The report generators stay unchanged; this just adds the audit envelope.

exportRouter.get("/excel/trial-balance", financeGuard, authorize({ feature: "finance.reports", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_trial_balance", format: "excel", filename: "trial-balance.xlsx", mime: XLSX },
    () => exportTrialBalanceExcel(scope.companyId, startDate, endDate),
  ).catch((err) => handleRouteError(err, res, "Excel trial-balance error:"));
});

exportRouter.get("/excel/income-statement", financeGuard, authorize({ feature: "finance.reports", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_income_statement", format: "excel", filename: "income-statement.xlsx", mime: XLSX },
    () => exportIncomeStatementExcel(scope.companyId, startDate, endDate),
  ).catch((err) => handleRouteError(err, res, "Excel income-statement error:"));
});

exportRouter.get("/excel/invoices", financeGuard, authorize({ feature: "finance.invoices", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_invoices", format: "excel", filename: "invoices.xlsx", mime: XLSX },
    () => exportInvoicesExcel(scope.companyId, startDate, endDate),
  ).catch((err) => handleRouteError(err, res, "Excel invoices error:"));
});

exportRouter.get("/excel/payroll", hrGuard, authorize({ feature: "hr.payroll", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { period } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_payroll", format: "excel", filename: "payroll.xlsx", mime: XLSX },
    () => exportPayrollExcel(scope.companyId, period),
  ).catch((err) => handleRouteError(err, res, "Excel payroll error:"));
});

exportRouter.get("/excel/attendance", hrGuard, authorize({ feature: "hr.attendance", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_attendance", format: "excel", filename: "attendance.xlsx", mime: XLSX },
    () => exportAttendanceExcel(scope.companyId, startDate, endDate),
  ).catch((err) => handleRouteError(err, res, "Excel attendance error:"));
});

exportRouter.get("/excel/fleet", fleetGuard, authorize({ feature: "fleet", action: "export" }), (req, res) => {
  const scope = req.scope!;
  withBatchAudit(req, res, { entityType: "report_fleet", format: "excel", filename: "fleet.xlsx", mime: XLSX },
    () => exportFleetExcel(scope.companyId),
  ).catch((err) => handleRouteError(err, res, "Excel fleet error:"));
});

// ─── Single-entity PDFs (proxied to Print Engine v2 in #1044) ────────────────

async function proxyToPrintEngine(
  req: import("express").Request,
  res: import("express").Response,
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
    handleRouteError(err, res, `PDF ${entityType} (v2 proxy) error:`);
  }
}

exportRouter.get("/pdf/invoice/:id", financeGuard, authorize({ feature: "finance.invoices", action: "export" }), (req, res) =>
  proxyToPrintEngine(req, res, "invoice", "invoice"),
);

exportRouter.get("/pdf/purchase-order/:id", financeGuard, authorize({ feature: "finance.purchase", action: "export" }), (req, res) =>
  proxyToPrintEngine(req, res, "purchase_order", "purchase-order"),
);

exportRouter.get("/pdf/voucher/:id", financeGuard, authorize({ feature: "finance.reports", action: "export" }), (req, res) =>
  proxyToPrintEngine(req, res, "payment_voucher", "voucher"),
);

exportRouter.get("/pdf/payroll/:id", hrGuard, authorize({ feature: "hr.payroll", action: "export" }), (req, res) =>
  proxyToPrintEngine(req, res, "payroll", "payroll-slip"),
);

// ─── Batch PDF reports ───────────────────────────────────────────────────────

exportRouter.get("/pdf/trial-balance", financeGuard, authorize({ feature: "finance.reports", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_trial_balance", format: "pdf", filename: "trial-balance.pdf", mime: PDF },
    () => exportTrialBalancePdf(scope.companyId, startDate, endDate),
  ).catch((err) => handleRouteError(err, res, "PDF trial-balance error:"));
});

exportRouter.get("/pdf/fleet-trips", fleetGuard, authorize({ feature: "fleet", action: "export" }), (req, res) => {
  const scope = req.scope!;
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  withBatchAudit(req, res, { entityType: "report_fleet_trips", format: "pdf", filename: "fleet-trips.pdf", mime: PDF },
    () => exportFleetTripsPdf(scope.companyId, startDate, endDate),
  ).catch((err) => handleRouteError(err, res, "PDF fleet-trips error:"));
});
