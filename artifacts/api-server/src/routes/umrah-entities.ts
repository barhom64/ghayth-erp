// ─────────────────────────────────────────────────────────────────────────────
// umrah-entities.ts — COMMERCIAL/FINANCE entities for the umrah module
//
// Owns: sub-agents (CRUD + linking), pricing, groups (CRUD), nusk-invoices,
//       sales-invoices (generate + update), payments, statements,
//       commissions (plans + calculate + simulate), import-batches,
//       employee-assignments.
//
// Sister file: umrah.ts — CORE DOMAIN (lifecycle + operational)
//   Owns: seasons, agents, packages, pilgrims, transport, import,
//         daily-status, penalties, violations, agent-invoices, bulk-assign.
//
// Both mounted at /umrah with requireModule("operations") + requireGuards("financial").
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import {
  generateSalesInvoice,
  registerPayment,
  generateStatement,
} from "../lib/umrahInvoicingEngine.js";
import {
  calculateCommissionForPlan,
  simulateCommission,
  calculateAllForCompany,
} from "../lib/umrahCommissionEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

async function requireOpenSeason(seasonId: number, companyId: number): Promise<void> {
  const [season] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
    [seasonId, companyId]
  );
  if (!season) throw new ValidationError("الموسم غير موجود", { field: "seasonId" });
  if (season.status !== "open") {
    throw new ConflictError(`الموسم مغلق (${season.status}) — لا يمكن إجراء عمليات عليه`);
  }
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const createSubAgentSchema = z.object({
  nuskCode: z.string().min(1, "رمز نسك مطلوب"),
  name: z.string().min(1, "الاسم مطلوب"),
  agentId: z.coerce.number().optional(),
  clientId: z.coerce.number().optional(),
  paymentTerms: z.string().optional(),
  defaultPricePerMutamer: z.coerce.number().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

const updateSubAgentSchema = z.object({
  nuskCode: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  agentId: z.coerce.number().nullable().optional(),
  clientId: z.coerce.number().nullable().optional(),
  paymentTerms: z.string().optional(),
  defaultPricePerMutamer: z.coerce.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const linkSubAgentSchema = z.object({
  clientId: z.coerce.number().optional(),
  createNew: z.boolean().optional(),
  clientName: z.string().optional(),
  clientPhone: z.string().optional(),
});

const linkByNuskSchema = z.object({
  nuskCode: z.string().min(1, "رمز نسك مطلوب"),
  clientId: z.coerce.number({ required_error: "معرف العميل مطلوب" }),
});

const linkClientSchema = z.object({
  clientId: z.coerce.number({ required_error: "معرف العميل مطلوب" }),
});

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
});

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

const commissionTierSchema = z.object({
  fromCount: z.coerce.number(),
  toCount: z.coerce.number().nullable().optional(),
  bonusPerUnit: z.coerce.number(),
  isCumulative: z.boolean().optional(),
});

const createCommissionPlanSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  planName: z.string().min(1, "اسم الخطة مطلوب"),
  assignmentId: z.coerce.number().optional(),
  baseSalary: z.coerce.number().optional(),
  commissionType: z.string().optional(),
  percentageRate: z.coerce.number().nullable().optional(),
  fixedAmount: z.coerce.number().nullable().optional(),
  conditionType: z.string().optional(),
  minProfitPerVisa: z.coerce.number().nullable().optional(),
  minSalesPercent: z.coerce.number().nullable().optional(),
  minAvgPrice: z.coerce.number().nullable().optional(),
  excludedMonths: z.array(z.coerce.number()).optional(),
  tierUnit: z.coerce.number().optional(),
  partialTiersAllowed: z.boolean().optional(),
  violationBlocksCommission: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  tiers: z.array(commissionTierSchema).optional(),
});

const updateCommissionPlanSchema = z.object({
  planName: z.string().min(1).optional(),
  baseSalary: z.coerce.number().optional(),
  commissionType: z.string().optional(),
  percentageRate: z.coerce.number().nullable().optional(),
  fixedAmount: z.coerce.number().nullable().optional(),
  conditionType: z.string().optional(),
  minProfitPerVisa: z.coerce.number().nullable().optional(),
  minSalesPercent: z.coerce.number().nullable().optional(),
  minAvgPrice: z.coerce.number().nullable().optional(),
  excludedMonths: z.array(z.coerce.number()).optional(),
  tierUnit: z.coerce.number().optional(),
  partialTiersAllowed: z.boolean().optional(),
  violationBlocksCommission: z.boolean().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  tiers: z.array(commissionTierSchema).optional(),
});

const simulateCommissionSchema = z.object({
  month: z.coerce.number({ required_error: "الشهر مطلوب" }),
  year: z.coerce.number({ required_error: "السنة مطلوبة" }),
});

const generateInvoiceSchema = z.object({
  subAgentId: z.coerce.number({ required_error: "الوكيل الفرعي مطلوب" }),
  groupIds: z.array(z.coerce.number()).min(1, "المجموعات مطلوبة"),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
});

const updateInvoiceSchema = z.object({
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

const createPaymentSchema = z.object({
  subAgentId: z.coerce.number({ required_error: "الوكيل الفرعي مطلوب" }),
  sarAmount: z.coerce.number({ required_error: "المبلغ مطلوب" }),
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
  exchangeRate: z.coerce.number().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  invoiceIds: z.array(z.coerce.number()).optional(),
});

// ============================================================================
// SUB-AGENTS
// ============================================================================

router.get("/sub-agents", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT sa.*, a.name AS "agentName", c.name AS "clientName"
       FROM umrah_sub_agents sa
       LEFT JOIN umrah_agents a ON sa."agentId" = a.id
       LEFT JOIN clients c ON sa."clientId" = c.id AND c."deletedAt" IS NULL
       WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL
       ORDER BY sa.name
       LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List sub-agents"); }
});

router.post("/sub-agents", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createSubAgentSchema.safeParse(req.body));
    const b = parsed;
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
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الوكيل الفرعي");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sub_agents", entityId: rows[0].id, after: { name: b.name } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.created", entity: "umrah_sub_agents", entityId: rows[0].id, details: JSON.stringify({ name: b.name, nuskCode: b.nuskCode }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create sub-agent"); }
});

router.get("/sub-agents/unlinked", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."clientId" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId && Number(seasonId)) {
      // Season filter via agent's packages rather than direct column
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

router.patch("/sub-agents/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateSubAgentSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["nuskCode","name","agentId","clientId","paymentTerms","defaultPricePerMutamer","phone","email","country","isActive","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE umrah_sub_agents SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("الوكيل الفرعي غير موجود");
    const [row] = await rawQuery(`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: id, after: b }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.updated", entity: "umrah_sub_agents", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update sub-agent"); }
});

router.delete("/sub-agents/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_sub_agents SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.userId, id, scope.companyId]
    );
    if (affectedRows === 0) throw new NotFoundError("الوكيل الفرعي غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_sub_agents", entityId: id }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.deleted", entity: "umrah_sub_agents", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete sub-agent"); }
});

router.put("/sub-agents/:id/link", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(linkSubAgentSchema.safeParse(req.body));
    const { clientId, createNew, clientName, clientPhone } = parsed;

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
      const [existingClient] = await rawQuery<any>(
        `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [clientId, scope.companyId]
      );
      if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
      await rawExecute(
        `UPDATE clients SET classification = 'umrah_agent' WHERE id = $1 AND "companyId" = $2`,
        [clientId, scope.companyId]
      );
    }

    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
      [finalClientId, scope.userId, id, scope.companyId]
    );

    const [row] = await rawQuery(
      `SELECT sa.*, c.name AS "clientName" FROM umrah_sub_agents sa
       LEFT JOIN clients c ON c.id = sa."clientId" AND c."deletedAt" IS NULL
       WHERE sa.id=$1 AND sa."companyId"=$2 AND sa."deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.agent.linked", entity: "umrah_sub_agents", entityId: id, details: JSON.stringify({ clientId: finalClientId, createNew: !!createNew }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: id, after: { clientId: finalClientId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent"); }
});

router.post("/sub-agents/link-by-nusk", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(linkByNuskSchema.safeParse(req.body));
    const { nuskCode, clientId } = parsed;
    const [existingClient] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE "companyId"=$3 AND "nuskCode"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, scope.companyId, nuskCode]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: 0, after: { nuskCode, clientId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.linked_by_nusk", entity: "umrah_sub_agents", entityId: 0, details: JSON.stringify({ nuskCode, clientId }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Link sub-agent by nusk"); }
});

router.post("/sub-agents/:id/link-client", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(linkClientSchema.safeParse(req.body));
    const { clientId } = parsed;
    const [existingClient] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, id, scope.companyId]
    );
    const [row] = await rawQuery(`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sub_agents", entityId: id, after: { clientId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.client_linked", entity: "umrah_sub_agents", entityId: id, details: JSON.stringify({ clientId }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent client"); }
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
       LEFT JOIN umrah_sub_agents sa ON p."subAgentId" = sa.id
       LEFT JOIN umrah_seasons s ON p."seasonId" = s.id AND s."deletedAt" IS NULL
       WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
       ORDER BY p."validFrom" DESC
       LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows });
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_pricing", entityId: rows[0]?.id, after: b }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.created", entity: "umrah_pricing", entityId: rows[0]?.id, details: JSON.stringify({ agentId: b.agentId, pricePerMutamer: b.pricePerMutamer }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create pricing"); }
});

router.patch("/pricing/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updatePricingSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: any[] = [];
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pricing", entityId: id, after: b }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.updated", entity: "umrah_pricing", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_pricing", entityId: id }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pricing.deleted", entity: "umrah_pricing", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete pricing"); }
});

// ============================================================================
// GROUPS
// ============================================================================

router.get("/groups", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
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
       LEFT JOIN umrah_seasons s ON g."seasonId" = s.id AND s."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY g."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List groups"); }
});

const createGroupSchema = z.object({
  nuskGroupNumber: z.string().min(1),
  name: z.string().optional(),
  agentId: z.coerce.number().optional(),
  subAgentId: z.coerce.number().optional(),
  seasonId: z.coerce.number(),
  mutamerCount: z.coerce.number().int().min(0).default(0),
  programDuration: z.coerce.number().int().optional(),
});

const patchGroupSchema = z.object({
  name: z.string().optional(),
  agentId: z.coerce.number().optional().nullable(),
  subAgentId: z.coerce.number().optional().nullable(),
  mutamerCount: z.coerce.number().int().min(0).optional(),
  programDuration: z.coerce.number().int().optional(),
  status: z.string().optional(),
});

router.get("/groups/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT g.*, a.name AS "agentName", sa.name AS "subAgentName", s.title AS "seasonTitle"
       FROM umrah_groups g
       LEFT JOIN umrah_agents a ON g."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON g."subAgentId" = sa.id
       LEFT JOIN umrah_seasons s ON g."seasonId" = s.id AND s."deletedAt" IS NULL
       WHERE g.id = $1 AND g."companyId" = $2 AND g."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المجموعة غير موجودة");
    const pilgrims = await rawQuery(
      `SELECT id, "fullName", nationality, status FROM umrah_pilgrims WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "fullName"`,
      [id, scope.companyId]
    );
    res.json({ ...row, pilgrims });
  } catch (err) { handleRouteError(err, res, "Get group"); }
});

router.post("/groups", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createGroupSchema.safeParse(req.body));
    await requireOpenSeason(b.seasonId, scope.companyId);
    const rows = await rawQuery(
      `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber",name,"agentId","subAgentId","seasonId","mutamerCount","programDuration","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [scope.companyId, scope.branchId || null, b.nuskGroupNumber, b.name || null, b.agentId || null, b.subAgentId || null, b.seasonId, b.mutamerCount, b.programDuration || null, scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_groups", entityId: rows[0]?.id, after: { nuskGroupNumber: b.nuskGroupNumber } }).catch((e) => logger.error(e, "umrah groups bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.group.created", entity: "umrah_groups", entityId: rows[0]?.id }).catch((e) => logger.error(e, "umrah groups bg"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create group"); }
});

router.patch("/groups/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchGroupSchema.safeParse(req.body));
    const fieldKeys = ["name", "agentId", "subAgentId", "mutamerCount", "programDuration", "status"] as const;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of fieldKeys) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}" = $${params.length}`); }
    }
    if (sets.length === 0) {
      const [row] = await rawQuery(`SELECT * FROM umrah_groups WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (!row) throw new NotFoundError("المجموعة غير موجودة");
      res.json(row);
      return;
    }
    params.push(scope.userId); sets.push(`"updatedBy" = $${params.length}`);
    sets.push(`"updatedAt" = NOW()`);
    params.push(id); params.push(scope.companyId);
    await rawExecute(
      `UPDATE umrah_groups SET ${sets.join(",")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
      params
    );
    const [row] = await rawQuery(`SELECT * FROM umrah_groups WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المجموعة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_groups", entityId: id }).catch((e) => logger.error(e, "umrah groups bg"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update group"); }
});

router.delete("/groups/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT id, "salesInvoiceId" FROM umrah_groups WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المجموعة غير موجودة");
    if (existing.salesInvoiceId) throw new ConflictError("لا يمكن حذف مجموعة مفوترة");
    await rawExecute(
      `UPDATE umrah_groups SET "deletedAt" = NOW(), "updatedBy" = $3, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId, scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_groups", entityId: id }).catch((e) => logger.error(e, "umrah groups bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete group"); }
});

// ============================================================================
// NUSK INVOICES
// ============================================================================

router.get("/nusk-invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
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
       ORDER BY ni."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List nusk invoices"); }
});

router.get("/nusk-invoices/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT ni.*, a.name AS "agentName", sa.name AS "subAgentName", g."nuskGroupNumber"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_agents a ON ni."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON ni."subAgentId" = sa.id
       LEFT JOIN umrah_groups g ON ni."groupId" = g.id
       WHERE ni.id = $1 AND ni."companyId" = $2 AND ni."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get nusk invoice"); }
});

const createNuskInvoiceSchema = z.object({
  nuskInvoiceNumber: z.string().min(1, "رقم فاتورة نسك مطلوب"),
  agentId: z.coerce.number({ required_error: "الوكيل مطلوب" }),
  subAgentId: z.coerce.number().optional(),
  groupId: z.coerce.number().optional(),
  mutamerCount: z.coerce.number().int().min(0).default(0),
  groundServices: z.coerce.number().default(0),
  visaFees: z.coerce.number().default(0),
  insuranceFees: z.coerce.number().default(0),
  transportTotal: z.coerce.number().default(0),
  hotelTotal: z.coerce.number().default(0),
  additionalServices: z.coerce.number().default(0),
  netCost: z.coerce.number().default(0),
  totalAmount: z.coerce.number().default(0),
  nuskStatus: z.enum(["pending", "paid", "in_progress", "expired", "refunded", "cancelled"]).default("pending"),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateNuskInvoiceSchema = z.object({
  mutamerCount: z.coerce.number().int().min(0).optional(),
  groundServices: z.coerce.number().optional(),
  visaFees: z.coerce.number().optional(),
  insuranceFees: z.coerce.number().optional(),
  transportTotal: z.coerce.number().optional(),
  hotelTotal: z.coerce.number().optional(),
  additionalServices: z.coerce.number().optional(),
  netCost: z.coerce.number().optional(),
  totalAmount: z.coerce.number().optional(),
  nuskStatus: z.enum(["pending", "paid", "in_progress", "expired", "refunded", "cancelled"]).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/nusk-invoices", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createNuskInvoiceSchema.safeParse(req.body));
    const [dup] = await rawQuery(
      `SELECT id FROM umrah_nusk_invoices WHERE "nuskInvoiceNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.nuskInvoiceNumber, scope.companyId]
    );
    if (dup) throw new ConflictError("رقم فاتورة نسك مكرر");
    const rows = await rawQuery(
      `INSERT INTO umrah_nusk_invoices ("companyId","branchId","nuskInvoiceNumber","agentId","subAgentId","groupId","mutamerCount",
       "groundServices","visaFees","insuranceFees","transportTotal","hotelTotal","additionalServices","netCost","totalAmount","nuskStatus","issueDate","expiryDate","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [scope.companyId, scope.branchId || null, b.nuskInvoiceNumber, b.agentId, b.subAgentId || null, b.groupId || null, b.mutamerCount,
       b.groundServices, b.visaFees, b.insuranceFees, b.transportTotal, b.hotelTotal, b.additionalServices, b.netCost, b.totalAmount, b.nuskStatus,
       b.issueDate || null, b.expiryDate || null, scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_nusk_invoices", entityId: rows[0]?.id, after: { nuskInvoiceNumber: b.nuskInvoiceNumber } }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.created", entity: "umrah_nusk_invoices", entityId: rows[0]?.id }).catch((e) => logger.error(e, "nusk bg"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create nusk invoice"); }
});

router.patch("/nusk-invoices/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateNuskInvoiceSchema.safeParse(req.body));
    const [existing] = await rawQuery<any>(
      `SELECT * FROM umrah_nusk_invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    if (existing.nuskStatus === "paid" && b.nuskStatus !== "refunded") {
      throw new ConflictError("لا يمكن تعديل فاتورة نسك مدفوعة");
    }
    const fields = ["mutamerCount","groundServices","visaFees","insuranceFees","transportTotal","hotelTotal","additionalServices","netCost","totalAmount","nuskStatus","issueDate","expiryDate"] as const;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of fields) {
      if ((b as any)[key] !== undefined) { params.push((b as any)[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    const [row] = await rawQuery(
      `UPDATE umrah_nusk_invoices SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_nusk_invoices", entityId: id, after: b }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.updated", entity: "umrah_nusk_invoices", entityId: id }).catch((e) => logger.error(e, "nusk bg"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update nusk invoice"); }
});

router.delete("/nusk-invoices/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT id, "nuskStatus" FROM umrah_nusk_invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    if (existing.nuskStatus === "paid") throw new ConflictError("لا يمكن حذف فاتورة نسك مدفوعة");
    await rawExecute(
      `UPDATE umrah_nusk_invoices SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3`,
      [scope.userId, id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_nusk_invoices", entityId: id }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.deleted", entity: "umrah_nusk_invoices", entityId: id }).catch((e) => logger.error(e, "nusk bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete nusk invoice"); }
});

// ============================================================================
// EMPLOYEE ASSIGNMENTS (umrah-specific roles / positions)
// ============================================================================

router.get("/employees/:employeeId/assignments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const rows = await rawQuery(
      `SELECT ea.id, ea."jobTitle" AS title, ea.role, ea."branchId", ea.status
       FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active'
       ORDER BY ea.id DESC LIMIT 50`,
      [employeeId, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Employee assignments error"); }
});

// ============================================================================
// COMMISSION PLANS
// ============================================================================

router.get("/commission-plans", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT cp.*,
              s.title AS "seasonTitle",
              (SELECT COUNT(*)::int FROM employee_commission_tiers WHERE "planId" = cp.id) AS "tierCount"
       FROM employee_commission_plans cp
       LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id AND s."deletedAt" IS NULL
       WHERE cp."companyId" = $1 AND cp."deletedAt" IS NULL
       ORDER BY cp."createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List commission plans"); }
});

router.get("/commission-plans/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [plan] = await rawQuery(
      `SELECT cp.*, s.title AS "seasonTitle"
       FROM employee_commission_plans cp
       LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id AND s."deletedAt" IS NULL
       WHERE cp.id = $1 AND cp."companyId" = $2 AND cp."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!plan) { throw new NotFoundError("الخطة غير موجودة"); }
    const tiers = await rawQuery(
      `SELECT * FROM employee_commission_tiers WHERE "planId" = $1 ORDER BY "tierOrder"`,
      [id]
    );
    const calculations = await rawQuery(
      `SELECT * FROM employee_commission_calculations
       WHERE "planId" = $1 AND "deletedAt" IS NULL ORDER BY year DESC, month DESC LIMIT 12`,
      [id]
    );
    res.json({ ...plan, tiers, calculations });
  } catch (err) { handleRouteError(err, res, "Get commission plan"); }
});

router.post("/commission-plans", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createCommissionPlanSchema.safeParse(req.body));
    const b = parsed;

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

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "employee_commission_plans", entityId: result.id, after: { planName: b.planName } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.created", entity: "employee_commission_plans", entityId: result.id, details: JSON.stringify({ planName: b.planName }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Create commission plan"); }
});

router.patch("/commission-plans/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateCommissionPlanSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;

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
        params.push(id); params.push(scope.companyId);
        await client.query(
          `UPDATE employee_commission_plans SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
          params
        );
      }

      if (Array.isArray(b.tiers)) {
        const [owned] = (await client.query(
          `SELECT id FROM employee_commission_plans WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [id, scope.companyId]
        )).rows;
        if (!owned) throw new NotFoundError("خطة العمولة غير موجودة");
        await client.query(`DELETE FROM employee_commission_tiers WHERE "planId" = $1`, [id]);
        for (let i = 0; i < b.tiers.length; i++) {
          const t = b.tiers[i];
          await client.query(
            `INSERT INTO employee_commission_tiers ("planId","fromCount","toCount","bonusPerUnit","isCumulative","tierOrder")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, t.fromCount, t.toCount ?? null, t.bonusPerUnit, t.isCumulative ?? true, i + 1]
          );
        }
      }
    });

    const [row] = await rawQuery(
      `SELECT * FROM employee_commission_plans WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.updated", entity: "employee_commission_plans", entityId: id, details: JSON.stringify({ planName: b.planName }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_commission_plans", entityId: id, after: { planName: b.planName } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update commission plan"); }
});

router.post("/commission-plans/:id/simulate", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const parsed = zodParse(simulateCommissionSchema.safeParse(req.body));
    const { month, year } = parsed;
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await simulateCommission(id, month, year, scope.companyId);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission.simulated", entity: "employee_commission_plans", entityId: id, details: JSON.stringify({ month, year }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "preview", entity: "umrah_commission_plans", entityId: id, after: { month, year } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Simulate commission"); }
});

router.post("/commission-plans/:id/calculate", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(simulateCommissionSchema.safeParse(req.body));
    const { month, year } = parsed;
    const result = await calculateCommissionForPlan(id, month, year, scope.userId, scope.companyId);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission.calculated", entity: "employee_commission_plans", entityId: id, details: JSON.stringify({ month, year }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_commissions", entityId: id, after: { month, year } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Calculate commission"); }
});

router.get("/commission-calculations", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
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
       ORDER BY cc.year DESC, cc.month DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List commission calculations"); }
});

// ============================================================================
// IMPORT — preview + confirm
// ============================================================================

router.get("/import/batches", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND b."seasonId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT b.* FROM umrah_import_batches b WHERE ${where} ORDER BY b."createdAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import batches"); }
});

router.get("/import/batches/:id/changes", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [batch] = await rawQuery(
      `SELECT id FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");
    const rows = await rawQuery(
      `SELECT * FROM umrah_import_changes WHERE "batchId" = $1 ORDER BY id LIMIT 1000`,
      [id]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List batch changes"); }
});

// ============================================================================
// SALES INVOICES
// ============================================================================

router.get("/invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
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
       LEFT JOIN clients c ON c.id = si."clientId" AND c."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY si."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "List umrah invoices"); }
});

router.post("/invoices/generate", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(generateInvoiceSchema.safeParse(req.body));
    const { subAgentId, groupIds, seasonId } = parsed;
    const result = await generateSalesInvoice(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      { subAgentId, groupIds, seasonId }
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { subAgentId, groupIds, seasonId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.generated", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { ref: result.ref, total: result.total, subAgentId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Generate umrah invoice"); }
});

router.patch("/invoices/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateInvoiceSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["status","notes","dueDate"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    await rawExecute(
      `UPDATE umrah_sales_invoices SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
      params
    );
    const [row] = await rawQuery(
      `SELECT * FROM umrah_sales_invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_sales_invoices", entityId: id, after: b }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.updated", entity: "umrah_sales_invoices", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update umrah invoice"); }
});

// ============================================================================
// PAYMENTS
// ============================================================================

router.get("/payments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
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
       ORDER BY p."paymentDate" DESC, p.id DESC
       LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "List umrah payments"); }
});

router.post("/payments", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createPaymentSchema.safeParse(req.body));
    const b = parsed;
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_payments", entityId: result.paymentId, after: { subAgentId: b.subAgentId, sarAmount: b.sarAmount } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.payment.received", entity: "umrah_payments", entityId: result.paymentId, after: { ref: result.ref, sarAmount: b.sarAmount } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Register umrah payment"); }
});

// ============================================================================
// STATEMENTS
// ============================================================================

router.get("/statements/:subAgentId", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { type, from, to } = req.query as any;
    const stmtType = type === "summary" ? "summary" : "detailed";
    const result = await generateStatement(
      { companyId: scope.companyId, userId: scope.userId },
      parseId(req.params.subAgentId, "subAgentId"),
      stmtType,
      from, to
    );
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Generate statement"); }
});

// ============================================================================
// DASHBOARD
// ============================================================================

export default router;
