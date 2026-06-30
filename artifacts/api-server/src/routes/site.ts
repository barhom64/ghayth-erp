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
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { zodParse, handleRouteError } from "../lib/errorHandler.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const slugField = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/i, "المعرّف يجب أن يحتوي على حروف لاتينية وأرقام وشرطات فقط");
const nstr = (max = 500) => z.string().trim().max(max).nullable().optional();

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
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "site_config", entityId: scope.companyId, after: b,
    }).catch((e) => logger.error(e, "site audit failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "site config put"); }
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

function registerCrud(base: string, def: ResourceDef): void {
  const { table } = def;

  router.get(base, authorize({ feature: "website", action: "list" }), async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `SELECT * FROM ${table} WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "sortOrder" ASC, id ASC`,
        [scope.companyId],
      );
      res.json(rows);
    } catch (err) { handleRouteError(err, res, `${table} list`); }
  });

  router.get(`${base}/:id`, authorize({ feature: "website", action: "view" }), async (req, res) => {
    try {
      const scope = req.scope!;
      const [row] = await rawQuery(
        `SELECT * FROM ${table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [Number(req.params.id), scope.companyId],
      );
      if (!row) { res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" }); return; }
      res.json(row);
    } catch (err) { handleRouteError(err, res, `${table} get`); }
  });

  router.post(base, authorize({ feature: "website", action: "create" }), async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(def.schema.safeParse(req.body)) as Record<string, unknown>;
      const cols = Object.keys(b).filter((k) => k in def.cols);
      const insertCols = ["companyId", ...cols];
      const vals = [scope.companyId, ...cols.map((k) => (def.cols[k] === "jsonb" ? JSON.stringify(b[k]) : b[k]))];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      const { insertId } = await rawExecute(
        `INSERT INTO ${table} (${insertCols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders.join(",")})`,
        vals,
      );
      assertInsert(insertId, table);
      const [row] = await rawQuery(
        `SELECT * FROM ${table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [insertId, scope.companyId],
      );
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "create", entity: table, entityId: insertId, after: b,
      }).catch((e) => logger.error(e, "site audit failed"));
      res.status(201).json(row);
    } catch (err) { handleRouteError(err, res, `${table} create`); }
  });

  router.put(`${base}/:id`, authorize({ feature: "website", action: "update" }), async (req, res) => {
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
        `UPDATE ${table} SET ${setClauses.join(",")}, "updatedAt"=NOW()
         WHERE id=$${cols.length + 1} AND "companyId"=$${cols.length + 2} AND "deletedAt" IS NULL`,
        vals,
      );
      if (!affectedRows) { res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" }); return; }
      const [row] = await rawQuery(
        `SELECT * FROM ${table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "update", entity: table, entityId: id, after: b,
      }).catch((e) => logger.error(e, "site audit failed"));
      res.json(row);
    } catch (err) { handleRouteError(err, res, `${table} update`); }
  });

  router.delete(`${base}/:id`, authorize({ feature: "website", action: "delete" }), async (req, res) => {
    try {
      const scope = req.scope!;
      const id = Number(req.params.id);
      const { affectedRows } = await rawExecute(
        `UPDATE ${table} SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!affectedRows) { res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" }); return; }
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "delete", entity: table, entityId: id,
      }).catch((e) => logger.error(e, "site audit failed"));
      res.json({ ok: true });
    } catch (err) { handleRouteError(err, res, `${table} delete`); }
  });
}

registerCrud("/packages", {
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
});

registerCrud("/services", {
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
});

registerCrud("/hotels", {
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
});

registerCrud("/posts", {
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
});

export default router;
