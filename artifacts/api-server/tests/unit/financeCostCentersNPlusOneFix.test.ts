/**
 * Finance cost-centers list — polymorphic N+1 fix.
 *
 * GET /api/finance/cost-centers/cost-centers returned up to 1000 cost
 * centers, each with a CASE expression evaluating a correlated
 * subquery per relatedEntityType against one of five different
 * tables (projects, fleet_vehicles, employees+employee_assignments,
 * departments, branches). For 1000 rows that's up to 1000 single-row
 * lookups across the five tables.
 *
 * The fix replaces each correlated subquery with a typed LEFT JOIN
 * keyed on (relatedEntityType, relatedEntityId, companyId). Each
 * JOIN is gated on the relatedEntityType so only the matching join
 * lights up per row — Postgres can plan all five together in one
 * scan. The employee branch uses an EXISTS sub-clause for the
 * company-assignment check so multiple assignments per employee
 * don't multiply the cost-center rows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-cost-centers.ts"),
  "utf8",
);

describe("Finance cost-centers list — polymorphic N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/cost-centers"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 5000);

  it("the /cost-centers handler is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated CASE WHEN ... THEN (SELECT name FROM ... LIMIT 1) per row remains", () => {
    expect(handler).not.toMatch(
      /CASE\s+WHEN\s+cc\."relatedEntityType"\s*=\s*'project'\s+THEN\s+\(SELECT/i,
    );
    expect(handler).not.toMatch(
      /WHEN\s+cc\."relatedEntityType"\s*=\s*'vehicle'\s+THEN\s+\(SELECT/i,
    );
    expect(handler).not.toMatch(
      /WHEN\s+cc\."relatedEntityType"\s*=\s*'employee'\s+THEN\s+\(SELECT/i,
    );
  });

  it("uses a CASE … WHEN type THEN <joined_column> shape over the joined alias", () => {
    expect(handler).toMatch(/CASE\s+cc\."relatedEntityType"/);
    expect(handler).toMatch(/WHEN\s+'project'\s+THEN\s+p\.name/);
    expect(handler).toMatch(/WHEN\s+'vehicle'\s+THEN\s+v\."plateNumber"/);
    expect(handler).toMatch(/WHEN\s+'employee'\s+THEN\s+e\.name/);
    expect(handler).toMatch(/WHEN\s+'department'\s+THEN\s+d\.name/);
    expect(handler).toMatch(/WHEN\s+'branch'\s+THEN\s+b\.name/);
  });

  it("LEFT JOINs all five target tables gated by relatedEntityType", () => {
    expect(handler).toMatch(/LEFT JOIN projects p[\s\S]*?cc\."relatedEntityType" = 'project'/);
    expect(handler).toMatch(/LEFT JOIN fleet_vehicles v[\s\S]*?cc\."relatedEntityType" = 'vehicle'/);
    expect(handler).toMatch(/LEFT JOIN employees e[\s\S]*?cc\."relatedEntityType" = 'employee'/);
    expect(handler).toMatch(/LEFT JOIN departments d[\s\S]*?cc\."relatedEntityType" = 'department'/);
    expect(handler).toMatch(/LEFT JOIN branches b[\s\S]*?cc\."relatedEntityType" = 'branch'/);
  });

  it("employee join uses EXISTS to avoid row multiplication from multiple assignments", () => {
    expect(handler).toMatch(
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+employee_assignments\s+ea[\s\S]*?ea\."employeeId" = e\.id[\s\S]*?ea\."companyId" = cc\."companyId"/,
    );
  });

  it("preserves the LIMIT 1000 cap", () => {
    expect(handler).toMatch(/LIMIT 1000/);
  });

  it("preserves the cc.status != 'deleted' filter", () => {
    // soft-delete filter on cost_centers is still in extraConditions
    expect(handler).toMatch(/cc\.status\s*!=\s*'deleted'/);
  });
});
