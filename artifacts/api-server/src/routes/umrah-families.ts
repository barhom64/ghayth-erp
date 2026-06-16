// ─────────────────────────────────────────────────────────────────────────────
// umrah-families.ts — UMRAH FAMILIES (migration 265)
//
// U-07 (umrah-entities.ts split, Phase 2): the 5 families CRUD routes
// live in a dedicated module so the parent `umrah-entities.ts` keeps
// shrinking. The sub-router is mounted from umrah-entities.ts via
// `router.use(familiesRouter)` so the API surface stays identical
// (paths still resolve at /umrah/families/...).
//
// Routes owned here:
//   GET    /families
//   GET    /families/:id
//   POST   /families
//   PATCH  /families/:id
//   DELETE /families/:id
//
// Domain notes (verbatim from the parent banner):
//   Family grouping for pilgrims — a husband, wife, kids, sometimes
//   grandparents share a trip + room + bus seats + emergency contact.
//   The pilgrim record links back via `umrah_pilgrims.familyId`. Future
//   PRs add: hotel allocation aware of families, manifest grouped by
//   family, family-level visa workflow.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const createFamilySchema = z.object({
  familyName: z.string().min(1, "اسم العائلة مطلوب"),
  headPilgrimId: z.coerce.number().int().positive().optional(),
  contactPhone: z.string().optional(),
  contactName: z.string().optional(),
  notes: z.string().optional(),
});

const updateFamilySchema = z.object({
  familyName: z.string().min(1).optional(),
  headPilgrimId: z.coerce.number().int().positive().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/families", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as Record<string, string | undefined>;
    let where = `f."companyId" = $1 AND f."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (f."familyName" ILIKE $${params.length} OR f."contactName" ILIKE $${params.length} OR f."contactPhone" ILIKE $${params.length})`;
    }
    // Aggregate the member count + the head's name in the same query
    // so the list page renders "عائلة الفلاني — ٥ أفراد" without a
    // round-trip per row.
    const rows = await rawQuery(
      `SELECT f.*,
              head."fullName" AS "headPilgrimName",
              (SELECT COUNT(*)::int FROM umrah_pilgrims p
                WHERE p."familyId" = f.id AND p."companyId" = f."companyId" AND p."deletedAt" IS NULL) AS "memberCount"
         FROM umrah_families f
    LEFT JOIN umrah_pilgrims head
           ON head.id = f."headPilgrimId"
          AND head."companyId" = f."companyId"
          AND head."deletedAt" IS NULL
        WHERE ${where}
        ORDER BY f."familyName"
        LIMIT 500`,
      params,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List families"); }
});

router.get("/families/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [family] = await rawQuery(
      `SELECT f.*,
              head."fullName" AS "headPilgrimName"
         FROM umrah_families f
    LEFT JOIN umrah_pilgrims head
           ON head.id = f."headPilgrimId"
          AND head."companyId" = f."companyId"
          AND head."deletedAt" IS NULL
        WHERE f.id = $1 AND f."companyId" = $2 AND f."deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!family) throw new NotFoundError("العائلة غير موجودة");
    // Members list — short projection mirroring what the list page
    // shows (name + passport + arrival/departure for context).
    const members = await rawQuery(
      `SELECT id, "fullName", "passportNumber", "nuskNumber", nationality, status,
              "arrivalDate", "departureDate"
         FROM umrah_pilgrims
        WHERE "familyId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        ORDER BY "fullName"`,
      [id, scope.companyId],
    );
    res.json(maskFields(req, { ...family, members }));
  } catch (err) { handleRouteError(err, res, "Family detail"); }
});

router.post("/families", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createFamilySchema.safeParse(req.body));
    // If a head pilgrim is named, verify the row exists + belongs to
    // the same tenant. Otherwise an operator could be tricked into
    // pointing the family head at another company's pilgrim row via
    // a stale FK number, leaking the head's name into our tenant.
    if (b.headPilgrimId) {
      const [head] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.headPilgrimId, scope.companyId],
      );
      if (!head) throw new ValidationError("رئيس العائلة غير موجود في النظام", { field: "headPilgrimId" });
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_families
       ("companyId","familyName","headPilgrimId","contactPhone","contactName",notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [scope.companyId, b.familyName, b.headPilgrimId ?? null, b.contactPhone ?? null, b.contactName ?? null, b.notes ?? null],
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء العائلة");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "umrah_families", entityId: rows[0].id as number,
      after: { familyName: b.familyName, headPilgrimId: b.headPilgrimId ?? null },
    }).catch((e) => logger.error(e, "umrah-families background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.family.created", entity: "umrah_families", entityId: rows[0].id as number,
      details: JSON.stringify({ familyName: b.familyName }),
    }).catch((e) => logger.error(e, "umrah-families background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create family"); }
});

router.patch("/families/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateFamilySchema.safeParse(req.body));
    if (b.headPilgrimId) {
      const [head] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.headPilgrimId, scope.companyId],
      );
      if (!head) throw new ValidationError("رئيس العائلة غير موجود في النظام", { field: "headPilgrimId" });
    }
    // Build the SET clause from the keys actually present in the body
    // so a single-field update doesn't blank the others.
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`"${col}" = $${params.length}`);
    };
    if (b.familyName !== undefined) push("familyName", b.familyName);
    if (b.headPilgrimId !== undefined) push("headPilgrimId", b.headPilgrimId);
    if (b.contactPhone !== undefined) push("contactPhone", b.contactPhone);
    if (b.contactName !== undefined) push("contactName", b.contactName);
    if (b.notes !== undefined) push("notes", b.notes);
    if (sets.length === 0) {
      res.json({ ok: true, changed: 0 });
      return;
    }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    const result = await rawExecute(
      `UPDATE umrah_families
          SET ${sets.join(", ")}
        WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
      params,
    );
    if (result.affectedRows === 0) throw new NotFoundError("العائلة غير موجودة");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "umrah_families", entityId: id,
      after: b,
    }).catch((e) => logger.error(e, "umrah-families background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Update family"); }
});

router.delete("/families/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Soft delete — same pattern every other umrah entity uses. The
    // pilgrims keep their data; only the back-pointer goes stale,
    // and the SET NULL FK on `umrah_pilgrims.familyId` handles
    // hard-delete races gracefully (no orphan references).
    const result = await rawExecute(
      `UPDATE umrah_families
          SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("العائلة غير موجودة");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "umrah_families", entityId: id, after: null,
    }).catch((e) => logger.error(e, "umrah-families background task failed"));
    res.status(204).end();
  } catch (err) { handleRouteError(err, res, "Delete family"); }
});

export default router;
