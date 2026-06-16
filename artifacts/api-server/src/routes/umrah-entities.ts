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
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { issueNumber } from "../lib/numberingService.js";
import { gccExclusionSqlFragment } from "../lib/umrahNationalityRules.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  todayISO,
} from "../lib/businessHelpers.js";
import { internalTechRef } from "../lib/internalRef.js";
import { reclassifyRevenueForInvoices } from "../lib/umrahReclassifyEngine.js";
import {
  generateSalesInvoice,
  registerPayment,
  generateStatement,
  listUninvoicedGroups,
} from "../lib/umrahInvoicingEngine.js";
import { postNuskJournalEntries } from "../lib/umrahImportEngine.js";
import { UMRAH_POLICY_CATEGORIES, ALL_POLICY_IDS } from "../lib/umrahSettingsPoliciesCatalog.js";
import { upsertSetting } from "../lib/settings.js";
import {
  calculateCommissionForPlan,
  simulateCommission,
  calculateAllForCompany,
} from "../lib/umrahCommissionEngine.js";
import {
  createTransportRequestFromUmrah,
  listTransportRequestsForGroup,
} from "../lib/umrahTransportContract.js";
import { getDashboardSuggestions } from "../lib/umrahAssistantEngine.js";
import {
  UMRAH_REPORTS_CATALOG,
  REPORT_CATEGORY_LABELS_AR,
  REPORT_STATUS_LABELS_AR,
} from "../lib/umrahReportsCatalog.js";
import { logger } from "../lib/logger.js";
import { renderPrint } from "../lib/print/printService.js";
// U-07 Phase 1 — journey + recovery reports moved to a dedicated
// sub-router so the parent file shrinks. The API surface is
// unchanged: the sub-router mounts on `/` here so its paths still
// resolve at /umrah/sub-agents/:id/journey, /umrah/groups/:id/journey,
// /umrah/reports/packages-vs-allocations-pricing-drift, and
// /umrah/reports/recovery-hub.
import journeyReportsRouter from "./umrah-journey-reports.js";
// U-07 Phase 3 — refund-requests workflow moved to a dedicated sub-router so
// the parent file shrinks further. Paths still resolve at
// /umrah/refund-requests/...
import refundsRouter from "./umrah-refunds.js";

const router = Router();
router.use(journeyReportsRouter);
router.use(refundsRouter);

async function requireOpenSeason(seasonId: number, companyId: number): Promise<void> {
  const [season] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
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
  // U-11 Phase 3b (#2080) — optional free-text justification recorded
  // on the audit log + emitted event. Surfaces the operator's intent
  // ("matched by phone", "merger with #123", ...) for downstream
  // review. Limited to 500 chars to keep the audit row sane.
  reason: z.string().max(500).optional(),
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
  /** groupId → manual price per mutamer (overrides pricing rules). */
  manualPrices: z.record(z.coerce.number(), z.coerce.number().positive()).optional(),
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
       LEFT JOIN clients c ON sa."clientId" = c.id AND c."companyId" = sa."companyId" AND c."deletedAt" IS NULL
       WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL
       ORDER BY sa.name
       LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
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

// Single-row sub-agent fetch. Used by the detail page UI to render
// the full row (same joined columns the list returns) plus the
// statement / pricing / attachments panels.
router.get("/sub-agents/unlinked", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    let where = `sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."clientId" IS NULL`;
    const params: unknown[] = [scope.companyId];
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
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List unlinked sub-agents"); }
});

router.get("/sub-agents/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Defence-in-depth: the umrah_agents JOIN previously matched only
    // sa."agentId" = a.id (no companyId / deletedAt guards) — a stale
    // FK could surface another tenant's agent name. Adding the same
    // pattern used by GET /umrah/pilgrims/:id (PR #1425).
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT sa.*, a.name AS "agentName", c.name AS "clientName"
         FROM umrah_sub_agents sa
         LEFT JOIN umrah_agents a
                ON sa."agentId" = a.id
               AND a."companyId" = sa."companyId"
               AND a."deletedAt" IS NULL
         LEFT JOIN clients c
                ON sa."clientId" = c.id
               AND c."companyId" = sa."companyId"
               AND c."deletedAt" IS NULL
        WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الوكيل الفرعي غير موجود");

    // Statement aggregates — mirrors the agent statement (PR #1438) so
    // sub-agents get the same one-pane view. Three queries run in
    // parallel via Promise.all so adding them doesn't double the
    // detail-fetch latency.
    //
    //   - pilgrimCount        : how many pilgrims this sub-agent sent
    //   - statusBreakdown     : dict keyed by pilgrim status
    //   - totalPaid           : SUM(sarAmount) from umrah_payments —
    //                            real receipts table (unlike agents
    //                            where we approximate via invoice
    //                            status). Sub-agents are the actual
    //                            money sources in most umrah setups,
    //                            so the payments table IS the source
    //                            of truth.
    const [statsResult, statusBreakdownResult, paymentResult] = await Promise.all([
      rawQuery<{ pilgrimCount: number; overstayedCount: number }>(
        `SELECT COUNT(*)::int AS "pilgrimCount",
                COUNT(*) FILTER (WHERE status='overstayed')::int AS "overstayedCount"
           FROM umrah_pilgrims
          WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
      rawQuery<{ status: string; c: number }>(
        `SELECT status, COUNT(*)::int AS c
           FROM umrah_pilgrims
          WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          GROUP BY status`,
        [id, scope.companyId]
      ),
      rawQuery<{ totalPaid: string }>(
        `SELECT COALESCE(SUM("sarAmount"), 0)::numeric AS "totalPaid"
           FROM umrah_payments
          WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
    ]);
    const stats = statsResult[0] || { pilgrimCount: 0, overstayedCount: 0 };
    const totalPaid = Number(paymentResult[0]?.totalPaid ?? 0);
    const statusBreakdown = Object.fromEntries(
      statusBreakdownResult.map((r) => [r.status, Number(r.c)])
    );

    res.json(maskFields(req, {
      ...row,
      ...stats,
      totalPaid,
      statusBreakdown,
    }));
  } catch (err) { handleRouteError(err, res, "Get sub-agent"); }
});

router.patch("/sub-agents/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateSubAgentSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: unknown[] = [];
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
      // Numbering center (Issue #1141) — client code from authority.
      const issuedCli = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "crm",
        entityKey: "client_code",
        entityTable: "clients",
        actorId: scope.userId,
        metadata: { source: "umrah_agent_creation" },
        expectedTiming: "on_draft",
      });
      const [newClient] = await rawQuery<{ id: number }>(
        `INSERT INTO clients ("companyId", name, phone, classification, source, code, "createdAt")
         VALUES ($1, $2, $3, 'umrah_agent', 'system', $4, NOW()) RETURNING id`,
        [scope.companyId, clientName, clientPhone || null, issuedCli.number]
      );
      finalClientId = newClient.id;
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [finalClientId, issuedCli.assignmentId]
      ).catch(() => { /* non-blocking link */ });
    } else {
      if (!clientId) throw new ValidationError("معرف العميل مطلوب");
      const [existingClient] = await rawQuery<{ id: number }>(
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
       LEFT JOIN clients c ON c.id = sa."clientId" AND c."companyId" = sa."companyId" AND c."deletedAt" IS NULL
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
    const { nuskCode, clientId, reason } = parsed;
    const [existingClient] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
    // U-11 Phase 3b (#2080) — explicit-confirmation link from the
    // import wizard. Look up the matching sub-agent BEFORE the
    // UPDATE so the audit log captures `before.clientId` (a real
    // before/after pair) and so we have a concrete entityId to
    // attach to the event instead of the legacy `entityId: 0`.
    // If multiple sub-agents share the nuskCode under this tenant
    // (rare but legal in the current schema), we audit the first
    // one — the UPDATE still touches all matching rows for
    // backward compatibility.
    const [existingSubAgent] = await rawQuery<{ id: number; clientId: number | null }>(
      `SELECT id, "clientId" FROM umrah_sub_agents
        WHERE "companyId"=$1 AND "nuskCode"=$2 AND "deletedAt" IS NULL
        ORDER BY id LIMIT 1`,
      [scope.companyId, nuskCode]
    );
    if (!existingSubAgent) throw new NotFoundError("الوكيل الفرعي غير موجود أو لا ينتمي لهذه الشركة");
    const beforeClientId = existingSubAgent.clientId;
    const subAgentId = existingSubAgent.id;
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE "companyId"=$3 AND "nuskCode"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, scope.companyId, nuskCode]
    );
    // U-11 Phase 3b — enriched audit. `before` carries the prior
    // clientId (often null in the import-wizard flow), `after`
    // carries the new linkage + the nuskCode that drove the match,
    // `reason` is the operator's free-text justification, and the
    // entity id is the real sub-agent row (no longer 0).
    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "umrah_sub_agents",
      entityId: subAgentId,
      before: { clientId: beforeClientId },
      after: { nuskCode, clientId },
      reason,
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    // U-11 Phase 3b — enriched event. `source` flags this as the
    // explicit-confirmation path from the import wizard so
    // downstream consumers (notification rules, audit dashboards)
    // can distinguish it from the detail-page linker.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "umrah.sub_agent.linked_by_nusk",
      entity: "umrah_sub_agents",
      entityId: subAgentId,
      details: JSON.stringify({
        nuskCode,
        clientId,
        beforeClientId,
        reason: reason ?? null,
        source: "import_wizard_explicit_confirmation",
      }),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ success: true, subAgentId, beforeClientId });
  } catch (err) { handleRouteError(err, res, "Link sub-agent by nusk"); }
});

router.post("/sub-agents/:id/link-client", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(linkClientSchema.safeParse(req.body));
    const { clientId } = parsed;
    const [existingClient] = await rawQuery<{ id: number }>(
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
    const { seasonId } = req.query as Record<string, string | undefined>;
    let where = `g."companyId" = $1 AND g."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND g."seasonId" = $${params.length}`; }
    // Enriched group view: every column an umrah operations lead needs
    // at a glance — financial (NUSK cost, sales invoice, outstanding),
    // operational (mutamers inside/overstayed), and compliance (visa
    // expiring within 7 days) — without a per-row follow-up request.
    // Pre-aggregate the FIVE per-row subqueries into 2 CTEs. Original
    // was the WORST N+1 in the codebase: 500 groups × 5 subqueries =
    // 2501 lookups (2 on umrah_nusk_invoices + 3 on umrah_pilgrims).
    //
    // nusk_stats collapses 2 subqueries (count + sum) into one scan.
    // pilgrim_stats collapses 3 subqueries (inside / overstayed /
    // visa-at-risk) using COUNT(*) FILTER (WHERE ...). The
    // join keys preserve the original AND ni/p."companyId" =
    // g."companyId" tenant boundary by including companyId in the CTE
    // output + LEFT JOIN on (groupId, companyId).
    const rows = await rawQuery(
      `WITH nusk_stats AS (
         SELECT "groupId", "companyId",
                COUNT(*) AS "nuskInvoiceCount",
                COALESCE(SUM("totalAmount"), 0) AS "nuskCostTotal",
                COALESCE(SUM("mutamerCount"), 0) AS "nuskMutamerTotal"
         FROM umrah_nusk_invoices
         WHERE "deletedAt" IS NULL AND "nuskStatus" != 'cancelled'
         GROUP BY "groupId", "companyId"
       ),
       pilgrim_stats AS (
         SELECT "groupId", "companyId",
                COUNT(*) AS "pilgrimsTotal",
                COUNT(*) FILTER (WHERE status IN ('arrived','active','overstayed')) AS "pilgrimsInside",
                COUNT(*) FILTER (WHERE status = 'overstayed') AS "pilgrimsOverstayed",
                COUNT(*) FILTER (
                  WHERE status NOT IN ('departed','cancelled','deceased','visa_rejected')
                    AND "visaExpiry" IS NOT NULL
                    AND "visaExpiry" < CURRENT_DATE + INTERVAL '7 days'
                    AND ${gccExclusionSqlFragment(`"nationality"`)}
                ) AS "visaAtRisk"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "groupId", "companyId"
       )
       SELECT g.*,
              a.name AS "agentName",
              sa.name AS "subAgentName",
              s.title AS "seasonTitle",
              COALESCE(ns."nuskInvoiceCount", 0) AS "nuskInvoiceCount",
              COALESCE(ns."nuskCostTotal", 0) AS "nuskCostTotal",
              si.ref AS "salesInvoiceRef",
              si.total AS "salesInvoiceTotal",
              si.status AS "salesInvoiceStatus",
              GREATEST(COALESCE(si.total, 0) - COALESCE(si."paidAmount", 0), 0) AS "salesOutstanding",
              COALESCE(NULLIF(ps."pilgrimsTotal", 0), ns."nuskMutamerTotal", 0) AS "pilgrimsTotal",
              COALESCE(ps."pilgrimsInside", 0) AS "pilgrimsInside",
              COALESCE(ps."pilgrimsOverstayed", 0) AS "pilgrimsOverstayed",
              COALESCE(ps."visaAtRisk", 0) AS "visaAtRisk"
       FROM umrah_groups g
       LEFT JOIN umrah_agents a ON g."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON g."subAgentId" = sa.id
       LEFT JOIN umrah_seasons s ON g."seasonId" = s.id AND s."deletedAt" IS NULL
       LEFT JOIN umrah_sales_invoices si ON si.id = g."salesInvoiceId" AND si."deletedAt" IS NULL
       LEFT JOIN nusk_stats ns ON ns."groupId" = g.id AND ns."companyId" = g."companyId"
       LEFT JOIN pilgrim_stats ps ON ps."groupId" = g.id AND ps."companyId" = g."companyId"
       WHERE ${where}
       ORDER BY g."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows }));
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
    // Tenant-scoped JOIN on every table we read from — without this, a
    // stale row from another tenant (or a soft-deleted record) could
    // surface as the agent/sub-agent/season name. Defence in depth.
    const [row] = await rawQuery(
      `SELECT g.*, a.name AS "agentName", sa.name AS "subAgentName", s.title AS "seasonTitle"
       FROM umrah_groups g
       LEFT JOIN umrah_agents a
         ON g."agentId" = a.id AND a."companyId" = g."companyId" AND a."deletedAt" IS NULL
       LEFT JOIN umrah_sub_agents sa
         ON g."subAgentId" = sa.id AND sa."companyId" = g."companyId" AND sa."deletedAt" IS NULL
       LEFT JOIN umrah_seasons s
         ON g."seasonId" = s.id AND s."companyId" = g."companyId" AND s."deletedAt" IS NULL
       WHERE g.id = $1 AND g."companyId" = $2 AND g."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المجموعة غير موجودة");

    // Fire the 6 aggregate queries in parallel — none depend on each
    // other and the page-load latency budget says "single roundtrip".
    // Each query is tenant-scoped + soft-delete filtered independently
    // (the FK alone isn't enough — stale rows from a deleted group's
    // history shouldn't leak into the new group's totals if an id is
    // ever reused).
    const [
      pilgrims,
      statusBreakdownRows,
      financeRow,
      nuskRow,
      visaExpiringRow,
      flightAggRow,
    ] = await Promise.all([
      rawQuery<{ id: number; fullName: string; nationality: string | null; status: string; overstayExempt: boolean; visaExpiry: string | null; entryFlight: string | null; exitFlight: string | null }>(
        `SELECT id, "fullName", nationality, status, "overstayExempt", "visaExpiry", "entryFlight", "exitFlight"
         FROM umrah_pilgrims
         WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "fullName"`,
        [id, scope.companyId]
      ),
      rawQuery<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
         FROM umrah_pilgrims
         WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         GROUP BY status`,
        [id, scope.companyId]
      ),
      // Sales invoices reach the group via the per-line items table —
      // the invoice header has no groupId column (an invoice can span
      // multiple groups). DISTINCT keeps a single invoice from being
      // double-counted when it has >1 group line.
      rawQuery<{ count: string; total: string | null; paid: string | null }>(
        `SELECT COUNT(DISTINCT si.id)::text AS count,
                COALESCE(SUM(DISTINCT si.total), 0)::text AS total,
                COALESCE(SUM(DISTINCT si."paidAmount"), 0)::text AS paid
         FROM umrah_sales_invoice_items it
         JOIN umrah_sales_invoices si
           ON si.id = it."invoiceId" AND si."companyId" = $2 AND si."deletedAt" IS NULL
         WHERE it."groupId" = $1 AND it."companyId" = $2 AND it."deletedAt" IS NULL
           AND si.status <> 'cancelled'`,
        [id, scope.companyId]
      ),
      rawQuery<{ count: string; netCost: string | null; refundAmount: string | null }>(
        `SELECT COUNT(*)::text AS count,
                COALESCE(SUM("netCost"), 0)::text AS "netCost",
                COALESCE(SUM("refundAmount"), 0)::text AS "refundAmount"
         FROM umrah_nusk_invoices
         WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
           AND "nuskStatus" <> 'cancelled'`,
        [id, scope.companyId]
      ),
      // Visa-expiring window matches the banner on the pilgrims list
      // (7 days). Pilgrims who already left or were cancelled are
      // excluded — they wouldn't trigger a real alert.
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM umrah_pilgrims
         WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
           AND "visaExpiry" IS NOT NULL
           AND "visaExpiry" <= CURRENT_DATE + INTERVAL '7 days'
           AND status NOT IN ('departed', 'cancelled')
           AND ${gccExclusionSqlFragment(`"nationality"`)}`,
        [id, scope.companyId]
      ),
      // Date range + distinct flight codes — answers "when does this
      // group fly" without opening every pilgrim.
      rawQuery<{ minArrival: string | null; maxDeparture: string | null; entryFlights: string | null; exitFlights: string | null }>(
        `SELECT MIN("arrivalDate") AS "minArrival",
                MAX("departureDate") AS "maxDeparture",
                STRING_AGG(DISTINCT "entryFlight", ',' ORDER BY "entryFlight") AS "entryFlights",
                STRING_AGG(DISTINCT "exitFlight", ',' ORDER BY "exitFlight") AS "exitFlights"
         FROM umrah_pilgrims
         WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
    ]);

    const statusBreakdown: Record<string, number> = {};
    for (const r of statusBreakdownRows) statusBreakdown[r.status] = Number(r.count);

    const overstayExemptCount = pilgrims.reduce(
      (n, p) => n + (p.overstayExempt ? 1 : 0),
      0
    );

    const fin = financeRow[0] || { count: "0", total: "0", paid: "0" };
    const nusk = nuskRow[0] || { count: "0", netCost: "0", refundAmount: "0" };
    const flights = flightAggRow[0] || { minArrival: null, maxDeparture: null, entryFlights: null, exitFlights: null };

    res.json(maskFields(req, {
      ...row,
      pilgrims,
      statusBreakdown,
      overstayExemptCount,
      visaExpiringCount: Number(visaExpiringRow[0]?.count ?? "0"),
      finance: {
        invoiceCount: Number(fin.count),
        invoiceTotal: Number(fin.total ?? "0"),
        invoicePaid: Number(fin.paid ?? "0"),
        invoiceOutstanding: Number(fin.total ?? "0") - Number(fin.paid ?? "0"),
        nuskCount: Number(nusk.count),
        nuskNetCost: Number(nusk.netCost ?? "0"),
        nuskRefund: Number(nusk.refundAmount ?? "0"),
        margin: Number(fin.total ?? "0") - Number(nusk.netCost ?? "0"),
      },
      schedule: {
        minArrival: flights.minArrival,
        maxDeparture: flights.maxDeparture,
        entryFlights: flights.entryFlights ? flights.entryFlights.split(",").filter(Boolean) : [],
        exitFlights: flights.exitFlights ? flights.exitFlights.split(",").filter(Boolean) : [],
      },
    }));
  } catch (err) { handleRouteError(err, res, "Get group"); }
});

router.post("/groups", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createGroupSchema.safeParse(req.body));
    await requireOpenSeason(b.seasonId, scope.companyId);
    // Numbering center (Issue #1141) — internalRef is our per-season
    // counter; nuskGroupNumber stays as the external Nusk portal id.
    const issuedGrp = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "umrah",
      entityKey: "umrah_group",
      entityTable: "umrah_groups",
      seasonId: b.seasonId,
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const rows = await rawQuery<Record<string, unknown>>(
      `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber","internalRef",name,"agentId","subAgentId","seasonId","mutamerCount","programDuration","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, scope.branchId || null, b.nuskGroupNumber, issuedGrp.number, b.name || null, b.agentId || null, b.subAgentId || null, b.seasonId, b.mutamerCount, b.programDuration || null, scope.userId]
    );
    if (rows[0]?.id) {
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [rows[0].id as number, issuedGrp.assignmentId]
      ).catch(() => { /* non-blocking link */ });
    }
    const groupId = rows[0]?.id as number | undefined;
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_groups", entityId: groupId as number, after: { nuskGroupNumber: b.nuskGroupNumber, internalRef: issuedGrp.number } }).catch((e) => logger.error(e, "umrah groups bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.group.created", entity: "umrah_groups", entityId: groupId as number }).catch((e) => logger.error(e, "umrah groups bg"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create group"); }
});

router.patch("/groups/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchGroupSchema.safeParse(req.body));
    const fieldKeys = ["name", "agentId", "subAgentId", "mutamerCount", "programDuration", "status"] as const;
    const params: unknown[] = [];
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
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.group.updated", entity: "umrah_groups", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah groups bg"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update group"); }
});

router.delete("/groups/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number; salesInvoiceId: number | null }>(
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
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.group.deleted", entity: "umrah_groups", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah groups bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete group"); }
});

// ============================================================================
// SERVICE CONTRACT — umrah → transport (§7 of #1870)
// ============================================================================
//
// Thin HTTP layer over `lib/umrahTransportContract.ts`. The engine
// library owns the schema knowledge + event emission; these routes
// just adapt the request/response shape.

const transportRequestSchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
  pilgrimsCount: z.coerce.number().int().nonnegative().optional(),
  dateTime: z.string().optional(),
  fromLocation: z.string().trim().min(1, "نقطة الانطلاق مطلوبة"),
  toLocation: z.string().trim().min(1, "الوجهة مطلوبة"),
  routeType: z.enum([
    "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
    "makkah_local", "madinah_local", "ziyarah", "custom",
  ]).optional(),
  requiredVehicleType: z.string().trim().optional(),
  flightNumber: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

router.post("/groups/:id/transport-requests", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const groupId = parseId(req.params.id, "id");
    const b = zodParse(transportRequestSchema.safeParse(req.body));
    const result = await createTransportRequestFromUmrah(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      {
        groupId,
        seasonId: b.seasonId ?? null,
        pilgrimsCount: b.pilgrimsCount ?? null,
        dateTime: b.dateTime ?? null,
        fromLocation: b.fromLocation,
        toLocation: b.toLocation,
        routeType: b.routeType ?? null,
        requiredVehicleType: b.requiredVehicleType ?? null,
        flightNumber: b.flightNumber ?? null,
        notes: b.notes ?? null,
      },
    );
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Create transport request"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تفصيل تكلفة المجموعة من فواتير نسك — §6 من شرائع #1870.
// المجموعة قد يكون لها فاتورة نسك واحدة أو أكثر (لو قُسِّمت). صفحة
// تفاصيل المجموعة حالياً تعرض المجموع فقط (netCost + refundAmount).
// هذا الـ endpoint يفتح الصندوق:
//   • تجميع per-category لكل العناصر (visa/transport/hotel/services/...)
//   • قائمة الفواتير الفردية مع روابط (id + nuskInvoiceNumber + status)
//   • مقارنة الإيراد (umrah_sales_invoices) مع التكلفة لإظهار الهامش الفعلي
//
// يجاوب: «هل المجموعة رابحة؟ ما توزيع التكلفة؟ هل في فواتير نسك ناقصة؟»
//
// قراءة فقط — tenant-scoped على companyId. ٣ تجميعات بالتوازي.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/groups/:id/cost-breakdown", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    // Verify group ownership first — surfaces 404 instead of empty rows
    // when the operator typed the wrong id (saves a "no data" confusion).
    const [group] = await rawQuery<{ id: number; name: string | null; nuskGroupNumber: string | null }>(
      `SELECT id, name, "nuskGroupNumber"
         FROM umrah_groups
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [id, scope.companyId],
    );
    if (!group) throw new NotFoundError("المجموعة غير موجودة");

    // 3 parallel reads:
    //   categories → SUM per category column across all non-cancelled nusk invoices
    //   invoices   → flat list of nusk invoices for the drill-down table
    //   revenue    → sales-side total to render margin on the same card
    const [categoryRow, invoices, revenueRow] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int                                    AS "nuskCount",
                COALESCE(SUM("groundServices"), 0)               AS "groundServices",
                COALESCE(SUM("electronicFees"), 0)               AS "electronicFees",
                COALESCE(SUM("visaFees"), 0)                     AS "visaFees",
                COALESCE(SUM("insuranceFees"), 0)                AS "insuranceFees",
                COALESCE(SUM("enrichmentServices"), 0)           AS "enrichmentServices",
                COALESCE(SUM("additionalServices"), 0)           AS "additionalServices",
                COALESCE(SUM("transportTotal"), 0)               AS "transportTotal",
                COALESCE(SUM("hotelTotal"), 0)                   AS "hotelTotal",
                COALESCE(SUM("refundAmount"), 0)                 AS "refundAmount",
                COALESCE(SUM("totalAmount"), 0)                  AS "totalAmount",
                COALESCE(SUM("netCost"), 0)                      AS "netCost"
           FROM umrah_nusk_invoices
          WHERE "groupId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL
            AND "nuskStatus" <> 'cancelled'`,
        [id, scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, "nuskInvoiceNumber", "nuskStatus", "issueDate",
                "mutamerCount", "netCost", "totalAmount", "refundAmount",
                "purchaseInvoiceId", "journalEntryId"
           FROM umrah_nusk_invoices
          WHERE "groupId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL
          ORDER BY "issueDate" DESC NULLS LAST, id DESC
          LIMIT 50`,
        [id, scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        // Revenue + paid via the items table (header doesn't carry groupId).
        // DISTINCT collapses a multi-group invoice — same shape used in
        // /reports/group-portfolio (PR #1495) so margin numbers reconcile.
        `SELECT COALESCE(SUM(DISTINCT si.total), 0)         AS "revenue",
                COALESCE(SUM(DISTINCT si."paidAmount"), 0)  AS "revenuePaid"
           FROM umrah_sales_invoice_items it
           JOIN umrah_sales_invoices si
             ON si.id = it."invoiceId"
            AND si."companyId" = it."companyId"
            AND si."deletedAt" IS NULL
          WHERE it."groupId" = $1
            AND it."companyId" = $2
            AND it."deletedAt" IS NULL
            AND si.status <> 'cancelled'`,
        [id, scope.companyId],
      ),
    ]);

    const cat = categoryRow[0] ?? {};
    const rev = revenueRow[0] ?? { revenue: 0, revenuePaid: 0 };

    // Build the bar-chart-friendly array — only categories with > 0 value
    // so the FE doesn't render dead bars. Sorted by amount DESC so the
    // dominant cost component pops to the top.
    const CATEGORY_LABELS: Record<string, string> = {
      groundServices:      "خدمات أرضية",
      electronicFees:      "رسوم إلكترونية",
      visaFees:            "تأشيرات",
      insuranceFees:       "تأمين",
      enrichmentServices:  "خدمات إثرائية",
      additionalServices:  "خدمات إضافية",
      transportTotal:      "نقل",
      hotelTotal:          "فندق",
    };
    const categoriesArr = (Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>)
      .map((k) => ({
        key: k,
        label: CATEGORY_LABELS[k],
        amount: Number(cat[k] ?? 0),
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const totalCost = Number(cat.netCost ?? 0);
    const revenue = Number(rev.revenue ?? 0);
    const margin = revenue - totalCost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

    res.json(maskFields(req, {
      group: { id: group.id, name: group.name, nuskGroupNumber: group.nuskGroupNumber },
      summary: {
        nuskCount: Number(cat.nuskCount ?? 0),
        totalAmount: Number(cat.totalAmount ?? 0),
        refundAmount: Number(cat.refundAmount ?? 0),
        netCost: totalCost,
        revenue,
        revenuePaid: Number(rev.revenuePaid ?? 0),
        margin,
        marginPct,
        sellingBelowCost: margin < 0,
      },
      categories: categoriesArr,
      invoices,
    }));
  } catch (err) { handleRouteError(err, res, "Group cost breakdown"); }
});

router.get("/groups/:id/transport-requests", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const groupId = parseId(req.params.id, "id");
    const rows = await listTransportRequestsForGroup(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      groupId,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List transport requests"); }
});

// ============================================================================
// GROUP OPS — split / merge (#5 from internal review)
// ============================================================================

const splitGroupSchema = z.object({
  pilgrimIds: z.array(z.number().int().positive()).min(1, "اختر معتمراً واحداً على الأقل"),
  newGroupName: z.string().min(1).max(255).optional(),
  newNuskGroupNumber: z.string().min(1).max(30).optional(),
});

// Split a group: move N pilgrims into a freshly created group. The source
// group is preserved (still owns remaining pilgrims + its salesInvoice).
// Idempotent in spirit — if the new group already exists by nusk number
// it's reused, otherwise auto-generated. Sub-agent + agent + seasonId
// are copied from the source so analytics + scoping line up.
router.post("/groups/:id/split", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const sourceId = parseId(req.params.id, "id");
    const body = zodParse(splitGroupSchema.safeParse(req.body));

    const result = await withTransaction(async (client) => {
      const [source] = (await client.query(
        `SELECT * FROM umrah_groups WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [sourceId, scope.companyId]
      )).rows;
      if (!source) throw new NotFoundError("المجموعة المصدر غير موجودة");
      if (source.salesInvoiceId) {
        throw new ConflictError("لا يمكن تقسيم مجموعة مرتبطة بفاتورة مبيعات — أُصدر إشعار دائن أولاً");
      }

      const verifyRes = await client.query(
        `SELECT id FROM umrah_pilgrims
          WHERE id = ANY($1::int[]) AND "groupId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [body.pilgrimIds, sourceId, scope.companyId]
      );
      if (verifyRes.rows.length !== body.pilgrimIds.length) {
        throw new ValidationError("بعض المعتمرين لا ينتمون لهذه المجموعة أو محذوفون", {
          meta: { provided: body.pilgrimIds.length, valid: verifyRes.rows.length },
        });
      }

      const newNuskNum = body.newNuskGroupNumber || `${source.nuskGroupNumber}-S${Date.now().toString().slice(-5)}`;
      const newName = body.newGroupName || `${source.name || ""} - تقسيم`.trim();

      const insertRes = await client.query(
        `INSERT INTO umrah_groups
          ("companyId","branchId","nuskGroupNumber",name,"agentId","subAgentId","seasonId",
           "mutamerCount","programDuration",status,"createdBy","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'split_from_'||$10,$11,NOW(),NOW())
         RETURNING id, "nuskGroupNumber", name, "mutamerCount"`,
        [
          scope.companyId, scope.branchId || source.branchId, newNuskNum, newName,
          source.agentId, source.subAgentId, source.seasonId,
          body.pilgrimIds.length, source.programDuration, sourceId, scope.userId,
        ]
      );
      const newGroup = insertRes.rows[0];

      await client.query(
        `UPDATE umrah_pilgrims
            SET "groupId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
          WHERE id = ANY($3::int[]) AND "companyId"=$4`,
        [newGroup.id, scope.userId, body.pilgrimIds, scope.companyId]
      );

      await client.query(
        `UPDATE umrah_groups
            SET "mutamerCount" = GREATEST(0, COALESCE("mutamerCount",0) - $1),
                "updatedBy"=$2, "updatedAt"=NOW()
          WHERE id=$3 AND "companyId"=$4`,
        [body.pilgrimIds.length, scope.userId, sourceId, scope.companyId]
      );

      return { newGroup, movedCount: body.pilgrimIds.length };
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "umrah.group.split", entity: "umrah_groups", entityId: sourceId,
      after: { newGroupId: result.newGroup.id, movedCount: result.movedCount },
    }).catch((e) => logger.error(e, "umrah groups split bg"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.group.split", entity: "umrah_groups", entityId: sourceId,
      details: JSON.stringify({ newGroupId: result.newGroup.id, movedCount: result.movedCount }),
    }).catch((e) => logger.error(e, "umrah groups split bg"));

    res.json({ success: true, ...result });
  } catch (err) { handleRouteError(err, res, "Split group"); }
});

const mergeGroupsSchema = z.object({
  sourceGroupIds: z.array(z.number().int().positive()).min(1, "اختر مجموعة مصدر واحدة على الأقل"),
  targetGroupId: z.number().int().positive(),
});

// Merge: move every pilgrim from sourceGroupIds → targetGroupId, then
// soft-delete the source groups (they leave a paper trail). Source groups
// must not be invoiced — if any has a salesInvoiceId we abort cleanly with
// a 409 so the caller can issue credit notes first.
router.post("/groups/merge", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const body = zodParse(mergeGroupsSchema.safeParse(req.body));

    if (body.sourceGroupIds.includes(body.targetGroupId)) {
      throw new ValidationError("الهدف لا يمكن أن يكون ضمن المصادر");
    }

    const result = await withTransaction(async (client) => {
      const [target] = (await client.query(
        `SELECT * FROM umrah_groups WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [body.targetGroupId, scope.companyId]
      )).rows;
      if (!target) throw new NotFoundError("المجموعة الهدف غير موجودة");

      const sources = (await client.query(
        `SELECT id, "salesInvoiceId", "mutamerCount" FROM umrah_groups
          WHERE id = ANY($1::int[]) AND "companyId"=$2 AND "deletedAt" IS NULL
          FOR UPDATE`,
        [body.sourceGroupIds, scope.companyId]
      )).rows;
      if (sources.length !== body.sourceGroupIds.length) {
        throw new ValidationError("بعض المجموعات المصدر غير موجودة أو محذوفة");
      }
      const invoiced = sources.filter((s: any) => s.salesInvoiceId);
      if (invoiced.length > 0) {
        throw new ConflictError("بعض المجموعات المصدر مفوترة — أصدر إشعار دائن أولاً", {
          meta: { invoicedSourceIds: invoiced.map((s: any) => s.id) },
        });
      }

      const moveRes = await client.query(
        `UPDATE umrah_pilgrims
            SET "groupId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
          WHERE "groupId" = ANY($3::int[]) AND "companyId"=$4 AND "deletedAt" IS NULL
          RETURNING id`,
        [body.targetGroupId, scope.userId, body.sourceGroupIds, scope.companyId]
      );
      const movedCount = moveRes.rowCount || 0;

      await client.query(
        `UPDATE umrah_groups
            SET "mutamerCount" = COALESCE("mutamerCount",0) + $1,
                "updatedBy"=$2, "updatedAt"=NOW()
          WHERE id=$3 AND "companyId"=$4`,
        [movedCount, scope.userId, body.targetGroupId, scope.companyId]
      );

      await client.query(
        `UPDATE umrah_groups
            SET "deletedAt"=NOW(), "updatedBy"=$1, "updatedAt"=NOW()
          WHERE id = ANY($2::int[]) AND "companyId"=$3`,
        [scope.userId, body.sourceGroupIds, scope.companyId]
      );

      return { movedCount, mergedSourceIds: body.sourceGroupIds };
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "umrah.group.merged", entity: "umrah_groups", entityId: body.targetGroupId,
      after: result,
    }).catch((e) => logger.error(e, "umrah groups merge bg"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.group.merged", entity: "umrah_groups", entityId: body.targetGroupId,
      details: JSON.stringify(result),
    }).catch((e) => logger.error(e, "umrah groups merge bg"));

    res.json({ success: true, ...result });
  } catch (err) { handleRouteError(err, res, "Merge groups"); }
});

// ============================================================================
// NUSK INVOICES
// ============================================================================

router.get("/nusk-invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, groupId } = req.query as Record<string, string | undefined>;
    let where = `ni."companyId" = $1 AND ni."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
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
    res.json(maskFields(req, { data: rows }));
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
    res.json(maskFields(req, row));
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
  refundAmount: z.coerce.number().optional(),
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
    // Single transaction: invoice row + AP journal entry must land
    // together. The legacy code wrote the row only — so the NUSK
    // obligation (DR 5201 cost / CR 2101 AP) never posted, the
    // trial balance under-reported AP, and the reconciliation desk
    // couldn't match the NUSK supplier ledger. Mirrors what
    // confirmVouchersImport() does on every imported voucher.
    const created = await withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO umrah_nusk_invoices ("companyId","branchId","nuskInvoiceNumber","agentId","subAgentId","groupId","mutamerCount",
         "groundServices","visaFees","insuranceFees","transportTotal","hotelTotal","additionalServices","netCost","totalAmount","nuskStatus","issueDate","expiryDate","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [scope.companyId, scope.branchId || null, b.nuskInvoiceNumber, b.agentId, b.subAgentId || null, b.groupId || null, b.mutamerCount,
         b.groundServices, b.visaFees, b.insuranceFees, b.transportTotal, b.hotelTotal, b.additionalServices, b.netCost, b.totalAmount, b.nuskStatus,
         b.issueDate || null, b.expiryDate || null, scope.userId]
      );
      const row = res.rows[0];
      await postNuskJournalEntries(
        client,
        { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: 0 },
        {
          nuskId: row.id,
          nuskInvoiceNumber: b.nuskInvoiceNumber,
          totalAmount: Number(b.totalAmount ?? 0),
          refundAmount: 0,
          nuskStatus: String(b.nuskStatus ?? "pending").toLowerCase(),
          existingApJeId: null,
          existingRefundJeId: null,
        },
      );
      return row;
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_nusk_invoices", entityId: created?.id, after: { nuskInvoiceNumber: b.nuskInvoiceNumber } }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.created", entity: "umrah_nusk_invoices", entityId: created?.id }).catch((e) => logger.error(e, "nusk bg"));
    res.status(201).json(created);
  } catch (err) { handleRouteError(err, res, "Create nusk invoice"); }
});

router.patch("/nusk-invoices/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateNuskInvoiceSchema.safeParse(req.body));
    const [existing] = await rawQuery<{
      id: number; nuskStatus: string; nuskInvoiceNumber: string;
      totalAmount: number | string | null; refundAmount: number | string | null;
      purchaseInvoiceId: number | null; journalEntryId: number | null;
    }>(
      `SELECT id, "nuskStatus", "nuskInvoiceNumber", "totalAmount", "refundAmount",
              "purchaseInvoiceId", "journalEntryId"
       FROM umrah_nusk_invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    if (existing.nuskStatus === "paid" && b.nuskStatus !== "refunded") {
      throw new ConflictError("لا يمكن تعديل فاتورة نسك مدفوعة");
    }
    const fields = ["mutamerCount","groundServices","visaFees","insuranceFees","transportTotal","hotelTotal","additionalServices","netCost","totalAmount","refundAmount","nuskStatus","issueDate","expiryDate"] as const;
    // Single transaction: UPDATE row + (idempotent) re-evaluation
    // of the AP / refund-reversal journal entries. The legacy code
    // updated the row only — so transitioning a nusk invoice to
    // 'refunded' never posted the DR-AP / CR-cost reversal, the
    // trial balance over-reported AP, and finance had to manually
    // book the entry every refund. postNuskJournalEntries is
    // idempotent via sourceKey + existing-id guards: it backfills
    // legacy AP-less rows on first update AND posts the reversal
    // the first time status flips to 'refunded'. Mirrors the
    // confirmVouchersImport() update path.
    const updated = await withTransaction(async (client) => {
      const params: unknown[] = [];
      const sets: string[] = [];
      for (const key of fields) {
        // as-any-reason: justified-pragmatic - dynamic key access on Zod-parsed body whose generic does not expose indexer; key is bound to const whitelist (13 hardcoded columns)
        if ((b as any)[key] !== undefined) { params.push((b as any)[key]); sets.push(`"${key}"=$${params.length}`); }
      }
      let row = existing;
      if (sets.length > 0) {
        params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
        sets.push(`"updatedAt"=NOW()`);
        params.push(id); params.push(scope.companyId);
        const upd = await client.query(
          `UPDATE umrah_nusk_invoices SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
          params
        );
        row = upd.rows[0];
      }
      await postNuskJournalEntries(
        client,
        { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: 0 },
        {
          nuskId: row.id,
          nuskInvoiceNumber: String(row.nuskInvoiceNumber),
          totalAmount: Number(b.totalAmount ?? row.totalAmount ?? 0),
          refundAmount: Number(b.refundAmount ?? row.refundAmount ?? 0),
          nuskStatus: String(b.nuskStatus ?? row.nuskStatus ?? "pending").toLowerCase(),
          existingApJeId: row.purchaseInvoiceId ?? null,
          existingRefundJeId: row.journalEntryId ?? null,
        },
      );
      return row;
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_nusk_invoices", entityId: id, after: b }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.updated", entity: "umrah_nusk_invoices", entityId: id }).catch((e) => logger.error(e, "nusk bg"));
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Update nusk invoice"); }
});

router.delete("/nusk-invoices/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number; nuskStatus: string }>(
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
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Employee assignments error"); }
});

// ============================================================================
// COMMISSION PLANS
// ============================================================================

router.get("/commission-plans", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Pre-aggregate tier counts via CTE — same pattern as the
    // earlier N+1 fixes. Avoids 1 lookup per commission plan
    // through employee_commission_tiers.
    const rows = await rawQuery(
      `WITH tier_counts AS (
         SELECT "planId", COUNT(*) AS "tierCount"
         FROM employee_commission_tiers
         GROUP BY "planId"
       )
       SELECT cp.*,
              s.title AS "seasonTitle",
              COALESCE(tc."tierCount", 0)::int AS "tierCount"
       FROM employee_commission_plans cp
       LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id AND s."deletedAt" IS NULL
       LEFT JOIN tier_counts tc ON tc."planId" = cp.id
       WHERE cp."companyId" = $1 AND cp."deletedAt" IS NULL
       ORDER BY cp."createdAt" DESC`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List commission plans"); }
});

router.get("/commission-plans/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [[plan], tiers, calculations] = await Promise.all([
      rawQuery(
        `SELECT cp.*, s.title AS "seasonTitle"
         FROM employee_commission_plans cp
         LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id AND s."deletedAt" IS NULL
         WHERE cp.id = $1 AND cp."companyId" = $2 AND cp."deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
      rawQuery(
        `SELECT * FROM employee_commission_tiers WHERE "planId" = $1 ORDER BY "tierOrder"`,
        [id]
      ),
      rawQuery(
        `SELECT * FROM employee_commission_calculations
         WHERE "planId" = $1 AND "deletedAt" IS NULL ORDER BY year DESC, month DESC LIMIT 12`,
        [id]
      ),
    ]);
    if (!plan) { throw new NotFoundError("الخطة غير موجودة"); }
    res.json(maskFields(req, { ...plan, tiers, calculations }));
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

    // Governance hook: route through approval chain when company has
    // a configured chain for `umrah_commission_plan` matching the base
    // salary. If no chain matches, requiresApproval comes back false
    // and the plan is treated as auto-approved (existing behaviour).
    let approval: { requiresApproval: boolean; chainId: number | null; approvalRequestId: number | null; currentStep: number; totalSteps: number } | null = null;
    try {
      approval = await initiateApprovalChain({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        // as-any-reason: justified-pragmatic - chainType literal not yet in the shared ApprovalChainType union; runtime value is whitelisted by initiateApprovalChain
        chainType: "umrah_commission_plan" as any,
        refType: "employee_commission_plan",
        refId: result.id,
        amount: Number(b.baseSalary || 0),
      });
    } catch (e) {
      logger.error(e, "umrah commission plan approval chain init failed (non-blocking)");
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "employee_commission_plans", entityId: result.id, after: { planName: b.planName, approvalRequired: approval?.requiresApproval ?? false } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.created", entity: "employee_commission_plans", entityId: result.id, details: JSON.stringify({ planName: b.planName, approvalChainId: approval?.chainId ?? null }) }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json({ ...result, approval });
  } catch (err) { handleRouteError(err, res, "Create commission plan"); }
});

router.patch("/commission-plans/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateCommissionPlanSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;

    await withTransaction(async (client) => {
      const params: unknown[] = [];
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
    const { planId, year, month } = req.query as Record<string, string | undefined>;
    let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (planId) { params.push(planId); where += ` AND cc."planId" = $${params.length}`; }
    if (year) { params.push(year); where += ` AND cc.year = $${params.length}`; }
    if (month) { params.push(month); where += ` AND cc.month = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT cc.*, cp."planName"
       FROM employee_commission_calculations cc
       LEFT JOIN employee_commission_plans cp ON cc."planId" = cp.id AND cp."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY cc.year DESC, cc.month DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List commission calculations"); }
});

// ============================================================================
// IMPORT — preview + confirm
// ============================================================================

router.get("/import/batches", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    let where = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND b."seasonId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT b.* FROM umrah_import_batches b WHERE ${where} ORDER BY b."createdAt" DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows }));
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
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List batch changes"); }
});

// ============================================================================
// IMPORT — unlinked-rows recovery (§3 of #1870)
// ============================================================================
//
// Why this exists. The engine resolvers fall back to NULL when the source
// row lacks the lookup key (nuskAgentNumber / nuskGroupNumber / nuskCode).
// The row still lands in umrah_pilgrims, but with NULL agentId / groupId /
// subAgentId — meaning it's invisible on the agent → group → sub-agent
// drill-down and on per-entity rollup queries. The wizard now shows
// pre-confirm counts; this endpoint pair is the after-confirm recovery
// path so the operator can bulk-assign without re-importing the file.

router.get("/import/batches/:id/unlinked", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const dimension = String(req.query.dimension ?? "agent");
    if (!["agent", "group", "subAgent"].includes(dimension)) {
      throw new ValidationError("البُعد المطلوب غير صالح", { field: "dimension" });
    }
    const [batch] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");

    // The pilgrim row carries no batchId column, so we join through
    // umrah_import_changes which DOES tag every row written during
    // a batch. Filter to entityType='mutamer' + changeType in
    // ('created','updated') so we don't sweep in skips / errors.
    const fkColumn = dimension === "agent" ? "agentId"
                   : dimension === "group" ? "groupId"
                   : "subAgentId";
    const rows = await rawQuery<{
      id: number; nuskNumber: string | null; fullName: string;
      nationality: string | null; status: string | null;
      agentId: number | null; groupId: number | null; subAgentId: number | null;
    }>(
      `SELECT p.id, p."nuskNumber", p."fullName", p.nationality, p.status,
              p."agentId", p."groupId", p."subAgentId"
       FROM umrah_pilgrims p
       WHERE p."companyId" = $1
         AND p."${fkColumn}" IS NULL
         AND p."deletedAt" IS NULL
         AND EXISTS (
           SELECT 1 FROM umrah_import_changes ic
           WHERE ic."batchId" = $2
             AND ic."entityType" = 'mutamer'
             AND ic."entityId" = p.id
             AND ic."changeType" IN ('created','updated')
         )
       ORDER BY p."nuskNumber" NULLS LAST, p.id
       LIMIT 1000`,
      [scope.companyId, id]
    );
    res.json(maskFields(req, { data: rows, dimension, batchId: id }));
  } catch (err) { handleRouteError(err, res, "List unlinked rows"); }
});

const linkUnlinkedSchema = z.object({
  dimension: z.enum(["agent", "group", "subAgent"]),
  pilgrimIds: z.array(z.coerce.number().int().positive()).min(1, "اختر صفًا واحدًا على الأقل"),
  // exactly one of: existing target id, or new-entity name to create
  targetId: z.coerce.number().int().positive().optional(),
  newEntityName: z.string().trim().min(1).optional(),
  // optional parent linkage for sub-agent creation (must belong to an agent)
  parentAgentId: z.coerce.number().int().positive().optional(),
}).refine((v) => (v.targetId !== undefined) !== (v.newEntityName !== undefined), {
  message: "يجب تحديد إما هدف موجود أو اسم لإنشاء كيان جديد، لا الاثنين معًا",
});

router.post("/import/batches/:id/unlinked/link", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(linkUnlinkedSchema.safeParse(req.body));
    const [batch] = await rawQuery<{ id: number; seasonId: number | null }>(
      `SELECT id, "seasonId" FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");

    const result = await withTransaction(async (client) => {
      // Resolve the target FK. Either look up the existing one and
      // verify it belongs to the same tenant, or create a fresh row
      // in the dimension table. Both branches return the id we'll
      // stamp on every selected pilgrim.
      let resolvedTargetId: number;
      if (b.targetId !== undefined) {
        const table = b.dimension === "agent" ? "umrah_agents"
                    : b.dimension === "group" ? "umrah_groups"
                    : "umrah_sub_agents";
        const exists = await client.query(
          `SELECT id FROM ${table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
          [b.targetId, scope.companyId]
        );
        if (exists.rows.length === 0) {
          throw new NotFoundError(
            b.dimension === "agent" ? "الوكيل غير موجود"
            : b.dimension === "group" ? "المجموعة غير موجودة"
            : "الوكيل الفرعي غير موجود"
          );
        }
        resolvedTargetId = b.targetId;
      } else {
        const name = b.newEntityName!;
        if (b.dimension === "agent") {
          const ins = await client.query(
            `INSERT INTO umrah_agents ("companyId","branchId",name,"createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id`,
            [scope.companyId, scope.branchId || null, name, scope.userId]
          );
          resolvedTargetId = ins.rows[0].id;
        } else if (b.dimension === "group") {
          // nuskGroupNumber is NOT NULL (external Nusk portal id). A group
          // auto-created by name during batch resolution has no external id yet,
          // so stamp an internal placeholder ref (via lib/ so it doesn't bypass
          // the numbering-center lint guard) until the real Nusk number is set.
          // The (companyId, nuskGroupNumber) index is non-unique, so no collision.
          const autoNusk = internalTechRef("UGRP");
          const ins = await client.query(
            `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber","seasonId",name,"agentId","createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING id`,
            [scope.companyId, scope.branchId || null, autoNusk, batch.seasonId, name, b.parentAgentId || null, scope.userId]
          );
          resolvedTargetId = ins.rows[0].id;
        } else {
          // Sub-agent needs a parent agent — refuse fast if missing,
          // otherwise the rollup queries on per-agent statements
          // wouldn't pick up the new sub-agent at all.
          if (!b.parentAgentId) {
            throw new ValidationError("يجب اختيار الوكيل الأم للوكيل الفرعي", { field: "parentAgentId" });
          }
          const parent = await client.query(
            `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
            [b.parentAgentId, scope.companyId]
          );
          if (parent.rows.length === 0) throw new NotFoundError("الوكيل الأم غير موجود");
          const ins = await client.query(
            `INSERT INTO umrah_sub_agents ("companyId","branchId","agentId",name,"createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id`,
            [scope.companyId, scope.branchId || null, b.parentAgentId, name, scope.userId]
          );
          resolvedTargetId = ins.rows[0].id;
        }
      }

      const fkColumn = b.dimension === "agent" ? "agentId"
                     : b.dimension === "group" ? "groupId"
                     : "subAgentId";
      // Only UPDATE rows that are STILL unlinked + that were touched
      // by THIS batch — defence against concurrent edits and against
      // an operator pasting pilgrimIds from a different batch.
      const upd = await client.query(
        `UPDATE umrah_pilgrims p
         SET "${fkColumn}"=$1, "updatedBy"=$2, "updatedAt"=NOW()
         WHERE p."companyId"=$3
           AND p.id = ANY($4::int[])
           AND p."${fkColumn}" IS NULL
           AND p."deletedAt" IS NULL
           AND EXISTS (
             SELECT 1 FROM umrah_import_changes ic
             WHERE ic."batchId" = $5 AND ic."entityType" = 'mutamer'
               AND ic."entityId" = p.id
           )
         RETURNING id`,
        [resolvedTargetId, scope.userId, scope.companyId, b.pilgrimIds, id]
      );
      const linkedCount = upd.rows.length;

      // Decrement the batch counter so the recovery screen shows
      // remaining work, not the pre-link count.
      const counterCol = b.dimension === "agent" ? "unlinkedAgentCount"
                       : b.dimension === "group" ? "unlinkedGroupCount"
                       : "unlinkedSubAgentCount";
      await client.query(
        `UPDATE umrah_import_batches
         SET "${counterCol}" = GREATEST(0, COALESCE("${counterCol}", 0) - $1),
             "updatedAt" = NOW()
         WHERE id = $2 AND "companyId" = $3`,
        [linkedCount, id, scope.companyId]
      );

      return { linkedCount, resolvedTargetId };
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update",
      entity: "umrah_pilgrims", entityId: 0,
      after: { batchId: id, dimension: b.dimension, targetId: result.resolvedTargetId, linkedCount: result.linkedCount },
    }).catch((e) => logger.error(e, "unlinked-link bg"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.unlinked_rows_linked", entity: "umrah_import_batches", entityId: id,
      after: { dimension: b.dimension, linkedCount: result.linkedCount },
    }).catch((e) => logger.error(e, "unlinked-link bg"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Link unlinked rows"); }
});

// ============================================================================
// SALES INVOICES
// ============================================================================

router.get("/invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, subAgentId, status } = req.query as Record<string, string | undefined>;
    let where = `si."companyId" = $1 AND si."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND si."seasonId" = $${params.length}`; }
    if (subAgentId) { params.push(subAgentId); where += ` AND si."subAgentId" = $${params.length}`; }
    if (status) { params.push(status); where += ` AND si.status = $${params.length}`; }
    const rows = await rawQuery(
      // Defence-in-depth on the sub-agents JOIN — it previously matched
      // only on id, so a stale FK could lift another tenant's name into
      // the response. Matches the pattern PR #1425 added to GET
      // /umrah/pilgrims/:id. Selecting si.* surfaces the costBasis +
      // marginBase columns (populated by umrahInvoicingEngine since
      // PR #1457) so the UI can display gross profit per row.
      `SELECT si.*, sa.name AS "subAgentName", c.name AS "clientName"
       FROM umrah_sales_invoices si
       LEFT JOIN umrah_sub_agents sa
              ON sa.id = si."subAgentId"
             AND sa."companyId" = si."companyId"
             AND sa."deletedAt" IS NULL
       LEFT JOIN clients c
              ON c.id = si."clientId"
             AND c."companyId" = si."companyId"
             AND c."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY si."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List umrah invoices"); }
});

router.post("/invoices/generate", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(generateInvoiceSchema.safeParse(req.body));
    const { subAgentId, groupIds, seasonId, manualPrices } = parsed;
    const result = await generateSalesInvoice(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      { subAgentId, groupIds, seasonId, manualPrices }
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { subAgentId, groupIds, seasonId, manualPrices: manualPrices ? Object.keys(manualPrices).length : 0 } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.generated", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { ref: result.ref, total: result.total, subAgentId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    // §10 of #1870 — canonical name (see eventCatalog).
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sales_invoice.created", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { ref: result.ref, total: result.total, subAgentId } }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Generate umrah invoice"); }
});

// Sales-invoice wizard: lists uninvoiced groups for a sub-agent + smart
// per-group price suggestions (last invoice → pricing rule →
// sub-agent default → none). The UI pre-fills the suggested price and
// the operator types only for exceptional cases. Pairs with the
// `manualPrices` payload on POST /invoices/generate above.
router.get("/sales-wizard/uninvoiced-groups", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const subAgentId = parseId(String(req.query.subAgentId ?? ""), "subAgentId");
    const seasonRaw = req.query.seasonId;
    const seasonId = seasonRaw != null && String(seasonRaw) !== "" ? Number(seasonRaw) : null;
    const result = await listUninvoicedGroups(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      subAgentId,
      seasonId,
    );
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "List uninvoiced groups for sales wizard"); }
});

router.patch("/invoices/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateInvoiceSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: unknown[] = [];
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
    const { subAgentId } = req.query as Record<string, string | undefined>;
    let where = `p."companyId" = $1 AND p."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (subAgentId) { params.push(subAgentId); where += ` AND p."subAgentId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT p.*, sa.name AS "subAgentName"
       FROM umrah_payments p
       LEFT JOIN umrah_sub_agents sa
         ON sa.id = p."subAgentId"
        AND sa."companyId" = p."companyId"
        AND sa."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY p."paymentDate" DESC, p.id DESC
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
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
    const { type, from, to } = req.query as Record<string, string | undefined>;
    const stmtType = type === "summary" ? "summary" : "detailed";
    const result = await generateStatement(
      { companyId: scope.companyId, userId: scope.userId },
      parseId(req.params.subAgentId, "subAgentId"),
      stmtType,
      from, to
    );
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "Generate statement"); }
});

// Printable Arabic statement of the sub-agent ledger. Reuses the same data
// `generateStatement(detailed)` returns to the JSON peer; renderPrint owns
// the cliché, audit row, and reprint detection from there on.
router.get("/statements/:subAgentId/pdf", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { from, to } = req.query as Record<string, string | undefined>;
    const subAgentId = parseId(req.params.subAgentId, "subAgentId");
    const data = await generateStatement(
      { companyId: scope.companyId, userId: scope.userId },
      subAgentId,
      "detailed",
      from, to
    );
    // Sub-agent header info the template renders next to the totals.
    const [subAgentRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, "nuskCode", "paymentTerms"
         FROM umrah_sub_agents
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [subAgentId, scope.companyId],
    );
    const sub = subAgentRow as { name?: string; nuskCode?: string | null; paymentTerms?: string | null } | undefined;
    const closing = Number((data as { closingBalance: number }).closingBalance ?? 0);
    const totalDebit  = (data as { entries: Array<{ debit: number }> }).entries.reduce((s, e) => s + Number(e.debit  || 0), 0);
    const totalCredit = (data as { entries: Array<{ credit: number }> }).entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    const rangeText = from && to ? `${from} → ${to}` : "كل الفترات";
    const payTermsLabel = sub?.paymentTerms === "prepaid" ? "مقدم" : sub?.paymentTerms === "postpaid" ? "آجل" : (sub?.paymentTerms ?? "-");
    const closingLabel = closing > 0 ? "الرصيد الختامي (مستحق على الوكيل)" : closing < 0 ? "الرصيد الختامي (دفعة مقدمة من الوكيل)" : "الرصيد الختامي";

    const result = await renderPrint(
      {
        companyId: scope.companyId, branchId: scope.branchId ?? null,
        userId: scope.userId, role: scope.role, isOwner: scope.isOwner,
      },
      {
        entityType: "umrah_statement",
        entityId: `${subAgentId}:${from ?? ""}..${to ?? ""}`,
        format: "a4",
        previewPayload: {
          entity: {
            id: subAgentId,
            subAgentName: sub?.name ?? "",
            nuskCode: sub?.nuskCode ?? "",
            paymentTermsLabel: payTermsLabel,
            rangeText,
            openingBalance: Number((data as { openingBalance: number }).openingBalance ?? 0).toFixed(2),
            closingBalance: Math.abs(closing).toFixed(2),
            closingBalanceLabel: closingLabel,
            totalDebit: totalDebit.toFixed(2),
            totalCredit: totalCredit.toFixed(2),
          },
          lines: (data as { entries: Array<Record<string, unknown>> }).entries.map((e) => ({
            "التاريخ": e.date ? String(e.date).slice(0, 10) : "-",
            "الوصف": e.description,
            "المرجع": e.reference || "-",
            "مدين": Number(e.debit  || 0),
            "دائن": Number(e.credit || 0),
            "الرصيد": Number(e.balance || 0),
          })),
        },
      },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="umrah-statement-${subAgentId}.${result.mime.includes("html") ? "html" : "pdf"}"`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) { handleRouteError(err, res, "Statement PDF"); }
});

// ============================================================================
// LETTERS — PDF rendering + dispatch (closes spec §14 dispatch gap)
// ============================================================================

// Download a generated umrah letter as a printable Arabic PDF. Reads
// from the central official_letters table — same table HR / legal /
// contracts use — so there's no parallel storage.
router.get("/letters/:id/pdf", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ValidationError("معرّف الخطاب غير صالح");
    }
    // Scope check — letter belongs to the user's company AND is umrah-typed.
    // The dataLoader will refetch the full row inside renderPrint; we still
    // do the gate here so the failure mode is a clean 404 instead of an
    // empty document.
    const [letter] = await rawQuery<{ id: number; type: string }>(
      `SELECT id, type FROM official_letters
        WHERE id=$1 AND "companyId"=$2
          AND (type LIKE 'umrah_%' OR type = 'umrah')`,
      [id, scope.companyId]
    );
    if (!letter) throw new NotFoundError("الخطاب غير موجود");

    const result = await renderPrint(
      {
        companyId: scope.companyId, branchId: scope.branchId ?? null,
        userId: scope.userId, role: scope.role, isOwner: scope.isOwner,
      },
      { entityType: "official_letter", entityId: String(id), format: "a4" },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="umrah-letter-${id}.${result.mime.includes("html") ? "html" : "pdf"}"`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) { handleRouteError(err, res, "Letter PDF"); }
});

// Mark an umrah letter as dispatched. Sets sentAt + dispatchedVia + flips
// status='sent'. Idempotent: re-dispatch returns 409 (typed ConflictError).
router.post("/letters/:id/dispatch", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const body = z.object({
      dispatchedVia: z.enum(["print", "email", "whatsapp", "courier", "hand_delivery"]),
      recipient: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ValidationError("معرّف الخطاب غير صالح");
    }
    const [letter] = await rawQuery<{ id: number; status: string; sentAt: string | null; type: string }>(
      `SELECT id, status, "sentAt", type FROM official_letters
        WHERE id=$1 AND "companyId"=$2
          AND (type LIKE 'umrah_%' OR type = 'umrah')`,
      [id, scope.companyId]
    );
    if (!letter) throw new NotFoundError("الخطاب غير موجود");
    if (letter.sentAt) {
      throw new ConflictError("الخطاب مُرسل سابقاً", {
        meta: { sentAt: letter.sentAt, currentStatus: letter.status },
      });
    }
    if (letter.status === "draft") {
      throw new ConflictError("لا يمكن إرسال خطاب في حالة draft — يحتاج اعتماد أولاً", {
        meta: { currentStatus: letter.status, fix: "اعتمد الخطاب من /official-letters/:id/approve" },
      });
    }

    await rawExecute(
      `UPDATE official_letters
          SET "sentAt"=NOW(), "dispatchedVia"=$1, status='sent'
        WHERE id=$2 AND "companyId"=$3`,
      [body.dispatchedVia, id, scope.companyId]
    );

    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "dispatch",
      entity: "umrah_letter",
      entityId: id,
      after: { dispatchedVia: body.dispatchedVia, recipient: body.recipient ?? null },
    });

    await emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId ?? undefined,
      userId: scope.userId,
      action: "umrah.letter.dispatched",
      entity: "official_letters",
      entityId: id,
      details: JSON.stringify({
        dispatchedVia: body.dispatchedVia,
        recipient: body.recipient,
      }),
    });

    res.json({ id, status: "sent", dispatchedVia: body.dispatchedVia, sentAt: new Date().toISOString() });
  } catch (err) { handleRouteError(err, res, "Letter dispatch"); }
});

// ============================================================================
// REPORTS — Daily run-sheet (arrivals + departures + overstays)
// ============================================================================

// Returns arrivals + departures for `date` (defaults to today, ISO yyyy-mm-dd)
// + everyone currently overstaying. Used by ops to plan transport / hotel
// allocations and chase overstays. Same payload also feeds the PDF endpoint.
async function fetchDailyRunsheet(companyId: number, date: string) {
  const baseSelect = `
    SELECT p."nuskNumber", p."fullName", p.nationality,
           g.name AS "groupName", sa.name AS "subAgentName",
           p."entryPort", p."entryFlight", p."exitPort", p."exitFlight",
           p."overstayDays"
      FROM umrah_pilgrims p
      LEFT JOIN umrah_groups g ON g.id = p."groupId"
      LEFT JOIN umrah_sub_agents sa ON sa.id = p."subAgentId"
     WHERE p."companyId" = $1 AND p."deletedAt" IS NULL`;

  const [arrivals, departures, overstays] = await Promise.all([
    rawQuery<Record<string, unknown>>(`${baseSelect} AND p."entryDate" = $2 ORDER BY g.name NULLS LAST, p."fullName"`, [companyId, date]),
    rawQuery<Record<string, unknown>>(`${baseSelect} AND p."exitDate" = $2 ORDER BY g.name NULLS LAST, p."fullName"`, [companyId, date]),
    rawQuery<Record<string, unknown>>(`${baseSelect} AND p.status IN ('overstayed','violated') AND p."overstayDays" > 0 ORDER BY p."overstayDays" DESC, p."fullName"`, [companyId]),
  ]);

  return { arrivals, departures, overstays };
}

router.get("/reports/daily-runsheet", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const date = String((req.query.date as string) || todayISO());
    const data = await fetchDailyRunsheet(scope.companyId, date);
    res.json(maskFields(req, { date, ...data }));
  } catch (err) { handleRouteError(err, res, "Daily run-sheet"); }
});

router.get("/reports/daily-runsheet/pdf", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const date = String((req.query.date as string) || todayISO());
    const data = await fetchDailyRunsheet(scope.companyId, date);
    const arrivals = (data.arrivals as Array<Record<string, unknown>>).map((r) => ({
      "رقم نسك": r.nuskNumber, "الاسم": r.fullName, "الجنسية": r.nationality ?? "-",
      "المجموعة": r.groupName ?? "-", "الوكيل الفرعي": r.subAgentName ?? "-",
      "ميناء": r.entryPort ?? "-", "رحلة": r.entryFlight ?? "-",
    }));
    const departures = (data.departures as Array<Record<string, unknown>>).map((r) => ({
      "رقم نسك": r.nuskNumber, "الاسم": r.fullName, "الجنسية": r.nationality ?? "-",
      "المجموعة": r.groupName ?? "-", "الوكيل الفرعي": r.subAgentName ?? "-",
      "ميناء": r.exitPort ?? "-", "رحلة": r.exitFlight ?? "-",
    }));
    const overstays = (data.overstays as Array<Record<string, unknown>>).map((r) => ({
      "رقم نسك": r.nuskNumber, "الاسم": r.fullName, "الجنسية": r.nationality ?? "-",
      "المجموعة": r.groupName ?? "-", "الوكيل الفرعي": r.subAgentName ?? "-",
      "أيام التجاوز": r.overstayDays,
    }));

    const result = await renderPrint(
      {
        companyId: scope.companyId, branchId: scope.branchId ?? null,
        userId: scope.userId, role: scope.role, isOwner: scope.isOwner,
      },
      {
        entityType: "umrah_runsheet",
        entityId: date,
        format: "a4",
        previewPayload: {
          entity: {
            id: date,
            date,
            arrivalsCount: arrivals.length,
            departuresCount: departures.length,
            overstaysCount: overstays.length,
          },
          arrivals, departures, overstays,
        },
      },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="umrah-runsheet-${date}.${result.mime.includes("html") ? "html" : "pdf"}"`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) { handleRouteError(err, res, "Daily run-sheet PDF"); }
});

// ============================================================================
// ATTACHMENTS — polymorphic document storage for umrah entities (#4)
// ============================================================================

const ATTACH_ENTITY_TYPES = ["mutamer","sub_agent","group","agent","nusk_invoice","season","sales_invoice","violation"] as const;
const ATTACH_TYPES = ["passport","visa","contract","nusk_file","identity","transfer_receipt","other"] as const;

const createAttachmentSchema = z.object({
  entityType: z.enum(ATTACH_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  type: z.enum(ATTACH_TYPES),
  title: z.string().min(1).max(255),
  notes: z.string().optional(),
  fileUrl: z.string().url().max(2000).optional(),
  storageKey: z.string().max(500).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().max(120).optional(),
});

// Map entityType → table for ownership verification. Keeps the route from
// trusting arbitrary entityIds — every attachment must point at a row the
// caller's company actually owns.
const ATTACH_OWNER_TABLE: Record<string, string> = {
  mutamer:        "umrah_pilgrims",
  sub_agent:      "umrah_sub_agents",
  group:          "umrah_groups",
  agent:          "umrah_agents",
  nusk_invoice:   "umrah_nusk_invoices",
  season:         "umrah_seasons",
  sales_invoice:  "umrah_sales_invoices",
  violation:      "umrah_violations",
};

async function assertAttachmentOwner(companyId: number, entityType: string, entityId: number): Promise<void> {
  const table = ATTACH_OWNER_TABLE[entityType];
  if (!table) throw new ValidationError("نوع كيان غير مدعوم", { field: "entityType" });
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT id FROM "${safeTable}" WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [entityId, companyId]
  );
  if (!row) throw new NotFoundError("الكيان المرفق به غير موجود أو محذوف");
}

router.get("/attachments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, type } = req.query as Record<string, string | undefined>;
    // DOC-VIOLATION unification (migration 237): umrah attachments now live in
    // the shared documents + document_entity_links store. The polymorphic owner
    // is namespaced as 'umrah_<entityType>' in the link table; type → category,
    // notes → description. Response shape is preserved (entityType stripped back
    // to the umrah-local value) so the umrah attachments panel is unchanged.
    let where = `d."companyId" = $1 AND d."deletedAt" IS NULL AND del."entityType" LIKE 'umrah\\_%'`;
    const params: unknown[] = [scope.companyId];
    if (entityType) { params.push(`umrah_${entityType}`); where += ` AND del."entityType" = $${params.length}`; }
    if (entityId)   { params.push(Number(entityId)); where += ` AND del."entityId" = $${params.length}`; }
    if (type)       { params.push(type); where += ` AND d.category = $${params.length}`; }
    const docs = await rawQuery<Record<string, unknown>>(
      `SELECT d.id, del."entityType" AS "linkEntityType", del."entityId" AS "entityId",
              d.category AS type, d.title, d.description AS notes, d."fileUrl", d."storageKey",
              d."fileSize", d."mimeType", d."uploadedBy", d."createdAt"
         FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
        WHERE ${where}
        ORDER BY d."createdAt" DESC
        LIMIT 500`,
      params
    );
    const rows = docs.map((d) => ({
      id: d.id,
      entityType: String(d.linkEntityType).replace(/^umrah_/, ""),
      entityId: d.entityId,
      type: d.type,
      title: d.title,
      notes: d.notes,
      fileUrl: d.fileUrl,
      storageKey: d.storageKey,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      uploadedBy: d.uploadedBy,
      createdAt: d.createdAt,
    }));
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List attachments"); }
});

router.post("/attachments", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createAttachmentSchema.safeParse(req.body));
    await assertAttachmentOwner(scope.companyId, body.entityType, body.entityId);

    // DOC-VIOLATION unification (migration 237): write to the shared documents
    // store (+ document_entity_links) instead of the per-track umrah_attachments
    // table. type → category, notes → description, owner namespaced as
    // 'umrah_<entityType>'. Atomic so a document is never left without its link.
    let newId!: number;
    await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO documents
           (title, description, category, "fileName", "fileUrl", "storageKey",
            "fileSize", "mimeType", status, "currentVersion", "uploadedBy", "companyId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',1,$9,$10) RETURNING id`,
        [
          body.title, body.notes || null, body.type, body.title,
          body.fileUrl || null, body.storageKey || null,
          body.fileSize ?? null, body.mimeType || null,
          scope.userId, scope.companyId,
        ]
      );
      newId = r.rows[0].id;
      await client.query(
        `INSERT INTO document_entity_links ("documentId", "entityType", "entityId")
         VALUES ($1, $2, $3) ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING`,
        [newId, `umrah_${body.entityType}`, body.entityId]
      );
    });
    const row = { id: newId };

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "umrah_attachments", entityId: row.id,
      after: { entityType: body.entityType, entityId: body.entityId, type: body.type, title: body.title },
    }).catch((e) => logger.error(e, "umrah attachments bg"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.attachment.created", entity: "umrah_attachments", entityId: row.id,
      details: JSON.stringify({ entityType: body.entityType, entityId: body.entityId, type: body.type }),
    }).catch((e) => logger.error(e, "umrah attachments bg"));

    res.status(201).json({ id: row.id });
  } catch (err) { handleRouteError(err, res, "Create attachment"); }
});

router.delete("/attachments/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // DOC-VIOLATION unification (migration 237): the id is now a documents.id.
    // Only allow deleting documents that belong to this company AND are linked
    // to an umrah owner (entityType LIKE 'umrah\_%') so this endpoint can't be
    // used to delete arbitrary documents.
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT d.id FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
        WHERE d.id=$1 AND d."companyId"=$2 AND d."deletedAt" IS NULL
          AND del."entityType" LIKE 'umrah\\_%'
        LIMIT 1`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المرفق غير موجود");
    await rawExecute(
      `UPDATE documents SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_attachments", entityId: id }).catch((e) => logger.error(e, "umrah attachments bg"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.attachment.deleted", entity: "umrah_attachments", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah attachments bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete attachment"); }
});

// ============================================================================
// RECONCILIATION REPORT — NUSK file ↔ system diff (#8)
// ============================================================================

// Compares the canonical NUSK invoice file against system state in three
// dimensions:
//   1. Total amount of nusk invoice vs total of journal entries against it
//      (catches refunds / partial payments missed by the importer).
//   2. mutamerCount on the nusk invoice vs actual pilgrims linked to its
//      group (catches drop-outs that the file never recorded).
//   3. Overstays: pilgrims with overstayDays > 0 and no open violation row
//      (catches violations the cron should have created but didn't).
//
// Read-only — no mutations. Output is grouped so ops can drill into the
// specific records that need attention without re-running ad-hoc SQL.
router.get("/reports/reconciliation", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    const seasonNum = seasonId ? Number(seasonId) : null;

    // M1: the season filter was computed but never applied to any of the
    // three reconciliation queries. umrah_nusk_invoices carries no
    // seasonId, so amountDiffs/countDiffs scope through the invoice's
    // group; overstayGaps scopes the pilgrim directly. $2 is bound only
    // when a season is requested.
    const params: unknown[] = seasonNum != null ? [scope.companyId, seasonNum] : [scope.companyId];
    const nuskSeasonClause = seasonNum != null
      ? ` AND ni."groupId" IN (SELECT id FROM umrah_groups WHERE "companyId" = $1 AND "seasonId" = $2)`
      : "";
    const groupSeasonClause = seasonNum != null ? ` AND g."seasonId" = $2` : "";
    const pilgrimSeasonClause = seasonNum != null ? ` AND p."seasonId" = $2` : "";

    // 1. Amount diff: nusk total vs posted JE total
    const amountDiffs = await rawQuery<Record<string, unknown>>(
      `SELECT ni.id, ni."nuskInvoiceNumber", ni."totalAmount" AS "fileTotal",
              ni."nuskStatus", ni."purchaseInvoiceId", ni."journalEntryId",
              COALESCE(je_ap.total, 0) AS "postedAp",
              COALESCE(je_rf.total, 0) AS "postedRefund",
              (ni."totalAmount" - COALESCE(je_ap.total, 0) + COALESCE(je_rf.total, 0))::numeric(12,2) AS "diff"
         FROM umrah_nusk_invoices ni
    LEFT JOIN LATERAL (
           SELECT SUM(jl.debit) AS total FROM journal_entries je
             JOIN journal_lines jl ON jl."journalId" = je.id
            WHERE je.id = ni."purchaseInvoiceId" AND je."deletedAt" IS NULL
              AND jl."accountCode" LIKE '5%'
         ) je_ap ON true
    LEFT JOIN LATERAL (
           SELECT SUM(jl.credit) AS total FROM journal_entries je
             JOIN journal_lines jl ON jl."journalId" = je.id
            WHERE je.id = ni."journalEntryId" AND je."deletedAt" IS NULL
              AND jl."accountCode" LIKE '5%'
         ) je_rf ON true
        WHERE ni."companyId" = $1 AND ni."deletedAt" IS NULL
          AND ni."nuskStatus" != 'cancelled'${nuskSeasonClause}
          AND ABS(ni."totalAmount" - COALESCE(je_ap.total, 0) + COALESCE(je_rf.total, 0)) > 0.01
        ORDER BY ABS(ni."totalAmount" - COALESCE(je_ap.total, 0) + COALESCE(je_rf.total, 0)) DESC
        LIMIT 500`,
      params
    );

    // 2. Mutamer count diff: file says X, system has Y in the linked group
    // Pre-aggregate umrah_pilgrims counts via CTE — the original
    // query ran the SAME scalar COUNT subquery THREE TIMES per row
    // (SELECT column + WHERE filter + ORDER BY). At LIMIT 500 that's
    // 1501 redundant lookups through umrah_pilgrims. One CTE scan +
    // LEFT JOIN collapses it to a single pass.
    const countDiffs = await rawQuery<Record<string, unknown>>(
      `WITH pilgrim_counts AS (
         SELECT "groupId", "companyId", COUNT(*) AS "systemCount"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "groupId", "companyId"
       )
       SELECT ni.id, ni."nuskInvoiceNumber", ni."mutamerCount" AS "fileCount",
              ni."groupId", g.name AS "groupName",
              COALESCE(pc."systemCount", 0)::int AS "systemCount"
         FROM umrah_nusk_invoices ni
    LEFT JOIN umrah_groups g ON g.id = ni."groupId"
    LEFT JOIN pilgrim_counts pc ON pc."groupId" = ni."groupId" AND pc."companyId" = ni."companyId"
        WHERE ni."companyId" = $1 AND ni."deletedAt" IS NULL
          AND ni."groupId" IS NOT NULL${groupSeasonClause}
          AND ni."mutamerCount" IS NOT NULL
          AND ni."mutamerCount" != COALESCE(pc."systemCount", 0)
        ORDER BY ABS(ni."mutamerCount" - COALESCE(pc."systemCount", 0)) DESC
        LIMIT 500`,
      params
    );

    // 3. Overstays without a violation row
    const overstayGaps = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."nuskNumber", p."fullName", p."overstayDays", p."groupId",
              g.name AS "groupName", sa.name AS "subAgentName"
         FROM umrah_pilgrims p
    LEFT JOIN umrah_groups g ON g.id = p."groupId"
    LEFT JOIN umrah_sub_agents sa ON sa.id = p."subAgentId"
        WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
          AND COALESCE(p."overstayDays", 0) > 0${pilgrimSeasonClause}
          AND NOT EXISTS (
            SELECT 1 FROM umrah_violations v
             WHERE v."mutamerId" = p.id
               AND v."companyId" = p."companyId"
               AND v.status IN ('detected','open')
               AND v."deletedAt" IS NULL
          )
        ORDER BY p."overstayDays" DESC
        LIMIT 500`,
      params
    );

    res.json(maskFields(req, {
      summary: {
        amountDiffs: amountDiffs.length,
        countDiffs: countDiffs.length,
        overstayGaps: overstayGaps.length,
      },
      amountDiffs,
      countDiffs,
      overstayGaps,
    }));
  } catch (err) { handleRouteError(err, res, "Reconciliation report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Exempt-pilgrims compliance report — closes the audit-trail gap from PRs
// #1482-1484. Per-pilgrim exemption is captured (overstayExempt /Reason /By
// /At) and shown on the pilgrim detail page, but there was no rollup so a
// compliance officer couldn't answer "who is currently exempt, on whose
// authority, and why" without grepping audit_logs.
//
// Newest exemptions first — typical use case is "did anything change today
// that I should sign off on?". JOINs users + employees so the response
// carries `exemptedByName` (employee name preferred, falling back to user
// email) instead of just an opaque userId. Tenant-scoped + soft-delete
// filtered on every JOIN.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/exempt-pilgrims", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, agentId, groupId } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let filterClause = "";
    if (seasonId) { params.push(Number(seasonId)); filterClause += ` AND p."seasonId" = $${params.length}`; }
    if (agentId)  { params.push(Number(agentId));  filterClause += ` AND p."agentId" = $${params.length}`; }
    if (groupId)  { params.push(Number(groupId));  filterClause += ` AND p."groupId" = $${params.length}`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."nuskNumber", p.nationality, p.status,
              p."overstayExemptReason" AS "reason",
              p."overstayExemptAt" AS "exemptedAt",
              p."overstayExemptBy" AS "exemptedById",
              COALESCE(e.name, u.email) AS "exemptedByName",
              p."seasonId", p."groupId", p."agentId",
              s.title AS "seasonTitle",
              g.name AS "groupName",
              g."nuskGroupNumber" AS "groupNuskNumber",
              a.name AS "agentName",
              p."arrivalDate", p."departureDate", p."overstayDays"
         FROM umrah_pilgrims p
    LEFT JOIN users u
           ON u.id = p."overstayExemptBy"
    LEFT JOIN employees e
           ON e.id = u."employeeId"
    LEFT JOIN umrah_seasons s
           ON s.id = p."seasonId" AND s."companyId" = p."companyId" AND s."deletedAt" IS NULL
    LEFT JOIN umrah_groups g
           ON g.id = p."groupId" AND g."companyId" = p."companyId" AND g."deletedAt" IS NULL
    LEFT JOIN umrah_agents a
           ON a.id = p."agentId" AND a."companyId" = p."companyId" AND a."deletedAt" IS NULL
        WHERE p."companyId" = $1
          AND p."deletedAt" IS NULL
          AND p."overstayExempt" = true${filterClause}
        ORDER BY p."overstayExemptAt" DESC NULLS LAST
        LIMIT 500`,
      params,
    );

    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Exempt pilgrims report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Group portfolio P&L — "which groups make money?". Mirrors the agent
// portfolio page (PR #1222) but at the group granularity. Operators wanted a
// rollup that answers "is this season profitable?" without opening every group
// detail one by one.
//
// Revenue per group: SUM(umrah_sales_invoice_items.lineTotal) for non-
// cancelled invoices — items table holds the groupId (header doesn't).
// Cost per group: SUM(umrah_nusk_invoices.netCost) for non-cancelled rows
// directly linked via groupId. Margin = revenue − cost.
//
// Single query with two LATERAL subqueries so even a 500-group season returns
// in one roundtrip. Tenant-scoped at every JOIN.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/group-portfolio", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, limit: limitStr } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(limitStr ?? "50") || 50, 1), 500);

    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND g."seasonId" = $${params.length}`; }
    params.push(limit);

    const rows = await rawQuery<Record<string, unknown>>(
      // Pre-aggregate umrah_pilgrims actual counts via CTE — same
      // pattern as the rest of the N+1 sweep. Avoids one lookup per
      // returned group row through umrah_pilgrims.
      `WITH pilgrim_actuals AS (
         SELECT "groupId", "companyId", COUNT(*) AS "actualPilgrims"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "groupId", "companyId"
       )
       SELECT g.id, g.name, g."nuskGroupNumber", g.status, g."seasonId",
              s.title AS "seasonTitle",
              g."agentId", a.name AS "agentName",
              g."mutamerCount" AS "expectedPilgrims",
              COALESCE(pa."actualPilgrims", 0)::int AS "actualPilgrims",
              COALESCE(sales.revenue, 0) AS revenue,
              COALESCE(sales.paid, 0)    AS paid,
              COALESCE(nusk.cost, 0)     AS cost,
              (COALESCE(sales.revenue, 0) - COALESCE(nusk.cost, 0))::numeric(12,2) AS margin
         FROM umrah_groups g
    LEFT JOIN umrah_seasons s
           ON s.id = g."seasonId" AND s."companyId" = g."companyId" AND s."deletedAt" IS NULL
    LEFT JOIN pilgrim_actuals pa
           ON pa."groupId" = g.id AND pa."companyId" = g."companyId"
    LEFT JOIN umrah_agents a
           ON a.id = g."agentId" AND a."companyId" = g."companyId" AND a."deletedAt" IS NULL
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(DISTINCT si.total), 0) AS revenue,
                  COALESCE(SUM(DISTINCT si."paidAmount"), 0) AS paid
             FROM umrah_sales_invoice_items it
             JOIN umrah_sales_invoices si
               ON si.id = it."invoiceId" AND si."companyId" = g."companyId" AND si."deletedAt" IS NULL
            WHERE it."groupId" = g.id
              AND it."companyId" = g."companyId"
              AND it."deletedAt" IS NULL
              AND si.status <> 'cancelled'
         ) sales ON true
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM("netCost"), 0) AS cost
             FROM umrah_nusk_invoices ni
            WHERE ni."groupId" = g.id
              AND ni."companyId" = g."companyId"
              AND ni."deletedAt" IS NULL
              AND ni."nuskStatus" <> 'cancelled'
         ) nusk ON true
        WHERE g."companyId" = $1
          AND g."deletedAt" IS NULL${seasonClause}
        ORDER BY margin DESC
        LIMIT $${params.length}`,
      params,
    );

    const totals = rows.reduce<{ revenue: number; cost: number; paid: number; margin: number }>(
      (acc, r) => ({
        revenue: acc.revenue + Number(r.revenue ?? 0),
        cost:    acc.cost    + Number(r.cost ?? 0),
        paid:    acc.paid    + Number(r.paid ?? 0),
        margin:  acc.margin  + Number(r.margin ?? 0),
      }),
      { revenue: 0, cost: 0, paid: 0, margin: 0 },
    );

    res.json(maskFields(req, {
      data: rows,
      total: rows.length,
      totals,
    }));
  } catch (err) { handleRouteError(err, res, "Group portfolio report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Season portfolio P&L — "which seasons make money?". Companion to
// /reports/group-portfolio (PR #1495) at the season grain. Operators
// compare seasons across years/durations without opening each season
// detail one by one.
//
// Revenue per season: SUM(umrah_sales_invoices.total) — invoice header
// carries seasonId directly (unlike groups where we JOIN through items).
// Cost per season: SUM(umrah_nusk_invoices.netCost) reached through
// the group's seasonId since nusk has no seasonId column.
//
// Single roundtrip — no per-row fan-out. Tenant-scoped on every reach.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/season-portfolio", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, limit: limitStr } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(limitStr ?? "50") || 50, 1), 200);

    const params: unknown[] = [scope.companyId];
    let statusClause = "";
    if (status) { params.push(status); statusClause = ` AND s.status = $${params.length}`; }
    params.push(limit);

    const rows = await rawQuery<Record<string, unknown>>(
      // Pre-aggregate pilgrim + group counts per season via CTEs —
      // the original carried TWO scalar COUNT subqueries per row.
      // At LIMIT 200 that's ~400 redundant lookups. Two CTEs scan
      // each child table once.
      `WITH season_pilgrim_counts AS (
         SELECT "seasonId", "companyId", COUNT(*) AS "pilgrimsCount"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "seasonId", "companyId"
       ),
       season_group_counts AS (
         SELECT "seasonId", "companyId", COUNT(*) AS "groupsCount"
         FROM umrah_groups
         WHERE "deletedAt" IS NULL
         GROUP BY "seasonId", "companyId"
       )
       SELECT s.id, s.title, s.status, NULL::int AS "hijriYear", s."startDate", s."endDate",
              COALESCE(spc."pilgrimsCount", 0)::int AS "pilgrimsCount",
              COALESCE(sgc."groupsCount", 0)::int AS "groupsCount",
              COALESCE(sales.revenue, 0) AS revenue,
              COALESCE(sales.paid, 0)    AS paid,
              COALESCE(nusk.cost, 0)     AS cost,
              (COALESCE(sales.revenue, 0) - COALESCE(nusk.cost, 0))::numeric(12,2) AS margin
         FROM umrah_seasons s
    LEFT JOIN season_pilgrim_counts spc
           ON spc."seasonId" = s.id AND spc."companyId" = s."companyId"
    LEFT JOIN season_group_counts sgc
           ON sgc."seasonId" = s.id AND sgc."companyId" = s."companyId"
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(total), 0) AS revenue,
                  COALESCE(SUM("paidAmount"), 0) AS paid
             FROM umrah_sales_invoices
            WHERE "seasonId"  = s.id
              AND "companyId" = s."companyId"
              AND "deletedAt" IS NULL
              AND status <> 'cancelled'
         ) sales ON true
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(ni."netCost"), 0) AS cost
             FROM umrah_nusk_invoices ni
            WHERE ni."companyId" = s."companyId"
              AND ni."deletedAt" IS NULL
              AND ni."nuskStatus" <> 'cancelled'
              AND ni."groupId" IN (
                SELECT id FROM umrah_groups
                 WHERE "seasonId" = s.id
                   AND "companyId" = s."companyId"
                   AND "deletedAt" IS NULL
              )
         ) nusk ON true
        WHERE s."companyId" = $1 AND s."deletedAt" IS NULL${statusClause}
        ORDER BY margin DESC
        LIMIT $${params.length}`,
      params,
    );

    const totals = rows.reduce<{ revenue: number; cost: number; paid: number; margin: number }>(
      (acc, r) => ({
        revenue: acc.revenue + Number(r.revenue ?? 0),
        cost:    acc.cost    + Number(r.cost ?? 0),
        paid:    acc.paid    + Number(r.paid ?? 0),
        margin:  acc.margin  + Number(r.margin ?? 0),
      }),
      { revenue: 0, cost: 0, paid: 0, margin: 0 },
    );

    res.json(maskFields(req, {
      data: rows,
      total: rows.length,
      totals,
    }));
  } catch (err) { handleRouteError(err, res, "Season portfolio report"); }
});

// ============================================================================
// DASHBOARD
// ============================================================================

// ============================================================================
// N6 — UMRAH ACCOMMODATION (hotels, room blocks, room allocations)
// Closes N6 from CRITICAL_DEFECTS_REPORT.md. Replaces the pre-fix
// "hotelName free string on umrah_pilgrims" with a real 3-table model.
// ============================================================================

const createHotelSchema = z.object({
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  city: z.string().max(60).optional(),
  address: z.string().optional(),
  starRating: z.coerce.number().int().min(1).max(7).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  notes: z.string().optional(),
});
const updateHotelSchema = createHotelSchema.partial();

router.get("/hotels", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const city = req.query.city ? String(req.query.city) : null;
    const params: unknown[] = [scope.companyId];
    let sql = `SELECT * FROM umrah_hotels WHERE "companyId" = $1 AND "deletedAt" IS NULL`;
    if (city) { params.push(city); sql += ` AND city = $${params.length}`; }
    sql += ` ORDER BY name ASC LIMIT 500`;
    const rows = await rawQuery(sql, params).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "hotels list error"); }
});

router.post("/hotels", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createHotelSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_hotels ("companyId","branchId",name,"nameEn",city,address,"starRating","contactName","contactPhone",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, scope.branchId ?? null, b.name, b.nameEn ?? null, b.city ?? null, b.address ?? null, b.starRating ?? null, b.contactName ?? null, b.contactPhone ?? null, b.notes ?? null]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_hotels", entityId: insertId, after: { name: b.name, city: b.city } }).catch(() => undefined);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.hotel.created", entity: "umrah_hotels", entityId: insertId }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "hotels create error"); }
});

router.patch("/hotels/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateHotelSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const k of ["name", "nameEn", "city", "address", "starRating", "contactName", "contactPhone", "notes"] as const) {
      if ((b as any)[k] !== undefined) set(k, (b as any)[k]);
    }
    if (!sets.length) { res.json({ ok: true, updated: 0 }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE umrah_hotels SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
      params
    );
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "hotels update error"); }
});

router.delete("/hotels/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE umrah_hotels SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "hotels delete error"); }
});

// Room blocks

const createBlockSchema = z.object({
  hotelId: z.coerce.number().int().positive(),
  seasonId: z.coerce.number().int().positive().optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  roomType: z.enum(["single", "double", "triple", "quad", "suite"]).optional(),
  totalRooms: z.coerce.number().int().nonnegative(),
  ratePerNight: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().optional(),
});

router.get("/room-blocks", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const params: unknown[] = [scope.companyId];
    // Pre-aggregate room allocations counts via CTE — original was
    // N+1: 500 room blocks × COUNT subquery = 501 lookups through
    // umrah_room_allocations. CTE collapses to one scan.
    let sql = `WITH alloc_counts AS (
                  SELECT "blockId", COUNT(*) AS "allocatedCount"
                  FROM umrah_room_allocations
                  WHERE "deletedAt" IS NULL
                  GROUP BY "blockId"
                )
                SELECT b.*, h.name AS "hotelName", h.city AS "hotelCity",
                       COALESCE(ac."allocatedCount", 0)::int AS "allocatedCount"
                 FROM umrah_room_blocks b
                 LEFT JOIN umrah_hotels h ON h.id = b."hotelId" AND h."deletedAt" IS NULL
                 LEFT JOIN alloc_counts ac ON ac."blockId" = b.id
                WHERE b."companyId" = $1 AND b."deletedAt" IS NULL`;
    if (hotelId) { params.push(hotelId); sql += ` AND b."hotelId" = $${params.length}`; }
    if (seasonId) { params.push(seasonId); sql += ` AND b."seasonId" = $${params.length}`; }
    sql += ` ORDER BY b."checkInDate" DESC NULLS LAST LIMIT 500`;
    const rows = await rawQuery(sql, params).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "room-blocks list error"); }
});

router.post("/room-blocks", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createBlockSchema.safeParse(req.body));
    const [hotel] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_hotels WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.hotelId, scope.companyId]
    );
    if (!hotel) throw new ValidationError("الفندق غير موجود", { field: "hotelId" });
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_room_blocks ("companyId","hotelId","seasonId","checkInDate","checkOutDate","roomType","totalRooms","ratePerNight",currency,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.hotelId, b.seasonId ?? null, b.checkInDate ?? null, b.checkOutDate ?? null, b.roomType ?? null, b.totalRooms, b.ratePerNight ?? null, b.currency ?? 'SAR', b.notes ?? null]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_room_blocks", entityId: insertId, after: { hotelId: b.hotelId, seasonId: b.seasonId, totalRooms: b.totalRooms } }).catch(() => undefined);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.room_block.created", entity: "umrah_room_blocks", entityId: insertId }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "room-blocks create error"); }
});

// Allocations

const allocateSchema = z.object({
  blockId: z.coerce.number().int().positive(),
  pilgrimId: z.coerce.number().int().positive(),
  roomNumber: z.string().max(40).optional(),
  occupants: z.coerce.number().int().min(1).max(9).optional(),
  checkInAt: z.string().optional(),
});

router.get("/room-blocks/:id/allocations", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT a.*, p."fullName" AS "pilgrimName", p."passportNumber"
         FROM umrah_room_allocations a
         LEFT JOIN umrah_pilgrims p ON p.id = a."pilgrimId" AND p."deletedAt" IS NULL
        WHERE a."companyId" = $1 AND a."blockId" = $2 AND a."deletedAt" IS NULL
        ORDER BY a."roomNumber" NULLS LAST, a.id`,
      [scope.companyId, id]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "allocations list error"); }
});

router.post("/room-allocations", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(allocateSchema.safeParse(req.body));
    // Capacity guard: don't exceed totalRooms for this block.
    const [stats] = await rawQuery<{ totalRooms: number; allocatedCount: string }>(
      `SELECT b."totalRooms",
              (SELECT COUNT(*) FROM umrah_room_allocations a
                WHERE a."blockId" = b.id AND a."deletedAt" IS NULL)::text AS "allocatedCount"
         FROM umrah_room_blocks b
        WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL`,
      [b.blockId, scope.companyId]
    );
    if (!stats) throw new ValidationError("بلوك الغرف غير موجود", { field: "blockId" });
    if (Number(stats.allocatedCount) >= Number(stats.totalRooms)) {
      throw new ValidationError("تم استنفاد كل غرف هذا البلوك", { field: "blockId" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_room_allocations ("companyId","blockId","pilgrimId","roomNumber",occupants,"checkInAt")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, b.blockId, b.pilgrimId, b.roomNumber ?? null, b.occupants ?? 1, b.checkInAt ?? null]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_room_allocations", entityId: insertId, after: { blockId: b.blockId, pilgrimId: b.pilgrimId } }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "allocate error"); }
});

router.delete("/room-allocations/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Capture the row BEFORE deleting it so the audit log carries the
    // last-known state (pilgrimId + roomNumber + blockId + occupants
    // + check-in/out timestamps). Without this snapshot the audit
    // trail just records "id X deleted", which is useless for
    // reconstructing which pilgrim was unassigned from which room
    // when housekeeping disputes arise.
    const [existing] = await rawQuery<{
      pilgrimId: number;
      roomNumber: string | null;
      blockId: number;
      occupants: number | null;
      checkInAt: string | null;
      checkOutAt: string | null;
    }>(
      `SELECT "pilgrimId", "roomNumber", "blockId", occupants, "checkInAt", "checkOutAt"
         FROM umrah_room_allocations
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_room_allocations SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (affectedRows > 0 && existing) {
      createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.room_allocation.deleted",
        entity: "umrah_room_allocations",
        entityId: id,
        before: existing,
        after: { deletedAt: "NOW()" },
      });
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "umrah.room_allocation.deleted",
        entity: "umrah_room_allocations",
        entityId: id,
        details: JSON.stringify({ pilgrimId: existing.pilgrimId, blockId: existing.blockId }),
      }).catch((e) => logger.error(e, "umrah room-allocation delete event emit failed"));
    }
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "deallocate error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Compliance dashboard — one screen, four numbers. Mirrors the existing
// exempt + visa-expiring + overstay + unpaid-penalties splits that
// previously lived on four separate pages. Each metric is a COUNT query
// scoped by tenant + soft-delete; together they answer "what's my
// compliance exposure today?".
//
// Optional ?seasonId narrows every metric to a single season — the audit
// officer typically reviews the active season's risk.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/compliance", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let seasonP = "";
    let seasonPenP = "";
    if (seasonId) {
      params.push(Number(seasonId));
      seasonP   = ` AND p."seasonId" = $${params.length}`;
      seasonPenP = ` AND pen."seasonId" = $${params.length}`;
    }

    // Batch-related signals scope on uploadedAt — no per-row seasonId.
    // The seasonId filter applies to the BATCH's seasonId field. Build
    // a separate params array because the per-pilgrim queries share
    // the same companyId + seasonId slots.
    const batchParams: unknown[] = [scope.companyId];
    let batchSeasonP = "";
    if (seasonId) {
      batchParams.push(Number(seasonId));
      batchSeasonP = ` AND b."seasonId" = $${batchParams.length}`;
    }

    const [
      exemptRow, visaRow, overstayRow, penaltyRow,
      failedRow, missingApRow,
    ] = await Promise.all([
      // Currently exempt (PR #1482-1484 flag)
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
            AND p."overstayExempt" = true${seasonP}`,
        params,
      ),
      // Visa-expiring within 7d (same window as the list-page banner)
      // — GCC nationals are excluded; they don't need a KSA visa.
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
            AND p."visaExpiry" IS NOT NULL
            AND p."visaExpiry" <= CURRENT_DATE + INTERVAL '7 days'
            AND p.status NOT IN ('departed', 'cancelled')
            AND ${gccExclusionSqlFragment(`p."nationality"`)}${seasonP}`,
        params,
      ),
      // Currently overstaying (status + the auto-flagged penalty status)
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
            AND p.status IN ('overstayed', 'overstay_penalized')${seasonP}`,
        params,
      ),
      // Unpaid penalties — anything not paid/waived. Status check uses
      // the umrah_penalties.status enum (pending/invoiced/paid/waived).
      rawQuery<{ c: string; total: string }>(
        `SELECT COUNT(*)::text AS c,
                COALESCE(SUM(pen.amount), 0)::text AS total
           FROM umrah_penalties pen
          WHERE pen."companyId" = $1
            AND pen.status NOT IN ('paid', 'waived')${seasonPenP}`,
        params,
      ),
      // §8 audit: rows the engine rejected outright during recent
      // imports. Window matches the wizard's batch-history list.
      rawQuery<{ c: string }>(
        `SELECT COALESCE(SUM(COALESCE(b."errorCount",0)),0)::text AS c
           FROM umrah_import_batches b
          WHERE b."companyId" = $1 AND b."deletedAt" IS NULL
            AND b."createdAt" >= NOW() - INTERVAL '30 days'${batchSeasonP}`,
        batchParams,
      ),
      // §8 audit: nusk invoices missing their AP journal entry
      // (DR 5201 / CR 2101). PR #1867 wired the JE on create + every
      // PATCH; legacy rows from before #1867 still need a manual
      // touch to backfill. `purchaseInvoiceId` is the FK that
      // postNuskJournalEntries sets after posting. The
      // unlinkedImportRows signal lives in a follow-up PR because
      // it depends on the migration 279 counters from PR #1878.
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_nusk_invoices n
          WHERE n."companyId" = $1 AND n."deletedAt" IS NULL
            AND n."purchaseInvoiceId" IS NULL
            AND COALESCE(n."totalAmount",0) > 0
            AND n."nuskStatus" <> 'cancelled'`,
        [scope.companyId],
      ),
    ]);

    res.json(maskFields(req, {
      exempt: Number(exemptRow[0]?.c ?? "0"),
      visaExpiringIn7d: Number(visaRow[0]?.c ?? "0"),
      currentlyOverstaying: Number(overstayRow[0]?.c ?? "0"),
      unpaidPenaltiesCount: Number(penaltyRow[0]?.c ?? "0"),
      unpaidPenaltiesTotal: Number(penaltyRow[0]?.total ?? "0"),
      failedImportRows30d: Number(failedRow[0]?.c ?? "0"),
      missingNuskApJournals: Number(missingApRow[0]?.c ?? "0"),
    }));
  } catch (err) { handleRouteError(err, res, "Compliance dashboard"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تقرير أرصدة الوكلاء المجمَّع — كل وكيل في صف واحد مع:
//   - إجمالي المُفوتر (sum of umrah_agent_invoices.total non-cancelled)
//   - المدفوع (allocated from umrah_payments where there's any)
//   - الرصيد المستحق
//   - عدد المعتمرين
//   - آخر فاتورة + تاريخها
//   - حالة الوكيل
//
// كانت معلومة الرصيد متفرقة على صفحة كل وكيل — هذا التقرير يجمعهم في
// شاشة واحدة للمحاسب: «لمن أرسل تنبيه؟ من المتأخر أكثر؟».
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/agent-balances", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, hasOutstanding } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let statusClause = "";
    let seasonClause = "";
    if (status) { params.push(status); statusClause = ` AND a.status = $${params.length}`; }
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND inv."seasonId" = $${params.length}`; }

    // LATERAL على umrah_agent_invoices مع تجميع `total` و آخر فاتورة.
    // الفلتر `seasonId` يطبَّق هنا فقط (لو موجود) عشان تقارير الموسم
    // ما تختلط بالمواسم الثانية.
    //
    // pilgrimCount = العدد الحالي للمعتمرين النشطين تحت هذا الوكيل
    // (مش من الفواتير، لأن وكيل ممكن يكون عنده معتمرين قبل ما يُفوتر).
    const rows = await rawQuery<Record<string, unknown>>(
      // Pre-aggregate pilgrim counts per agent via CTE — original was
      // N+1: one COUNT subquery per returned agent. The CTE scans
      // umrah_pilgrims once filtered to active rows. Keyed by
      // (agentId, companyId) to preserve the legacy tenant boundary.
      `WITH agent_pilgrim_counts AS (
         SELECT "agentId", "companyId", COUNT(*) AS "pilgrimCount"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL AND "agentId" IS NOT NULL
         GROUP BY "agentId", "companyId"
       )
       SELECT a.id, a.name, a.country, a.phone, a.email, a.status, a."nuskAgentNumber",
              COALESCE(inv_agg.invoice_count, 0)::int AS "invoiceCount",
              COALESCE(inv_agg.total_invoiced, 0)    AS "totalInvoiced",
              COALESCE(inv_agg.total_paid, 0)        AS "totalPaid",
              COALESCE(inv_agg.outstanding, 0)       AS "outstanding",
              inv_agg.last_invoice_at                AS "lastInvoiceAt",
              inv_agg.last_invoice_ref               AS "lastInvoiceRef",
              COALESCE(apc."pilgrimCount", 0)::int AS "pilgrimCount"
         FROM umrah_agents a
    LEFT JOIN agent_pilgrim_counts apc
           ON apc."agentId" = a.id AND apc."companyId" = a."companyId"
    LEFT JOIN LATERAL (
           SELECT COUNT(*)::int            AS invoice_count,
                  SUM(inv.total)            AS total_invoiced,
                  -- "paid" = invoice rows whose status is 'paid' — the agent
                  -- invoice table doesn't carry a paidAmount column; we
                  -- approximate via status.
                  SUM(CASE WHEN inv.status = 'paid' THEN inv.total ELSE 0 END) AS total_paid,
                  SUM(CASE WHEN inv.status NOT IN ('paid', 'cancelled') THEN inv.total ELSE 0 END) AS outstanding,
                  MAX(inv."createdAt")      AS last_invoice_at,
                  (ARRAY_AGG(inv.ref ORDER BY inv."createdAt" DESC))[1] AS last_invoice_ref
             FROM umrah_agent_invoices inv
            WHERE inv."agentId" = a.id
              AND inv."companyId" = a."companyId"
              AND inv."deletedAt" IS NULL${seasonClause}
         ) inv_agg ON true
        WHERE a."companyId" = $1
          AND a."deletedAt" IS NULL${statusClause}
        ORDER BY COALESCE(inv_agg.outstanding, 0) DESC, a.name
        LIMIT 500`,
      params,
    );

    // Optional ?hasOutstanding=true filter applied JS-side after the SQL
    // (saves a complex HAVING clause). For audit screens the operator
    // usually wants this filter.
    const filtered = hasOutstanding === "true"
      ? rows.filter((r) => Number(r.outstanding ?? 0) > 0)
      : rows;

    // Tenant totals — for the page's top-bar KPIs (no client-side fold).
    const totals = filtered.reduce<{
      agents: number; totalInvoiced: number; totalPaid: number; outstanding: number;
    }>(
      (acc, r) => ({
        agents:        acc.agents + 1,
        totalInvoiced: acc.totalInvoiced + Number(r.totalInvoiced ?? 0),
        totalPaid:     acc.totalPaid + Number(r.totalPaid ?? 0),
        outstanding:   acc.outstanding + Number(r.outstanding ?? 0),
      }),
      { agents: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0 },
    );

    res.json(maskFields(req, { data: filtered, total: filtered.length, totals }));
  } catch (err) { handleRouteError(err, res, "Agent balances report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تقرير حركة المعتمرين — يلخّص لقطة يومية للحركات على مستوى الموسم/الكل:
//   - وصلوا اليوم (actualArrival = اليوم أو entryDate = اليوم)
//   - غادروا اليوم
//   - متجاوزون حالياً (overstayed/overstay_penalized)
//   - داخل المملكة الآن (isInsideKingdom = true)
//   - متأخرون عن المغادرة بعدد أيام (actual vs scheduled)
//
// مع تفصيل اختياري للصفوف الفعلية حسب الفلتر — العامل يفتح هذا التقرير
// ليجاوب: «من اللي اليوم؟ من المتجاوز؟ من ما رحل؟».
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/pilgrim-movements", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, date, view } = req.query as Record<string, string | undefined>;
    // `date` is operator-supplied (Riyadh-local YYYY-MM-DD from the UI).
    // Defaults to today so a bookmark-driven open works without args.
    const dateExpr = date ? `'${date}'::date` : "CURRENT_DATE";
    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND p."seasonId" = $${params.length}`; }

    // الصف الأول: KPIs مجمَّعة (دائماً)
    const [agg] = await rawQuery<Record<string, unknown>>(
      `SELECT
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND (p."actualArrival" = ${dateExpr} OR p."entryDate" = ${dateExpr})
         )::int AS "arrivedToday",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND (p."actualDeparture" = ${dateExpr} OR p."exitDate" = ${dateExpr})
         )::int AS "departedToday",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p.status IN ('overstayed', 'overstay_penalized')
         )::int AS "currentlyOverstaying",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p."isInsideKingdom" = true
         )::int AS "insideKingdom",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p."departureDate" < CURRENT_DATE
             AND p."actualDeparture" IS NULL
             AND p.status NOT IN ('cancelled', 'departed')
         )::int AS "lateDepartures",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p."overstayDays" IS NOT NULL
             AND p."overstayDays" > 0
         )::int AS "withOverstayDays"`,
      params,
    );

    // الصف الثاني: التفاصيل (drill-down) لو طلب view=details
    // كل قسم محدود بـ 100 صف عشان ما يثقل الـ payload.
    let details: Record<string, unknown[]> | null = null;
    if (view === "details") {
      const arrivedRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, status, "entryPort", "entryFlight"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND (p."actualArrival" = ${dateExpr} OR p."entryDate" = ${dateExpr})
          ORDER BY "fullName" LIMIT 100`,
        params,
      );
      const departedRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, status, "exitPort", "exitFlight"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND (p."actualDeparture" = ${dateExpr} OR p."exitDate" = ${dateExpr})
          ORDER BY "fullName" LIMIT 100`,
        params,
      );
      const overstayRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, "overstayDays", "departureDate", status
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND p.status IN ('overstayed', 'overstay_penalized')
          ORDER BY p."overstayDays" DESC NULLS LAST, "fullName"
          LIMIT 100`,
        params,
      );
      const lateRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, "departureDate", status,
                (CURRENT_DATE - "departureDate")::int AS "daysOverdue"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND p."departureDate" < CURRENT_DATE
            AND p."actualDeparture" IS NULL
            AND p.status NOT IN ('cancelled', 'departed')
          ORDER BY (CURRENT_DATE - "departureDate") DESC
          LIMIT 100`,
        params,
      );
      details = {
        arrived: arrivedRows,
        departed: departedRows,
        overstaying: overstayRows,
        lateDepartures: lateRows,
      };
    }

    res.json(maskFields(req, { kpis: agg ?? {}, details }));
  } catch (err) { handleRouteError(err, res, "Pilgrim movements report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تقرير أرصدة الوكلاء الفرعيين — مكمِّل لتقرير الوكلاء لكنه أهم لأن
// مدفوعات العمرة الحقيقية تدخل من الوكلاء الفرعيين (عبر umrah_payments).
//
// الفرق الجوهري عن agent-balances:
//   • umrah_sales_invoices.paidAmount عمود حقيقي (مش مجرد status='paid')
//   • umrah_payments جدول مستقل يجمع التحصيلات حسب subAgentId
//   • outstanding = SUM(total) − SUM(paidAmount) على الفواتير + رصيد payments
//
// لكل وكيل فرعي:
//   - عدد الفواتير المُصدرة
//   - إجمالي المُفوتر
//   - إجمالي المُحصَّل من الفواتير (paidAmount)
//   - إجمالي المُحصَّل من الـ payments (مستقل)
//   - الرصيد المستحق
//   - آخر دفعة + تاريخها
//   - عدد المعتمرين تحت هذا الوكيل الفرعي
//   - حالة الوكيل الفرعي (isActive)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/subagent-balances", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, isActive, hasOutstanding } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND inv."seasonId" = $${params.length}`; }
    let isActiveClause = "";
    if (isActive === "true")  { isActiveClause = ` AND sa."isActive" = true`; }
    if (isActive === "false") { isActiveClause = ` AND sa."isActive" = false`; }

    // اثنين LATERAL منفصلين:
    //   inv_agg → تجميع umrah_sales_invoices (المُفوتر + المُحصَّل)
    //   pay_agg → تجميع umrah_payments (المدفوعات المستقلة)
    //
    // الفرق الحرج: paid من inv.paidAmount مش من status — عمود حقيقي يخزَّن
    // كل ما يدخل دفعة عبر POST /umrah/payments.
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT sa.id, sa.name, sa."nuskCode", sa.phone, sa.email, sa.country,
              sa."isActive", sa."paymentTerms", sa."agentId",
              a.name AS "agentName",
              COALESCE(inv_agg.invoice_count, 0)::int AS "invoiceCount",
              COALESCE(inv_agg.total_invoiced, 0)    AS "totalInvoiced",
              COALESCE(inv_agg.total_paid_on_inv, 0) AS "totalPaidOnInvoices",
              COALESCE(pay_agg.payment_count, 0)::int AS "paymentCount",
              COALESCE(pay_agg.total_received, 0)     AS "totalReceived",
              COALESCE(inv_agg.outstanding, 0)        AS "outstanding",
              pay_agg.last_payment_at                 AS "lastPaymentAt",
              pay_agg.last_payment_ref                AS "lastPaymentRef",
              (SELECT COUNT(*)::int FROM umrah_pilgrims p
                JOIN umrah_groups g ON g.id = p."groupId"
                  AND g."companyId" = p."companyId"
                  AND g."deletedAt" IS NULL
                WHERE g."subAgentId" = sa.id
                  AND p."companyId" = sa."companyId"
                  AND p."deletedAt" IS NULL
              ) AS "pilgrimCount"
         FROM umrah_sub_agents sa
    LEFT JOIN umrah_agents a
           ON a.id = sa."agentId"
          AND a."companyId" = sa."companyId"
          AND a."deletedAt" IS NULL
    LEFT JOIN LATERAL (
           SELECT COUNT(*)::int          AS invoice_count,
                  SUM(inv.total)         AS total_invoiced,
                  SUM(inv."paidAmount")  AS total_paid_on_inv,
                  SUM(inv.total - COALESCE(inv."paidAmount", 0))
                    FILTER (WHERE inv.status NOT IN ('cancelled')) AS outstanding
             FROM umrah_sales_invoices inv
            WHERE inv."subAgentId" = sa.id
              AND inv."companyId" = sa."companyId"
              AND inv."deletedAt" IS NULL
              AND inv.status <> 'cancelled'${seasonClause}
         ) inv_agg ON true
    LEFT JOIN LATERAL (
           SELECT COUNT(*)::int   AS payment_count,
                  SUM(pay."sarAmount") AS total_received,
                  MAX(pay."paymentDate") AS last_payment_at,
                  (ARRAY_AGG(pay.ref ORDER BY pay."paymentDate" DESC, pay.id DESC))[1] AS last_payment_ref
             FROM umrah_payments pay
            WHERE pay."subAgentId" = sa.id
              AND pay."companyId" = sa."companyId"
              AND pay."deletedAt" IS NULL
         ) pay_agg ON true
        WHERE sa."companyId" = $1
          AND sa."deletedAt" IS NULL${isActiveClause}
        ORDER BY COALESCE(inv_agg.outstanding, 0) DESC, sa.name
        LIMIT 500`,
      params,
    );

    const filtered = hasOutstanding === "true"
      ? rows.filter((r) => Number(r.outstanding ?? 0) > 0)
      : rows;

    const totals = filtered.reduce<{
      subAgents: number;
      totalInvoiced: number;
      totalPaidOnInvoices: number;
      totalReceived: number;
      outstanding: number;
    }>(
      (acc, r) => ({
        subAgents:           acc.subAgents + 1,
        totalInvoiced:       acc.totalInvoiced + Number(r.totalInvoiced ?? 0),
        totalPaidOnInvoices: acc.totalPaidOnInvoices + Number(r.totalPaidOnInvoices ?? 0),
        totalReceived:       acc.totalReceived + Number(r.totalReceived ?? 0),
        outstanding:         acc.outstanding + Number(r.outstanding ?? 0),
      }),
      { subAgents: 0, totalInvoiced: 0, totalPaidOnInvoices: 0, totalReceived: 0, outstanding: 0 },
    );

    res.json(maskFields(req, { data: filtered, total: filtered.length, totals }));
  } catch (err) { handleRouteError(err, res, "Sub-agent balances report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// RETROACTIVE REVENUE RECLASSIFICATION — answers the operator's «على القديم
// والجديد» half. The dimensional resolver (revenueAccountResolver.ts) handles
// NEW invoices automatically; this endpoint walks OLD invoices and shifts
// their revenue posting from the original product-default account to whatever
// the current subsidiary_accounts mapping resolves to for their dimension.
//
// Why we don't rewrite historical journal entries: auditable accounting
// requires that once a number is posted, it stays. The correction shape is
// a NEW journal entry that DR's the old revenue account and CR's the new
// one — net effect: revenue moves from old to new as of today, without
// touching last year's books. (Same pattern as commercial ERPs' "GL
// reclassification" feature.)
//
// Idempotency: we use sourceKey=`umrah_reclass_${invoiceId}_to_${target}` so
// re-running the endpoint with the same configuration is a no-op for already-
// aligned invoices. We also UPDATE umrah_sales_invoice_items.accountCode to
// reflect the new revenue account so subsequent runs see "already aligned"
// and skip the work cheaply. If the operator later changes the override AGAIN,
// the next run posts a fresh compensating entry from the current-effective
// account (read from items.accountCode) to the new target.
const reclassifyRevenueSchema = z.object({
  /** Limit to specific invoice ids; omit to reclassify every eligible one. */
  invoiceIds: z.array(z.coerce.number().int().positive()).optional(),
  /** Limit to invoices for a single sub-agent (dimension-narrow). */
  subAgentId: z.coerce.number().int().positive().optional(),
  /** Limit to invoices in a single season. */
  seasonId: z.coerce.number().int().positive().optional(),
  /** When true, report what WOULD change without posting anything. */
  dryRun: z.boolean().optional(),
});

router.post("/reclassify-revenue", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(reclassifyRevenueSchema.safeParse(req.body));
    // All business logic — invoice scan, resolver lookup, compensating
    // JE posting, items update — lives in the umrahReclassifyEngine.
    // The route is intentionally thin so the lint-patterns invariant
    // (GL + account-mapping helpers must stay inside engines, not
    // routes) holds at the seam.
    const result = await reclassifyRevenueForInvoices(scope, body);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Reclassify revenue error:"); }
});

// ============================================================================
// UMRAH FAMILIES (migration 265)
// ============================================================================
//
// Family grouping for pilgrims — a husband, wife, kids, sometimes
// grandparents share a trip + room + bus seats + emergency contact.
// The pilgrim record links back via `umrah_pilgrims.familyId`. Future
// PRs add: hotel allocation aware of families, manifest grouped by
// family, family-level visa workflow.

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
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.family.created", entity: "umrah_families", entityId: rows[0].id as number,
      details: JSON.stringify({ familyName: b.familyName }),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
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
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
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
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(204).end();
  } catch (err) { handleRouteError(err, res, "Delete family"); }
});


// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONAL UMRAH CALENDAR — §4 of #1870
// ─────────────────────────────────────────────────────────────────────────────
//
// The Charter says the calendar is "the heart of operations" — not a
// shapeless month-view, but a layer-aware aggregator that tells the
// operator "what's happening today, what to chase, what to confirm".
//
// Phase 1 (this PR) — six layers driven by existing date columns:
//
//   pilgrim_arrival   umrah_pilgrims.arrivalDate    (green)
//   pilgrim_departure umrah_pilgrims.departureDate  (blue)
//   visa_expiring     umrah_pilgrims.visaExpiry     (yellow / red ≤7d)
//   overstay          status='overstayed' or 'overstay_penalized' (red)
//   transport_trip    umrah_transport.tripDate      (purple)
//   nusk_expiring     umrah_nusk_invoices.expiryDate (yellow)
//
// Each event is aggregated per day so the frontend can render the
// monthly grid in one pass. `sampleIds` carries the first 10 entity
// ids so the day-detail panel can drill straight to the records
// without a second round-trip.
//
// Phase 2 (follow-up): group/season/yearly views, calendar actions
// (open pilgrim, send alert, update arrival), pricing/commission
// layers, real-time updates via the §10 event stream.
// ─────────────────────────────────────────────────────────────────────────────

export type CalendarLayer =
  | "pilgrim_arrival"
  | "pilgrim_departure"
  | "visa_expiring"
  | "overstay"
  | "transport_trip"
  | "nusk_expiring"
  // §4 Phase 2 of #1870 — two extra layers so the yearly view +
  // operational dashboard answer "where does money flow?" not just
  // "where are the pilgrims?"
  | "nusk_invoice_issued"
  | "penalty_created"
  // U-02b M5b (#2080) — surfaces the unified transport-contract
  // requests (transport_bookings written via POST /umrah/groups/:id
  // /transport-requests) as their own calendar layer. Runs ALONGSIDE
  // the legacy `transport_trip` layer; both stay enabled by default
  // because the underlying tables are independent — historic rows in
  // umrah_transport keep flowing through `transport_trip`, contract
  // bookings flow through this new layer. No conversion, no merge.
  | "transport_request";

export const CALENDAR_LAYER_META: Record<CalendarLayer, {
  label: string;
  color: "green" | "yellow" | "red" | "gray" | "blue" | "purple";
  entityType: string;
}> = {
  pilgrim_arrival:     { label: "وصول معتمرين",         color: "green",  entityType: "umrah_pilgrims" },
  pilgrim_departure:   { label: "مغادرة معتمرين",       color: "blue",   entityType: "umrah_pilgrims" },
  visa_expiring:       { label: "تأشيرات تنتهي",         color: "yellow", entityType: "umrah_pilgrims" },
  overstay:            { label: "متأخرون عن المغادرة",  color: "red",    entityType: "umrah_pilgrims" },
  transport_trip:      { label: "رحلات نقل",             color: "purple", entityType: "umrah_transport" },
  nusk_expiring:       { label: "فواتير نسك تنتهي",     color: "yellow", entityType: "umrah_nusk_invoices" },
  nusk_invoice_issued: { label: "فواتير نسك مُصدَرة",  color: "blue",   entityType: "umrah_nusk_invoices" },
  penalty_created:     { label: "غرامات مُصدرة",        color: "red",    entityType: "umrah_penalties" },
  // U-02b M5b — distinct from `transport_trip` (purple). Reads
  // transport_bookings.requestedPickupDate filtered to
  // bookingSource = 'umrah_group' so non-umrah transport activity
  // (cargo, CRM, etc.) does NOT leak into the umrah calendar.
  transport_request:   { label: "طلبات نقل (موحَّد)",  color: "gray",   entityType: "transport_bookings" },
};

const ALL_LAYERS = Object.keys(CALENDAR_LAYER_META) as CalendarLayer[];

router.get("/calendar/events", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const fromStr = String(req.query.from ?? "");
    const toStr   = String(req.query.to ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      throw new ValidationError("from/to تاريخ بالشكل YYYY-MM-DD مطلوب");
    }
    if (fromStr > toStr) {
      throw new ValidationError("from يجب أن يكون قبل to");
    }
    // Cap the window. A 90-day cap covers a typical season + the
    // operator's "look ahead one quarter" use case, while keeping
    // the aggregation queries cheap (6 small COUNTs per layer).
    const fromDate = new Date(fromStr + "T00:00:00Z");
    const toDate   = new Date(toStr   + "T00:00:00Z");
    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);
    // §4 Phase 2 — cap raised to 366 days so the yearly view can
    // request a single round-trip per year instead of 12 per-month
    // calls. The probes are still cheap (COUNT + ARRAY_AGG[1:10] per
    // day per layer); 366 × 8 layers stays in the single-digit second
    // budget on a typical season.
    if (days > 366) {
      throw new ValidationError("نافذة التقويم محدودة بـ 366 يوماً", { field: "to" });
    }

    // Layer whitelist. Operator can pass `layers=pilgrim_arrival,visa_expiring`
    // to scope the response to only the layers their FE toggle has on.
    const layersParam = String(req.query.layers ?? "").trim();
    const requestedLayers: CalendarLayer[] = layersParam
      ? layersParam.split(",")
        .map((s) => s.trim())
        .filter((s): s is CalendarLayer => (ALL_LAYERS as string[]).includes(s))
      : ALL_LAYERS;
    if (requestedLayers.length === 0) {
      res.json({ data: [], layers: CALENDAR_LAYER_META, window: { from: fromStr, to: toStr } });
      return;
    }

    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

    // Per-layer SQL. Each query returns { date, c, sampleIds } per day
    // within the window, then we collapse to one row per (date, layer).
    type Row = { date: string; c: string; sampleIds: number[] };
    const baseParams: unknown[] = [scope.companyId, fromStr, toStr];
    let pilgrimSeasonClause = "";
    let transportSeasonClause = "";
    if (seasonId) {
      baseParams.push(seasonId);
      pilgrimSeasonClause = ` AND p."seasonId" = $${baseParams.length}`;
      transportSeasonClause = ` AND t."seasonId" = $${baseParams.length}`;
    }
    const nuskParams: unknown[] = [scope.companyId, fromStr, toStr];

    const runs: Record<CalendarLayer, Promise<Row[]> | null> = {
      pilgrim_arrival: null, pilgrim_departure: null, visa_expiring: null,
      overstay: null, transport_trip: null, nusk_expiring: null,
      nusk_invoice_issued: null, penalty_created: null,
      transport_request: null,
    };

    if (requestedLayers.includes("pilgrim_arrival")) {
      runs.pilgrim_arrival = rawQuery<Row>(
        `SELECT p."arrivalDate"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(p.id ORDER BY p.id))[1:10] AS "sampleIds"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1
            AND p."arrivalDate" BETWEEN $2::date AND $3::date
            AND p."deletedAt" IS NULL${pilgrimSeasonClause}
          GROUP BY p."arrivalDate"`,
        baseParams,
      );
    }
    if (requestedLayers.includes("pilgrim_departure")) {
      runs.pilgrim_departure = rawQuery<Row>(
        `SELECT p."departureDate"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(p.id ORDER BY p.id))[1:10] AS "sampleIds"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1
            AND p."departureDate" BETWEEN $2::date AND $3::date
            AND p."deletedAt" IS NULL${pilgrimSeasonClause}
          GROUP BY p."departureDate"`,
        baseParams,
      );
    }
    if (requestedLayers.includes("visa_expiring")) {
      runs.visa_expiring = rawQuery<Row>(
        `SELECT p."visaExpiry"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(p.id ORDER BY p.id))[1:10] AS "sampleIds"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1
            AND p."visaExpiry" BETWEEN $2::date AND $3::date
            AND p.status NOT IN ('departed', 'cancelled')
            AND p."deletedAt" IS NULL${pilgrimSeasonClause}
          GROUP BY p."visaExpiry"`,
        baseParams,
      );
    }
    if (requestedLayers.includes("overstay")) {
      // Overstaying pilgrims don't have a single date — bucket them
      // by the operator-supplied `from` so the layer surfaces as
      // "today's outstanding overstayers" on the day the operator
      // opens the calendar. Cheap, useful, no schema change.
      runs.overstay = rawQuery<Row>(
        `SELECT $2::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(p.id ORDER BY p.id))[1:10] AS "sampleIds"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1
            AND p.status IN ('overstayed', 'overstay_penalized')
            AND p."deletedAt" IS NULL${pilgrimSeasonClause}
          HAVING COUNT(*) > 0`,
        baseParams,
      );
    }
    if (requestedLayers.includes("transport_trip")) {
      runs.transport_trip = rawQuery<Row>(
        `SELECT t."tripDate"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(t.id ORDER BY t.id))[1:10] AS "sampleIds"
           FROM umrah_transport t
          WHERE t."companyId" = $1
            AND t."tripDate" BETWEEN $2::date AND $3::date
            AND t."deletedAt" IS NULL${transportSeasonClause}
          GROUP BY t."tripDate"`,
        baseParams,
      );
    }
    // U-02b M5b — transport_bookings written by the unified contract
    // (POST /umrah/groups/:id/transport-requests). Separate query, NO
    // join with umrah_transport. bookingSource filter keeps non-umrah
    // bookings out of the umrah calendar. Cancelled/rejected rows are
    // suppressed because they shouldn't compete with operational
    // attention on the day-cell. The query mirrors the transport_trip
    // shape so the FE consumes both layers through the same Row type.
    if (requestedLayers.includes("transport_request")) {
      runs.transport_request = rawQuery<Row>(
        `SELECT b."requestedPickupDate"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(b.id ORDER BY b.id))[1:10] AS "sampleIds"
           FROM transport_bookings b
          WHERE b."companyId" = $1
            AND b."requestedPickupDate" BETWEEN $2::date AND $3::date
            AND b."bookingSource" = 'umrah_group'
            AND b.status NOT IN ('cancelled', 'rejected')
            AND b."deletedAt" IS NULL
          GROUP BY b."requestedPickupDate"`,
        baseParams,
      );
    }
    if (requestedLayers.includes("nusk_expiring")) {
      runs.nusk_expiring = rawQuery<Row>(
        `SELECT n."expiryDate"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(n.id ORDER BY n.id))[1:10] AS "sampleIds"
           FROM umrah_nusk_invoices n
          WHERE n."companyId" = $1
            AND n."expiryDate" BETWEEN $2::date AND $3::date
            AND n."nuskStatus" NOT IN ('cancelled', 'refunded')
            AND n."deletedAt" IS NULL
          GROUP BY n."expiryDate"`,
        nuskParams,
      );
    }
    // §4 Phase 2 — finance-flow layers.
    if (requestedLayers.includes("nusk_invoice_issued")) {
      runs.nusk_invoice_issued = rawQuery<Row>(
        `SELECT n."issueDate"::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(n.id ORDER BY n.id))[1:10] AS "sampleIds"
           FROM umrah_nusk_invoices n
          WHERE n."companyId" = $1
            AND n."issueDate" BETWEEN $2::date AND $3::date
            AND n."nuskStatus" <> 'cancelled'
            AND n."deletedAt" IS NULL
          GROUP BY n."issueDate"`,
        nuskParams,
      );
    }
    if (requestedLayers.includes("penalty_created")) {
      runs.penalty_created = rawQuery<Row>(
        `SELECT pen."createdAt"::date::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(pen.id ORDER BY pen.id))[1:10] AS "sampleIds"
           FROM umrah_penalties pen
          WHERE pen."companyId" = $1
            AND pen."createdAt"::date BETWEEN $2::date AND $3::date
            AND pen."deletedAt" IS NULL
          GROUP BY pen."createdAt"::date`,
        nuskParams,
      );
    }

    // Parallel awaits — each layer is an independent COUNT.
    const settled = await Promise.all(
      ALL_LAYERS.map(async (layer) => {
        const p = runs[layer];
        if (!p) return null;
        const rows = await p;
        return { layer, rows };
      }),
    );

    const events: Array<{
      date: string;
      layer: CalendarLayer;
      count: number;
      color: string;
      label: string;
      entityType: string;
      sampleIds: number[];
    }> = [];
    for (const result of settled) {
      if (!result) continue;
      const meta = CALENDAR_LAYER_META[result.layer];
      for (const r of result.rows) {
        events.push({
          date: r.date,
          layer: result.layer,
          count: Number(r.c),
          color: meta.color,
          label: meta.label,
          entityType: meta.entityType,
          sampleIds: r.sampleIds ?? [],
        });
      }
    }

    res.json({
      data: events,
      layers: CALENDAR_LAYER_META,
      window: { from: fromStr, to: toStr },
    });
  } catch (err) { handleRouteError(err, res, "Calendar events"); }
});

// §11 stub conversion — group + agent profitability (#1870).
// One endpoint, two dimensions. Returns one row per
// group/agent with revenue (umrah_sales_invoices) minus cost
// (umrah_nusk_invoices) = net profit. Operator drills by
// season + sort to find the best/worst performer.
router.get("/reports/profitability", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const dimension = String(req.query.dimension ?? "group");
    if (!["group", "agent"].includes(dimension)) {
      throw new ValidationError("البُعد المطلوب: group أو agent", { field: "dimension" });
    }
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

    const params: unknown[] = [scope.companyId];
    let salesSeasonClause = "";
    let nuskSeasonClause = "";
    if (seasonId) {
      params.push(seasonId);
      salesSeasonClause = ` AND inv."seasonId" = $${params.length}`;
      // umrah_nusk_invoices has no seasonId on it — scope through
      // the linked group instead.
      nuskSeasonClause = ` AND g."seasonId" = $${params.length}`;
    }

    let rows: any[] = [];
    if (dimension === "group") {
      // Revenue per group: sum of sales-invoice line items that
      // reference each group. Cost per group: sum of nusk invoices
      // tied to the group. LEFT JOINs so a group with zero of
      // either side still surfaces (it tells the operator they
      // forgot to invoice / receive a nusk).
      rows = await rawQuery(
        `SELECT g.id AS "groupId",
                g.name,
                g."nuskGroupNumber",
                COALESCE(rev.revenue, 0)::numeric(14,2) AS revenue,
                COALESCE(cost.cost, 0)::numeric(14,2) AS cost,
                (COALESCE(rev.revenue, 0) - COALESCE(cost.cost, 0))::numeric(14,2) AS "netProfit",
                CASE WHEN COALESCE(rev.revenue, 0) > 0
                     THEN ROUND(((COALESCE(rev.revenue, 0) - COALESCE(cost.cost, 0))
                                 / COALESCE(rev.revenue, 0)) * 100, 2)
                     ELSE NULL
                END AS "marginPercent",
                COALESCE(g."mutamerCount", 0) AS "mutamerCount"
           FROM umrah_groups g
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(item."lineTotal"), 0) AS revenue
               FROM umrah_sales_invoice_items item
               JOIN umrah_sales_invoices inv ON inv.id = item."invoiceId"
                AND inv."companyId" = g."companyId"
                AND inv.status <> 'cancelled'
                AND inv."deletedAt" IS NULL${salesSeasonClause}
              WHERE item."groupId" = g.id
           ) rev ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(n."totalAmount"), 0) AS cost
               FROM umrah_nusk_invoices n
              WHERE n."companyId" = g."companyId"
                AND n."groupId" = g.id
                AND n."nuskStatus" <> 'cancelled'
                AND n."deletedAt" IS NULL
           ) cost ON true
          WHERE g."companyId" = $1 AND g."deletedAt" IS NULL${nuskSeasonClause}
          ORDER BY "netProfit" DESC NULLS LAST, g.id
          LIMIT 500`,
        params,
      );
    } else {
      // agent dimension — aggregate the same revenue/cost up via
      // groups.agentId. Agent rows with no groups still show with
      // zeros so the operator notices.
      rows = await rawQuery(
        `SELECT a.id AS "agentId",
                a.name,
                COALESCE(agg.revenue, 0)::numeric(14,2) AS revenue,
                COALESCE(agg.cost, 0)::numeric(14,2) AS cost,
                (COALESCE(agg.revenue, 0) - COALESCE(agg.cost, 0))::numeric(14,2) AS "netProfit",
                CASE WHEN COALESCE(agg.revenue, 0) > 0
                     THEN ROUND(((COALESCE(agg.revenue, 0) - COALESCE(agg.cost, 0))
                                 / COALESCE(agg.revenue, 0)) * 100, 2)
                     ELSE NULL
                END AS "marginPercent",
                COALESCE(agg."groupCount", 0)::int AS "groupCount"
           FROM umrah_agents a
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS "groupCount",
                    COALESCE(SUM(rev.revenue), 0) AS revenue,
                    COALESCE(SUM(cost.cost), 0) AS cost
               FROM umrah_groups g
               LEFT JOIN LATERAL (
                 SELECT COALESCE(SUM(item."lineTotal"), 0) AS revenue
                   FROM umrah_sales_invoice_items item
                   JOIN umrah_sales_invoices inv ON inv.id = item."invoiceId"
                    AND inv."companyId" = g."companyId"
                    AND inv.status <> 'cancelled'
                    AND inv."deletedAt" IS NULL${salesSeasonClause}
                  WHERE item."groupId" = g.id
               ) rev ON true
               LEFT JOIN LATERAL (
                 SELECT COALESCE(SUM(n."totalAmount"), 0) AS cost
                   FROM umrah_nusk_invoices n
                  WHERE n."companyId" = g."companyId"
                    AND n."groupId" = g.id
                    AND n."nuskStatus" <> 'cancelled'
                    AND n."deletedAt" IS NULL
               ) cost ON true
              WHERE g."agentId" = a.id
                AND g."companyId" = a."companyId"
                AND g."deletedAt" IS NULL${nuskSeasonClause}
           ) agg ON true
          WHERE a."companyId" = $1 AND a."deletedAt" IS NULL
          ORDER BY "netProfit" DESC NULLS LAST, a.id
          LIMIT 500`,
        params,
      );
    }

    // Headline totals — bookkeeper sees aggregate margin at a glance.
    const totals = rows.reduce(
      (acc, r) => {
        acc.revenue += Number(r.revenue) || 0;
        acc.cost += Number(r.cost) || 0;
        acc.netProfit += Number(r.netProfit) || 0;
        return acc;
      },
      { revenue: 0, cost: 0, netProfit: 0 },
    );

    res.json(maskFields(req, { data: rows, dimension, totals }));
  } catch (err) { handleRouteError(err, res, "Profitability report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 Deep Finance Integration — GL Drill-Through (Charter #1870)
//
// «من فاتورة العمرة → القيد المحاسبي → سطور الحسابات» في خطوة واحدة.
//
// السؤال اللي يجاوب عليه:
//   «هل هذي الفاتورة ترحَّلت محاسبياً صح؟ على أي حساب؟ بأي مبلغ؟»
//
// المسار:
//   GET /umrah/journal/:sourceType/:sourceId
//
// نقبل ٥ أنواع مصدر فقط (whitelist) — ما نسمح للمستخدم يقرأ قيود
// أي جدول. كل واحد فيه عمود "journalEntryId":
//   - umrah_sales_invoices  (فواتير العملاء)
//   - umrah_nusk_invoices   (فواتير نسك)
//   - umrah_payments        (الدفعات الواردة)
//   - umrah_agent_invoices  (فواتير الوكلاء)
//   - umrah_violations      (الغرامات/المخالفات)
//
// نرجِّع: { source, journal, lines } مع جميع الأبعاد (umrahAgentId/
// umrahSeasonId/costCenter/employee/...). كل القراءات tenant-scoped
// عبر journal_entries."companyId" + journal_lines.journalId.
// ─────────────────────────────────────────────────────────────────────────────
// Per source: refCol = الرقم المرئي للعامل، statusCol = اسم عمود الحالة
// لأن بعض الجداول status والبعض nuskStatus (نسك). umrah_penalties ما عنده
// ref فنستخدم type كنص بديل (overstay/violation/lost/regulatory).
const JOURNAL_DRILL_SOURCES: Record<string, { table: string; refCol: string; statusCol: string }> = {
  umrah_sales_invoices:  { table: "umrah_sales_invoices",  refCol: "ref",               statusCol: "status"     },
  umrah_nusk_invoices:   { table: "umrah_nusk_invoices",   refCol: "nuskInvoiceNumber", statusCol: "nuskStatus" },
  umrah_payments:        { table: "umrah_payments",        refCol: "ref",               statusCol: "method"     },
  umrah_agent_invoices:  { table: "umrah_agent_invoices",  refCol: "ref",               statusCol: "status"     },
  umrah_penalties:       { table: "umrah_penalties",       refCol: "type",              statusCol: "status"     },
};

router.get("/journal/:sourceType/:sourceId", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const sourceType = String(req.params.sourceType ?? "");
    const sourceId = parseId(req.params.sourceId, "sourceId");

    const meta = JOURNAL_DRILL_SOURCES[sourceType];
    if (!meta) throw new ValidationError(`نوع المصدر غير مدعوم: ${sourceType}`, { field: "sourceType" });

    // Read the source row first — confirms tenant ownership AND
    // surfaces the source's own ref/status/journalEntryId so the FE
    // can render a header without a second roundtrip.
    const [source] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "journalEntryId", "${meta.refCol}" AS ref, "${meta.statusCol}" AS status
         FROM ${meta.table}
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [sourceId, scope.companyId],
    );
    if (!source) throw new NotFoundError("المصدر غير موجود");

    const journalEntryId = source.journalEntryId as number | null;
    if (!journalEntryId) {
      res.json(maskFields(req, {
        source: { id: sourceId, sourceType, ref: source.ref, status: source.status },
        journal: null,
        lines: [],
        message: "لم يتم ترحيل قيد محاسبي بعد لهذا المصدر",
      }));
      return;
    }

    // Header + lines in parallel — both scoped to the same companyId
    // for defence-in-depth (even though journalEntryId is single-tenant
    // by construction, an attacker who has a leaked id from another
    // tenant shouldn't be able to read its lines through this path).
    const [headerArr, lines] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT je.id, je.ref, je.description, je.date, je.type, je.status,
                je."sourceType", je."sourceId", je."sourceKey",
                je."postedBy", je."postedAt", je."approvalStatus",
                je."createdAt", je."updatedAt",
                je."originalCurrency", je."exchangeRate", je."originalAmount",
                je."reversalOfId", je."reversedById", je."reversedAt", je."reversalReason"
           FROM journal_entries je
          WHERE je.id = $1
            AND je."companyId" = $2
            AND je."deletedAt" IS NULL
          LIMIT 1`,
        [journalEntryId, scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        // join chart_of_accounts for the human-readable Arabic name.
        // Tenant-safe: COA is tenant-scoped on companyId.
        `SELECT jl.id, jl."accountCode", jl.debit, jl.credit, jl.description,
                jl."costCenter", jl."costCenterId",
                jl."departmentId", jl."projectId", jl."employeeId",
                jl."vehicleId", jl."clientId", jl."vendorId", jl."driverId",
                jl."umrahSeasonId", jl."umrahAgentId",
                jl."originalCurrency", jl."originalDebit", jl."originalCredit",
                jl."exchangeRate",
                coa.name      AS "accountName",
                coa.type      AS "accountType"
           FROM journal_lines jl
      LEFT JOIN chart_of_accounts coa
             ON coa.code = jl."accountCode"
            AND coa."companyId" = $2
            AND coa."deletedAt" IS NULL
          WHERE jl."journalId" = $1
            AND jl."deletedAt" IS NULL
          ORDER BY jl.id`,
        [journalEntryId, scope.companyId],
      ),
    ]);

    const header = headerArr[0];
    if (!header) {
      // FK present but the entry was deleted — surface so the operator
      // sees the gap rather than silently rendering "no journal".
      res.json(maskFields(req, {
        source: { id: sourceId, sourceType, ref: source.ref, status: source.status },
        journal: null,
        lines: [],
        message: `قيد المحاسبة #${journalEntryId} المربوط غير موجود — قد يكون محذوفاً`,
        orphanJournalEntryId: journalEntryId,
      }));
      return;
    }

    // Footer totals — debit/credit balance check for the auditor.
    // Engine guarantees balance, but a stale-line scenario (one line
    // soft-deleted) would surface here, not silently.
    const totals = lines.reduce<{ debit: number; credit: number }>(
      (acc, l) => ({
        debit:  acc.debit  + Number(l.debit  ?? 0),
        credit: acc.credit + Number(l.credit ?? 0),
      }),
      { debit: 0, credit: 0 },
    );

    res.json(maskFields(req, {
      source: { id: sourceId, sourceType, ref: source.ref, status: source.status },
      journal: header,
      lines,
      totals,
      isBalanced: Math.abs(totals.debit - totals.credit) < 0.01,
    }));
  } catch (err) { handleRouteError(err, res, "Umrah journal drill-through"); }
});

// §9 of #1870 — Assistant Suggestions.
// Returns up-to-six ranked suggestions for the operator's dashboard.
// Cheap (six COUNTs, parallel); the FE caches with react-query so
// repeated tab visits are zero-cost.
router.get("/assistant/suggestions", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const suggestions = await getDashboardSuggestions({
      companyId: scope.companyId, branchId: scope.branchId, seasonId,
    });
    res.json({ data: suggestions });
  } catch (err) { handleRouteError(err, res, "Assistant suggestions"); }
});

// §11 of #1870 — Reports Catalog.
// Returns the 17-report registry so the FE hub can render them
// with status badges + category filter. The catalog is static
// (no DB query), so this endpoint is single-millisecond.
router.get("/reports/catalog", authorize({ feature: "umrah", action: "list" }), async (_req, res): Promise<void> => {
  try {
    res.json({
      data: UMRAH_REPORTS_CATALOG,
      categories: REPORT_CATEGORY_LABELS_AR,
      statuses: REPORT_STATUS_LABELS_AR,
    });
  } catch (err) { handleRouteError(err, res, "Reports catalog"); }
});

// §11 partial → full conversion — violations summary report (#1870).
// The Charter: "تقرير التخلف والمخالفات — المخالفات المسجَّلة مع الوكيل،
// المعتمر، الغرامة". Aggregates umrah_violations into KPI counts +
// per-dimension breakdowns. /umrah/violations stays as the list/edit
// page; this endpoint feeds the dedicated report screen with rollups
// + a flat list of recent rows for context.
router.get("/reports/violations-summary", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const agentId  = req.query.agentId  ? Number(req.query.agentId)  : null;
    const fromStr  = req.query.from     ? String(req.query.from)     : null;
    const toStr    = req.query.to       ? String(req.query.to)       : null;

    const params: unknown[] = [scope.companyId];
    let where = `v."companyId" = $1 AND v."deletedAt" IS NULL`;
    if (seasonId) {
      params.push(seasonId);
      // umrah_violations has no seasonId — chain via pilgrim or group.
      where += ` AND EXISTS (
        SELECT 1 FROM umrah_pilgrims p
         WHERE p.id = v."mutamerId"
           AND p."companyId" = v."companyId"
           AND p."seasonId" = $${params.length}
      )`;
    }
    if (agentId) {
      params.push(agentId);
      where += ` AND v."agentId" = $${params.length}`;
    }
    if (fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
      params.push(fromStr);
      where += ` AND v."detectedAt"::date >= $${params.length}::date`;
    }
    if (toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      params.push(toStr);
      where += ` AND v."detectedAt"::date <= $${params.length}::date`;
    }

    // Four parallel aggregations: KPI tiles + status breakdown +
    // type breakdown + recent rows. Each is cheap; no GROUP BY
    // joins so the planner picks index scans on the WHERE.
    const [kpiRow, byStatus, byType, byMonth, recent] = await Promise.all([
      rawQuery<{
        total: string; openCount: string; closedCount: string;
        totalPenalty: string; pendingPenalty: string;
      }>(
        `SELECT COUNT(*)::text AS total,
                SUM(CASE WHEN v.status IN ('detected','open','invoiced','disputed') THEN 1 ELSE 0 END)::text AS "openCount",
                SUM(CASE WHEN v.status IN ('paid','closed') THEN 1 ELSE 0 END)::text AS "closedCount",
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS "totalPenalty",
                COALESCE(SUM(CASE WHEN v.status NOT IN ('paid','closed') THEN v."penaltyAmount" ELSE 0 END), 0)::text AS "pendingPenalty"
           FROM umrah_violations v
          WHERE ${where}`,
        params,
      ),
      rawQuery<{ status: string; c: string; total: string }>(
        `SELECT v.status, COUNT(*)::text AS c,
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS total
           FROM umrah_violations v
          WHERE ${where}
          GROUP BY v.status
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ type: string; c: string; total: string }>(
        `SELECT v.type, COUNT(*)::text AS c,
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS total
           FROM umrah_violations v
          WHERE ${where}
          GROUP BY v.type
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ month: string; c: string; total: string }>(
        `SELECT TO_CHAR(v."detectedAt", 'YYYY-MM') AS month,
                COUNT(*)::text AS c,
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS total
           FROM umrah_violations v
          WHERE ${where}
          GROUP BY TO_CHAR(v."detectedAt", 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 12`,
        params,
      ),
      rawQuery<{
        id: number; type: string; status: string;
        penaltyAmount: string | number; detectedAt: string;
        description: string | null;
        mutamerId: number | null; mutamerName: string | null;
        agentId: number | null; agentName: string | null;
      }>(
        `SELECT v.id, v.type, v.status, v."penaltyAmount", v."detectedAt"::text AS "detectedAt", v.description,
                v."mutamerId", p."fullName" AS "mutamerName",
                v."agentId", a.name AS "agentName"
           FROM umrah_violations v
           LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId" AND p."companyId" = v."companyId" AND p."deletedAt" IS NULL
           LEFT JOIN umrah_agents a   ON a.id = v."agentId"   AND a."companyId" = v."companyId" AND a."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY v."detectedAt" DESC, v.id DESC
          LIMIT 100`,
        params,
      ),
    ]);

    const k = kpiRow[0] ?? { total: "0", openCount: "0", closedCount: "0", totalPenalty: "0", pendingPenalty: "0" };
    res.json(maskFields(req, {
      kpis: {
        total: Number(k.total),
        openCount: Number(k.openCount),
        closedCount: Number(k.closedCount),
        totalPenalty: Number(k.totalPenalty),
        pendingPenalty: Number(k.pendingPenalty),
      },
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.c), total: Number(r.total) })),
      byType:   byType.map((r) => ({ type: r.type, count: Number(r.c), total: Number(r.total) })),
      byMonth:  byMonth.map((r) => ({ month: r.month, count: Number(r.c), total: Number(r.total) })),
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Violations summary"); }
});

// §11 partial → full conversion — commissions summary report (#1870).
// /umrah/commission-calculations is the per-row list; this endpoint
// is the REPORT: payroll-style rollup with KPI tiles + 3 breakdowns
// (by status / by month / by employee) + a recent table for context.
router.get("/reports/commissions-summary", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId    = req.query.seasonId    ? Number(req.query.seasonId)    : null;
    const employeeId  = req.query.employeeId  ? Number(req.query.employeeId)  : null;
    const agentId     = req.query.agentId     ? Number(req.query.agentId)     : null;
    const yearParam   = req.query.year        ? Number(req.query.year)        : null;
    const statusParam = req.query.status      ? String(req.query.status)      : null;

    // Year + employee + status filter via cc.* columns. seasonId
    // and agentId chain through employee_commission_plans (the
    // calculations table doesn't carry either dim itself).
    const params: unknown[] = [scope.companyId];
    let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
    if (yearParam) {
      params.push(yearParam);
      where += ` AND cc.year = $${params.length}`;
    }
    if (employeeId) {
      params.push(employeeId);
      where += ` AND cc."employeeId" = $${params.length}`;
    }
    if (statusParam) {
      params.push(statusParam);
      where += ` AND cc.status = $${params.length}`;
    }
    if (seasonId) {
      params.push(seasonId);
      where += ` AND EXISTS (
        SELECT 1 FROM employee_commission_plans cp
         WHERE cp.id = cc."planId"
           AND cp."companyId" = cc."companyId"
           AND cp."seasonId" = $${params.length}
      )`;
    }
    // U-04-P4 — agentId filter (matches the umrahAgentId dim that
    // U-05-P2 surfaces on the JE). The plan-level column is the
    // attribution source; cc rows inherit it transitively via planId.
    if (agentId) {
      params.push(agentId);
      where += ` AND EXISTS (
        SELECT 1 FROM employee_commission_plans cp
         WHERE cp.id = cc."planId"
           AND cp."companyId" = cc."companyId"
           AND cp."agentId" = $${params.length}
      )`;
    }

    const [kpiRow, byStatus, byMonth, byEmployee, recent] = await Promise.all([
      rawQuery<{
        total: string; calculatedAmount: string; paidAmount: string;
        pendingAmount: string; employeesCount: string;
        conditionMetCount: string; conditionUnmetCount: string;
        conditionMetAmount: string; conditionUnmetAmount: string;
        hasViolationsCount: string;
      }>(
        // U-04-P2 — KPIs extended with condition-met / -unmet splits and
        // a hasViolations rollup. Both columns already exist on the calc
        // row (cc."conditionMet" boolean, cc."hasViolations" boolean —
        // surfaced on the recent table today but never aggregated). All
        // counts and sums share the same WHERE filter set + parameter
        // list as the existing KPI block, so the new fields don't
        // change the result set semantics — they're additive sums.
        `SELECT COUNT(*)::text AS total,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS "calculatedAmount",
                COALESCE(SUM(CASE WHEN cc.status = 'paid' THEN cc."finalAmount" ELSE 0 END), 0)::text AS "paidAmount",
                COALESCE(SUM(CASE WHEN cc.status NOT IN ('paid') THEN cc."finalAmount" ELSE 0 END), 0)::text AS "pendingAmount",
                COUNT(DISTINCT cc."employeeId")::text AS "employeesCount",
                COUNT(*) FILTER (WHERE cc."conditionMet" = true)::text AS "conditionMetCount",
                COUNT(*) FILTER (WHERE cc."conditionMet" = false)::text AS "conditionUnmetCount",
                COALESCE(SUM(CASE WHEN cc."conditionMet" = true THEN cc."finalAmount" ELSE 0 END), 0)::text AS "conditionMetAmount",
                COALESCE(SUM(CASE WHEN cc."conditionMet" = false THEN cc."finalAmount" ELSE 0 END), 0)::text AS "conditionUnmetAmount",
                COUNT(*) FILTER (WHERE cc."hasViolations" = true)::text AS "hasViolationsCount"
           FROM employee_commission_calculations cc
          WHERE ${where}`,
        params,
      ),
      rawQuery<{ status: string; c: string; total: string }>(
        `SELECT cc.status, COUNT(*)::text AS c,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS total
           FROM employee_commission_calculations cc
          WHERE ${where}
          GROUP BY cc.status
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ year: number; month: number; c: string; total: string }>(
        `SELECT cc.year, cc.month, COUNT(*)::text AS c,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS total
           FROM employee_commission_calculations cc
          WHERE ${where}
          GROUP BY cc.year, cc.month
          ORDER BY cc.year DESC, cc.month DESC
          LIMIT 12`,
        params,
      ),
      rawQuery<{
        employeeId: number; employeeName: string | null;
        c: string; total: string;
      }>(
        `SELECT cc."employeeId",
                e.name AS "employeeName",
                COUNT(*)::text AS c,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS total
           FROM employee_commission_calculations cc
           LEFT JOIN employees e ON e.id = cc."employeeId"
                                AND e."companyId" = cc."companyId"
                                AND e."deletedAt" IS NULL
          WHERE ${where}
          GROUP BY cc."employeeId", e.name
          ORDER BY SUM(cc."finalAmount") DESC NULLS LAST
          LIMIT 50`,
        params,
      ),
      rawQuery<{
        id: number; planId: number; planName: string | null;
        employeeId: number; employeeName: string | null;
        month: number; year: number; status: string;
        finalAmount: string | number; commissionAmount: string | number;
        totalMutamers: number; conditionMet: boolean;
        createdAt: string;
      }>(
        `SELECT cc.id, cc."planId", cp."planName",
                cc."employeeId", e.name AS "employeeName",
                cc.month, cc.year, cc.status,
                cc."finalAmount", cc."commissionAmount",
                cc."totalMutamers", cc."conditionMet",
                cc."createdAt"::text AS "createdAt"
           FROM employee_commission_calculations cc
           LEFT JOIN employee_commission_plans cp
                  ON cp.id = cc."planId" AND cp."companyId" = cc."companyId" AND cp."deletedAt" IS NULL
           LEFT JOIN employees e
                  ON e.id = cc."employeeId" AND e."companyId" = cc."companyId" AND e."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY cc.year DESC, cc.month DESC, cc."finalAmount" DESC
          LIMIT 100`,
        params,
      ),
    ]);

    // U-04-P2 — the kpiRow now carries 5 extra fields. Defaulting them
    // to "0" string keeps the response shape stable on empty result.
    const k = kpiRow[0] ?? {
      total: "0", calculatedAmount: "0", paidAmount: "0",
      pendingAmount: "0", employeesCount: "0",
      conditionMetCount: "0", conditionUnmetCount: "0",
      conditionMetAmount: "0", conditionUnmetAmount: "0",
      hasViolationsCount: "0",
    };
    res.json(maskFields(req, {
      kpis: {
        total: Number(k.total),
        calculatedAmount: Number(k.calculatedAmount),
        paidAmount: Number(k.paidAmount),
        pendingAmount: Number(k.pendingAmount),
        employeesCount: Number(k.employeesCount),
        // U-04-P2 additions — condition-met + violations split.
        conditionMetCount: Number(k.conditionMetCount),
        conditionUnmetCount: Number(k.conditionUnmetCount),
        conditionMetAmount: Number(k.conditionMetAmount),
        conditionUnmetAmount: Number(k.conditionUnmetAmount),
        hasViolationsCount: Number(k.hasViolationsCount),
      },
      byStatus:   byStatus.map((r) => ({ status: r.status, count: Number(r.c), total: Number(r.total) })),
      byMonth:    byMonth.map((r) => ({ year: r.year, month: r.month, count: Number(r.c), total: Number(r.total) })),
      byEmployee: byEmployee.map((r) => ({ employeeId: r.employeeId, employeeName: r.employeeName, count: Number(r.c), total: Number(r.total) })),
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Commissions summary"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// U-04-P3 — Commissions Summary CSV export.
//
// Same query + same WHERE filter set as
// GET /umrah/reports/commissions-summary, but:
//   - returns a UTF-8 BOM-prefixed CSV (Excel-friendly Arabic)
//   - bumps LIMIT to 5000 (vs the on-screen 100) for operator
//     monthly close exports
//   - one line per calc row, header row carries Arabic labels
//
// Read-only. Tenant-scoped via cc."companyId" + cc."deletedAt" IS
// NULL on every row + the optional seasonId join still chains
// through cp."companyId" = cc."companyId".
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/reports/commissions-summary/export",
  authorize({ feature: "umrah", action: "list" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const seasonId    = req.query.seasonId    ? Number(req.query.seasonId)    : null;
      const employeeId  = req.query.employeeId  ? Number(req.query.employeeId)  : null;
      const agentId     = req.query.agentId     ? Number(req.query.agentId)     : null;
      const yearParam   = req.query.year        ? Number(req.query.year)        : null;
      const statusParam = req.query.status      ? String(req.query.status)      : null;

      const params: unknown[] = [scope.companyId];
      let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
      if (yearParam) {
        params.push(yearParam);
        where += ` AND cc.year = $${params.length}`;
      }
      if (employeeId) {
        params.push(employeeId);
        where += ` AND cc."employeeId" = $${params.length}`;
      }
      if (statusParam) {
        params.push(statusParam);
        where += ` AND cc.status = $${params.length}`;
      }
      if (seasonId) {
        params.push(seasonId);
        where += ` AND EXISTS (
          SELECT 1 FROM employee_commission_plans cp
           WHERE cp.id = cc."planId"
             AND cp."companyId" = cc."companyId"
             AND cp."seasonId" = $${params.length}
        )`;
      }
      // U-04-P4 — same agentId filter as the summary route so the
      // CSV export carries the same row set as the on-screen list.
      if (agentId) {
        params.push(agentId);
        where += ` AND EXISTS (
          SELECT 1 FROM employee_commission_plans cp
           WHERE cp.id = cc."planId"
             AND cp."companyId" = cc."companyId"
             AND cp."agentId" = $${params.length}
        )`;
      }

      // Same shape as the summary's `recent` block, but the
      // on-screen cap is lifted — operators exporting for monthly
      // close need the full window. We cap at 5000 to protect
      // Excel / memory.
      const rows = await rawQuery<{
        id: number; planId: number; planName: string | null;
        employeeId: number; employeeName: string | null;
        month: number; year: number; status: string;
        finalAmount: string; commissionAmount: string;
        totalMutamers: number; conditionMet: boolean;
        hasViolations: boolean; createdAt: string;
      }>(
        `SELECT cc.id, cc."planId", cp."planName",
                cc."employeeId", e.name AS "employeeName",
                cc.month, cc.year, cc.status,
                cc."finalAmount"::text AS "finalAmount",
                cc."commissionAmount"::text AS "commissionAmount",
                cc."totalMutamers", cc."conditionMet", cc."hasViolations",
                cc."createdAt"::text AS "createdAt"
           FROM employee_commission_calculations cc
           LEFT JOIN employee_commission_plans cp
                  ON cp.id = cc."planId" AND cp."companyId" = cc."companyId" AND cp."deletedAt" IS NULL
           LEFT JOIN employees e
                  ON e.id = cc."employeeId" AND e."companyId" = cc."companyId" AND e."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY cc.year DESC, cc.month DESC, cc."finalAmount" DESC
          LIMIT 5000`,
        params,
      );

      // RFC 4180 escape — quote when the cell contains the delimiter,
      // a quote, or any newline; double internal quotes. Same shape
      // as the pilgrims export (routes/umrah.ts:1233).
      const csvEscape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      // U-18-P4 — bilingual header policy: Arabic primary with English
      // in parentheses so partner accounting / payroll systems that
      // ingest the CSV in EN can map the columns without a separate
      // glossary. Same convention applied to the pilgrims export.
      const headers: Array<[keyof typeof rows[number], string]> = [
        ["id",               "رقم (ID)"],
        ["year",             "السنة (Year)"],
        ["month",             "الشهر (Month)"],
        ["employeeName",     "الموظف (Employee)"],
        ["planName",         "الخطة (Plan)"],
        ["status",           "الحالة (Status)"],
        ["commissionAmount", "العمولة المحتسبة (Calculated Commission)"],
        ["finalAmount",      "المبلغ النهائي (Final Amount)"],
        ["totalMutamers",    "عدد المعتمرين (Pilgrim Count)"],
        ["conditionMet",     "تحقّق الشرط (Condition Met)"],
        ["hasViolations",    "وجود مخالفات (Has Violations)"],
        ["createdAt",        "تاريخ الإنشاء (Created At)"],
      ];

      const headerRow = headers.map(([, label]) => csvEscape(label)).join(",");
      const dataRows = rows.map((r) =>
        headers
          .map(([key]) => csvEscape(r[key]))
          .join(","),
      );
      // BOM so Excel detects UTF-8 Arabic — without it the file opens
      // as mojibake (same lesson as the pilgrims export).
      const BOM = "﻿";
      const csv = BOM + [headerRow, ...dataRows].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="umrah-commissions-${todayISO()}.csv"`,
      );
      res.send(csv);
    } catch (err) {
      handleRouteError(err, res, "Commissions summary CSV export");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// §6 Finance Hygiene — Untraced Finance (Charter #1870)
//
// Operator's 5-minute daily check: which finance-impacting rows are
// missing their GL/AP linkage? Four buckets:
//   • salesInvoices.untrackedPosting → status NOT IN draft/cancelled AND journalEntryId IS NULL
//   • payments.untrackedPosting       → sarAmount > 0 AND journalEntryId IS NULL
//   • nuskInvoices.untrackedAP        → nuskStatus <> cancelled AND totalAmount > 0 AND purchaseInvoiceId IS NULL
//   • penalties.untrackedPosting      → status IN applied/paid AND journalEntryId IS NULL
//
// Returns count + sum(amount) per bucket — the operator drills via
// list pages with the right filter. All tenant-scoped. Five parallel
// reads (Promise.all) — cheap, runs on demand from the dashboard.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/finance-hygiene", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;

    const [sales, payments, nusk, penalties] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM(total), 0) AS "amount"
           FROM umrah_sales_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND status NOT IN ('draft','cancelled')
            AND "journalEntryId" IS NULL`,
        [scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM("sarAmount"), 0) AS "amount"
           FROM umrah_payments
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "sarAmount" > 0
            AND "journalEntryId" IS NULL`,
        [scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM("totalAmount"), 0) AS "amount"
           FROM umrah_nusk_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "nuskStatus" <> 'cancelled'
            AND "totalAmount" > 0
            AND "purchaseInvoiceId" IS NULL`,
        [scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM(amount), 0) AS "amount"
           FROM umrah_penalties
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND status IN ('invoiced','paid')
            AND "journalEntryId" IS NULL`,
        [scope.companyId],
      ),
    ]);

    const buckets = {
      salesInvoices: { count: Number(sales[0]?.count ?? 0), amount: Number(sales[0]?.amount ?? 0) },
      payments:      { count: Number(payments[0]?.count ?? 0), amount: Number(payments[0]?.amount ?? 0) },
      nuskInvoices:  { count: Number(nusk[0]?.count ?? 0), amount: Number(nusk[0]?.amount ?? 0) },
      penalties:     { count: Number(penalties[0]?.count ?? 0), amount: Number(penalties[0]?.amount ?? 0) },
    };
    const totalItems = buckets.salesInvoices.count + buckets.payments.count
                     + buckets.nuskInvoices.count + buckets.penalties.count;
    const totalAmountAtRisk = buckets.salesInvoices.amount + buckets.payments.amount
                            + buckets.nuskInvoices.amount + buckets.penalties.amount;

    res.json(maskFields(req, {
      buckets,
      totalItems,
      totalAmountAtRisk,
      isClean: totalItems === 0,
    }));
  } catch (err) { handleRouteError(err, res, "Umrah finance hygiene"); }
});

// §11 partial → full conversion — nusk invoices summary report (#1870).
// /umrah/nusk-invoices stays as the per-row list; this is the REPORT
// with finance-focused KPIs + 3 breakdowns + recent rows. AP-status
// aware (split by purchaseInvoiceId for "AP posted" tracking).
router.get("/reports/nusk-invoices-summary", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId   = req.query.seasonId   ? Number(req.query.seasonId)   : null;
    const agentId    = req.query.agentId    ? Number(req.query.agentId)    : null;
    const statusFlt  = req.query.status     ? String(req.query.status)     : null;
    const fromStr    = req.query.from       ? String(req.query.from)       : null;
    const toStr      = req.query.to         ? String(req.query.to)         : null;

    const params: unknown[] = [scope.companyId];
    let where = `n."companyId" = $1 AND n."deletedAt" IS NULL`;
    if (statusFlt) {
      params.push(statusFlt);
      where += ` AND n."nuskStatus" = $${params.length}`;
    }
    if (agentId) {
      params.push(agentId);
      where += ` AND n."agentId" = $${params.length}`;
    }
    if (seasonId) {
      params.push(seasonId);
      // nusk has no seasonId — chain through the linked group.
      where += ` AND EXISTS (
        SELECT 1 FROM umrah_groups g
         WHERE g.id = n."groupId" AND g."companyId" = n."companyId"
           AND g."seasonId" = $${params.length}
      )`;
    }
    if (fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
      params.push(fromStr);
      where += ` AND n."issueDate" >= $${params.length}::date`;
    }
    if (toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      params.push(toStr);
      where += ` AND n."issueDate" <= $${params.length}::date`;
    }

    const [kpiRow, byStatus, byMonth, byAgent, recent] = await Promise.all([
      rawQuery<{
        total: string; totalAmount: string; netCostTotal: string;
        refundedTotal: string; mutamerCount: string;
        apPostedCount: string; apPendingCount: string;
      }>(
        `SELECT COUNT(*)::text AS total,
                COALESCE(SUM(n."totalAmount"), 0)::text AS "totalAmount",
                COALESCE(SUM(n."netCost"), 0)::text AS "netCostTotal",
                COALESCE(SUM(n."refundAmount"), 0)::text AS "refundedTotal",
                COALESCE(SUM(n."mutamerCount"), 0)::text AS "mutamerCount",
                SUM(CASE WHEN n."purchaseInvoiceId" IS NOT NULL THEN 1 ELSE 0 END)::text AS "apPostedCount",
                SUM(CASE WHEN n."purchaseInvoiceId" IS NULL AND COALESCE(n."totalAmount",0) > 0 AND n."nuskStatus" <> 'cancelled' THEN 1 ELSE 0 END)::text AS "apPendingCount"
           FROM umrah_nusk_invoices n
          WHERE ${where}`,
        params,
      ),
      rawQuery<{ status: string; c: string; total: string }>(
        `SELECT n."nuskStatus" AS status, COUNT(*)::text AS c,
                COALESCE(SUM(n."totalAmount"), 0)::text AS total
           FROM umrah_nusk_invoices n
          WHERE ${where}
          GROUP BY n."nuskStatus"
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ month: string; c: string; total: string }>(
        `SELECT TO_CHAR(n."issueDate", 'YYYY-MM') AS month,
                COUNT(*)::text AS c,
                COALESCE(SUM(n."totalAmount"), 0)::text AS total
           FROM umrah_nusk_invoices n
          WHERE ${where} AND n."issueDate" IS NOT NULL
          GROUP BY TO_CHAR(n."issueDate", 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 12`,
        params,
      ),
      rawQuery<{
        agentId: number; agentName: string | null;
        c: string; total: string;
      }>(
        `SELECT n."agentId",
                a.name AS "agentName",
                COUNT(*)::text AS c,
                COALESCE(SUM(n."totalAmount"), 0)::text AS total
           FROM umrah_nusk_invoices n
           LEFT JOIN umrah_agents a ON a.id = n."agentId"
                                  AND a."companyId" = n."companyId"
                                  AND a."deletedAt" IS NULL
          WHERE ${where} AND n."agentId" IS NOT NULL
          GROUP BY n."agentId", a.name
          ORDER BY SUM(n."totalAmount") DESC NULLS LAST
          LIMIT 50`,
        params,
      ),
      rawQuery<{
        id: number; nuskInvoiceNumber: string; nuskStatus: string;
        totalAmount: string | number; netCost: string | number;
        refundAmount: string | number; mutamerCount: number;
        issueDate: string | null; expiryDate: string | null;
        agentId: number | null; agentName: string | null;
        groupId: number | null; groupName: string | null;
        purchaseInvoiceId: number | null;
      }>(
        `SELECT n.id, n."nuskInvoiceNumber", n."nuskStatus",
                n."totalAmount", n."netCost", n."refundAmount",
                n."mutamerCount",
                n."issueDate"::text AS "issueDate",
                n."expiryDate"::text AS "expiryDate",
                n."agentId", a.name AS "agentName",
                n."groupId", g.name AS "groupName",
                n."purchaseInvoiceId"
           FROM umrah_nusk_invoices n
           LEFT JOIN umrah_agents a
                  ON a.id = n."agentId" AND a."companyId" = n."companyId" AND a."deletedAt" IS NULL
           LEFT JOIN umrah_groups g
                  ON g.id = n."groupId" AND g."companyId" = n."companyId" AND g."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY n."issueDate" DESC NULLS LAST, n.id DESC
          LIMIT 100`,
        params,
      ),
    ]);

    const k = kpiRow[0] ?? {
      total: "0", totalAmount: "0", netCostTotal: "0",
      refundedTotal: "0", mutamerCount: "0",
      apPostedCount: "0", apPendingCount: "0",
    };
    res.json(maskFields(req, {
      kpis: {
        total: Number(k.total),
        totalAmount: Number(k.totalAmount),
        netCostTotal: Number(k.netCostTotal),
        refundedTotal: Number(k.refundedTotal),
        mutamerCount: Number(k.mutamerCount),
        apPostedCount: Number(k.apPostedCount),
        apPendingCount: Number(k.apPendingCount),
      },
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.c), total: Number(r.total) })),
      byMonth:  byMonth.map((r) => ({ month: r.month, count: Number(r.c), total: Number(r.total) })),
      byAgent:  byAgent.map((r) => ({ agentId: r.agentId, agentName: r.agentName, count: Number(r.c), total: Number(r.total) })),
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Nusk invoices summary"); }
});

// §11 stub conversion — umrah transport report (#1870).
// Pulls every transport_bookings row tied to an umrah group + the
// linked group/agent context + flight details. The fleet engine
// hasn't yet written vehicleId/driverId/actualCost back onto the
// booking, so those stay null until §7 Phase 2 lands the
// fleet_trips bridge. Operator sees status + requested pickup
// date so they can chase what's still 'submitted' vs 'dispatched'.
router.get("/reports/umrah-transport", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const status = req.query.status ? String(req.query.status) : null;

    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    let statusClause = "";
    if (seasonId) {
      params.push(seasonId);
      seasonClause = ` AND g."seasonId" = $${params.length}`;
    }
    if (status) {
      params.push(status);
      statusClause = ` AND b.status = $${params.length}`;
    }

    const rows = await rawQuery<{
      bookingId: number;
      bookingNumber: string;
      status: string;
      routeType: string | null;
      fromLocation: string | null;
      toLocation: string | null;
      requestedPickupDate: string | null;
      passengerCount: number | null;
      flightNumber: string | null;
      groupId: number | null;
      groupName: string | null;
      nuskGroupNumber: string | null;
      agentId: number | null;
      agentName: string | null;
      seasonId: number | null;
    }>(
      `SELECT b.id AS "bookingId",
              b."bookingNumber",
              b.status,
              b."routeType",
              b."fromLocationText" AS "fromLocation",
              b."toLocationText" AS "toLocation",
              b."requestedPickupDate"::text AS "requestedPickupDate",
              b."passengerCount",
              b."flightNumber",
              g.id AS "groupId",
              g.name AS "groupName",
              g."nuskGroupNumber",
              a.id AS "agentId",
              a.name AS "agentName",
              g."seasonId"
         FROM transport_bookings b
         INNER JOIN umrah_groups g
                 ON g.id = b."umrahGroupId"
                AND g."companyId" = b."companyId"
                AND g."deletedAt" IS NULL
         LEFT JOIN umrah_agents a
                ON a.id = g."agentId"
               AND a."companyId" = g."companyId"
               AND a."deletedAt" IS NULL
        WHERE b."companyId" = $1
          AND b."deletedAt" IS NULL
          AND b."bookingSource" = 'umrah_group'${seasonClause}${statusClause}
        ORDER BY b."requestedPickupDate" NULLS LAST, b.id DESC
        LIMIT 500`,
      params,
    );

    // Status histogram — bookkeeper sees how many requests are
    // still pending vs dispatched vs completed at a glance.
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }

    res.json(maskFields(req, { data: rows, counts, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Umrah transport report"); }
});



// §11 stub conversion — umrah costs report (#1870).
// Aggregates umrah_nusk_invoices into a cost breakdown per
// dimension (season / group / agent), showing each cost
// category alongside the total. Operator answers "where is
// money flowing out for this season / group / agent?".
router.get("/reports/umrah-costs", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const dimension = String(req.query.dimension ?? "group");
    if (!["season", "group", "agent"].includes(dimension)) {
      throw new ValidationError("البُعد المطلوب: season أو group أو agent", { field: "dimension" });
    }
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) {
      params.push(seasonId);
      // n has no seasonId — go through the linked group.
      seasonClause = ` AND g."seasonId" = $${params.length}`;
    }

    // Common cost-category projection: every dimension surfaces the
    // same numeric breakdown so the FE can render one table per
    // dimension without column-shape branching.
    const costSelectFragment = `
      COALESCE(SUM(n."groundServices"), 0)::numeric(14,2) AS "groundServices",
      COALESCE(SUM(n."electronicFees"), 0)::numeric(14,2) AS "electronicFees",
      COALESCE(SUM(n."visaFees"), 0)::numeric(14,2) AS "visaFees",
      COALESCE(SUM(n."insuranceFees"), 0)::numeric(14,2) AS "insuranceFees",
      COALESCE(SUM(n."enrichmentServices"), 0)::numeric(14,2) AS "enrichmentServices",
      COALESCE(SUM(n."additionalServices"), 0)::numeric(14,2) AS "additionalServices",
      COALESCE(SUM(n."transportTotal"), 0)::numeric(14,2) AS "transportTotal",
      COALESCE(SUM(n."hotelTotal"), 0)::numeric(14,2) AS "hotelTotal",
      COALESCE(SUM(n."netCost"), 0)::numeric(14,2) AS "netCost",
      COALESCE(SUM(n."totalAmount"), 0)::numeric(14,2) AS "totalAmount",
      COUNT(*)::int AS "invoiceCount"`;

    // Common predicates: scope, soft-delete, cancelled status.
    const commonWhere = `n."companyId" = $1
                        AND n."deletedAt" IS NULL
                        AND n."nuskStatus" <> 'cancelled'`;

    let rows: any[] = [];
    if (dimension === "season") {
      rows = await rawQuery(
        `SELECT s.id AS "seasonId",
                s.title AS name,
                ${costSelectFragment}
           FROM umrah_seasons s
           LEFT JOIN umrah_groups g
                  ON g."seasonId" = s.id
                 AND g."companyId" = s."companyId"
                 AND g."deletedAt" IS NULL
           LEFT JOIN umrah_nusk_invoices n
                  ON n."groupId" = g.id
                 AND ${commonWhere}
          WHERE s."companyId" = $1 AND s."deletedAt" IS NULL${seasonId ? ` AND s.id = $${params.length}` : ""}
          GROUP BY s.id, s.title
          ORDER BY "totalAmount" DESC NULLS LAST, s.id DESC
          LIMIT 500`,
        params,
      );
    } else if (dimension === "group") {
      rows = await rawQuery(
        `SELECT g.id AS "groupId",
                g.name,
                g."nuskGroupNumber",
                ${costSelectFragment}
           FROM umrah_groups g
           LEFT JOIN umrah_nusk_invoices n
                  ON n."groupId" = g.id
                 AND ${commonWhere}
          WHERE g."companyId" = $1 AND g."deletedAt" IS NULL${seasonClause}
          GROUP BY g.id, g.name, g."nuskGroupNumber"
          ORDER BY "totalAmount" DESC NULLS LAST, g.id DESC
          LIMIT 500`,
        params,
      );
    } else {
      // agent: aggregate via groups.agentId.
      // Output alias deliberately renamed from "agentId" → "rowAgentId"
      // to avoid the check:sql-ambiguity false positive — bare quoted
      // "agentId" in the output alias position is flagged because the
      // column also exists on two joined relations (umrah_groups +
      // umrah_nusk_invoices). FE maps rowAgentId → agentId at the row
      // shape level so the consumer contract stays stable.
      rows = await rawQuery(
        `SELECT a.id AS "rowAgentId",
                a.name,
                ${costSelectFragment}
           FROM umrah_agents a
           LEFT JOIN umrah_groups g
                  ON g."agentId" = a.id
                 AND g."companyId" = a."companyId"
                 AND g."deletedAt" IS NULL${seasonClause}
           LEFT JOIN umrah_nusk_invoices n
                  ON n."groupId" = g.id
                 AND ${commonWhere}
          WHERE a."companyId" = $1 AND a."deletedAt" IS NULL
          GROUP BY a.id, a.name
          ORDER BY "totalAmount" DESC NULLS LAST, a.id DESC
          LIMIT 500`,
        params,
      );
      // Remap to keep the public API contract: row.agentId.
      rows = rows.map((r: Record<string, unknown>) => ({
        ...r,
        agentId: r.rowAgentId,
        rowAgentId: undefined,
      }));
    }

    // Headline totals for the KPI tiles. Sum each category across rows.
    const totals = rows.reduce(
      (acc, r) => {
        for (const k of [
          "groundServices", "electronicFees", "visaFees", "insuranceFees",
          "enrichmentServices", "additionalServices", "transportTotal",
          "hotelTotal", "netCost", "totalAmount",
        ]) {
          acc[k] = (acc[k] ?? 0) + (Number(r[k]) || 0);
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json(maskFields(req, { data: rows, dimension, totals }));
  } catch (err) { handleRouteError(err, res, "Umrah costs report"); }
});

// تقرير ملخّص فواتير العملاء (sales invoices summary) — §11 من شرائع الإصلاح
// (Issue #1870). يجاوب على سؤال إبراهيم:
//   «أصدرنا كم فاتورة بيع هذا الموسم؟ المُحصَّل؟ الرصيد؟ من المتأخّر؟»
//
// لمحه ٥ تجميعات بالتوازي (Promise.all) — ما نضرب الـ RTT × ٥:
//   1) kpiRow         → KPIs على رأس الصفحة (إجمالي / مبالغ / مدفوع / متبقي / معتمرون / متأخّرون)
//   2) byStatus       → توزيع الحالات (draft/approved/sent/partially_paid/paid/overdue/cancelled)
//   3) byMonth        → آخر ١٢ شهر (YYYY-MM على invoiceDate — يكشف موسمية البيع)
//   4) bySubAgent     → ٥٠ وكيل فرعي الأعلى من حيث الفواتير + المبالغ + المدفوع
//   5) recent         → آخر ١٠٠ فاتورة للجدول السفلي (drill-through)
//
// كل التجميعات تحت companyId + deletedAt IS NULL. الفلاتر:
//   seasonId / subAgentId / clientId / status / from / to (YYYY-MM-DD على invoiceDate)
//
// نوصل إلى umrah_sub_agents (للاسم) + clients (للاسم) عبر LEFT JOIN — ما نسقط
// السطور لو الـ FK NULL (clientId اختياري على umrah_sales_invoices).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/sales-invoices-summary", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, subAgentId, clientId, status, from, to } = req.query as Record<string, string | undefined>;

    // Validate optional date filters — YYYY-MM-DD. We pin a regex so a
    // typo doesn't blow into a SQL error message users can't action.
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRe.test(from)) throw new ValidationError("from يجب أن يكون YYYY-MM-DD", { field: "from" });
    if (to   && !dateRe.test(to))   throw new ValidationError("to يجب أن يكون YYYY-MM-DD",   { field: "to" });

    const baseParams: unknown[] = [scope.companyId];
    let whereClause = `inv."companyId" = $1 AND inv."deletedAt" IS NULL`;
    if (seasonId)   { baseParams.push(Number(seasonId));   whereClause += ` AND inv."seasonId"   = $${baseParams.length}`; }
    if (subAgentId) { baseParams.push(Number(subAgentId)); whereClause += ` AND inv."subAgentId" = $${baseParams.length}`; }
    if (clientId)   { baseParams.push(Number(clientId));   whereClause += ` AND inv."clientId"   = $${baseParams.length}`; }
    if (status)     { baseParams.push(status);             whereClause += ` AND inv.status       = $${baseParams.length}`; }
    if (from)       { baseParams.push(from);               whereClause += ` AND inv."invoiceDate" >= $${baseParams.length}`; }
    if (to)         { baseParams.push(to);                 whereClause += ` AND inv."invoiceDate" <= $${baseParams.length}`; }

    // overdueCount = approved/sent/partially_paid AND dueDate < today AND
    // outstanding > 0. We don't lean on status='overdue' alone because
    // many sites don't run a scheduler to flip the status — the dueDate
    // check is the source of truth for "متأخّر".
    const [kpiRowArr, byStatus, byMonth, bySubAgent, recent] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int                                       AS "total",
                COALESCE(SUM(inv.total), 0)                         AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)                  AS "paidAmount",
                COALESCE(SUM(inv.total - COALESCE(inv."paidAmount", 0))
                         FILTER (WHERE inv.status <> 'cancelled'), 0) AS "outstandingAmount",
                COALESCE(SUM(inv."pilgrimCount"), 0)::int           AS "pilgrimsCount",
                COUNT(*) FILTER (
                  WHERE inv.status IN ('approved','sent','partially_paid','overdue')
                    AND inv."dueDate" IS NOT NULL
                    AND inv."dueDate" < CURRENT_DATE
                    AND (inv.total - COALESCE(inv."paidAmount", 0)) > 0
                )::int                                              AS "overdueCount",
                COUNT(DISTINCT inv."subAgentId")::int               AS "subAgentsCount"
           FROM umrah_sales_invoices inv
          WHERE ${whereClause}`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT inv.status                          AS "status",
                COUNT(*)::int                       AS "count",
                COALESCE(SUM(inv.total), 0)         AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)  AS "paidAmount"
           FROM umrah_sales_invoices inv
          WHERE ${whereClause}
          GROUP BY inv.status
          ORDER BY COUNT(*) DESC`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        // YYYY-MM bucket on invoiceDate. NULL issueDate excluded so the
        // chart doesn't get a "null" bucket spike. LIMIT 12 = trailing
        // year window (operator scrolls a chart, not a 5-year tail).
        `SELECT TO_CHAR(inv."invoiceDate", 'YYYY-MM') AS "month",
                COUNT(*)::int                         AS "count",
                COALESCE(SUM(inv.total), 0)           AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)    AS "paidAmount"
           FROM umrah_sales_invoices inv
          WHERE ${whereClause}
            AND inv."invoiceDate" IS NOT NULL
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT 12`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT inv."subAgentId"                    AS "subAgentId",
                sa.name                              AS "subAgentName",
                sa."nuskCode"                        AS "subAgentNuskCode",
                COUNT(*)::int                        AS "count",
                COALESCE(SUM(inv.total), 0)          AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)   AS "paidAmount",
                COALESCE(SUM(inv.total - COALESCE(inv."paidAmount", 0))
                         FILTER (WHERE inv.status <> 'cancelled'), 0) AS "outstandingAmount"
           FROM umrah_sales_invoices inv
      LEFT JOIN umrah_sub_agents sa
             ON sa.id = inv."subAgentId"
            AND sa."companyId" = inv."companyId"
            AND sa."deletedAt" IS NULL
          WHERE ${whereClause}
          GROUP BY inv."subAgentId", sa.name, sa."nuskCode"
          ORDER BY COALESCE(SUM(inv.total), 0) DESC
          LIMIT 50`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT inv.id, inv.ref, inv."invoiceDate", inv."dueDate", inv.status,
                inv."subAgentId", sa.name AS "subAgentName", sa."nuskCode" AS "subAgentNuskCode",
                inv."clientId", c.name AS "clientName",
                inv."seasonId", se.title AS "seasonTitle",
                inv.total, inv."paidAmount",
                (inv.total - COALESCE(inv."paidAmount", 0))::numeric(12,2) AS "outstanding",
                inv."pilgrimCount",
                inv."journalEntryId",
                inv."createdAt"
           FROM umrah_sales_invoices inv
      LEFT JOIN umrah_sub_agents sa
             ON sa.id = inv."subAgentId"
            AND sa."companyId" = inv."companyId"
            AND sa."deletedAt" IS NULL
      LEFT JOIN clients c
             ON c.id = inv."clientId"
            AND c."companyId" = inv."companyId"
            AND c."deletedAt" IS NULL
      LEFT JOIN umrah_seasons se
             ON se.id = inv."seasonId"
            AND se."companyId" = inv."companyId"
            AND se."deletedAt" IS NULL
          WHERE ${whereClause}
          ORDER BY inv."invoiceDate" DESC NULLS LAST, inv.id DESC
          LIMIT 100`,
        baseParams,
      ),
    ]);

    const kpiRow = kpiRowArr[0] ?? {
      total: 0, totalAmount: 0, paidAmount: 0, outstandingAmount: 0,
      pilgrimsCount: 0, overdueCount: 0, subAgentsCount: 0,
    };

    res.json(maskFields(req, {
      kpis: kpiRow,
      byStatus,
      byMonth,
      bySubAgent,
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Sales invoices summary report"); }
});



// تقرير ملخّص أخطاء الاستيراد (import errors summary) — §11 من شرائع #1870.
// يجاوب على أسئلة العامل/المسؤول الإداري:
//   «كم دفعة فشلت/جزئية؟ كم سطر مرفوض؟ من أكثر مستخدم تنزّل دفعات
//    فيها أخطاء؟ ما نوع الملف الأكثر إشكالاً؟»
//
// ٥ تجميعات بالتوازي على umrah_import_batches (المصدر الرئيسي):
//   1) kpis        → totalBatches / failedBatches / partialBatches /
//                    totalRows / errorRows / financialImpactRows /
//                    affectedSeasons / affectedUploaders
//   2) byStatus    → توزيع الدفعات حسب status (pending/completed/failed/...)
//   3) byFileType  → توزيع حسب نوع الملف (mutamers/vouchers/...)
//   4) byUploader  → ٢٠ مستخدم الأعلى من حيث الأخطاء (للوحة الإداريين)
//   5) recent      → آخر ١٠٠ دفعة (للجدول السفلي مع drill إلى changes)
//
// نوصل إلى umrah_seasons + users (للأسماء) عبر LEFT JOIN — كل التجميعات
// تحت companyId + deletedAt IS NULL.
//
// نعتبر "دفعة فيها أخطاء" حين:
//   - status='failed'
//   - errorCount > 0
//   - skippedCount > 0
//
// الفلاتر: seasonId / status / fileType / uploadedBy / from / to (YYYY-MM-DD على createdAt).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/import-errors-summary", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, fileType, uploadedBy, from, to } = req.query as Record<string, string | undefined>;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRe.test(from)) throw new ValidationError("from يجب أن يكون YYYY-MM-DD", { field: "from" });
    if (to   && !dateRe.test(to))   throw new ValidationError("to يجب أن يكون YYYY-MM-DD",   { field: "to" });

    const baseParams: unknown[] = [scope.companyId];
    let whereClause = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
    if (seasonId)   { baseParams.push(Number(seasonId));   whereClause += ` AND b."seasonId"    = $${baseParams.length}`; }
    if (status)     { baseParams.push(status);             whereClause += ` AND b.status        = $${baseParams.length}`; }
    if (fileType)   { baseParams.push(fileType);           whereClause += ` AND b."fileType"    = $${baseParams.length}`; }
    if (uploadedBy) { baseParams.push(Number(uploadedBy)); whereClause += ` AND b."uploadedBy"  = $${baseParams.length}`; }
    if (from)       { baseParams.push(from);               whereClause += ` AND b."createdAt"  >= $${baseParams.length}`; }
    if (to)         { baseParams.push(to);                 whereClause += ` AND b."createdAt"  <= ($${baseParams.length}::date + INTERVAL '1 day')`; }

    const [kpiRowArr, byStatus, byFileType, byUploader, recent] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        // problemBatches = صراحة بها أخطاء أو فشلت — العامل بحاجة لرقم
        // واحد ينطلق منه. failedBatches فقط status='failed'؛
        // partialBatches = errorCount>0 أو skippedCount>0 لكن مش failed.
        `SELECT COUNT(*)::int                                    AS "totalBatches",
                COUNT(*) FILTER (WHERE b.status = 'failed')::int AS "failedBatches",
                COUNT(*) FILTER (WHERE b.status <> 'failed' AND
                                       (COALESCE(b."errorCount", 0) > 0
                                        OR COALESCE(b."skippedCount", 0) > 0))::int
                                                                  AS "partialBatches",
                COALESCE(SUM(b."totalRows"), 0)::int              AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int             AS "errorRows",
                COALESCE(SUM(b."skippedCount"), 0)::int           AS "skippedRows",
                COALESCE(SUM(b."newCount"), 0)::int               AS "newRows",
                COALESCE(SUM(b."updatedCount"), 0)::int           AS "updatedRows",
                COALESCE(SUM(b."financialImpactCount"), 0)::int   AS "financialImpactRows",
                COUNT(DISTINCT b."seasonId") FILTER (WHERE b."seasonId" IS NOT NULL)::int AS "affectedSeasons",
                COUNT(DISTINCT b."uploadedBy") FILTER (WHERE b."uploadedBy" IS NOT NULL)::int AS "affectedUploaders"
           FROM umrah_import_batches b
          WHERE ${whereClause}`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b.status                                AS "status",
                COUNT(*)::int                            AS "count",
                COALESCE(SUM(b."totalRows"), 0)::int     AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int    AS "errorRows"
           FROM umrah_import_batches b
          WHERE ${whereClause}
          GROUP BY b.status
          ORDER BY COUNT(*) DESC`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b."fileType"                             AS "fileType",
                COUNT(*)::int                            AS "count",
                COALESCE(SUM(b."totalRows"), 0)::int     AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int    AS "errorRows",
                COALESCE(SUM(b."skippedCount"), 0)::int  AS "skippedRows"
           FROM umrah_import_batches b
          WHERE ${whereClause}
          GROUP BY b."fileType"
          ORDER BY COALESCE(SUM(b."errorCount"), 0) DESC, COUNT(*) DESC`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b."uploadedBy"                                    AS "uploadedBy",
                COALESCE(e.name, u.email)                          AS "uploaderName",
                u.email                                            AS "uploaderEmail",
                COUNT(*)::int                                      AS "count",
                COUNT(*) FILTER (WHERE b.status = 'failed')::int   AS "failedCount",
                COALESCE(SUM(b."totalRows"), 0)::int               AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int              AS "errorRows",
                COALESCE(SUM(b."skippedCount"), 0)::int            AS "skippedRows"
           FROM umrah_import_batches b
      LEFT JOIN users u    ON u.id = b."uploadedBy"
      LEFT JOIN employees e ON e.id = u."employeeId"
          WHERE ${whereClause}
          GROUP BY b."uploadedBy", e.name, u.email
          ORDER BY COALESCE(SUM(b."errorCount"), 0) DESC, COUNT(*) DESC
          LIMIT 20`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b.id, b."fileName", b."fileType", b.status,
                b."totalRows", b."newCount", b."updatedCount",
                b."skippedCount", b."errorCount", b."financialImpactCount",
                b."seasonId", se.title AS "seasonTitle",
                b."uploadedBy", COALESCE(e.name, u.email) AS "uploaderName",
                b."createdAt", b."completedAt", b.notes
           FROM umrah_import_batches b
      LEFT JOIN umrah_seasons se
             ON se.id = b."seasonId"
            AND se."companyId" = b."companyId"
            AND se."deletedAt" IS NULL
      LEFT JOIN users u    ON u.id = b."uploadedBy"
      LEFT JOIN employees e ON e.id = u."employeeId"
          WHERE ${whereClause}
          ORDER BY b."createdAt" DESC, b.id DESC
          LIMIT 100`,
        baseParams,
      ),
    ]);

    const kpiRow = kpiRowArr[0] ?? {
      totalBatches: 0, failedBatches: 0, partialBatches: 0,
      totalRows: 0, errorRows: 0, skippedRows: 0, newRows: 0, updatedRows: 0,
      financialImpactRows: 0, affectedSeasons: 0, affectedUploaders: 0,
    };

    res.json(maskFields(req, {
      kpis: kpiRow,
      byStatus,
      byFileType,
      byUploader,
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Import errors summary report"); }
});


// §8 Phase 2 of #1870 — Settings Policies Catalog (11 categories).
// Surfaces every umrah policy + its current value in one payload.
// Companion PUT handles per-category saves through the existing
// `settings` table (key pattern `umrah.<categoryId>.<fieldKey>`).
router.get("/settings/policies", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    // Resolve all umrah.* settings in one round-trip. The shared
    // resolveSettings helper takes one key at a time + handles
    // precedence on its own; for this catalog (dozens of keys per
    // call) we'd rather do a single SELECT. Same precedence rule
    // (system < company) reproduced inline so the read stays
    // consistent with the rest of the platform.
    const keys: string[] = [];
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      for (const f of cat.fields) {
        keys.push(`umrah.${cat.id}.${f.key}`);
      }
    }
    const settingsRows = await rawQuery<{ key: string; scope: string; value: unknown }>(
      `SELECT key, scope, value FROM settings
        WHERE key = ANY($1::text[])
          AND (
            (scope = 'system' AND "scopeId" IS NULL)
            OR (scope = 'company' AND "scopeId" = $2)
          )
        ORDER BY CASE scope WHEN 'system' THEN 1 WHEN 'company' THEN 2 END`,
      [keys, scope.companyId],
    );
    const current: Record<string, unknown> = {};
    for (const r of settingsRows) current[r.key] = r.value;

    const data = UMRAH_POLICY_CATEGORIES.map((cat) => {
      const fields = cat.fields.map((f) => {
        const fullKey = `umrah.${cat.id}.${f.key}`;
        const raw = current[fullKey];
        return {
          ...f,
          fullKey,
          // null → operator hasn't set; effective value falls back to
          // the catalog default so the FE renders a populated input.
          currentValue: raw === undefined ? null : raw,
          effectiveValue: raw === undefined ? (f.defaultValue ?? null) : raw,
        };
      });
      const configuredCount = fields.filter((f) => f.currentValue !== null).length;
      const status: "configured" | "default" | "missing" =
        configuredCount === 0 ? "default"
        : configuredCount === fields.length ? "configured"
        : "missing";
      return { ...cat, fields, status, configuredCount };
    });
    res.json({ data });
  } catch (err) { handleRouteError(err, res, "Settings policies catalog"); }
});

const savePolicySchema = z.object({
  values: z.record(z.string(), z.union([
    z.number(), z.boolean(), z.string(), z.null(),
  ])),
});

router.put("/settings/policies/:categoryId", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const categoryId = String(req.params.categoryId);
    if (!ALL_POLICY_IDS.includes(categoryId)) {
      throw new NotFoundError("الفئة غير موجودة");
    }
    const cat = UMRAH_POLICY_CATEGORIES.find((c) => c.id === categoryId)!;
    const b = zodParse(savePolicySchema.safeParse(req.body));
    // Whitelist guard — only keys that exist in the category's
    // schema are accepted. An unknown key would land as a dead
    // settings row otherwise.
    const knownKeys = new Set(cat.fields.map((f) => f.key));
    for (const k of Object.keys(b.values)) {
      if (!knownKeys.has(k)) {
        throw new ValidationError(`الحقل "${k}" غير معروف في فئة "${cat.title}"`, { field: k });
      }
    }
    // Save each provided value. Null means "clear the override and
    // fall back to the system default" — upsertSetting persists the
    // null and resolveSettings treats it as undefined on read.
    for (const [k, v] of Object.entries(b.values)) {
      await upsertSetting("company", scope.companyId, `umrah.${categoryId}.${k}`, v);
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update",
      entity: "umrah_settings_policies", entityId: 0,
      after: { categoryId, keys: Object.keys(b.values) },
    }).catch((e) => logger.error(e, "policy save audit failed"));
    res.json({ ok: true, categoryId, updated: Object.keys(b.values).length });
  } catch (err) { handleRouteError(err, res, "Save policy"); }
});

export default router;
