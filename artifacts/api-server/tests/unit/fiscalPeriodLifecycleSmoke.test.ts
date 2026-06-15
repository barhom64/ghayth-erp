import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SVC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/fiscalPeriodLifecycle.ts"),
  "utf8"
);
const HARDENING = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-hardening.ts"),
  "utf8"
);
const JOURNAL = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8"
);
// FIN-PERIOD-CLOSE (#2250) — the integrity-blocker checks (pending manual JEs,
// amortization, deferred revenue, dimensions, fallback, manual-no-reason,
// posting failures) moved into the aggregating coordinator; the gate delegates.
const COORD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/periodCloseCoordinator.ts"),
  "utf8"
);

// ─── Audit F3 — Fiscal-period lifecycle canonical helper ───────────────────
// Locks the contract of `closeFiscalPeriodCanonical` and proves both
// call-sites (the public close route + the year-end-close force path)
// route through it. Before this helper existed, year-end did its own
// raw UPDATE that bypassed the pending-JE guard.

describe("closeFiscalPeriodCanonical — public surface", () => {
  it("exports closeFiscalPeriodCanonical", () => {
    expect(SVC).toContain("export async function closeFiscalPeriodCanonical");
  });
  it("exports the CloseFiscalPeriodOptions / CloseFiscalPeriodResult types", () => {
    expect(SVC).toMatch(/export type CloseFiscalPeriodOptions/);
    expect(SVC).toMatch(/export type CloseFiscalPeriodResult/);
  });
});

describe("closeFiscalPeriodCanonical — guards", () => {
  it("rejects when period does not exist (NotFoundError)", () => {
    expect(SVC).toContain('throw new NotFoundError("الفترة غير موجودة")');
  });
  it("rejects when any integrity blocker exists (ConflictError, aggregated)", () => {
    // #2250 — the gate aggregates ALL blockers via the coordinator and throws
    // ONCE; the pending-manual-JE detection now lives in the coordinator.
    expect(SVC).toContain('throw new ConflictError');
    expect(SVC).toMatch(/if\s*\(blockers\.length\s*>\s*0\)/);
    expect(COORD).toContain("pendingCount");
    expect(COORD).toMatch(/"isManual"\s*=\s*TRUE/);
    expect(COORD).toMatch(/'draft'\s*,\s*'pending_review'/);
  });
  it("only counts journals dated inside the period", () => {
    expect(COORD).toMatch(/"createdAt"::date BETWEEN \$2 AND \$3/);
  });
});

describe("closeFiscalPeriodCanonical — transition", () => {
  it("uses applyTransition with fromStates=['open'] toState='closed'", () => {
    expect(SVC).toContain('fromStates: ["open"]');
    expect(SVC).toContain('toState: "closed"');
    expect(SVC).toContain('action: "fiscal_period.closed"');
  });
  it("writes closedAt=NOW() + closedBy into setExtras", () => {
    expect(SVC).toContain("closedAt:");
    expect(SVC).toContain("closedBy:");
  });
  it("supports reentrant transactions via opts.client", () => {
    expect(SVC).toMatch(/client\?:\s*pg\.PoolClient/);
    expect(SVC).toContain("client: c");
  });
});

describe("call-sites", () => {
  it("finance-hardening /fiscal-periods-v2/:id/close calls the helper", () => {
    expect(HARDENING).toContain("closeFiscalPeriodCanonical");
    // The old inline pendingCount query should no longer live in this route.
    // Pre-F3, the route did `SELECT COUNT(*)::text AS "pendingCount" FROM journal_entries`
    // inline; post-F3 that SQL only lives in fiscalPeriodLifecycle.ts.
    const pendingCountMatches = HARDENING.match(/SELECT COUNT\(\*\)::text AS "pendingCount" FROM journal_entries/g) ?? [];
    expect(pendingCountMatches.length).toBe(0);
  });
  it("finance-journal year-end force-close calls the helper", () => {
    expect(JOURNAL).toContain("closeFiscalPeriodCanonical");
    // The old raw-update should no longer exist in the force branch.
    const rawCloseMatches = JOURNAL.match(/UPDATE financial_periods SET status='closed'/g) ?? [];
    expect(rawCloseMatches.length).toBe(0);
  });
  it("year-end passes the outer client so the close joins the YE transaction", () => {
    // The force-close branch runs inside withTransaction and must pass
    // the client through so the close transition rolls back atomically
    // with the YE journal post.
    expect(JOURNAL).toMatch(/closeFiscalPeriodCanonical\([\s\S]{0,800}client,/);
  });
});
