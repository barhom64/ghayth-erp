// ─────────────────────────────────────────────────────────────────────────────
// umrah-groups.ts — UMRAH GROUPS CRUD (U-07 Phase 22)
//
// Routes carved VERBATIM out of umrah-entities.ts into this dedicated
// sub-router. Mounted via `router.use(groupsRouter)` in umrah-entities.ts so the
// API surface stays identical (paths still resolve at /umrah/groups and
// /umrah/groups/:id).
//
// OPERATIONAL — no ledger/GL writes. Group create/update/delete emit
// audit + domain events only; the enriched list/detail views are read-only
// aggregations. The group sub-resources that DO orchestrate other paths
// (transport service-contract, split/merge) stay in umrah-entities.ts for now
// (later U-07 phases).
//
// Audit calls converted to auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not use the
// legacy direct createAuditLog helper.
//
// Routes owned here:
//   GET    /groups
//   GET    /groups/:id
//   POST   /groups
//   PATCH  /groups/:id
//   DELETE /groups/:id
//   POST   /groups/:id/split   (GROUP OPS — withTransaction)
//   POST   /groups/merge       (GROUP OPS — withTransaction)
//
// NB on split/merge: they live here (not in the parent) because POST
// /groups/:id/split also INSERTs into umrah_groups. Keeping every umrah_groups
// INSERT in the same module as the issueNumber call preserves the numbering-
// coverage relationship the audit (audit:numbering-coverage) checks at file
// level — exactly the pre-split arrangement, moved verbatim.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError, parseId, zodParse } from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { gccExclusionSqlFragment } from "../lib/umrahNationalityRules.js";
import { issueNumber } from "../lib/numberingService.js";
import {
  previewSplitGroupNumberingBackfill,
  backfillSplitGroupNumbering,
} from "../lib/umrahGroupNumberingBackfill.js";

const router = Router();

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
    auditFromRequest(req, "create", "umrah_groups", groupId as number, { after: { nuskGroupNumber: b.nuskGroupNumber, internalRef: issuedGrp.number } }).catch((e) => logger.error(e, "umrah groups bg"));
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
    auditFromRequest(req, "update", "umrah_groups", id).catch((e) => logger.error(e, "umrah groups bg"));
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
    auditFromRequest(req, "delete", "umrah_groups", id).catch((e) => logger.error(e, "umrah groups bg"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.group.deleted", entity: "umrah_groups", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah groups bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete group"); }
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

    // Captured from inside the txn so the numbering-centre assignment can be
    // linked to the new group id after commit (same non-blocking link pattern
    // as POST /groups). Stays out of the returned `result` so the response shape
    // is unchanged.
    let splitAssignmentId: number | null = null;

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

      // Numbering centre (Issue #1141) — a split-off group is a real group and
      // gets its own per-season internalRef, exactly like POST /groups. Issued
      // here (inside the txn, after the source's seasonId is known) on the
      // numbering service's own connection; a number gap on rollback is
      // acceptable — same property as the create path.
      const issuedSplit = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? (source.branchId ?? null),
        moduleKey: "umrah",
        entityKey: "umrah_group",
        entityTable: "umrah_groups",
        seasonId: source.seasonId,
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      splitAssignmentId = issuedSplit.assignmentId;

      const insertRes = await client.query(
        `INSERT INTO umrah_groups
          ("companyId","branchId","nuskGroupNumber","internalRef",name,"agentId","subAgentId","seasonId",
           "mutamerCount","programDuration",status,"createdBy","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'split_from_'||$11,$12,NOW(),NOW())
         RETURNING id, "nuskGroupNumber", "internalRef", name, "mutamerCount"`,
        [
          scope.companyId, scope.branchId || source.branchId, newNuskNum, issuedSplit.number, newName,
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

    // Link the numbering-centre assignment to the freshly created split group
    // (non-blocking, same as POST /groups).
    if (result.newGroup?.id && splitAssignmentId != null) {
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [result.newGroup.id as number, splitAssignmentId]
      ).catch(() => { /* non-blocking link */ });
    }

    auditFromRequest(req, "umrah.group.split", "umrah_groups", sourceId, {
      after: { newGroupId: result.newGroup.id, internalRef: result.newGroup.internalRef, movedCount: result.movedCount },
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

    auditFromRequest(req, "umrah.group.merged", "umrah_groups", body.targetGroupId, {
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

// ─── Numbering backfill for historical split-off groups (Issue #1141) ────────
// Split groups created before #2956 carry internalRef = NULL. The register-based
// numbering backfill skips NULL-ref rows by design, so these need a number
// MINTED through the centre. Preview first (read-only), then execute.
router.get(
  "/groups/numbering-backfill/preview",
  authorize({ feature: "umrah", action: "view" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const preview = await previewSplitGroupNumberingBackfill({ companyId: scope.companyId });
      res.json({ success: true, ...preview });
    } catch (err) { handleRouteError(err, res, "Preview split-group numbering backfill"); }
  }
);

// Audit: no domain audit/event here — same as the numbering-centre's own
// /numbering/schemes/:id/backfill endpoint. Each minted number is already
// traced by issueNumber() into numbering_audit_logs ('issue', actor + entityId
// + number), which is the authoritative trail for number issuance.
router.post(
  "/groups/numbering-backfill",
  authorize({ feature: "umrah", action: "update" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const result = await backfillSplitGroupNumbering({
        companyId: scope.companyId,
        actorId: scope.userId,
      });
      res.json({ success: true, ...result });
    } catch (err) { handleRouteError(err, res, "Split-group numbering backfill"); }
  }
);

export default router;
