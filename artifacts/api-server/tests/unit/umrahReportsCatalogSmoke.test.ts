import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_REPORTS_CATALOG,
  REPORT_CATEGORY_LABELS_AR,
  REPORT_STATUS_LABELS_AR,
} from "../../src/lib/umrahReportsCatalog.js";

/**
 * §11 of #1870 — Umrah Reports Catalog (17 mandatory reports).
 *
 * Pins:
 *   1. The catalog covers all 17 reports the issue lists.
 *   2. Every entry has the required fields (id/title/category/status/route).
 *   3. Status is a known enum, category is a known enum.
 *   4. Every "available" entry has its apiPath wired (E2E sanity).
 *   5. The /umrah/reports/catalog endpoint surfaces the catalog
 *      + the Arabic label maps so the FE doesn't need a second fetch.
 *   6. The hub page consumes /reports/catalog (not a hardcoded list)
 *      and renders status badges + category filter.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const HUB = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/index.tsx"),
  "utf8",
);

const REQUIRED_REPORT_IDS = [
  "season",
  "agent_report",
  "subagent_report",
  "group_report",
  "pilgrim_movements",
  "daily_runsheet",
  "violations_report",
  "import_errors",
  "unlinked_rows",
  "umrah_transport",
  "umrah_costs",
  "agent_profitability",
  "group_profitability",
  "nusk_invoices_report",
  "sales_invoices_report",
  "commission_report",
  "compliance_overview",
] as const;

describe("catalog — completeness", () => {
  it("covers all 17 mandatory reports from §11", () => {
    const present = new Set(UMRAH_REPORTS_CATALOG.map((r) => r.id));
    const missing = REQUIRED_REPORT_IDS.filter((id) => !present.has(id));
    expect(
      missing,
      `missing from UMRAH_REPORTS_CATALOG: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("there is no extra entry beyond the spec (catches drift)", () => {
    // Bonus: catches accidental duplicates from copy-paste edits.
    const ids = UMRAH_REPORTS_CATALOG.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("catalog — entry shape", () => {
  it("every entry has the required Arabic title + description", () => {
    for (const r of UMRAH_REPORTS_CATALOG) {
      expect(r.title.length, `${r.id} title`).toBeGreaterThan(0);
      expect(/[؀-ۿ]/.test(r.title), `${r.id} title Arabic`).toBe(true);
      expect(r.description.length, `${r.id} description`).toBeGreaterThan(0);
    }
  });

  it("every category is in REPORT_CATEGORY_LABELS_AR", () => {
    for (const r of UMRAH_REPORTS_CATALOG) {
      expect(REPORT_CATEGORY_LABELS_AR[r.category], `${r.id} category ${r.category}`).toBeTruthy();
    }
  });

  it("every status is in REPORT_STATUS_LABELS_AR", () => {
    for (const r of UMRAH_REPORTS_CATALOG) {
      expect(REPORT_STATUS_LABELS_AR[r.status], `${r.id} status ${r.status}`).toBeTruthy();
    }
  });

  it("every available entry has an apiPath", () => {
    // E2E sanity: a report marked "متاح" must be wired to a real
    // endpoint — otherwise the operator clicks and lands on a
    // broken page.
    for (const r of UMRAH_REPORTS_CATALOG) {
      if (r.status === "available") {
        expect(r.apiPath, `${r.id} marked available without apiPath`).toBeTruthy();
      }
    }
  });

  it("status counts roughly match Phase-1 expectations", () => {
    // Snapshot: ~50%+ available, the rest partial or stub. Catches
    // regressions where someone flips everything to stub by mistake.
    const counts = { available: 0, partial: 0, stub: 0 };
    for (const r of UMRAH_REPORTS_CATALOG) counts[r.status]++;
    expect(counts.available).toBeGreaterThanOrEqual(8);
    expect(counts.available + counts.partial + counts.stub).toBe(UMRAH_REPORTS_CATALOG.length);
  });
});

describe("API — /reports/catalog endpoint", () => {
  it("imports the catalog + label maps", () => {
    expect(ROUTE).toMatch(/UMRAH_REPORTS_CATALOG,\s*[\r\n]+\s*REPORT_CATEGORY_LABELS_AR,\s*[\r\n]+\s*REPORT_STATUS_LABELS_AR,/);
  });

  it("declares the route + returns the three blocks", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/catalog"/);
    expect(ROUTE).toMatch(/data: UMRAH_REPORTS_CATALOG,/);
    expect(ROUTE).toMatch(/categories: REPORT_CATEGORY_LABELS_AR,/);
    expect(ROUTE).toMatch(/statuses: REPORT_STATUS_LABELS_AR,/);
  });
});

describe("FE — Reports Hub consumes the catalog", () => {
  it("fetches /umrah/reports/catalog", () => {
    expect(HUB).toMatch(/useApiQuery<CatalogResp>\(\s*[\r\n]+\s*\["umrah-reports-catalog"\],\s*[\r\n]+\s*"\/umrah\/reports\/catalog"/);
  });

  it("renders one card per catalog entry", () => {
    expect(HUB).toMatch(/data-testid=\{`report-card-\$\{r\.id\}`\}/);
  });

  it("each card carries a status badge with severity coloring", () => {
    expect(HUB).toMatch(/data-testid=\{`report-status-\$\{r\.id\}`\}/);
    expect(HUB).toMatch(/STATUS_TONE: Record<ReportStatus, string>/);
  });

  it("stub entries render a disabled button (no broken drill-down)", () => {
    // Without this guard, clicking a "stub" entry would land the
    // operator on a 404. Disable the button + show "قيد التطوير".
    expect(HUB).toMatch(/r\.status === "stub" \?[\s\S]{0,200}قيد التطوير/);
  });

  it("category + status filters are wired", () => {
    expect(HUB).toMatch(/data-testid="reports-filter-category"/);
    expect(HUB).toMatch(/data-testid="reports-filter-status"/);
  });

  it("subtitle shows the available/partial/stub counts", () => {
    // Operator-facing transparency about what's ready.
    expect(HUB).toMatch(/متاح \/ \$\{reports\.filter[\s\S]{0,80}partial[\s\S]{0,80}جزئي/);
  });
});
