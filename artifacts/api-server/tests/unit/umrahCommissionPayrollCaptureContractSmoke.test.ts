import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * U-06-P1 — payroll capture journey contract smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-06 audit §3.1):
 *   - The live verify script at scripts/verify-umrah-commission-
 *     payroll-journey.sh exercises 9 assertion groups end-to-end
 *     against a running server. It is manual-only and never runs in
 *     CI.
 *   - This smoke pins the SOURCE-LEVEL invariants the script
 *     depends on so a regression on any of them surfaces on every
 *     PR — without needing the full DB harness.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No dynamic integration test yet — the HR payroll runner is
 *     tightly coupled to the HTTP scope (route guard + role gate at
 *     hr.ts:2911) and would need refactoring to be called engine-
 *     direct. That refactor is U-06-P3 scope.
 *   - No migration. No FE.
 *
 * Failure modes pinned:
 *   - Verify script is renamed/moved/deleted → §A fails.
 *   - The "via HR" routing (CR salary_payable for unified mode)
 *     regresses in the commission engine → §B fails.
 *   - `payroll_commission_expense` mapping operation disappears
 *     from the commission engine → §C fails.
 *   - The HR /payroll route stops gating on financial period open
 *     → §D fails (live verify would silently post into a closed
 *     period).
 *   - exactly-once stamping pattern (status='paid' +
 *     payrollLineId) disappears from the HR payroll runner → §E
 *     fails (control rows would get consumed twice).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const VERIFY_SCRIPT_PATH = join(
  REPO_ROOT,
  "scripts/verify-umrah-commission-payroll-journey.sh",
);

const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahCommissionEngine.ts"),
  "utf8",
);
const HR_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Verify script is present
// ─────────────────────────────────────────────────────────────────────────────
describe("U-06-P1 §A — live verify script is present at the documented path", () => {
  it("scripts/verify-umrah-commission-payroll-journey.sh exists", () => {
    expect(existsSync(VERIFY_SCRIPT_PATH)).toBe(true);
  });

  it("script's headline comment names the journey it covers", () => {
    const sh = readFileSync(VERIFY_SCRIPT_PATH, "utf8");
    // The bash comment header carries `# verify-umrah-commission-
    // payroll-journey.sh — E2E proof that umrah sales\n#
    // commissions land in payroll`. Use a forgiving alternation that
    // tolerates the wrapped-comment newline + `#` marker without
    // demanding a specific layout.
    expect(sh).toMatch(/umrah[\s\S]{0,80}?commissions[\s\S]{0,80}?payroll/i);
    expect(sh).toMatch(/payroll_lines\.commission/);
    expect(sh).toMatch(/exactly-once/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Engine routes commission via HR (CR salary_payable in unified mode)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-06-P1 §B — commission engine routes CR via HR when commission_via_hr=true", () => {
  it("reads commission_via_hr setting", () => {
    expect(ENGINE).toMatch(/['"]commission_via_hr['"]/);
  });

  it("unified mode CRs to salary_payable (2120) via getAccountCodeFromMapping", () => {
    expect(ENGINE).toMatch(
      /getAccountCodeFromMapping\([\s\S]{0,150}?['"]salary_payable['"][\s\S]{0,150}?['"]credit['"][\s\S]{0,80}?['"]2120['"]/,
    );
  });

  it("legacy split mode (commission_via_hr='false') CRs to commission_payable (2155)", () => {
    expect(ENGINE).toMatch(
      /getAccountCodeFromMapping\([\s\S]{0,150}?['"]commission_payable['"][\s\S]{0,150}?['"]credit['"][\s\S]{0,80}?['"]2155['"]/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — payroll_commission_expense mapping is referenced (5240 DR)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-06-P1 §C — commission engine maps the expense via getAccountCodeFromMapping('commission_expense')", () => {
  it("the commission_expense operation key is used in the DR resolution", () => {
    expect(ENGINE).toMatch(
      /getAccountCodeFromMapping\([\s\S]{0,150}?['"]commission_expense['"][\s\S]{0,150}?['"]debit['"]/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — HR payroll runner gates on financial period open
// ─────────────────────────────────────────────────────────────────────────────
describe("U-06-P1 §D — HR /payroll runner gates on financial period open", () => {
  it("calls checkFinancialPeriodOpen before any payroll write", () => {
    expect(HR_ROUTE).toMatch(/checkFinancialPeriodOpen/);
  });

  it("throws ValidationError when the period is closed", () => {
    expect(HR_ROUTE).toMatch(
      /periodCheck\.open[\s\S]{0,400}?throw\s+new\s+ValidationError\(/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — exactly-once consumption pattern
// ─────────────────────────────────────────────────────────────────────────────
describe("U-06-P1 §E — commission consumption stamps payrollLineId + flips status", () => {
  it("HR payroll runner writes payrollLineId on the approved calc row", () => {
    // The runner updates employee_commission_calculations with
    // status='paid' + the new payrollLineId. The smoke is content-
    // agnostic about the exact SQL but pins the column reference
    // pair so a regression that drops either half fires here.
    expect(HR_ROUTE).toMatch(/employee_commission_calculations/);
    expect(HR_ROUTE).toMatch(/payrollLineId/);
  });

  it("HR payroll runner flips approved → paid (no other intermediate state)", () => {
    expect(HR_ROUTE).toMatch(
      /UPDATE\s+employee_commission_calculations[\s\S]{0,800}?status\s*=\s*'paid'/i,
    );
  });
});
