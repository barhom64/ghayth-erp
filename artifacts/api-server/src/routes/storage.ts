import { ValidationError, NotFoundError, ForbiddenError, isTypedError, handleRouteError , zodParse } from "../lib/errorHandler.js";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { getStorageAdapter } from "../lib/storage/index.js";
import { config } from "../lib/config.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { rawQuery } from "../lib/rawdb.js";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
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

// Reverse map content-type → file extension. The stored object key keeps the
// extension so the local backend (which has no metadata store) can infer the
// MIME type on read, making inline preview work for PDFs/images.
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
};

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// Only `uploads/<uuid>[.ext]` keys are ever produced/accepted by the signed
// direct-upload route. Anchored so a key can never traverse outside the prefix.
const DIRECT_KEY_RE = /^uploads\/[A-Za-z0-9-]+(\.[A-Za-z0-9]+)?$/;

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

// HMAC signature binding a direct-upload URL to a specific object key + expiry.
// Signed with JWT_SECRET (already required + ≥32 chars) so only the
// authenticated upload-URL minting route can produce a valid upload URL.
function signDirectUpload(entityId: string, exp: number): string {
  return createHmac("sha256", config.jwtSecret)
    .update(`${entityId}:${exp}`)
    .digest("hex");
}

function verifyDirectUpload(entityId: string, exp: number, sig: string): boolean {
  const expected = Buffer.from(signDirectUpload(entityId, exp), "utf8");
  const provided = Buffer.from(sig, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

// Per-user upload limiter — runs after authMiddleware (re-ordered below) so
// req.scope is set. Owner/admin roles are exempt; everyone else gets 30/min.
const uploadLimiter = createPerUserLimiter({
  prefix: "storage:upload",
  windowMs: 60 * 1000,
  max: 30,
  message: "تم تجاوز الحد الأقصى لطلبات الرفع. يرجى المحاولة بعد دقيقة",
});

// Per-IP limiter for the PUBLIC signed direct-upload sink. It is mounted
// BEFORE the raw-body parser so an abusive burst (even invalid-signature
// requests) is throttled before the up-to-20MB body is buffered into memory.
// Anonymous-by-design, so per-IP is the only available key. Non-prod e2e
// bypass mirrors the auth limiters; production traffic never carries it.
const directUploadIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات الرفع. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("storage:direct-upload"),
  skip: (req) => !config.isProduction && req.headers["x-e2e-test"] === "1",
});

// Per-IP limiter for the PUBLIC public-objects reader (anonymous-by-design).
const publicObjectIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("storage:public-objects"),
  skip: (req) => !config.isProduction && req.headers["x-e2e-test"] === "1",
});

router.post("/storage/uploads/request-url", authMiddleware, uploadLimiter, authorize({ feature: "documents", action: "create" }), async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = zodParse(RequestUploadUrlBody.safeParse(req.body));

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ValidationError(`نوع الملف غير مسموح به: ${contentType}. الأنواع المسموحة: PDF، Word، Excel، الصور، النصوص`);
    }

    // Caller-chosen object id keeps the extension so the stored key is
    // self-describing (needed by the local backend for MIME inference).
    const ext = EXT_BY_CONTENT_TYPE[contentType];
    const entityId = `uploads/${randomUUID()}${ext ? `.${ext}` : ""}`;
    const objectPath = `/objects/${entityId}`;

    const adapter = getStorageAdapter();
    let uploadURL: string;
    if (adapter.createUploadUrl) {
      // Cloud backend (Replit/GCS) — presigned direct-to-storage PUT.
      uploadURL = await objectStorageService.getUploadUrlForEntity(entityId);
    } else {
      // Local/on-prem backend — no presigned URLs. Return a same-origin,
      // time-limited, signed URL the client PUTs the bytes to; our own
      // direct-upload route validates the signature and writes to disk.
      const exp = Date.now() + 15 * 60 * 1000;
      const sig = signDirectUpload(entityId, exp);
      const apiPrefix = req.originalUrl
        .split("?")[0]
        .replace(/\/storage\/uploads\/request-url$/, "");
      // Transport-only ".upload" suffix: some on-prem reverse proxies (e.g.
      // the prod VPS nginx) serve static assets via a regex `location` that
      // matches by file extension (.png/.jpg/.css/…) and takes priority over
      // the /api proxy_pass, so a signed PUT whose URL path ends in such an
      // extension is 404'd by nginx before it ever reaches us — silently
      // breaking every image/static-typed upload. Appending a neutral
      // ".upload" extension keeps the path out of that static regex so it
      // always proxies through; the direct-upload route strips it to recover
      // the real `entityId` (the stored object key still keeps its true
      // extension for MIME inference). PDFs were unaffected and need no change.
      uploadURL = `${apiPrefix}/storage/uploads/direct/${entityId}.upload?exp=${exp}&sig=${sig}`;
    }

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

// Signed direct-upload sink for the local/on-prem storage backend. PUBLIC by
// design (mounted before authMiddleware) — authorization is carried by the
// HMAC-signed, time-limited URL minted by the authenticated request-url route,
// exactly mirroring a cloud presigned URL. The cloud backend never routes here.
const directUploadRaw = express.raw({
  type: () => true,
  limit: MAX_FILE_SIZE_BYTES + 1024,
});

router.put("/storage/uploads/direct/*key", directUploadIpLimiter, directUploadRaw, async (req: Request, res: Response) => {
  try {
    const raw = req.params.key;
    let entityId = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    // Strip the transport-only ".upload" suffix added by request-url so the
    // URL path never ends in a static file extension the reverse proxy would
    // intercept. The recovered entityId is the real object key (and is what
    // the HMAC signature was computed over).
    if (entityId.endsWith(".upload")) {
      entityId = entityId.slice(0, -".upload".length);
    }
    if (!DIRECT_KEY_RE.test(entityId)) {
      throw new ValidationError("مسار رفع غير صالح");
    }

    const exp = Number(req.query.exp);
    const sig = typeof req.query.sig === "string" ? req.query.sig : "";
    if (!Number.isFinite(exp) || Date.now() > exp) {
      throw new ForbiddenError("انتهت صلاحية رابط الرفع");
    }
    if (!sig || !verifyDirectUpload(entityId, exp, sig)) {
      throw new ForbiddenError("توقيع رابط الرفع غير صالح");
    }

    const contentType = (req.get("content-type") || "application/octet-stream").split(";")[0].trim();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ValidationError(`نوع الملف غير مسموح به: ${contentType}`);
    }

    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      throw new ValidationError("جسم الطلب فارغ");
    }
    if (buf.length > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(`حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`);
    }

    await getStorageAdapter().write(
      objectStorageService.objectKeyForEntity(entityId),
      buf,
      { contentType },
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    if (isTypedError(error)) {
      res.status(error.status).json(error.toResponse());
      return;
    }
    req.log.error({ err: error }, "Error storing uploaded object");
    handleRouteError(error, res, "Store uploaded object error");
  }
});

router.get("/storage/public-objects/*filePath", publicObjectIpLimiter, async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const obj = await objectStorageService.openPublicStream(filePath);
    if (!obj) {
      throw new NotFoundError("File not found");
    }

    res.setHeader("Content-Type", obj.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (obj.size != null) res.setHeader("Content-Length", String(obj.size));
    obj.stream.pipe(res);
  } catch (error) {
    if (isTypedError(error)) {
      res.status(error.status).json(error.toResponse());
      return;
    }
    req.log.error({ err: error }, "Error serving public object");
    handleRouteError(error, res, "Serve public object error");
  }
});

router.get("/storage/objects/*path", authMiddleware, authorize({ feature: "documents", action: "export" }), async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const scope = req.scope;
    if (scope) {
      const docs = await rawQuery(
        `SELECT id FROM documents WHERE "storageKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [objectPath, scope.companyId]
      );
      const versions = docs.length > 0 ? docs : await rawQuery(
        `SELECT dv.id FROM document_versions dv
         JOIN documents d ON d.id = dv."documentId"
         WHERE dv."storageKey"=$1 AND d."companyId"=$2 AND d."deletedAt" IS NULL LIMIT 1`,
        [objectPath, scope.companyId]
      );
      // وثائق الاستكمال الذاتي تُرفع خادميًا ولا تُسجَّل في جدول documents؛
      // اسمح بالعرض إذا كان المسار مرجَّعًا في بيانات/مرفقات موظف بنفس الشركة.
      // المسار يحوي UUID فريدًا، فالمطابقة النصية كافية وآمنة ضمن نطاق الشركة.
      const onboardingRef = (docs.length === 0 && versions.length === 0)
        ? await rawQuery(
            `SELECT id FROM employees
              WHERE "companyId"=$2 AND "deletedAt" IS NULL
                AND (("selfSubmittedData")::text LIKE '%'||$1||'%' OR (attachments)::text LIKE '%'||$1||'%')
              LIMIT 1`,
            [objectPath, scope.companyId]
          )
        : [];
      if (docs.length === 0 && versions.length === 0 && onboardingRef.length === 0) {
        throw new ForbiddenError("Access denied");
      }
    }

    const obj = await objectStorageService.openObjectStream(objectPath);
    res.setHeader("Content-Type", obj.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (obj.size != null) res.setHeader("Content-Length", String(obj.size));
    obj.stream.pipe(res);
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
