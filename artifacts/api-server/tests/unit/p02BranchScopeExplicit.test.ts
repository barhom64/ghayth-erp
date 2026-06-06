import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P0.2 follow-up — explicit branch-scope flags on critical routes ───────
//
// P0 (commit 8068881c) added a runtime `logger.warn` whenever a route
// calls buildScopedWhere/scopedQuery WITHOUT declaring
// enforceBranchScope or disableBranchScope. That warn surfaces the
// problem in production logs; this followup commit ratchets it down
// for the routes that were genuinely leaking branch data, leaving an
// explicit + commented flag on each of the five callsites we audited.
//
// These assertions are static — they read the source files and check
// for the literal flag. A regression PR that drops the flag fails
// loudly here.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const SUPPORT = read("artifacts/api-server/src/routes/support.ts");
const FINANCE_ACCOUNTS = read("artifacts/api-server/src/routes/finance-accounts.ts");
const AUDIT_LOGS = read("artifacts/api-server/src/routes/auditLogs.ts");
const FINANCE_RECURRING = read("artifacts/api-server/src/routes/finance-recurring.ts");

describe("P0.2 — support tickets enforce branch scope", () => {
  it("/tickets list passes enforceBranchScope: true", () => {
    // The support-ticket list endpoint used to drop disableBranchScope
    // without re-adding enforce, leaking other branches' tickets to
    // scoped agents.
    const idx = SUPPORT.indexOf('router.get("/tickets"');
    expect(idx).toBeGreaterThan(-1);
    const block = SUPPORT.slice(idx, idx + 2000);
    expect(block).toContain("enforceBranchScope: true");
  });
});

describe("P0.2 — finance-accounts has explicit flag on every scoped call", () => {
  it("/chart-of-accounts passes disableBranchScope: true (company-wide catalog)", () => {
    const idx = FINANCE_ACCOUNTS.indexOf('accountsRouter.get("/chart-of-accounts"');
    expect(idx).toBeGreaterThan(-1);
    const block = FINANCE_ACCOUNTS.slice(idx, idx + 1500);
    expect(block).toContain("disableBranchScope: true");
    // Comment explaining why must remain so a future reviewer doesn't
    // re-enable the scope and break downstream consumers.
    expect(block).toContain("COMPANY-WIDE-BY-DESIGN");
  });

  it("/accounts passes disableBranchScope: true (same COA rationale)", () => {
    const idx = FINANCE_ACCOUNTS.indexOf('accountsRouter.get("/accounts"');
    expect(idx).toBeGreaterThan(-1);
    const block = FINANCE_ACCOUNTS.slice(idx, idx + 1500);
    expect(block).toContain("disableBranchScope: true");
  });

  it("/journal passes enforceBranchScope: true (journal entries ARE branch-scoped)", () => {
    const idx = FINANCE_ACCOUNTS.indexOf('accountsRouter.get("/journal"');
    expect(idx).toBeGreaterThan(-1);
    const block = FINANCE_ACCOUNTS.slice(idx, idx + 2000);
    expect(block).toContain("enforceBranchScope: true");
    expect(block).toContain('je."branchId"');
  });
});

describe("P0.2 — legitimately-disabled scopes carry an explanatory comment", () => {
  // Two routes legitimately use disableBranchScope: true. Both have
  // documented rationale (audit access at level 90 / recurring-template
  // catalog at finance-manager level). The comment must stay so a
  // future reviewer doesn't "fix" the flag back to enforce.

  it("audit_logs route has the explanatory comment", () => {
    const idx = AUDIT_LOGS.indexOf("disableBranchScope: true");
    expect(idx).toBeGreaterThan(-1);
    const block = AUDIT_LOGS.slice(Math.max(0, idx - 600), idx);
    expect(block).toContain("audit_logs has a branchId column");
    expect(block).toContain("compliance");
  });

  it("recurring_journals route has the explanatory comment", () => {
    const idx = FINANCE_RECURRING.indexOf("disableBranchScope: true");
    expect(idx).toBeGreaterThan(-1);
    const block = FINANCE_RECURRING.slice(Math.max(0, idx - 600), idx);
    expect(block).toContain("recurring_journals has a branchId column");
    expect(block).toContain("finance-manager-owned");
  });
});
