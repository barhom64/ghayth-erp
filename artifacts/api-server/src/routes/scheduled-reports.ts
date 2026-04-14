import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";

export const scheduledReportsRouter = Router();
scheduledReportsRouter.use(authMiddleware);

scheduledReportsRouter.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT sr.*,
         COALESCE(e."name", e."nameEn", 'Unknown') AS "createdByName"
       FROM scheduled_reports sr
       LEFT JOIN employee_assignments ea ON ea.id = sr."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE sr."companyId" = $1
       ORDER BY sr."createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Scheduled reports list error:");
  }
});

scheduledReportsRouter.post("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const { reportType, title, frequency, recipients, params, isActive } = req.body;
    if (!reportType || !title || !frequency || !recipients?.length) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const [row] = await rawQuery<any>(
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

scheduledReportsRouter.patch("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { title, frequency, recipients, params, isActive } = req.body;
    const updates: string[] = [];
    const vals: any[] = [id, scope.companyId];
    if (title !== undefined) { vals.push(title); updates.push(`title = $${vals.length}`); }
    if (frequency !== undefined) { vals.push(frequency); updates.push(`frequency = $${vals.length}`); }
    if (recipients !== undefined) { vals.push(JSON.stringify(recipients)); updates.push(`recipients = $${vals.length}`); }
    if (params !== undefined) { vals.push(JSON.stringify(params)); updates.push(`params = $${vals.length}`); }
    if (isActive !== undefined) { vals.push(isActive); updates.push(`"isActive" = $${vals.length}`); }
    if (updates.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    const [row] = await rawQuery<any>(
      `UPDATE scheduled_reports SET ${updates.join(", ")} WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      vals
    );
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "Update scheduled report error:");
  }
});

scheduledReportsRouter.delete("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await rawExecute(
      `DELETE FROM scheduled_reports WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete scheduled report error:");
  }
});

scheduledReportsRouter.get("/history", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
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
