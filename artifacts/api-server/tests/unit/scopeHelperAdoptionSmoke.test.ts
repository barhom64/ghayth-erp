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
  "finance-custodies.ts",
  "finance-gl-helpers.ts",
  "finance-hardening.ts",
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
  "moduleDashboards.ts",
  "mySpace.ts",
  "notification-engine.ts",
  "numbering.ts",
  "obligations.ts",
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
      total: 110,
      helperUsers: 36,
      manualOnly: 71,
    });
  });
});
