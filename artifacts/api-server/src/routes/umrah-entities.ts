// ─────────────────────────────────────────────────────────────────────────────
// umrah-entities.ts — COMMERCIAL/FINANCE entities for the umrah module
//
// Owns: groups (CRUD), nusk-invoices,
//       sales-invoices (generate + update), payments,
//       dashboard, employee-assignments.
//   (letters PDF + dispatch live in umrah-letters.ts — U-07 Phase 12)
//   (operational reports — daily-runsheet, reconciliation, exempt-pilgrims,
//    group/season portfolio — live in umrah-reports.ts — U-07 Phase 11)
//   (attachments — polymorphic document storage — live in
//    umrah-attachments.ts — U-07 Phase 10)
//   (sub-agent statements JSON + PDF live in umrah-statements.ts — U-07 Phase 9)
//   (import-batches listing + unlinked-rows recovery live in
//    umrah-import-batches.ts — U-07 Phase 8)
//   (pricing CRUD lives in umrah-pricing.ts — U-07 Phase 7)
//   (sub-agents CRUD + linking live in umrah-sub-agents.ts — U-07 Phase 6)
//   (commission plans/calculations live in umrah-commission.ts — U-07 Phase 5)
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
  todayISO,
} from "../lib/businessHelpers.js";
import { internalTechRef } from "../lib/internalRef.js";
import { reclassifyRevenueForInvoices } from "../lib/umrahReclassifyEngine.js";
import {
  generateSalesInvoice,
  registerPayment,
  listUninvoicedGroups,
} from "../lib/umrahInvoicingEngine.js";
import { postNuskJournalEntries } from "../lib/umrahImportEngine.js";
import { UMRAH_POLICY_CATEGORIES, ALL_POLICY_IDS } from "../lib/umrahSettingsPoliciesCatalog.js";
import { upsertSetting } from "../lib/settings.js";
import {
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
// U-07 Phase 1 — journey + recovery reports moved to a dedicated
// sub-router so the parent file shrinks. The API surface is
// unchanged: the sub-router mounts on `/` here so its paths still
// resolve at /umrah/sub-agents/:id/journey, /umrah/groups/:id/journey,
// /umrah/reports/packages-vs-allocations-pricing-drift, and
// /umrah/reports/recovery-hub.
import journeyReportsRouter from "./umrah-journey-reports.js";
// U-07 Phase 2 — families CRUD moved to a dedicated sub-router so the
// parent file shrinks further. Paths still resolve at /umrah/families/...
import familiesRouter from "./umrah-families.js";
// U-07 Phase 4 — accommodation (hotels / room-blocks / allocations) moved to
// a dedicated sub-router. Paths still resolve at /umrah/hotels, /room-blocks…
import accommodationRouter from "./umrah-accommodation.js";
// U-07 Phase 5 — employee commission plans/calculations moved to a dedicated
// sub-router. Paths still resolve at /umrah/commission-plans, /umrah/commission-calculations…
import commissionRouter from "./umrah-commission.js";
// U-07 Phase 6 — sub-agents (CRUD + linking) moved to a dedicated sub-router.
// Paths still resolve at /umrah/sub-agents/...
import subAgentsRouter from "./umrah-sub-agents.js";
// U-07 Phase 7 — pricing (CRUD) moved to a dedicated sub-router.
// Paths still resolve at /umrah/pricing...
import pricingRouter from "./umrah-pricing.js";
// U-07 Phase 8 — import-batches (listing + unlinked-rows recovery) moved to a
// dedicated sub-router. Paths still resolve at /umrah/import/batches...
import importBatchesRouter from "./umrah-import-batches.js";
// U-07 Phase 9 — sub-agent statements (JSON + PDF) moved to a dedicated
// sub-router. Paths still resolve at /umrah/statements/...
import statementsRouter from "./umrah-statements.js";
// U-07 Phase 10 — attachments (polymorphic document storage) moved to a
// dedicated sub-router. Paths still resolve at /umrah/attachments...
import attachmentsRouter from "./umrah-attachments.js";
// U-07 Phase 11 — operational reports (daily-runsheet, reconciliation,
// exempt-pilgrims, group/season portfolio) moved to a dedicated sub-router.
// Paths still resolve at /umrah/reports/...
import reportsRouter from "./umrah-reports.js";
// U-07 Phase 12 — letters (PDF + dispatch) moved to a dedicated sub-router.
// Paths still resolve at /umrah/letters/...
import lettersRouter from "./umrah-letters.js";

const router = Router();
router.use(journeyReportsRouter);
router.use(familiesRouter);
router.use(accommodationRouter);
router.use(commissionRouter);
router.use(subAgentsRouter);
router.use(pricingRouter);
router.use(importBatchesRouter);
router.use(statementsRouter);
router.use(attachmentsRouter);
router.use(reportsRouter);
router.use(lettersRouter);

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
// DASHBOARD
// ============================================================================


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
// UMRAH REFUND REQUESTS (migration 268)
// ============================================================================
// Pilgrim cancels → file refund request → approve/reject → pay through
// treasury → close once credit memo lands. State machine in
// `lib/umrahRefundWorkflow.ts`.

const createRefundSchema = z.object({
  pilgrimId: z.coerce.number().int().positive().optional(),
  agentId: z.coerce.number().int().positive().optional(),
  salesInvoiceId: z.coerce.number().int().positive().optional(),
  nuskInvoiceId: z.coerce.number().int().positive().optional(),
  grossAmount: z.coerce.number().positive(),
  mofaRetention: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  reason: z.string().min(1, "السبب مطلوب"),
  notes: z.string().optional(),
}).refine(
  (d) => d.pilgrimId || d.agentId,
  { message: "إما المعتمر أو الوكيل مطلوب", path: ["pilgrimId"] },
);

router.get("/refund-requests", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as Record<string, string | undefined>;
    let where = `r."companyId" = $1 AND r."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (status) {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    const rows = await rawQuery(
      `SELECT r.*,
              p."fullName" AS "pilgrimName",
              p."passportNumber",
              a.name        AS "agentName"
         FROM umrah_refund_requests r
    LEFT JOIN umrah_pilgrims p
           ON p.id = r."pilgrimId"
          AND p."companyId" = r."companyId"
          AND p."deletedAt" IS NULL
    LEFT JOIN umrah_agents a
           ON a.id = r."agentId"
          AND a."companyId" = r."companyId"
          AND a."deletedAt" IS NULL
        WHERE ${where}
        ORDER BY r."requestedAt" DESC
        LIMIT 500`,
      params,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List refund requests"); }
});

router.post("/refund-requests", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createRefundSchema.safeParse(req.body));
    if (b.pilgrimId) {
      const [hit] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.pilgrimId, scope.companyId],
      );
      if (!hit) throw new ValidationError("المعتمر غير موجود في النظام", { field: "pilgrimId" });
    }
    if (b.agentId) {
      const [hit] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.agentId, scope.companyId],
      );
      if (!hit) throw new ValidationError("الوكيل غير موجود في النظام", { field: "agentId" });
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_refund_requests
       ("companyId","pilgrimId","agentId","salesInvoiceId","nuskInvoiceId",
        "grossAmount","mofaRetention",currency,reason,notes,"requestedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        scope.companyId,
        b.pilgrimId ?? null,
        b.agentId ?? null,
        b.salesInvoiceId ?? null,
        b.nuskInvoiceId ?? null,
        b.grossAmount,
        b.mofaRetention ?? 0,
        b.currency ?? "SAR",
        b.reason,
        b.notes ?? null,
        scope.userId,
      ],
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء طلب الاسترداد");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "umrah_refund_requests", entityId: rows[0].id as number,
      after: { grossAmount: b.grossAmount, pilgrimId: b.pilgrimId, agentId: b.agentId },
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.requested", entity: "umrah_refund_requests", entityId: rows[0].id as number,
      details: JSON.stringify({ grossAmount: b.grossAmount }),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create refund request"); }
});

router.post("/refund-requests/:id/approve", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "approved")) {
      throw new ConflictError(`لا يمكن الموافقة على طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='approved',
              "approvedBy"=$1, "approvedAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$2 AND "companyId"=$3`,
      [scope.userId, id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.approved", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({ approvedBy: scope.userId }),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Approve refund"); }
});

const rejectRefundSchema = z.object({
  rejectionReason: z.string().min(1, "سبب الرفض مطلوب"),
});

router.post("/refund-requests/:id/reject", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(rejectRefundSchema.safeParse(req.body));
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "rejected")) {
      throw new ConflictError(`لا يمكن رفض طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='rejected',
              "rejectionReason"=$1, "rejectedBy"=$2, "rejectedAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$3 AND "companyId"=$4`,
      [b.rejectionReason, scope.userId, id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.rejected", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({ reason: b.rejectionReason }),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Reject refund"); }
});

const payRefundSchema = z.object({
  settledAmount: z.coerce.number().positive(),
  treasuryId: z.coerce.number().int().positive(),
  paymentReference: z.string().min(1, "مرجع الدفع مطلوب"),
});

router.post("/refund-requests/:id/pay", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(payRefundSchema.safeParse(req.body));
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "paid")) {
      throw new ConflictError(`لا يمكن صرف طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='paid',
              "settledAmount"=$1, "treasuryId"=$2, "paymentReference"=$3,
              "paidBy"=$4, "paidAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$5 AND "companyId"=$6`,
      [b.settledAmount, b.treasuryId, b.paymentReference, scope.userId, id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.paid", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({ settledAmount: b.settledAmount, treasuryId: b.treasuryId }),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Pay refund"); }
});

router.post("/refund-requests/:id/close", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "closed")) {
      throw new ConflictError(`لا يمكن إغلاق طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='closed', "updatedAt"=NOW()
        WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.closed", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({}),
    }).catch((e) => logger.error(e, "umrah-entities background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Close refund"); }
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
      //
      // NOTE: this layer is NOT date-ranged, so it references neither $3
      // (toStr) nor the shared `pilgrimSeasonClause` index. Reusing the
      // 3-element `baseParams` here bound 3 values against a 2-placeholder
      // statement → Postgres 08P01 ("supplies 3 parameters, but prepared
      // statement requires 2") whenever no seasonId was supplied (the
      // default calendar view) → 500. Use a dedicated params array whose
      // length always matches the placeholders.
      const overstayParams: unknown[] = [scope.companyId, fromStr];
      let overstaySeasonClause = "";
      if (seasonId) {
        overstayParams.push(seasonId);
        overstaySeasonClause = ` AND p."seasonId" = $${overstayParams.length}`;
      }
      runs.overstay = rawQuery<Row>(
        `SELECT $2::text AS date,
                COUNT(*)::text AS c,
                (ARRAY_AGG(p.id ORDER BY p.id))[1:10] AS "sampleIds"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1
            AND p.status IN ('overstayed', 'overstay_penalized')
            AND p."deletedAt" IS NULL${overstaySeasonClause}
          HAVING COUNT(*) > 0`,
        overstayParams,
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
