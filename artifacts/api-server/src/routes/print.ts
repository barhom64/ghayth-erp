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
import multer from "multer";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, ValidationError, NotFoundError, zodParse } from "../lib/errorHandler.js";
import { requirePermission, requireAnyPermission } from "../middlewares/permissionMiddleware.js";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import {
  renderPrint,
  PrintApprovalRequiredError,
  PrintPermissionError,
  PrintTemplateMissingError,
  type PrintScope,
} from "../lib/print/printService.js";
import { listTemplates, listPrintableEntityTypes } from "../lib/print/templateResolver.js";
import { fetchPrintArtifact } from "../lib/print/printStorage.js";
import { logger } from "../lib/logger.js";
import { todayISO, createAuditLog, emitEvent, auditFromRequest } from "../lib/businessHelpers.js";

const router = Router();

// Each call to /render synthesises a PDF/HTML payload, persists it to
// object-storage, and writes an audit row. Without a per-user cap a
// runaway loop in a browser tab (or a malicious actor) could fill the
// print_jobs table and burn storage quota inside a minute. 30/min is
// generous for human users — re-prints, re-tries, multiple receipts —
// while staying well below a DoS threshold.
const renderLimiter = createPerUserLimiter({
  prefix: "print:render",
  windowMs: 60 * 1000,
  max: 30,
  message: "تم تجاوز الحد الأقصى للطباعة (30/دقيقة). يرجى المحاولة بعد قليل",
  skip: () => false,
});

const previewLimiter = createPerUserLimiter({
  prefix: "print:preview",
  windowMs: 60 * 1000,
  max: 60,
  message: "تم تجاوز الحد الأقصى للمعاينة. يرجى الانتظار قليلاً",
  skip: () => false,
});

// ─── Shared validators ──────────────────────────────────────────────────────
// Every print endpoint that takes an entityType or entityId from the request
// body uses these — keeps the bounds consistent (DB column widths,
// XSS-safe charset, snake_case) instead of drifting between routes. The
// /render schema in #1081 had hardened these inline; we extract them here
// so /preview, /templates, /assignments, and /reprint-requests all share
// the same gates.
const zEntityType = z.string().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/, {
  message: "entityType must be a snake_case identifier",
});
const zEntityId = z.union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => v.length > 0 && v.length <= 64 && v !== "0", {
    message: "entityId must reference a real record (1–64 chars)",
  })
  .refine((v) => /^[A-Za-z0-9_\-./]+$/.test(v), {
    message: "entityId contains invalid characters",
  });

function scopeFromReq(req: Request): PrintScope {
  const s = req.scope;
  if (!s) throw new ValidationError("missing scope");
  return {
    companyId: s.companyId,
    branchId: s.branchId ?? null,
    userId: s.userId,
    role: s.role,
    isOwner: s.isOwner,
    allowedBranches: s.allowedBranches ?? [],
  };
}

// ─── Render ─────────────────────────────────────────────────────────────────

const renderBody = z.object({
  entityType: zEntityType,
  entityId: zEntityId,
  format: z.enum(["a4", "thermal_80", "thermal_58", "label", "excel"]).optional(),
  paperSize: z
    .enum(["A4", "A5", "THERMAL_80", "THERMAL_58", "LABEL_50x30", "LABEL_100x50"])
    .optional(),
  // Cap at 99999 — print_jobs."copyNumber" is INT4; anything > 2^31-1 errors
  // on insert. 99999 is more than enough for any real-world reprint chain.
  copyNumber: z.number().int().positive().max(99999).optional(),
  isReprint: z.boolean().optional(),
  // NOTE: reprintApprovedBy is NOT accepted from the public /render body.
  // Previously the schema allowed any caller to send `reprintApprovedBy: 123`
  // and the approval check at printService.ts:110 would be bypassed
  // (`!req.reprintApprovedBy` evaluates to false for any truthy number),
  // writing a fabricated approval row with arbitrary approverId.
  // The legitimate path: caller hits /reprint-requests, an approver hits
  // /reprint-requests/:id/approve which internally calls renderPrint with
  // reprintApprovedBy = scope.userId. That flow stays intact via the
  // dedicated approve route.
  /** When set, returns the bytes inline instead of a JSON pointer. */
  inline: z.boolean().optional(),
  /** Caller-supplied data payload — when present we SKIP the dataLoader
   *  and use this directly. Lets ListPage exports pass the visible rows
   *  ("items"), AI letter drafts pass the generated body, etc. Capped
   *  at ~256KB so it can't be used as a backdoor to embed arbitrary
   *  template content. */
  payload: z.record(z.any()).optional(),
});

router.post("/render", renderLimiter, requirePermission("print:create"), async (req: Request, res: Response) => {
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
        // When the caller supplied a payload (e.g. ListPage exporting the
        // visible rows), bypass the dataLoader and use it directly. This
        // is what fixes "blank page on list export" — the synthetic
        // entityId "_list" doesn't exist in any table, so without this
        // path the loader returned a stub and the doc was nearly empty.
        previewPayload: body.payload,
        // reprintApprovedBy never sourced from the public body — see schema
        // comment above. The internal /reprint-requests/:id/approve handler
        // calls renderPrint() directly with scope.userId.
        reprintApprovedBy: null,
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
    // Log the full context so "the print button broke" tickets have something
    // to grep for. The user only sees a toast — without this line we'd have to
    // guess what entity/format/scope triggered the failure.
    logger.error(err as Error, "[print] /render failed", {
      userId: req.scope?.userId,
      companyId: req.scope?.companyId,
      branchId: req.scope?.branchId,
      entityType: req.body?.entityType,
      entityId: req.body?.entityId,
      format: req.body?.format,
    });
    // Belt-and-suspenders for "ما زالت فيه مشكلة 500": handleRouteError
    // categorises typed errors well, but a brand-new unhandled exception
    // (a fresh adapter crash, a Buffer.from on non-ASCII issue, etc.) still
    // returns the generic 500 toast with no hint. Catch anything that
    // hasn't been classified by the time we get here and return a
    // structured error the SPA can show — including the actual message
    // tail so the user can paste it into a support ticket.
    if (!res.headersSent) {
      const e = err as { message?: string; name?: string; code?: string };
      const safeMsg = (e?.message ?? "").toString().slice(0, 200);
      return res.status(500).json({
        error: safeMsg || "تعذّرت عملية الطباعة. أرسل هذه الرسالة للدعم الفني.",
        code: e?.code ?? "PRINT_RENDER_FAILED",
        details: { name: e?.name, entityType: req.body?.entityType, entityId: req.body?.entityId },
      });
    }
    return handleRouteError(err, res, "print");
  }
});

// ─── Preview (ephemeral, no audit) ──────────────────────────────────────────

const previewBody = z.object({
  entityType: zEntityType,
  entityId: zEntityId.optional(),
  templateId: z.number().int().positive().optional(),
  format: z.enum(["a4", "thermal_80", "thermal_58", "label", "excel"]).optional(),
  payload: z.record(z.any()).optional(),
  /** In-flight HTML draft from the template editor. When supplied (without
   *  templateId) the engine renders this exact markup, so the user sees
   *  their unsaved edits before committing. Capped at 200KB to prevent
   *  a malicious client from blowing past the rate limit with a huge body. */
  htmlContent: z.string().max(200_000).optional(),
  presetKey: z.string().max(100).optional(),
  paperSize: z.enum(["A4", "A5", "THERMAL_80", "THERMAL_58", "LABEL_50x30", "LABEL_100x50"]).optional(),
  // Visual-mode draft. When supplied the engine renders the layout tree
  // (same shape `document_templates.layoutJson` accepts) without touching
  // the DB — gives the visual builder live preview during editing.
  layoutJson: z.array(z.any()).max(200).optional(),
  // Header/footer overrides — when set, the cliché editor's overrides win
  // over the branch's default letterhead during preview so the user sees
  // their unsaved changes (custom logo, override company name, footer text).
  headerOverride: z.record(z.any()).optional(),
  footerOverride: z.record(z.any()).optional(),
});

router.post(
  "/preview",
  previewLimiter,
  // Granular gate (issue #1286): preview without audit row. Backward-compat
  // via requireAnyPermission — existing "templates:read" still works for
  // template authors, plus a dedicated "print:preview" lets owners grant
  // preview access without granting full template editing.
  requireAnyPermission("templates:read", "print:preview:create"),
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
      } else if (body.htmlContent || body.layoutJson) {
        // In-flight preview — build an in-memory template that wraps the
        // user's draft (either raw HTML or a visual-builder layout tree).
        // Skips the DB entirely so editing without saving still produces a
        // faithful preview. layoutJson takes precedence when both are
        // present (visual mode is the higher-level abstraction).
        const isVisual = Array.isArray(body.layoutJson) && body.layoutJson.length > 0;
        overrideTemplate = {
          id: -999,
          name: "draft-preview",
          entityType: body.entityType,
          branchId: null,
          companyId: null,
          paperSize: body.paperSize ?? "A4",
          mode: isVisual ? "visual" : "html",
          presetKey: body.presetKey ?? "draft",
          htmlContent: isVisual ? null : body.htmlContent,
          layoutJson: isVisual ? body.layoutJson : null,
          cssOverrides: null,
          headerOverride: body.headerOverride ?? null,
          footerOverride: body.footerOverride ?? null,
          isThermal: body.paperSize === "THERMAL_80" || body.paperSize === "THERMAL_58",
          version: 1,
        } as never;
      } else if (body.presetKey) {
        // Preset-theme preview — the operator picked a built-in style
        // (classic/modern/compact) without typing custom HTML. Resolve the
        // branded theme so the preview reflects the actual cliché the seed
        // path would serve, not just the hard-coded classic. Without this
        // branch the modern/compact preview was identical to classic.
        const { getBrandedThemeHtml } = await import("../lib/print/brandedThemes.js");
        const { html, css } = getBrandedThemeHtml(body.entityType, body.presetKey);
        overrideTemplate = {
          id: -998,
          name: `preset-${body.presetKey}`,
          entityType: body.entityType,
          branchId: null,
          companyId: null,
          paperSize: body.paperSize ?? "A4",
          mode: "html",
          presetKey: body.presetKey,
          htmlContent: html,
          layoutJson: null,
          cssOverrides: css || null,
          headerOverride: body.headerOverride ?? null,
          footerOverride: body.footerOverride ?? null,
          isThermal: body.paperSize === "THERMAL_80" || body.paperSize === "THERMAL_58",
          version: 1,
        } as never;
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

// ─── Printable-entity catalogue ────────────────────────────────────────────
// Returns every entityType the engine can render — used by the template
// editor's entity dropdown and the per-branch assignment grid so the SPA
// doesn't carry a hand-maintained list that drifts every time we add a
// preset. Gated on the same templates:read perm as listing templates
// because both surfaces are admin/settings-only.
router.get("/entity-types", requirePermission("templates:read"), async (_req: Request, res: Response) => {
  try {
    res.json({ items: listPrintableEntityTypes() });
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

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
  // Length caps mirror the DB columns: name is varchar(120),
  // description text but reasonable max, htmlContent/cssOverrides text but
  // capped to head off accidental megabyte uploads + denial-of-service via
  // template-table bloat.
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  entityType: zEntityType,
  branchId: z.number().int().positive().nullable().optional(),
  paperSize: z
    .enum(["A4", "A5", "THERMAL_80", "THERMAL_58", "LABEL_50x30", "LABEL_100x50"])
    .default("A4"),
  mode: z.enum(["preset", "html", "visual"]).default("preset"),
  presetKey: z.string().max(60).optional(),
  htmlContent: z.string().max(500_000).optional(),
  layoutJson: z.unknown().optional(),
  cssOverrides: z.string().max(100_000).optional(),
  headerOverride: z.unknown().optional(),
  footerOverride: z.unknown().optional(),
  isThermal: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/templates", requirePermission("templates:write"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(templateCreateBody.safeParse(req.body));
    const scope = scopeFromReq(req);
    // When the operator picks a built-in preset theme (classic/modern/
    // compact) and doesn't supply custom HTML, materialise the branded
    // theme HTML now and store it as mode=html. This way the saved row is
    // self-contained — the renderer doesn't have to re-derive the theme,
    // and the operator can later tweak the materialised HTML if they want.
    let effMode = body.mode;
    let effHtml = body.htmlContent ?? null;
    let effCss = body.cssOverrides ?? null;
    if (body.mode === "preset" && !body.htmlContent && body.presetKey) {
      const { getBrandedThemeHtml } = await import("../lib/print/brandedThemes.js");
      const { html, css } = getBrandedThemeHtml(body.entityType, body.presetKey);
      effMode = "html";
      effHtml = html;
      effCss = effCss || css || null;
    }
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
        effMode,
        body.presetKey ?? null,
        effHtml,
        body.layoutJson ? JSON.stringify(body.layoutJson) : null,
        effCss,
        body.headerOverride ? JSON.stringify(body.headerOverride) : null,
        body.footerOverride ? JSON.stringify(body.footerOverride) : null,
        body.isThermal ?? false,
        body.isDefault ?? false,
        scope.userId,
      ]
    );
    const templateId = rows[0].id;
    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "print.template.created",
      entity: "document_templates",
      entityId: templateId,
      after: { name: body.name, entityType: body.entityType, mode: body.mode, isDefault: body.isDefault ?? false },
    }).catch((e) => logger.error(e, "print template audit failed"));
    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId ?? null,
      action: "print.template.created",
      entity: "document_templates",
      entityId: templateId,
    }).catch((e) => logger.error(e, "print template event failed"));
    res.status(201).json({ id: templateId });
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
      await createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "print.template.updated",
        entity: "document_templates",
        entityId: id,
        after: Object.fromEntries(
          Object.entries(body).filter(([k, v]) => v !== undefined && !["htmlContent", "layoutJson", "headerOverride", "footerOverride", "cssOverrides"].includes(k))
        ),
      }).catch((e) => logger.error(e, "print template audit failed"));
      await emitEvent({
        companyId: scope.companyId,
        userId: scope.userId ?? null,
        action: "print.template.updated",
        entity: "document_templates",
        entityId: id,
      }).catch((e) => logger.error(e, "print template event failed"));
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
      await createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "print.template.deleted",
        entity: "document_templates",
        entityId: id,
      }).catch((e) => logger.error(e, "print template audit failed"));
      await emitEvent({
        companyId: scope.companyId,
        userId: scope.userId ?? null,
        action: "print.template.deleted",
        entity: "document_templates",
        entityId: id,
      }).catch((e) => logger.error(e, "print template event failed"));
      res.json({ ok: true });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

// ─── Upload routes — logo, template file, reset-to-default ──────────────────

/**
 * Multer config — in-memory, 2MB max for logos, 256KB for HTML.
 * Files are converted to data URLs and stored on the template row /
 * branch row directly, so no object-storage plumbing is required for
 * the v1 of the editor. Production-grade S3 storage is a follow-up.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const ALLOWED_LOGO_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

/**
 * POST /api/print/uploads/logo
 * Accepts a multipart file (field: "logo"). Returns { dataUrl } —
 * a data: URL the caller can paste straight into the template editor's
 * "override logo URL" field (or save on the branch).
 */
router.post(
  "/uploads/logo",
  requirePermission("templates:write"),
  upload.single("logo"),
  async (req: Request, res: Response) => {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        throw new ValidationError("logo file is required (field: logo)");
      }
      if (!ALLOWED_LOGO_MIMES.has(file.mimetype)) {
        throw new ValidationError(
          `unsupported logo type ${file.mimetype}; use PNG/JPEG/WebP/SVG`,
        );
      }
      // 2MB is enough for any letterhead logo. Data URL is base64-expanded
      // so the wire format is ~33% bigger, which is fine for templates
      // (rare-write reference) but would not be for end-user uploads.
      const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      res.json({
        ok: true,
        dataUrl,
        size: file.size,
        mimeType: file.mimetype,
      });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

/**
 * POST /api/print/uploads/template
 * Accepts a multipart .html file (field: "template") + form fields for
 * `name`, `entityType`, `branchId` (optional), `paperSize`. Creates a
 * `document_templates` row in mode="html" with the file's contents as
 * htmlContent. Returns the created template row.
 *
 * This is the "I have a complete cliché — upload it" path. Operators
 * who have a designed invoice template (typically exported from Word
 * or Photoshop-to-HTML) get a one-click import rather than having to
 * paste 2000 lines of HTML into a textarea.
 */
router.post(
  "/uploads/template",
  requirePermission("templates:write"),
  upload.single("template"),
  async (req: Request, res: Response) => {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        throw new ValidationError("template file is required (field: template)");
      }
      // Accept .html / text/html only for the v1. ZIP unpacking (HTML + logo
      // bundled together) is a follow-up — keeps the implementation small.
      if (
        !file.mimetype.startsWith("text/html") &&
        !file.originalname.toLowerCase().endsWith(".html") &&
        !file.originalname.toLowerCase().endsWith(".htm")
      ) {
        throw new ValidationError(
          "only .html template files are supported in this version",
        );
      }
      // 256KB cap for HTML — anything larger is suspicious (the largest
      // bundled preset in BESPOKE_PRESETS is ~6KB).
      if (file.size > 256 * 1024) {
        throw new ValidationError(
          "template HTML is too large (max 256KB)",
        );
      }
      const html = file.buffer.toString("utf-8");
      // Light sanity check — must contain at least one template token so we
      // don't accept an obviously empty / placeholder file. Common token
      // names listed at print-templates.tsx PRINT_TOKENS.
      if (
        !/\{\{[^}]+\}\}/.test(html) &&
        !/<table|<div|<section/i.test(html)
      ) {
        throw new ValidationError(
          "template HTML must contain template tokens like {{entity.ref}} or basic HTML structure",
        );
      }
      // Form fields from the multipart body
      const name = String(req.body?.name ?? file.originalname.replace(/\.html?$/i, ""));
      const entityType = String(req.body?.entityType ?? "invoice");
      const paperSize = String(req.body?.paperSize ?? "A4");
      const branchId =
        req.body?.branchId === undefined || req.body?.branchId === ""
          ? null
          : Number(req.body.branchId);
      const isDefault = req.body?.isDefault === "true" || req.body?.isDefault === true;

      const scope = scopeFromReq(req);
      const inserted = await rawQuery<{ id: number }>(
        `INSERT INTO document_templates
           ("companyId", "branchId", name, "entityType", "paperSize",
            mode, "htmlContent", "isDefault", "isActive", version)
         VALUES ($1, $2, $3, $4, $5, 'html', $6, $7, true, 1)
         RETURNING id`,
        [scope.companyId, branchId, name, entityType, paperSize, html, isDefault],
      );
      res.json({
        ok: true,
        templateId: inserted[0]?.id,
        name,
        entityType,
        size: file.size,
      });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  }
);

/**
 * POST /api/print/templates/:id/reset
 * Replaces a custom template's htmlContent with the seeded preset for
 * the same entityType. This is the "I broke the template — restore the
 * default" button.
 */
router.post(
  "/templates/:id/reset",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw new ValidationError("invalid template id");
      const scope = scopeFromReq(req);
      const [tpl] = await rawQuery<{ entityType: string }>(
        `SELECT "entityType" FROM document_templates
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!tpl) throw new NotFoundError("template not found");
      // Pull the seeded preset row (`companyId IS NULL`) — that's the
      // shared "factory copy" of the template for the entity. If none is
      // seeded, fall back to the universal "fragment" the resolver uses.
      const [seeded] = await rawQuery<{ htmlContent: string | null; presetKey: string | null }>(
        `SELECT "htmlContent", "presetKey"
           FROM document_templates
          WHERE "companyId" IS NULL
            AND "entityType" = $1
            AND "presetKey" = 'classic'
            AND "deletedAt" IS NULL
          LIMIT 1`,
        [tpl.entityType],
      );
      const restoreHtml =
        seeded?.htmlContent ??
        `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0">{{entity.title}}</h2>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;
      await rawExecute(
        `UPDATE document_templates
            SET "htmlContent" = $1,
                mode = 'html',
                "updatedAt" = NOW()
          WHERE id = $2 AND "companyId" = $3`,
        [restoreHtml, id, scope.companyId],
      );
      res.json({
        ok: true,
        restoredFromPreset: seeded?.presetKey ?? "universal",
      });
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
  entityType: zEntityType,
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

router.get("/jobs", requireAnyPermission("print_jobs:read", "print:diagnostics:read"), async (req: Request, res: Response) => {
  try {
    const scope = scopeFromReq(req);
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const entityType = (req.query.entityType as string | undefined) ?? null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const from = (req.query.from as string | undefined) ?? null;
    const to = (req.query.to as string | undefined) ?? null;
    // status filter — accepts a single value or a comma-separated list so
    // ops can query e.g. ?status=failed to triage broken prints, or
    // ?status=success,failed to exclude pending. Whitelisted to known
    // values to keep the SQL clause well-defined.
    const statusRaw = (req.query.status as string | undefined) ?? null;
    const statusValues = statusRaw
      ? statusRaw.split(",")
          .map((s) => s.trim())
          .filter((s) => ["success", "failed", "pending", "queued"].includes(s))
      : null;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    const params: unknown[] = [scope.companyId];
    const where: string[] = [`pj."companyId" = $1`];
    // Non-owners are also branch-scoped: even with print_jobs:read, a
    // user limited to Branch A shouldn't see Branch B's print history.
    // Owners pass through unrestricted (allowedBranches is empty for them).
    if (!scope.isOwner && scope.allowedBranches && scope.allowedBranches.length > 0) {
      params.push(scope.allowedBranches);
      where.push(`(pj."branchId" IS NULL OR pj."branchId" = ANY($${params.length}::int[]))`);
    }
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
    if (statusValues && statusValues.length > 0) {
      params.push(statusValues);
      where.push(`pj."status" = ANY($${params.length}::text[])`);
    }
    // Total count under the same filters — drives the pager. We run this
     // before adding LIMIT/OFFSET params so the where clause is reused.
    const countRows = await rawQuery<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM print_jobs pj WHERE ${where.join(" AND ")}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    params.push(limit);
    params.push(offset);
    const rows = await rawQuery(
      `SELECT pj.id, pj."jobId", pj."entityType", pj."entityId", pj."format", pj."paperSize",
              pj."copyNumber", pj."isReprint", pj."watermark", pj."status", pj."createdAt",
              pj."pdfStorageKey", pj."approvedBy", pj."errorMessage",
              pj."branchId", b.name AS "branchName",
              pj."userId", u.email AS "userEmail",
              e.name AS "userName"
       FROM print_jobs pj
       LEFT JOIN branches b ON b.id = pj."branchId"
       LEFT JOIN users u ON u.id = pj."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${where.join(" AND ")}
       ORDER BY pj."createdAt" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ items: rows, total, limit, offset });
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

// CSV export of the print log under the same filters as GET /jobs. Capped
// at 10k rows because the UI offers no progress indicator — a larger
// export should be a server-side scheduled job, not an HTTP request.
router.get("/jobs.csv", requireAnyPermission("print_jobs:read", "print:diagnostics:read"), async (req: Request, res: Response) => {
  try {
    const scope = scopeFromReq(req);
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const entityType = (req.query.entityType as string | undefined) ?? null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const from = (req.query.from as string | undefined) ?? null;
    const to = (req.query.to as string | undefined) ?? null;
    const statusRaw = (req.query.status as string | undefined) ?? null;
    const statusValues = statusRaw
      ? statusRaw.split(",")
          .map((s) => s.trim())
          .filter((s) => ["success", "failed", "pending", "queued"].includes(s))
      : null;

    const params: unknown[] = [scope.companyId];
    const where: string[] = [`pj."companyId" = $1`];
    if (!scope.isOwner && scope.allowedBranches && scope.allowedBranches.length > 0) {
      params.push(scope.allowedBranches);
      where.push(`(pj."branchId" IS NULL OR pj."branchId" = ANY($${params.length}::int[]))`);
    }
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
    if (statusValues && statusValues.length > 0) {
      params.push(statusValues);
      where.push(`pj."status" = ANY($${params.length}::text[])`);
    }

    const rows = await rawQuery<{
      createdAt: string;
      userName: string | null;
      userEmail: string | null;
      branchName: string | null;
      entityType: string;
      entityId: string;
      format: string;
      copyNumber: number;
      isReprint: boolean;
      status: string;
      errorMessage: string | null;
    }>(
      `SELECT pj."createdAt", pj."entityType", pj."entityId", pj."format",
              pj."copyNumber", pj."isReprint", pj."status", pj."errorMessage",
              b.name AS "branchName", u.email AS "userEmail", e.name AS "userName"
       FROM print_jobs pj
       LEFT JOIN branches b ON b.id = pj."branchId"
       LEFT JOIN users u ON u.id = pj."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${where.join(" AND ")}
       ORDER BY pj."createdAt" DESC
       LIMIT 10000`,
      params
    );

    // CSV-quote a cell: wrap in double-quotes and double any embedded quote.
    // Also strip CR/LF so a malicious field can't inject new rows.
    const q = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/[\r\n]+/g, " ");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const header = [
      "createdAt", "user", "userEmail", "branch", "entityType",
      "entityId", "format", "copyNumber", "isReprint", "status", "errorMessage",
    ].join(",");

    const body = rows.map((r) => [
      q(r.createdAt), q(r.userName), q(r.userEmail), q(r.branchName),
      q(r.entityType), q(r.entityId), q(r.format), q(r.copyNumber),
      q(r.isReprint), q(r.status), q(r.errorMessage),
    ].join(",")).join("\n");

    // BOM so Excel detects UTF-8 (Arabic names render correctly).
    const csv = "﻿" + header + "\n" + body + "\n";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="print-log-${todayISO()}.csv"`);
    res.send(csv);
  } catch (err) {
    return handleRouteError(err, res, "print");
  }
});

router.get(
  "/jobs/:jobId/download",
  // Bytes of a previously-archived job. "print_jobs:read" is the legacy gate;
  // "print:download" is the granular gate from issue #1286 so owners can mint
  // a download-only role (downloads but cannot list other jobs).
  requireAnyPermission("print_jobs:read", "print:download"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      // jobId is bound as UUID in print_jobs.jobId. Validate up-front so an
      // unparseable input (e.g. /jobs/foo/download) returns a clean 400
      // instead of triggering "invalid input syntax for uuid" deep in pg.
      const jobId = String(req.params.jobId);
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(jobId)) {
        throw new ValidationError("invalid jobId");
      }
      const rows = await rawQuery<{
        format: string;
        pdfStorageKey: string | null;
        entityType: string;
        entityId: string;
        branchId: number | null;
      }>(
        `SELECT format, "pdfStorageKey", "entityType", "entityId", "branchId"
         FROM print_jobs WHERE "jobId" = $1 AND "companyId" = $2 LIMIT 1`,
        [jobId, scope.companyId]
      );
      if (!rows[0]) throw new NotFoundError("print_job");
      // Branch scoping: even with print_jobs:read, a user limited to
      // certain branches must not download artifacts from branches
      // they can't see. Owners + null-branch (company-wide) prints
      // pass through.
      if (
        !scope.isOwner
        && scope.allowedBranches && scope.allowedBranches.length > 0
        && rows[0].branchId !== null
        && !scope.allowedBranches.includes(rows[0].branchId)
      ) {
        throw new PrintPermissionError("هذه الوثيقة لا تخص الفرع المسموح لك بالوصول إليه");
      }
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
  entityType: zEntityType,
  entityId: zEntityId,
  // Reason is shown in the approver's queue + stored in the audit table —
  // 4000 chars is plenty for "العميل طلب نسخة لأن..." without letting an
  // attacker cram megabytes into print_reprint_requests.reason.
  reason: z.string().min(1).max(4000),
});

router.post("/reprint-requests", requirePermission("print:reprint:create"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(reprintBody.safeParse(req.body));
    const scope = scopeFromReq(req);
    // IGOC-002: tenant-isolate the reprint target. The endpoint accepts
    // arbitrary entityType + entityId — without an ownership check, an
    // attacker could request reprints for documents belonging to other
    // companies (entity numbers are sequential and guessable for many
    // domains: invoices, vouchers, contracts).
    //
    // The cleanest gate: a reprint request only makes sense if THIS
    // company has printed this entity before. The print_jobs table is
    // the canonical record of "we've printed this" — checking it as a
    // prerequisite also matches user intent (you reprint things you
    // printed, you /render new things). 404 hides cross-tenant ids.
    const [proof] = await rawQuery<{ id: number }>(
      `SELECT id FROM print_jobs
        WHERE "companyId" = $1 AND "entityType" = $2 AND "entityId" = $3
        LIMIT 1`,
      [scope.companyId, body.entityType, body.entityId],
    );
    if (!proof) {
      throw new NotFoundError("لا يوجد سجل طباعة سابق لهذا المستند في شركتك");
    }
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

// ─── Phase 7 — Archive history per entity ──────────────────────────────────
// Returns every document auto-archived from prints of the given
// (entityType, entityId). Powers the "Documents" tab on entity-detail
// pages so users see the printed copy alongside their uploads.
router.get(
  "/archive/:entityType/:entityId",
  // Admin view of archived jobs for a specific entity. Legacy +
  // granular gate per issue #1286 so an audit-only role can be limited
  // to archive lookups without seeing the entire print log.
  requireAnyPermission("print_jobs:read", "print:verify:read"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const entityType = String(req.params.entityType ?? "");
      const entityId = String(req.params.entityId ?? "");
      if (!/^[a-z][a-z0-9_]*$/.test(entityType) || !/^[A-Za-z0-9_\-./]+$/.test(entityId)) {
        throw new ValidationError("invalid entity reference");
      }
      // IGOC-002: same pattern as /reprint-requests — gate archive views
      // on "we've printed this in your company". Otherwise an attacker
      // could probe entity ids to enumerate competitor print history.
      // (listEntityPrints already filters by companyId so the archive
      // never RETURNS cross-tenant rows; this gate makes the 200 vs 404
      // boundary symmetric — same response shape regardless of whether
      // the id exists in another tenant.)
      const [proof] = await rawQuery<{ id: number }>(
        `SELECT id FROM print_jobs
          WHERE "companyId" = $1 AND "entityType" = $2 AND "entityId" = $3
          LIMIT 1`,
        [scope.companyId, entityType, entityId],
      );
      if (!proof) {
        // Return empty list rather than 404 — archive lookups are often
        // speculative ("did we print this?"). Empty == not in our archive.
        return res.json({ items: [] });
      }
      const { listEntityPrints } = await import("../lib/print/archive.js");
      const items = await listEntityPrints(scope.companyId, entityType, entityId);
      res.json({ items });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  },
);

// ─── Phase 9 — Delivery (one-shot send) ────────────────────────────────────
// Re-renders the document then dispatches via the chosen channel. The
// SPA already has the bytes from /render, but the server-side path lets
// scheduled jobs and the AI letter-drafting flow trigger a send without
// the SPA ever touching the document.
const deliveryBody = z.object({
  entityType: zEntityType,
  entityId: zEntityId,
  format: z.enum(["a4", "thermal_80", "thermal_58", "label", "excel"]).optional(),
  channel: z.enum(["download", "email", "whatsapp", "sms", "internal_inbox", "webhook"]),
  to: z.array(z.object({ address: z.string().min(1).max(500), name: z.string().max(120).optional() })).min(1).max(20),
  subject: z.string().max(500).optional(),
  body: z.string().max(10_000).optional(),
  locale: z.enum(["ar", "en"]).optional(),
  templateCode: z.string().max(120).optional(),
});

router.post(
  "/deliver",
  renderLimiter,
  requirePermission("print:create"),
  async (req: Request, res: Response) => {
    try {
      const body = zodParse(deliveryBody.safeParse(req.body));
      const scope = scopeFromReq(req);
      const result = await renderPrint(
        scope,
        {
          entityType: body.entityType,
          entityId: body.entityId,
          format: body.format,
        },
        { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
      );
      const { sendDocument } = await import("../lib/print/delivery.js");
      const deliveryResult = await sendDocument({
        channel: body.channel,
        to: body.to,
        document: {
          bytes: result.bytes,
          mime: result.mime,
          filename: result.filename,
          jobId: result.jobId,
        },
        subject: body.subject,
        body: body.body,
        locale: body.locale,
        templateCode: body.templateCode,
      });
      res.json({
        jobId: result.jobId,
        delivery: deliveryResult,
      });
    } catch (err) {
      if (err instanceof PrintPermissionError) return res.status(err.status).json({ error: err.message });
      if (err instanceof PrintApprovalRequiredError)
        return res.status(err.status).json({ error: err.message, copyNumber: err.copyNumber });
      if (err instanceof PrintTemplateMissingError)
        return res.status(err.status).json({ error: err.message });
      return handleRouteError(err, res, "print");
    }
  },
);

// ─── Phase 10 — Queue inspection ───────────────────────────────────────────
router.get(
  "/queue/:id",
  requirePermission("print_jobs:read"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const id = String(req.params.id ?? "");
      if (!/^[a-z0-9.\-]+$/i.test(id)) throw new ValidationError("invalid queue id");
      // IGOC-002: tenant-isolate queue lookups. Without this check, an
      // attacker could enumerate queue IDs to inspect print jobs from
      // other companies' tenants. Verify the queue id corresponds to a
      // print_jobs row in the caller's company BEFORE hitting the queue
      // backend — a 404 for cross-tenant ids hides their existence.
      const [ownership] = await rawQuery<{ id: number }>(
        `SELECT id FROM print_jobs WHERE "jobId"::text = $1 AND "companyId" = $2 LIMIT 1`,
        [id, scope.companyId],
      );
      if (!ownership) return res.status(404).json({ error: "not_found" });
      const { getBackend } = await import("../lib/print/queue.js");
      const job = await getBackend().getJob(id);
      if (!job) return res.status(404).json({ error: "not_found" });
      res.json({ job, backend: getBackend().name });
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  },
);

// ─── Phase 11 — AI helpers ─────────────────────────────────────────────────
// Behind RBAC because each call hits the configured LLM provider and
// therefore costs money. Limit to template-editor users.
const aiSuggestBody = z.object({
  entityType: zEntityType,
  sampleData: z.record(z.any()).optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
});

router.post(
  "/ai/suggest-template",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const body = zodParse(aiSuggestBody.safeParse(req.body));
      const { trySuggestTemplate } = await import("../lib/print/ai.js");
      const result = await trySuggestTemplate({
        entityType: body.entityType,
        sampleData: body.sampleData ?? {},
        locale: body.locale,
      });
      if (!result.ok) return res.status(503).json({ error: result.error });
      res.json(result.result);
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  },
);

router.post(
  "/ai/draft-letter",
  requirePermission("templates:write"),
  async (req: Request, res: Response) => {
    try {
      const draftBody = z.object({
        purpose: z.string().min(1).max(2000),
        addressee: z.string().min(1).max(500),
        facts: z.record(z.any()).optional(),
        locale: z.enum(["ar", "en"]).default("ar"),
        tone: z.enum(["formal", "warm", "stern"]).optional(),
      });
      const body = zodParse(draftBody.safeParse(req.body));
      const { tryDraftLetter } = await import("../lib/print/ai.js");
      const result = await tryDraftLetter({
        purpose: body.purpose,
        addressee: body.addressee,
        facts: body.facts ?? {},
        locale: body.locale,
        tone: body.tone,
      });
      if (!result.ok) return res.status(503).json({ error: result.error });
      res.json(result.result);
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  },
);

// ─── Retention — prune old PDFs from object storage ──────────────────────
//
// Audit rows in print_jobs are never deleted (regulatory). Only the
// rendered bytes are evicted from object storage and the pdfStorageKey
// column is cleared so re-runs don't re-scan the same rows.
//
// Gated by `print_jobs:read` (read-level access to the print log + manual
// cleanup of one's own company's artifacts). Owners + GMs are the
// expected callers via an admin button; a future cron can call this
// helper directly without going through HTTP.
router.post(
  "/jobs/prune",
  // Destructive — drops blob from object storage. "print_jobs:read" is the
  // legacy gate; "print:archive:manage" is the granular gate from issue
  // #1286 so owners can mint an "archive admin" role without granting read
  // access to the full print log.
  requireAnyPermission("print_jobs:read", "print:archive:delete"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const body = zodParse(z.object({
        daysToKeep: z.number().int().min(1).max(3650).default(90),
        maxPerRun: z.number().int().min(1).max(10_000).optional(),
        dryRun: z.boolean().optional(),
      }).safeParse(req.body));
      const { prunePrintArtifacts } = await import("../lib/print/retention.js");
      const result = await prunePrintArtifacts({
        daysToKeep: body.daysToKeep,
        maxPerRun: body.maxPerRun,
        dryRun: body.dryRun,
        // Non-owners are scoped to their own company; owners across
        // the whole platform would still see only their currentCompany
        // because scopeFromReq populates it from the JWT.
        companyId: scope.companyId,
      });
      res.json(result);
    } catch (err) {
      return handleRouteError(err, res, "print");
    }
  },
);

// GAP_MATRIX P0 — BI analytics pages (bi-admin-reports, bi-operations) use Ctrl+P
// but previously had no audit trail. This endpoint lets the frontend record the
// print event in print_jobs without going through the full render pipeline.
router.post(
  "/log-client-print",
  requirePermission("print:create"),
  async (req: Request, res: Response) => {
    try {
      const scope = scopeFromReq(req);
      const body = zodParse(
        z.object({
          entityType: z.string().min(1).max(128),
          entityId: z.number().int().optional().nullable(),
          format: z.enum(["a4", "thermal_80", "thermal_58", "label", "excel", "csv", "window_print"]).default("window_print"),
        }).safeParse(req.body)
      );
      const { insertId } = await rawExecute(
        `INSERT INTO print_jobs ("companyId","branchId","userId","entityType","entityId","format","status","ipAddress","userAgent")
         VALUES ($1,$2,$3,$4,$5,$6,'completed',$7,$8)`,
        [
          scope.companyId,
          scope.branchId ?? null,
          scope.userId,
          body.entityType,
          body.entityId ?? null,
          body.format,
          req.ip ?? null,
          req.headers["user-agent"] ?? null,
        ]
      );
      auditFromRequest(req, "print.client_print", "print_jobs", insertId, {
        after: { entityType: body.entityType, format: body.format },
      });
      res.status(201).json({ jobId: insertId });
    } catch (err) {
      return handleRouteError(err, res, "print log-client-print");
    }
  }
);

export default router;
