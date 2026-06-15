import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins two follow-ups from the post-#1486 sweep:
 *
 * (1) Season detail endpoint enrichment — the front-end page already
 *     read `season.revenue` / `season.registeredPilgrims`, but the
 *     route returned only the raw umrah_seasons row → every KPI
 *     rendered as 0/-. Aggregates now land in the same roundtrip.
 *
 * (2) Bulk un-exempt action on /umrah/exempt-pilgrims — the audit
 *     page now lets the operator multi-select and reverse N
 *     exemptions at once. The single-row PATCH path is preserved
 *     (server contract unchanged), the bulk runs sequentially with
 *     per-row error tally.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const SEASON_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-season-detail.tsx"),
  "utf8",
);
const EXEMPT_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/exempt-pilgrims.tsx"),
  "utf8",
);

const SEASON_HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/seasons\/:id"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("seasons/:id handler not found");
  return m[0];
})();

describe("GET /umrah/seasons/:id — aggregate enrichment", () => {
  it("still 404s on a missing season (no payload regression)", () => {
    expect(SEASON_HANDLER).toMatch(/throw new NotFoundError\("الموسم غير موجود"\)/);
  });

  it("fans the 6 aggregates out via Promise.all", () => {
    expect(SEASON_HANDLER).toMatch(/Promise\.all\(\[/);
    expect(SEASON_HANDLER).toMatch(/statusRows,\s*groupsRow,\s*financeRow,\s*nuskRow,\s*visaRow,\s*exemptRow/);
  });

  it("status breakdown is a GROUP BY count (not a JS reduce)", () => {
    expect(SEASON_HANDLER).toMatch(/SELECT status, COUNT\(\*\)::text AS count[\s\S]{1,300}GROUP BY status/);
  });

  it("groups + agents counted from umrah_groups (tenant + not-deleted)", () => {
    expect(SEASON_HANDLER).toMatch(/COUNT\(DISTINCT "agentId"\)::text AS "agentsCount"/);
    expect(SEASON_HANDLER).toMatch(/FROM umrah_groups[\s\S]{1,200}"deletedAt" IS NULL/);
  });

  it("sales-invoice total reads seasonId directly (header has the column)", () => {
    // Unlike the group case where we had to JOIN through items, sales
    // invoice headers DO carry seasonId, so a direct sum is correct.
    expect(SEASON_HANDLER).toMatch(/FROM umrah_sales_invoices\s+WHERE "seasonId" = \$1/);
    expect(SEASON_HANDLER).toMatch(/status <> 'cancelled'/);
  });

  it("nusk cost rollup reaches the season via the linked group (no seasonId on nusk)", () => {
    // The nusk header has no seasonId column. Subquery against
    // umrah_groups (tenant-scoped) gets the right slice.
    expect(SEASON_HANDLER).toMatch(/ni\."groupId" IN \([\s\S]{1,300}FROM umrah_groups[\s\S]{1,300}"seasonId" = \$2/);
    expect(SEASON_HANDLER).toMatch(/"nuskStatus" <> 'cancelled'/);
  });

  it("visa-expiring window matches the group-detail card (7 days, skip departed)", () => {
    expect(SEASON_HANDLER).toMatch(/"visaExpiry" <= CURRENT_DATE \+ INTERVAL '7 days'/);
    expect(SEASON_HANDLER).toMatch(/status NOT IN \('departed', 'cancelled'\)/);
  });

  it("exempt count filters on overstayExempt = true", () => {
    expect(SEASON_HANDLER).toMatch(/"overstayExempt" = true/);
  });

  it("response shape includes the derived KPIs the page already reads", () => {
    expect(SEASON_HANDLER).toMatch(/pilgrimsCount,\s*registeredPilgrims/);
    expect(SEASON_HANDLER).toMatch(/statusBreakdown,\s*overstayCount,\s*visaExpiringCount/);
    expect(SEASON_HANDLER).toMatch(/finance: \{[\s\S]{0,400}margin:/);
  });
});

describe("season detail page — new cards consume the enrichment", () => {
  it("renders status-breakdown chips", () => {
    expect(SEASON_PAGE).toContain('data-testid="season-status-breakdown"');
    expect(SEASON_PAGE).toMatch(/PILGRIM_STATUS_LABELS\[status\] \|\| status/);
  });

  it("renders the groups + agents card with a deep-link to /umrah/groups", () => {
    expect(SEASON_PAGE).toContain('data-testid="season-groups-count"');
    expect(SEASON_PAGE).toContain('data-testid="season-agents-count"');
    expect(SEASON_PAGE).toContain('data-testid="season-groups-link"');
    expect(SEASON_PAGE).toMatch(/href=\{`\/umrah\/groups\?seasonId=\$\{id\}`\}/);
  });

  it("renders alerts card with visa-expiring + overstay + exempt", () => {
    expect(SEASON_PAGE).toContain('data-testid="season-visa-expiring"');
    expect(SEASON_PAGE).toContain('data-testid="season-overstay-count"');
    expect(SEASON_PAGE).toContain('data-testid="season-exempt-count"');
  });

  it("financial summary card mirrors the group-detail layout (4 KPIs + margin)", () => {
    expect(SEASON_PAGE).toContain('data-testid="season-invoice-total"');
    expect(SEASON_PAGE).toContain('data-testid="season-invoice-paid"');
    expect(SEASON_PAGE).toContain('data-testid="season-invoice-outstanding"');
    expect(SEASON_PAGE).toContain('data-testid="season-nusk-cost"');
    expect(SEASON_PAGE).toMatch(/data-testid="season-margin"/);
    expect(SEASON_PAGE).toMatch(/finance\?\.margin \?\? 0\) < 0 \? "text-status-error-foreground"/);
  });
});

describe("exempt-pilgrims page — bulk un-exempt action", () => {
  it("declares the bulk state slots (selectedIds + bulkRunning + bulkResult)", () => {
    expect(EXEMPT_PAGE).toMatch(/const \[selectedIds, setSelectedIds\] = useState<Set<number>>/);
    expect(EXEMPT_PAGE).toMatch(/const \[bulkRunning, setBulkRunning\] = useState/);
    expect(EXEMPT_PAGE).toMatch(/const \[bulkResult, setBulkResult\] = useState/);
  });

  it("select-all + per-row checkboxes have stable testids", () => {
    expect(EXEMPT_PAGE).toContain('data-testid="exempt-select-all"');
    expect(EXEMPT_PAGE).toContain("data-testid={`exempt-select-${p.id}`}");
  });

  it("bulk action button only renders when at least one row is selected", () => {
    // Without this guard the destructive button would always render
    // — visually noisy + an easy mis-click on a row-less table.
    expect(EXEMPT_PAGE).toMatch(/\{selectedIds\.size > 0 && \(/);
    expect(EXEMPT_PAGE).toContain('data-testid="exempt-bulk-unexempt-button"');
  });

  it("bulk action runs PATCH overstayExempt=false sequentially (matches single-row contract)", () => {
    // Sequential not parallel — server already audits each row, and
    // sequencing keeps the audit log chronologically readable.
    expect(EXEMPT_PAGE).toMatch(/for \(const id of Array\.from\(selectedIds\)\)/);
    expect(EXEMPT_PAGE).toMatch(/apiFetch\(`\/umrah\/pilgrims\/\$\{id\}`,[\s\S]{0,300}method: "PATCH"/);
    // Both call sites (single + bulk) use the same body shape.
    const occurrences = EXEMPT_PAGE.match(/JSON\.stringify\(\{ overstayExempt: false \}\)/g);
    expect(occurrences?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("bulk action tracks per-row failure count (no silent partial failure)", () => {
    // The {ok, failed} tally surfaces partial failures explicitly so
    // the operator doesn't see a green toast for a half-failed run.
    expect(EXEMPT_PAGE).toMatch(/failed \+= 1/);
    expect(EXEMPT_PAGE).toMatch(/setBulkResult\(\{ ok, failed \}\)/);
    expect(EXEMPT_PAGE).toMatch(/إلغاء جزئي/);
  });

  it("confirm dialog warns about the audit-log side effect", () => {
    expect(EXEMPT_PAGE).toContain('contentTestId="exempt-bulk-confirm-dialog"');
    expect(EXEMPT_PAGE).toContain('confirmButtonTestId="exempt-bulk-confirm-button"');
    expect(EXEMPT_PAGE).toContain("سيتم إلغاء استثناء");
    expect(EXEMPT_PAGE).toContain("سجل التدقيق");
  });

  it("bulk button is permission-gated on umrah:update (matches API auth)", () => {
    expect(EXEMPT_PAGE).toMatch(/<GuardedButton[\s\S]{0,500}perm="umrah:update"[\s\S]{0,500}data-testid="exempt-bulk-unexempt-button"/);
  });

  it("selection clears after the bulk run completes (so the UI doesn't show stale ids)", () => {
    expect(EXEMPT_PAGE).toMatch(/setSelectedIds\(new Set\(\)\);[\s\S]{0,300}if \(failed === 0\)/);
  });
});
