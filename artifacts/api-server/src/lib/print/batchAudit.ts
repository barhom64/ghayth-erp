/**
 * batchAudit — small helper to log legacy /export/excel/* and
 * /export/pdf/{trial-balance,fleet-trips} runs into print_jobs so they
 * show up in /reports/print-log alongside Print Engine v2 renders.
 *
 * The legacy batch reports (trial balance, payroll, attendance, fleet, ...)
 * have their own bespoke renderers in lib/excelExport.ts + lib/pdfExport.ts.
 * Rewriting all of them as v2 entities is a large project. In the meantime,
 * wrapping each handler with `withBatchAudit()` gives the user immediate
 * audit visibility (who exported what report, when, from which branch)
 * without touching the report generators themselves.
 *
 * Usage:
 *   exportRouter.get("/excel/payroll", ..., (req, res) =>
 *     withBatchAudit(req, res, {
 *       entityType: "report_payroll",
 *       format: "excel",
 *       filename: "payroll.xlsx",
 *       mime: "application/vnd...",
 *     }, () => exportPayrollExcel(scope.companyId, period))
 *   );
 */

import type { Request, Response } from "express";
import { writePrintJob } from "./printJobsLogger.js";
import { logger } from "../logger.js";
import { todayISO } from "../businessHelpers.js";

export interface BatchAuditOpts {
  /** Pseudo-entityType for the print_jobs row. Use `report_<name>` form. */
  entityType: string;
  /** Format identifier — "excel" | "a4" | "pdf" (mapped to a4 for v2 grouping). */
  format: "excel" | "a4" | "pdf";
  /** Filename for Content-Disposition. */
  filename: string;
  /** MIME for Content-Type. */
  mime: string;
}

/** Wraps a legacy report generator: produces bytes, logs the run, ships. */
export async function withBatchAudit(
  req: Request,
  res: Response,
  opts: BatchAuditOpts,
  generate: () => Promise<Buffer>,
): Promise<void> {
  const scope = req.scope;
  if (!scope) {
    res.status(401).json({ error: "missing scope" });
    return;
  }
  // The legacy report params (date range, period, etc.) form a synthetic
  // entityId — gives the audit log enough breadcrumbs to identify which
  // run a user is asking about ("the trial balance from 2025-04 to 2025-06").
  const q = req.query as Record<string, string | undefined>;
  const entityId =
    q.period ??
    [q.startDate, q.endDate].filter(Boolean).join("..") ??
    todayISO();

  let bytes: Buffer;
  try {
    bytes = await generate();
  } catch (err) {
    // Log the failure so /reports/print-log shows the attempt even when it failed.
    await writePrintJob({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      userId: scope.userId,
      entityType: opts.entityType,
      entityId: entityId || "n/a",
      templateId: null,
      format: opts.format === "pdf" ? "a4" : opts.format,
      paperSize: opts.format === "excel" ? null : "A4",
      copyNumber: 1,
      isReprint: false,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    }).catch((e) => logger.warn(e as Error, "[batchAudit] failed-row insert failed"));
    throw err;
  }

  // Fire-and-forget the audit row so the response isn't blocked on logging.
  writePrintJob({
    companyId: scope.companyId,
    branchId: scope.branchId ?? null,
    userId: scope.userId,
    entityType: opts.entityType,
    entityId: entityId || "n/a",
    templateId: null,
    format: opts.format === "pdf" ? "a4" : opts.format,
    paperSize: opts.format === "excel" ? null : "A4",
    copyNumber: 1,
    isReprint: false,
    pdfBytes: bytes.byteLength,
    status: "done",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? undefined,
  }).catch((e) => logger.warn(e as Error, "[batchAudit] done-row insert failed"));

  res.setHeader("Content-Type", opts.mime);
  res.setHeader("Content-Disposition", `attachment; filename=${opts.filename}`);
  res.send(bytes);
}
