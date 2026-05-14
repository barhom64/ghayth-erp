/**
 * /api/print — Print Engine v2 routes
 *   POST /api/print/render
 *   POST /api/print/preview            (no audit, no persist)
 *   GET  /api/print/templates
 *   POST /api/print/templates
 *   PATCH /api/print/templates/:id
 *   DELETE /api/print/templates/:id
 *   GET  /api/print/assignments
 *   POST /api/print/assignments
 *   GET  /api/print/jobs
 *   GET  /api/print/jobs/:jobId/download
 *   POST /api/print/jobs/:jobId/reprint
 *   POST /api/print/reprint-requests
 *   POST /api/print/reprint-requests/:id/approve
 *   POST /api/print/reprint-requests/:id/reject
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, ValidationError, NotFoundError, zodParse } from "../lib/errorHandler.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  renderPrint,
  PrintApprovalRequiredError,
  PrintPermissionError,
  PrintTemplateMissingError,
  type PrintScope,
} from "../lib/print/printService.js";
import { listTemplates } from "../lib/print/templateResolver.js";
import { fetchPrintArtifact } from "../lib/print/printStorage.js";
import { logger } from "../lib/logger.js";

const router = Router();

function scopeFromReq(req: Request): PrintScope {
  const s = req.scope;
  if (!s) throw new ValidationError("missing scope");
  return {
    companyId: s.companyId,
    branchId: s.branchId ?? null,
    userId: s.userId,
    role: s.role,
    isOwner: s.isOwner,
  };
}

// ─── Render ─────────────────────────────────────────────────────────────────

const renderBody = z.object({
  entityType: z.string().min(1),
  entityId: z.union([z.string(), z.number()]).transform((v) => String(v)),
  format: z.enum(["a4", "thermal_80", "thermal_58", "label", "excel"]).optional(),
  paperSize: z
    .enum(["A4", "A5", "THERMAL_80", "THERMAL_58", "LABEL_50x30", "LABEL_100x50"])
    .optional(),
  copyNumber: z.number().int().positive().optional(),
  isReprint: z.boolean().optional(),
  reprintApprovedBy: z.number().int().positive().nullable().optional(),
  /** When set, returns the bytes inline instead of a JSON pointer. */
  inline: z.boolean().optional(),
});

router.post("/render", requirePermission("print:create"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(renderBody.safeParse(req.body));
    const scope = scopeFromReq(req);
    const result = await renderPrint(
      scope,
      {
        entityType: body.entityType,
        entityId: body.entityId,
        format: body.format,
        paperSize: body.paperSize,
        copyNumber: body.copyNumber,
        isReprint: body.isReprint,
        reprintApprovedBy: body.reprintApprovedBy ?? null,
      },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined }
    );
    if (body.inline) {
      res.setHeader("Content-Type", result.mime);
      res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
      res.setHeader("X-Print-Job-Id", result.jobId ?? "");
      res.setHeader("X-Print-Copy", String(result.copyNumber));
      res.send(result.bytes);
      return;
    }
    res.json({
      jobId: result.jobId,
      format: result.format,
      mime: result.mime,
      filename: result.filename,
      copyNumber: result.copyNumber,
      isReprint: result.isReprint,
      watermark: result.watermark,
      storageKey: result.storageKey,
      // Inline base64 makes the response self-contained for the SPA's iframe.
      base64: result.bytes.toString("base64"),
    });
  } catch (err) {
    if (err instanceof PrintPermissionError) return res.status(err.status).json({ error: err.message });
    if (err instanceof PrintApprovalRequiredError)
      return res.status(err.status).json({ error: err.message, copyNumber: err.copyNumber });
    if (err instanceof PrintTemplateMissingError)
      return res.status(err.status).json({ error: err.message });
    return handleRouteError(err, res, "print");
  }
});

// ─── Preview (ephemeral, no audit) ──────────────────────────────────────────

const previewBody = z.object({
  entityType: z.string().min(1),
  entityId: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  templateId: z.number().int().positive().optional(),
  format: z.enum(["a4", "thermal_80", "thermal_58", "label", "excel"]).optional(),
  payload: z.record(z.any()).optional(),
});

router.post(
  "/preview",
  requirePermission("templates:read"),
  async (req: Request, res: Response) => {
    try {
      const body = zodParse(previewBody.safeParse(req.body));
      const scope = scopeFromReq(req);
      let overrideTemplate;
      if (body.templateId) {
        const [t] = await rawQuery(
          `SELECT * FROM document_templates WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "deletedAt" IS NULL LIMIT 1`,
          [body.templateId, scope.companyId]
        );
        if (!t) throw new NotFoundError("template");
        overrideTemplate = t as never;
      }
      const result = await renderPrint(
        scope,
        {
          entityType: body.entityType,
          entityId: body.entityId ?? "preview",
          format: body.format,
          previewPayload: body.payload,
          ephemeral: true,
          overrideTemplate,
        },
        {}
      );
      res.setHeader("Content-Type", result.mime);
      res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
      res.send(result.bytes);
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

// ─── Templates CRUD ─────────────────────────────────────────────────────────

router.get("/templates", requirePermission("templates:read"), async (req: Request, res: Response) => {
  try {
    const scope = scopeFromReq(req);
    const entityType = (req.query.entityType as string | undefined) ?? undefined;
    const branchIdQ = req.query.branchId;
    let branchId: number | null | undefined;
    if (branchIdQ === "null") branchId = null;
    else if (typeof branchIdQ === "string" && branchIdQ.length > 0) branchId = Number(branchIdQ);
    const items = await listTemplates({ companyId: scope.companyId, entityType, branchId });
    res.json({ items });
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

const templateCreateBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entityType: z.string().min(1),
  branchId: z.number().int().positive().nullable().optional(),
  paperSize: z
    .enum(["A4", "A5", "THERMAL_80", "THERMAL_58", "LABEL_50x30", "LABEL_100x50"])
    .default("A4"),
  mode: z.enum(["preset", "html", "visual"]).default("preset"),
  presetKey: z.string().optional(),
  htmlContent: z.string().optional(),
  layoutJson: z.unknown().optional(),
  cssOverrides: z.string().optional(),
  headerOverride: z.unknown().optional(),
  footerOverride: z.unknown().optional(),
  isThermal: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/templates", requirePermission("templates:write"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(templateCreateBody.safeParse(req.body));
    const scope = scopeFromReq(req);
    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO document_templates
       (name, description, category, "type", "entityType", "branchId", "companyId",
        "paperSize", "mode", "presetKey", "htmlContent", "layoutJson",
        "cssOverrides", "headerOverride", "footerOverride", "isThermal",
        "isDefault", "isActive", "createdBy")
       VALUES ($1,$2,'print',$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16)
       RETURNING id`,
      [
        body.name,
        body.description ?? null,
        body.entityType,
        body.branchId ?? null,
        scope.companyId,
        body.paperSize,
        body.mode,
        body.presetKey ?? null,
        body.htmlContent ?? null,
        body.layoutJson ? JSON.stringify(body.layoutJson) : null,
        body.cssOverrides ?? null,
        body.headerOverride ? JSON.stringify(body.headerOverride) : null,
        body.footerOverride ? JSON.stringify(body.footerOverride) : null,
        body.isThermal ?? false,
        body.isDefault ?? false,
        scope.userId,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

const templatePatchBody = templateCreateBody.partial().extend({
  isActive: z.boolean().optional(),
});

router.patch(
  "/templates/:id",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new ValidationError("invalid id");
      const body = zodParse(templatePatchBody.safeParse(req.body));
      const scope = scopeFromReq(req);
      const sets: string[] = [];
      const params: unknown[] = [];
      const set = (col: string, val: unknown) => {
        params.push(val);
        sets.push(`"${col}" = $${params.length}`);
      };
      if (body.name !== undefined) set("name", body.name);
      if (body.description !== undefined) set("description", body.description);
      if (body.entityType !== undefined) set("entityType", body.entityType);
      if (body.branchId !== undefined) set("branchId", body.branchId);
      if (body.paperSize !== undefined) set("paperSize", body.paperSize);
      if (body.mode !== undefined) set("mode", body.mode);
      if (body.presetKey !== undefined) set("presetKey", body.presetKey);
      if (body.htmlContent !== undefined) set("htmlContent", body.htmlContent);
      if (body.layoutJson !== undefined)
        set("layoutJson", body.layoutJson ? JSON.stringify(body.layoutJson) : null);
      if (body.cssOverrides !== undefined) set("cssOverrides", body.cssOverrides);
      if (body.headerOverride !== undefined)
        set("headerOverride", body.headerOverride ? JSON.stringify(body.headerOverride) : null);
      if (body.footerOverride !== undefined)
        set("footerOverride", body.footerOverride ? JSON.stringify(body.footerOverride) : null);
      if (body.isThermal !== undefined) set("isThermal", body.isThermal);
      if (body.isDefault !== undefined) set("isDefault", body.isDefault);
      if (body.isActive !== undefined) set("isActive", body.isActive);
      if (sets.length === 0) return res.json({ ok: true });
      sets.push(`"updatedAt" = NOW()`);
      sets.push(`"version" = COALESCE("version", 1) + 1`);
      params.push(id, scope.companyId);
      await rawExecute(
        `UPDATE document_templates SET ${sets.join(", ")} WHERE id = $${
          params.length - 1
        } AND ("companyId" = $${params.length} OR "companyId" IS NULL)`,
        params
      );
      res.json({ ok: true });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

router.delete(
  "/templates/:id",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new ValidationError("invalid id");
      const scope = scopeFromReq(req);
      await rawExecute(
        `UPDATE document_templates SET "isActive" = false, "deletedAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId]
      );
      res.json({ ok: true });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

// ─── Branch assignments ─────────────────────────────────────────────────────

router.get(
  "/assignments",
  requirePermission("templates:read"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const rows = await rawQuery(
        `SELECT a.id, a."branchId", a."entityType", a."templateId", a."isDefault",
                t.name AS "templateName", b.name AS "branchName"
         FROM print_template_assignments a
         JOIN document_templates t ON t.id = a."templateId" AND t."deletedAt" IS NULL
         LEFT JOIN branches b ON b.id = a."branchId"
         WHERE a."companyId" = $1
         ORDER BY a."branchId" NULLS FIRST, a."entityType"`,
        [scope.companyId]
      );
      res.json({ items: rows });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

const assignBody = z.object({
  entityType: z.string().min(1),
  branchId: z.number().int().positive().nullable().optional(),
  templateId: z.number().int().positive(),
  isDefault: z.boolean().default(true),
});

router.post(
  "/assignments",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const body = zodParse(assignBody.safeParse(req.body));
      const scope = scopeFromReq(req);
      // Upsert: if a default exists for the (branch, entityType), update it.
      if (body.isDefault) {
        await rawExecute(
          `UPDATE print_template_assignments
           SET "isDefault" = false, "updatedAt" = NOW()
           WHERE "companyId" = $1 AND "entityType" = $2
             AND ($3::int IS NULL AND "branchId" IS NULL OR "branchId" = $3)
             AND "isDefault" = true`,
          [scope.companyId, body.entityType, body.branchId ?? null]
        );
      }
      const rows = await rawQuery<{ id: number }>(
        `INSERT INTO print_template_assignments
         ("companyId","branchId","entityType","templateId","isDefault","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [scope.companyId, body.branchId ?? null, body.entityType, body.templateId, body.isDefault, scope.userId]
      );
      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

router.delete(
  "/assignments/:id",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new ValidationError("invalid id");
      const scope = scopeFromReq(req);
      await rawExecute(
        `DELETE FROM print_template_assignments WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId]
      );
      res.json({ ok: true });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

// ─── Print jobs (log) ───────────────────────────────────────────────────────

router.get("/jobs", requirePermission("print_jobs:read"), async (req: Request, res: Response) => {
  try {
    const scope = scopeFromReq(req);
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const entityType = (req.query.entityType as string | undefined) ?? null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const from = (req.query.from as string | undefined) ?? null;
    const to = (req.query.to as string | undefined) ?? null;
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    const params: unknown[] = [scope.companyId];
    const where: string[] = [`pj."companyId" = $1`];
    if (branchId) {
      params.push(branchId);
      where.push(`pj."branchId" = $${params.length}`);
    }
    if (entityType) {
      params.push(entityType);
      where.push(`pj."entityType" = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      where.push(`pj."userId" = $${params.length}`);
    }
    if (from) {
      params.push(from);
      where.push(`pj."createdAt" >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      where.push(`pj."createdAt" <= $${params.length}`);
    }
    params.push(limit);
    const rows = await rawQuery(
      `SELECT pj.id, pj."jobId", pj."entityType", pj."entityId", pj."format", pj."paperSize",
              pj."copyNumber", pj."isReprint", pj."watermark", pj."status", pj."createdAt",
              pj."pdfStorageKey", pj."approvedBy",
              pj."branchId", b.name AS "branchName",
              pj."userId", u.email AS "userEmail",
              e.name AS "userName"
       FROM print_jobs pj
       LEFT JOIN branches b ON b.id = pj."branchId"
       LEFT JOIN users u ON u.id = pj."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${where.join(" AND ")}
       ORDER BY pj."createdAt" DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ items: rows });
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

router.get(
  "/jobs/:jobId/download",
  requirePermission("print_jobs:read"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const rows = await rawQuery<{
        format: string;
        pdfStorageKey: string | null;
        entityType: string;
        entityId: string;
      }>(
        `SELECT format, "pdfStorageKey", "entityType", "entityId"
         FROM print_jobs WHERE "jobId" = $1 AND "companyId" = $2 LIMIT 1`,
        [req.params.jobId, scope.companyId]
      );
      if (!rows[0]) throw new NotFoundError("print_job");
      const key = rows[0].pdfStorageKey;
      if (!key) {
        return res
          .status(410)
          .json({ error: "artifact not retained — re-run /api/print/render with same entityId" });
      }
      const buf = await fetchPrintArtifact({ companyId: scope.companyId, storageKey: key });
      if (!buf) return res.status(404).json({ error: "artifact not found in storage" });
      const isExcel = rows[0].format === "excel";
      res.setHeader(
        "Content-Type",
        isExcel
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/html; charset=utf-8"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${rows[0].entityType}-${rows[0].entityId}.${isExcel ? "xlsx" : "html"}"`
      );
      res.send(buf);
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

// ─── Reprint requests ────────────────────────────────────────────────────────

const reprintBody = z.object({
  entityType: z.string().min(1),
  entityId: z.union([z.string(), z.number()]).transform((v) => String(v)),
  reason: z.string().min(1),
});

router.post("/reprint-requests", requirePermission("print:reprint:create"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(reprintBody.safeParse(req.body));
    const scope = scopeFromReq(req);
    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO print_reprint_requests
       ("companyId","branchId","entityType","entityId","requestedBy","reason","status")
       VALUES ($1,$2,$3,$4,$5,$6,'pending')
       RETURNING id`,
      [scope.companyId, scope.branchId, body.entityType, body.entityId, scope.userId, body.reason]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

router.get(
  "/reprint-requests",
  requirePermission("print:reprint:create"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const status = (req.query.status as string | undefined) ?? null;
      const params: unknown[] = [scope.companyId];
      const where: string[] = [`r."companyId" = $1`];
      if (status) {
        params.push(status);
        where.push(`r."status" = $${params.length}`);
      }
      const rows = await rawQuery(
        `SELECT r.*, e.name AS "requesterName"
         FROM print_reprint_requests r
         LEFT JOIN users u ON u.id = r."requestedBy"
         LEFT JOIN employees e ON e.id = u."employeeId"
         WHERE ${where.join(" AND ")}
         ORDER BY r."createdAt" DESC LIMIT 200`,
        params
      );
      res.json({ items: rows });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

router.post(
  "/reprint-requests/:id/approve",
  requirePermission("print:reprint:approve"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new ValidationError("invalid id");
      const scope = scopeFromReq(req);
      const [r] = await rawQuery<{
        entityType: string;
        entityId: string;
        status: string;
      }>(
        `SELECT "entityType","entityId","status" FROM print_reprint_requests
         WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
        [id, scope.companyId]
      );
      if (!r) throw new NotFoundError("reprint_request");
      if (r.status !== "pending") throw new ValidationError(`already ${r.status}`);
      const result = await renderPrint(
        scope,
        {
          entityType: r.entityType,
          entityId: r.entityId,
          isReprint: true,
          reprintApprovedBy: scope.userId,
        },
        { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined }
      );
      await rawExecute(
        `UPDATE print_reprint_requests
         SET "status"='approved', "approvedBy"=$2, "approvedAt"=NOW(), "resultJobId"=$3::uuid, "updatedAt"=NOW()
         WHERE id=$1`,
        [id, scope.userId, result.jobId]
      );
      res.json({ ok: true, jobId: result.jobId });
    } catch (err) {
      if (err instanceof PrintApprovalRequiredError)
        return res.status(409).json({ error: err.message });
      return handleRouteError(err, res, "print");
    }
  }
);

router.post(
  "/reprint-requests/:id/reject",
  requirePermission("print:reprint:approve"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new ValidationError("invalid id");
      const scope = scopeFromReq(req);
      const reason = (req.body?.reason as string | undefined) ?? "";
      await rawExecute(
        `UPDATE print_reprint_requests
         SET "status"='rejected', "rejectedReason"=$2, "approvedBy"=$3, "approvedAt"=NOW(), "updatedAt"=NOW()
         WHERE id=$1 AND "companyId"=$4`,
        [id, reason, scope.userId, scope.companyId]
      );
      res.json({ ok: true });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

export default router;
