/**
 * site.ts — Multi-tenant website CMS (admin routes).
 *
 * Mounted at /api/site AFTER authMiddleware + csrfMiddleware. Every read and
 * write is scoped to the caller's ACTIVE company (req.scope.companyId); a row
 * belonging to another company is never visible or mutable here. RBAC feature
 * key: "website". Public (anonymous) reads live in publicData.ts.
 *
 * موائمة بدون تكرار — Ghayth core controls each company's public website
 * (config + packages + services + hotels + blog) from the admin UI.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { zodParse, handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { auditFromRequest } from "../lib/businessHelpers.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

const router = Router();

const slugField = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/i, "المعرّف يجب أن يحتوي على حروف لاتينية وأرقام وشرطات فقط");
const nstr = (max = 500) => z.string().trim().max(max).nullable().optional();

// روابط يُحرّرها المسؤول وتُعرض في وسوم <a href> عامة → نمنع مخططات التنفيذ
// (javascript:/data:/vbscript:) لتفادي XSS المخزَّن. مسموح: http(s)://… أو مسار
// جذري نسبي (/…) أو مرساة (#…) أو mailto:/tel:.
const SAFE_URL_RE = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;
export const isSafeCmsUrl = (v: string): boolean => v === "" || SAFE_URL_RE.test(v.trim());
const safeUrl = (max = 1000, opts?: { required?: boolean }) => {
  const base = opts?.required
    ? z.string().trim().min(1).max(max)
    : z.string().trim().max(max);
  return base.refine((v) => isSafeCmsUrl(v), {
    message: "الرابط غير صالح — استخدم https:// أو مساراً يبدأ بـ /",
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Site config (one row per company, keyed by companyId — upsert).
// ─────────────────────────────────────────────────────────────────────────
const CONFIG_COLS: Record<string, "jsonb" | "scalar"> = {
  enabled: "scalar", template: "scalar", slug: "scalar", customDomain: "scalar",
  brandName: "scalar", tagline: "scalar", logoUrl: "scalar", primaryColor: "scalar",
  phone: "scalar", whatsapp: "scalar", email: "scalar", address: "scalar", socials: "jsonb",
  heroTitle: "scalar", heroSubtitle: "scalar", heroImageUrl: "scalar",
  aboutTitle: "scalar", aboutBody: "scalar", metaTitle: "scalar", metaDescription: "scalar",
};
const configSchema = z.object({
  enabled: z.boolean().optional(),
  template: z.enum(["standard", "managed"]).optional(),
  slug: slugField.optional(),
  customDomain: nstr(255),
  brandName: nstr(200),
  tagline: nstr(300),
  logoUrl: nstr(1000),
  primaryColor: z.string().trim().max(100).optional(),
  phone: nstr(50),
  whatsapp: nstr(50),
  email: nstr(200),
  address: nstr(500),
  socials: z.record(z.string()).optional(),
  heroTitle: nstr(300),
  heroSubtitle: nstr(500),
  heroImageUrl: nstr(1000),
  aboutTitle: nstr(300),
  aboutBody: nstr(10000),
  metaTitle: nstr(300),
  metaDescription: nstr(500),
});

router.get("/config", authorize({ feature: "website", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery(`SELECT * FROM site_config WHERE "companyId"=$1`, [scope.companyId]);
    res.json(row ?? null);
  } catch (err) { handleRouteError(err, res, "site config get"); }
});

router.put("/config", authorize({ feature: "website", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(configSchema.safeParse(req.body)) as Record<string, unknown>;
    const [existing] = await rawQuery<{ slug: string }>(
      `SELECT slug FROM site_config WHERE "companyId"=$1`, [scope.companyId]);
    const data: Record<string, unknown> = { ...b };
    data.slug = String(data.slug ?? existing?.slug ?? `company-${scope.companyId}`).toLowerCase();

    const cols = Object.keys(data).filter((k) => k in CONFIG_COLS);
    const insertCols = ["companyId", ...cols];
    const vals = [scope.companyId, ...cols.map((k) => (CONFIG_COLS[k] === "jsonb" ? JSON.stringify(data[k]) : data[k]))];
    const placeholders = insertCols.map((_, i) => `$${i + 1}`);
    const updateSet = cols.map((k) => `"${k}"=EXCLUDED."${k}"`).concat(`"updatedAt"=NOW()`).join(", ");
    await rawExecute(
      `INSERT INTO site_config (${insertCols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders.join(",")})
       ON CONFLICT ("companyId") DO UPDATE SET ${updateSet}
       RETURNING "companyId"`,
      vals,
    );
    const [row] = await rawQuery(`SELECT * FROM site_config WHERE "companyId"=$1`, [scope.companyId]);
    auditFromRequest(req, "update", "site_config", scope.companyId, { after: b }).catch((e) => logger.error(e, "site audit failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "site config put"); }
});

// ─────────────────────────────────────────────────────────────────────────
// رفع صورة للموقع (شعار/خلفية/باقة/فندق/غلاف مقال) كملف حقيقي بدل لصق رابط.
// يُستقبل المحتوى بترميز base64، يُتحقّق من النوع والحجم، ثم يُحفظ كملف عام
// يُخدَم عبر /api/storage/public-objects. الرفع خادمي (POST JSON) فيتجاوز قيد
// nginx على طلبات PUT المنتهية بامتداد صورة في الإنتاج.
// ─────────────────────────────────────────────────────────────────────────
// ملاحظة أمنية: SVG مستبعد عمدًا — يمكن أن يحمل سكربتًا ويُخدَم من نفس
// النطاق العام (خطر XSS مخزّن). صور الموقع تكتفي بالصيغ النقطية الآمنة.
const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const uploadImageSchema = z.object({
  dataUrl: z.string().min(1),
  fileName: z.string().trim().max(255).optional(),
});
router.post("/upload-image", authorize({ feature: "website", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(uploadImageSchema.safeParse(req.body));
    const m = /^data:([^;]+);base64,(.*)$/s.exec(b.dataUrl);
    if (!m) throw new ValidationError("صيغة الصورة غير صالحة");
    const contentType = m[1].trim().toLowerCase();
    const ext = IMAGE_EXT_BY_TYPE[contentType];
    if (!ext) throw new ValidationError("نوع الصورة غير مسموح — الرجاء رفع PNG أو JPG أو WEBP أو GIF");
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length === 0) throw new ValidationError("الملف فارغ");
    if (buffer.length > 5 * 1024 * 1024) throw new ValidationError("حجم الصورة يتجاوز 5 ميغابايت");
    const key = await new ObjectStorageService().uploadPublicBytes(buffer, contentType, ext);
    const url = `/api/storage/public-objects/${key}`;
    auditFromRequest(req, "create", "site_media", scope.companyId, {
      after: { url, fileName: b.fileName, size: buffer.length },
    }).catch((e) => logger.error(e, "site upload audit failed"));
    res.status(201).json({ url });
  } catch (err) { handleRouteError(err, res, "site upload image"); }
});

// ─────────────────────────────────────────────────────────────────────────
// Generic content CRUD (packages / services / hotels / posts).
// Table names + column lists are FIXED constants (never client input), so the
// dynamically-built SQL keeps identifiers on a vetted allowlist.
// ─────────────────────────────────────────────────────────────────────────
interface ResourceDef {
  table: string;
  cols: Record<string, "jsonb" | "scalar">;
  schema: z.AnyZodObject;
}

// Shared CRUD handler factories. The route PATHS are registered as string
// literals per resource below (so the static frontend↔backend wiring audit can
// resolve every /api/site/<resource> call); only the handler BODIES are shared,
// keeping identifiers (table + columns) on a vetted compile-time allowlist.

function listHandler(def: ResourceDef) {
  return async (req: Request, res: Response) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `SELECT * FROM ${def.table} WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "sortOrder" ASC, id ASC`,
        [scope.companyId],
      );
      res.json(rows);
    } catch (err) { handleRouteError(err, res, `${def.table} list`); }
  };
}

function getHandler(def: ResourceDef) {
  return async (req: Request, res: Response) => {
    try {
      const scope = req.scope!;
      const [row] = await rawQuery(
        `SELECT * FROM ${def.table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [Number(req.params.id), scope.companyId],
      );
      if (!row) { res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" }); return; }
      res.json(row);
    } catch (err) { handleRouteError(err, res, `${def.table} get`); }
  };
}

function createHandler(def: ResourceDef) {
  return async (req: Request, res: Response) => {
    try {
      const scope = req.scope!;
      const b = zodParse(def.schema.safeParse(req.body)) as Record<string, unknown>;
      const cols = Object.keys(b).filter((k) => k in def.cols);
      const insertCols = ["companyId", ...cols];
      const vals = [scope.companyId, ...cols.map((k) => (def.cols[k] === "jsonb" ? JSON.stringify(b[k]) : b[k]))];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      const { insertId } = await rawExecute(
        `INSERT INTO ${def.table} (${insertCols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders.join(",")})`,
        vals,
      );
      assertInsert(insertId, def.table);
      const [row] = await rawQuery(
        `SELECT * FROM ${def.table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [insertId, scope.companyId],
      );
      auditFromRequest(req, "create", def.table, insertId, { after: b }).catch((e) => logger.error(e, "site audit failed"));
      res.status(201).json(row);
    } catch (err) { handleRouteError(err, res, `${def.table} create`); }
  };
}

function updateHandler(def: ResourceDef) {
  return async (req: Request, res: Response) => {
    try {
      const scope = req.scope!;
      const id = Number(req.params.id);
      const b = zodParse(def.schema.partial().safeParse(req.body)) as Record<string, unknown>;
      const cols = Object.keys(b).filter((k) => k in def.cols);
      if (cols.length === 0) { res.status(400).json({ error: "لا توجد حقول للتحديث", code: "NO_FIELDS" }); return; }
      const setClauses = cols.map((k, i) => `"${k}"=$${i + 1}`);
      const vals = cols.map((k) => (def.cols[k] === "jsonb" ? JSON.stringify(b[k]) : b[k]));
      vals.push(id, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE ${def.table} SET ${setClauses.join(",")}, "updatedAt"=NOW()
         WHERE id=$${cols.length + 1} AND "companyId"=$${cols.length + 2} AND "deletedAt" IS NULL`,
        vals,
      );
      if (!affectedRows) { res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" }); return; }
      const [row] = await rawQuery(
        `SELECT * FROM ${def.table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      auditFromRequest(req, "update", def.table, id, { after: b }).catch((e) => logger.error(e, "site audit failed"));
      res.json(row);
    } catch (err) { handleRouteError(err, res, `${def.table} update`); }
  };
}

function deleteHandler(def: ResourceDef) {
  return async (req: Request, res: Response) => {
    try {
      const scope = req.scope!;
      const id = Number(req.params.id);
      const { affectedRows } = await rawExecute(
        `UPDATE ${def.table} SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!affectedRows) { res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" }); return; }
      auditFromRequest(req, "delete", def.table, id, {}).catch((e) => logger.error(e, "site audit failed"));
      res.json({ ok: true });
    } catch (err) { handleRouteError(err, res, `${def.table} delete`); }
  };
}

const packagesDef: ResourceDef = {
  table: "site_packages",
  cols: {
    slug: "scalar", name: "scalar", subtitle: "scalar", price: "scalar", currency: "scalar",
    durationLabel: "scalar", durationDays: "scalar", badge: "scalar", features: "jsonb",
    notIncluded: "jsonb", imageUrl: "scalar", sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    slug: slugField,
    name: z.string().trim().min(1).max(200),
    subtitle: nstr(300),
    price: z.number().nonnegative().nullable().optional(),
    currency: z.string().trim().max(10).optional(),
    durationLabel: nstr(60),
    durationDays: z.number().int().nonnegative().nullable().optional(),
    badge: nstr(60),
    features: z.array(z.string().max(300)).optional(),
    notIncluded: z.array(z.string().max(300)).optional(),
    imageUrl: nstr(1000),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const servicesDef: ResourceDef = {
  table: "site_services",
  cols: {
    slug: "scalar", title: "scalar", subtitle: "scalar", description: "scalar",
    icon: "scalar", link: "scalar", features: "jsonb", sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    slug: slugField,
    title: z.string().trim().min(1).max(200),
    subtitle: nstr(120),
    description: nstr(1000),
    icon: nstr(40),
    link: nstr(300),
    features: z.array(z.string().max(300)).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const hotelsDef: ResourceDef = {
  table: "site_hotels",
  cols: {
    slug: "scalar", name: "scalar", city: "scalar", distanceLabel: "scalar", stars: "scalar",
    badge: "scalar", imageUrl: "scalar", description: "scalar", sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    slug: slugField,
    name: z.string().trim().min(1).max(200),
    city: nstr(120),
    distanceLabel: nstr(120),
    stars: z.number().int().min(1).max(5).nullable().optional(),
    badge: nstr(60),
    imageUrl: nstr(1000),
    description: nstr(1000),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const postsDef: ResourceDef = {
  table: "site_posts",
  cols: {
    slug: "scalar", title: "scalar", excerpt: "scalar", body: "scalar",
    coverImageUrl: "scalar", status: "scalar", publishedAt: "scalar", sortOrder: "scalar",
  },
  schema: z.object({
    slug: slugField,
    title: z.string().trim().min(1).max(300),
    excerpt: nstr(600),
    body: z.string().max(50000).nullable().optional(),
    coverImageUrl: nstr(1000),
    status: z.enum(["draft", "published"]).optional(),
    publishedAt: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
};

const faqsDef: ResourceDef = {
  table: "site_faqs",
  cols: {
    question: "scalar", answer: "scalar", category: "scalar",
    sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1).max(5000),
    category: nstr(120),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const testimonialsDef: ResourceDef = {
  table: "site_testimonials",
  cols: {
    authorName: "scalar", authorTitle: "scalar", body: "scalar", rating: "scalar",
    avatarUrl: "scalar", sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    authorName: z.string().trim().min(1).max(200),
    authorTitle: nstr(200),
    body: z.string().trim().min(1).max(2000),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    avatarUrl: nstr(1000),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const teamDef: ResourceDef = {
  table: "site_team",
  cols: {
    name: "scalar", role: "scalar", bio: "scalar", photoUrl: "scalar", socials: "jsonb",
    sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    name: z.string().trim().min(1).max(200),
    role: nstr(200),
    bio: nstr(2000),
    photoUrl: nstr(1000),
    socials: z.record(z.string()).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const galleryDef: ResourceDef = {
  table: "site_gallery",
  cols: {
    title: "scalar", imageUrl: "scalar", category: "scalar",
    sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    title: nstr(300),
    imageUrl: z.string().trim().min(1).max(1000),
    category: nstr(120),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const bannersDef: ResourceDef = {
  table: "site_banners",
  cols: {
    title: "scalar", message: "scalar", ctaLabel: "scalar", ctaUrl: "scalar",
    imageUrl: "scalar", bgColor: "scalar", startsAt: "scalar", endsAt: "scalar",
    sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    title: z.string().trim().min(1).max(300),
    message: nstr(600),
    ctaLabel: nstr(120),
    ctaUrl: safeUrl(1000).nullable().optional(),
    imageUrl: nstr(1000),
    bgColor: nstr(100),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

const navItemsDef: ResourceDef = {
  table: "site_nav_items",
  cols: {
    label: "scalar", url: "scalar", openInNewTab: "scalar",
    sortOrder: "scalar", isActive: "scalar",
  },
  schema: z.object({
    label: z.string().trim().min(1).max(120),
    url: safeUrl(1000, { required: true }),
    openInNewTab: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

// Packages
router.get("/packages", authorize({ feature: "website", action: "list" }), listHandler(packagesDef));
router.get("/packages/:id", authorize({ feature: "website", action: "view" }), getHandler(packagesDef));
router.post("/packages", authorize({ feature: "website", action: "create" }), createHandler(packagesDef));
router.put("/packages/:id", authorize({ feature: "website", action: "update" }), updateHandler(packagesDef));
router.delete("/packages/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(packagesDef));

// Services
router.get("/services", authorize({ feature: "website", action: "list" }), listHandler(servicesDef));
router.get("/services/:id", authorize({ feature: "website", action: "view" }), getHandler(servicesDef));
router.post("/services", authorize({ feature: "website", action: "create" }), createHandler(servicesDef));
router.put("/services/:id", authorize({ feature: "website", action: "update" }), updateHandler(servicesDef));
router.delete("/services/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(servicesDef));

// Hotels
router.get("/hotels", authorize({ feature: "website", action: "list" }), listHandler(hotelsDef));
router.get("/hotels/:id", authorize({ feature: "website", action: "view" }), getHandler(hotelsDef));
router.post("/hotels", authorize({ feature: "website", action: "create" }), createHandler(hotelsDef));
router.put("/hotels/:id", authorize({ feature: "website", action: "update" }), updateHandler(hotelsDef));
router.delete("/hotels/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(hotelsDef));

// Blog posts
router.get("/posts", authorize({ feature: "website", action: "list" }), listHandler(postsDef));
router.get("/posts/:id", authorize({ feature: "website", action: "view" }), getHandler(postsDef));
router.post("/posts", authorize({ feature: "website", action: "create" }), createHandler(postsDef));
router.put("/posts/:id", authorize({ feature: "website", action: "update" }), updateHandler(postsDef));
router.delete("/posts/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(postsDef));

// FAQ
router.get("/faqs", authorize({ feature: "website", action: "list" }), listHandler(faqsDef));
router.get("/faqs/:id", authorize({ feature: "website", action: "view" }), getHandler(faqsDef));
router.post("/faqs", authorize({ feature: "website", action: "create" }), createHandler(faqsDef));
router.put("/faqs/:id", authorize({ feature: "website", action: "update" }), updateHandler(faqsDef));
router.delete("/faqs/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(faqsDef));

// Testimonials
router.get("/testimonials", authorize({ feature: "website", action: "list" }), listHandler(testimonialsDef));
router.get("/testimonials/:id", authorize({ feature: "website", action: "view" }), getHandler(testimonialsDef));
router.post("/testimonials", authorize({ feature: "website", action: "create" }), createHandler(testimonialsDef));
router.put("/testimonials/:id", authorize({ feature: "website", action: "update" }), updateHandler(testimonialsDef));
router.delete("/testimonials/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(testimonialsDef));

// Team members
router.get("/team", authorize({ feature: "website", action: "list" }), listHandler(teamDef));
router.get("/team/:id", authorize({ feature: "website", action: "view" }), getHandler(teamDef));
router.post("/team", authorize({ feature: "website", action: "create" }), createHandler(teamDef));
router.put("/team/:id", authorize({ feature: "website", action: "update" }), updateHandler(teamDef));
router.delete("/team/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(teamDef));

// Gallery
router.get("/gallery", authorize({ feature: "website", action: "list" }), listHandler(galleryDef));
router.get("/gallery/:id", authorize({ feature: "website", action: "view" }), getHandler(galleryDef));
router.post("/gallery", authorize({ feature: "website", action: "create" }), createHandler(galleryDef));
router.put("/gallery/:id", authorize({ feature: "website", action: "update" }), updateHandler(galleryDef));
router.delete("/gallery/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(galleryDef));

// Campaign banners
router.get("/banners", authorize({ feature: "website", action: "list" }), listHandler(bannersDef));
router.get("/banners/:id", authorize({ feature: "website", action: "view" }), getHandler(bannersDef));
router.post("/banners", authorize({ feature: "website", action: "create" }), createHandler(bannersDef));
router.put("/banners/:id", authorize({ feature: "website", action: "update" }), updateHandler(bannersDef));
router.delete("/banners/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(bannersDef));

// Navigation menu
router.get("/nav-items", authorize({ feature: "website", action: "list" }), listHandler(navItemsDef));
router.get("/nav-items/:id", authorize({ feature: "website", action: "view" }), getHandler(navItemsDef));
router.post("/nav-items", authorize({ feature: "website", action: "create" }), createHandler(navItemsDef));
router.put("/nav-items/:id", authorize({ feature: "website", action: "update" }), updateHandler(navItemsDef));
router.delete("/nav-items/:id", authorize({ feature: "website", action: "delete" }), deleteHandler(navItemsDef));

export default router;
