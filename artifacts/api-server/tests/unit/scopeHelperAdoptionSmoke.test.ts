/**
 * GAP_MATRIX item #13 — scope helper adoption ratchet.
 *
 * Pins the current set of route files that still use manual
 * `"companyId" = $1` WHERE clauses instead of the
 * `buildScopedWhere` / `scopedQuery` / `scopedCount` helpers from
 * `lib/scopedQuery.ts`. A scope leak in any route file is a
 * cross-tenant data exposure; the helper is the single point that
 * enforces `req.scope.allowedCompanies`.
 *
 * The test is a one-way ratchet:
 *
 *   - If a NEW route file adopts manual scope (and isn't on the
 *     allowlist below), the test fails and the diff reviewer must
 *     either migrate the route to the helper OR explicitly add the
 *     file to the allowlist with a written justification.
 *
 *   - If an existing allowlisted file fully migrates off manual
 *     scope, the test fails (the file is no longer in the manual
 *     bucket). The fix is to remove the file from the allowlist —
 *     this is the desired direction.
 *
 * Net effect: count only drops over time. New code can't quietly
 * extend the manual-scope backlog.
 *
 * See docs/audit/SCOPE_HELPER_ADOPTION_AUDIT.md for the full
 * migration plan + risk ranking + recommended migration order.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = join(import.meta.dirname!, "..", "..", "src", "routes");

// Files that currently use manual `"companyId" = $N` / `scope.companyId`
// WHERE clauses without the buildScopedWhere helper. Sorted alphabetically
// so diffs are clean. Drop a file from this list when it fully migrates;
// add a file to it (with a one-line justification comment) only after
// explicit sign-off in code review.
const MANUAL_SCOPE_ALLOWLIST = new Set<string>([
  "accounting-engine.ts",
  "activityIngest.ts",
  "activityLog.ts",
  "admin-ai-governance.ts",
  "admin-communication-control.ts",
  "admin-notification-routing.ts",
  "admin-observability.ts",
  "admin-pbx-control.ts",
  "admin-vendor-settings.ts",
  "admin.ts",
  "approvalActions.ts",
  // assistant.ts: curated owner Q&A — vetted aggregate queries keyed by
  // (companyId), not list endpoints; manual companyId scoping is correct here.
  "assistant.ts",
  "auth.ts",
  "automation.ts",
  "bi.ts",
  "calendar.ts",
  "cargo.ts",
  "careersPortal.ts",
  "clientPortal.ts",
  "communications.ts",
  "correspondence.ts",
  "digital-signature.ts",
  "documents.ts",
  "execDashboard.ts",
  "export.ts",
  "finance-algorithms.ts",
  // finance-amortization.ts: FIN-TIME-SPREADING (#2247) prepaid-amortization
  // CRUD + run trigger. List/insert/run keyed by (companyId, …) — point
  // lookups + a per-company recognition run, not a branch list cascade.
  // Manual scope.companyId scoping is correct here (mirrors finance-memory.ts).
  "finance-amortization.ts",
  // finance-deferred-revenue.ts: FIN-DEFERRED-REVENUE (#2248) deferred-revenue
  // recognition CRUD + run trigger — the symmetric counterpart of
  // finance-amortization.ts. List/insert/run keyed by (companyId, …) — point
  // lookups + a per-company recognition run, not a branch list cascade. Manual
  // scope.companyId scoping is correct here (mirrors finance-amortization.ts).
  "finance-deferred-revenue.ts",
  "finance-custodies.ts",
  // finance-datafix.ts: #2090 FIN-DATAFIX READ-ONLY misparented-subsidiary
  // inventory. A single GET keyed on scope.companyId that delegates to
  // buildMisparentedSubsidiaryInventory (lib/finance/datafixInventory.ts); the
  // company predicate is applied in the lib SELECT. Aggregate report shape, not
  // a branch list cascade — buildScopedWhere has no branch filter to add.
  "finance-datafix.ts",
  "finance-gl-helpers.ts",
  "finance-hardening.ts",
  // finance-insurance.ts: FIN-PROPERTY-MEDICAL-INSURANCE (#2249) insurance
  // premium posting + amortization schedule insertion. Three short POST
  // handlers keyed by (companyId, …) — point-lookup shape, no list cascade;
  // mirrors finance-amortization.ts. Manual scope.companyId is correct here.
  "finance-insurance.ts",
  // finance-memory.ts: financial-memory CRUD (manual journal templates,
  // expense-category memory, supplier finance defaults). Point lookups +
  // upserts keyed by (companyId, supplierId)/(companyId, categoryKey)/
  // (companyId, id) — not list cascades; tight scope.companyId scoping is
  // correct here (mirrors parties.ts/org.ts), buildScopedWhere targets
  // company/branch list cascades which this surface intentionally isn't.
  "finance-memory.ts",
  // fleet-optimizer.ts: TA-T18-VRP Phase 2 — five short handlers that
  // each touch a single tenant-scoped table with literal `"companyId" =
  // $N`; the buildScopedWhere helper adds noise without changing
  // behaviour. Manual is the right call here and is explicitly signed
  // off in this file.
  "fleet-optimizer.ts",
  "fleet-telematics-webhook.ts",
  "fleet-telematics.ts",
  "governance.ts",
  "hr-compliance.ts",
  "hr-discipline.ts",
  "hr-wps.ts",
  "impactPreview.ts",
  "import.ts",
  "inbox.ts",
  "index.ts",
  "intelligence.ts",
  "mailboxes.ts",
  "marketing.ts",
  // meInsights.ts: IGOC-006 — /me/proactive-insights surface. Aggregates
  // 9 categories inside one Promise.all, each query scoped on the user's
  // active context (scope.companyId / scope.activeAssignmentId /
  // scope.employeeId). The endpoint is point-lookup-shaped (LIMIT 5 per
  // category) — buildScopedWhere is for list cascades with branch +
  // department filtering, which this surface intentionally doesn't do
  // because the role gate (ifRole) already narrows visibility.
  "meInsights.ts",
  // myFieldTracking.ts: PR-9 (#2077) self-service field-tracking mount.
  // scope.companyId appears only in emitEvent() calls for audit metadata,
  // not in SQL WHERE clauses. Both endpoints serve the caller's own data
  // via scope.userId; buildScopedWhere's branch-cascade doesn't apply.
  "myFieldTracking.ts",
  "moduleDashboards.ts",
  "mySpace.ts",
  "notification-engine.ts",
  "numbering.ts",
  "obligations.ts",
  // org.ts: admin CRUD for the operational enterprise model (#1799 §B —
  // legal_entities, positions, teams, committees, supervision_lines,
  // approval_authorities). Tight (companyId = $1) scoping is correct here:
  // every list/write is per-company by design and templates (companyId
  // IS NULL for positions) are read-only system rows.
  "org.ts",
  "pdpl.ts",
  "permissions.ts",
  // parties.ts: master-data registry — point lookups by (companyId, entityTable,
  // entityId) / (companyId, id), not list endpoints. Manual companyId scoping is
  // correct here; buildScopedWhere targets company/branch list cascades. (slice 1)
  "parties.ts",
  "print.ts",
  "properties.ts",
  "publicData.ts",
  "rbacV2.ts",
  "recruitment.ts",
  "requests.ts",
  "rules.ts",
  "scheduled-reports.ts",
  "search.ts",
  "storage.ts",
  "store.ts",
  "training.ts",
  // transport-billing-candidates.ts: accountant queue for the #1733 handoff.
  // Three small endpoints, each a single-row lookup by id keyed on
  // (companyId, id) — no list cascade where buildScopedWhere would add
  // branch/department filtering. Manual companyId scoping is correct here.
  "transport-billing-candidates.ts",
  // transport-calendar.ts: TR-022 unified transport calendar — per-day
  // COUNT roll-ups keyed on (companyId, date) across 5 layers, mirroring
  // calendar.ts / umrah-entities.ts. Aggregate shape, not a list cascade —
  // buildScopedWhere has no branch/department filter to add.
  "transport-calendar.ts",
  // transport-bookings.ts: #1733 Booking + Dispatch layer. List queries
  // filter by (companyId, status / customer / date window) — buildScopedWhere
  // would unnecessarily branch-cascade. The booking lookup is by id keyed on
  // (companyId, id) like the other transport surfaces.
  "transport-bookings.ts",
  // vehicle-profile.ts: #1733 vehicle sub-resources (components, driver
  // assignments, maintenance schedules). All endpoints are scoped by
  // (companyId, vehicleId) and the vehicle ownership is checked up front
  // by assertVehicleBelongsToTenant — buildScopedWhere has nothing to add.
  "vehicle-profile.ts",
  // transport-pricing.ts: #1733 pricing engine + service-line queue +
  // invoice-batch merger. All queries are scoped on (companyId, customerId
  // / serviceType / status / date window) — buildScopedWhere has no
  // branch cascade to add.
  "transport-pricing.ts",
  // transport-planning.ts: #1812 planning engine — assignment suggestion,
  // ops dashboard, itineraries, driver navigation sessions. All queries
  // are scoped on (companyId, id/dispatchOrderId/…) — buildScopedWhere
  // has no branch cascade to add.
  "transport-planning.ts",
  // transport-integration.ts: #1812 governing comment — pulls bookings
  // from umrah groups + iCalendar feed. Pure cross-domain reads scoped
  // on (companyId, sourceTable.id) — buildScopedWhere has no branch
  // cascade to add for a cross-domain bridge.
  "transport-integration.ts",
  "fleet-rules-admin.ts",
  // transport-route-patterns.ts: #1812 Comment 4663005810 — cargo recurring
  // schedule template. List/lookup keyed on (companyId, id) — same shape as
  // the other transport surfaces; buildScopedWhere has no branch cascade to add.
  "transport-route-patterns.ts",
  // transport-control-tower.ts: #1812 Control Tower — fleet-state aggregate
  // endpoint. All COUNT(*) FILTER roll-ups keyed on (companyId, date) across
  // vehicles/drivers/dispatches/bookings; aggregate shape, not a list cascade —
  // buildScopedWhere has no branch/department filter to add.
  "transport-control-tower.ts",
  "umrah-entities.ts",
  "umrah.ts",
  "wiring-stubs.ts",
  "workspace.ts",
]);

interface Audit {
  file: string;
  manualHits: number;
  usesHelper: boolean;
}

function auditRoutes(): Audit[] {
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"));
  const results: Audit[] = [];
  for (const f of files) {
    const src = readFileSync(join(ROUTES_DIR, f), "utf8");
    // Strip block + line comments so a literal `"companyId" = $1` inside
    // a JSDoc doesn't count as manual scope.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const manualMatches = [
      ...stripped.matchAll(/"companyId"\s*=\s*\$\d+/g),
      ...stripped.matchAll(/\bscope[!?]?\.companyId\b/g),
    ];
    const usesHelper =
      /buildScopedWhere|scopedQuery|scopedCount/.test(stripped);
    results.push({
      file: f,
      manualHits: manualMatches.length,
      usesHelper,
    });
  }
  return results;
}

describe("scope helper adoption ratchet — GAP_MATRIX #13", () => {
  it("every route file with manual scope is on the allowlist", () => {
    const audit = auditRoutes();
    const newOffenders = audit
      .filter((a) => a.manualHits > 0 && !a.usesHelper)
      .filter((a) => !MANUAL_SCOPE_ALLOWLIST.has(a.file))
      .map((a) => a.file)
      .sort();
    expect(
      newOffenders,
      "A route file is using manual `\"companyId\" = $N` WHERE clauses " +
        "without the buildScopedWhere helper, and is NOT on the allowlist. " +
        "Either migrate the route to use lib/scopedQuery.ts, or — with " +
        "explicit code-review sign-off — add the file to " +
        "MANUAL_SCOPE_ALLOWLIST. See docs/audit/SCOPE_HELPER_ADOPTION_AUDIT.md.",
    ).toEqual([]);
  });

  it("every allowlisted file still actually has manual scope", () => {
    // If this fires, an allowlisted file has been migrated off manual
    // scope (good!). Drop it from MANUAL_SCOPE_ALLOWLIST so the ratchet
    // moves forward.
    const audit = auditRoutes();
    const cleaned = [...MANUAL_SCOPE_ALLOWLIST].filter((f) => {
      const a = audit.find((x) => x.file === f);
      if (!a) return true; // file was deleted — also a reason to drop
      return !(a.manualHits > 0 && !a.usesHelper);
    });
    expect(
      cleaned,
      "An allowlisted file no longer matches manual-scope criteria. " +
        "Remove it from MANUAL_SCOPE_ALLOWLIST — the ratchet should " +
        "always move forward.",
    ).toEqual([]);
  });

  it("snapshot: current adoption rate", () => {
    const audit = auditRoutes();
    const total = audit.length;
    const helperUsers = audit.filter((a) => a.usesHelper).length;
    const manualOnly = audit.filter(
      (a) => a.manualHits > 0 && !a.usesHelper,
    ).length;
    // This assertion is informational — fails loudly if the route
    // count or adoption ratio shifts significantly. Update the
    // expected numbers when migrations land or new routes ship.
    expect({ total, helperUsers, manualOnly }).toEqual({
      // +2 total/helperUsers: routes/warehouse-cycle-counts.ts and
      // routes/warehouse-advanced.ts both ship with buildScopedWhere
      // adopted from day one (company-level list cascades).
      // +1 total/helperUsers: routes/inboxConversations.ts (#2138)
      // ships with buildScopedWhere adopted from day one.
      // +1 total/manualOnly: PR-9 (#2077) added routes/myFieldTracking.ts
      // — self-service field tracking. It's a 2-endpoint router (GET
      // /eligibility + POST /ping) that does NOT use buildScopedWhere
      // because both routes serve the caller's own data via
      // scope.userId (selfService:true), where scoped lists wouldn't
      // apply. Counted under manualOnly to preserve the invariant.
      // +1 total/manualOnly: routes/finance-memory.ts (financial-memory
      // foundation) — point-lookup/upsert CRUD keyed by (companyId, …),
      // allowlisted above with justification (mirrors parties.ts/org.ts).
      // +1 total/manualOnly: TR-022 routes/transport-calendar.ts — unified
      // transport calendar aggregate keyed on (companyId, date); allowlisted
      // like calendar.ts / umrah-entities.ts (no list-cascade branch filter).
      // +1 total/manualOnly: FIN-TIME-SPREADING (#2247)
      // routes/finance-amortization.ts — prepaid-amortization CRUD + run
      // trigger keyed by (companyId, …); allowlisted with justification
      // (mirrors finance-memory.ts, point-lookup/per-company-run shape).
      // +1 total/manualOnly: FIN-DEFERRED-REVENUE (#2248)
      // routes/finance-deferred-revenue.ts — deferred-revenue recognition CRUD
      // + run trigger keyed by (companyId, …); allowlisted with justification
      // (the symmetric counterpart of finance-amortization.ts).
      // +1 total/manualOnly: TA-T18-VRP Phase 2 routes/fleet-optimizer.ts
      // — five short handlers each scoped on a single tenant table; the
      // helper adds noise without behaviour change, manual is intentional.
      // +1 total/manualOnly: FIN-PROPERTY-MEDICAL-INSURANCE (#2249)
      // routes/finance-insurance.ts — insurance premium posting + schedule
      // insertion. Three short POST handlers keyed by (companyId, …);
      // mirrors finance-amortization.ts (point-lookup, no branch cascade).
      // +1 total/manualOnly: #2090 FIN-DATAFIX routes/finance-datafix.ts —
      // READ-ONLY misparented-subsidiary inventory. Single GET keyed on
      // scope.companyId (predicate applied in lib/finance/datafixInventory.ts);
      // aggregate report shape, no branch list cascade for buildScopedWhere.
      // +1 total/manualOnly: routes/transport-control-tower.ts (#1812)
      // Control Tower — fleet-state aggregate keyed on (companyId, date);
      // aggregate shape, no list-cascade branch filter for buildScopedWhere.
      total: 127,
      helperUsers: 39,
      manualOnly: 85,
    });
  });
});
