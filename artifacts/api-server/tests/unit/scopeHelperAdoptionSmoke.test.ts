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
  // communications-sms-webhook.ts: anonymous Twilio inbound webhook
  // (mounted BEFORE authMiddleware — no req.scope exists, so
  // buildScopedWhere is inapplicable). Tenant is RESOLVED from the inbound
  // AccountSid/To, and every read/write is then keyed by that resolved
  // companyId. Manual scope is correct here.
  "communications-sms-webhook.ts",
  "correspondence.ts",
  // customFields.ts: per-company custom-field schema (#2719) — definitions +
  // EAV values. Point lookups / upserts keyed by (companyId, entityType,
  // fieldKey) / (companyId, id); the table is newer than the schema dump so it
  // carries no resource guard (mirrors employee_tracking_policies). Manual
  // companyId scoping is correct here — not a branch list cascade.
  "customFields.ts",
  "digital-signature.ts",
  "documents.ts",
  // employeeTrackingPolicy.ts: Tracking Eligibility Contract control plane —
  // per-employee tracking-policy CRUD + disable + AUDITED location view. All
  // handlers are point lookups / upserts keyed on the caller's single active
  // scope.companyId (the contract is companyId-scoped to the active company),
  // and the location view is a per-target gated endpoint, not a multi-company
  // list cascade — buildScopedWhere adds no behaviour here. Mirrors
  // myFieldTracking.ts / finance-memory.ts. Allowlisted with justification.
  "employeeTrackingPolicy.ts",
  "execDashboard.ts",
  "export.ts",
  "finance-algorithms.ts",
  // finance-cash-in-transit.ts: #2714 clearing-account transfers (2-phase JE
  // via the existing engine). List/lookup/confirm keyed by (companyId, id /
  // status); point-lookup + per-row state advance, not a branch list cascade.
  // Manual companyId scoping is correct here (mirrors finance-memory.ts).
  "finance-cash-in-transit.ts",
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
  // finance-recurring-invoices.ts: customer recurring-invoice templates +
  // run/run-due (generation reuses financialEngine.postSalesInvoice). List/
  // lookup/run keyed by (companyId, id); point-lookup + per-company due run,
  // not a branch list cascade. Manual companyId scoping is correct here.
  "finance-recurring-invoices.ts",
  // finance-pricing.ts: إحياء «قواعد التسعير» (مخطّط 171 المُطبّع). CRUD نقطي على
  // pricing_rules/conditions/actions، كلّها مفلترة بـ scope.companyId داخل
  // transactions (point-lookup/per-company، يطابق finance-amortization.ts؛ لا
  // cascade فروع). معتمد بمراجعة المجلس «يُعتمد» + تحقّق مستقلّ.
  "finance-pricing.ts",
  // fleet-inspections.ts: vehicle inspection + photos (متابعة النقل بالصور,
  // PR1). Mostly point operations keyed by (companyId, id) — get/update/delete/
  // approve/reject a single inspection or photo — plus one filtered list. The
  // company predicate is a literal `"companyId" = $N` per tenant-point-lookup;
  // buildScopedWhere targets multi-company branch list cascades which this
  // surface intentionally isn't. Manual scope.companyId is correct here.
  "fleet-inspections.ts",
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
  // site.ts: multi-tenant website/CMS control plane. Generic dynamic-table
  // handlers keyed on the caller's single active scope.companyId; the site_*
  // tables are company-only (no branchId) so buildScopedWhere's branch cascade
  // doesn't apply. Manual companyId scoping is correct here.
  "site.ts",
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
  // umrah-accommodation.ts: U-07 Phase 4 split — 9 accommodation routes (hotels /
  // room-blocks / room-allocations) carved verbatim out of umrah-entities.ts.
  // Point lookups + per-tenant CRUD keyed on (companyId, id); inherits the same
  // allowlist justification as the parent umrah-entities.ts.
  "umrah-accommodation.ts",
  // umrah-commission.ts: U-07 Phase 5 split — 8 commission-plan / calculation
  // routes carved verbatim out of umrah-entities.ts. Point lookups + per-tenant
  // CRUD keyed on (companyId, id); inherits the same allowlist justification as
  // the parent umrah-entities.ts.
  "umrah-commission.ts",
  // umrah-entities.ts removed from the allowlist in U-07 Phase 24 — it became a
  // pure aggregator (zero routes, zero queries), so it no longer matches the
  // manual-scope criteria. The ratchet only moves forward.
  // umrah-sub-agents.ts: U-07 Phase 6 split — 9 sub-agents CRUD + linking routes
  // carved verbatim out of umrah-entities.ts. Point lookups + per-tenant CRUD
  // keyed on (companyId, id); inherits the same allowlist justification as the
  // parent umrah-entities.ts.
  "umrah-sub-agents.ts",
  // umrah-pricing.ts: U-07 Phase 7 split — 4 pricing CRUD routes carved verbatim
  // out of umrah-entities.ts. Point lookups + per-tenant CRUD keyed on
  // (companyId, id); inherits the same allowlist justification as the parent
  // umrah-entities.ts.
  "umrah-pricing.ts",
  // umrah-import-batches.ts: U-07 Phase 8 split — import-batches listing +
  // unlinked-rows recovery (4 routes) carved verbatim out of umrah-entities.ts.
  // Per-tenant point lookups + a transactional bulk-link keyed on
  // (companyId, id/batchId); inherits the same allowlist justification as the
  // parent umrah-entities.ts.
  "umrah-import-batches.ts",
  // umrah-statements.ts: U-07 Phase 9 split — 2 read-only sub-agent statement
  // routes (JSON + PDF) carved verbatim out of umrah-entities.ts. The single
  // SQL is a (companyId, id) sub-agent header lookup; the balances come from
  // generateStatement (engine). No list cascade for buildScopedWhere — inherits
  // the same allowlist justification as the parent umrah-entities.ts.
  "umrah-statements.ts",
  // umrah-attachments.ts: U-07 Phase 10 split — 3 attachments routes (polymorphic
  // document storage) carved verbatim out of umrah-entities.ts. Per-tenant point
  // ops on the shared documents store keyed on (companyId, …) + a per-entityType
  // owner-table whitelist; no list cascade for buildScopedWhere — inherits the
  // same allowlist justification as the parent umrah-entities.ts.
  "umrah-attachments.ts",
  // umrah-reports.ts: U-07 Phase 11 split — 6 read-only operational reports
  // (daily-runsheet, reconciliation, exempt-pilgrims, group/season portfolio)
  // carved verbatim out of umrah-entities.ts. Pure SELECT aggregates scoped on
  // (companyId, …) at every reach; no list cascade for buildScopedWhere —
  // inherits the same allowlist justification as the parent umrah-entities.ts.
  "umrah-reports.ts",
  // umrah-letters.ts: U-07 Phase 12 split — 2 letter routes (PDF + dispatch)
  // carved verbatim out of umrah-entities.ts. Point lookups + a dispatch UPDATE
  // on the shared official_letters table keyed on (companyId, id); no list
  // cascade for buildScopedWhere — inherits the same allowlist justification as
  // the parent umrah-entities.ts.
  "umrah-letters.ts",
  // umrah-refunds.ts: U-07 Phase 14 split — 6 refund-request lifecycle routes
  // (request → approve/reject → pay → close) carved verbatim out of
  // umrah-entities.ts. List + point lookups + status UPDATEs on the umrah-owned
  // umrah_refund_requests table keyed on (companyId, id); no list cascade for
  // buildScopedWhere — inherits the same allowlist justification as the parent
  // umrah-entities.ts.
  "umrah-refunds.ts",
  // umrah-calendar.ts: U-07 Phase 15 split — the read-only operational calendar
  // aggregator (/calendar/events) carved verbatim out of umrah-entities.ts.
  // Pure SELECT aggregates per layer scoped on (companyId, …); no list cascade
  // for buildScopedWhere — inherits the same allowlist justification as the
  // parent umrah-entities.ts.
  "umrah-calendar.ts",
  // umrah-settings.ts: U-07 Phase 18 split — settings-policies catalog (GET) +
  // per-category save (PUT) carved verbatim out of umrah-entities.ts. The GET
  // reads the shared key-value `settings` table scoped on (key, scope, scopeId);
  // the PUT persists via the upsertSetting service helper. No list cascade for
  // buildScopedWhere — inherits the same allowlist justification as the parent
  // umrah-entities.ts.
  "umrah-settings.ts",
  // umrah-nusk-invoices.ts: U-07 Phase 19 split — nusk-invoice CRUD (list/get/
  // create/update/delete) + AP journal posting via the postNuskJournalEntries
  // engine, carved verbatim out of umrah-entities.ts. All reads are tenant-scoped
  // with explicit `"companyId" = $n AND "deletedAt" IS NULL`; the manual scoping
  // inherits the same allowlist justification as the parent umrah-entities.ts.
  "umrah-nusk-invoices.ts",
  // umrah-payments.ts: U-07 Phase 20 split — payment register (POST) + list (GET)
  // via the registerPayment engine, plus retroactive revenue reclassification via
  // the reclassifyRevenueForInvoices engine, carved verbatim out of
  // umrah-entities.ts. The GET reads umrah_payments tenant-scoped with explicit
  // `"companyId" = $n AND "deletedAt" IS NULL`; same allowlist justification as
  // the parent.
  "umrah-payments.ts",
  // umrah-invoices.ts: U-07 Phase 21 split — sales-invoice list/generate/
  // sales-wizard/patch carved verbatim out of umrah-entities.ts. The GET reads
  // umrah_sales_invoices tenant-scoped with explicit `"companyId" = $n AND
  // "deletedAt" IS NULL`; same allowlist justification as the parent.
  "umrah-invoices.ts",
  // umrah-groups.ts: U-07 Phase 22 split — groups CRUD (list/get/create/update/
  // delete) carved verbatim out of umrah-entities.ts. Reads umrah_groups
  // tenant-scoped with explicit `"companyId" = $n AND "deletedAt" IS NULL`; same
  // allowlist justification as the parent.
  "umrah-groups.ts",
  // umrah-group-transport.ts: U-07 Phase 23 split — group service-contract
  // (transport-requests POST/GET via the umrahTransportContract engine) + the
  // read-only cost-breakdown aggregation, carved verbatim out of
  // umrah-entities.ts. cost-breakdown reads umrah_nusk_invoices / umrah_sales_
  // invoices tenant-scoped with explicit `"companyId" = $n`; same allowlist
  // justification as the parent.
  "umrah-group-transport.ts",
  // umrah-employee-assignments.ts: U-07 Phase 24 split (final carve) — the
  // GET /employees/:employeeId/assignments read carved verbatim out of
  // umrah-entities.ts (which is now a pure aggregator). Tenant-scoped with
  // explicit `"companyId" = $2`; same allowlist justification as the parent.
  "umrah-employee-assignments.ts",
  // umrah-journey-reports.ts: U-07 Phase 1 split — 4 read-only journey/recovery/
  // pricing-drift routes carved out of umrah-entities.ts verbatim. Pure SELECT
  // aggregates keyed on (companyId, …); inherits the same allowlist
  // justification as the parent umrah-entities.ts (calendar/aggregate shape,
  // not list cascades).
  "umrah-journey-reports.ts",
  // umrah-families.ts: U-07 Phase 2 split — 5 families CRUD routes carved
  // verbatim out of umrah-entities.ts. Point lookups + per-tenant CRUD keyed
  // on (companyId, id); inherits the same allowlist justification as the
  // parent umrah-entities.ts.
  "umrah-families.ts",
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
      // +1 total/manualOnly: U-07 Phase 1 routes/umrah-journey-reports.ts
      // — 4 read-only journey/recovery/pricing-drift routes carved verbatim
      // out of umrah-entities.ts. Same aggregate shape and same allowlist
      // justification as the parent.
      // +1 total/manualOnly: routes/communications-sms-webhook.ts — anonymous
      // Twilio SMS inbound webhook (no req.scope; tenant resolved from the
      // inbound payload, then keyed by the resolved companyId). Allowlisted.
      // +1 total/manualOnly: routes/employeeTrackingPolicy.ts — Tracking
      // Eligibility Contract control plane (per-employee tracking-policy CRUD +
      // disable + AUDITED location view). Point lookups/upserts keyed on the
      // caller's single active scope.companyId + a per-target gated location
      // view, not a multi-company list cascade. Allowlisted with justification.
      // +3 total/manualOnly: this session's three new finance/settings route
      // files ship with manual companyId scoping: routes/customFields.ts (#2719),
      // routes/finance-cash-in-transit.ts (#2714), routes/finance-recurring-invoices.ts.
      // +1 total ONLY: routes/realtime.ts — SSE live-push stream. A single GET
      // that self-authenticates (EventSource can't set headers) and derives the
      // tenant from the active assignment by id; it holds an open stream rather
      // than a scoped list, so buildScopedWhere doesn't apply AND there is no
      // manual companyId list-predicate (its lookup is keyed by assignment id).
      // Tenant isolation is enforced in realtimeHub (per-company buckets), not
      // a SQL predicate — so it counts under neither helperUsers nor manualOnly.
      // +3 total/manualOnly: this session (customFields/finance-cash-in-transit/
      // finance-recurring-invoices) + see entries above.
      // +1 total/manualOnly: routes/fleet-inspections.ts (متابعة النقل بالصور,
      // PR1) — vehicle inspection + photos CRUD, point ops keyed by
      // (companyId, id) + one filtered list; allowlisted with justification
      // (mirrors fleet-optimizer.ts, tenant-point-lookup, no branch cascade).
      // +1 total/manualOnly: routes/finance-pricing.ts — إحياء «قواعد التسعير»
      // (مخطّط 171 المُطبّع). CRUD نقطي + upserts على (companyId, id) داخل
      // transactions، يطابق finance-amortization.ts؛ لا cascade فروع. allowlisted.
      // +1 total/manualOnly: U-07 Phase 2 routes/umrah-families.ts — 5 families
      // CRUD routes carved verbatim out of umrah-entities.ts. Same allowlist
      // justification as the parent.
      // +1 total/manualOnly: U-07 Phase 4 routes/umrah-accommodation.ts — 9
      // accommodation routes (hotels / room-blocks / allocations) carved verbatim
      // out of umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 5 routes/umrah-commission.ts — 8
      // commission-plan / calculation routes carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 6 routes/umrah-sub-agents.ts — 9
      // sub-agents CRUD + linking routes carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 7 routes/umrah-pricing.ts — 4 pricing
      // CRUD routes carved verbatim out of umrah-entities.ts. Same allowlist
      // justification as the parent.
      // +1 total/manualOnly: U-07 Phase 8 routes/umrah-import-batches.ts —
      // import-batches listing + unlinked-rows recovery carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 9 routes/umrah-statements.ts — 2
      // read-only sub-agent statement routes (JSON + PDF) carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 10 routes/umrah-attachments.ts — 3
      // attachments routes (polymorphic document storage) carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 11 routes/umrah-reports.ts — 6 read-only
      // operational reports carved verbatim out of umrah-entities.ts. Same
      // allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 12 routes/umrah-letters.ts — 2 letter
      // routes (PDF + dispatch) carved verbatim out of umrah-entities.ts. Same
      // allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 14 routes/umrah-refunds.ts — 6
      // refund-request lifecycle routes carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 15 routes/umrah-calendar.ts — the
      // read-only operational calendar aggregator carved verbatim out of
      // umrah-entities.ts. Same allowlist justification as the parent.
      // +1 total/manualOnly: U-07 Phase 18 routes/umrah-settings.ts — the
      // settings-policies catalog (GET) + per-category save (PUT) carved
      // verbatim out of umrah-entities.ts. Same allowlist justification.
      // +1 total/manualOnly: U-07 Phase 19 routes/umrah-nusk-invoices.ts — the
      // nusk-invoice CRUD + AP journal posting carved verbatim out of
      // umrah-entities.ts. Same allowlist justification.
      // +1 total/manualOnly: U-07 Phase 20 routes/umrah-payments.ts — payments
      // register/list + revenue reclassification carved verbatim out of
      // umrah-entities.ts. Same allowlist justification.
      // +1 total/manualOnly: U-07 Phase 21 routes/umrah-invoices.ts — sales-
      // invoice list/generate/sales-wizard/patch carved verbatim out of
      // umrah-entities.ts. Same allowlist justification.
      // +1 total/manualOnly: U-07 Phase 22 routes/umrah-groups.ts — groups CRUD
      // carved verbatim out of umrah-entities.ts. Same allowlist justification.
      // +1 total/manualOnly: U-07 Phase 23 routes/umrah-group-transport.ts —
      // group service-contract + cost-breakdown carved verbatim out of
      // umrah-entities.ts. Same allowlist justification.
      // U-07 Phase 24: +1 total for routes/umrah-employee-assignments.ts (the
      // final carve); manualOnly net-unchanged — the new file is manual-scope
      // (+1) while umrah-entities.ts became a pure aggregator and dropped out
      // (−1). total counts the route file either way.
      // +1 total: routes/fleet-driver-hours.ts (أجر السائق بالساعة، الدفعة 1).
      // وحدة تحكّم رفيعة — كل وصول للبيانات والعزل الإيجاري في lib/fleet/driverHours.ts،
      // فالراوت بلا scope مباشر (manualOnly دون تغيير).
      // +1 total: routes/hr-driver-pay.ts (معدّلات أجر السائق، الدفعة 2). وحدة
      // تحكّم رفيعة كذلك — العزل في lib/hr/driverPayRates.ts (manualOnly دون تغيير).
      // +1 total: routes/fleet-movement-bonuses.ts (مكافآت حركات النقل، الدفعة أ).
      // وحدة تحكّم رفيعة — العزل في lib/fleet/movementBonuses.ts (manualOnly دون تغيير).
      // +1 total/manualOnly: routes/site.ts — multi-tenant website/CMS control
      // plane (config + packages/services/hotels/posts CRUD). Generic dynamic-
      // table handlers keyed on the caller's single active scope.companyId; the
      // site_* tables are company-only (NO branchId), so buildScopedWhere's
      // branch cascade doesn't apply. Allowlisted with justification.
      total: 158,
      helperUsers: 39,
      manualOnly: 111,
    });
  });
});
