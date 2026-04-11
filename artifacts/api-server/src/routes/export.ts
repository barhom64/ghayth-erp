import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireModule } from "../middlewares/roleGuard.js";
import { handleRouteError } from "../lib/errorHandler.js";
import {
  exportTrialBalanceExcel,
  exportIncomeStatementExcel,
  exportInvoicesExcel,
  exportPayrollExcel,
  exportAttendanceExcel,
  exportFleetExcel,
} from "../lib/excelExport.js";
import {
  exportInvoicePdf,
  exportPurchaseOrderPdf,
  exportVoucherPdf,
  exportPayrollSlipPdf,
  exportTrialBalancePdf,
  exportFleetTripsPdf,
} from "../lib/pdfExport.js";

export const exportRouter = Router();
exportRouter.use(authMiddleware);

const financeGuard = requireModule("finance");
const hrGuard = requireModule("hr");
const fleetGuard = requireModule("fleet");

exportRouter.get("/excel/trial-balance", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const buf = await exportTrialBalanceExcel(scope.companyId, startDate, endDate);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=trial-balance.xlsx");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "Excel trial-balance error:");
  }
});

exportRouter.get("/excel/income-statement", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const buf = await exportIncomeStatementExcel(scope.companyId, startDate, endDate);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=income-statement.xlsx");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "Excel income-statement error:");
  }
});

exportRouter.get("/excel/invoices", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const buf = await exportInvoicesExcel(scope.companyId, startDate, endDate);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "Excel invoices error:");
  }
});

exportRouter.get("/excel/payroll", hrGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as Record<string, string | undefined>;
    const buf = await exportPayrollExcel(scope.companyId, period);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=payroll.xlsx");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "Excel payroll error:");
  }
});

exportRouter.get("/excel/attendance", hrGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const buf = await exportAttendanceExcel(scope.companyId, startDate, endDate);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=attendance.xlsx");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "Excel attendance error:");
  }
});

exportRouter.get("/excel/fleet", fleetGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const buf = await exportFleetExcel(scope.companyId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=fleet.xlsx");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "Excel fleet error:");
  }
});

exportRouter.get("/pdf/invoice/:id", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const buf = await exportInvoicePdf(scope.companyId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${id}.pdf`);
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "PDF invoice error:");
  }
});

exportRouter.get("/pdf/purchase-order/:id", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const buf = await exportPurchaseOrderPdf(scope.companyId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=purchase-order-${id}.pdf`);
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "PDF purchase-order error:");
  }
});

exportRouter.get("/pdf/voucher/:id", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const buf = await exportVoucherPdf(scope.companyId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=voucher-${id}.pdf`);
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "PDF voucher error:");
  }
});

exportRouter.get("/pdf/payroll/:id", hrGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const buf = await exportPayrollSlipPdf(scope.companyId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=payroll-slip-${id}.pdf`);
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "PDF payroll error:");
  }
});

exportRouter.get("/pdf/trial-balance", financeGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const buf = await exportTrialBalancePdf(scope.companyId, startDate, endDate);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=trial-balance.pdf");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "PDF trial-balance error:");
  }
});

exportRouter.get("/pdf/fleet-trips", fleetGuard, async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const buf = await exportFleetTripsPdf(scope.companyId, startDate, endDate);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=fleet-trips.pdf");
    res.send(buf);
  } catch (err) {
    handleRouteError(err, res, "PDF fleet-trips error:");
  }
});
