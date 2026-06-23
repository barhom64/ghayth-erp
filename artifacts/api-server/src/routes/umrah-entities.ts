// ─────────────────────────────────────────────────────────────────────────────
// umrah-entities.ts — COMMERCIAL/FINANCE entities for the umrah module
//
// Owns: groups (CRUD),
//       sales-invoices (generate + update),
//       dashboard, employee-assignments.
//   (nusk-invoices — list/get/create/update/delete + AP journal posting —
//    live in umrah-nusk-invoices.ts — U-07 Phase 19)
//   (payments + revenue reclassification — register payment / reclassify —
//    live in umrah-payments.ts — U-07 Phase 20)
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
import {
  generateSalesInvoice,
  listUninvoicedGroups,
} from "../lib/umrahInvoicingEngine.js";
import {
  calculateAllForCompany,
} from "../lib/umrahCommissionEngine.js";
import {
  createTransportRequestFromUmrah,
  listTransportRequestsForGroup,
} from "../lib/umrahTransportContract.js";
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
// U-07 Phase 14 — refund requests (lifecycle: request → approve/reject → pay →
// close) moved to a dedicated sub-router. Paths still resolve at
// /umrah/refund-requests...
import refundsRouter from "./umrah-refunds.js";
// U-07 Phase 15 — operational calendar (layer-aware event aggregator) moved to
// a dedicated sub-router. Path still resolves at /umrah/calendar/events.
import calendarRouter from "./umrah-calendar.js";
// U-07 Phase 18 — settings policies (GET catalog + PUT per-category save) moved
// to a dedicated sub-router. Paths still resolve at /umrah/settings/policies...
import settingsRouter from "./umrah-settings.js";
// U-07 Phase 19 — nusk invoices (list/get/create/update/delete + AP journal
// posting via the postNuskJournalEntries engine) moved to a dedicated
// sub-router. Paths still resolve at /umrah/nusk-invoices...
import nuskInvoicesRouter from "./umrah-nusk-invoices.js";
// U-07 Phase 20 — payments (list + register via the registerPayment engine) and
// revenue reclassification (via the reclassifyRevenueForInvoices engine) moved
// to a dedicated sub-router. Paths still resolve at /umrah/payments and
// /umrah/reclassify-revenue.
import paymentsRouter from "./umrah-payments.js";

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
router.use(refundsRouter);
router.use(calendarRouter);
router.use(settingsRouter);
router.use(nuskInvoicesRouter);
router.use(paymentsRouter);

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

export default router;
