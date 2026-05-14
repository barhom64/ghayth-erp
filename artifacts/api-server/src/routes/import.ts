// import.ts
// ---------------------------------------------------------------------------
// General-purpose import endpoints — CSV/XLSX → core ERP entities.
// Companion to /umrah/import which stays Umrah-specific.
//
// Routes:
//   GET  /import/entities                     → list supported entity keys
//   GET  /import/template/:entity             → list expected columns + sample
//   POST /import/preview                      → dry-run, returns diff
//   POST /import/confirm                      → apply (transactional)
//   GET  /import/batches                      → list past batches
//   GET  /import/batches/:id                  → batch detail
//
// Auth: gated behind feature: "admin" because bulk import bypasses normal
// per-entity create flows. Per-entity action enforcement is delegated to the
// underlying engine (which respects companyId scoping). Same model the
// Umrah import uses — single feature, write actions only on confirm.
// ---------------------------------------------------------------------------

import { Router, type IRouter } from "express";
import { z } from "zod";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, zodParse } from "../lib/errorHandler.js";
import { rawQuery } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import {
  parseSpreadsheet,
  previewImport,
  confirmImport,
  listSupportedEntities,
  listBatches,
  type ImportScope,
  type ParsedRow,
} from "../lib/genericImportEngine.js";
import { ADAPTERS, type ImportEntity } from "../lib/importAdapters.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entityKeyOrThrow(s: unknown): ImportEntity {
  if (typeof s !== "string" || !(s in ADAPTERS)) {
    throw new ValidationError(
      `entity غير معروف. القيم المسموحة: ${listSupportedEntities().join(", ")}`,
    );
  }
  return s as ImportEntity;
}

function scopeFromReq(req: any): ImportScope {
  const scope = req.scope!;
  return {
    companyId: scope.companyId,
    branchId: scope.branchId ?? null,
    userId: scope.userId,
  };
}

async function rowsFromBody(
  body: { rows?: ParsedRow[]; fileBase64?: string },
  entity: ImportEntity,
): Promise<ParsedRow[]> {
  if (Array.isArray(body.rows)) return body.rows;
  if (!body.fileBase64) throw new ValidationError("rows أو fileBase64 مطلوب");
  let buf: Buffer;
  try {
    buf = Buffer.from(body.fileBase64, "base64");
  } catch (e) {
    logger.warn({ err: e }, "import: bad base64");
    throw new ValidationError("ملف base64 غير صحيح");
  }
  // 25 MB cap — generous for spreadsheets, prevents DoS on the parser.
  if (buf.length > 25 * 1024 * 1024) {
    throw new ValidationError("حجم الملف يتجاوز 25 ميجابايت");
  }
  // parseSpreadsheet is async since the xlsx → exceljs migration (Task #269);
  // the surrounding rowsFromBody is already async + returns Promise<ParsedRow[]>.
  return parseSpreadsheet(buf, entity);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const previewSchema = z.object({
  entity: z.string().min(1),
  // Either pre-parsed rows OR a base64-encoded file. Frontend may parse
  // client-side and send rows for fast iteration, OR ship the file and let
  // the server parse it. Both paths share the same validation + diff.
  rows: z.array(z.record(z.string(), z.any())).optional(),
  fileBase64: z.string().optional(),
  fileName: z.string().optional(),
}).refine((d) => Array.isArray(d.rows) || typeof d.fileBase64 === "string", {
  message: "إما rows أو fileBase64 مطلوب",
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get(
  "/entities",
  authorize({ feature: "admin", action: "view" }),
  (_req, res) => {
    const list = listSupportedEntities().map((entity) => ({
      entity,
      table: ADAPTERS[entity].table,
      uniqueField: ADAPTERS[entity].uniqueField ?? null,
      requiredFields: ADAPTERS[entity].required,
      hasCompanyId: ADAPTERS[entity].hasCompanyId,
    }));
    res.json({ data: list, total: list.length });
  },
);

router.get(
  "/template/:entity",
  authorize({ feature: "admin", action: "view" }),
  (req, res) => {
    try {
      const entity = entityKeyOrThrow(req.params.entity);
      const a = ADAPTERS[entity];
      // Return the first alias of each header pipe group as the canonical
      // column name to put in the operator's template.
      const columns = Object.entries(a.headerMap).map(([aliases, field]) => {
        const arabicAlias = aliases.split("|")[0]!;
        return {
          arabic: arabicAlias,
          field,
          type: a.fieldTypes[field],
          required: a.required.includes(field),
          aliases: aliases.split("|"),
        };
      });
      res.json({
        entity,
        table: a.table,
        uniqueField: a.uniqueField ?? null,
        requiredFields: a.required,
        columns,
      });
    } catch (err) {
      handleRouteError(err, res, "Import template error");
    }
  },
);

router.post(
  "/preview",
  authorize({ feature: "admin", action: "view" }),
  async (req, res): Promise<void> => {
    try {
      const body = zodParse(previewSchema.safeParse(req.body));
      const entity = entityKeyOrThrow(body.entity);
      const scope = scopeFromReq(req);
      const rows = await rowsFromBody(body, entity);
      const diff = await previewImport(scope, entity, rows);
      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "preview",
        entity: ADAPTERS[entity].table,
        entityId: 0,
        after: { entity, rows: rows.length, fileName: body.fileName ?? null },
      }).catch((e) => logger.error(e, "import preview audit failed"));
      res.json(diff);
    } catch (err) {
      handleRouteError(err, res, "Import preview error");
    }
  },
);

router.post(
  "/confirm",
  authorize({ feature: "admin", action: "create" }),
  async (req, res): Promise<void> => {
    try {
      const body = zodParse(previewSchema.safeParse(req.body));
      const entity = entityKeyOrThrow(body.entity);
      const scope = scopeFromReq(req);
      const rows = await rowsFromBody(body, entity);
      const fileMeta = body.fileName
        ? { fileName: body.fileName, fileSize: body.fileBase64?.length }
        : undefined;
      const result = await confirmImport(scope, entity, rows, fileMeta);
      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "import",
        entity: ADAPTERS[entity].table,
        entityId: (result as { batchId?: number })?.batchId ?? 0,
        after: { entity, rows: rows.length, fileName: body.fileName ?? null, result },
      }).catch((e) => logger.error(e, "import confirm audit failed"));
      res.json({ success: true, ...result });
    } catch (err) {
      handleRouteError(err, res, "Import confirm error");
    }
  },
);

router.get(
  "/batches",
  authorize({ feature: "admin", action: "view" }),
  async (req, res): Promise<void> => {
    try {
      const entityRaw = (req.query.entity as string | undefined) ?? undefined;
      const entity = entityRaw ? entityKeyOrThrow(entityRaw) : undefined;
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const data = await listBatches(scopeFromReq(req), entity, limit);
      res.json(maskFields(req, { data, total: data.length }));
    } catch (err) {
      handleRouteError(err, res, "Import batches error");
    }
  },
);

router.get(
  "/batches/:id",
  authorize({ feature: "admin", action: "view" }),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw new ValidationError("id غير صحيح");
      const scope = scopeFromReq(req);
      const [batch] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM import_batches
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!batch) {
        res.status(404).json({ error: "batch not found" });
        return;
      }
      res.json(maskFields(req, batch));
    } catch (err) {
      handleRouteError(err, res, "Import batch detail error");
    }
  },
);

export default router;
