import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the GET /umrah/groups/:id enrichment — a group page without
 * aggregates is just a name + a list, which forces the operator into
 * three follow-up queries (status mix, finance, visa-expiring) every
 * time. The endpoint now folds the six aggregates into a single
 * roundtrip + the JOINs are tenant-scoped against a stale-row leak.
 */
// U-07 Phase 22 — GET /umrah/groups/:id (enrichment) carved into umrah-groups.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-groups.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-group-detail.tsx"),
  "utf8",
);
const ROUTES_TSX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const LIST = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/groups.tsx"),
  "utf8",
);

// Isolate the /groups/:id GET handler from the rest of umrah-entities.ts
// so the assertions don't match unrelated routes that happen to mention
// umrah_groups (CRUD endpoints below it).
const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/groups\/:id"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("group-detail handler not found");
  return m[0];
})();

describe("GET /umrah/groups/:id — defence-in-depth JOINs", () => {
  it("agent JOIN carries companyId + deletedAt (not just the FK)", () => {
    // Without this, a soft-deleted agent (or a stale row whose id
    // happens to match across tenants in dev seeds) would still
    // surface its name through agentName. We've been bitten by this
    // exact shape before — see umrah_sub_agents PR #1438.
    expect(HANDLER).toMatch(/LEFT JOIN umrah_agents a\s+ON g\."agentId" = a\.id AND a\."companyId" = g\."companyId" AND a\."deletedAt" IS NULL/);
  });

  it("sub-agent JOIN carries companyId + deletedAt", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_sub_agents sa\s+ON g\."subAgentId" = sa\.id AND sa\."companyId" = g\."companyId" AND sa\."deletedAt" IS NULL/);
  });

  it("season JOIN carries companyId (not only deletedAt)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_seasons s\s+ON g\."seasonId" = s\.id AND s\."companyId" = g\."companyId" AND s\."deletedAt" IS NULL/);
  });
});

describe("GET /umrah/groups/:id — aggregate payload", () => {
  it("404s when the group is missing (clearer than empty data)", () => {
    expect(HANDLER).toMatch(/throw new NotFoundError\("المجموعة غير موجودة"\)/);
  });

  it("fans the 6 aggregates out via Promise.all (single roundtrip)", () => {
    expect(HANDLER).toMatch(/Promise\.all\(\[/);
    // The 6 destructured names — guard against silent dropping in a
    // future refactor that breaks the payload shape.
    expect(HANDLER).toMatch(/pilgrims,\s*statusBreakdownRows,\s*financeRow,\s*nuskRow,\s*visaExpiringRow,\s*flightAggRow/);
  });

  it("pilgrim status breakdown is a GROUP BY count (not an in-memory scan)", () => {
    // GROUP BY at the DB layer is cheap; iterating thousands of
    // pilgrims in JS to count would burn CPU on large groups.
    expect(HANDLER).toMatch(/SELECT status, COUNT\(\*\)::text AS count[\s\S]{1,300}GROUP BY status/);
  });

  it("sales-invoice total joins THROUGH umrah_sales_invoice_items (header has no groupId)", () => {
    // The header table has no groupId — the relationship lives on
    // the items table. DISTINCT collapses an invoice whose lines
    // span multiple groups so we don't double-count it.
    expect(HANDLER).toMatch(/COUNT\(DISTINCT si\.id\)/);
    expect(HANDLER).toMatch(/FROM umrah_sales_invoice_items it\s+JOIN umrah_sales_invoices si/);
    expect(HANDLER).toMatch(/si\.status <> 'cancelled'/);
  });

  it("nusk-cost rollup excludes cancelled rows + sums netCost", () => {
    expect(HANDLER).toMatch(/SUM\("netCost"\), 0\)::text AS "netCost"/);
    expect(HANDLER).toMatch(/"nuskStatus" <> 'cancelled'/);
  });

  it("visa-expiring window matches the list-page banner (7 days)", () => {
    // Keep these in sync — operator should see the same number on
    // the group page and on the list-page banner. Excludes pilgrims
    // who left already (departed/cancelled) — they wouldn't trigger
    // a real alert.
    expect(HANDLER).toMatch(/"visaExpiry" <= CURRENT_DATE \+ INTERVAL '7 days'/);
    expect(HANDLER).toMatch(/status NOT IN \('departed', 'cancelled'\)/);
  });

  it("schedule aggregates MIN/MAX dates + DISTINCT flight codes", () => {
    expect(HANDLER).toMatch(/MIN\("arrivalDate"\) AS "minArrival"/);
    expect(HANDLER).toMatch(/MAX\("departureDate"\) AS "maxDeparture"/);
    expect(HANDLER).toMatch(/STRING_AGG\(DISTINCT "entryFlight", ','/);
    expect(HANDLER).toMatch(/STRING_AGG\(DISTINCT "exitFlight", ','/);
  });

  it("response shape includes the new derived fields", () => {
    expect(HANDLER).toMatch(/statusBreakdown,\s*overstayExemptCount,\s*visaExpiringCount/);
    expect(HANDLER).toMatch(/finance: \{[\s\S]{0,400}margin:/);
    expect(HANDLER).toMatch(/schedule: \{[\s\S]{0,400}entryFlights:/);
  });
});

describe("group detail page — rendering + routing", () => {
  it("registered under /umrah/groups/:id in the route table", () => {
    expect(ROUTES_TSX).toMatch(/UmrahGroupDetail = lazy\(\(\) => import\("@\/pages\/details\/umrah-group-detail"\)\)/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/groups\/:id", component: UmrahGroupDetail/);
  });

  it("groups list row has a 'تفاصيل' link to the new page", () => {
    // Without this link the new page is reachable only by URL —
    // an operator wouldn't find it.
    expect(LIST).toMatch(/href=\{`\/umrah\/groups\/\$\{g\.id\}`\}/);
    expect(LIST).toMatch(/data-testid=\{`group-detail-link-\$\{g\.id\}`\}/);
  });

  it("financial summary card renders 4 KPIs + margin (red if negative)", () => {
    expect(PAGE).toContain('data-testid="group-finance-card"');
    expect(PAGE).toContain('data-testid="group-invoice-total"');
    expect(PAGE).toContain('data-testid="group-invoice-paid"');
    expect(PAGE).toContain('data-testid="group-invoice-outstanding"');
    expect(PAGE).toContain('data-testid="group-nusk-cost"');
    expect(PAGE).toMatch(/data-testid="group-margin"[\s\S]{0,400}finance\?\.margin/);
    expect(PAGE).toMatch(/finance\?\.margin \?\? 0\) < 0 \? "text-status-error-foreground"/);
  });

  it("status-breakdown card renders Arabic labels via PILGRIM_STATUS_LABELS", () => {
    expect(PAGE).toContain('data-testid="group-status-breakdown"');
    expect(PAGE).toMatch(/overstayed: "متأخر"/);
    expect(PAGE).toMatch(/departed: "غادر"/);
  });

  it("alerts card shows visa-expiring + exempt counts", () => {
    expect(PAGE).toContain('data-testid="group-visa-expiring"');
    expect(PAGE).toContain('data-testid="group-exempt-count"');
    // Visa-expiring count highlights warning colour when > 0.
    expect(PAGE).toMatch(/visaExpiringCount \?\? 0\) > 0 \? "text-status-warning-foreground"/);
  });

  it("pilgrims table renders top 50 + tail hint (no DOM bloat on large groups)", () => {
    expect(PAGE).toMatch(/pilgrims\.slice\(0, 50\)\.map/);
    expect(PAGE).toMatch(/pilgrims\.length > 50 && \(/);
    expect(PAGE).toContain("و {data.pilgrims.length - 50} معتمر آخر");
  });

  it("each pilgrim row links to /umrah/pilgrims/:id (drill-down)", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/pilgrims\/\$\{p\.id\}`\}/);
    expect(PAGE).toContain("data-testid={`group-pilgrim-row-${p.id}`}");
  });

  it("'show in pilgrims list' link uses ?groupId= filter (matches the list page contract)", () => {
    expect(PAGE).toContain('data-testid="group-pilgrims-list-link"');
    expect(PAGE).toMatch(/href=\{`\/umrah\/pilgrims\?groupId=\$\{id\}`\}/);
  });

  it("schedule card shows min arrival + max departure + flight badges", () => {
    expect(PAGE).toContain('data-testid="group-min-arrival"');
    expect(PAGE).toContain('data-testid="group-max-departure"');
    expect(PAGE).toContain('data-testid="group-entry-flights"');
    expect(PAGE).toContain('data-testid="group-exit-flights"');
  });
});
