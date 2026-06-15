import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// VAT reconciliation report — companion to the WHT summary (#1027).
// Verifies that GET /reports/vat-reconciliation:
//   1. resolves the output + input VAT account codes from
//      accounting_mappings (with 2300 / 1400 fallback),
//   2. queries journal_lines + journal_entries scoped to active
//      (balancesApplied + reversedById IS NULL) entries,
//   3. computes outputVAT = credit − debit on the output account
//      and inputVAT = debit − credit on the input account,
//   4. compares period netVATDue against the live since-opening
//      account balance and flags drift,
//   5. breaks the period numbers down per source type,
//   6. is read-only.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/vat-reconciliation"');
const HANDLER = ROUTE.slice(START);

describe("/reports/vat-reconciliation endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/vat-reconciliation"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("VAT account resolution", () => {
  it("resolves vat_output operation type with fallback 2300", () => {
    expect(HANDLER).toMatch(/"vat_output",\s*"credit",\s*"2300"/);
  });
  it("resolves vat_input operation type with fallback 1400", () => {
    expect(HANDLER).toMatch(/"vat_input",\s*"debit",\s*"1400"/);
  });
});

describe("VAT period query scopes to active entries", () => {
  it("joins journal_entries via jl.journalId", () => {
    expect(HANDLER).toMatch(/JOIN journal_entries je\s+ON je\.id = jl\."journalId"/);
  });
  it("filters out deleted entries", () => {
    expect(HANDLER).toMatch(/je\."deletedAt" IS NULL/);
  });
  it("excludes reversed entries (reversedById IS NULL)", () => {
    expect(HANDLER).toMatch(/je\."reversedById" IS NULL/);
  });
  it("requires balancesApplied = true (drafts don't count)", () => {
    expect(HANDLER).toMatch(/je\."balancesApplied" = true/);
  });
  it("date filters bind against je.date (ledger date — postingDate alias is output-only)", () => {
    expect(HANDLER).toMatch(/je\."date" >= \$\$\{params\.length\}/);
    expect(HANDLER).toMatch(/je\."date" < \(\$\$\{params\.length\}::date \+ 1\)/);
  });
  it("filters journal_lines by the resolved VAT account codes", () => {
    expect(HANDLER).toMatch(/jl\."accountCode" IN \(\$2, \$3\)/);
  });
});

describe("VAT live-balance query has NO date filter", () => {
  it("uses since-opening balance (no startDate / endDate bind)", () => {
    // The balance query block must not bind dates — drift comparison
    // depends on it being all-time vs. our period numbers.
    const balStart = HANDLER.indexOf("SELECT jl.\"accountCode\",\n                SUM(COALESCE(jl.credit, 0) - COALESCE(jl.debit, 0))");
    expect(balStart).toBeGreaterThan(-1);
    const balEnd = HANDLER.indexOf("GROUP BY jl.\"accountCode\"`,", balStart);
    const balBlock = HANDLER.slice(balStart, balEnd);
    expect(balBlock).not.toMatch(/postingDate >= /);
    expect(balBlock).not.toMatch(/postingDate < /);
  });
});

describe("VAT math + per-source rollup", () => {
  it("outputVAT = credit − debit on output account", () => {
    expect(HANDLER).toMatch(/r\.accountCode === outputVatCode\)\s*\{[\s\S]{0,200}credit - debit/);
  });
  it("inputVAT = debit − credit on input account", () => {
    expect(HANDLER).toMatch(/r\.accountCode === inputVatCode\)\s*\{[\s\S]{0,200}debit - credit/);
  });
  it("netVatDue = outputVatPeriod − inputVatPeriod", () => {
    expect(HANDLER).toMatch(/netVatDue = outputVatPeriod - inputVatPeriod/);
  });
  it("drift = liveNetPayable − netVatDue (with cleanness flag)", () => {
    expect(HANDLER).toMatch(/drift = roundTo2\(liveNetPayable - netVatDue\)/);
    expect(HANDLER).toMatch(/driftIsClean: Math\.abs\(drift\) < 0\.005/);
  });
  it("bySource bucket keyed on sourceType (with 'other' fallback)", () => {
    expect(HANDLER).toContain("bySource");
    expect(HANDLER).toMatch(/COALESCE\(je\."sourceType", 'other'\)/);
  });
  it("bySource sorted by absolute net VAT magnitude (biggest moves first)", () => {
    expect(HANDLER).toMatch(/Math\.abs\(b\.netVat\) - Math\.abs\(a\.netVat\)/);
  });
});

describe("VAT report payload shape", () => {
  it("exposes filters + accounts + summary + bySource", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("accounts:");
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toContain("bySource:");
  });
  it("summary includes period + live + drift fields", () => {
    expect(HANDLER).toMatch(/outputVatPeriod:/);
    expect(HANDLER).toMatch(/inputVatPeriod:/);
    expect(HANDLER).toMatch(/netVatDue:/);
    expect(HANDLER).toMatch(/outputVatLiveBalance:/);
    expect(HANDLER).toMatch(/inputVatLiveBalance:/);
    expect(HANDLER).toMatch(/liveNetPayable:/);
    expect(HANDLER).toMatch(/drift,/);
    expect(HANDLER).toMatch(/driftIsClean:/);
  });
  it("response passed through maskFields", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
});

describe("VAT report is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
