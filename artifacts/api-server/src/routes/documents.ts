import { Router, type Request, type Response } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { Readable } from "stream";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { handleRouteError, ValidationError, NotFoundError, ForbiddenError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { APPROVE_ROLES } from "../lib/rbacCatalog.js";

/* ── Zod Schemas ────────────────────────────────────────────── */

const createDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
  department: z.string().optional(),
  folder: z.string().optional(),
});

const entityLinkItem = z.object({
  entityType: z.string().min(1),
  entityId: z.union([z.coerce.number().int(), z.string()]),
});

const uploadDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fileName: z.string().min(1),
  fileSize: z.coerce.number().optional(),
  mimeType: z.string().optional(),
  category: z.string().optional(),
  storageKey: z.string().min(1),
  entityLinks: z.array(entityLinkItem).optional(),
});

const createVersionSchema = z.object({
  fileName: z.string().optional(),
  fileSize: z.coerce.number().optional(),
  mimeType: z.string().optional(),
  storageKey: z.string().optional(),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["draft", "approved", "cancelled"]),
});

const createEntityLinkSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.union([z.coerce.number().int(), z.string()]),
});

const createFolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.coerce.number().optional(),
  color: z.string().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.string().min(1),
  category: z.string().optional(),
  type: z.string().optional(),
  variables: z.array(z.unknown()).optional(),
  htmlContent: z.string().optional(),
  branchId: z.coerce.number().optional(),
  signatureUrl: z.string().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  variables: z.array(z.unknown()).optional(),
  htmlContent: z.string().optional(),
  branchId: z.coerce.number().optional(),
  signatureUrl: z.string().optional(),
  isActive: z.boolean().optional(),
});

const generateTemplateSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.union([z.coerce.number(), z.string()]).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
});

const patchDocumentSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  fileName: z.string().optional(),
  fileUrl: z.string().optional(),
  folderId: z.coerce.number().nullable().optional(),
  tags: z.unknown().optional(),
});

const router = Router();

const objectStorageService = new ObjectStorageService();

router.get("/", requirePermission("documents:read"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { entity, entityId, category, status: docStatus } = req.query;

    if (entity && entityId) {
      const rows = await rawQuery(
        `SELECT d.* FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
         WHERE del."entityType" = $1 AND del."entityId" = $2
         AND (d."companyId" = $3 OR d."companyId" IS NULL) AND d."deletedAt" IS NULL
         ORDER BY d."createdAt" DESC LIMIT 500`,
        [entity, Number(entityId), scope.companyId]
      );
      res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
      return;
    }

    let where = `WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];

    if (category) {
      params.push(category);
      where += ` AND category=$${params.length}`;
    }
    if (docStatus) {
      params.push(docStatus);
      where += ` AND status=$${params.length}`;
    }

    const rows = await rawQuery(`SELECT * FROM documents ${where} ORDER BY "createdAt" DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/", requirePermission("documents:create"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(createDocumentSchema.safeParse(req.body));
    const scope = req.scope!;
    const { title, description, type, category, status, department, folder } = body;
    if (!String(title).trim()) {
      throw new ValidationError("عنوان المستند مطلوب", {
        field: "title",
        fix: "أدخل عنواناً واضحاً للمستند",
      });
    }
    const resolvedCategory = category || type || "document";
    const r = await rawExecute(
      `INSERT INTO documents (title, description, category, "fileName", "storageKey", "companyId", "uploadedBy", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [String(title).trim(), description || null, resolvedCategory, folder || String(title).trim(), `doc-${Date.now()}`, scope.companyId, scope.userId, status]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "documents", entityId: r.insertId,
      after: { title, type: type || "document", department: department ?? null },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.document.created",
      entity: "documents",
      entityId: r.insertId,
      details: JSON.stringify({ title, type: type || "document" }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, title, type, department });
  } catch (err) { handleRouteError(err, res, "Create document error:"); }
});

router.post("/upload", requirePermission("documents:create"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(uploadDocumentSchema.safeParse(req.body));
    const scope = req.scope!;
    const { title, description, fileName, fileSize, mimeType, category, storageKey, entityLinks } = body;

    const ALLOWED_ENTITY_TYPES = ["employee", "client", "project", "invoice", "vehicle"];
    if (entityLinks && Array.isArray(entityLinks)) {
      for (const link of entityLinks) {
        if (!link.entityType || !ALLOWED_ENTITY_TYPES.includes(link.entityType) || !Number.isInteger(Number(link.entityId))) {
          throw new ValidationError(`Invalid entity link: type must be one of ${ALLOWED_ENTITY_TYPES.join(", ")} and entityId must be an integer`);
        }
      }
    }

    let docId!: number;
    await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO documents (title, description, "fileName", "fileSize", "mimeType", category, status, "storageKey", "currentVersion", "uploadedBy", "companyId")
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,1,$8,$9) RETURNING id`,
        [title, description, fileName, fileSize, mimeType, category || null, storageKey, scope.userId, scope.companyId]
      );
      docId = r.rows[0].id;

      await client.query(
        `INSERT INTO document_versions ("documentId", "versionNumber", "fileName", "fileSize", "mimeType", "storageKey", "uploadedBy")
         VALUES ($1, 1, $2, $3, $4, $5, $6)`,
        [docId, fileName, fileSize, mimeType, storageKey, scope.userId]
      );

      if (entityLinks && Array.isArray(entityLinks)) {
        for (const link of entityLinks) {
          await client.query(
            `INSERT INTO document_entity_links ("documentId", "entityType", "entityId") VALUES ($1, $2, $3)
             ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING`,
            [docId, link.entityType, link.entityId]
          );
        }
      }
    });

    const [doc] = await rawQuery(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [docId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "documents", entityId: docId,
      after: { title, fileName, category: category || null },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.document.uploaded",
      entity: "documents",
      entityId: docId,
      details: JSON.stringify({ title, fileName, category: category || null }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.status(201).json(doc);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/:id/download", requirePermission("documents:download"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [doc] = await rawQuery<any>(
      `SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    if (!doc.storageKey) {
      throw new NotFoundError("لا يوجد ملف مرفق");
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(doc.storageKey);
      const response = await objectStorageService.downloadObject(objectFile);

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName || 'file')}"`);
      if (doc.mimeType) res.setHeader("Content-Type", doc.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(response.status);

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (e) {
      logger.error(e, "document download: file not found in storage");
      throw new NotFoundError("الملف غير موجود في التخزين");
    }
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// Inline preview — serves the file with `Content-Disposition: inline` so the
// browser renders it directly (PDF viewer, image, etc.) instead of downloading.
// Used by the frontend <AttachmentPreview> component for side-panel preview
// without leaving the current page. Same scope + permission checks as
// /download, but skips the attachment header so browsers embed the content.
router.get("/:id/preview", requirePermission("documents:download"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [doc] = await rawQuery<any>(
      `SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");
    if (!doc.storageKey) throw new NotFoundError("لا يوجد ملف مرفق");

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(doc.storageKey);
      const response = await objectStorageService.downloadObject(objectFile);

      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName || 'file')}"`);
      if (doc.mimeType) res.setHeader("Content-Type", doc.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.status(response.status);

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (e) {
      logger.error(e, "document preview: file not found in storage");
      throw new NotFoundError("الملف غير موجود في التخزين");
    }
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// P02-S4-HIGH — `POST /:id/versions` used to read documents with the
// `("companyId"=$2 OR "companyId" IS NULL)` filter (so global system
// documents passed the precheck) and then UPDATE by raw `id` with no
// scope filter at all. That meant any tenant's user with the
// `documents:create` permission could POST a new version against a
// global system document and rewrite its `fileName`/`storageKey`/
// `mimeType` — redirecting every other tenant's downloads of that
// system document to attacker-controlled storage. Tightening both the
// precheck and the UPDATE to caller's company only; new versions of
// global/system documents must be created as company-owned documents
// via the regular create flow, not by mutating shared rows.
router.post("/:id/versions", requirePermission("documents:create"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(createVersionSchema.safeParse(req.body));
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const { fileName, fileSize, mimeType, storageKey, notes } = body;

    const [doc] = await rawQuery<any>(
      `SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    const newVersion = (doc.currentVersion || 1) + 1;

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO document_versions ("documentId", "versionNumber", "fileName", "fileSize", "mimeType", "storageKey", "uploadedBy", notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [docId, newVersion, fileName, fileSize, mimeType, storageKey, scope.userId, notes || null]
      );

      await client.query(
        `UPDATE documents SET "currentVersion"=$1, "fileName"=$2, "fileSize"=$3, "mimeType"=$4, "storageKey"=$5, "updatedAt"=NOW() WHERE id=$6 AND "companyId"=$7 AND "deletedAt" IS NULL`,
        [newVersion, fileName, fileSize, mimeType, storageKey, docId, scope.companyId]
      );
    });

    const [updated] = await rawQuery(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [docId, scope.companyId]);
    if (!updated) throw new NotFoundError("فشل في استرجاع المستند");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "document_versions", entityId: docId,
      after: { versionNumber: newVersion, fileName, storageKey },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.version.created",
      entity: "documents",
      entityId: docId,
      details: JSON.stringify({ version: newVersion, fileName }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/:id/versions", requirePermission("documents:read"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const [doc] = await rawQuery<any>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    const versions = await rawQuery(
      `SELECT * FROM document_versions WHERE "documentId"=$1 ORDER BY "versionNumber" DESC LIMIT 500`,
      [docId]
    );
    res.json({ data: versions });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.patch("/:id/status", requirePermission("documents:update"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(updateStatusSchema.safeParse(req.body));
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const { status } = body;

    if (status === "approved" && !scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      throw new ForbiddenError("ليس لديك صلاحية اعتماد المستندات");
    }

    const [beforeDoc] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [docId, scope.companyId]);
    if (!beforeDoc) throw new NotFoundError("المستند غير موجود");

    const result = await rawExecute(
      `UPDATE documents SET status=$1, "updatedAt"=NOW() WHERE id=$2 AND ("companyId"=$3 OR "companyId" IS NULL) AND status != $1 AND "deletedAt" IS NULL`,
      [status, docId, scope.companyId]
    );
    if (result.affectedRows === 0 && beforeDoc.status === status) throw new ConflictError("المستند في هذه الحالة مسبقاً");
    if (result.affectedRows === 0) throw new ConflictError("تم تحديث المستند مسبقاً — أعد التحميل");

    const CATEGORY_EFFECTS: Record<string, string> = {
      contracts: "التزام قانوني/مالي",
      financial: "ذمة مالية",
      official: "إجراء رسمي",
      hr: "تحديث ملف موظف",
      legal: "التزام قانوني",
    };

    const impact = status === "approved" && beforeDoc.category ? CATEGORY_EFFECTS[beforeDoc.category] || null : null;

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "documents", entityId: docId,
      before: { status: beforeDoc.status },
      after: { status, impact: impact || undefined },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.document.status_changed",
      entity: "documents",
      entityId: docId,
      details: JSON.stringify({ from: beforeDoc.status, to: status }),
    }).catch((e) => logger.error(e, "documents background task failed"));

    const [doc] = await rawQuery(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [docId, scope.companyId]);
    res.json({ ...(doc as any), impact });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/:id/entity-links", requirePermission("documents:update"), async (req: Request, res: Response) => {
  try {
    const body = zodParse(createEntityLinkSchema.safeParse(req.body));
    const scope = req.scope!;
    const { entityType, entityId } = body;
    const docId = parseId(req.params.id, "id");

    const [doc] = await rawQuery<any>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    await rawExecute(
      `INSERT INTO document_entity_links ("documentId", "entityType", "entityId") VALUES ($1, $2, $3)
       ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING`,
      [docId, entityType, entityId]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "document_entity_links", entityId: docId,
      after: { entityType, entityId },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.entity_link.created",
      entity: "document_entity_links",
      entityId: docId,
      details: JSON.stringify({ entityType, entityId }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json({ message: "تم الربط بنجاح" });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/:id/entity-links", requirePermission("documents:read"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");

    const [doc] = await rawQuery<any>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    const links = await rawQuery(
      `SELECT * FROM document_entity_links WHERE "documentId"=$1 LIMIT 500`,
      [docId]
    );
    res.json({ data: links });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/folders", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/folders", requirePermission("documents:create"), async (req, res) => {
  try {
    const body = zodParse(createFolderSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, parentId, color } = body;
    if (!String(name).trim()) {
      throw new ValidationError("اسم المجلد مطلوب", {
        field: "name",
        fix: "أدخل اسماً للمجلد",
      });
    }
    if (parentId) {
      const [parent] = await rawQuery<{ id: number }>(
        `SELECT id FROM document_folders WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
        [Number(parentId), scope.companyId]
      );
      if (!parent) {
        throw new ValidationError(`المجلد الأب رقم ${parentId} غير موجود`, {
          field: "parentId",
          fix: "اختر مجلد أب مسجلاً أو اتركه فارغاً",
        });
      }
    }
    const r = await rawExecute(
      `INSERT INTO document_folders (name, "parentId", color, "companyId") VALUES ($1,$2,$3,$4)`,
      [String(name).trim(), parentId ? Number(parentId) : null, color ?? null, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "document_folders", entityId: r.insertId,
      after: { name, parentId: parentId ? Number(parentId) : null, color: color ?? null },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.folder.created",
      entity: "document_folders",
      entityId: r.insertId,
      details: JSON.stringify({ name }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM document_folders WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, name, parentId: parentId ? Number(parentId) : null });
  } catch (err) { handleRouteError(err, res, "Create folder error:"); }
});

router.get("/templates", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM document_templates WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(rows);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/templates/:id", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("القالب غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/templates", requirePermission("documents:create"), async (req, res) => {
  try {
    const body = zodParse(createTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, description, content, category, type, variables, htmlContent, branchId, signatureUrl } = body;
    if (!String(name).trim()) {
      throw new ValidationError("اسم القالب مطلوب", {
        field: "name",
        fix: "أدخل اسماً للقالب",
      });
    }
    if (!content || !String(content).trim()) {
      throw new ValidationError("محتوى القالب مطلوب", {
        field: "content",
        fix: "اكتب نص القالب (يمكن استخدام {{placeholder}} للحقول القابلة للتعبئة)",
      });
    }
    const r = await rawExecute(
      `INSERT INTO document_templates (name, description, content, category, "type", "variables", "htmlContent", "branchId", "signatureUrl", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [String(name).trim(), description ?? null, String(content), category ?? null, type || 'letter', JSON.stringify(variables || []), htmlContent || '', branchId || null, signatureUrl || null, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "document_templates", entityId: r.insertId,
      after: { name, type: type || "letter", category: category ?? null },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.template.created",
      entity: "document_templates",
      entityId: r.insertId,
      details: JSON.stringify({ name, type: type || "letter" }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, name, type: type || "letter" });
  } catch (err) { handleRouteError(err, res, "Create template error:"); }
});

// P02-S4-MED — both PUT and DELETE on /templates/:id used to read the
// template with no scope filter and only blocked two of the four
// possible (companyId, isDefault) combinations:
//   - global default (companyId IS NULL, isDefault=true)  → 403 ✓
//   - other tenant's private (companyId !== caller)       → 403 ✓
//   - global non-default (companyId IS NULL, isDefault=false) → fell through!
//   - own company's template                              → allowed ✓
//
// The third case meant any user with documents:update / documents:delete
// could mutate or delete globally-shared non-default templates, leaking
// across every tenant that consumed them — same shared-row supply-chain
// pattern as the documents.ts:151 fix in the previous PR. Collapse the
// guard to "must own the template" (companyId IS NULL is always
// rejected, regardless of isDefault) and scope the actual UPDATE /
// DELETE / SELECT-back to the caller's company.
router.put("/templates/:id", requirePermission("documents:update"), async (req, res) => {
  try {
    const body = zodParse(updateTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (isNaN(id) || id <= 0) throw new ValidationError("معرف القالب غير صالح");
    const { name, description, content, category, type, variables, htmlContent, branchId, signatureUrl, isActive } = body;
    const [existing] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("القالب غير موجود");
    await rawExecute(
      `UPDATE document_templates SET name=$1, description=$2, content=$3, category=$4, "type"=$5, "variables"=$6, "htmlContent"=$7, "branchId"=$8, "signatureUrl"=$9, "isActive"=$10, "updatedAt"=NOW() WHERE id=$11 AND "companyId"=$12 AND "deletedAt" IS NULL`,
      [name, description, content, category, type, JSON.stringify(variables || []), htmlContent, branchId || null, signatureUrl || null, isActive !== false, id, scope.companyId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "document_templates", entityId: id,
      after: { name, description, category, type },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.template.updated",
      entity: "document_templates",
      entityId: id,
      details: JSON.stringify({ name }),
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json(row);
  } catch (e: any) { handleRouteError(e, res, "Update document template error"); }
});

router.delete("/templates/:id", requirePermission("documents:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (isNaN(id) || id <= 0) throw new ValidationError("معرف القالب غير صالح");
    const [existing] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("القالب غير موجود");
    await rawExecute(`UPDATE document_templates SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "document_templates", entityId: id,
      after: { name: existing.name },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.template.deleted",
      entity: "document_templates",
      entityId: id,
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json({ message: "تم حذف القالب بنجاح" });
  } catch (e: any) { handleRouteError(e, res, "Delete document template error"); }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fillTemplate(htmlContent: string, data: Record<string, any>): string {
  return htmlContent.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const parts = key.split(".");
    let value: any = data;
    for (const part of parts) {
      if (value == null) return match;
      value = value[part];
    }
    return value != null ? escapeHtml(String(value)) : match;
  });
}

function buildDateContext() {
  const now = new Date();
  const todayGregorian = now.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric", calendar: "gregory" });
  let todayHijri = "";
  try {
    todayHijri = now.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric", calendar: "islamic-umalqura" });
  } catch (e) { logger.warn(e, "Hijri date conversion failed, falling back to Gregorian"); todayHijri = todayGregorian; }
  return { today: todayGregorian, todayHijri };
}

router.post("/templates/:id/generate", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [template] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!template) throw new NotFoundError("القالب غير موجود");

    const generateBody = zodParse(generateTemplateSchema.safeParse(req.body));
    const { entityType, entityId, customData } = generateBody;
    let entityData: Record<string, any> = {};

    if (entityType === "employee" && entityId) {
      // P02-S6-HIGH — this SELECT used to filter only on `e.id=$1`, with
      // no `companyId` scope on employees or employee_assignments. Any
      // user with `documents:read` could pass `entityType=employee` and a
      // foreign tenant's employee id, and the route would render that
      // employee's name, ID number, salary, allowances, phone, email,
      // hire date, branch and department into the template HTML — a
      // cross-tenant PII / payroll leak. Scope the join through the
      // assignment so we only ever fetch employees the caller's company
      // actually employs (matches the invoice branch below which already
      // filters by `i."companyId"=$2`).
      const [emp] = await rawQuery<any>(`
        SELECT e.*, ea."jobTitle", ea."hireDate", ea."endDate",
               ec.salary, ec."housingAllowance", ec."transportAllowance",
               d.name as "departmentName", b.name as "branchName"
        FROM employees e
        JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active' AND ea."companyId" = $2
        LEFT JOIN employee_contracts ec ON ec."assignmentId" = ea.id AND ec."deletedAt" IS NULL AND ec.status = 'active'
        LEFT JOIN departments d ON d.id = ea."departmentId"
        LEFT JOIN branches b ON b.id = ea."branchId"
        WHERE e.id=$1
        ORDER BY ea."hireDate" DESC LIMIT 1
      `, [Number(entityId), scope.companyId]);
      if (emp) {
        entityData.employee = {
          name: emp.name,
          empNumber: emp.empNumber || emp.id,
          jobTitle: emp.jobTitle || "",
          departmentName: emp.departmentName || "",
          branchName: emp.branchName || "",
          nationality: emp.nationality || "",
          idNumber: emp.nationalId || "",
          phone: emp.phone || "",
          email: emp.email || "",
          hireDate: emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("ar-SA") : "",
          endDate: emp.endDate ? new Date(emp.endDate).toLocaleDateString("ar-SA") : "",
          status: emp.status || "",
        };
        entityData.salary = {
          basic: Number(emp.salary || 0),
          housing: Number(emp.housingAllowance || 0),
          transport: Number(emp.transportAllowance || 0),
          total: Number(emp.salary || 0) + Number(emp.housingAllowance || 0) + Number(emp.transportAllowance || 0),
        };
      }
    }

    if (entityType === "invoice" && entityId) {
      const [inv] = await rawQuery<any>(`
        SELECT i.*, c.name as "clientName", c.email as "clientEmail", c.phone as "clientPhone"
        FROM invoices i
        LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
        WHERE i.id=$1 AND i."companyId"=$2 AND i."deletedAt" IS NULL
      `, [Number(entityId), scope.companyId]);
      if (inv) {
        entityData.client = {
          name: inv.clientName || "",
          email: inv.clientEmail || "",
          phone: inv.clientPhone || "",
          company: inv.clientName || "",
        };
        entityData.quotation = {
          ref: inv.ref || `INV-${inv.id}`,
          subtotal: Number(inv.subtotal || inv.total || 0),
          vat: Number(inv.vatAmount || 0),
          total: Number(inv.total || 0),
          validUntil: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("ar-SA") : "",
          notes: inv.notes || "",
          items: "",
        };
      }
    }

    const [company] = await rawQuery<any>(`SELECT * FROM companies WHERE id=$1`, [scope.companyId]);
    entityData.company = { name: company?.name || "", nameEn: company?.nameEn || "" };
    entityData.date = buildDateContext();

    if (customData) {
      for (const [key, value] of Object.entries(customData)) {
        const parts = key.split(".");
        if (parts.length === 2) {
          if (!entityData[parts[0]]) entityData[parts[0]] = {};
          entityData[parts[0]][parts[1]] = value;
        } else {
          entityData[key] = value;
        }
      }
    }

    const htmlContent = template.htmlContent || template.content || "";
    const filledHtml = fillTemplate(htmlContent, entityData);

    let branchData = null;
    const branchId = template.branchId || scope.branchId;
    if (branchId) {
      const [branch] = await rawQuery<any>(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [branchId, scope.companyId]);
      if (branch) {
        branchData = {
          name: branch.name,
          nameEn: branch.nameEn,
          logoUrl: branch.logoUrl,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          website: branch.website,
          taxNumber: branch.taxNumber,
          crNumber: branch.crNumber,
          footerText: branch.footerText,
          city: branch.city,
        };
      }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "documents", entityId: id,
      after: { templateName: template.name, entityType, entityId },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.template.generated",
      entity: "documents",
      entityId: id,
      details: JSON.stringify({ templateName: template.name, entityType, entityId }),
    }).catch((e) => logger.error(e, "documents background task failed"));

    res.json({
      html: filledHtml,
      templateName: template.name,
      branch: branchData,
      signatureUrl: template.signatureUrl,
      variables: entityData,
    });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/templates/:id/variables", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [template] = await rawQuery<any>(`SELECT variables FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!template) throw new NotFoundError("القالب غير موجود");
    let variables = [];
    try { variables = typeof template.variables === "string" ? JSON.parse(template.variables) : (template.variables || []); } catch (e) { logger.warn(e, "failed to parse template variables JSON"); variables = []; }
    res.json({ variables });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/stats", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [docs] = await rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]);
    const [folders] = await rawQuery(`SELECT COUNT(*) as count FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [templates] = await rawQuery(`SELECT COUNT(*) as count FROM document_templates WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [drafts] = await rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL AND status='draft'`, [cid]);
    const [approved] = await rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL AND status='approved'`, [cid]);
    res.json({
      totalDocuments: Number(docs.count),
      totalFolders: Number(folders.count),
      totalTemplates: Number(templates.count),
      draftDocuments: Number(drafts.count),
      approvedDocuments: Number(approved.count),
    });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/:id", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المستند غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.patch("/:id", requirePermission("documents:update"), async (req, res) => {
  try {
    const b = zodParse(patchDocumentSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.category !== undefined) { params.push(b.category); sets.push(`category=$${params.length}`); }
    if (b.fileName !== undefined) { params.push(b.fileName); sets.push(`"fileName"=$${params.length}`); }
    if (b.fileUrl !== undefined) { params.push(b.fileUrl); sets.push(`"fileUrl"=$${params.length}`); }
    if (b.folderId !== undefined) { params.push(b.folderId); sets.push(`"folderId"=$${params.length}`); }
    if (b.tags !== undefined) { params.push(b.tags); sets.push(`tags=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE documents SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (result.affectedRows === 0) throw new NotFoundError("المستند غير موجود");
    const [row] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "documents", entityId: id,
      after: { title: b.title, description: b.description, category: b.category, fileName: b.fileName },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.document.updated",
      entity: "documents",
      entityId: id,
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.delete("/:id", requirePermission("documents:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await rawExecute(`UPDATE documents SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("المستند غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "documents", entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "documents background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.document.deleted",
      entity: "documents",
      entityId: id,
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json({ message: "تم حذف المستند بنجاح" });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

export default router;
