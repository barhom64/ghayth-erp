import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dormant-entities CSV export — operators need a hand-off
 * artifact for the dimensional-graph cleanup workflow. The list
 * mixes two row shapes (cost-centre + subsidiary-account); the
 * export normalises both into a single sheet with a leading
 * `kind` column so either bucket can be filtered downstream.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dormant-entities.tsx"),
  "utf8",
);

describe("dormant-entities page — CSV export", () => {
  it("imports the unified-export helper", () => {
    expect(PAGE).toMatch(/import \{ exportRowsToCsv \} from "@\/lib\/unified-export"/);
  });

  it("button is hidden when both lists are empty (no orphan artefact)", () => {
    expect(PAGE).toMatch(/data && \(data\.costCenters\.length > 0 \|\| data\.subsidiaryAccounts\.length > 0\)/);
  });

  it("uses a dedicated entityType for the print_jobs row (routing the right letterhead)", () => {
    expect(PAGE).toMatch(/entityType: "report_dormant_entities"/);
  });

  it("title includes the lookback window so multiple exports don't collide", () => {
    expect(PAGE).toMatch(/title: `dormant-entities-\$\{data\.lookbackDays\}d`/);
  });

  it("emits a single sheet with a 'kind' column distinguishing CC vs subsidiary rows", () => {
    expect(PAGE).toMatch(/kind: "cost_center"/);
    expect(PAGE).toMatch(/kind: "subsidiary"/);
    expect(PAGE).toMatch(/\{ key: "kind",[\s]+label: "النوع" \}/);
  });

  it("computes ageDays from createdAt (same formula as the row body — drift alarm)", () => {
    const matches = PAGE.match(/Math\.floor\(\s*\(Date\.now\(\) - new Date\([^)]+\)\.getTime\(\)\) \/ \(1000 \* 60 \* 60 \* 24\)/g);
    expect(matches).not.toBeNull();
    // 3 occurrences: CcRow body + SubRow body + export. If any one
    // gets edited the others should be reviewed for consistency.
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("subsidiary rows carry balance; CC rows leave it blank (preserves type semantics)", () => {
    expect(PAGE).toMatch(/balance: String\(sa\.currentBalance \?\? 0\)/);
    expect(PAGE).toMatch(/balance: ""/);
  });

  it("autoCreated marker only set on CC rows (subs don't have that flag)", () => {
    expect(PAGE).toMatch(/autoCreated: cc\.autoCreatedReason \? "نعم" : ""/);
  });

  it("stable testid + Download icon to mirror the other finance exports", () => {
    expect(PAGE).toContain('data-testid="dormant-export-csv"');
    expect(PAGE).toMatch(/<Download className="h-4 w-4 ms-1" \/>/);
  });

  it("failures are logged with a scoped prefix (won't poison other exports' logs)", () => {
    expect(PAGE).toMatch(/console\.error\("\[dormant-entities export\] failed", err\)/);
  });

  it("columns list is exhaustive (9 columns covering both row shapes)", () => {
    for (const key of ["kind", "id", "code", "name", "type", "autoCreated", "ageDays", "jeCount", "balance"]) {
      expect(PAGE).toMatch(new RegExp(`\\{ key: "${key}",`));
    }
  });
});
