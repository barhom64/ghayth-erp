/**
 * Umrah Entities + Import + Commissions Router — Phase 4.
 *
 * Mounted at `/api/umrah` AFTER the legacy `routes/umrah.ts` router so
 * the existing 24 endpoints keep working unchanged. Every path here is a
 * NEW endpoint that the spec calls for and that doesn't exist in the
 * legacy file:
 *
 *   * sub-agents / pricing / violations / nusk-invoices CRUD
 *   * groups + mutamers list/detail (read-only — created via import)
 *   * commission-plans + tiers CRUD + simulate + calculate
 *   * import preview / confirm / reject / batch list / batch changes
 *   * sub-agent statements (detailed + summary)
 *
 * Conventions inherited from the rest of the API server:
 *   * raw SQL via rawQuery / rawExecute / withTransaction
 *   * typed errors (ValidationError / NotFoundError / ConflictError)
 *     so handleRouteError maps them to {error,code,status} verbatim
 *   * RBAC via requirePermission(...) — every route checks
 *     `umrah:read` / `umrah:write` so the existing role catalog applies
 *   * audit + events fired through createAuditLog / emitEvent — same
 *     listeners as every other domain
 *   * Zod for body validation; coerce.* + Arabic error strings to match
 *     the legacy file's existing schemas
 *   * scope.companyId / scope.branchId on every read AND write
 */

import { Router } from "express";
import express from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../lib/errorHandler.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import {
  previewMutamersImport,
  previewVouchersImport,
  confirmImport,
  rejectBatch,
  type ImportScope,
} from "../lib/umrahImportEngine.js";
import {
  simulateCommission,
  calculateCommissionForEmployee,
  calculateCommissionsForMonth,
  listEmployeeCommissionHistory,
  type CommissionScope,
  type CommissionPeriod,
  type CommissionPlanRules,
  type CommissionTier,
  type SimulateInput,
} from "../lib/umrahCommissionEngine.js";
import {
  generateUmrahSalesInvoice,
  type FinanceScope,
} from "../lib/umrahFinanceLink.js";

const router = Router();
router.use(authMiddleware);

// Per-route body parser used for the import preview endpoints — Excel
// files arrive as a base64 dataUrl that can exceed the 10 MB app-wide
// limit. We bump it to 50 MB only on these two routes.
const largeJson = express.json({ limit: "50mb" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeBase64Buffer(input: string): Buffer {
  if (typeof input !== "string" || input.length === 0) {
    throw new ValidationError("الملف غير صالح أو فارغ");
  }
  // Strip the optional data URL prefix.
  const idx = input.indexOf("base64,");
  const b64 = idx >= 0 ? input.slice(idx + 7) : input;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    throw new ValidationError("تعذّر فك ترميز الملف");
  }
}

const idParam = z.coerce.number().int().positive();

// ===========================================================================
// SUB-AGENTS
// ===========================================================================

const subAgentBodySchema = z.object({
  name: z.string().min(1, "اسم الوكيل الفرعي مطلوب"),
  nuskCode: z.string().optional().nullable(),
  agentId: z.coerce.number().int().positive().optional().nullable(),
  clientId: z.coerce.number().int().positive().optional().nullable(),
  paymentTerms: z.enum(["prepaid", "postpaid", "partial"]).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

router.get("/sub-agents", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const linkedOnly = req.query.linked === "true";
    const unlinkedOnly = req.query.unlinked === "true";
    const agentId = req.query.agentId ? Number(req.query.agentId) : null;

    const where: string[] = [`s."companyId"=$1`, `s."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (linkedOnly) where.push(`s."clientId" IS NOT NULL`);
    if (unlinkedOnly) where.push(`s."clientId" IS NULL`);
    if (agentId) { params.push(agentId); where.push(`s."agentId"=$${params.length}`); }

    const rows = await rawQuery(
      `SELECT s.*, a.name AS "agentName", a.country, c.name AS "clientName"
         FROM umrah_sub_agents s
         LEFT JOIN umrah_agents a ON a.id = s."agentId"
         LEFT JOIN clients c ON c.id = s."clientId"
        WHERE ${where.join(" AND ")}
        ORDER BY s.name ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List sub-agents"); }
});

router.get("/sub-agents/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT s.*, a.name AS "agentName", a.country, c.name AS "clientName"
         FROM umrah_sub_agents s
         LEFT JOIN umrah_agents a ON a.id = s."agentId"
         LEFT JOIN clients c ON c.id = s."clientId"
        WHERE s.id=$1 AND s."companyId"=$2 AND s."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الوكيل الفرعي غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get sub-agent"); }
});

router.post("/sub-agents", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = subAgentBodySchema.parse(req.body);

    if (body.clientId) {
      const [c] = await rawQuery<any>(
        `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [body.clientId, scope.companyId]
      );
      if (!c) throw new ValidationError("العميل غير موجود", { field: "clientId" });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO umrah_sub_agents
         ("companyId","branchId",name,"nuskCode","agentId","clientId","paymentTerms",
          "isActive",notes,"createdBy","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
      [
        scope.companyId, scope.branchId, body.name, body.nuskCode ?? null,
        body.agentId ?? null, body.clientId ?? null, body.paymentTerms ?? "postpaid",
        body.isActive ?? true, body.notes ?? null, scope.userId,
      ]
    );

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "umrah_sub_agents", entityId: insertId, after: body,
    });
    if (body.clientId) {
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "umrah.agent.linked", entity: "umrah_sub_agents", entityId: insertId,
        details: JSON.stringify({ clientId: body.clientId }),
      });
    }
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Create sub-agent"); }
});

router.patch("/sub-agents/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const body = subAgentBodySchema.partial().parse(req.body);

    const [existing] = await rawQuery<any>(
      `SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الوكيل الفرعي غير موجود");

    if (body.clientId) {
      const [c] = await rawQuery<any>(
        `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [body.clientId, scope.companyId]
      );
      if (!c) throw new ValidationError("العميل غير موجود", { field: "clientId" });
    }

    const sets: string[] = [];
    const params: any[] = [];
    const cols: Record<string, any> = {
      name: body.name, nuskCode: body.nuskCode, agentId: body.agentId, clientId: body.clientId,
      paymentTerms: body.paymentTerms, isActive: body.isActive, notes: body.notes,
    };
    for (const [k, v] of Object.entries(cols)) {
      if (v !== undefined) { params.push(v); sets.push(`"${k}"=$${params.length}`); }
    }
    if (sets.length === 0) { res.json({ id }); return; }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id, scope.companyId);

    await rawExecute(
      `UPDATE umrah_sub_agents SET ${sets.join(",")}
        WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
      params
    );

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "umrah_sub_agents", entityId: id,
      before: existing, after: body,
    });
    if (body.clientId && body.clientId !== existing.clientId) {
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "umrah.agent.linked", entity: "umrah_sub_agents", entityId: id,
        details: JSON.stringify({ clientId: body.clientId, previousClientId: existing.clientId }),
      });
    }
    res.json({ id });
  } catch (err) { handleRouteError(err, res, "Update sub-agent"); }
});

router.delete("/sub-agents/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    // Soft-delete only when there are no active groups using it.
    const [{ activeGroups }] = await rawQuery<{ activeGroups: number }>(
      `SELECT COUNT(*)::int AS "activeGroups" FROM umrah_groups
        WHERE "subAgentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL
          AND status NOT IN ('settled','closed')`,
      [id, scope.companyId]
    );
    if (Number(activeGroups) > 0) {
      throw new ConflictError(
        `لا يمكن حذف الوكيل الفرعي — لديه ${activeGroups} مجموعة نشطة`,
        { meta: { blockers: [`activeGroups=${activeGroups}`] } }
      );
    }
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_sub_agents SET "deletedAt"=NOW(), "updatedBy"=$3, "updatedAt"=NOW()
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId, scope.userId]
    );
    if (affectedRows === 0) throw new NotFoundError("الوكيل الفرعي غير موجود");
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "umrah_sub_agents", entityId: id,
    });
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Delete sub-agent"); }
});

// ===========================================================================
// GROUPS (read-only — created via import only, per spec rule #1)
// ===========================================================================

router.get("/groups", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const subAgentId = req.query.subAgentId ? Number(req.query.subAgentId) : null;
    const status = typeof req.query.status === "string" ? req.query.status : null;

    const where: string[] = [`g."companyId"=$1`, `g."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where.push(`g."seasonId"=$${params.length}`); }
    if (subAgentId) { params.push(subAgentId); where.push(`g."subAgentId"=$${params.length}`); }
    if (status) { params.push(status); where.push(`g.status=$${params.length}`); }

    const rows = await rawQuery(
      `SELECT g.*, a.name AS "agentName", s.name AS "subAgentName"
         FROM umrah_groups g
         LEFT JOIN umrah_agents a ON a.id = g."agentId"
         LEFT JOIN umrah_sub_agents s ON s.id = g."subAgentId"
        WHERE ${where.join(" AND ")}
        ORDER BY g."createdAt" DESC LIMIT 1000`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List groups"); }
});

router.get("/groups/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT g.*, a.name AS "agentName", s.name AS "subAgentName"
         FROM umrah_groups g
         LEFT JOIN umrah_agents a ON a.id = g."agentId"
         LEFT JOIN umrah_sub_agents s ON s.id = g."subAgentId"
        WHERE g.id=$1 AND g."companyId"=$2 AND g."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المجموعة غير موجودة");
    const mutamers = await rawQuery(
      `SELECT id, "nuskNumber", name, status, "isInsideKingdom", "overstayDays"
         FROM umrah_mutamers
        WHERE "groupId"=$1 AND "deletedAt" IS NULL
        ORDER BY name ASC LIMIT 500`,
      [id]
    );
    const violations = await rawQuery(
      `SELECT id, type, "referenceNumber", "penaltyAmount", status
         FROM umrah_violations
        WHERE "groupId"=$1 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 200`,
      [id]
    );
    res.json({ ...row, mutamers, violations });
  } catch (err) { handleRouteError(err, res, "Get group"); }
});

// ===========================================================================
// MUTAMERS (read-only)
// ===========================================================================

router.get("/mutamers", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const groupId = req.query.groupId ? Number(req.query.groupId) : null;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const limit = Math.min(1000, Number(req.query.limit) || 200);

    const where: string[] = [`m."companyId"=$1`, `m."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (groupId) { params.push(groupId); where.push(`m."groupId"=$${params.length}`); }
    if (status) { params.push(status); where.push(`m.status=$${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(m.name ILIKE $${params.length} OR m."nuskNumber" ILIKE $${params.length} OR m."passportNumber" ILIKE $${params.length})`);
    }
    params.push(limit);

    const rows = await rawQuery(
      `SELECT m.id, m."nuskNumber", m.name, m.nationality, m.gender, m."passportNumber",
              m.status, m."isInsideKingdom", m."overstayDays",
              m."entryDate", m."exitDate", m."actualStayDays", m."programDuration",
              g."nuskGroupNumber", g.name AS "groupName"
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE ${where.join(" AND ")}
        ORDER BY m."createdAt" DESC LIMIT $${params.length}`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List mutamers"); }
});

router.get("/mutamers/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT m.*, g."nuskGroupNumber", g.name AS "groupName",
              a.name AS "agentName", s.name AS "subAgentName"
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
         LEFT JOIN umrah_agents a ON a.id = g."agentId"
         LEFT JOIN umrah_sub_agents s ON s.id = g."subAgentId"
        WHERE m.id=$1 AND m."companyId"=$2 AND m."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المعتمر غير موجود");
    const violations = await rawQuery(
      `SELECT id, type, "referenceNumber", "penaltyAmount", status, description
         FROM umrah_violations
        WHERE "mutamerId"=$1 AND "deletedAt" IS NULL ORDER BY id DESC`,
      [id]
    );
    res.json({ ...row, violations });
  } catch (err) { handleRouteError(err, res, "Get mutamer"); }
});

// ===========================================================================
// PRICING
// ===========================================================================

const pricingBodySchema = z.object({
  agentId: z.coerce.number().int().positive(),
  subAgentId: z.coerce.number().int().positive().optional().nullable(),
  seasonId: z.coerce.number().int().positive(),
  pricePerMutamer: z.coerce.number().nonnegative(),
  includesHotel: z.boolean().optional(),
  includesTransport: z.boolean().optional(),
  validFrom: z.string().min(1, "تاريخ بداية السريان مطلوب"),
  validTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get("/pricing", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const subAgentId = req.query.subAgentId ? Number(req.query.subAgentId) : null;
    const where: string[] = [`p."companyId"=$1`, `p."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where.push(`p."seasonId"=$${params.length}`); }
    if (subAgentId) { params.push(subAgentId); where.push(`(p."subAgentId"=$${params.length} OR p."subAgentId" IS NULL)`); }

    const rows = await rawQuery(
      `SELECT p.*, a.name AS "agentName", s.name AS "subAgentName"
         FROM umrah_pricing p
         LEFT JOIN umrah_agents a ON a.id = p."agentId"
         LEFT JOIN umrah_sub_agents s ON s.id = p."subAgentId"
        WHERE ${where.join(" AND ")}
        ORDER BY p."validFrom" DESC, p.id DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List pricing"); }
});

router.post("/pricing", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = pricingBodySchema.parse(req.body);
    if (body.validTo && body.validTo < body.validFrom) {
      throw new ValidationError("تاريخ نهاية السريان يجب أن يكون بعد تاريخ البداية", { field: "validTo" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_pricing
         ("companyId","branchId","agentId","subAgentId","seasonId","pricePerMutamer",
          "includesHotel","includesTransport","validFrom","validTo",notes,
          "createdBy","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
      [
        scope.companyId, scope.branchId, body.agentId, body.subAgentId ?? null,
        body.seasonId, body.pricePerMutamer,
        body.includesHotel ?? false, body.includesTransport ?? false,
        body.validFrom, body.validTo ?? null, body.notes ?? null, scope.userId,
      ]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "umrah_pricing", entityId: insertId, after: body,
    });
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Create pricing"); }
});

router.patch("/pricing/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const body = pricingBodySchema.partial().parse(req.body);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل السعر غير موجود");

    const cols: Record<string, any> = {
      agentId: body.agentId, subAgentId: body.subAgentId, seasonId: body.seasonId,
      pricePerMutamer: body.pricePerMutamer, includesHotel: body.includesHotel,
      includesTransport: body.includesTransport, validFrom: body.validFrom,
      validTo: body.validTo, notes: body.notes,
    };
    const sets: string[] = [];
    const params: any[] = [];
    for (const [k, v] of Object.entries(cols)) {
      if (v !== undefined) { params.push(v); sets.push(`"${k}"=$${params.length}`); }
    }
    if (sets.length === 0) { res.json({ id }); return; }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE umrah_pricing SET ${sets.join(",")}
        WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
      params
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "umrah_pricing", entityId: id,
      before: existing, after: body,
    });
    res.json({ id });
  } catch (err) { handleRouteError(err, res, "Update pricing"); }
});

router.delete("/pricing/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_pricing SET "deletedAt"=NOW(), "updatedBy"=$3, "updatedAt"=NOW()
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId, scope.userId]
    );
    if (affectedRows === 0) throw new NotFoundError("سجل السعر غير موجود");
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "umrah_pricing", entityId: id,
    });
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Delete pricing"); }
});

// ===========================================================================
// VIOLATIONS
// ===========================================================================

const violationBodySchema = z.object({
  type: z.enum(["overstay", "absconded", "other"]),
  referenceType: z.enum(["group", "passport", "border"]),
  referenceNumber: z.string().min(1, "رقم المرجع مطلوب"),
  mutamerId: z.coerce.number().int().positive().optional().nullable(),
  groupId: z.coerce.number().int().positive().optional().nullable(),
  subAgentId: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  penaltyAmount: z.coerce.number().nonnegative(),
});

router.get("/violations", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const subAgentId = req.query.subAgentId ? Number(req.query.subAgentId) : null;
    const where: string[] = [`v."companyId"=$1`, `v."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); where.push(`v.status=$${params.length}`); }
    if (subAgentId) { params.push(subAgentId); where.push(`v."subAgentId"=$${params.length}`); }
    const rows = await rawQuery(
      `SELECT v.*, m.name AS "mutamerName", g."nuskGroupNumber", s.name AS "subAgentName"
         FROM umrah_violations v
         LEFT JOIN umrah_mutamers m ON m.id = v."mutamerId"
         LEFT JOIN umrah_groups g ON g.id = v."groupId"
         LEFT JOIN umrah_sub_agents s ON s.id = v."subAgentId"
        WHERE ${where.join(" AND ")}
        ORDER BY v."createdAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List violations"); }
});

router.post("/violations", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = violationBodySchema.parse(req.body);
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_violations
         ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId",
          "groupId","subAgentId",description,"penaltyAmount",status,
          "createdBy","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$11) RETURNING id`,
      [
        scope.companyId, scope.branchId, body.type, body.referenceType, body.referenceNumber,
        body.mutamerId ?? null, body.groupId ?? null, body.subAgentId ?? null,
        body.description ?? null, body.penaltyAmount, scope.userId,
      ]
    );
    await emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.violation.created", entity: "umrah_violations", entityId: insertId,
      details: JSON.stringify({ type: body.type, ref: body.referenceNumber, amount: body.penaltyAmount }),
    });
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Create violation"); }
});

router.patch("/violations/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const body = z.object({
      status: z.enum(["detected", "open", "invoiced", "paid", "disputed", "closed"]).optional(),
      description: z.string().optional(),
      penaltyAmount: z.coerce.number().nonnegative().optional(),
      linkedInvoiceId: z.coerce.number().int().positive().optional().nullable(),
    }).parse(req.body);

    const sets: string[] = [];
    const params: any[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) { params.push(v); sets.push(`"${k}"=$${params.length}`); }
    }
    if (sets.length === 0) { res.json({ id }); return; }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id, scope.companyId);
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_violations SET ${sets.join(",")}
        WHERE id=$${params.length - 1} AND "companyId"=$${params.length}
              AND "deletedAt" IS NULL`,
      params
    );
    if (affectedRows === 0) throw new NotFoundError("المخالفة غير موجودة");
    res.json({ id });
  } catch (err) { handleRouteError(err, res, "Update violation"); }
});

// ===========================================================================
// NUSK INVOICES
// ===========================================================================

router.get("/nusk-invoices", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const where: string[] = [`ni."companyId"=$1`, `ni."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); where.push(`ni."nuskStatus"=$${params.length}`); }
    const rows = await rawQuery(
      `SELECT ni.*, a.name AS "agentName", s.name AS "subAgentName", g."nuskGroupNumber"
         FROM umrah_nusk_invoices ni
         LEFT JOIN umrah_agents a ON a.id = ni."agentId"
         LEFT JOIN umrah_sub_agents s ON s.id = ni."subAgentId"
         LEFT JOIN umrah_groups g ON g.id = ni."groupId"
        WHERE ${where.join(" AND ")}
        ORDER BY ni."issueDate" DESC NULLS LAST, ni.id DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List nusk invoices"); }
});

router.get("/nusk-invoices/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT ni.*, a.name AS "agentName", s.name AS "subAgentName",
              g."nuskGroupNumber", g.name AS "groupName"
         FROM umrah_nusk_invoices ni
         LEFT JOIN umrah_agents a ON a.id = ni."agentId"
         LEFT JOIN umrah_sub_agents s ON s.id = ni."subAgentId"
         LEFT JOIN umrah_groups g ON g.id = ni."groupId"
        WHERE ni.id=$1 AND ni."companyId"=$2 AND ni."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("فاتورة نسك غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get nusk invoice"); }
});

// ===========================================================================
// IMPORT — preview + confirm + reject + batches
// ===========================================================================

const previewBodySchema = z.object({
  seasonId: z.coerce.number().int().positive(),
  fileName: z.string().min(1, "اسم الملف مطلوب"),
  fileSize: z.coerce.number().int().nonnegative().optional(),
  fileBase64: z.string().min(1, "محتوى الملف مطلوب"),
});

function buildImportScope(scope: any, seasonId: number): ImportScope {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId ?? null,
    userId: scope.userId,
    seasonId,
  };
}

router.post("/import/preview/mutamers", largeJson, requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = previewBodySchema.parse(req.body);
    const buffer = decodeBase64Buffer(body.fileBase64);
    const summary = await previewMutamersImport(
      buildImportScope(scope, body.seasonId),
      { fileName: body.fileName, fileSize: body.fileSize ?? buffer.length },
      buffer
    );
    res.json(summary);
  } catch (err) { handleRouteError(err, res, "Preview mutamers import"); }
});

router.post("/import/preview/vouchers", largeJson, requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = previewBodySchema.parse(req.body);
    const buffer = decodeBase64Buffer(body.fileBase64);
    const summary = await previewVouchersImport(
      buildImportScope(scope, body.seasonId),
      { fileName: body.fileName, fileSize: body.fileSize ?? buffer.length },
      buffer
    );
    res.json(summary);
  } catch (err) { handleRouteError(err, res, "Preview vouchers import"); }
});

router.post("/import/confirm/:batchId", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const batchId = idParam.parse(req.params.batchId);
    // The engine itself doesn't need seasonId for confirm, but ImportScope
    // requires the field — pull it from the persisted batch.
    const [b] = await rawQuery<any>(
      `SELECT "seasonId" FROM umrah_import_batches
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [batchId, scope.companyId]
    );
    if (!b) throw new NotFoundError("دفعة الاستيراد غير موجودة");
    const result = await confirmImport(buildImportScope(scope, b.seasonId), batchId);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Confirm import"); }
});

router.post("/import/reject/:batchId", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const batchId = idParam.parse(req.params.batchId);
    const [b] = await rawQuery<any>(
      `SELECT "seasonId" FROM umrah_import_batches
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [batchId, scope.companyId]
    );
    if (!b) throw new NotFoundError("دفعة الاستيراد غير موجودة");
    await rejectBatch(buildImportScope(scope, b.seasonId), batchId);
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Reject import"); }
});

router.get("/import/batches", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const fileType = typeof req.query.fileType === "string" ? req.query.fileType : null;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const where: string[] = [`b."companyId"=$1`, `b."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (fileType) { params.push(fileType); where.push(`b."fileType"=$${params.length}`); }
    if (status) { params.push(status); where.push(`b.status=$${params.length}`); }
    const rows = await rawQuery(
      `SELECT b.id, b."fileType", b."fileName", b."fileSize", b."totalRows",
              b."newCount", b."updatedCount", b."skippedCount", b."errorCount",
              b."financialImpactCount", b."manualReviewCount", b.status,
              b."uploadedAt", b."seasonId", b."uploadedBy",
              u.email AS "uploadedByEmail"
         FROM umrah_import_batches b
         LEFT JOIN users u ON u.id = b."uploadedBy"
        WHERE ${where.join(" AND ")}
        ORDER BY b."uploadedAt" DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import batches"); }
});

router.get("/import/batches/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT b.* FROM umrah_import_batches b
        WHERE b.id=$1 AND b."companyId"=$2 AND b."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("دفعة الاستيراد غير موجودة");
    // Hide the bulky `parsed` rows from the summary blob — wizards only
    // need the high-level summary, not the 50,000-row payload.
    if (row.summaryJson && row.summaryJson.summary) {
      row.summary = row.summaryJson.summary;
      delete row.summaryJson;
    }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get import batch"); }
});

router.get("/import/batches/:id/changes", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : null;
    const changeType = typeof req.query.changeType === "string" ? req.query.changeType : null;
    const where: string[] = [`c."batchId"=$1`, `c."companyId"=$2`, `c."deletedAt" IS NULL`];
    const params: any[] = [id, scope.companyId];
    if (entityType) { params.push(entityType); where.push(`c."entityType"=$${params.length}`); }
    if (changeType) { params.push(changeType); where.push(`c."changeType"=$${params.length}`); }
    const rows = await rawQuery(
      `SELECT c.* FROM umrah_import_changes c
        WHERE ${where.join(" AND ")}
        ORDER BY c.id ASC LIMIT 5000`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import changes"); }
});

// ===========================================================================
// COMMISSION PLANS + TIERS + CALCULATIONS
// ===========================================================================

const planBodySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  assignmentId: z.coerce.number().int().positive().optional().nullable(),
  seasonId: z.coerce.number().int().positive().optional().nullable(),
  planName: z.string().min(1, "اسم الخطة مطلوب"),
  baseSalary: z.coerce.number().nonnegative(),
  commissionType: z.enum(["percentage", "fixed", "tiered", "mixed"]),
  conditionType: z.enum(["profit_avg", "sales_percent", "both_or", "none"]),
  minProfitPerVisa: z.coerce.number().nonnegative().optional().nullable(),
  minSalesPercent: z.coerce.number().nonnegative().optional().nullable(),
  minAvgPrice: z.coerce.number().nonnegative().optional().nullable(),
  excludedMonths: z.array(z.number().int().min(1).max(12)).optional(),
  tierUnit: z.coerce.number().int().positive().optional(),
  partialTiersAllowed: z.boolean().optional(),
  violationBlocksCommission: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const tierBodySchema = z.object({
  fromCount: z.coerce.number().int().nonnegative(),
  toCount: z.coerce.number().int().positive().optional().nullable(),
  bonusPerUnit: z.coerce.number().nonnegative(),
  isCumulative: z.boolean().optional(),
});

router.get("/commission-plans", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const where: string[] = [`p."companyId"=$1`, `p."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (employeeId) { params.push(employeeId); where.push(`p."employeeId"=$${params.length}`); }
    if (status) { params.push(status); where.push(`p.status=$${params.length}`); }
    const rows = await rawQuery(
      `SELECT p.*, e.name AS "employeeName"
         FROM employee_commission_plans p
         LEFT JOIN employees e ON e.id = p."employeeId"
        WHERE ${where.join(" AND ")}
        ORDER BY p."createdAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List commission plans"); }
});

router.get("/commission-plans/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [plan] = await rawQuery<any>(
      `SELECT p.*, e.name AS "employeeName"
         FROM employee_commission_plans p
         LEFT JOIN employees e ON e.id = p."employeeId"
        WHERE p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!plan) throw new NotFoundError("خطة العمولة غير موجودة");
    const tiers = await rawQuery(
      `SELECT * FROM employee_commission_tiers
        WHERE "planId"=$1 AND "deletedAt" IS NULL ORDER BY "fromCount" ASC`,
      [id]
    );
    res.json({ ...plan, tiers });
  } catch (err) { handleRouteError(err, res, "Get commission plan"); }
});

router.post("/commission-plans", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = planBodySchema.parse(req.body);

    // FK sanity: employee must exist
    const [emp] = await rawQuery<any>(
      `SELECT id FROM employees WHERE id=$1`,
      [body.employeeId]
    );
    if (!emp) throw new ValidationError("الموظف غير موجود", { field: "employeeId" });

    // Spec §9.5: plans need the general-manager's approval before they
    // can be calculated against. New plans land as 'suspended' (not
    // visible to the cron sweep, calculate refuses with 409) until the
    // approver hits /approve. Owners / general managers / hr_managers
    // bypass the gate (they ARE the approver).
    const autoActivate = scope.role === "owner"
      || scope.role === "general_manager"
      || scope.role === "hr_manager";
    const initialStatus = autoActivate ? "active" : "suspended";

    const { insertId } = await rawExecute(
      `INSERT INTO employee_commission_plans
         ("companyId","branchId","employeeId","assignmentId","seasonId",
          "planName","baseSalary","commissionType","conditionType",
          "minProfitPerVisa","minSalesPercent","minAvgPrice",
          "excludedMonths","tierUnit","partialTiersAllowed","violationBlocksCommission",
          status,notes,"approvedBy","approvedAt","createdBy","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)
       RETURNING id`,
      [
        scope.companyId, scope.branchId, body.employeeId, body.assignmentId ?? null, body.seasonId ?? null,
        body.planName, body.baseSalary, body.commissionType, body.conditionType,
        body.minProfitPerVisa ?? null, body.minSalesPercent ?? null, body.minAvgPrice ?? null,
        JSON.stringify(body.excludedMonths ?? []), body.tierUnit ?? 10000,
        body.partialTiersAllowed ?? false, body.violationBlocksCommission ?? true,
        initialStatus,
        body.notes ?? null,
        autoActivate ? scope.userId : null,
        autoActivate ? new Date().toISOString() : null,
        scope.userId,
      ]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employee_commission_plans", entityId: insertId,
      after: { ...body, status: initialStatus, autoActivated: autoActivate },
    });
    if (!autoActivate) {
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "umrah.commission_plan.pending_approval",
        entity: "employee_commission_plans", entityId: insertId,
        details: JSON.stringify({ planName: body.planName, employeeId: body.employeeId }),
      });
    }
    res.status(201).json({ id: insertId, status: initialStatus });
  } catch (err) { handleRouteError(err, res, "Create commission plan"); }
});

router.post("/commission-plans/:id/approve", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    // Only owner / general_manager / hr_manager can approve per spec §9.5.
    const allowed = ["owner", "general_manager", "hr_manager"];
    if (!allowed.includes(scope.role)) {
      throw new ConflictError("الموافقة على خطط العمولة محصورة بالمدير العام",
        { meta: { requiredRoles: allowed } });
    }
    const [existing] = await rawQuery<any>(
      `SELECT id, status FROM employee_commission_plans
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("خطة العمولة غير موجودة");
    if (existing.status === "active") {
      throw new ConflictError("الخطة معتمدة مسبقاً");
    }
    await rawExecute(
      `UPDATE employee_commission_plans
          SET status='active', "approvedBy"=$1, "approvedAt"=NOW(),
              "updatedBy"=$1, "updatedAt"=NOW()
        WHERE id=$2 AND "companyId"=$3`,
      [scope.userId, id, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "approve", entity: "employee_commission_plans", entityId: id,
      before: { status: existing.status }, after: { status: "active" },
    });
    await emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.commission_plan.approved",
      entity: "employee_commission_plans", entityId: id,
      details: JSON.stringify({ approvedBy: scope.userId }),
    });
    res.json({ id, status: "active" });
  } catch (err) { handleRouteError(err, res, "Approve commission plan"); }
});

router.patch("/commission-plans/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const body = planBodySchema.partial().extend({
      status: z.enum(["active", "suspended", "expired"]).optional(),
    }).parse(req.body);

    const [existing] = await rawQuery<any>(
      `SELECT * FROM employee_commission_plans
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("خطة العمولة غير موجودة");

    const cols: Record<string, any> = {
      assignmentId: body.assignmentId, seasonId: body.seasonId, planName: body.planName,
      baseSalary: body.baseSalary, commissionType: body.commissionType,
      conditionType: body.conditionType, minProfitPerVisa: body.minProfitPerVisa,
      minSalesPercent: body.minSalesPercent, minAvgPrice: body.minAvgPrice,
      excludedMonths: body.excludedMonths === undefined ? undefined : JSON.stringify(body.excludedMonths),
      tierUnit: body.tierUnit, partialTiersAllowed: body.partialTiersAllowed,
      violationBlocksCommission: body.violationBlocksCommission, status: body.status,
      notes: body.notes,
    };
    const sets: string[] = [];
    const params: any[] = [];
    for (const [k, v] of Object.entries(cols)) {
      if (v !== undefined) { params.push(v); sets.push(`"${k}"=$${params.length}`); }
    }
    if (sets.length === 0) { res.json({ id }); return; }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE employee_commission_plans SET ${sets.join(",")}
        WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
      params
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "employee_commission_plans", entityId: id,
      before: existing, after: body,
    });
    res.json({ id });
  } catch (err) { handleRouteError(err, res, "Update commission plan"); }
});

router.delete("/commission-plans/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const { affectedRows } = await rawExecute(
      `UPDATE employee_commission_plans
          SET "deletedAt"=NOW(), "updatedBy"=$3, "updatedAt"=NOW()
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId, scope.userId]
    );
    if (affectedRows === 0) throw new NotFoundError("خطة العمولة غير موجودة");
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Delete commission plan"); }
});

// ----- tiers (nested) ------------------------------------------------------
router.get("/commission-plans/:id/tiers", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [plan] = await rawQuery<any>(
      `SELECT id FROM employee_commission_plans
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!plan) throw new NotFoundError("خطة العمولة غير موجودة");
    const tiers = await rawQuery(
      `SELECT * FROM employee_commission_tiers
        WHERE "planId"=$1 AND "deletedAt" IS NULL
        ORDER BY "fromCount" ASC`,
      [id]
    );
    res.json({ data: tiers });
  } catch (err) { handleRouteError(err, res, "List tiers"); }
});

router.post("/commission-plans/:id/tiers", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const body = tierBodySchema.parse(req.body);
    const [plan] = await rawQuery<any>(
      `SELECT id FROM employee_commission_plans
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!plan) throw new NotFoundError("خطة العمولة غير موجودة");
    const { insertId } = await rawExecute(
      `INSERT INTO employee_commission_tiers
         ("companyId","branchId","planId","fromCount","toCount","bonusPerUnit",
          "isCumulative","createdBy","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
      [
        scope.companyId, scope.branchId, id, body.fromCount, body.toCount ?? null,
        body.bonusPerUnit, body.isCumulative ?? true, scope.userId,
      ]
    );
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Create tier"); }
});

router.patch("/commission-plans/:id/tiers/:tierId", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const planId = idParam.parse(req.params.id);
    const tierId = idParam.parse(req.params.tierId);
    const body = tierBodySchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: any[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) { params.push(v); sets.push(`"${k}"=$${params.length}`); }
    }
    if (sets.length === 0) { res.json({ id: tierId }); return; }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(tierId, planId, scope.companyId);
    const { affectedRows } = await rawExecute(
      `UPDATE employee_commission_tiers SET ${sets.join(",")}
        WHERE id=$${params.length - 2} AND "planId"=$${params.length - 1}
              AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
      params
    );
    if (affectedRows === 0) throw new NotFoundError("الشريحة غير موجودة");
    res.json({ id: tierId });
  } catch (err) { handleRouteError(err, res, "Update tier"); }
});

router.delete("/commission-plans/:id/tiers/:tierId", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const planId = idParam.parse(req.params.id);
    const tierId = idParam.parse(req.params.tierId);
    const { affectedRows } = await rawExecute(
      `UPDATE employee_commission_tiers
          SET "deletedAt"=NOW(), "updatedBy"=$4, "updatedAt"=NOW()
        WHERE id=$1 AND "planId"=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [tierId, planId, scope.companyId, scope.userId]
    );
    if (affectedRows === 0) throw new NotFoundError("الشريحة غير موجودة");
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Delete tier"); }
});

// ----- simulate / calculate ------------------------------------------------

router.post("/commission-plans/:id/simulate", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const input = z.object({
      totalMutamers: z.coerce.number().int().nonnegative(),
      avgProfitPerVisa: z.coerce.number(),
      salesPercent: z.coerce.number(),
      avgSalePrice: z.coerce.number(),
      hasViolations: z.boolean().optional(),
      isExcludedMonth: z.boolean().optional(),
    }).parse(req.body) as SimulateInput;

    const [planRow] = await rawQuery<any>(
      `SELECT * FROM employee_commission_plans
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!planRow) throw new NotFoundError("خطة العمولة غير موجودة");
    const tiers: CommissionTier[] = (await rawQuery<any>(
      `SELECT "fromCount","toCount","bonusPerUnit","isCumulative"
         FROM employee_commission_tiers
        WHERE "planId"=$1 AND "deletedAt" IS NULL ORDER BY "fromCount"`,
      [id]
    )).map((t) => ({
      fromCount: Number(t.fromCount),
      toCount: t.toCount === null ? null : Number(t.toCount),
      bonusPerUnit: Number(t.bonusPerUnit),
      isCumulative: !!t.isCumulative,
    }));

    const plan: CommissionPlanRules = {
      id: planRow.id, employeeId: planRow.employeeId,
      assignmentId: planRow.assignmentId, seasonId: planRow.seasonId,
      baseSalary: Number(planRow.baseSalary),
      commissionType: planRow.commissionType, conditionType: planRow.conditionType,
      minProfitPerVisa: planRow.minProfitPerVisa === null ? null : Number(planRow.minProfitPerVisa),
      minSalesPercent: planRow.minSalesPercent === null ? null : Number(planRow.minSalesPercent),
      minAvgPrice: planRow.minAvgPrice === null ? null : Number(planRow.minAvgPrice),
      excludedMonths: Array.isArray(planRow.excludedMonths) ? planRow.excludedMonths.map(Number) : [],
      tierUnit: Number(planRow.tierUnit ?? 10000),
      partialTiersAllowed: !!planRow.partialTiersAllowed,
      violationBlocksCommission: !!planRow.violationBlocksCommission,
      status: planRow.status,
    };
    const result = simulateCommission(plan, tiers, input);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Simulate commission"); }
});

const periodSchema = z.object({
  hijriMonth: z.coerce.number().int().min(1).max(12),
  hijriYear: z.coerce.number().int().min(1300).max(2000),
  gregorianStart: z.string().min(1, "تاريخ بداية الفترة مطلوب"),
  gregorianEnd: z.string().min(1, "تاريخ نهاية الفترة مطلوب"),
});

router.post("/commission-plans/:id/calculate", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const period = periodSchema.parse(req.body) as CommissionPeriod;
    const result = await calculateCommissionForEmployee(
      buildCommissionScope(scope), id, period
    );
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Calculate commission"); }
});

router.post("/commissions/calculate-month", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const period = periodSchema.parse(req.body) as CommissionPeriod;
    const results = await calculateCommissionsForMonth(buildCommissionScope(scope), period);
    res.json({ data: results, count: results.length });
  } catch (err) { handleRouteError(err, res, "Sweep commissions"); }
});

router.get("/commissions/history/:employeeId", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = idParam.parse(req.params.employeeId);
    const limit = Math.min(120, Number(req.query.limit) || 36);
    const rows = await listEmployeeCommissionHistory(buildCommissionScope(scope), employeeId, limit);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List commission history"); }
});

function buildCommissionScope(scope: any): CommissionScope {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId ?? null,
    userId: scope.userId,
  };
}

// ===========================================================================
// STATEMENTS — sub-agent ledger (detailed + summary)
// ===========================================================================

router.get("/statements/:subAgentId", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const subAgentId = idParam.parse(req.params.subAgentId);
    const type = (typeof req.query.type === "string" ? req.query.type : "detailed") as
      "detailed" | "summary";
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;

    const [sub] = await rawQuery<any>(
      `SELECT s.*, c.name AS "clientName"
         FROM umrah_sub_agents s
         LEFT JOIN clients c ON c.id = s."clientId"
        WHERE s.id=$1 AND s."companyId"=$2 AND s."deletedAt" IS NULL`,
      [subAgentId, scope.companyId]
    );
    if (!sub) throw new NotFoundError("الوكيل الفرعي غير موجود");

    const dateClause = (col: string, params: any[]): string => {
      const parts: string[] = [];
      if (from) { params.push(from); parts.push(`${col} >= $${params.length}::date`); }
      if (to) { params.push(to); parts.push(`${col} <= ($${params.length}::date + INTERVAL '1 day')`); }
      return parts.length ? ` AND ${parts.join(" AND ")}` : "";
    };

    // 1. Central sales invoices (Phase-7 path via umrah_groups.centralInvoiceId)
    const invoiceParams: any[] = [scope.companyId, subAgentId];
    const invoices = await rawQuery<any>(
      `SELECT DISTINCT i.id, i."createdAt" AS date, i.ref, i.total, i.status,
              ARRAY(SELECT g."nuskGroupNumber"
                      FROM umrah_groups g
                     WHERE g."centralInvoiceId" = i.id AND g."deletedAt" IS NULL) AS "groupRefs"
         FROM invoices i
         JOIN umrah_groups g ON g."centralInvoiceId" = i.id
        WHERE i."companyId"=$1
          AND i."deletedAt" IS NULL
          AND g."subAgentId"=$2
          AND g."deletedAt" IS NULL
          ${dateClause(`i."createdAt"`, invoiceParams)}
        ORDER BY i."createdAt" ASC`,
      invoiceParams
    );

    // 2. Payments against those invoices (central invoice_payments table)
    const paymentParams: any[] = [scope.companyId, subAgentId];
    const payments = invoices.length === 0 ? [] : await rawQuery<any>(
      `SELECT ip.id, ip."paidAt" AS date, ip.amount, ip.method, ip."transactionRef",
              ip."invoiceId", i.ref AS "invoiceRef"
         FROM invoice_payments ip
         JOIN invoices i ON i.id = ip."invoiceId"
        WHERE ip."companyId"=$1
          AND EXISTS (
            SELECT 1 FROM umrah_groups g
             WHERE g."centralInvoiceId" = ip."invoiceId" AND g."subAgentId"=$2
          )
          ${dateClause(`ip."paidAt"`, paymentParams)}
        ORDER BY ip."paidAt" ASC`,
      paymentParams
    );

    const violationParams: any[] = [scope.companyId, subAgentId];
    const violations = await rawQuery<any>(
      `SELECT v.id, v."createdAt" AS date, v.type, v."referenceType", v."referenceNumber",
              v."penaltyAmount", v.status, v."linkedInvoiceId"
         FROM umrah_violations v
        WHERE v."companyId"=$1 AND v."subAgentId"=$2 AND v."deletedAt" IS NULL
          ${dateClause(`v."createdAt"`, violationParams)}
        ORDER BY v."createdAt" ASC`,
      violationParams
    );

    if (type === "summary") {
      // Spec §5.2: invoices + violations rolled up by month, payments
      // listed individually so cashflow stays visible.
      const monthly = new Map<string, {
        invoiceCount: number; invoiceTotal: number;
        violationCount: number; violationTotal: number;
      }>();
      for (const inv of invoices) {
        const m = String(inv.date).slice(0, 7);
        const cur = monthly.get(m) ?? { invoiceCount: 0, invoiceTotal: 0, violationCount: 0, violationTotal: 0 };
        cur.invoiceCount++;
        cur.invoiceTotal += Number(inv.total ?? 0);
        monthly.set(m, cur);
      }
      for (const v of violations) {
        const m = String(v.date).slice(0, 7);
        const cur = monthly.get(m) ?? { invoiceCount: 0, invoiceTotal: 0, violationCount: 0, violationTotal: 0 };
        cur.violationCount++;
        cur.violationTotal += Number(v.penaltyAmount ?? 0);
        monthly.set(m, cur);
      }
      const periods = Array.from(monthly.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, agg]) => ({ month, ...agg }));
      res.json({
        subAgent: { id: sub.id, name: sub.name, clientId: sub.clientId, clientName: sub.clientName },
        type, from, to, periods,
        payments: payments.map((p) => ({
          date: p.date, amount: Number(p.amount), method: p.method,
          ref: p.transactionRef, invoiceRef: p.invoiceRef,
        })),
      });
      return;
    }

    // detailed: merge invoices + violations + payments in date order
    // with a running balance.
    const ledger: any[] = [];
    for (const inv of invoices) {
      ledger.push({
        sortKey: String(inv.date),
        date: inv.date, kind: "invoice",
        ref: inv.ref, groupRefs: inv.groupRefs,
        debit: Number(inv.total ?? 0), credit: 0,
        status: inv.status,
      });
    }
    for (const v of violations) {
      ledger.push({
        sortKey: String(v.date),
        date: v.date, kind: "violation",
        ref: `${v.referenceType}/${v.referenceNumber}`,
        debit: Number(v.penaltyAmount ?? 0), credit: 0,
        status: v.status, violationType: v.type,
      });
    }
    for (const p of payments) {
      ledger.push({
        sortKey: String(p.date),
        date: p.date, kind: "payment",
        ref: p.transactionRef ?? `PAY-${p.id}`,
        invoiceRef: p.invoiceRef,
        debit: 0, credit: Number(p.amount ?? 0),
        method: p.method,
      });
    }
    ledger.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    let balance = 0;
    for (const row of ledger) {
      balance += Number(row.debit ?? 0) - Number(row.credit ?? 0);
      row.balance = Math.round(balance * 100) / 100;
      delete row.sortKey;
    }

    res.json({
      subAgent: { id: sub.id, name: sub.name, clientId: sub.clientId, clientName: sub.clientName },
      type, from, to, ledger,
      totals: {
        debit: ledger.reduce((s, r) => s + Number(r.debit ?? 0), 0),
        credit: ledger.reduce((s, r) => s + Number(r.credit ?? 0), 0),
        balance,
      },
    });
  } catch (err) { handleRouteError(err, res, "Statement"); }
});

// ===========================================================================
// CROSS-SEASON AGENT MATCHING — §3.3 / §13 + acceptance #19
// ===========================================================================

/**
 * For a target season, return any agent that EXISTS in another season
 * but is missing from the target. Surface those as "probable matches"
 * the wizard can show with "هذا غالبًا نفس الوكيل — هل تؤكد؟".
 *
 * Match key is (companyId, name, country). When the same name+country
 * appears in season X but not in season Y, we suggest carrying it over.
 */
router.get("/agents/match-suggestions", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const targetSeasonId = req.query.targetSeasonId ? Number(req.query.targetSeasonId) : null;
    if (!targetSeasonId) {
      throw new ValidationError("targetSeasonId مطلوب", { field: "targetSeasonId" });
    }
    const suggestions = await rawQuery<any>(
      `SELECT a.id AS "previousAgentId", a.name, a.country,
              a."nuskAgentNumber" AS "previousNuskNumber",
              a."seasonId" AS "previousSeasonId",
              s.title AS "previousSeasonTitle",
              a."clientId" AS "previousClientId"
         FROM umrah_agents a
         LEFT JOIN umrah_seasons s ON s.id = a."seasonId"
        WHERE a."companyId" = $1
          AND a."deletedAt" IS NULL
          AND a."seasonId" IS NOT NULL
          AND a."seasonId" <> $2
          AND NOT EXISTS (
            SELECT 1 FROM umrah_agents b
             WHERE b."companyId" = $1
               AND b."seasonId" = $2
               AND b."deletedAt" IS NULL
               AND lower(trim(b.name)) = lower(trim(a.name))
               AND COALESCE(lower(trim(b.country)),'') = COALESCE(lower(trim(a.country)),'')
          )
        ORDER BY a.name ASC`,
      [scope.companyId, targetSeasonId]
    );
    res.json({ data: suggestions });
  } catch (err) { handleRouteError(err, res, "Agent match suggestions"); }
});

/**
 * Carry a previous-season agent forward into the target season — creates
 * a new umrah_agents row with the same name+country+clientId. The user
 * still confirms via the wizard before this is called.
 */
router.post("/agents/carry-forward", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = z.object({
      previousAgentId: z.coerce.number().int().positive(),
      targetSeasonId: z.coerce.number().int().positive(),
      newNuskAgentNumber: z.string().optional().nullable(),
    }).parse(req.body);
    const [prev] = await rawQuery<any>(
      `SELECT name, country, "clientId" FROM umrah_agents
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [body.previousAgentId, scope.companyId]
    );
    if (!prev) throw new NotFoundError("الوكيل المرجعي غير موجود");
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_agents
         ("companyId","branchId",name,country,"clientId","seasonId","nuskAgentNumber",
          "isActive","createdBy","updatedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$8) RETURNING id`,
      [scope.companyId, scope.branchId, prev.name, prev.country, prev.clientId,
        body.targetSeasonId, body.newNuskAgentNumber ?? null, scope.userId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "carry_forward", entity: "umrah_agents", entityId: insertId,
      before: { previousAgentId: body.previousAgentId },
      after: { name: prev.name, country: prev.country, seasonId: body.targetSeasonId },
    });
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Carry forward agent"); }
});

// ===========================================================================
// DASHBOARD — extended totals (Phase 2 of the spec §6)
// ===========================================================================

router.get("/dashboard/overview", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const seasonClause = seasonId ? `AND g."seasonId" = ${seasonId}` : "";

    const [{ totalMutamers }] = await rawQuery<{ totalMutamers: number }>(
      `SELECT COUNT(*)::int AS "totalMutamers"
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE m."companyId"=$1 AND m."deletedAt" IS NULL ${seasonClause}`,
      [scope.companyId]
    );
    const [{ insideKingdom }] = await rawQuery<{ insideKingdom: number }>(
      `SELECT COUNT(*)::int AS "insideKingdom"
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE m."companyId"=$1 AND m."deletedAt" IS NULL
          AND m."isInsideKingdom" = true ${seasonClause}`,
      [scope.companyId]
    );
    const [{ overstays }] = await rawQuery<{ overstays: number }>(
      `SELECT COUNT(*)::int AS overstays
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE m."companyId"=$1 AND m."deletedAt" IS NULL
          AND m."overstayDays" > 0 AND m."isInsideKingdom" = true ${seasonClause}`,
      [scope.companyId]
    );
    const [{ absconders }] = await rawQuery<{ absconders: number }>(
      `SELECT COUNT(*)::int AS absconders
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE m."companyId"=$1 AND m."deletedAt" IS NULL
          AND m.status='absconded' ${seasonClause}`,
      [scope.companyId]
    );
    const [{ totalCost }] = await rawQuery<{ totalCost: string }>(
      `SELECT COALESCE(SUM("netCost"),0) AS "totalCost"
         FROM umrah_nusk_invoices
        WHERE "companyId"=$1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [{ openViolations, openViolationsTotal }] = await rawQuery<{ openViolations: number; openViolationsTotal: string }>(
      `SELECT COUNT(*)::int AS "openViolations",
              COALESCE(SUM("penaltyAmount"),0) AS "openViolationsTotal"
         FROM umrah_violations
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND status IN ('detected','open','disputed')`,
      [scope.companyId]
    );
    const [{ unlinkedSubAgents }] = await rawQuery<{ unlinkedSubAgents: number }>(
      `SELECT COUNT(*)::int AS "unlinkedSubAgents"
         FROM umrah_sub_agents
        WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "clientId" IS NULL`,
      [scope.companyId]
    );

    res.json({
      totals: {
        totalMutamers: Number(totalMutamers),
        insideKingdom: Number(insideKingdom),
        overstays: Number(overstays),
        absconders: Number(absconders),
        totalCost: Number(totalCost),
        openViolations: Number(openViolations),
        openViolationsTotal: Number(openViolationsTotal),
        unlinkedSubAgents: Number(unlinkedSubAgents),
      },
    });
  } catch (err) { handleRouteError(err, res, "Dashboard overview"); }
});

// ===========================================================================
// SALES INVOICE GENERATION (§4.2) — central invoices + journal entry
// ===========================================================================

const generateInvoiceSchema = z.object({
  subAgentId: z.coerce.number().int().positive(),
  groupIds: z.array(z.coerce.number().int().positive()).min(1, "اختر مجموعة واحدة على الأقل"),
  invoiceDate: z.string().optional(),
  netDays: z.coerce.number().int().nonnegative().optional(),
  vatRate: z.coerce.number().nonnegative().optional(),
  pricePerMutamerOverride: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional().nullable(),
});

router.post("/invoices/generate", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = generateInvoiceSchema.parse(req.body);
    const financeScope: FinanceScope = {
      companyId: scope.companyId,
      branchId: scope.branchId ?? 1,
      userId: scope.userId,
      activeAssignmentId: scope.activeAssignmentId ?? scope.userId,
    };
    const result = await generateUmrahSalesInvoice(financeScope, body);
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Generate sales invoice"); }
});

// List the invoices ready to bill (groups settled but not yet centralInvoiceId).
router.get("/invoices/billable/:subAgentId", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const subAgentId = idParam.parse(req.params.subAgentId);
    const rows = await rawQuery<any>(
      `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
              g."nuskInvoiceNumber", g.status,
              ( SELECT MIN(m."entryDate") FROM umrah_mutamers m
                 WHERE m."groupId" = g.id AND m."deletedAt" IS NULL ) AS "earliestEntry",
              ( SELECT COALESCE(SUM(v."penaltyAmount"),0) FROM umrah_violations v
                 WHERE v."groupId" = g.id AND v."subAgentId" = $1
                   AND v.status IN ('detected','open','disputed') ) AS "openPenalties"
         FROM umrah_groups g
        WHERE g."companyId"=$2
          AND g."subAgentId"=$1
          AND g."deletedAt" IS NULL
          AND g."centralInvoiceId" IS NULL
        ORDER BY g."createdAt" ASC`,
      [subAgentId, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List billable groups"); }
});

// ===========================================================================
// CLIENT 360° — Umrah summary tab (§16.1)
// ===========================================================================

router.get("/clients/:clientId/umrah-summary", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const clientId = idParam.parse(req.params.clientId);

    const [client] = await rawQuery<any>(
      `SELECT id, name FROM clients
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!client) throw new NotFoundError("العميل غير موجود");

    const subAgents = await rawQuery<any>(
      `SELECT id, name, "nuskCode", "agentId", "paymentTerms", "isActive"
         FROM umrah_sub_agents
        WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );

    const groups = subAgents.length === 0 ? [] : await rawQuery<any>(
      `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount", g.status,
              g."centralInvoiceId", g."nuskInvoiceNumber", g."createdAt"
         FROM umrah_groups g
        WHERE g."companyId"=$1
          AND g."subAgentId" = ANY($2)
          AND g."deletedAt" IS NULL
        ORDER BY g."createdAt" DESC LIMIT 100`,
      [scope.companyId, subAgents.map((s) => s.id)]
    );

    const mutamerStats = subAgents.length === 0 ? null : (await rawQuery<any>(
      `SELECT
         COUNT(*)::int AS "totalMutamers",
         COUNT(*) FILTER (WHERE m."isInsideKingdom"=true)::int AS "insideKingdom",
         COUNT(*) FILTER (WHERE m."overstayDays" > 0 AND m."isInsideKingdom"=true)::int AS "overstays",
         COUNT(*) FILTER (WHERE m.status='absconded')::int AS "absconders"
         FROM umrah_mutamers m
         JOIN umrah_groups g ON g.id = m."groupId"
        WHERE g."companyId"=$1
          AND g."subAgentId" = ANY($2)
          AND m."deletedAt" IS NULL`,
      [scope.companyId, subAgents.map((s) => s.id)]
    ))[0];

    const invoices = subAgents.length === 0 ? [] : await rawQuery<any>(
      `SELECT DISTINCT i.id, i.ref, i.total, i."paidAmount", i.status, i."dueDate", i."createdAt"
         FROM invoices i
         JOIN umrah_groups g ON g."centralInvoiceId" = i.id
        WHERE g."companyId"=$1 AND g."subAgentId" = ANY($2)
          AND i."deletedAt" IS NULL
        ORDER BY i."createdAt" DESC LIMIT 50`,
      [scope.companyId, subAgents.map((s) => s.id)]
    );

    const violations = subAgents.length === 0 ? [] : await rawQuery<any>(
      `SELECT id, type, "referenceNumber", "penaltyAmount", status, "createdAt"
         FROM umrah_violations
        WHERE "companyId"=$1
          AND "subAgentId" = ANY($2)
          AND "deletedAt" IS NULL
          AND status IN ('detected','open','disputed')
        ORDER BY "createdAt" DESC LIMIT 50`,
      [scope.companyId, subAgents.map((s) => s.id)]
    );

    // Current price (most recent valid pricing row for any of the sub-agents).
    const currentPrice = subAgents.length === 0 ? null : (await rawQuery<any>(
      `SELECT "pricePerMutamer", "validFrom", "validTo"
         FROM umrah_pricing
        WHERE "companyId"=$1
          AND "deletedAt" IS NULL
          AND ( "subAgentId" = ANY($2)
                OR ("subAgentId" IS NULL AND "agentId" IN (
                      SELECT "agentId" FROM umrah_sub_agents WHERE id = ANY($2)
                    )))
          AND "validFrom" <= CURRENT_DATE
          AND ("validTo" IS NULL OR "validTo" >= CURRENT_DATE)
        ORDER BY "subAgentId" NULLS LAST, "validFrom" DESC
        LIMIT 1`,
      [scope.companyId, subAgents.map((s) => s.id)]
    ))[0] ?? null;

    res.json({
      client,
      subAgents,
      stats: mutamerStats ?? { totalMutamers: 0, insideKingdom: 0, overstays: 0, absconders: 0 },
      groups,
      invoices,
      openViolations: violations,
      currentPrice,
    });
  } catch (err) { handleRouteError(err, res, "Client 360 Umrah summary"); }
});

// ===========================================================================
// LETTERS (§14) — official_letters generator
// ===========================================================================

const letterTypeSchema = z.enum([
  "ministry_intro",         // خطاب تعريف معتمر/مجموعة
  "overstay_report",        // خطاب تجاوز للجوازات
  "absconder_report",       // خطاب بلاغ تغيّب
  "settlement_statement",   // خطاب تسوية مالية
  "season_closure",         // خطاب إنهاء موسم
]);

const generateLetterSchema = z.object({
  type: letterTypeSchema,
  scope: z.enum(["mutamer", "group", "sub_agent", "season"]),
  mutamerIds: z.array(z.coerce.number().int().positive()).optional(),
  groupIds: z.array(z.coerce.number().int().positive()).optional(),
  subAgentId: z.coerce.number().int().positive().optional(),
  seasonId: z.coerce.number().int().positive().optional(),
  recipient: z.string().optional(),
  additionalNotes: z.string().optional(),
});

const LETTER_TITLES: Record<string, string> = {
  ministry_intro: "خطاب تعريف وزارة الحج والعمرة",
  overstay_report: "خطاب إخطار بمعتمر متجاوز",
  absconder_report: "خطاب بلاغ تغيّب",
  settlement_statement: "خطاب تسوية مالية",
  season_closure: "خطاب إنهاء موسم",
};

const LETTER_RECIPIENT_DEFAULTS: Record<string, string> = {
  ministry_intro: "سعادة وكيل وزارة الحج والعمرة",
  overstay_report: "إدارة الجوازات — قسم العمرة",
  absconder_report: "إدارة الجوازات — قسم البلاغات",
  settlement_statement: "الوكيل الخارجي",
  season_closure: "الوكيل الخارجي",
};

router.post("/letters/generate", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = generateLetterSchema.parse(req.body);

    let mutamers: any[] = [];
    let groups: any[] = [];
    let subAgent: any = null;
    let season: any = null;

    if (body.mutamerIds && body.mutamerIds.length > 0) {
      mutamers = await rawQuery(
        `SELECT m.id, m.name, m.nationality, m."passportNumber", m."visaNumber",
                m."borderNumber", m."mofaNumber", m."entryDate", m."exitDate",
                m."actualStayDays", m."programDuration", m.status,
                g."nuskGroupNumber", g.name AS "groupName"
           FROM umrah_mutamers m
           LEFT JOIN umrah_groups g ON g.id = m."groupId"
          WHERE m.id = ANY($1) AND m."companyId"=$2 AND m."deletedAt" IS NULL`,
        [body.mutamerIds, scope.companyId]
      );
    }
    if (body.groupIds && body.groupIds.length > 0) {
      groups = await rawQuery(
        `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
                a.name AS "agentName", s.name AS "subAgentName"
           FROM umrah_groups g
           LEFT JOIN umrah_agents a ON a.id = g."agentId"
           LEFT JOIN umrah_sub_agents s ON s.id = g."subAgentId"
          WHERE g.id = ANY($1) AND g."companyId"=$2 AND g."deletedAt" IS NULL`,
        [body.groupIds, scope.companyId]
      );
    }
    if (body.subAgentId) {
      [subAgent] = await rawQuery<any>(
        `SELECT id, name, "nuskCode", "clientId" FROM umrah_sub_agents
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [body.subAgentId, scope.companyId]
      );
    }
    if (body.seasonId) {
      [season] = await rawQuery<any>(
        `SELECT id, title, "hijriYear" FROM umrah_seasons
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [body.seasonId, scope.companyId]
      );
    }

    // Render the body text — RTL, business-formal Arabic. Each section is
    // a separate paragraph so the user can edit the generated draft.
    const lines: string[] = [];
    lines.push(`السلام عليكم ورحمة الله وبركاته،`);
    lines.push("");
    if (body.type === "ministry_intro" && mutamers.length > 0) {
      lines.push(`نفيدكم بأنّ المعتمرين المُدرجة أسماؤهم أدناه يتبعون مؤسستنا (ترخيص رقم 2091) خلال موسم العمرة الجاري:`);
      lines.push("");
      lines.push(`الاسم — الجنسية — رقم الجواز — رقم التأشيرة — رقم الحدود`);
      for (const m of mutamers) {
        lines.push(`• ${m.name} — ${m.nationality ?? "—"} — جواز ${m.passportNumber ?? "—"} — تأشيرة ${m.visaNumber ?? "—"} — حدود ${m.borderNumber ?? "—"}`);
      }
    } else if (body.type === "ministry_intro" && groups.length > 0) {
      lines.push(`نفيدكم بمجموعات العمرة التالية تحت كفالتنا:`);
      lines.push("");
      for (const g of groups) {
        lines.push(`• مجموعة ${g.nuskGroupNumber} — ${g.name} — ${g.mutamerCount} معتمر — الوكيل ${g.agentName ?? "—"}`);
      }
    } else if (body.type === "overstay_report") {
      lines.push(`نُفيد سعادتكم بأنّ المعتمرين الآتية أسماؤهم قد تجاوزوا المدة المسموح بها:`);
      lines.push("");
      const overstayers = mutamers.length > 0 ? mutamers : await rawQuery<any>(
        `SELECT m.id, m.name, m.nationality, m."passportNumber", m."borderNumber",
                m."actualStayDays", m."programDuration"
           FROM umrah_mutamers m
          WHERE m."companyId"=$1
            AND m."deletedAt" IS NULL
            AND m."isInsideKingdom"=true
            AND m."overstayDays" > 0`,
        [scope.companyId]
      );
      for (const m of overstayers) {
        const overDays = Math.max(0, Number(m.actualStayDays ?? 0) - Number(m.programDuration ?? 0));
        lines.push(`• ${m.name} — جواز ${m.passportNumber} — حدود ${m.borderNumber ?? "—"} — تجاوز ${overDays} يوم`);
      }
    } else if (body.type === "absconder_report") {
      const absconders = mutamers.length > 0 ? mutamers : await rawQuery<any>(
        `SELECT m.id, m.name, m.nationality, m."passportNumber", m."borderNumber",
                m."entryDate", m."entryPort"
           FROM umrah_mutamers m
          WHERE m."companyId"=$1
            AND m."deletedAt" IS NULL
            AND m.status='absconded'`,
        [scope.companyId]
      );
      lines.push(`نُبلغكم بتغيّب المعتمرين الآتية بياناتهم — ونرجو التكرّم باتّخاذ الإجراء النظامي اللازم:`);
      lines.push("");
      for (const m of absconders) {
        lines.push(`• ${m.name} — ${m.nationality ?? "—"} — جواز ${m.passportNumber} — حدود ${m.borderNumber ?? "—"} — دخل في ${m.entryDate ? String(m.entryDate).slice(0, 10) : "—"} عبر ${m.entryPort ?? "—"}`);
      }
    } else if (body.type === "settlement_statement" && subAgent) {
      lines.push(`نُحيطكم علماً بكشف التسوية المالية لحساب الوكيل '${subAgent.name}' عن موسم العمرة الحالي.`);
      const totals = await rawQuery<any>(
        `SELECT
            COALESCE(SUM(i.total),0) AS "totalBilled",
            COALESCE(SUM(i."paidAmount"),0) AS "totalPaid"
           FROM invoices i
           JOIN umrah_groups g ON g."centralInvoiceId" = i.id
          WHERE g."subAgentId"=$1 AND g."companyId"=$2 AND i."deletedAt" IS NULL`,
        [subAgent.id, scope.companyId]
      );
      const t = totals[0] ?? { totalBilled: 0, totalPaid: 0 };
      lines.push("");
      lines.push(`إجمالي المفوتر: ${Number(t.totalBilled).toFixed(2)} ر.س`);
      lines.push(`إجمالي المسدّد: ${Number(t.totalPaid).toFixed(2)} ر.س`);
      lines.push(`الرصيد المتبقي: ${(Number(t.totalBilled) - Number(t.totalPaid)).toFixed(2)} ر.س`);
    } else if (body.type === "season_closure" && season) {
      const stats = await rawQuery<any>(
        `SELECT
            COUNT(DISTINCT m.id) AS "totalMutamers",
            COUNT(DISTINCT g.id) AS "totalGroups",
            COUNT(*) FILTER (WHERE v.id IS NOT NULL) AS "totalViolations"
           FROM umrah_groups g
           LEFT JOIN umrah_mutamers m ON m."groupId" = g.id AND m."deletedAt" IS NULL
           LEFT JOIN umrah_violations v ON v."groupId" = g.id AND v."deletedAt" IS NULL
          WHERE g."seasonId"=$1 AND g."companyId"=$2 AND g."deletedAt" IS NULL`,
        [season.id, scope.companyId]
      );
      const s = stats[0] ?? { totalMutamers: 0, totalGroups: 0, totalViolations: 0 };
      lines.push(`نحيطكم علماً بختام موسم ${season.title}:`);
      lines.push("");
      lines.push(`عدد المجموعات: ${s.totalGroups}`);
      lines.push(`إجمالي المعتمرين: ${s.totalMutamers}`);
      lines.push(`إجمالي المخالفات: ${s.totalViolations}`);
    }

    if (body.additionalNotes) {
      lines.push("");
      lines.push(body.additionalNotes);
    }
    lines.push("");
    lines.push(`وتقبلوا تحياتنا،`);
    lines.push(`مؤسسة الدور الحديثة للاستثمار — ترخيص العمرة رقم 2091`);
    const content = lines.join("\n");

    // Persist via the central official_letters table — same engine used
    // for HR / legal / contract letters. No new letters table needed.
    const subject = LETTER_TITLES[body.type];
    const recipient = body.recipient ?? LETTER_RECIPIENT_DEFAULTS[body.type];

    const ins = await rawExecute(
      `INSERT INTO official_letters
         ("companyId", type, subject, content, status, "createdByAssignmentId")
       VALUES ($1, $2, $3, $4, 'draft', $5) RETURNING id`,
      [
        scope.companyId,
        `umrah_${body.type}`,
        `${subject} — ${recipient}`,
        content,
        scope.activeAssignmentId ?? scope.userId,
      ]
    );

    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "official_letters", entityId: ins.insertId,
      after: { type: body.type, scope: body.scope, recipient },
    });
    await emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId ?? undefined,
      userId: scope.userId,
      action: "umrah.letter.generated",
      entity: "official_letters",
      entityId: ins.insertId,
      details: JSON.stringify({ type: body.type, scope: body.scope, recipient }),
    });

    res.status(201).json({
      id: ins.insertId,
      type: body.type,
      subject,
      recipient,
      content,
      status: "draft",
    });
  } catch (err) { handleRouteError(err, res, "Generate letter"); }
});

router.get("/letters", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT id, type, subject, content, status, "createdAt", "sentAt", "approvedAt"
         FROM official_letters
        WHERE "companyId"=$1 AND type LIKE 'umrah_%'
        ORDER BY "createdAt" DESC LIMIT 200`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List umrah letters"); }
});

router.get("/letters/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = idParam.parse(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT id, type, subject, content, status, "createdAt", "sentAt", "approvedAt"
         FROM official_letters
        WHERE id=$1 AND "companyId"=$2 AND type LIKE 'umrah_%'`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الخطاب غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get umrah letter"); }
});

export default router;
