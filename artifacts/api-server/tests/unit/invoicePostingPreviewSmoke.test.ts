import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

// ─── Posting Preview — Finance Line-Level Allocation Phase 3 P0 ─────────────
// POST /invoices/:id/preview-posting returns the journal lines that
// /approve would post, with blockers/warnings the operator must see.
// Read-only — must not move balances, must not start a transaction,
// must not call postJournalEntry.

describe("POST /invoices/:id/preview-posting", () => {
  const idx = ROUTE.indexOf('"/invoices/:id/preview-posting"');
  const endIdx = ROUTE.indexOf("invoicesRouter.", idx + 10);
  const handler = ROUTE.slice(idx, endIdx);

  it("endpoint exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("requires `view` authorize action — not `approve`", () => {
    // Preview is read-only; a junior accountant should be able to see it
    // before the approver is invoked.
    expect(handler).toMatch(/action:\s*"view"/);
  });

  it("does NOT call postJournalEntry (read-only)", () => {
    expect(handler).not.toContain("postJournalEntry");
  });

  it("does NOT open a transaction (no GL movement)", () => {
    expect(handler).not.toContain("withTransaction");
  });

  it("does NOT update or insert into chart_of_accounts / journal_entries", () => {
    expect(handler).not.toMatch(/UPDATE\s+chart_of_accounts/i);
    expect(handler).not.toMatch(/INSERT\s+INTO\s+journal_entries/i);
    expect(handler).not.toMatch(/INSERT\s+INTO\s+journal_lines/i);
  });

  it("reads invoice_lines with the full dimensional set", () => {
    expect(handler).toContain("FROM invoice_lines");
    for (const col of [
      "accountCode", "allocationStatus", "costCenterId", "activityType",
      "projectId", "vehicleId", "propertyId", "unitId", "assetId",
      "employeeId", "driverId", "contractId",
      "umrahSeasonId", "umrahAgentId", "productId",
    ]) {
      expect(handler).toContain(`"${col}"`);
    }
  });

  it("returns blockers array and gates canApprove on it", () => {
    expect(handler).toContain("const blockers");
    expect(handler).toContain("blockers.push");
    expect(handler).toContain("canApprove: blockers.length === 0");
  });

  it("blocks approval when status is not approvable", () => {
    expect(handler).toContain("approvableStates");
    expect(handler).toContain("draft");
    expect(handler).toContain("returned");
  });

  it("blocks approval when financial period is closed", () => {
    expect(handler).toContain("checkFinancialPeriodOpen");
    expect(handler).toMatch(/periodCheck\.open[\s\S]{0,200}blockers\.push/);
  });

  it("warns (not blocks) when some lines are unmapped", () => {
    expect(handler).toContain("unmappedLineIds");
    expect(handler).toMatch(/unmappedLineIds\.length\s*>\s*0[\s\S]{0,200}warnings\.push/);
    // un-mapped lines push to WARNINGS, not blockers
    const unmapBlock = handler.slice(
      handler.indexOf("unmappedLineIds.length > 0")
    );
    // The first push call after the if() must be warnings.push, not blockers.push
    const firstPush = unmapBlock.match(/(warnings|blockers)\.push/);
    expect(firstPush?.[1]).toBe("warnings");
  });

  it("warns when invoice has no lines stored", () => {
    expect(handler).toMatch(/الفاتورة ليس لها بنود/);
  });

  it("warns when there is a rounding diff between Σ(lines) and (total-vat)", () => {
    expect(handler).toContain("فرق تقريب");
    expect(handler).toMatch(/diff\s*>=?\s*0\.005|Math\.abs\(diff\)\s*>=?\s*0\.005/);
  });

  it("returns canApprove=false when totals don't balance", () => {
    expect(handler).toContain("isBalanced");
    expect(handler).toContain("canApprove: blockers.length === 0 && isBalanced");
  });

  it("emits per-line CR lines bucketed by (accountCode + dimensions)", () => {
    // mirrors the /approve bucket logic
    expect(handler).toContain("buckets.set");
    expect(handler).toContain("ln.vehicleId");
    expect(handler).toContain("ln.propertyId");
    expect(handler).toContain("ln.projectId");
  });

  it("preview output exposes dimensions per journal line", () => {
    expect(handler).toContain("dimensions:");
    expect(handler).toContain("vehicleId");
    expect(handler).toContain("propertyId");
  });

  it("AR debit + VAT credit remain header-level", () => {
    expect(handler).toContain("accountCode: invArCode,");
    expect(handler).toContain("accountCode: invVatPayableCode,");
  });
});
