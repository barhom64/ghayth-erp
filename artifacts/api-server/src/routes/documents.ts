import { Router, type Request, type Response } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { checkDocumentAcl } from "../lib/documentAcl.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { handleRouteError, ValidationError, NotFoundError, ForbiddenError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { APPROVE_ROLES } from "../lib/rbacCatalog.js";

// Local row shapes for the documents tables. Not in @workspace/db schema.

// Columns not explicitly typed here arrive as `unknown` from rawQuery; the
// signature `[k: string]: unknown` keeps backward compatibility for callers
// that read ad-hoc fields, while the listed fields preserve their concrete
// type for the hot paths in this file (download, template fill, etc).
interface DocumentRow {
  id: number;
  companyId?: number | null;
  branchId?: number | null;
  title: string;
  description?: string | null;
  type?: string | null;
  category?: string | null;
  status: string;
  department?: string | null;
  folder?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  storageKey?: string | null;
  currentVersion?: number | null;
  uploadedBy?: number | null;
  approvedBy?: number | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
  [k: string]: unknown;
}

interface DocumentFolderRow {
  id: number;
  companyId: number;
  name: string;
  parentId?: number | null;
  description?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

interface DocumentTemplateRow extends Record<string, unknown> {
  id: number;
  companyId?: number | null;
  name: string;
  category?: string | null;
  type?: string | null;
  body?: string | null;
  variables?: unknown;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

interface EmployeeContext extends Record<string, unknown> {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface InvoiceContext extends Record<string, unknown> {
  id: number;
  ref?: string | null;
  total: number | string;
  status: string;
}

interface CompanyContext extends Record<string, unknown> {
  id: number;
  name: string;
}

interface BranchContext extends Record<string, unknown> {
  id: number;
  name: string;
  companyId: number;
}

/* ── Zod Schemas ────────────────────────────────────────────── */

// N12 fix: taxonomy enforcement on document classification. Previously
// `category` was a free string, so /documents could end up with rows
// like "hr", "HR", "Hr", "human resources", "إدارة الموارد البشرية" all
// nominally meaning the same thing — making any "documents grouped by
// category" report or search filter useless.
//
// The enum below is the canonical list. Existing rows with non-enum
// values are untouched (old DB writes were not validated); the
// validator below catches new writes only. To rename a category later,
// migrate the data first, then add an `.transform()` here.
export const DOCUMENT_CATEGORIES = [
  "hr",
  "finance",
  "legal",
  "contracts",
  "compliance",
  "operations",
  "fleet",
  "properties",
  "umrah",
  "marketing",
  "general",
] as const;
// تصنيف المستند: إمّا فئة مسار من DOCUMENT_CATEGORIES (تقود فترة الحفظ في
// RETENTION_HORIZONS_YEARS أدناه)، أو **نوع مستند دقيق** خاص بمسار — مرفقات
// العقارات/العمرة تستخدم قيمًا دقيقة (property_photo · title_deed · payment_receipt …)
// مشروعة وتُعرض في الواجهة. كان z.enum يرفض هذه الدقيقة فيفشل رفعها (Invalid enum)؛
// خُفِّف إلى نص مقيَّد. الكنس (retention/backfill) يطبّق الآفاق على فئات المسار المعروفة
// فقط، فالقيم الدقيقة تُحفَظ تحفّظيًّا بلا كنس آلي (لا حذف مبكّر — آمن).
// DOCUMENT_CATEGORIES يبقى المرجع المعتمد لفئات المسار وخريطة الحفظ.
const documentCategorySchema = z.string().trim().max(64).optional();

// M5 retention policy enforcement on document write paths. Maps
// category → default retention horizon (years). The cron at retention-
// sweep time computes retentionUntil = createdAt + horizon if the
// document doesn't carry an explicit value.
//
// Horizons chosen to match Saudi compliance defaults:
//   - finance / contracts: 10 years (ZATCA 6y minimum, finance Best
//     Practice 10y)
//   - hr / legal / compliance: 7 years (Saudi labour law + statute of
//     limitations)
//   - operations / fleet / properties / umrah / marketing: 5 years
//     (operational reference)
//   - general: 3 years (no specific legal hold)
export const RETENTION_HORIZONS_YEARS: Record<string, number> = {
  finance: 10,
  contracts: 10,
  hr: 7,
  legal: 7,
  compliance: 7,
  operations: 5,
  fleet: 5,
  properties: 5,
  umrah: 5,
  marketing: 5,
  general: 3,
};

const createDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().optional(),
  category: documentCategorySchema,
  status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
  department: z.string().optional(),
  folder: z.string().optional(),
  retentionUntil: z.string().optional(),
  retentionPolicy: z.string().max(40).optional(),
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
  category: documentCategorySchema,
  storageKey: z.string().min(1),
  retentionUntil: z.string().optional(),
  retentionPolicy: z.string().max(40).optional(),
  // SHA-256 of the file content, computed client-side at upload (the server
  // never sees the bytes in the direct-to-storage flow). Enables exact-content
  // duplicate detection even when a file is renamed. Optional/best-effort.
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  entityLinks: z.array(entityLinkItem).optional(),
});

const createVersionSchema = z.object({
  fileName: z.string().optional(),
  fileSize: z.coerce.number().optional(),
  mimeType: z.string().optional(),
  storageKey: z.string().optional(),
  notes: z.string().optional(),
});

// Per-link attachment review decision. The verdict lives on the document↔entity
// link (not the document) so the same file can be accepted for one entity and
// rejected for another.
const reviewLinkSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.coerce.number().int(),
  reviewStatus: z.enum(["new", "accepted", "rejected", "needs_replacement", "duplicate"]),
  reviewNote: z.string().max(2000).optional(),
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

router.get("/", authorize({ feature: "documents", action: "list" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { entity, entityId, category, status: docStatus } = req.query;

    if (entity && entityId) {
      const rows = await rawQuery(
        `SELECT d.*, del."reviewStatus", del."reviewedAt", del."reviewNote",
                emp.name AS "uploaderName"
         FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
         LEFT JOIN users u ON u.id = d."uploadedBy"
         LEFT JOIN employees emp ON emp.id = u."employeeId" AND emp."deletedAt" IS NULL
         WHERE del."entityType" = $1 AND del."entityId" = $2
         AND (d."companyId" = $3 OR d."companyId" IS NULL) AND d."deletedAt" IS NULL
         ORDER BY d."createdAt" DESC LIMIT 500`,
        [entity, Number(entityId), scope.companyId]
      );
      res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
      return;
    }

    let where = `WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];

    if (category) {
      params.push(category);
      where += ` AND category=$${params.length}`;
    }
    if (docStatus) {
      params.push(docStatus);
      where += ` AND status=$${params.length}`;
    }

    const rows = await rawQuery(`SELECT * FROM documents ${where} ORDER BY "createdAt" DESC LIMIT 500`, params);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/", authorize({ feature: "documents", action: "create" }), async (req: Request, res: Response) => {
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
    const [row] = await rawQuery<DocumentRow>(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, title, type, department });
  } catch (err) { handleRouteError(err, res, "Create document error:"); }
});

router.post("/upload", authorize({ feature: "documents", action: "create" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(uploadDocumentSchema.safeParse(req.body));
    const scope = req.scope!;
    const { title, description, fileName, fileSize, mimeType, category, storageKey, contentHash, entityLinks } = body;

    const ALLOWED_ENTITY_TYPES = [
      "employee", "client", "project", "invoice", "vehicle",
      "legal_case", "legal_contract",
      "rental_contract", "property_building", "property_unit",
      "umrah_pilgrim", "umrah_invoice",
      "purchase_order", "expense",
    ];
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
        `INSERT INTO documents (title, description, "fileName", "fileSize", "mimeType", category, status, "storageKey", "contentHash", "currentVersion", "uploadedBy", "companyId")
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,1,$9,$10) RETURNING id`,
        [title, description, fileName, fileSize, mimeType, category || null, storageKey, contentHash || null, scope.userId, scope.companyId]
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

router.get("/:id/download", authorize({ feature: "documents", action: "export" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [doc] = await rawQuery<DocumentRow>(
      `SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    if (!doc.storageKey) {
      throw new NotFoundError("لا يوجد ملف مرفق");
    }

    // M6 enforcement: per-document ACL. checkDocumentAcl returns true
    // when no ACL rows exist (fallback to feature-RBAC) OR the caller
    // matches an unexpired grant for the requested level. Returning
    // 404 instead of 403 deliberately — the existence of a confidential
    // document should not leak through a 403 to someone outside the ACL.
    const allowed = await checkDocumentAcl(id, scope, "read");
    if (!allowed) throw new NotFoundError("المستند غير موجود");

    // Compliance: record every access. Fire-and-forget — a logging
    // failure must not block a legitimate download, but the row goes
    // in BEFORE the stream pipes so we record intent even if the
    // upstream object-storage call later fails.
    rawQuery(
      `INSERT INTO document_access_log ("companyId","documentId","userId","accessType","ipAddress","userAgent")
       VALUES ($1,$2,$3,'download',$4,$5)`,
      [scope.companyId, id, scope.userId ?? null, req.ip ?? null, req.get("user-agent") ?? null]
    ).catch((e) => logger.error(e, "document access log failed (download)"));

    try {
      const obj = await objectStorageService.openObjectStream(doc.storageKey);

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName || 'file')}"`);
      res.setHeader("Content-Type", doc.mimeType || obj.contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (obj.size != null) res.setHeader("Content-Length", String(obj.size));

      obj.stream.pipe(res);
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
router.get("/:id/preview", authorize({ feature: "documents", action: "export" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [doc] = await rawQuery<DocumentRow>(
      `SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");
    if (!doc.storageKey) throw new NotFoundError("لا يوجد ملف مرفق");

    // M6 enforcement — same gate as /download. Identical 404 behaviour
    // so a confidential doc looks the same to outsiders as a non-existent
    // one.
    const allowed = await checkDocumentAcl(id, scope, "read");
    if (!allowed) throw new NotFoundError("المستند غير موجود");

    // Compliance: same fire-and-forget access log as /download, with
    // accessType='preview' so reports can distinguish embed/preview
    // views (often cached, lower bar) from explicit downloads.
    rawQuery(
      `INSERT INTO document_access_log ("companyId","documentId","userId","accessType","ipAddress","userAgent")
       VALUES ($1,$2,$3,'preview',$4,$5)`,
      [scope.companyId, id, scope.userId ?? null, req.ip ?? null, req.get("user-agent") ?? null]
    ).catch((e) => logger.error(e, "document access log failed (preview)"));

    try {
      const obj = await objectStorageService.openObjectStream(doc.storageKey);

      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName || 'file')}"`);
      res.setHeader("Content-Type", doc.mimeType || obj.contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=300");
      if (obj.size != null) res.setHeader("Content-Length", String(obj.size));

      obj.stream.pipe(res);
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
router.post("/:id/versions", authorize({ feature: "documents", action: "create" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(createVersionSchema.safeParse(req.body));
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const { fileName, fileSize, mimeType, storageKey, notes } = body;

    const [doc] = await rawQuery<DocumentRow>(
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

router.get("/:id/versions", authorize({ feature: "documents", action: "list" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const [doc] = await rawQuery<{ id: number }>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    const versions = await rawQuery(
      `SELECT * FROM document_versions WHERE "documentId"=$1 ORDER BY "versionNumber" DESC LIMIT 500`,
      [docId]
    );
    res.json(maskFields(req, { data: versions }));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.patch("/:id/status", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(updateStatusSchema.safeParse(req.body));
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const { status } = body;

    if (status === "approved" && !scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      throw new ForbiddenError("ليس لديك صلاحية اعتماد المستندات");
    }

    const [beforeDoc] = await rawQuery<DocumentRow>(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [docId, scope.companyId]);
    if (!beforeDoc) throw new NotFoundError("المستند غير موجود");

    const result = await rawExecute(
      `UPDATE documents SET status=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND status != $1 AND "deletedAt" IS NULL`,
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

// PATCH /:id/review — record a reviewer's verdict on a document↔entity link.
// Mirrors the /:id/status approval pattern: gated by documents:update AND an
// approver role; a rejecting verdict must carry a reason. The layout adds no
// new approval engine — it stamps the link + writes audit/event/approval_action.
router.patch("/:id/review", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(reviewLinkSchema.safeParse(req.body));
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");
    const { entityType, entityId, reviewStatus, reviewNote } = body;

    // Reviewing is a decision — gate behind owner/approver roles (mirrors /:id/status).
    if (!scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      throw new ForbiddenError("ليس لديك صلاحية مراجعة المرفقات");
    }
    // A rejecting / replacement verdict must state why.
    if ((reviewStatus === "rejected" || reviewStatus === "needs_replacement") && !String(reviewNote ?? "").trim()) {
      throw new ValidationError("سبب القرار مطلوب عند الرفض أو طلب الاستبدال", {
        field: "reviewNote",
        fix: "اكتب سبب الرفض أو الاستبدال",
      });
    }

    const [doc] = await rawQuery<{ id: number }>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    const [beforeLink] = await rawQuery<{ reviewStatus: string }>(
      `SELECT "reviewStatus" FROM document_entity_links WHERE "documentId"=$1 AND "entityType"=$2 AND "entityId"=$3`,
      [docId, entityType, Number(entityId)]
    );
    if (!beforeLink) throw new NotFoundError("ربط المستند بالكيان غير موجود");

    // Stamp the verdict and record the approval action atomically — a verdict
    // without its approval-action trail (or vice-versa) is an inconsistent state.
    await withTransaction(async () => {
      await rawExecute(
        `UPDATE document_entity_links
         SET "reviewStatus"=$1, "reviewedBy"=$2, "reviewedAt"=NOW(), "reviewNote"=$3
         WHERE "documentId"=$4 AND "entityType"=$5 AND "entityId"=$6`,
        [reviewStatus, scope.userId, reviewNote ?? null, docId, entityType, Number(entityId)]
      );
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["document", docId, `attachment_${reviewStatus}`, reviewNote ?? null, scope.userId, scope.companyId]
      );
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "review", entity: "document_entity_links", entityId: docId,
      before: { reviewStatus: beforeLink.reviewStatus },
      after: { reviewStatus, entityType, entityId: Number(entityId) },
      reason: reviewNote ?? undefined,
    }).catch((e) => logger.error(e, "documents background task failed"));

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "documents.attachment.reviewed",
      entity: "document_entity_links",
      entityId: docId,
      details: JSON.stringify({ entityType, entityId: Number(entityId), reviewStatus }),
    }).catch((e) => logger.error(e, "documents background task failed"));

    res.json({ documentId: docId, entityType, entityId: Number(entityId), reviewStatus, reviewNote: reviewNote ?? null });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/:id/entity-links", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(createEntityLinkSchema.safeParse(req.body));
    const scope = req.scope!;
    const { entityType, entityId } = body;
    const docId = parseId(req.params.id, "id");

    const [doc] = await rawQuery<{ id: number }>(
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

router.get("/:id/entity-links", authorize({ feature: "documents", action: "list" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = parseId(req.params.id, "id");

    const [doc] = await rawQuery<{ id: number }>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [docId, scope.companyId]
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");

    const links = await rawQuery(
      `SELECT * FROM document_entity_links WHERE "documentId"=$1 LIMIT 500`,
      [docId]
    );
    res.json(maskFields(req, { data: links }));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/folders", authorize({ feature: "documents", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/folders", authorize({ feature: "documents", action: "create" }), async (req, res) => {
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
    const [row] = await rawQuery<DocumentFolderRow>(`SELECT * FROM document_folders WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, name, parentId: parentId ? Number(parentId) : null });
  } catch (err) { handleRouteError(err, res, "Create folder error:"); }
});

router.get("/templates", authorize({ feature: "documents", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<DocumentTemplateRow>(
      `SELECT * FROM document_templates WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, rows));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/templates/:id", authorize({ feature: "documents", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<DocumentTemplateRow>(`SELECT * FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("القالب غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/templates", authorize({ feature: "documents", action: "create" }), async (req, res) => {
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
    const [row] = await rawQuery<DocumentTemplateRow>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
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
router.put("/templates/:id", authorize({ feature: "documents", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(updateTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (isNaN(id) || id <= 0) throw new ValidationError("معرف القالب غير صالح");
    const { name, description, content, category, type, variables, htmlContent, branchId, signatureUrl, isActive } = body;
    const [existing] = await rawQuery<DocumentTemplateRow>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("القالب غير موجود");
    await rawExecute(
      `UPDATE document_templates SET name=$1, description=$2, content=$3, category=$4, "type"=$5, "variables"=$6, "htmlContent"=$7, "branchId"=$8, "signatureUrl"=$9, "isActive"=$10, "updatedAt"=NOW() WHERE id=$11 AND "companyId"=$12 AND "deletedAt" IS NULL`,
      [name, description, content, category, type, JSON.stringify(variables || []), htmlContent, branchId || null, signatureUrl || null, isActive !== false, id, scope.companyId]
    );
    const [row] = await rawQuery<DocumentTemplateRow>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
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
  } catch (e) { handleRouteError(e, res, "Update document template error"); }
});

router.delete("/templates/:id", authorize({ feature: "documents", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (isNaN(id) || id <= 0) throw new ValidationError("معرف القالب غير صالح");
    const [existing] = await rawQuery<DocumentTemplateRow>(`SELECT * FROM document_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("القالب غير موجود");
    const { affectedRows } = await rawExecute(`UPDATE document_templates SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
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
  } catch (e) { handleRouteError(e, res, "Delete document template error"); }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fillTemplate(htmlContent: string, data: Record<string, unknown>): string {
  return htmlContent.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const parts = key.split(".");
    let value: unknown = data;
    for (const part of parts) {
      if (value == null) return match;
      value = (value as Record<string, unknown>)[part];
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

router.post("/templates/:id/generate", authorize({ feature: "documents", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [template] = await rawQuery<DocumentTemplateRow>(`SELECT * FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
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
      interface EmployeeWithContractRow extends Record<string, unknown> {
        id: number;
        name: string;
        empNumber?: string | null;
        nationalId?: string | null;
        nationality?: string | null;
        phone?: string | null;
        email?: string | null;
        status?: string | null;
        jobTitle?: string | null;
        hireDate?: string | null;
        endDate?: string | null;
        departmentName?: string | null;
        branchName?: string | null;
        salary?: number | string | null;
        housingAllowance?: number | string | null;
        transportAllowance?: number | string | null;
      }
      const [emp] = await rawQuery<EmployeeWithContractRow>(`
        SELECT e.*, ea."jobTitle", ea."hireDate", ea."endDate",
               ec.salary, ec."housingAllowance", ec."transportAllowance",
               d.name as "departmentName", b.name as "branchName"
        FROM employees e
        JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active' AND ea."companyId" = $2
        LEFT JOIN employee_contracts ec ON ec."assignmentId" = ea.id AND ec."deletedAt" IS NULL AND ec.status = 'active'
        LEFT JOIN departments d ON d.id = ea."departmentId"
        LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
        WHERE e.id=$1 AND e."deletedAt" IS NULL
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
      interface InvoiceWithClientRow extends Record<string, unknown> {
        id: number;
        ref?: string | null;
        total: number | string;
        clientName?: string | null;
        clientEmail?: string | null;
        clientPhone?: string | null;
      }
      const [inv] = await rawQuery<InvoiceWithClientRow>(`
        SELECT i.*, c.name as "clientName", c.email as "clientEmail", c.phone as "clientPhone"
        FROM invoices i
        LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
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
          validUntil: inv.dueDate ? new Date(String(inv.dueDate)).toLocaleDateString("ar-SA") : "",
          notes: inv.notes || "",
          items: "",
        };
      }
    }

    const [company] = await rawQuery<CompanyContext>(`SELECT * FROM companies WHERE id=$1`, [scope.companyId]);
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

    const htmlContent = String(template.htmlContent || template.content || "");
    const filledHtml = fillTemplate(htmlContent, entityData);

    let branchData = null;
    const branchId = template.branchId || scope.branchId;
    if (branchId) {
      const [branch] = await rawQuery<BranchContext>(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [branchId, scope.companyId]);
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

router.get("/templates/:id/variables", authorize({ feature: "documents", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [template] = await rawQuery<{ variables: unknown }>(`SELECT variables FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!template) throw new NotFoundError("القالب غير موجود");
    let variables = [];
    try { variables = typeof template.variables === "string" ? JSON.parse(template.variables) : (template.variables || []); } catch (e) { logger.warn(e, "failed to parse template variables JSON"); variables = []; }
    res.json(maskFields(req, { variables }));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// ── Document requirements (per entityType checklist) ─────────────────────────
// Configurable list of documents an entity is expected to carry. The
// completeness card is DERIVED on the client (requirements ∩ linked docs) —
// this is config only. Registered before /:id so "/requirements" is not
// captured as an :id param.
const createRequirementSchema = z.object({
  entityType: z.string().min(1).max(50),
  docCategory: z.string().max(50).nullable().optional(),
  label: z.string().min(1).max(255),
  required: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});
const updateRequirementSchema = z.object({
  docCategory: z.string().max(50).nullable().optional(),
  label: z.string().min(1).max(255).optional(),
  required: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

router.get("/requirements", authorize({ feature: "documents", action: "list" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : null;
    const params: unknown[] = [scope.companyId];
    let where = `"isActive" = true AND ("companyId" = $1 OR "companyId" IS NULL)`;
    if (entityType) {
      params.push(entityType);
      where += ` AND "entityType" = $${params.length}`;
    }
    const rows = await rawQuery(
      `SELECT * FROM document_requirements WHERE ${where} ORDER BY "sortOrder" ASC, id ASC`,
      params,
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/requirements", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(createRequirementSchema.safeParse(req.body));
    const scope = req.scope!;
    if (!scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      throw new ForbiddenError("ليس لديك صلاحية ضبط متطلبات المستندات");
    }
    const r = await rawExecute(
      `INSERT INTO document_requirements ("companyId", "entityType", "docCategory", label, required, "sortOrder", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [scope.companyId, body.entityType, body.docCategory ?? null, body.label, body.required ?? true, body.sortOrder ?? 0, scope.userId],
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "document_requirements", entityId: r.insertId,
      after: { entityType: body.entityType, label: body.label, docCategory: body.docCategory ?? null },
    }).catch((e) => logger.error(e, "documents background task failed"));
    const [row] = await rawQuery(`SELECT * FROM document_requirements WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [r.insertId, scope.companyId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.patch("/requirements/:id", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const body = zodParse(updateRequirementSchema.safeParse(req.body));
    const scope = req.scope!;
    const reqId = parseId(req.params.id, "id");
    if (!scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      throw new ForbiddenError("ليس لديك صلاحية ضبط متطلبات المستندات");
    }
    const [before] = await rawQuery<{ id: number }>(
      `SELECT id FROM document_requirements WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [reqId, scope.companyId],
    );
    if (!before) throw new NotFoundError("المتطلب غير موجود");

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const key of ["docCategory", "label", "required", "isActive", "sortOrder"] as const) {
      if (body[key] !== undefined) {
        params.push(body[key]);
        sets.push(`"${key}" = $${params.length}`);
      }
    }
    if (sets.length === 0) throw new ValidationError("لا تغييرات");
    params.push(reqId);
    await rawExecute(
      `UPDATE document_requirements SET ${sets.join(", ")}, "updatedAt"=NOW() WHERE id=$${params.length}`,
      params,
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "document_requirements", entityId: reqId,
      after: body,
    }).catch((e) => logger.error(e, "documents background task failed"));
    const [row] = await rawQuery(`SELECT * FROM document_requirements WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [reqId, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// Soft delete (deactivate) — physical delete is forbidden by the constitution.
router.delete("/requirements/:id", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const reqId = parseId(req.params.id, "id");
    if (!scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      throw new ForbiddenError("ليس لديك صلاحية ضبط متطلبات المستندات");
    }
    const result = await rawExecute(
      `UPDATE document_requirements SET "isActive"=false, "updatedAt"=NOW()
       WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "isActive"=true`,
      [reqId, scope.companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("المتطلب غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "document_requirements", entityId: reqId,
    }).catch((e) => logger.error(e, "documents background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/stats", authorize({ feature: "documents", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[docs], [folders], [templates], [drafts], [approved]] = await Promise.all([
      rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM document_templates WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL AND status='draft'`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL AND status='approved'`, [cid]),
    ]);
    res.json(maskFields(req, {
      totalDocuments: Number(docs.count),
      totalFolders: Number(folders.count),
      totalTemplates: Number(templates.count),
      draftDocuments: Number(drafts.count),
      approvedDocuments: Number(approved.count),
    }));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.get("/:id", authorize({ feature: "documents", action: "view", resource: { table: "documents", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<DocumentRow>(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المستند غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.patch("/:id", authorize({ feature: "documents", action: "update" }), async (req, res) => {
  try {
    const b = zodParse(patchDocumentSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const sets: string[] = [];
    const params: unknown[] = [];
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
    const [row] = await rawQuery<DocumentRow>(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
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

router.delete("/:id", authorize({ feature: "documents", action: "delete" }), async (req, res) => {
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

// Access log read endpoint — admins / compliance officers see who
// downloaded/previewed which document. Gated by `documents:export` so
// only users who can pull a file can also see the log of pulls.
router.get("/:id/access-log", authorize({ feature: "documents", action: "export" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Tenant scope is enforced on the log row itself, not on the
    // document — the document may be soft-deleted but the log must
    // still be retrievable for compliance.
    const rows = await rawQuery(
      `SELECT l.id, l."documentId", l."userId", l."accessType", l."accessedAt", l."ipAddress",
              u.email AS "userEmail", e.name AS "userName"
       FROM document_access_log l
       LEFT JOIN users u ON u.id = l."userId"
       LEFT JOIN employees e ON e.id = u."employeeId" AND e."deletedAt" IS NULL
       WHERE l."companyId" = $1 AND l."documentId" = $2
       ORDER BY l."accessedAt" DESC
       LIMIT 500`,
      [scope.companyId, id]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// M5 retention — backfill helper. Computes retentionUntil for documents
// that have a category but no explicit policy. Idempotent: skips rows
// that already carry retentionUntil. Gated by documents:delete because
// scheduling deletion is effectively the same authority. Result: count
// of rows updated. The actual purge runs in a separate cron, not here.
router.post("/retention/backfill", authorize({ feature: "documents", action: "delete" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    let updated = 0;
    for (const [category, years] of Object.entries(RETENTION_HORIZONS_YEARS)) {
      const r = await rawExecute(
        `UPDATE documents
            SET "retentionUntil" = ("createdAt"::date + (($1::int) * INTERVAL '1 year'))::date,
                "retentionPolicy" = $2
          WHERE "companyId" = $3
            AND category = $2
            AND "retentionUntil" IS NULL
            AND "deletedAt" IS NULL`,
        [years, category, scope.companyId]
      ).catch(() => ({ affectedRows: 0 }));
      updated += r.affectedRows ?? 0;
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "document.retention_backfilled", entity: "documents", entityId: scope.companyId,
      after: { updated },
    }).catch((e) => logger.error(e, "documents retention-backfill audit failed"));
    res.json({ ok: true, updated, horizons: RETENTION_HORIZONS_YEARS });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// M5 retention — list documents whose retention has expired. Cron job
// (or admin UI button) reads this to decide what to hard-delete next.
// Returns ids only — actual deletion is a separate action so a human
// can review the list first.
router.get("/retention/due", authorize({ feature: "documents", action: "delete" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT id, title, category, "retentionPolicy", "retentionUntil", "createdAt"
         FROM documents
        WHERE "companyId" = $1
          AND "retentionUntil" IS NOT NULL
          AND "retentionUntil" <= CURRENT_DATE
          AND "deletedAt" IS NULL
        ORDER BY "retentionUntil" ASC
        LIMIT 500`,
      [scope.companyId]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// M6 per-document ACL — list, grant, revoke. The read-path enforcement
// is in lib/documentAcl.ts so other modules (preview, download,
// version delete) can reuse it without duplicating logic.

const grantAclSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  roleKey: z.string().max(60).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  permission: z.enum(["read", "write", "admin"]).default("read"),
  expiresAt: z.string().optional(),
}).refine((b) => Number(!!b.userId) + Number(!!b.roleKey) + Number(!!b.departmentId) === 1, {
  message: "بالضبط واحدة من userId/roleKey/departmentId مطلوبة",
});

router.get("/:id/acls", authorize({ feature: "documents", action: "list" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT a.id, a."userId", a."roleKey", a."departmentId", a.permission,
              a."grantedBy", a."grantedAt", a."expiresAt",
              u.email AS "userEmail", e.name AS "userName",
              d.name AS "departmentName"
         FROM document_acls a
         LEFT JOIN users u ON u.id = a."userId"
         LEFT JOIN employees e ON e.id = u."employeeId" AND e."deletedAt" IS NULL
         LEFT JOIN departments d ON d.id = a."departmentId" AND d."deletedAt" IS NULL
        WHERE a."companyId" = $1 AND a."documentId" = $2
          AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        ORDER BY a."grantedAt" DESC`,
      [scope.companyId, id]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.post("/:id/acls", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(grantAclSchema.safeParse(req.body));
    const [{ id: insertId }] = await rawQuery<{ id: number }>(
      `INSERT INTO document_acls
         ("companyId", "documentId", "userId", "roleKey", "departmentId", permission, "grantedBy", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [scope.companyId, id, body.userId ?? null, body.roleKey ?? null, body.departmentId ?? null, body.permission, scope.userId, body.expiresAt ?? null]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "document.acl_granted", entity: "document_acls", entityId: insertId,
      after: { documentId: id, userId: body.userId ?? null, roleKey: body.roleKey ?? null, departmentId: body.departmentId ?? null, permission: body.permission },
    }).catch((e) => logger.error(e, "documents acl-grant audit failed"));
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

router.delete("/:id/acls/:aclId", authorize({ feature: "documents", action: "update" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const aclId = parseId(req.params.aclId, "aclId");
    await rawExecute(
      `DELETE FROM document_acls
        WHERE id = $1 AND "documentId" = $2 AND "companyId" = $3`,
      [aclId, id, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "document.acl_revoked", entity: "document_acls", entityId: aclId,
      before: { documentId: id },
    }).catch((e) => logger.error(e, "documents acl-revoke audit failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "documents"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// م٢-ج — محرّك قراءة المستند (OCR، مسار الوثائق). يملأ سقالة الهجرة 171 + stubs.
// tesseract داخلي (عربي+إنجليزي) → استخراج حقول بدرجة ثقة → **تأكيد بشري** قبل
// التطبيق (docs/25 §١١.٣، الطبقة ب المساعِدة). يُعيد استخدام ObjectStorageService
// لقراءة بايتات الملف + documentOcrService للقراءة والاستخراج.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/ocr/extractions", authorize({ feature: "documents.my", action: "list" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const status = (req.query.status as string) || null;
    const params: unknown[] = [scope.companyId];
    // ضمّ documents (نفس المسار) لإظهار عنوان المستند واسم ملفه، فيعرف المراجع ما يؤكّده.
    let sql = `SELECT e.id, e."documentId", e."docType", e.fields, e.confidence, e.status,
                      e."reviewedBy", e."reviewedAt", e."appliedTo", e."appliedToId", e."createdAt",
                      d.title AS "docTitle", d."fileName"
                 FROM document_ocr_extractions e
                 LEFT JOIN documents d ON d.id = e."documentId" AND d."deletedAt" IS NULL
                WHERE e."companyId"=$1 AND e."deletedAt" IS NULL`;
    if (status) { sql += ` AND e.status=$2`; params.push(status); }
    sql += ` ORDER BY e.id DESC LIMIT 100`;
    const rows = await rawQuery<{ documentId: number }>(sql, params);
    // رشّح بـACL المستند (نفس فلتر التنزيل/المعاينة): لا يُكشف مستخلَص مستند لا يُسمح
    // للمستخدم بقراءته. الحالة الغالبة (لا صفوف ACL) ترجع true سريعًا.
    const acl = await Promise.all(rows.map((r) => checkDocumentAcl(r.documentId, scope, "read")));
    const data = rows.filter((_, i) => acl[i]);
    res.json(maskFields(req, { data, total: data.length, extractions: data }));
  } catch (err) { handleRouteError(err, res, "document OCR list"); }
});

router.post("/:id/ocr/rerun", authorize({ feature: "documents.my", action: "update" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [doc] = await rawQuery<{ id: number; storageKey: string | null; mimeType: string | null; category: string | null }>(
      `SELECT id, "storageKey", "mimeType", category FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!doc) throw new NotFoundError("المستند غير موجود");
    // ACL لكل مستند (نفس فلتر التنزيل/المعاينة): قراءة OCR = قراءة محتوى الملف، فلا
    // يجوز لمستخدم في المسار تشغيلها على مستند لا يُسمح له بقراءته. 404 لا 403 (لا تسريب).
    if (!(await checkDocumentAcl(id, scope, "read"))) throw new NotFoundError("المستند غير موجود");
    if (!doc.storageKey) throw new ValidationError("لا ملف مرفوع لهذا المستند");
    if (doc.mimeType && !/^image\//i.test(doc.mimeType) && !/pdf/i.test(doc.mimeType)) {
      throw new ValidationError("قراءة OCR تدعم الصور وملفات PDF حاليًا");
    }
    // اقرأ بايتات الملف من التخزين الكائني (تدفّق → Buffer).
    const file = await objectStorageService.getObjectEntityFile(doc.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of file.createReadStream()) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    // المحرّك (tesseract + mupdf كسولا التحميل): صورة أو PDF → نص ثم استخراج الحقول الحتمي.
    const { runOcrDocument, extractFields } = await import("../lib/documentOcrService.js");
    const ocr = await runOcrDocument(buffer, doc.mimeType);
    const docType = (typeof req.body?.docType === "string" && req.body.docType) || doc.category || "invoice";
    const { fields, fieldConfidence } = extractFields(ocr.text, docType);
    const confidence = Math.round((Number(ocr.confidence) || 0) * (fieldConfidence / 100) * 100) / 100;
    // أبطِل المعلّق السابق لنفس المستند ثم أدرج الاستخراج الجديد (pending → مراجعة بشرية).
    await rawExecute(
      `UPDATE document_ocr_extractions SET "deletedAt"=NOW() WHERE "companyId"=$1 AND "documentId"=$2 AND status='pending' AND "deletedAt" IS NULL`,
      [scope.companyId, id],
    );
    const [ins] = await rawQuery<{ id: number }>(
      `INSERT INTO document_ocr_extractions ("companyId","documentId","docType",fields,confidence,status)
       VALUES ($1,$2,$3,$4::jsonb,$5,'pending') RETURNING id`,
      [scope.companyId, id, docType, JSON.stringify(fields), confidence],
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "document.ocr.rerun", entity: "document_ocr_extractions", entityId: ins.id,
      after: { documentId: id, confidence, ocrConfidence: ocr.confidence, fieldConfidence },
    }).catch((e) => logger.error(e, "document ocr rerun audit failed"));
    res.status(201).json({ id: ins.id, fields, confidence, ocrConfidence: ocr.confidence, status: "pending" });
  } catch (err) { handleRouteError(err, res, "document OCR rerun"); }
});

router.post("/ocr/extractions/:id/confirm", authorize({ feature: "documents.my", action: "update" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // الحقول المُراجَعة (إن أُرسلت) تحلّ محلّ المُستخرَجة؛ وإلا نُبقي المُستخرَجة كما هي
    // (تأكيد سريع بلا تعديل من صندوق الوارد لا يجوز أن يمحو ما استُخرج).
    const editedFields =
      req.body?.fields && typeof req.body.fields === "object" && !Array.isArray(req.body.fields)
        ? JSON.stringify(req.body.fields)
        : null;
    // الكيان المرتبط (موظف/مركبة/فاتورة…): يُسجَّل كبيانات وصفية على صف الاستخراج فقط.
    // المسار الخادم (الوثائق) لا يكتب في كيان المسار القائد احترامًا لحدود المسارات؛
    // تطبيق المستخرَج المؤكَّد على الكيان يتم لاحقًا عبر عقد المسار المالك.
    const appliedTo =
      typeof req.body?.appliedTo === "string" && /^[a-z_]{1,40}$/i.test(req.body.appliedTo) ? req.body.appliedTo : null;
    const appliedToId =
      req.body?.appliedToId != null && Number.isInteger(Number(req.body.appliedToId)) && Number(req.body.appliedToId) > 0
        ? Number(req.body.appliedToId)
        : null;
    // ACL المستند قبل التعديل (نفس فلتر التنزيل): لا يراجِع مستخلَص مستند لا يُسمح بقراءته.
    const [ext] = await rawQuery<{ documentId: number }>(
      `SELECT "documentId" FROM document_ocr_extractions
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status='pending'`,
      [id, scope.companyId],
    );
    if (!ext || !(await checkDocumentAcl(ext.documentId, scope, "read"))) {
      throw new NotFoundError("استخراج غير موجود أو ليس قيد المراجعة");
    }
    const [row] = await rawQuery<{ id: number; documentId: number }>(
      `UPDATE document_ocr_extractions
          SET status='confirmed',
              fields=COALESCE($3::jsonb, fields),
              "appliedTo"=COALESCE($5, "appliedTo"),
              "appliedToId"=COALESCE($6, "appliedToId"),
              "reviewedBy"=$1, "reviewedAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$2 AND "companyId"=$4 AND "deletedAt" IS NULL AND status='pending'
        RETURNING id, "documentId"`,
      [scope.activeAssignmentId ?? scope.userId, id, editedFields, scope.companyId, appliedTo, appliedToId],
    );
    if (!row) throw new NotFoundError("استخراج غير موجود أو ليس قيد المراجعة");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "document.ocr.confirmed", entity: "document_ocr_extractions", entityId: row.id,
      after: { documentId: row.documentId, fieldsEdited: editedFields != null, appliedTo, appliedToId },
    }).catch((e) => logger.error(e, "document ocr confirm audit failed"));
    res.json({ ok: true, id: row.id, status: "confirmed" });
  } catch (err) { handleRouteError(err, res, "document OCR confirm"); }
});

router.post("/ocr/extractions/:id/reject", authorize({ feature: "documents.my", action: "update" }), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    // ACL المستند قبل التعديل (نفس فلتر التنزيل): لا يبتّ في مستخلَص مستند لا يُسمح بقراءته.
    const [ext] = await rawQuery<{ documentId: number }>(
      `SELECT "documentId" FROM document_ocr_extractions
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status='pending'`,
      [id, scope.companyId],
    );
    if (!ext || !(await checkDocumentAcl(ext.documentId, scope, "read"))) {
      throw new NotFoundError("استخراج غير موجود أو ليس قيد المراجعة");
    }
    const [row] = await rawQuery<{ id: number; documentId: number }>(
      `UPDATE document_ocr_extractions
          SET status='rejected', "reviewedBy"=$1, "reviewedAt"=NOW(), notes=$3, "updatedAt"=NOW()
        WHERE id=$2 AND "companyId"=$4 AND "deletedAt" IS NULL AND status='pending'
        RETURNING id, "documentId"`,
      [scope.activeAssignmentId ?? scope.userId, id, notes, scope.companyId],
    );
    if (!row) throw new NotFoundError("استخراج غير موجود أو ليس قيد المراجعة");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "document.ocr.rejected", entity: "document_ocr_extractions", entityId: row.id,
      after: { documentId: row.documentId, notes },
    }).catch((e) => logger.error(e, "document ocr reject audit failed"));
    res.json({ ok: true, id: row.id, status: "rejected" });
  } catch (err) { handleRouteError(err, res, "document OCR reject"); }
});

export default router;
