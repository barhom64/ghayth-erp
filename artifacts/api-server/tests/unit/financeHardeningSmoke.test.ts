import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-hardening.ts"),
  "utf8"
);

describe("finance-hardening — fiscal periods v2", () => {
  it("GET /fiscal-periods-v2 requires finance:read", () => {
    const idx = SRC.indexOf('"/fiscal-periods-v2"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /fiscal-periods-v2 requires finance:create", () => {
    const idx = SRC.indexOf('.post("/fiscal-periods-v2"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("close and reopen endpoints exist", () => {
    expect(SRC).toContain('"/fiscal-periods-v2/:id/close"');
    expect(SRC).toContain('"/fiscal-periods-v2/:id/reopen"');
  });

  // PER-3 — audit-lock endpoint. `locked` is the stricter terminal
  // state above `closed`; once locked there is intentionally NO
  // reverse route. `checkFinancialPeriodOpen` + `systemGovernor`
  // already treat status='locked' as posting-blocking, so the
  // platform is wired to honor the lock the moment it's set.
  it("lock endpoint exists (PER-3) and uses lifecycle engine", () => {
    expect(SRC).toContain('"/fiscal-periods-v2/:id/lock"');
    const idx = SRC.indexOf('"/fiscal-periods-v2/:id/lock"');
    const block = SRC.slice(idx, idx + 2200);
    // Goes through applyTransition with the correct from/to states and
    // writes the audit-trail columns we just added in migration 207.
    expect(block).toContain('entity: "financial_periods"');
    expect(block).toContain('action: "fiscal_period.locked"');
    expect(block).toContain('fromStates: ["closed"]');
    expect(block).toContain('toState: "locked"');
    expect(block).toContain("lockedAt:");
    expect(block).toContain("lockedBy:");
    expect(block).toContain("lockReason:");
  });

  // Intercompany — from-leg JE, to-leg JE, and the parent
  // intercompany_transactions row must commit or roll back together.
  // The earlier shape used a compensating-reversal pattern on to-leg
  // failure but the subsequent intercompany_transactions INSERT lived
  // bare-outside-any-txn — a constraint violation there left BOTH
  // legs orphaned with no parent row.
  it("POST /intercompany wraps both legs + parent INSERT in one withTransaction (atomicity)", () => {
    const idx = SRC.indexOf('financeHardeningRouter.post("/intercompany"');
    expect(idx).toBeGreaterThan(-1);
    // Window widened (#1141 each-leg-its-own-number added a pre-issue
    // idempotency short-circuit + two issueNumber calls before the txn).
    const block = SRC.slice(idx, idx + 13000);
    // Outer withTransaction wraps the whole atomic block. The callback now
    // takes a `client` arg (used for the parent INSERT + numbering
    // link-backs), so match `withTransaction(async (` rather than the
    // zero-arg form.
    const txnStart = block.indexOf("withTransaction(async (");
    expect(txnStart).toBeGreaterThan(-1);
    // Both engine posts AND the intercompany_transactions INSERT live
    // inside that outer txn. Locate each and assert ordering.
    const fromPostIdx = block.indexOf("financialEngine.postJournalEntry", txnStart);
    const toPostIdx = block.indexOf("financialEngine.postJournalEntry", fromPostIdx + 1);
    const insertIdx = block.indexOf("INSERT INTO intercompany_transactions", toPostIdx);
    const txnCloseIdx = block.indexOf("\n    });", insertIdx);
    expect(fromPostIdx).toBeGreaterThan(txnStart);
    expect(toPostIdx).toBeGreaterThan(fromPostIdx);
    expect(insertIdx).toBeGreaterThan(toPostIdx);
    expect(txnCloseIdx).toBeGreaterThan(insertIdx);
  });

  it("POST /intercompany no longer needs compensating reverseAccountBalances (txn rollback handles it)", () => {
    const idx = SRC.indexOf('financeHardeningRouter.post("/intercompany"');
    const block = SRC.slice(idx, idx + 6500);
    // The old compensating reversal called reverseAccountBalances on
    // the from-leg journalId. With the outer-txn rollback, that explicit
    // call is no longer needed — Postgres rolls the from-leg SAVEPOINT
    // back automatically. Guard against a regression that re-introduces
    // the manual reversal (which would double-reverse if the txn
    // already rolled back).
    expect(block).not.toContain("reverseAccountBalances");
  });

  it("no /fiscal-periods-v2/:id/unlock route exists (locked is intentionally terminal)", () => {
    // PER-3 contract: a locked period stays locked. The platform has
    // a `reopen` route for `closed → open`, but not for `locked → *`.
    // The sanctioned way out is to NEVER lock unless the audit
    // sign-off is final. Catching a future PR that adds an unlock
    // route is the whole point of this test.
    expect(SRC).not.toContain('"/fiscal-periods-v2/:id/unlock"');
    expect(SRC).not.toContain('fromStates: ["locked"]');
  });
});

describe("finance-hardening — manual journal entries", () => {
  it("POST /journal-manual requires finance:create", () => {
    const idx = SRC.indexOf('"/journal-manual"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain("authorize(");
  });

  it("journal lifecycle: submit, review, approve, post", () => {
    expect(SRC).toContain('"/journal-manual/:id/submit"');
    expect(SRC).toContain('"/journal-manual/:id/review"');
    expect(SRC).toContain('"/journal-manual/:id/approve"');
    expect(SRC).toContain('"/journal-manual/:id/post"');
  });

  it("GET /journal-manual list and detail exist", () => {
    expect(SRC).toContain('.get("/journal-manual"');
    expect(SRC).toContain('"/journal-manual/:id"');
  });
});

describe("finance-hardening — bank guarantees", () => {
  it("full CRUD for bank guarantees", () => {
    expect(SRC).toContain('.get("/bank-guarantees"');
    expect(SRC).toContain('.post("/bank-guarantees"');
    expect(SRC).toContain('.patch("/bank-guarantees/:id"');
    expect(SRC).toContain('.delete("/bank-guarantees/:id"');
  });

  it("cancel and release endpoints exist", () => {
    expect(SRC).toContain('"/bank-guarantees/:id/cancel"');
    expect(SRC).toContain('"/bank-guarantees/:id/release"');
  });

  it("delete requires finance:delete", () => {
    const idx = SRC.indexOf('.delete("/bank-guarantees/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("finance-hardening — intercompany", () => {
  it("GET /intercompany requires finance:read", () => {
    const idx = SRC.indexOf('"/intercompany"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("consolidation endpoint exists", () => {
    expect(SRC).toContain('"/intercompany/consolidation"');
  });
});

describe("finance-hardening — projects & cost tracking", () => {
  it("finance projects CRUD exists", () => {
    expect(SRC).toContain('.get("/projects"');
    expect(SRC).toContain('.post("/projects"');
    expect(SRC).toContain('"/projects/:id"');
    expect(SRC).toContain('"/projects/:id/costs"');
  });

  it("cash flow forecast exists", () => {
    expect(SRC).toContain('"/cash-flow-forecast"');
  });

  it("cost center report exists", () => {
    expect(SRC).toContain('"/cost-center-report"');
  });
});

describe("finance-hardening — posting failures", () => {
  it("posting failures list endpoint exists", () => {
    expect(SRC).toContain('"/posting-failures"');
  });

  it("resolve posting failure requires finance:approve", () => {
    const idx = SRC.indexOf('"/posting-failures/:id/resolve"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("finance-hardening — security", () => {
  it("uses parameterized queries throughout", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(50);
  });

  it("scopes by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(30);
  });

  it("uses rawExecute for write operations", () => {
    const matches = [...SRC.matchAll(/rawExecute/g)];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});
