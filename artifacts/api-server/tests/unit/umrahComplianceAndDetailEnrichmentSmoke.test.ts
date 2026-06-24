import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins three post-#1498 follow-ups:
 *
 * (1) /umrah/penalties/:id detail enrichment — audit trail (created-by
 *     / updated-by names + linked journal entry + linked invoice).
 *
 * (2) /umrah/transport/:id detail enrichment — defence-in-depth on the
 *     cross-domain fleet JOINs + pilgrim status breakdown +
 *     utilisation %.
 *
 * (3) /umrah/reports/compliance + /umrah/compliance — single screen
 *     folding the 4 metrics the audit officer used to chase across
 *     separate pages (exempt, visa-expiring, overstaying, unpaid
 *     penalties).
 */
const ROUTE_UMRAH = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
// U-07 Phase 13 — /reports/compliance carved into umrah-reports.ts.
const ROUTE_ENT = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const COMPLIANCE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/compliance.tsx"),
  "utf8",
);
const ROUTES_TSX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const TABS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

const PENALTY_DETAIL = (() => {
  const m = ROUTE_UMRAH.match(/router\.get\("\/penalties\/:id"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("penalties/:id handler not found");
  return m[0];
})();
const TRANSPORT_DETAIL = (() => {
  const m = ROUTE_UMRAH.match(/router\.get\("\/transport\/:id"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("transport/:id handler not found");
  return m[0];
})();
const COMPLIANCE_HANDLER = (() => {
  const m = ROUTE_ENT.match(/router\.get\("\/reports\/compliance"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("/reports/compliance handler not found");
  return m[0];
})();

describe("GET /umrah/penalties/:id — audit-trail enrichment", () => {
  it("JOINs umrah_seasons tenant-safely so seasonTitle is human-readable", () => {
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN umrah_seasons s\s+ON pen\."seasonId"\s*= s\.id\s+AND s\."companyId"\s*= pen\."companyId"\s+AND s\."deletedAt"\s*IS NULL/);
  });

  it("JOINs users → employees twice for createdBy + updatedBy attribution", () => {
    // Same `COALESCE(employee.name, user.email)` shape as the
    // timeline endpoint (PR #1484) so the audit display is uniform.
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN users uc\s+ON uc\.id\s*= pen\."createdBy"/);
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN employees emp_c\s+ON emp_c\.id\s*= uc\."employeeId"/);
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN users uu\s+ON uu\.id\s*= pen\."updatedBy"/);
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN employees emp_u\s+ON emp_u\.id\s*= uu\."employeeId"/);
    expect(PENALTY_DETAIL).toMatch(/COALESCE\(emp_c\.name, uc\.email\) AS "createdByName"/);
    expect(PENALTY_DETAIL).toMatch(/COALESCE\(emp_u\.name, uu\.email\) AS "updatedByName"/);
  });

  it("linked journal entry + invoice JOINs are tenant-safe", () => {
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN journal_entries je\s+ON je\.id\s*= pen\."journalEntryId"\s+AND je\."companyId"\s*= pen\."companyId"\s+AND je\."deletedAt"\s*IS NULL/);
    expect(PENALTY_DETAIL).toMatch(/LEFT JOIN umrah_agent_invoices inv\s+ON inv\.id\s*= pen\."invoiceId"\s+AND inv\."companyId"\s*= pen\."companyId"\s+AND inv\."deletedAt"\s*IS NULL/);
  });
});

describe("GET /umrah/transport/:id — defence-in-depth + aggregates", () => {
  it("fleet_vehicles + fleet_drivers JOINs carry companyId + deletedAt (cross-domain safety)", () => {
    // Cross-domain JOINs are the highest-risk leak surface — these
    // tables are shared with the fleet module. Tenant guards stop
    // a stale FK from surfacing another tenant's data here.
    expect(TRANSPORT_DETAIL).toMatch(/LEFT JOIN fleet_vehicles v\s+ON v\.id\s*= t\."vehicleId"\s+AND v\."companyId"\s*= t\."companyId"\s+AND v\."deletedAt"\s*IS NULL/);
    expect(TRANSPORT_DETAIL).toMatch(/LEFT JOIN fleet_drivers d\s+ON d\.id\s*= t\."driverId"\s+AND d\."companyId"\s*= t\."companyId"\s+AND d\."deletedAt"\s*IS NULL/);
  });

  it("seasons JOIN added for seasonTitle (matches pattern on group/penalty)", () => {
    expect(TRANSPORT_DETAIL).toMatch(/LEFT JOIN umrah_seasons s\s+ON s\.id\s*= t\."seasonId"\s+AND s\."companyId"\s*= t\."companyId"\s+AND s\."deletedAt"\s*IS NULL/);
  });

  it("pilgrim subquery now guards p.companyId (defence in depth on the join table)", () => {
    expect(TRANSPORT_DETAIL).toMatch(/JOIN umrah_pilgrims p\s+ON p\.id\s*= tp\."pilgrimId"\s+AND p\."companyId"\s*= tp\."companyId"\s+AND p\."deletedAt"\s*IS NULL/);
  });

  it("derives statusBreakdown + utilisationPct from in-memory pilgrims (no extra roundtrip)", () => {
    // Per-row JS aggregation is fine here since the pilgrim list is
    // already in memory — the per-trip pilgrim count is at most a
    // bus's capacity (~50). Avoids a second SELECT.
    expect(TRANSPORT_DETAIL).toMatch(/statusBreakdown\[st\] = \(statusBreakdown\[st\] \?\? 0\) \+ 1/);
    expect(TRANSPORT_DETAIL).toMatch(/Math\.round\(\(seats \/ cap\) \* 100\)/);
    expect(TRANSPORT_DETAIL).toMatch(/seatsBooked: seats,\s*utilisationPct: utilisation/);
  });
});

describe("GET /umrah/reports/compliance — 4-metric endpoint", () => {
  it("registers under feature: umrah, action: list (read-only audit view)", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("fans 4 queries via Promise.all (single roundtrip)", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/Promise\.all\(\[/);
    expect(COMPLIANCE_HANDLER).toMatch(/exemptRow,\s*visaRow,\s*overstayRow,\s*penaltyRow/);
  });

  it("exempt metric filters on overstayExempt = true + tenant + not-deleted", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/p\."overstayExempt" = true/);
  });

  it("visa-expiring window matches the group-detail + season-detail definition (7d, skip departed/cancelled)", () => {
    // Keep these windows in sync — operator sees the same number on
    // multiple pages.
    expect(COMPLIANCE_HANDLER).toMatch(/p\."visaExpiry" <= CURRENT_DATE \+ INTERVAL '7 days'/);
    expect(COMPLIANCE_HANDLER).toMatch(/p\.status NOT IN \('departed', 'cancelled'\)/);
  });

  it("overstay metric counts both 'overstayed' and 'overstay_penalized' (full lifecycle)", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/p\.status IN \('overstayed', 'overstay_penalized'\)/);
  });

  it("unpaid penalties sums amount + counts rows (status NOT IN paid/waived)", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/pen\.status NOT IN \('paid', 'waived'\)/);
    expect(COMPLIANCE_HANDLER).toMatch(/SUM\(pen\.amount\), 0\)::text AS total/);
  });

  it("optional ?seasonId narrows EVERY metric (consistent slicing)", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/seasonP\s*=\s*` AND p\."seasonId" = \$/);
    expect(COMPLIANCE_HANDLER).toMatch(/seasonPenP\s*=\s*` AND pen\."seasonId" = \$/);
  });

  it("response shape carries the 5 numbers the UI consumes", () => {
    expect(COMPLIANCE_HANDLER).toMatch(/exempt:[\s\S]{0,80}visaExpiringIn7d:[\s\S]{0,80}currentlyOverstaying:[\s\S]{0,80}unpaidPenaltiesCount:[\s\S]{0,80}unpaidPenaltiesTotal:/);
  });
});

describe("UmrahComplianceDashboard page — registration + UX", () => {
  it("registered under /umrah/compliance + listed in tabs nav", () => {
    expect(ROUTES_TSX).toMatch(/UmrahCompliance = lazy\(\(\) => import\("@\/pages\/umrah\/compliance"\)\)/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/compliance", component: UmrahCompliance/);
    expect(TABS).toMatch(/label: "امتثال العمرة", path: "\/umrah\/compliance"/);
  });

  it("season filter drives the query string (server-side scoping)", () => {
    expect(COMPLIANCE_PAGE).toContain('data-testid="compliance-filter-season"');
    expect(COMPLIANCE_PAGE).toMatch(/seasonFilter && seasonFilter !== "all" \? `\?seasonId=\$\{seasonFilter\}` : ""/);
  });

  it("renders 4 KPI tiles with stable testids + drill-down hrefs", () => {
    // The testid identifier strings appear in the `tiles` config
    // array as literals — the JSX passes them through dynamically
    // (`data-testid={t.testid}`) so we pin the literal identifier
    // not the data-attribute substring.
    expect(COMPLIANCE_PAGE).toMatch(/testid:\s*"compliance-tile-exempt"/);
    expect(COMPLIANCE_PAGE).toMatch(/testid:\s*"compliance-tile-visa"/);
    expect(COMPLIANCE_PAGE).toMatch(/testid:\s*"compliance-tile-overstay"/);
    expect(COMPLIANCE_PAGE).toMatch(/testid:\s*"compliance-tile-penalties"/);
    // And confirm the rendered attribute references the dynamic key.
    expect(COMPLIANCE_PAGE).toMatch(/data-testid=\{t\.testid\}/);
  });

  it("totalRisk sums the four counts (the dashboard's headline number)", () => {
    expect(COMPLIANCE_PAGE).toContain('data-testid="compliance-total-risk"');
    expect(COMPLIANCE_PAGE).toMatch(/totalRisk =[\s\S]{0,400}\(data\?\.unpaidPenaltiesCount \?\? 0\)/);
  });

  it("unpaid-penalties tile shows formatted-currency sub-line for the SAR total", () => {
    // The total amount is the actionable number — count tells you
    // how many cases, total tells you the exposure. Both belong on
    // the same tile.
    expect(COMPLIANCE_PAGE).toMatch(/data-testid=\{`\$\{t\.testid\}-sub`\}/);
    expect(COMPLIANCE_PAGE).toMatch(/formatCurrency\(Number\(data\.unpaidPenaltiesTotal\)\)/);
  });

  it("tiles colour-coded by severity (warning/error) when count > 0", () => {
    // Operator at-a-glance triage — green/neutral when clean, red/
    // amber when there's exposure. Matches the red-on-negative
    // signal we surface on margin tiles elsewhere.
    expect(COMPLIANCE_PAGE).toMatch(/visaExpiringIn7d \?\? 0\) > 0[\s\S]{0,150}"text-status-warning-foreground bg-status-warning-surface"/);
    expect(COMPLIANCE_PAGE).toMatch(/currentlyOverstaying \?\? 0\) > 0[\s\S]{0,150}"text-status-error-foreground bg-status-error-surface"/);
  });
});
