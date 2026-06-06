// P4 — admin surface for the per-feature subscription system.
//
// Backs the SPA at /admin/subscription-features. Five endpoints:
//
//   GET    /products                    — list every sellable product
//   GET    /features                    — list every feature (joined to product)
//   GET    /companies/:id/features      — per-company entitlement matrix
//   POST   /companies/:id/features/:key — activate / extend a feature
//   DELETE /companies/:id/features/:key — deactivate a feature
//
// Mounts under /admin (level 90 + module=admin) — same gate as the
// rest of admin.ts.
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, zodParse, parseId } from "../lib/errorHandler.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { invalidateFeatureGateCache } from "../middlewares/featureGate.js";
import { logger } from "../lib/logger.js";

const router = Router();

const VALID_STATUSES = new Set(["active", "trial", "expired", "cancelled"]);

const upsertSchema = z.object({
  status: z.enum(["active", "trial", "expired", "cancelled"]),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

// ─── catalog reads ──────────────────────────────────────────────────────

router.get("/products", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
  try {
    const rows = await rawQuery<{
      id: number;
      productKey: string;
      labelAr: string;
      labelEn: string | null;
      descriptionAr: string | null;
      displayOrder: number;
      isActive: boolean;
    }>(
      `SELECT id, "productKey", "labelAr", "labelEn", "descriptionAr",
              "displayOrder", "isActive"
         FROM subscription_products
        ORDER BY "displayOrder", "productKey"`,
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "admin/subscription-features products");
  }
});

router.get("/features", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
  try {
    const rows = await rawQuery<{
      id: number;
      featureKey: string;
      productKey: string;
      labelAr: string;
      labelEn: string | null;
      isCoreToProduct: boolean;
      displayOrder: number;
    }>(
      `SELECT f.id, f."featureKey", p."productKey", f."labelAr", f."labelEn",
              f."isCoreToProduct", f."displayOrder"
         FROM subscription_features f
         JOIN subscription_products p ON p.id = f."productId"
        ORDER BY p."displayOrder", f."displayOrder", f."featureKey"`,
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "admin/subscription-features features");
  }
});

// ─── per-company entitlement matrix ─────────────────────────────────────
// Returns the full feature catalog left-joined with the company's
// entitlement row, so the UI can show every feature (greyed if not
// provisioned) and a single toggle per row.

router.get("/companies/:id/features", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const companyId = parseId(req.params.id, "companyId");

    const rows = await rawQuery<{
      featureKey: string;
      productKey: string;
      labelAr: string;
      isCoreToProduct: boolean;
      status: string | null;
      enabledAt: string | null;
      expiresAt: string | null;
    }>(
      `SELECT f."featureKey", p."productKey", f."labelAr", f."isCoreToProduct",
              c.status, c."enabledAt", c."expiresAt"
         FROM subscription_features f
         JOIN subscription_products p ON p.id = f."productId"
         LEFT JOIN company_subscription_features c
                ON c."featureKey" = f."featureKey" AND c."companyId" = $1
        ORDER BY p."displayOrder", f."displayOrder", f."featureKey"`,
      [companyId],
    );
    res.json({ companyId, data: rows });
  } catch (err) {
    handleRouteError(err, res, "admin/subscription-features company-matrix");
  }
});

// ─── activate / extend a feature for a company ──────────────────────────

router.post("/companies/:id/features/:key", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const companyId = parseId(req.params.id, "companyId");
    const featureKey = String(req.params.key ?? "");

    if (!featureKey || featureKey.length > 120 || !/^[a-z0-9_.-]+$/i.test(featureKey)) {
      throw new ValidationError("featureKey غير صالح");
    }

    const body = zodParse(upsertSchema.safeParse(req.body));

    // Reject unknown feature key — the catalog is the source of truth.
    const [knownRow] = await rawQuery<{ featureKey: string }>(
      `SELECT "featureKey" FROM subscription_features WHERE "featureKey" = $1`,
      [featureKey],
    );
    if (!knownRow) {
      throw new ValidationError(`featureKey "${featureKey}" غير موجود في الكاتالوج`);
    }

    await rawExecute(
      `INSERT INTO company_subscription_features
         ("companyId", "featureKey", status, "expiresAt", notes,
          "lastChangedBy", "lastChangedAt", "enabledAt")
       VALUES ($1, $2, $3::varchar, $4::timestamptz, $5, $6, now(), now())
       ON CONFLICT ("companyId", "featureKey") DO UPDATE
         SET status         = EXCLUDED.status,
             "expiresAt"    = EXCLUDED."expiresAt",
             notes          = COALESCE(EXCLUDED.notes, company_subscription_features.notes),
             "lastChangedBy" = EXCLUDED."lastChangedBy",
             "lastChangedAt" = now()`,
      [companyId, featureKey, body.status, body.expiresAt ?? null, body.notes ?? null, scope.userId],
    );

    invalidateFeatureGateCache(companyId, featureKey);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "company_subscription_features",
      entityId: companyId,
      after: { featureKey, status: body.status, expiresAt: body.expiresAt ?? null },
    }).catch((e) => logger.error(e, "subscription-feature upsert audit failed"));

    res.json({ ok: true, companyId, featureKey, status: body.status });
  } catch (err) {
    handleRouteError(err, res, "admin/subscription-features upsert");
  }
});

// ─── deactivate (mark cancelled) ─────────────────────────────────────────

router.delete("/companies/:id/features/:key", authorize({ feature: "admin", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const companyId = parseId(req.params.id, "companyId");
    const featureKey = String(req.params.key ?? "");

    if (!featureKey || featureKey.length > 120 || !/^[a-z0-9_.-]+$/i.test(featureKey)) {
      throw new ValidationError("featureKey غير صالح");
    }

    const result = await rawExecute(
      `UPDATE company_subscription_features
          SET status = 'cancelled',
              "lastChangedBy" = $3,
              "lastChangedAt" = now()
        WHERE "companyId" = $1 AND "featureKey" = $2`,
      [companyId, featureKey, scope.userId],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: "لا يوجد سجل اشتراك لهذه الميزة لدى الشركة" });
      return;
    }

    invalidateFeatureGateCache(companyId, featureKey);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "company_subscription_features",
      entityId: companyId,
      after: { featureKey, status: "cancelled" },
    }).catch((e) => logger.error(e, "subscription-feature cancel audit failed"));

    res.json({ ok: true, companyId, featureKey, status: "cancelled" });
  } catch (err) {
    handleRouteError(err, res, "admin/subscription-features cancel");
  }
});

// Defensive export of the whitelist so a smoke test can assert it's
// kept in sync with the migration.
export const FEATURE_STATUS_WHITELIST = VALID_STATUSES;

export default router;
