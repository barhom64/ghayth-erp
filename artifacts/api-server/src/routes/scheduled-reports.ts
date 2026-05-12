import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";

export const scheduledReportsRouter = Router();
scheduledReportsRouter.use(authMiddleware);

interface ScheduledReportRow {
  id: number;
  companyId: number;
  reportType: string;
  title: string;
  frequency: string;
  recipients: unknown;
  params: unknown;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

interface ScheduledReportListRow extends ScheduledReportRow {
  createdByName: string;
}

interface ScheduledReportHistoryRow {
  id: number;
  scheduledReportId: number;
  sentAt: string;
  status: string | null;
  recipients: unknown;
  payload: unknown;
  errorMessage: string | null;
  reportTitle: string;
  reportType: string;
}

const createScheduledReportSchema = z.object({
  reportType: z.string().min(1, "نوع التقرير مطلوب"),
  title: z.string().min(1, "العنوان مطلوب"),
  frequency: z.string().min(1, "التكرار مطلوب"),
  recipients: z.array(z.string()).min(1, "المستلمون مطلوبون"),
  params: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

const patchScheduledReportSchema = z.object({
  title: z.string().min(1).optional(),
  frequency: z.string().min(1).optional(),
  recipients: z.array(z.string()).optional(),
  params: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

scheduledReportsRouter.get("/", authorize({ feature: "reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<ScheduledReportListRow>(
      `SELECT sr.*,
         COALESCE(e."name", e."nameEn", 'Unknown') AS "createdByName"
       FROM scheduled_reports sr
       LEFT JOIN employee_assignments ea ON ea.id = sr."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE sr."companyId" = $1
       ORDER BY sr."createdAt" DESC LIMIT 200`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Scheduled reports list error:");
  }
});

scheduledReportsRouter.post("/", authorize({ feature: "reports", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { reportType, title, frequency, recipients, params, isActive } = zodParse(createScheduledReportSchema.safeParse(req.body));
    const [row] = await rawQuery<ScheduledReportRow>(
      `INSERT INTO scheduled_reports ("companyId", "reportType", title, frequency, recipients, params, "isActive", "createdBy", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [scope.companyId, reportType, title, frequency, JSON.stringify(recipients), JSON.stringify(params || {}), isActive !== false, scope.activeAssignmentId]
    );
    res.status(201).json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "Create scheduled report error:");
  }
});

scheduledReportsRouter.patch("/:id", authorize({ feature: "reports", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { title, frequency, recipients, params, isActive } = zodParse(patchScheduledReportSchema.safeParse(req.body));
    const updates: string[] = [];
    const vals: any[] = [id, scope.companyId];
    if (title !== undefined) { vals.push(title); updates.push(`title = $${vals.length}`); }
    if (frequency !== undefined) { vals.push(frequency); updates.push(`frequency = $${vals.length}`); }
    if (recipients !== undefined) { vals.push(JSON.stringify(recipients)); updates.push(`recipients = $${vals.length}`); }
    if (params !== undefined) { vals.push(JSON.stringify(params)); updates.push(`params = $${vals.length}`); }
    if (isActive !== undefined) { vals.push(isActive); updates.push(`"isActive" = $${vals.length}`); }
    if (updates.length === 0) throw new ValidationError("No fields to update");
    const [row] = await rawQuery<ScheduledReportRow>(
      `UPDATE scheduled_reports SET ${updates.join(", ")} WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      vals
    );
    if (!row) throw new NotFoundError("Not found");
    res.json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "Update scheduled report error:");
  }
});

scheduledReportsRouter.delete("/:id", authorize({ feature: "reports", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `DELETE FROM scheduled_reports WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete scheduled report error:");
  }
});

scheduledReportsRouter.get("/history", authorize({ feature: "reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<ScheduledReportHistoryRow>(
      `SELECT srh.*, sr.title AS "reportTitle", sr."reportType"
       FROM scheduled_report_history srh
       JOIN scheduled_reports sr ON sr.id = srh."scheduledReportId"
       WHERE sr."companyId" = $1
       ORDER BY srh."sentAt" DESC
       LIMIT 50`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Scheduled report history error:");
  }
});
