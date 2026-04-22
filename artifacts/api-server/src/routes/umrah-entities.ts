import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
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
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create sub-agent"); }
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
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete sub-agent"); }
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
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent client"); }
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
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Link sub-agent by nusk"); }
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
    const rows = await rawQuery(
      `INSERT INTO umrah_pricing
       ("companyId","branchId","subAgentId","agentId","seasonId","pricePerMutamer",
        "includesHotel","includesTransport","validFrom","validTo",notes,"createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING *`,
      [scope.companyId, scope.branchId, b.subAgentId || null, b.agentId, b.seasonId || null,
       b.pricePerMutamer, b.includesHotel ?? false, b.includesTransport ?? false,
       b.validFrom, b.validTo, b.notes || null, scope.userId]
    );
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
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_pricing SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
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
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update violation"); }
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
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update commission plan"); }
});

router.post("/commission-plans/:id/simulate", requirePermission("umrah:read"), async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) throw new ValidationError("الشهر والسنة مطلوبان");
    const result = await simulateCommission(Number(req.params.id), month, year);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Simulate commission"); }
});

router.post("/commission-plans/:id/calculate", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { month, year } = req.body;
    if (!month || !year) throw new ValidationError("الشهر والسنة مطلوبان");
    const result = await calculateCommissionForPlan(Number(req.params.id), month, year, scope.userId);
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
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import vouchers"); }
});

router.get("/import/batches", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND b."seasonId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT b.* FROM umrah_import_batches b WHERE ${where} ORDER BY b."uploadedAt" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import batches"); }
});

router.get("/import/batches/:id/changes", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [batch] = await rawQuery(
      `SELECT id FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
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

export default router;
