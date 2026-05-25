import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Lot expiry alerts report. Verifies that GET /reports/lot-expiry-alerts:
//   1. lists active qc-approved lots within a look-ahead window
//      (default 90 days; capped at 365),
//   2. excludes already-expired lots unless ?includeExpired=true,
//   3. computes daysUntil + exposureValue per row,
//   4. buckets each row into the warehouse's expiryAlertDays
//      threshold list (default [30,60,90] when null),
//   5. surfaces overdue rows first in the byBucket rollup,
//   6. is read-only.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/lot-expiry-alerts"');
const HANDLER = ROUTE.slice(START);

describe("/reports/lot-expiry-alerts endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/lot-expiry-alerts"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("look-ahead window has sane defaults + cap", () => {
  it("default look-ahead is 90 days", () => {
    expect(HANDLER).toMatch(/Number\(daysAhead \?\? "90"\)/);
  });
  it("capped at 365 days so a typo can't scan the whole inventory", () => {
    expect(HANDLER).toMatch(/Math\.min\(Math\.floor\(aheadParsed\), 365\)/);
  });
});

describe("WHERE filters", () => {
  it("active qc-approved lots only (quantity > 0)", () => {
    expect(HANDLER).toMatch(/l\."qualityControlStatus" = 'approved'/);
    expect(HANDLER).toMatch(/l\.quantity > 0/);
  });
  it("lot must have an expiryDate", () => {
    expect(HANDLER).toMatch(/l\."expiryDate" IS NOT NULL/);
  });
  it("expiryDate <= today + window-days (interval math)", () => {
    expect(HANDLER).toMatch(/l\."expiryDate" <= \(CURRENT_DATE \+ \(\$2 \|\| ' days'\)::interval\)/);
  });
  it("excludes lot.status='expired' by default", () => {
    expect(HANDLER).toContain(`l.status != 'expired'`);
  });
  it("includeExpired=true overrides the status filter", () => {
    expect(HANDLER).toMatch(/includeExpired === "true"\s*\?\s*""/);
  });
  it("excludes soft-deleted lots / products / warehouses", () => {
    expect(HANDLER).toMatch(/l\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/p\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/w\."deletedAt" IS NULL/);
  });
  it("branch scope honoured against the warehouse", () => {
    expect(HANDLER).toMatch(/getBranchCondition\(scope, undefined, params, "w"\)/);
  });
});

describe("query columns", () => {
  it("returns daysUntil = expiryDate − CURRENT_DATE (cast to int)", () => {
    expect(HANDLER).toMatch(/\(l\."expiryDate" - CURRENT_DATE\)::int AS "daysUntil"/);
  });
  it("returns exposureValue = quantity × unitCost", () => {
    expect(HANDLER).toMatch(/\(l\.quantity \* l\."unitCost"\)::float8 AS "exposureValue"/);
  });
  it("pulls warehouse.expiryAlertDays for per-warehouse thresholds", () => {
    expect(HANDLER).toMatch(/w\."expiryAlertDays"\s+AS "expiryAlertDays"/);
  });
  it("ORDER BY expiryDate ASC (most-urgent first)", () => {
    expect(HANDLER).toMatch(/ORDER BY l\."expiryDate" ASC/);
  });
});

describe("bucketing", () => {
  it("DEFAULT_BUCKETS = [30, 60, 90] when warehouse has none", () => {
    expect(HANDLER).toMatch(/DEFAULT_BUCKETS = \[30, 60, 90\]/);
  });
  it("daysUntil < 0 → 'overdue' bucket", () => {
    expect(HANDLER).toMatch(/if \(daysUntil < 0\)[\s\S]{0,80}bucketLabel = "overdue"/);
  });
  it("smallest threshold ≥ daysUntil wins the bucket", () => {
    expect(HANDLER).toMatch(/wbuckets\.find\(\(t\) => daysUntil <= t\)/);
  });
  it("byBucket sorted overdue first, then ascending threshold", () => {
    expect(HANDLER).toMatch(/threshold === "overdue"\) return -1/);
    expect(HANDLER).toMatch(/threshold === "overdue"\) return 1/);
  });
});

describe("payload shape", () => {
  it("exposes filters + summary + byBucket + data", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toContain("byBucket:");
    expect(HANDLER).toMatch(/data: out,/);
  });
  it("summary exposes lotCount + totalExposureValue + windowDays", () => {
    expect(HANDLER).toMatch(/lotCount: rows\.length/);
    expect(HANDLER).toMatch(/totalExposureValue: roundTo2\(totalExposure\)/);
    expect(HANDLER).toMatch(/windowDays: aheadDays/);
  });
  it("response passed through maskFields", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
  it("LIMIT 2000 on the detail rows", () => {
    expect(HANDLER).toMatch(/LIMIT 2000/);
  });
});

describe("is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
