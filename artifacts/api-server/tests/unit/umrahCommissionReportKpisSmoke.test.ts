import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-04-P2 — commission report KPI extensions: condition-met split +
 * has-violations rollup.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-04 audit §3.2):
 *   - The /umrah/reports/commissions-summary route already exposes
 *     KPIs (total / calculatedAmount / paidAmount / pendingAmount /
 *     employeesCount) + 3 breakdowns. Add 5 new KPI fields built
 *     from columns that already exist on
 *     employee_commission_calculations:
 *       - conditionMetCount
 *       - conditionUnmetCount
 *       - conditionMetAmount
 *       - conditionUnmetAmount
 *       - hasViolationsCount
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch on umrahCommissionEngine.
 *   - No schema migration (all cols exist).
 *   - No new filter / no behaviour change on the existing 4 filters
 *     (seasonId / employeeId / year / status).
 *   - No /umrah/reports/commissions-summary/export route (U-04-P3).
 *   - No agent/sub-agent breakdown (U-04-P1, depends on U-05-P1).
 *
 * Failure modes pinned:
 *   - Engine source stops carrying `conditionMet` / `hasViolations`
 *     on the calc row → §A fails (independent check).
 *   - Route's KPI SELECT regresses to the legacy shape → §B fails.
 *   - Response JSON drops one of the new fields → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahCommissionEngine.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Source columns still present on the calc row
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P2 §A — engine still writes conditionMet + hasViolations to the calc row", () => {
  it("INSERT INTO employee_commission_calculations carries `conditionMet`", () => {
    expect(ENGINE).toMatch(/employee_commission_calculations[\s\S]{0,4000}?"conditionMet"/);
  });

  it("INSERT INTO employee_commission_calculations carries `hasViolations`", () => {
    expect(ENGINE).toMatch(/employee_commission_calculations[\s\S]{0,4000}?"hasViolations"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Route SELECT carries the 5 new aggregate columns
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P2 §B — commissions-summary KPI SELECT computes the 5 new fields", () => {
  it("conditionMetCount uses FILTER (WHERE cc.\"conditionMet\" = true)", () => {
    expect(ROUTES).toMatch(
      /COUNT\(\*\)\s+FILTER\s+\(WHERE\s+cc\."conditionMet"\s*=\s*true\)::text\s+AS\s+"conditionMetCount"/,
    );
  });

  it("conditionUnmetCount uses FILTER (WHERE cc.\"conditionMet\" = false)", () => {
    expect(ROUTES).toMatch(
      /COUNT\(\*\)\s+FILTER\s+\(WHERE\s+cc\."conditionMet"\s*=\s*false\)::text\s+AS\s+"conditionUnmetCount"/,
    );
  });

  it("conditionMetAmount sums finalAmount for met rows", () => {
    expect(ROUTES).toMatch(
      /SUM\(CASE\s+WHEN\s+cc\."conditionMet"\s*=\s*true\s+THEN\s+cc\."finalAmount"\s+ELSE\s+0\s+END\)[\s\S]{0,100}?AS\s+"conditionMetAmount"/,
    );
  });

  it("conditionUnmetAmount sums finalAmount for unmet rows", () => {
    expect(ROUTES).toMatch(
      /SUM\(CASE\s+WHEN\s+cc\."conditionMet"\s*=\s*false\s+THEN\s+cc\."finalAmount"\s+ELSE\s+0\s+END\)[\s\S]{0,100}?AS\s+"conditionUnmetAmount"/,
    );
  });

  it("hasViolationsCount uses FILTER (WHERE cc.\"hasViolations\" = true)", () => {
    expect(ROUTES).toMatch(
      /COUNT\(\*\)\s+FILTER\s+\(WHERE\s+cc\."hasViolations"\s*=\s*true\)::text\s+AS\s+"hasViolationsCount"/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Response JSON exposes the 5 new fields under kpis
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P2 §C — response JSON `kpis` carries the 5 new fields", () => {
  it("kpis.conditionMetCount is in the response", () => {
    expect(ROUTES).toMatch(/conditionMetCount:\s*Number\(k\.conditionMetCount\)/);
  });

  it("kpis.conditionUnmetCount is in the response", () => {
    expect(ROUTES).toMatch(/conditionUnmetCount:\s*Number\(k\.conditionUnmetCount\)/);
  });

  it("kpis.conditionMetAmount is in the response", () => {
    expect(ROUTES).toMatch(/conditionMetAmount:\s*Number\(k\.conditionMetAmount\)/);
  });

  it("kpis.conditionUnmetAmount is in the response", () => {
    expect(ROUTES).toMatch(/conditionUnmetAmount:\s*Number\(k\.conditionUnmetAmount\)/);
  });

  it("kpis.hasViolationsCount is in the response", () => {
    expect(ROUTES).toMatch(/hasViolationsCount:\s*Number\(k\.hasViolationsCount\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Existing KPIs unchanged (no regression)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-04-P2 §D — existing KPIs preserved", () => {
  it("total / calculatedAmount / paidAmount / pendingAmount / employeesCount still present", () => {
    expect(ROUTES).toMatch(/total:\s*Number\(k\.total\)/);
    expect(ROUTES).toMatch(/calculatedAmount:\s*Number\(k\.calculatedAmount\)/);
    expect(ROUTES).toMatch(/paidAmount:\s*Number\(k\.paidAmount\)/);
    expect(ROUTES).toMatch(/pendingAmount:\s*Number\(k\.pendingAmount\)/);
    expect(ROUTES).toMatch(/employeesCount:\s*Number\(k\.employeesCount\)/);
  });
});
