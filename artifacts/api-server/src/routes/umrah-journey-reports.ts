// ─────────────────────────────────────────────────────────────────────────────
// umrah-journey-reports.ts — U-19 + U-15 read-only reports
//
// U-07 (umrah-entities.ts split, Phase 1): the 4 journey/recovery
// read paths that landed in this session live in a dedicated module
// so the parent `umrah-entities.ts` keeps shrinking. The sub-router
// is mounted from umrah-entities.ts via `router.use(journeyReportsRouter)`
// so the API surface stays identical.
//
// Routes owned here:
//   GET /sub-agents/:id/journey              — U-19-P1
//   GET /groups/:id/journey                  — U-19-P1b
//   GET /reports/packages-vs-allocations-pricing-drift — U-15-P5
//   GET /reports/recovery-hub                — U-19-P6
//
// All READ-ONLY. All RBAC-gated. All tenant-scoped. No writes, no JE.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, NotFoundError, parseId } from "../lib/errorHandler.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// U-19-P1 — journey-status helper (read-only)
//
// Surfaces the 4-stage journey for a sub-agent:
//   1. imported   — pilgrims attributed to this sub-agent
//   2. linked     — whether the sub-agent has a clientId
//   3. invoiced   — sales invoices issued + total invoiced amount
//   4. collected  — payments received against those invoices + total
//
// Outstanding counts (unlinkedPilgrims / uninvoicedGroups /
// unpaidInvoices) help the operator triage stuck items without
// flipping to 4 separate pages.
//
// READ-ONLY. No writes. Tenant-scoped via the standard sub-agent
// existence guard. The audit (#2314 §3.1) proposed adding three
// helper endpoints (sub-agents/:id/journey, import-batches/:id/journey,
// groups/:id/journey); this slice ships the sub-agent variant. The
// other two are P3 follow-ups in the FE rendering phase.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/sub-agents/:id/journey",
  authorize({ feature: "umrah", action: "view" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");

      // Sub-agent existence + tenant scope. Same guard shape as
      // /sub-agents/:id (line 303) — leaking journey data through a
      // stale FK is the failure mode this gates.
      const [subAgent] = await rawQuery<{ id: number; clientId: number | null; name: string; agentId: number | null }>(
        `SELECT id, "clientId", name, "agentId"
           FROM umrah_sub_agents
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!subAgent) throw new NotFoundError("الوكيل الفرعي غير موجود");

      // All four stages computed in parallel — 0 sequential awaits.
      // The queries are independent: import side reads
      // umrah_pilgrims; invoice side reads umrah_sales_invoices;
      // payment side reads umrah_payments; outstanding rolls up
      // partials from the same tables.
      const [
        importRow,
        invoiceRow,
        paymentRow,
        unlinkedPilgrimsRow,
        uninvoicedGroupsRow,
        unpaidInvoicesRow,
      ] = await Promise.all([
        rawQuery<{ count: string; latestAt: string | null }>(
          `SELECT COUNT(*)::text AS count,
                  MAX("createdAt")::text AS "latestAt"
             FROM umrah_pilgrims
            WHERE "companyId" = $1
              AND "subAgentId" = $2
              AND "deletedAt" IS NULL`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string; total: string; latestAt: string | null }>(
          `SELECT COUNT(*)::text AS count,
                  COALESCE(SUM(total), 0)::text AS total,
                  MAX("createdAt")::text AS "latestAt"
             FROM umrah_sales_invoices
            WHERE "companyId" = $1
              AND "subAgentId" = $2
              AND "deletedAt" IS NULL`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string; total: string; latestAt: string | null }>(
          `SELECT COUNT(*)::text AS count,
                  COALESCE(SUM("sarAmount"), 0)::text AS total,
                  MAX("createdAt")::text AS "latestAt"
             FROM umrah_payments
            WHERE "companyId" = $1
              AND "subAgentId" = $2
              AND "deletedAt" IS NULL`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string }>(
          // Pilgrims with subAgentId set but no further attribution
          // (groupId IS NULL) — recoverable via the import unlink
          // surface. Mirrors U-08's recovery wiring.
          `SELECT COUNT(*)::text AS count
             FROM umrah_pilgrims
            WHERE "companyId" = $1
              AND "subAgentId" = $2
              AND "groupId" IS NULL
              AND "deletedAt" IS NULL`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string }>(
          // Groups belonging to this sub-agent (via pilgrims) with
          // no sales invoice covering them yet. Hand-rolled NOT IN
          // because Postgres array semantics here are simpler than
          // an EXISTS subquery for the JSON text "groupRefs" column.
          `SELECT COUNT(DISTINCT g.id)::text AS count
             FROM umrah_groups g
             JOIN umrah_pilgrims p
               ON p."groupId" = g.id
              AND p."companyId" = g."companyId"
              AND p."deletedAt" IS NULL
            WHERE g."companyId" = $1
              AND g."deletedAt" IS NULL
              AND p."subAgentId" = $2
              AND NOT EXISTS (
                SELECT 1 FROM umrah_sales_invoices si
                 WHERE si."companyId" = g."companyId"
                   AND si."subAgentId" = $2
                   AND si."deletedAt" IS NULL
                   AND si."groupRefs" LIKE '%' || g.id || '%'
              )`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string }>(
          // Invoices where paidAmount < total (or paidAmount NULL).
          // Includes drafts because the operator's mental model is
          // "anything I haven't fully collected" — drafts surface as
          // a separate ratio on the FE, not here.
          `SELECT COUNT(*)::text AS count
             FROM umrah_sales_invoices
            WHERE "companyId" = $1
              AND "subAgentId" = $2
              AND "deletedAt" IS NULL
              AND COALESCE("paidAmount", 0) < COALESCE(total, 0)`,
          [scope.companyId, id],
        ),
      ]);

      const importedCount = Number(importRow[0]?.count ?? 0);
      const invoicedCount = Number(invoiceRow[0]?.count ?? 0);
      const invoicedTotal = Number(invoiceRow[0]?.total ?? 0);
      const collectedCount = Number(paymentRow[0]?.count ?? 0);
      const collectedTotal = Number(paymentRow[0]?.total ?? 0);

      res.json(
        maskFields(req, {
          subAgent: {
            id: subAgent.id,
            name: subAgent.name,
            clientId: subAgent.clientId,
            agentId: subAgent.agentId,
          },
          stages: [
            {
              stage: "imported",
              count: importedCount,
              ts: importRow[0]?.latestAt ?? null,
            },
            {
              // Linked stage flips on as soon as `clientId IS NOT NULL`.
              // The audit-log timestamp would be richer but the journey
              // helper doesn't need to drill that far — the FE shows
              // a single boolean indicator.
              stage: "linked",
              count: subAgent.clientId ? 1 : 0,
              ts: null,
            },
            {
              stage: "invoiced",
              count: invoicedCount,
              total: invoicedTotal,
              ts: invoiceRow[0]?.latestAt ?? null,
            },
            {
              stage: "collected",
              count: collectedCount,
              total: collectedTotal,
              ts: paymentRow[0]?.latestAt ?? null,
            },
          ],
          outstanding: {
            unlinkedPilgrims: Number(unlinkedPilgrimsRow[0]?.count ?? 0),
            uninvoicedGroups: Number(uninvoicedGroupsRow[0]?.count ?? 0),
            unpaidInvoices: Number(unpaidInvoicesRow[0]?.count ?? 0),
          },
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "Sub-agent journey");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// U-19-P1b — group journey-status helper (read-only)
//
// Same shape as the sub-agent variant above, but keyed on
// `umrah_groups.id` and surfaced for the group-detail FE drill-down.
//
// Stages:
//   1. imported   — pilgrims attributed to this group
//   2. linked     — whether the group has any pilgrim with a linked
//                   subAgent → client chain (boolean roll-up)
//   3. invoiced   — sales invoices whose groupRefs include this id
//   4. collected  — payments tied to those invoices
//
// READ-ONLY. No writes. Tenant-scoped via the standard group
// existence guard.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/groups/:id/journey",
  authorize({ feature: "umrah", action: "view" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");

      // Group existence + tenant scope. Same guard shape as the
      // sub-agents/:id route — leaking journey data through a stale
      // FK is the failure mode this gates.
      const [group] = await rawQuery<{ id: number; name: string; agentId: number | null; subAgentId: number | null }>(
        `SELECT id, name, "agentId", "subAgentId"
           FROM umrah_groups
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!group) throw new NotFoundError("المجموعة غير موجودة");

      const [
        importRow,
        linkedRow,
        invoiceRow,
        paymentRow,
      ] = await Promise.all([
        rawQuery<{ count: string; latestAt: string | null }>(
          `SELECT COUNT(*)::text AS count,
                  MAX("createdAt")::text AS "latestAt"
             FROM umrah_pilgrims
            WHERE "companyId" = $1
              AND "groupId" = $2
              AND "deletedAt" IS NULL`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string }>(
          // Linked = at least one pilgrim in the group whose sub-agent
          // has a clientId set. Same "linked" definition the sub-agent
          // route uses (sub_agent.clientId IS NOT NULL), just folded
          // up to the group level via the pilgrim → sub_agent chain.
          `SELECT COUNT(*)::text AS count
             FROM umrah_pilgrims p
             JOIN umrah_sub_agents sa
               ON sa.id = p."subAgentId"
              AND sa."companyId" = p."companyId"
              AND sa."deletedAt" IS NULL
            WHERE p."companyId" = $1
              AND p."groupId" = $2
              AND p."deletedAt" IS NULL
              AND sa."clientId" IS NOT NULL`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string; total: string; latestAt: string | null }>(
          // groupRefs is the text-LIKE pattern used by the sub-agent
          // variant. Same approach so the two routes return shapes
          // operators can compare 1:1.
          `SELECT COUNT(*)::text AS count,
                  COALESCE(SUM(total), 0)::text AS total,
                  MAX("createdAt")::text AS "latestAt"
             FROM umrah_sales_invoices
            WHERE "companyId" = $1
              AND "deletedAt" IS NULL
              AND "groupRefs" LIKE '%' || $2 || '%'`,
          [scope.companyId, id],
        ),
        rawQuery<{ count: string; total: string; latestAt: string | null }>(
          // Payments via invoices touching this group. Reuses the
          // groupRefs LIKE pattern via an EXISTS subquery so the same
          // string-match semantics carry through.
          `SELECT COUNT(*)::text AS count,
                  COALESCE(SUM("sarAmount"), 0)::text AS total,
                  MAX(pmt."createdAt")::text AS "latestAt"
             FROM umrah_payments pmt
            WHERE pmt."companyId" = $1
              AND pmt."deletedAt" IS NULL
              AND EXISTS (
                SELECT 1 FROM umrah_sales_invoices si
                 WHERE si.id = pmt."invoiceId"
                   AND si."companyId" = pmt."companyId"
                   AND si."deletedAt" IS NULL
                   AND si."groupRefs" LIKE '%' || $2 || '%'
              )`,
          [scope.companyId, id],
        ),
      ]);

      const importedCount = Number(importRow[0]?.count ?? 0);
      const linkedCount = Number(linkedRow[0]?.count ?? 0);
      const invoicedCount = Number(invoiceRow[0]?.count ?? 0);
      const invoicedTotal = Number(invoiceRow[0]?.total ?? 0);
      const collectedCount = Number(paymentRow[0]?.count ?? 0);
      const collectedTotal = Number(paymentRow[0]?.total ?? 0);

      res.json(
        maskFields(req, {
          group: {
            id: group.id,
            name: group.name,
            agentId: group.agentId,
            subAgentId: group.subAgentId,
          },
          stages: [
            {
              stage: "imported",
              count: importedCount,
              ts: importRow[0]?.latestAt ?? null,
            },
            {
              stage: "linked",
              count: linkedCount,
              ts: null,
            },
            {
              stage: "invoiced",
              count: invoicedCount,
              total: invoicedTotal,
              ts: invoiceRow[0]?.latestAt ?? null,
            },
            {
              stage: "collected",
              count: collectedCount,
              total: collectedTotal,
              ts: paymentRow[0]?.latestAt ?? null,
            },
          ],
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "Group journey");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// U-15-P5 — Packages vs. allocations pricing-drift report.
//
// For each umrah_packages row that has been linked to a hotel via the
// U-15-P1 column `defaultHotelId`, compare the package's `costPrice`
// to the *expected* cost computed from the latest active room block
// at that hotel: `expectedCost = duration × ratePerNight`. Surface
// the rows whose drift exceeds the threshold (default 10%) so an
// operator preparing prices for a new season can see the gap before
// signing.
//
// Read-only. Tenant-scoped via p."companyId"+p."deletedAt" IS NULL on
// the packages anchor, with the hotel/block joins inheriting the
// same companyId through their join predicates.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/reports/packages-vs-allocations-pricing-drift",
  authorize({ feature: "umrah", action: "list" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      // The threshold lets the operator pick a tighter window when
      // they're chasing tiny drift, or a wider one when they only
      // want to see major divergence. Default = 10%.
      const thresholdPct = req.query.thresholdPct
        ? Number(req.query.thresholdPct)
        : 10;
      const thresholdFraction = thresholdPct / 100;

      // One round-trip: for each package with a defaultHotelId, fetch
      // the latest active block at that hotel and compute the
      // expected cost. The CASE pegs drift to NULL when the package
      // costPrice is 0 (avoids divide-by-zero), so the FE can render
      // a "not comparable" badge for fresh rows.
      const rows = await rawQuery<{
        packageId: number;
        packageName: string;
        defaultHotelId: number;
        hotelName: string | null;
        duration: number;
        costPrice: string;
        sellPrice: string;
        latestRatePerNight: string | null;
        expectedCost: string | null;
        driftAmount: string | null;
        driftFraction: string | null;
      }>(
        `WITH latest_block AS (
           SELECT DISTINCT ON (rb."hotelId")
                  rb."hotelId",
                  rb."ratePerNight"
             FROM umrah_room_blocks rb
            WHERE rb."companyId" = $1
              AND rb."deletedAt" IS NULL
              AND rb."ratePerNight" IS NOT NULL
            ORDER BY rb."hotelId", rb.id DESC
         )
         SELECT
           p.id   AS "packageId",
           p.name AS "packageName",
           p."defaultHotelId"        AS "defaultHotelId",
           h.name                    AS "hotelName",
           COALESCE(p.duration, 7)   AS duration,
           p."costPrice"::text       AS "costPrice",
           p."sellPrice"::text       AS "sellPrice",
           lb."ratePerNight"::text   AS "latestRatePerNight",
           (lb."ratePerNight" * COALESCE(p.duration, 7))::text
                                     AS "expectedCost",
           (p."costPrice" - lb."ratePerNight" * COALESCE(p.duration, 7))::text
                                     AS "driftAmount",
           CASE
             WHEN p."costPrice" = 0 THEN NULL
             ELSE ((p."costPrice" - lb."ratePerNight" * COALESCE(p.duration, 7))
                   / p."costPrice")::text
           END                       AS "driftFraction"
         FROM umrah_packages p
         JOIN latest_block lb
           ON lb."hotelId" = p."defaultHotelId"
         LEFT JOIN umrah_hotels h
           ON h.id = p."defaultHotelId"
          AND h."companyId" = p."companyId"
          AND h."deletedAt" IS NULL
         WHERE p."companyId" = $1
           AND p."defaultHotelId" IS NOT NULL
           AND p."deletedAt" IS NULL
         ORDER BY p.name
         LIMIT 500`,
        [scope.companyId],
      );

      // The SQL emits one row per linked package; filter to the rows
      // whose drift exceeds the threshold. Numbers come back as
      // strings to preserve precision; convert here for the FE.
      const driftRows = rows
        .map((r) => ({
          packageId: r.packageId,
          packageName: r.packageName,
          defaultHotelId: r.defaultHotelId,
          hotelName: r.hotelName,
          duration: Number(r.duration),
          costPrice: Number(r.costPrice),
          sellPrice: Number(r.sellPrice),
          latestRatePerNight: r.latestRatePerNight === null ? null : Number(r.latestRatePerNight),
          expectedCost: r.expectedCost === null ? null : Number(r.expectedCost),
          driftAmount: r.driftAmount === null ? null : Number(r.driftAmount),
          driftFraction: r.driftFraction === null ? null : Number(r.driftFraction),
        }))
        .filter((r) => r.driftFraction !== null
          && Math.abs(r.driftFraction) >= thresholdFraction);

      res.json(
        maskFields(req, {
          thresholdPct,
          totalPackagesLinked: rows.length,
          driftRows,
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "Pricing-drift report");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// U-19-P6 — Recovery hub aggregate (read-only)
//
// One operator screen that surfaces every stuck stage of the umrah
// journey in a single response. Helps an operator triage what to
// rescue first instead of opening 4 different pages.
//
// Buckets:
//   1. Imports with stuck unlinked rows — batches that ran but still
//      have pilgrims with groupId IS NULL.
//   2. Sub-agents waiting to be linked — sub-agents with NO clientId.
//   3. Groups uninvoiced > 7 days — groups whose pilgrims exist but
//      no sales invoice has been issued.
//   4. Invoices unpaid > 30 days — sales invoices past the 30-day
//      window with paidAmount < total.
//
// READ-ONLY. Tenant-scoped. No writes. Same shape style as the
// journey helpers (P1/P1b) so the FE recovery-hub page can render
// a uniform card grid.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/reports/recovery-hub",
  authorize({ feature: "umrah", action: "list" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;

      // Two operator-tunable thresholds. Both are bound by Number()
      // so a string like ?uninvoicedDays=foo doesn't trickle into the
      // SQL — falls back to the default.
      const uninvoicedDays = Number(req.query.uninvoicedDays) > 0
        ? Number(req.query.uninvoicedDays)
        : 7;
      const unpaidDays = Number(req.query.unpaidDays) > 0
        ? Number(req.query.unpaidDays)
        : 30;

      const [
        stuckImports,
        unlinkedSubAgents,
        uninvoicedGroups,
        unpaidInvoices,
      ] = await Promise.all([
        rawQuery<{ count: string }>(
          // Pilgrims attributed to a sub-agent / agent but never
          // assigned to a group. The U-08 recovery surface handles
          // resolution one-by-one; this is just the count.
          `SELECT COUNT(*)::text AS count
             FROM umrah_pilgrims
            WHERE "companyId" = $1
              AND "groupId" IS NULL
              AND "subAgentId" IS NOT NULL
              AND "deletedAt" IS NULL`,
          [scope.companyId],
        ),
        rawQuery<{ count: string }>(
          // Sub-agents created but never wired to a client. Same shape
          // as the sub-agents/:id/journey "linked" check.
          `SELECT COUNT(*)::text AS count
             FROM umrah_sub_agents
            WHERE "companyId" = $1
              AND "clientId" IS NULL
              AND "deletedAt" IS NULL`,
          [scope.companyId],
        ),
        rawQuery<{ count: string }>(
          // Groups whose pilgrims exist but no sales invoice covers
          // them. groupRefs uses the same LIKE pattern as the
          // journey helpers so the row sets stay consistent.
          // The 7-day threshold is anchored on g."createdAt".
          `SELECT COUNT(DISTINCT g.id)::text AS count
             FROM umrah_groups g
             JOIN umrah_pilgrims p
               ON p."groupId" = g.id
              AND p."companyId" = g."companyId"
              AND p."deletedAt" IS NULL
            WHERE g."companyId" = $1
              AND g."deletedAt" IS NULL
              AND g."createdAt" < NOW() - ($2 || ' days')::interval
              AND NOT EXISTS (
                SELECT 1 FROM umrah_sales_invoices si
                 WHERE si."companyId" = g."companyId"
                   AND si."deletedAt" IS NULL
                   AND si."groupRefs" LIKE '%' || g.id || '%'
              )`,
          [scope.companyId, uninvoicedDays],
        ),
        rawQuery<{ count: string; total: string }>(
          // Sales invoices past unpaidDays with paidAmount < total.
          // Drafts excluded — operator's mental model is "money I
          // expected but never landed".
          `SELECT COUNT(*)::text AS count,
                  COALESCE(SUM(COALESCE(total, 0) - COALESCE("paidAmount", 0)), 0)::text AS total
             FROM umrah_sales_invoices
            WHERE "companyId" = $1
              AND "deletedAt" IS NULL
              AND status NOT IN ('draft', 'void')
              AND "createdAt" < NOW() - ($2 || ' days')::interval
              AND COALESCE("paidAmount", 0) < COALESCE(total, 0)`,
          [scope.companyId, unpaidDays],
        ),
      ]);

      res.json(
        maskFields(req, {
          thresholds: {
            uninvoicedDays,
            unpaidDays,
          },
          buckets: {
            stuckImports: Number(stuckImports[0]?.count ?? 0),
            unlinkedSubAgents: Number(unlinkedSubAgents[0]?.count ?? 0),
            uninvoicedGroups: Number(uninvoicedGroups[0]?.count ?? 0),
            unpaidInvoices: {
              count: Number(unpaidInvoices[0]?.count ?? 0),
              outstandingTotal: Number(unpaidInvoices[0]?.total ?? 0),
            },
          },
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "Recovery-hub aggregate");
    }
  },
);


export default router;
