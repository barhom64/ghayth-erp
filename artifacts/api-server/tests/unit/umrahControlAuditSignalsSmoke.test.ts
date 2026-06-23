import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §8 of #1870 — pins the audit/control gaps fixed in this PR:
 *
 *   1. Deep-link from the compliance dashboard to /umrah/exempt-pilgrims
 *      now actually applies the seasonId filter (page hydrates state
 *      from URL on mount). The other two deep-link targets (pilgrims,
 *      penalties) already had this hydration; exempt-pilgrims was the
 *      only one that silently dropped it.
 *
 *   2. /umrah/reports/compliance surfaces TWO new operational signals
 *      so the dashboard answers "what's silently broken right now?":
 *        - failedImportRows30d  — rejected import rows in the last
 *                                 30 days (signal §8 item: "Failed
 *                                 rows" in the Audit list).
 *        - missingNuskApJournals — nusk invoices with no AP journal
 *                                  entry (signal §8 item: "Missing
 *                                  financial postings").
 *
 *   3. The compliance dashboard renders both new signals as KPI
 *      tiles + folds them into totalRisk.
 *
 * The unlinked-import-rows signal (§8: "Unlinked rows") lives in
 * a follow-up PR because it depends on migration 279 from PR #1878.
 */
// U-07 Phase 13 — /reports/compliance carved into umrah-reports.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const COMPLIANCE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/compliance.tsx"),
  "utf8",
);
const EXEMPT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/exempt-pilgrims.tsx"),
  "utf8",
);

describe("exempt-pilgrims — URL-param hydration so compliance deep-links work", () => {
  it("reads ?seasonId from window.location.search on mount", () => {
    // The bug was a hardcoded useState("all") that ignored the URL.
    // Compliance tile linked to /umrah/exempt-pilgrims?seasonId=N
    // and the page silently dropped the filter.
    expect(EXEMPT).toMatch(/const initialFromUrl = \(\(\) => \{/);
    expect(EXEMPT).toMatch(/new URLSearchParams\(window\.location\.search\)/);
    expect(EXEMPT).toMatch(/sp\.get\("seasonId"\) \?\? "all"/);
  });

  it("the state init uses the URL-derived value, not a hardcoded 'all'", () => {
    expect(EXEMPT).toMatch(/useState\(initialFromUrl\.seasonId\)/);
    expect(EXEMPT).toMatch(/useState\(initialFromUrl\.agentId\)/);
  });
});

describe("compliance endpoint — new audit signals", () => {
  it("response carries failedImportRows30d", () => {
    expect(ROUTE).toMatch(/failedImportRows30d: Number\(failedRow\[0\]\?\.c \?\? "0"\)/);
  });

  it("response carries missingNuskApJournals", () => {
    expect(ROUTE).toMatch(/missingNuskApJournals: Number\(missingApRow\[0\]\?\.c \?\? "0"\)/);
  });

  it("failedImportRows window is 30 days (matches batch-history list)", () => {
    expect(ROUTE).toMatch(/AND b\."createdAt" >= NOW\(\) - INTERVAL '30 days'/);
  });

  it("missingNuskApJournals query excludes cancelled + zero-amount rows", () => {
    // Without these filters the count includes invoices that legitimately
    // have no AP entry (cancelled / draft with totalAmount = 0).
    expect(ROUTE).toMatch(/AND n\."purchaseInvoiceId" IS NULL/);
    expect(ROUTE).toMatch(/AND COALESCE\(n\."totalAmount",0\) > 0/);
    expect(ROUTE).toMatch(/AND n\."nuskStatus" <> 'cancelled'/);
  });

  it("queries run in parallel via Promise.all (no perf regression on the dashboard)", () => {
    const handler = ROUTE.match(
      /router\.get\("\/reports\/compliance"[\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await Promise\.all\(\[/);
  });
});

describe("compliance dashboard — new tiles + totalRisk inclusion", () => {
  it("ComplianceResp type carries the two new signals as optional", () => {
    // Optional so the FE keeps working even if served by an older API
    // (rolling deploy safety).
    expect(COMPLIANCE).toMatch(/failedImportRows30d\?: number;/);
    expect(COMPLIANCE).toMatch(/missingNuskApJournals\?: number;/);
  });

  it("renders a tile for failed import rows", () => {
    expect(COMPLIANCE).toMatch(/testid: "compliance-tile-failed-imports"/);
    expect(COMPLIANCE).toMatch(/صفوف استيراد مرفوضة/);
  });

  it("renders a tile for missing nusk AP journals", () => {
    expect(COMPLIANCE).toMatch(/testid: "compliance-tile-missing-nusk-ap"/);
    expect(COMPLIANCE).toMatch(/فواتير نُسك بدون قيد ذمم/);
  });

  it("failed-imports tile drills into /umrah/import (batch history)", () => {
    expect(COMPLIANCE).toMatch(/href: `\/umrah\/import`,\s*[\r\n]+\s*testid: "compliance-tile-failed-imports"/);
  });

  it("missing-nusk-ap tile drills into /umrah/nusk-invoices", () => {
    expect(COMPLIANCE).toMatch(/href: `\/umrah\/nusk-invoices`,\s*[\r\n]+\s*testid: "compliance-tile-missing-nusk-ap"/);
  });

  it("totalRisk folds the two new signals into the headline number", () => {
    // Without this the badge would underreport — operator wouldn't
    // know there's silent finance + import damage to look at.
    expect(COMPLIANCE).toMatch(/\(data\?\.failedImportRows30d \?\? 0\) \+\s*[\r\n]+\s*\(data\?\.missingNuskApJournals \?\? 0\)/);
  });
});
