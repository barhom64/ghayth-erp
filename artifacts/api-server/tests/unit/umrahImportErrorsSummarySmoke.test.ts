import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the §11 import-errors summary report (Charter #1870):
 *   GET /umrah/reports/import-errors-summary
 *
 * Answers "كم دفعة فشلت؟ كم سطر مرفوض؟ من يحتاج تدريب؟ ما النوع الأشكل؟"
 * via five parallel aggregations (kpis + byStatus + byFileType +
 * byUploader + recent). Mirrors the sales-invoices-summary /
 * commissions-summary / nusk-invoices-summary pattern.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/import-errors-summary.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const CATALOG = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahReportsCatalog.ts"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/reports\/import-errors-summary"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("import-errors-summary handler not found");
  return m[0];
})();

describe("GET /umrah/reports/import-errors-summary — endpoint contract", () => {
  it("registers under feature: umrah, action: list (operations + governance read)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("tenant-scopes on companyId + filters out deleted batches", () => {
    expect(HANDLER).toMatch(/b\."companyId" = \$1 AND b\."deletedAt" IS NULL/);
  });

  it("supports seasonId / status / fileType / uploadedBy filters", () => {
    expect(HANDLER).toMatch(/if \(seasonId\)\s*\{[\s\S]{0,200}b\."seasonId"\s*=\s*\$/);
    expect(HANDLER).toMatch(/if \(status\)\s*\{[\s\S]{0,200}b\.status\s*=\s*\$/);
    expect(HANDLER).toMatch(/if \(fileType\)\s*\{[\s\S]{0,200}b\."fileType"\s*=\s*\$/);
    expect(HANDLER).toMatch(/if \(uploadedBy\)\s*\{[\s\S]{0,200}b\."uploadedBy"\s*=\s*\$/);
  });

  it("date filters from/to validated as YYYY-MM-DD + applied on createdAt", () => {
    expect(HANDLER).toContain("const dateRe = /^\\d{4}-\\d{2}-\\d{2}$/");
    expect(HANDLER).toMatch(/if \(from && !dateRe\.test\(from\)\)/);
    expect(HANDLER).toMatch(/if \(to\s+&& !dateRe\.test\(to\)\)/);
    expect(HANDLER).toMatch(/b\."createdAt"\s*>=\s*\$/);
    // To-date uses +1 day so the full day is included
    expect(HANDLER).toMatch(/INTERVAL '1 day'/);
  });

  it("runs five aggregations in parallel — no serial RTT", () => {
    expect(HANDLER).toMatch(/const \[kpiRowArr, byStatus, byFileType, byUploader, recent\] = await Promise\.all\(/);
  });

  it("kpis row carries totals + failed + partial + error rows + financial impact + affected entities", () => {
    expect(HANDLER).toMatch(/COUNT\(\*\)::int\s+AS "totalBatches"/);
    expect(HANDLER).toMatch(/FILTER \(WHERE b\.status = 'failed'\)::int\s+AS "failedBatches"/);
    expect(HANDLER).toMatch(/AS "partialBatches"/);
    expect(HANDLER).toMatch(/AS "totalRows"/);
    expect(HANDLER).toMatch(/AS "errorRows"/);
    expect(HANDLER).toMatch(/AS "skippedRows"/);
    expect(HANDLER).toMatch(/AS "financialImpactRows"/);
    expect(HANDLER).toMatch(/AS "affectedSeasons"/);
    expect(HANDLER).toMatch(/AS "affectedUploaders"/);
  });

  it("partial = errorCount>0 OR skippedCount>0 AND not failed (true 'has issues' bucket)", () => {
    expect(HANDLER).toMatch(/COALESCE\(b\."errorCount", 0\) > 0[\s\S]{0,200}COALESCE\(b\."skippedCount", 0\) > 0/);
    expect(HANDLER).toMatch(/b\.status <> 'failed'/);
  });

  it("byUploader joins users + employees for the human-readable name (LIMIT 20)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN users u\s+ON u\.id = b\."uploadedBy"/);
    expect(HANDLER).toMatch(/LEFT JOIN employees e ON e\.id = u\."employeeId"/);
    expect(HANDLER).toMatch(/COALESCE\(e\.name, u\.email\)\s+AS "uploaderName"/);
    expect(HANDLER).toMatch(/ORDER BY COALESCE\(SUM\(b\."errorCount"\), 0\) DESC[\s\S]{0,200}LIMIT 20/);
  });

  it("byFileType orders by error rows DESC (worst-first surfacing)", () => {
    expect(HANDLER).toMatch(/GROUP BY b\."fileType"[\s\S]{0,200}ORDER BY COALESCE\(SUM\(b\."errorCount"\), 0\) DESC/);
  });

  it("recent joins season + user + employee tenant-safe + LIMIT 100", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_seasons se[\s\S]{0,200}AND se\."companyId" = b\."companyId"[\s\S]{0,200}AND se\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/ORDER BY b\."createdAt" DESC, b\.id DESC[\s\S]{0,200}LIMIT 100/);
  });

  it("response shape exposes kpis + 3 breakdowns + recent for the FE", () => {
    expect(HANDLER).toMatch(/kpis: kpiRow/);
    expect(HANDLER).toMatch(/byStatus,/);
    expect(HANDLER).toMatch(/byFileType,/);
    expect(HANDLER).toMatch(/byUploader,/);
    expect(HANDLER).toMatch(/recent,/);
  });
});

describe("UmrahImportErrorsSummaryReport page — registration + UX", () => {
  it("registered at /umrah/reports/import-errors-summary", () => {
    expect(ROUTES).toMatch(/UmrahImportErrorsSummaryReport = lazy\(\(\) => import\("@\/pages\/umrah\/reports\/import-errors-summary"\)\)/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/import-errors-summary", component: UmrahImportErrorsSummaryReport/);
  });

  it("queries the summary endpoint with the filter querystring", () => {
    expect(PAGE).toContain("/umrah/reports/import-errors-summary${qs}");
  });

  it("renders 8 KPI tiles with stable testids (totals + failed + partial + rows + error-rate + financial + uploaders)", () => {
    expect(PAGE).toContain('"import-errors-kpi-total-batches"');
    expect(PAGE).toContain('"import-errors-kpi-failed-batches"');
    expect(PAGE).toContain('"import-errors-kpi-partial-batches"');
    expect(PAGE).toContain('"import-errors-kpi-total-rows"');
    expect(PAGE).toContain('"import-errors-kpi-error-rows"');
    expect(PAGE).toContain('"import-errors-kpi-error-rate"');
    expect(PAGE).toContain('"import-errors-kpi-financial-impact"');
    expect(PAGE).toContain('"import-errors-kpi-uploaders"');
    expect(PAGE).toContain("data-testid={k.testid}");
  });

  it("filter card carries season + status + filetype + from/to with testids", () => {
    expect(PAGE).toContain('data-testid="import-errors-filter-season"');
    expect(PAGE).toContain('data-testid="import-errors-filter-status"');
    expect(PAGE).toContain('data-testid="import-errors-filter-filetype"');
    expect(PAGE).toContain('data-testid="import-errors-filter-from"');
    expect(PAGE).toContain('data-testid="import-errors-filter-to"');
  });

  it("3 breakdown tabs (status / filetype / uploader) + tab body testids", () => {
    expect(PAGE).toContain('data-testid="import-errors-tab-status"');
    expect(PAGE).toContain('data-testid="import-errors-tab-filetype"');
    expect(PAGE).toContain('data-testid="import-errors-tab-uploader"');
    expect(PAGE).toContain('data-testid="import-errors-breakdown-status"');
    expect(PAGE).toContain('data-testid="import-errors-breakdown-filetype"');
    expect(PAGE).toContain('data-testid="import-errors-breakdown-uploader"');
  });

  it("recent table drills to /umrah/import/:id/unlinked for batches with issues (deep link)", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/import\/\$\{r\.id\}\/unlinked`\}/);
    expect(PAGE).toContain('data-testid="import-errors-recent-table"');
    expect(PAGE).toContain("data-testid={`import-errors-recent-row-${r.id}`}");
  });

  it("Arabic status labels match the schema's vocabulary (5+ states)", () => {
    expect(PAGE).toContain("قيد المعالجة"); // pending
    expect(PAGE).toContain("جاري");           // processing
    expect(PAGE).toContain("مكتملة");        // completed
    expect(PAGE).toContain("فاشلة");         // failed
    expect(PAGE).toContain("ملغاة");          // cancelled
  });

  it("CSV export uses the unified export helper (audit + letterhead path)", () => {
    expect(PAGE).toContain('data-testid="import-errors-export-csv"');
    expect(PAGE).toContain("exportRowsToCsv");
    expect(PAGE).toMatch(/disabled=\{recent\.length === 0\}/);
  });

  it("error-rate colour scale (success / warning / error) surfaces severity at a glance", () => {
    // KPI ربع/ربعين فقط ما يكفي — العامل بحاجة لون يعكس الخطورة.
    expect(PAGE).toMatch(/errorRatePct > 5/);
    expect(PAGE).toMatch(/errorRatePct > 0/);
    expect(PAGE).toContain("bg-status-error-surface");
    expect(PAGE).toContain("bg-status-warning-surface");
    expect(PAGE).toContain("bg-status-success-surface");
  });

  it("UmrahTabsNav surfaces consistent sibling navigation", () => {
    expect(PAGE).toContain("<UmrahTabsNav />");
  });
});

describe("Reports Catalog — entry flipped to available", () => {
  // §11 of #1870 — Hub is catalog-driven now (#1907 merged). The hub
  // page reads /umrah/reports/catalog at runtime, so the assertion
  // for "tile appears" is now on the catalog file, not the page.
  it("import_errors catalog entry is flipped to available + has apiPath + route", () => {
    expect(CATALOG).toMatch(/id: "import_errors"[\s\S]*?status: "available"/);
    expect(CATALOG).toMatch(/id: "import_errors"[\s\S]*?route: "\/umrah\/reports\/import-errors-summary"/);
    expect(CATALOG).toMatch(/id: "import_errors"[\s\S]*?apiPath: "\/umrah\/reports\/import-errors-summary"/);
  });
});
