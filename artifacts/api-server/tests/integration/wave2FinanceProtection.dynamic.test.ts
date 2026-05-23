// Wave-2 finance regression suite — protects the six C/H fixes (PRs
// #879-#888) that shipped without their own tests. Each `describe` block
// below recreates the bug condition the corresponding PR fixed and asserts
// the new behavior holds. A future regression that re-introduces the bug
// breaks the matching test, so the fix is locked in for good.
//
// This is the first concrete step on Track C of the enterprise hardening
// roadmap (`docs/production-hardening/enterprise-hardening-roadmap.md`
// §"Track C — Finance Stabilization Phase"). The intent is to add scenarios
// here every time a finance fix lands that doesn't bring its own test.
//
// Activation: this file is auto-discovered by vitest, but every `describe`
// is wrapped in `runIf(dbReady)` — when DATABASE_URL is absent or doesn't
// point at the disposable test database (matching the same markers the
// tenant-isolation harness uses), the scenarios are reported as skipped
// rather than failed. This keeps the suite green on dev boxes without
// docker and flips ON automatically as soon as the test Postgres is wired.
//
// To run locally:
//
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/wave2FinanceProtection.dynamic.test.ts

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// ─────────────────────────────────────────────────────────────────────
// H2 — guard the closed period when applying deferred balances (#882)
// ─────────────────────────────────────────────────────────────────────

d("Wave-2 H2: applyJournalEntryBalances refuses to post into a closed period", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let applyJournalEntryBalances: typeof import("../../src/lib/businessHelpers.js").applyJournalEntryBalances;
  let ValidationError: typeof import("../../src/lib/errorHandler.js").ValidationError;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    withTransaction = rawdb.withTransaction;
    const helpers = await import("../../src/lib/businessHelpers.js");
    applyJournalEntryBalances = helpers.applyJournalEntryBalances;
    const errorHandler = await import("../../src/lib/errorHandler.js");
    ValidationError = errorHandler.ValidationError;

    // Reuse the two-company fixture for a baseline company + branch + user.
    // It seeds enough of the schema (companies, branches, employees,
    // employee_assignments, users) to make foreign keys happy.
    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
  });

  beforeEach(async () => {
    // Clean the rows this suite touches between scenarios so each test
    // starts from a known state. We intentionally leave the base
    // company/branch/user fixture in place.
    await rawExecute(`DELETE FROM journal_lines WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    // Ensure the two accounts our journal lines touch exist with a known
    // balance. ON CONFLICT keeps the seeder idempotent across runs.
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, "nameAr", "nameEn", type, "currentBalance")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0)
       ON CONFLICT ("companyId", code) DO UPDATE SET "currentBalance" = 0`,
      [companyId]
    );
  });

  // Helper: insert a deferred journal entry dated on the given day with a
  // single debit/credit pair. balancesApplied=false mirrors what
  // createJournalEntry({ deferBalances: true }) writes.
  async function insertDeferredEntry(opts: {
    ref: string;
    date: string; // ISO date — drives the period lookup
  }): Promise<number> {
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "balancesApplied", "createdAt"
       ) VALUES ($1, $2, $3, $4, 'wave2-h2-test', 'manual', false, $5::timestamptz)`,
      [companyId, branchId, assignmentId, opts.ref, opts.date]
    );
    await rawExecute(
      `INSERT INTO journal_lines ("companyId", "journalEntryId", "accountCode", debit, credit)
       VALUES ($1, $2, '1101', 100, 0), ($1, $2, '4101', 0, 100)`,
      [companyId, insertId]
    );
    return insertId;
  }

  it("posts cleanly when the entry's period is open", async () => {
    // 2025-06-15 sits inside an open June 2025 period.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'يونيو 2025', '2025-06-01', '2025-06-30', 'open')`,
      [companyId]
    );
    const journalId = await insertDeferredEntry({ ref: "JE-H2-OPEN", date: "2025-06-15" });

    await withTransaction(async (client) => {
      await applyJournalEntryBalances(client, companyId, journalId);
    });

    // Post-condition: balances applied + COA moved.
    const [je] = await rawQuery<{ balancesApplied: boolean }>(
      `SELECT "balancesApplied" FROM journal_entries WHERE id = $1`,
      [journalId]
    );
    expect(je.balancesApplied).toBe(true);

    const [acc] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='1101'`,
      [companyId]
    );
    expect(Number(acc.currentBalance)).toBe(100);
  });

  it("refuses with ValidationError(financialPeriod) when the entry's period is closed (the H2 fix)", async () => {
    // 2025-05-20 → May 2025 period (closed). The entry was deferred while
    // the month was open; approval comes after the close.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'مايو 2025', '2025-05-01', '2025-05-31', 'closed')`,
      [companyId]
    );
    const journalId = await insertDeferredEntry({ ref: "JE-H2-CLOSED", date: "2025-05-20" });

    let caught: unknown = null;
    await expect(
      withTransaction(async (client) => {
        await applyJournalEntryBalances(client, companyId, journalId);
      }).catch((err) => {
        caught = err;
        throw err;
      })
    ).rejects.toBeInstanceOf(ValidationError);

    // Structured field/fix per the typed-error contract (P0.3 / P1.3).
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as InstanceType<typeof ValidationError>).field).toBe("financialPeriod");

    // Post-condition: balances NOT applied + COA untouched (the transaction
    // rolled back). This is the whole point of the H2 fix.
    const [je] = await rawQuery<{ balancesApplied: boolean }>(
      `SELECT "balancesApplied" FROM journal_entries WHERE id = $1`,
      [journalId]
    );
    expect(je.balancesApplied).toBe(false);

    const [acc] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='1101'`,
      [companyId]
    );
    expect(Number(acc.currentBalance)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Placeholders for the remaining Wave-2 fixes — each `it.todo` becomes
// an `it()` as the scenario is written. Keeping them visible in the
// test output makes the coverage gap explicit instead of invisible.
// ─────────────────────────────────────────────────────────────────────

d("Wave-2 C1: financial statements filter by balancesApplied, not status='posted' (#879)", () => {
  it.todo(
    "trial balance / income statement only count entries with balancesApplied=true; " +
      "deferred entries are excluded; reconciles to chart_of_accounts.currentBalance",
  );
});

d("Wave-2 C2: gl/posting stamps createdAt with the accounting date, not NOW() (#886)", () => {
  it.todo(
    "an entry posted today with a 2025-06-15 accounting date carries createdAt=2025-06-15, " +
      "so range-filtered reports include it in June not in the current month",
  );
});

d("Wave-2 C3: expense entry + approval chain are atomic (#885)", () => {
  it.todo(
    "a forced failure between the journal post and the approval-chain insert " +
      "rolls both back — no orphan journal_entries row without an approval chain",
  );
});

d("Wave-2 H1: reversal runs inside the rejection lifecycle txn (#881)", () => {
  it.todo(
    "a forced failure inside reverseAccountBalances during expense rejection " +
      "rolls the status flip back — entry stays approved, balances stay applied, " +
      "no overstated books with status='rejected'",
  );
});

d("Wave-2 H3: appendRoundingAdjustment moves chart_of_accounts.currentBalance for 9999 (#884)", () => {
  it.todo(
    "after appending a rounding line for 0.02 SAR, account 9999's currentBalance " +
      "advances by 0.02 — the journal_lines sum and the currentBalance view agree",
  );
});

d("Wave-2 #888: createJournalEntry no longer auto-plugs gaps via account 9999", () => {
  it.todo(
    "an entry with a 0.03 SAR debit/credit gap throws ValidationError; " +
      "an exactly-balanced entry succeeds without a 9999 rounding line being injected",
  );
});
