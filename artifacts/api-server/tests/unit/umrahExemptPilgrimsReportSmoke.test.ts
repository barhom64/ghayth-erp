import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the compliance rollup for the overstayExempt flag. PRs
 * #1482-1484 captured the flag per-pilgrim + the audit metadata, but a
 * compliance officer wanting "show me everyone currently exempt + who
 * authorised it + why" had no view. This endpoint + page close that
 * gap. Read-only by design — un-exempting hits the same PATCH the
 * pilgrim detail page uses so the server contract has a single shape.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/exempt-pilgrims.tsx"),
  "utf8",
);
const ROUTES_TSX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const TABS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/umrah-tabs-nav.tsx"),
  "utf8",
);

// Isolate the /reports/exempt-pilgrims handler so unrelated routes
// don't accidentally satisfy a pin.
const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/reports\/exempt-pilgrims"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("exempt-pilgrims handler not found");
  return m[0];
})();

describe("GET /umrah/reports/exempt-pilgrims — endpoint contract", () => {
  it("registers under feature: umrah, action: list (read-only audit view)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("filters on overstayExempt = true + tenant + not-deleted", () => {
    // The composite filter — without ANY of the three the rollup
    // would leak across tenants or surface soft-deleted rows.
    expect(HANDLER).toMatch(/p\."companyId" = \$1/);
    expect(HANDLER).toMatch(/p\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/p\."overstayExempt" = true/);
  });

  it("LEFT JOINs users → employees so exemptedByName is human-readable", () => {
    // Same pattern as the timeline endpoint — fall back from
    // employee name to user email so we never lose attribution.
    expect(HANDLER).toMatch(/LEFT JOIN users u\s+ON u\.id = p\."overstayExemptBy"/);
    expect(HANDLER).toMatch(/LEFT JOIN employees e\s+ON e\.id = u\."employeeId"/);
    expect(HANDLER).toMatch(/COALESCE\(e\.name, u\.email\) AS "exemptedByName"/);
  });

  it("season/group/agent JOINs all carry companyId + deletedAt (tenant-safe)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_seasons s\s+ON s\.id = p\."seasonId" AND s\."companyId" = p\."companyId" AND s\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/LEFT JOIN umrah_groups g\s+ON g\.id = p\."groupId" AND g\."companyId" = p\."companyId" AND g\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/LEFT JOIN umrah_agents a\s+ON a\.id = p\."agentId" AND a\."companyId" = p\."companyId" AND a\."deletedAt" IS NULL/);
  });

  it("ORDER BY overstayExemptAt DESC NULLS LAST (newest first; historical NULLs at the tail)", () => {
    // Operator's main workflow: "did anything change today I need to
    // sign off on?". NULLS LAST keeps pre-PR-#1482 historical rows
    // (no captured timestamp) from polluting the top.
    expect(HANDLER).toMatch(/ORDER BY p\."overstayExemptAt" DESC NULLS LAST/);
    expect(HANDLER).toMatch(/LIMIT 500/);
  });

  it("supports optional seasonId / agentId / groupId filters", () => {
    expect(HANDLER).toMatch(/if \(seasonId\) \{[\s\S]{0,200}p\."seasonId" = \$/);
    expect(HANDLER).toMatch(/if \(agentId\)\s+\{[\s\S]{0,200}p\."agentId" = \$/);
    expect(HANDLER).toMatch(/if \(groupId\)\s+\{[\s\S]{0,200}p\."groupId" = \$/);
  });

  it("response shape is { data, total }", () => {
    expect(HANDLER).toMatch(/res\.json\(maskFields\(req, \{ data: rows, total: rows\.length \}\)\)/);
  });
});

describe("exempt-pilgrims page — registration + reachability", () => {
  it("registered under /umrah/exempt-pilgrims in the route table", () => {
    expect(ROUTES_TSX).toMatch(/UmrahExemptPilgrims = lazy\(\(\) => import\("@\/pages\/umrah\/exempt-pilgrims"\)\)/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/exempt-pilgrims", component: UmrahExemptPilgrims/);
  });

  it("listed in the umrah tabs nav (next to 'كشف اليوم' so audit lives with ops reports)", () => {
    // Without the tab the page is reachable only by URL — operators
    // wouldn't find it. Placement next to daily-runsheet pairs it
    // with the other compliance/operational reports.
    expect(TABS).toMatch(/href: "\/umrah\/exempt-pilgrims", label: "المعفون"/);
  });
});

describe("exempt-pilgrims page — UI behaviour", () => {
  it("season + agent dropdowns drive the query string (server-side filter)", () => {
    // Build the filter on the client → server-side WHERE → smaller
    // payload, no double-render lag on big tenants.
    expect(PAGE).toContain('data-testid="exempt-filter-season"');
    expect(PAGE).toContain('data-testid="exempt-filter-agent"');
    expect(PAGE).toMatch(/buildQuery\(seasonFilter, agentFilter\)/);
  });

  it("total count chip mirrors the rows length (matches the table)", () => {
    expect(PAGE).toContain('data-testid="exempt-total-count"');
    expect(PAGE).toMatch(/data-testid="exempt-total-count">\{rows\.length\}/);
  });

  it("empty state renders a friendly message (no half-empty card)", () => {
    expect(PAGE).toContain('data-testid="exempt-empty-state"');
    expect(PAGE).toContain("لا يوجد معتمرون مستثنون حالياً");
  });

  it("each row drills to /umrah/pilgrims/:id (single-source-of-truth detail page)", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/pilgrims\/\$\{p\.id\}`\}/);
    expect(PAGE).toContain("data-testid={`exempt-pilgrim-link-${p.id}`}");
  });

  it("'un-exempt' action PATCHes overstayExempt=false (matches detail-page semantics)", () => {
    // Body intentionally identical to the toggleExemption(false)
    // path on pilgrim-detail.tsx — the server clears the by/at
    // metadata on the false→true→false transition, so the contract
    // must stay single-shape.
    expect(PAGE).toMatch(/apiFetch\(`\/umrah\/pilgrims\/\$\{id\}`,[\s\S]{0,300}method: "PATCH"/);
    expect(PAGE).toMatch(/body: JSON\.stringify\(\{ overstayExempt: false \}\)/);
    expect(PAGE).toMatch(/qc\.invalidateQueries\(\{ queryKey: \["umrah-exempt-pilgrims"\] \}\)/);
  });

  it("un-exempt button is permission-gated on umrah:update (matches API auth)", () => {
    expect(PAGE).toMatch(/<GuardedButton[\s\S]{0,400}perm="umrah:update"[\s\S]{0,500}data-testid=\{`unexempt-\$\{p\.id\}`\}/);
  });

  it("CSV export builds rows client-side from the same filtered set (no extra roundtrip)", () => {
    // Three requirements: (a) the export button has a stable testid,
    // (b) the export uses the unified `exportRowsToCsv` helper so the
    // download lands in /reports/print-log with audit + letterhead
    // (GAP_MATRIX item #7), (c) the export builds from `rows` not a
    // refetched payload — operator gets exactly what they're looking at.
    expect(PAGE).toContain('data-testid="exempt-export-csv"');
    expect(PAGE).toContain('exportRowsToCsv');
    expect(PAGE).toMatch(/rows:\s*rows\s+as\s+unknown/);
    expect(PAGE).toMatch(/disabled=\{rows\.length === 0\}/);
  });
});
