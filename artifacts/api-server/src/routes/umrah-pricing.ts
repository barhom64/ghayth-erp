// ─────────────────────────────────────────────────────────────────────────────
// umrah-pricing.ts — UMRAH PRICING (U-07 Phase 7)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(pricingRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/pricing...).
//
// Pure code move — handlers, schemas, RBAC are carried over VERBATIM
// (no behaviour change). Audit calls converted to auditFromRequest per the
// IGOC ratchet (auditIgocContextCoverageRatchet.test.ts) — new route files
// must not use the legacy direct audit helper.
//
// Routes owned here:
//   GET    /pricing
//   POST   /pricing
//   PATCH  /pricing/:id
//   DELETE /pricing/:id
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const createPricingSchema = z.object({
  agentId: z.coerce.number({ required_error: "الوكيل مطلوب" }),
  pricePerMutamer: z.coerce.number({ required_error: "السعر مطلوب" }),
  validFrom: z.string().min(1, "تاريخ البدء مطلوب"),
  validTo: z.string().min(1, "تاريخ الانتهاء مطلوب"),
  subAgentId: z.coerce.number().optional(),
  seasonId: z.coerce.number().optional(),
  includesHotel: z.boolean().optional(),
  includesTransport: z.boolean().optional(),
  notes: z.string().optional(),
}).refine((d) => d.validTo >= d.validFrom, { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", path: ["validTo"] });

const updatePricingSchema = z.object({
  subAgentId: z.coerce.number().nullable().optional(),
  agentId: z.coerce.number().optional(),
  seasonId: z.coerce.number().nullable().optional(),
  pricePerMutamer: z.coerce.number().optional(),
  includesHotel: z.boolean().optional(),
  includesTransport: z.boolean().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  notes: z.string().nullable().optional(),
});

// ============================================================================
// PRICING
// ============================================================================

router.get("/pricing", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT p.*, a.name AS "agentName", sa.name AS "subAgentName", s.title AS "seasonTitle"
       FROM umrah_pricing p
       LEFT JOIN umrah_agents a ON p."agentId" = a.id
                                AND a."companyId" = p."companyId"
                                AND a."deletedAt" IS NULL
       LEFT JOIN umrah_sub_agents sa ON p."subAgentId" = sa.id
                                AND sa."companyId" = p."companyId"
                                AND sa."deletedAt" IS NULL
       LEFT JOIN umrah_seasons s ON p."seasonId" = s.id AND s."companyId" = p."companyId" AND s."deletedAt" IS NULL
       WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
       ORDER BY p."validFrom" DESC
       LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List pricing"); }
});

router.post("/pricing", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createPricingSchema.safeParse(req.body));
    const b = parsed;
    const overlap = await rawQuery(
      `SELECT id FROM umrah_pricing
       WHERE "companyId" = $1 AND "agentId" = $2 AND "deletedAt" IS NULL
         AND (("subAgentId" IS NULL AND $3::int IS NULL) OR "subAgentId" = $3)
         AND (("seasonId" IS NULL AND $4::int IS NULL) OR "seasonId" = $4)
         AND "validFrom" <= $6 AND "validTo" >= $5`,
      [scope.companyId, b.agentId, b.subAgentId || null, b.seasonId || null, b.validFrom, b.validTo]
    );
    if (overlap.length > 0) {
      throw new ConflictError("يوجد تداخل في فترات الأسعار لنفس الوكيل والموسم", { field: "validFrom" });
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_pricing
       ("companyId","branchId","subAgentId","agentId","seasonId","pricePerMutamer",
        "includesHotel","includesTransport","validFrom","validTo",notes,"createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING *`,
      [scope.companyId, scope.branchId, b.subAgentId || null, b.agentId, b.seasonId || null,
       b.pricePerMutamer, b.includesHotel ?? false, b.includesTransport ?? false,
       b.validFrom, b.validTo, b.notes || null, scope.userId]
    );
    auditFromRequest(req, "create", "umrah_pricing", rows[0].id, { after: b }).catch((e) => logger.error(e, "umrah-pricing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.created", entity: "umrah_pricing", entityId: rows[0]?.id, details: JSON.stringify({ agentId: b.agentId, pricePerMutamer: b.pricePerMutamer }) }).catch((e) => logger.error(e, "umrah-pricing background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create pricing"); }
});

router.patch("/pricing/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updatePricingSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: unknown[] = [];
    const sets: string[] = [];
    for (const key of ["subAgentId","agentId","seasonId","pricePerMutamer","includesHotel","includesTransport","validFrom","validTo","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    if (b.validFrom || b.validTo) {
      const [current] = await rawQuery(`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (current) {
        const vf = b.validFrom || current.validFrom;
        const vt = b.validTo || current.validTo;
        // re-validate ordering against the effective (merged) values — a partial
        // update must not place validFrom after validTo. This also keeps the
        // overlap query below correct (it assumes validFrom <= validTo).
        if (new Date(vt).getTime() < new Date(vf).getTime()) {
          throw new ValidationError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", { field: "validTo" });
        }
        const agId = b.agentId ?? current.agentId;
        const saId = b.subAgentId ?? current.subAgentId;
        const sId = b.seasonId ?? current.seasonId;
        const overlap = await rawQuery(
          `SELECT id FROM umrah_pricing
           WHERE "companyId" = $1 AND "agentId" = $2 AND "deletedAt" IS NULL AND id != $3
             AND (("subAgentId" IS NULL AND $4::int IS NULL) OR "subAgentId" = $4)
             AND (("seasonId" IS NULL AND $5::int IS NULL) OR "seasonId" = $5)
             AND "validFrom" <= $7 AND "validTo" >= $6`,
          [scope.companyId, agId, id, saId || null, sId || null, vf, vt]
        );
        if (overlap.length > 0) {
          throw new ConflictError("يوجد تداخل في فترات الأسعار لنفس الوكيل والموسم", { field: "validFrom" });
        }
      }
    }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE umrah_pricing SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("التسعير غير موجود");
    const [row] = await rawQuery(`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    auditFromRequest(req, "update", "umrah_pricing", id, { after: b }).catch((e) => logger.error(e, "umrah-pricing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.updated", entity: "umrah_pricing", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah-pricing background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update pricing"); }
});

router.delete("/pricing/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE umrah_pricing SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.userId, id, scope.companyId]
    );
    auditFromRequest(req, "delete", "umrah_pricing", id, {}).catch((e) => logger.error(e, "umrah-pricing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.deleted", entity: "umrah_pricing", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah-pricing background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete pricing"); }
});

export default router;
