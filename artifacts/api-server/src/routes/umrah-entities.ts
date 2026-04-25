import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError } from "../lib/errorHandler.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import {
  generateSalesInvoice,
  registerPayment,
  generateStatement,
  getDashboard,
} from "../lib/umrahInvoicingEngine.js";
import {
  parseMutamersWorkbook,
  parseVouchersWorkbook,
  previewMutamersImport,
  previewVouchersImport,
  confirmMutamersImport,
  confirmVouchersImport,
} from "../lib/umrahImportEngine.js";
import {
  calculateCommissionForPlan,
  simulateCommission,
  calculateAllForCompany,
} from "../lib/umrahCommissionEngine.js";

const router = Router();
router.use(authMiddleware);

// ============================================================================
// SUB-AGENTS
// ============================================================================

router.get("/sub-agents", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT sa.*, a.name AS "agentName", c.name AS "clientName"
       FROM umrah_sub_agents sa
       LEFT JOIN umrah_agents a ON sa."agentId" = a.id
       LEFT JOIN clients c ON sa."clientId" = c.id
       WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL
       ORDER BY sa.name`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List sub-agents"); }
});

router.post("/sub-agents", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.nuskCode || !b.name) throw new ValidationError("رمز نسك والاسم مطلوبان");
    const rows = await rawQuery(
      `INSERT INTO umrah_sub_agents
       ("companyId","branchId","nuskCode",name,"agentId","clientId","paymentTerms",
        "defaultPricePerMutamer",phone,email,country,"isActive",notes,"createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING *`,
      [scope.companyId, scope.branchId, b.nuskCode, b.name, b.agentId || null,
       b.clientId || null, b.paymentTerms || "postpaid", b.defaultPricePerMutamer || null,
       b.phone || null, b.email || null, b.country || null, b.isActive ?? true,
       b.notes || null, scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sub_agents", entityId: rows[0]?.id, after: { name: b.name } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.created", entity: "umrah_sub_agents", entityId: rows[0]?.id, details: JSON.stringify({ name: b.name, nuskCode: b.nuskCode }) }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create sub-agent"); }
});

router.get("/sub-agents/unlinked", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."clientId" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) {
      params.push(seasonId);
      where += ` AND sa."agentId" IN (SELECT id FROM umrah_agents WHERE "seasonId" = $${params.length} OR "seasonId" IS NULL)`;
    }
    const rows = await rawQuery(
      `SELECT sa.*, a.name AS "agentName",
              (SELECT sa2."clientId" FROM umrah_sub_agents sa2
               WHERE sa2."companyId" = sa."companyId" AND sa2.name = sa.name
                 AND sa2."clientId" IS NOT NULL AND sa2."deletedAt" IS NULL
               ORDER BY sa2."createdAt" DESC LIMIT 1) AS "suggestedClientId",
              (SELECT c2.name FROM clients c2
               JOIN umrah_sub_agents sa3 ON sa3."clientId" = c2.id
               WHERE sa3."companyId" = sa."companyId" AND sa3.name = sa.name
                 AND sa3."clientId" IS NOT NULL AND sa3."deletedAt" IS NULL
               ORDER BY sa3."createdAt" DESC LIMIT 1) AS "suggestedClientName"
       FROM umrah_sub_agents sa
       LEFT JOIN umrah_agents a ON sa."agentId" = a.id
       WHERE ${where}
       ORDER BY sa.name`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List unlinked sub-agents"); }
});

router.patch("/sub-agents/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["nuskCode","name","agentId","clientId","paymentTerms","defaultPricePerMutamer","phone","email","country","isActive","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_sub_agents SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: Number(req.params.id), after: b }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.updated", entity: "umrah_sub_agents", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update sub-agent"); }
});

router.delete("/sub-agents/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(
      `UPDATE umrah_sub_agents SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.userId, req.params.id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_sub_agents", entityId: Number(req.params.id) }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.deleted", entity: "umrah_sub_agents", entityId: Number(req.params.id), details: "{}" }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete sub-agent"); }
});

router.put("/sub-agents/:id/link", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { clientId, createNew, clientName, clientPhone } = req.body;

    let finalClientId = clientId;

    if (createNew) {
      if (!clientName) throw new ValidationError("اسم العميل مطلوب عند إنشاء عميل جديد");
      const [newClient] = await rawQuery(
        `INSERT INTO clients ("companyId", name, phone, classification, source, "createdAt")
         VALUES ($1, $2, $3, 'umrah_agent', 'system', NOW()) RETURNING id`,
        [scope.companyId, clientName, clientPhone || null]
      );
      finalClientId = newClient.id;
    } else {
      if (!clientId) throw new ValidationError("معرف العميل مطلوب");
      await rawExecute(
        `UPDATE clients SET classification = 'umrah_agent' WHERE id = $1 AND "companyId" = $2`,
        [clientId, scope.companyId]
      );
    }

    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
      [finalClientId, scope.userId, req.params.id, scope.companyId]
    );

    const [row] = await rawQuery(
      `SELECT sa.*, c.name AS "clientName" FROM umrah_sub_agents sa
       LEFT JOIN clients c ON c.id = sa."clientId"
       WHERE sa.id=$1 AND sa."companyId"=$2`,
      [req.params.id, scope.companyId]
    );

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.agent.linked", entity: "umrah_sub_agents", entityId: Number(req.params.id), details: JSON.stringify({ clientId: finalClientId, createNew: !!createNew }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: Number(req.params.id), after: { clientId: finalClientId } }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent"); }
});

router.post("/sub-agents/link-by-nusk", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { nuskCode, clientId } = req.body;
    if (!nuskCode || !clientId) throw new ValidationError("رمز نسك ومعرف العميل مطلوبان");
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE "companyId"=$3 AND "nuskCode"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, scope.companyId, nuskCode]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: 0, after: { nuskCode, clientId } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.linked_by_nusk", entity: "umrah_sub_agents", entityId: 0, details: JSON.stringify({ nuskCode, clientId }) }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Link sub-agent by nusk"); }
});

router.post("/sub-agents/:id/link-client", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { clientId } = req.body;
    if (!clientId) throw new ValidationError("معرف العميل مطلوب");
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, req.params.id, scope.companyId]
    );
    const [row] = await rawQuery(`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: Number(req.params.id), after: { clientId } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.client_linked", entity: "umrah_sub_agents", entityId: Number(req.params.id), details: JSON.stringify({ clientId }) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent client"); }
});

// ============================================================================
// PRICING
// ============================================================================

router.get("/pricing", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT p.*, a.name AS "agentName", sa.name AS "subAgentName", s.title AS "seasonTitle"
       FROM umrah_pricing p
       LEFT JOIN umrah_agents a ON p."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON p."subAgentId" = sa.id
       LEFT JOIN umrah_seasons s ON p."seasonId" = s.id
       WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
       ORDER BY p."validFrom" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List pricing"); }
});

router.post("/pricing", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.agentId || !b.pricePerMutamer || !b.validFrom || !b.validTo) {
      throw new ValidationError("الوكيل والسعر والفترة مطلوبة");
    }
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_pricing", entityId: rows[0]?.id, after: b }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.created", entity: "umrah_pricing", entityId: rows[0]?.id, details: JSON.stringify({ agentId: b.agentId, pricePerMutamer: b.pricePerMutamer }) }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create pricing"); }
});

router.patch("/pricing/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["subAgentId","agentId","seasonId","pricePerMutamer","includesHotel","includesTransport","validFrom","validTo","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    if (b.validFrom || b.validTo) {
      const [current] = await rawQuery(`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
      if (current) {
        const vf = b.validFrom || current.validFrom;
        const vt = b.validTo || current.validTo;
        const agId = b.agentId ?? current.agentId;
        const saId = b.subAgentId ?? current.subAgentId;
        const sId = b.seasonId ?? current.seasonId;
        const overlap = await rawQuery(
          `SELECT id FROM umrah_pricing
           WHERE "companyId" = $1 AND "agentId" = $2 AND "deletedAt" IS NULL AND id != $3
             AND (("subAgentId" IS NULL AND $4::int IS NULL) OR "subAgentId" = $4)
             AND (("seasonId" IS NULL AND $5::int IS NULL) OR "seasonId" = $5)
             AND "validFrom" <= $7 AND "validTo" >= $6`,
          [scope.companyId, agId, req.params.id, saId || null, sId || null, vf, vt]
        );
        if (overlap.length > 0) {
          throw new ConflictError("يوجد تداخل في فترات الأسعار لنفس الوكيل والموسم", { field: "validFrom" });
        }
      }
    }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_pricing SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pricing", entityId: Number(req.params.id), after: b }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.updated", entity: "umrah_pricing", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update pricing"); }
});

router.delete("/pricing/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(
      `UPDATE umrah_pricing SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.userId, req.params.id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_pricing", entityId: Number(req.params.id) }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.deleted", entity: "umrah_pricing", entityId: Number(req.params.id), details: "{}" }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete pricing"); }
});

// ============================================================================
// VIOLATIONS
// ============================================================================

router.get("/violations", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, type, status, agentId, subAgentId } = req.query as any;
    let where = `v."companyId" = $1 AND v."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (type) { params.push(type); where += ` AND v.type = $${params.length}`; }
    if (status) { params.push(status); where += ` AND v.status = $${params.length}`; }
    if (agentId) { params.push(agentId); where += ` AND v."agentId" = $${params.length}`; }
    if (subAgentId) { params.push(subAgentId); where += ` AND v."subAgentId" = $${params.length}`; }
    if (seasonId) {
      params.push(seasonId);
      where += ` AND v."groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $${params.length})`;
    }
    const rows = await rawQuery(
      `SELECT v.*, p."fullName" AS "mutamerName", p."passportNumber",
              a.name AS "agentName", sa.name AS "subAgentName"
       FROM umrah_violations v
       LEFT JOIN umrah_pilgrims p ON v."mutamerId" = p.id
       LEFT JOIN umrah_agents a ON v."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON v."subAgentId" = sa.id
       WHERE ${where}
       ORDER BY v."createdAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List violations"); }
});

router.get("/violations/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT v.*, a.name AS "agentName", sa.name AS "subAgentName"
       FROM umrah_violations v
       LEFT JOIN umrah_agents a ON v."agentId"=a.id
       LEFT JOIN umrah_sub_agents sa ON v."subAgentId"=sa.id
       WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get violation"); }
});

router.post("/violations", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.type) throw new ValidationError("نوع المخالفة مطلوب");
    const rows = await rawQuery(
      `INSERT INTO umrah_violations
       ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId","groupId",
        "subAgentId","agentId",description,"penaltyAmount",status,"createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING *`,
      [scope.companyId, scope.branchId, b.type, b.referenceType || null, b.referenceNumber || null,
       b.mutamerId || null, b.groupId || null, b.subAgentId || null, b.agentId || null,
       b.description || null, b.penaltyAmount || 0, b.status || "open", scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_violations", entityId: rows[0]?.id, after: { type: b.type } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.violation.created", entity: "umrah_violations", entityId: rows[0]?.id, after: { type: b.type, penaltyAmount: b.penaltyAmount || 0 } }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create violation"); }
});

router.patch("/violations/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["type","referenceType","referenceNumber","description","penaltyAmount","status","linkedInvoiceId"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_violations SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_violations WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_violations", entityId: Number(req.params.id), after: b }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.violation.updated", entity: "umrah_violations", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update violation"); }
});

router.delete("/violations/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(
      `UPDATE umrah_violations SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.userId, req.params.id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_violations", entityId: Number(req.params.id) }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.violation.deleted", entity: "umrah_violations", entityId: Number(req.params.id), details: "{}" }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete violation"); }
});

// ============================================================================
// GROUPS
// ============================================================================

router.get("/groups", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `g."companyId" = $1 AND g."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND g."seasonId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT g.*, a.name AS "agentName", sa.name AS "subAgentName", s.title AS "seasonTitle"
       FROM umrah_groups g
       LEFT JOIN umrah_agents a ON g."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON g."subAgentId" = sa.id
       LEFT JOIN umrah_seasons s ON g."seasonId" = s.id
       WHERE ${where}
       ORDER BY g."createdAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List groups"); }
});

// ============================================================================
// NUSK INVOICES
// ============================================================================

router.get("/nusk-invoices", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, groupId } = req.query as any;
    let where = `ni."companyId" = $1 AND ni."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (groupId) { params.push(groupId); where += ` AND ni."groupId" = $${params.length}`; }
    if (seasonId) {
      params.push(seasonId);
      where += ` AND ni."groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $${params.length})`;
    }
    const rows = await rawQuery(
      `SELECT ni.*, a.name AS "agentName", sa.name AS "subAgentName", g."nuskGroupNumber"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_agents a ON ni."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON ni."subAgentId" = sa.id
       LEFT JOIN umrah_groups g ON ni."groupId" = g.id
       WHERE ${where}
       ORDER BY ni."createdAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List nusk invoices"); }
});

// ============================================================================
// COMMISSION PLANS
// ============================================================================

router.get("/commission-plans", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT cp.*,
              s.title AS "seasonTitle",
              (SELECT COUNT(*)::int FROM employee_commission_tiers WHERE "planId" = cp.id) AS "tierCount"
       FROM employee_commission_plans cp
       LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id
       WHERE cp."companyId" = $1 AND cp."deletedAt" IS NULL
       ORDER BY cp."createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List commission plans"); }
});

router.get("/commission-plans/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [plan] = await rawQuery(
      `SELECT cp.*, s.title AS "seasonTitle"
       FROM employee_commission_plans cp
       LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id
       WHERE cp.id = $1 AND cp."companyId" = $2 AND cp."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!plan) { throw new NotFoundError("الخطة غير موجودة"); }
    const tiers = await rawQuery(
      `SELECT * FROM employee_commission_tiers WHERE "planId" = $1 ORDER BY "tierOrder"`,
      [req.params.id]
    );
    const calculations = await rawQuery(
      `SELECT * FROM employee_commission_calculations
       WHERE "planId" = $1 AND "deletedAt" IS NULL ORDER BY year DESC, month DESC LIMIT 12`,
      [req.params.id]
    );
    res.json({ ...plan, tiers, calculations });
  } catch (err) { handleRouteError(err, res, "Get commission plan"); }
});

router.post("/commission-plans", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.employeeId || !b.seasonId || !b.planName) throw new ValidationError("الموظف والموسم واسم الخطة مطلوبة");

    const result = await withTransaction(async (client) => {
      const planRes = await client.query(
        `INSERT INTO employee_commission_plans
         ("companyId","branchId","employeeId","assignmentId","seasonId","planName","baseSalary",
          "commissionType","percentageRate","fixedAmount","conditionType","minProfitPerVisa","minSalesPercent",
          "minAvgPrice","excludedMonths","tierUnit","partialTiersAllowed","violationBlocksCommission",
          status,notes,"createdBy","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active',$19,$20,NOW(),NOW())
         RETURNING *`,
        [
          scope.companyId, scope.branchId, b.employeeId, b.assignmentId || b.employeeId,
          b.seasonId, b.planName, b.baseSalary || 0,
          b.commissionType || "tiered", b.percentageRate || null, b.fixedAmount || null,
          b.conditionType || "none", b.minProfitPerVisa || null, b.minSalesPercent || null,
          b.minAvgPrice || null, JSON.stringify(b.excludedMonths ?? []),
          b.tierUnit || 10000, b.partialTiersAllowed ?? false, b.violationBlocksCommission ?? true,
          b.notes || null, scope.userId,
        ]
      );
      const plan = planRes.rows[0];

      if (Array.isArray(b.tiers)) {
        for (let i = 0; i < b.tiers.length; i++) {
          const t = b.tiers[i];
          await client.query(
            `INSERT INTO employee_commission_tiers ("planId","fromCount","toCount","bonusPerUnit","isCumulative","tierOrder")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [plan.id, t.fromCount, t.toCount ?? null, t.bonusPerUnit, t.isCumulative ?? true, i + 1]
          );
        }
      }
      return plan;
    });

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "employee_commission_plans", entityId: result.id, after: { planName: b.planName } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.created", entity: "employee_commission_plans", entityId: result.id, details: JSON.stringify({ planName: b.planName }) }).catch(console.error);
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Create commission plan"); }
});

router.patch("/commission-plans/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    await withTransaction(async (client) => {
      const params: any[] = [];
      const sets: string[] = [];
      for (const key of [
        "planName","baseSalary","commissionType","percentageRate","fixedAmount",
        "conditionType","minProfitPerVisa","minSalesPercent","minAvgPrice",
        "tierUnit","partialTiersAllowed","violationBlocksCommission","status","notes",
      ]) {
        if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
      }
      if (b.excludedMonths !== undefined) {
        params.push(JSON.stringify(b.excludedMonths));
        sets.push(`"excludedMonths"=$${params.length}`);
      }
      if (sets.length > 0) {
        params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
        sets.push(`"updatedAt"=NOW()`);
        params.push(req.params.id); params.push(scope.companyId);
        await client.query(
          `UPDATE employee_commission_plans SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
          params
        );
      }

      if (Array.isArray(b.tiers)) {
        await client.query(`DELETE FROM employee_commission_tiers WHERE "planId" = $1`, [req.params.id]);
        for (let i = 0; i < b.tiers.length; i++) {
          const t = b.tiers[i];
          await client.query(
            `INSERT INTO employee_commission_tiers ("planId","fromCount","toCount","bonusPerUnit","isCumulative","tierOrder")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.params.id, t.fromCount, t.toCount ?? null, t.bonusPerUnit, t.isCumulative ?? true, i + 1]
          );
        }
      }
    });

    const [row] = await rawQuery(
      `SELECT * FROM employee_commission_plans WHERE id=$1 AND "companyId"=$2`,
      [req.params.id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.updated", entity: "employee_commission_plans", entityId: Number(req.params.id), details: JSON.stringify({ planName: b.planName }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_commission_plans", entityId: Number(req.params.id), after: { planName: b.planName } }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update commission plan"); }
});

router.post("/commission-plans/:id/simulate", requirePermission("umrah:read"), async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) throw new ValidationError("الشهر والسنة مطلوبان");
    const scope = req.scope!;
    const result = await simulateCommission(Number(req.params.id), month, year);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission.simulated", entity: "employee_commission_plans", entityId: Number(req.params.id), details: JSON.stringify({ month, year }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "preview", entity: "umrah_commission_plans", entityId: Number(req.params.id), after: { month, year } }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Simulate commission"); }
});

router.post("/commission-plans/:id/calculate", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { month, year } = req.body;
    if (!month || !year) throw new ValidationError("الشهر والسنة مطلوبان");
    const result = await calculateCommissionForPlan(Number(req.params.id), month, year, scope.userId);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission.calculated", entity: "employee_commission_plans", entityId: Number(req.params.id), details: JSON.stringify({ month, year }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_commissions", entityId: Number(req.params.id), after: { month, year } }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Calculate commission"); }
});

router.get("/commission-calculations", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { planId, year, month } = req.query as any;
    let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (planId) { params.push(planId); where += ` AND cc."planId" = $${params.length}`; }
    if (year) { params.push(year); where += ` AND cc.year = $${params.length}`; }
    if (month) { params.push(month); where += ` AND cc.month = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT cc.*, cp."planName"
       FROM employee_commission_calculations cc
       LEFT JOIN employee_commission_plans cp ON cc."planId" = cp.id
       WHERE ${where}
       ORDER BY cc.year DESC, cc.month DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List commission calculations"); }
});

// ============================================================================
// IMPORT — preview + confirm
// ============================================================================

router.post("/import/preview", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { fileType, seasonId, rows } = req.body;
    if (!fileType || !seasonId || !Array.isArray(rows)) {
      throw new ValidationError("نوع الملف والموسم والبيانات مطلوبة");
    }
    const importScope = { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: Number(seasonId) };
    const diff = fileType === "mutamers"
      ? await previewMutamersImport(importScope, rows)
      : await previewVouchersImport(importScope, rows);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, action: "umrah.import.previewed", entity: "umrah_import_logs", entityId: 0, details: JSON.stringify({ fileType, seasonId, rowCount: rows.length }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "preview", entity: "umrah_pilgrims", entityId: 0, after: { fileType, seasonId, rowCount: rows.length } }).catch(console.error);
    res.json(diff);
  } catch (err) { handleRouteError(err, res, "Import preview"); }
});

router.post("/import/mutamers", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, rows, fileName } = req.body;
    if (!seasonId || !Array.isArray(rows)) throw new ValidationError("الموسم والبيانات مطلوبة");
    const importScope = { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: Number(seasonId) };
    const result = await confirmMutamersImport(importScope, rows, fileName || "mutamers.xlsx");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_import_batches", entityId: result.batchId, after: result }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, action: "umrah.mutamers.imported", entity: "umrah_import_logs", entityId: result.batchId, details: JSON.stringify({ seasonId, fileName: fileName || "mutamers.xlsx", rowCount: rows.length }) }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import mutamers"); }
});

router.post("/import/vouchers", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, rows, fileName } = req.body;
    if (!seasonId || !Array.isArray(rows)) throw new ValidationError("الموسم والبيانات مطلوبة");
    const importScope = { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: Number(seasonId) };
    const result = await confirmVouchersImport(importScope, rows, fileName || "vouchers.xlsx");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_import_batches", entityId: result.batchId, after: result }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, action: "umrah.vouchers.imported", entity: "umrah_import_logs", entityId: result.batchId, details: JSON.stringify({ seasonId, fileName: fileName || "vouchers.xlsx", rowCount: rows.length }) }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import vouchers"); }
});

router.get("/import/batches", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `b."companyId" = $1`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND b."seasonId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT b.* FROM umrah_import_batches b WHERE ${where} ORDER BY b."createdAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import batches"); }
});

router.get("/import/batches/:id/changes", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [batch] = await rawQuery(
      `SELECT id FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");
    const rows = await rawQuery(
      `SELECT * FROM umrah_import_changes WHERE "batchId" = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List batch changes"); }
});

// ============================================================================
// SALES INVOICES
// ============================================================================

router.get("/invoices", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, subAgentId, status } = req.query as any;
    let where = `si."companyId" = $1 AND si."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND si."seasonId" = $${params.length}`; }
    if (subAgentId) { params.push(subAgentId); where += ` AND si."subAgentId" = $${params.length}`; }
    if (status) { params.push(status); where += ` AND si.status = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT si.*, sa.name AS "subAgentName", c.name AS "clientName"
       FROM umrah_sales_invoices si
       LEFT JOIN umrah_sub_agents sa ON sa.id = si."subAgentId"
       LEFT JOIN clients c ON c.id = si."clientId"
       WHERE ${where}
       ORDER BY si."createdAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List umrah invoices"); }
});

router.post("/invoices/generate", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { subAgentId, groupIds, seasonId } = req.body;
    if (!subAgentId || !Array.isArray(groupIds) || !seasonId) {
      throw new ValidationError("الوكيل الفرعي والمجموعات والموسم مطلوبة");
    }
    const result = await generateSalesInvoice(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      { subAgentId, groupIds, seasonId }
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { subAgentId, groupIds, seasonId } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.generated", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { ref: result.ref, total: result.total } }).catch(console.error);
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Generate umrah invoice"); }
});

router.get("/invoices/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [invoice] = await rawQuery(
      `SELECT si.*, sa.name AS "subAgentName", c.name AS "clientName"
       FROM umrah_sales_invoices si
       LEFT JOIN umrah_sub_agents sa ON sa.id = si."subAgentId"
       LEFT JOIN clients c ON c.id = si."clientId"
       WHERE si.id = $1 AND si."companyId" = $2 AND si."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!invoice) { throw new NotFoundError("الفاتورة غير موجودة"); }
    const items = await rawQuery(
      `SELECT * FROM umrah_sales_invoice_items WHERE "invoiceId" = $1 ORDER BY id`,
      [req.params.id]
    );
    const allocations = await rawQuery(
      `SELECT pa.*, p.ref AS "paymentRef", p."paymentDate"
       FROM umrah_payment_allocations pa
       JOIN umrah_payments p ON p.id = pa."paymentId"
       WHERE pa."invoiceId" = $1
       ORDER BY pa."createdAt"`,
      [req.params.id]
    );
    res.json({ ...invoice, items, allocations });
  } catch (err) { handleRouteError(err, res, "Get umrah invoice"); }
});

router.patch("/invoices/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["status","notes","dueDate"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(
      `UPDATE umrah_sales_invoices SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
      params
    );
    const [row] = await rawQuery(
      `SELECT * FROM umrah_sales_invoices WHERE id=$1 AND "companyId"=$2`,
      [req.params.id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sales_invoices", entityId: Number(req.params.id), after: b }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.updated", entity: "umrah_sales_invoices", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update umrah invoice"); }
});

// ============================================================================
// PAYMENTS
// ============================================================================

router.get("/payments", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { subAgentId } = req.query as any;
    let where = `p."companyId" = $1 AND p."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (subAgentId) { params.push(subAgentId); where += ` AND p."subAgentId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT p.*, sa.name AS "subAgentName"
       FROM umrah_payments p
       LEFT JOIN umrah_sub_agents sa ON sa.id = p."subAgentId"
       WHERE ${where}
       ORDER BY p."paymentDate" DESC, p.id DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List umrah payments"); }
});

router.post("/payments", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.subAgentId || !b.sarAmount) throw new ValidationError("الوكيل الفرعي والمبلغ مطلوبان");
    const result = await registerPayment(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      {
        subAgentId: b.subAgentId,
        amount: b.amount || b.sarAmount,
        currency: b.currency || "SAR",
        exchangeRate: b.exchangeRate,
        sarAmount: b.sarAmount,
        method: b.method || "bank_transfer",
        reference: b.reference,
        invoiceIds: b.invoiceIds,
      }
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_payments", entityId: result.paymentId, after: { subAgentId: b.subAgentId, sarAmount: b.sarAmount } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.payment.received", entity: "umrah_payments", entityId: result.paymentId, after: { ref: result.ref, sarAmount: b.sarAmount } }).catch(console.error);
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Register umrah payment"); }
});

// ============================================================================
// STATEMENTS
// ============================================================================

router.get("/statements/:subAgentId", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { type, from, to } = req.query as any;
    const stmtType = type === "summary" ? "summary" : "detailed";
    const result = await generateStatement(
      { companyId: scope.companyId, userId: scope.userId },
      Number(req.params.subAgentId),
      stmtType,
      from, to
    );
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Generate statement"); }
});

// ============================================================================
// DASHBOARD
// ============================================================================

router.get("/dashboard", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    if (!seasonId) throw new ValidationError("معرف الموسم مطلوب");
    const result = await getDashboard(
      { companyId: scope.companyId, userId: scope.userId },
      Number(seasonId)
    );
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Umrah dashboard"); }
});

export default router;
