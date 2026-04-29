import { ValidationError, NotFoundError, ForbiddenError, isTypedError, handleRouteError } from "../lib/errorHandler.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { rawQuery } from "../lib/rawdb.js";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.coerce.number().max(MAX_FILE_SIZE_BYTES, { message: `حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)` }),
  contentType: z.string(),
});

const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.coerce.number(),
    contentType: z.string(),
  }),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات الرفع. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
});

router.post("/storage/uploads/request-url", uploadLimiter, authMiddleware, requirePermission("documents:write"), async (req: Request, res: Response) => {
  try {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message || "Missing or invalid required fields");

    const { name, size, contentType } = parsed.data;

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ValidationError(`نوع الملف غير مسموح به: ${contentType}. الأنواع المسموحة: PDF، Word، Excel، الصور، النصوص`);
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    const scope = req.scope;
    if (scope) {
      createAuditLog({
        companyId: scope.companyId, userId: scope.userId, action: "request_upload_url",
        entity: "storage", entityId: 0,
        after: { name, size, contentType, objectPath },
      }).catch((e) => logger.error(e, "storage background task failed"));
      emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "storage.upload_requested", entity: "storage", entityId: 0, details: JSON.stringify({ name, size, contentType, objectPath }) }).catch((e) => logger.error(e, "storage background task failed"));
    }

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    if (isTypedError(error)) {
      res.status(error.status).json(error.toResponse());
      return;
    }
    req.log.error({ err: error }, "Error generating upload URL");
    handleRouteError(error, res, "Generate upload URL error");
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      throw new NotFoundError("File not found");
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (isTypedError(error)) {
      res.status(error.status).json(error.toResponse());
      return;
    }
    req.log.error({ err: error }, "Error serving public object");
    handleRouteError(error, res, "Serve public object error");
  }
});

router.get("/storage/objects/*path", authMiddleware, requirePermission("documents:download"), async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const scope = req.scope;
    if (scope) {
      const docs = await rawQuery(
        `SELECT id FROM documents WHERE "storageKey"=$1 AND "companyId"=$2 LIMIT 1`,
        [objectPath, scope.companyId]
      );
      const versions = docs.length > 0 ? docs : await rawQuery(
        `SELECT dv.id FROM document_versions dv
         JOIN documents d ON d.id = dv."documentId"
         WHERE dv."storageKey"=$1 AND d."companyId"=$2 LIMIT 1`,
        [objectPath, scope.companyId]
      );
      if (docs.length === 0 && versions.length === 0) {
        throw new ForbiddenError("Access denied");
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      const typed = new NotFoundError("Object not found");
      res.status(typed.status).json(typed.toResponse());
      return;
    }
    if (isTypedError(error)) {
      res.status(error.status).json(error.toResponse());
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    handleRouteError(error, res, "Serve object error");
  }
});

export default router;
