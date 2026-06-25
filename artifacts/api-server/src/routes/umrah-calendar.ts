// ─────────────────────────────────────────────────────────────────────────────
// umrah-calendar.ts — OPERATIONAL UMRAH CALENDAR (U-07 Phase 15)
//
// Route carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(calendarRouter)` in umrah-entities.ts so the API
// surface stays identical (path still resolves at /umrah/calendar/events).
//
// Pure code move — handler + RBAC + the exported CalendarLayer type and
// CALENDAR_LAYER_META metadata are carried over VERBATIM (no behaviour change).
// READ-ONLY: a layer-aware aggregator over existing date columns
// (arrivals/departures/visa-expiry/overstay/transport/nusk). No writes, no
// ledger posting, no cross-domain writes — so no audit/event helpers are
// needed.
//
// Routes owned here:
//   GET /calendar/events
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";

const router = Router();

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


export default router;
