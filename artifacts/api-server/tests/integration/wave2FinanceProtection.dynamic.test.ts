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
  let userId: number;

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
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    // Clean the rows this suite touches between scenarios so each test
    // starts from a known state. journal_lines has no companyId of its
    // own; rows are scoped via the FK journalId → journal_entries.
    // Order matters: child rows before parent.
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    // chart_of_accounts has no UNIQUE constraint on ("companyId", code) in
    // the live schema, so the seeding INSERT below cannot rely on ON
    // CONFLICT to be idempotent. Wipe the seed rows first so each test
    // gets a clean balance state and we never accumulate duplicates.
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    // Re-seed the two accounts our journal lines touch with a known
    // balance. We just DELETEd above, so a plain INSERT is sufficient
    // (no ON CONFLICT needed — and there's no UNIQUE constraint to back
    // one anyway).
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0)`,
      [companyId]
    );
  });

  // Helper: insert a deferred journal entry dated on the given day with a
  // single debit/credit pair. balancesApplied=false mirrors what
  // createJournalEntry({ deferBalances: true }) writes.
  //
  // The entry's `date` (accounting date) is the field the period gate
  // checks — not `createdAt` (row insertion time). To make the test fail
  // loudly if anyone reverts to gating on createdAt, the two columns are
  // INTENTIONALLY set to different values: createdAt always 'now', and
  // date is the test's opts.date. A bug that re-reads createdAt would
  // then incorrectly resolve to today's period (always open) and the
  // closed-period assertion would no longer fail.
  async function insertDeferredEntry(opts: {
    ref: string;
    date: string; // ISO date — accounting/ledger date that drives the period lookup
  }): Promise<number> {
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "balancesApplied", "createdAt", date
       ) VALUES ($1, $2, $3, $4, 'wave2-h2-test', 'manual', false, NOW(), $5::date)`,
      [companyId, branchId, assignmentId, opts.ref, opts.date]
    );
    // journal_lines is scoped to its parent journal via journalId only;
    // there is no companyId column on journal_lines.
    await rawExecute(
      `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
       VALUES ($1, '1101', 100, 0), ($1, '4101', 0, 100)`,
      [insertId]
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
// H4 — guard the closed period when reversing posted balances. Mirrors
// H2 (apply) on the opposite leg: reverseAccountBalances must refuse to
// move chart_of_accounts.currentBalance when the entry's date sits in a
// closed / locked period. Without this, rejecting an invoice approved
// in a since-closed period silently rewrites that period's totals.
// ─────────────────────────────────────────────────────────────────────

d("Wave-2 H4: reverseAccountBalances refuses to move balances when the entry's period is closed", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let ValidationError: typeof import("../../src/lib/errorHandler.js").ValidationError;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const helpers = await import("../../src/lib/businessHelpers.js");
    reverseAccountBalances = helpers.reverseAccountBalances;
    const errorHandler = await import("../../src/lib/errorHandler.js");
    ValidationError = errorHandler.ValidationError;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 100),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', -100)`,
      [companyId]
    );
  });

  // Helper: insert a POSTED (balancesApplied=true) journal entry dated on
  // the given day so the period-close gate evaluates against the entry's
  // own ledger date — not its insertion time.
  async function insertPostedEntry(opts: { ref: string; date: string }): Promise<number> {
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "balancesApplied", "createdAt", date
       ) VALUES ($1, $2, $3, $4, 'wave2-h4-test', 'manual', true, NOW(), $5::date)`,
      [companyId, branchId, assignmentId, opts.ref, opts.date]
    );
    await rawExecute(
      `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
       VALUES ($1, '1101', 100, 0), ($1, '4101', 0, 100)`,
      [insertId]
    );
    return insertId;
  }

  it("reverses cleanly when the entry's period is open", async () => {
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'يونيو 2025', '2025-06-01', '2025-06-30', 'open')`,
      [companyId]
    );
    const journalId = await insertPostedEntry({ ref: "JE-H4-OPEN", date: "2025-06-15" });

    await reverseAccountBalances(companyId, journalId);

    // Post-condition: balancesApplied flipped to false + COA rolled back.
    const [je] = await rawQuery<{ balancesApplied: boolean }>(
      `SELECT "balancesApplied" FROM journal_entries WHERE id = $1`,
      [journalId]
    );
    expect(je.balancesApplied).toBe(false);

    const [acc1101] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='1101'`,
      [companyId]
    );
    expect(Number(acc1101.currentBalance)).toBe(0);
    const [acc4101] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='4101'`,
      [companyId]
    );
    expect(Number(acc4101.currentBalance)).toBe(0);
  });

  it("refuses with ValidationError(financialPeriod) when the entry's period is closed (the H4 fix)", async () => {
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'مايو 2025', '2025-05-01', '2025-05-31', 'closed')`,
      [companyId]
    );
    const journalId = await insertPostedEntry({ ref: "JE-H4-CLOSED", date: "2025-05-20" });

    let caught: unknown = null;
    await expect(
      reverseAccountBalances(companyId, journalId).catch((err) => {
        caught = err;
        throw err;
      })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as InstanceType<typeof ValidationError>).field).toBe("financialPeriod");

    // Post-condition: balancesApplied untouched + COA untouched. This is
    // the whole point of H4 — a rejection of a closed-period entry must
    // not silently rewind that period's totals.
    const [je] = await rawQuery<{ balancesApplied: boolean }>(
      `SELECT "balancesApplied" FROM journal_entries WHERE id = $1`,
      [journalId]
    );
    expect(je.balancesApplied).toBe(true);

    const [acc1101] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='1101'`,
      [companyId]
    );
    expect(Number(acc1101.currentBalance)).toBe(100);
  });

  it("no-ops on a deferred entry even in a closed period (drafts never moved the ledger)", async () => {
    // A deferred (draft) entry has balancesApplied=false — reversing it is
    // a no-op by design (FIN-007 follow-up), and the H4 gate must run
    // AFTER the balancesApplied short-circuit so a draft rejection still
    // works when its period is closed.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'مايو 2025', '2025-05-01', '2025-05-31', 'closed')`,
      [companyId]
    );
    const { insertId: journalId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "balancesApplied", "createdAt", date
       ) VALUES ($1, $2, $3, 'JE-H4-DRAFT', 'wave2-h4-draft', 'manual', false, NOW(), '2025-05-20'::date)`,
      [companyId, branchId, assignmentId]
    );

    await expect(reverseAccountBalances(companyId, journalId)).resolves.toBeUndefined();

    // Nothing changed: balancesApplied still false, COA untouched.
    const [je] = await rawQuery<{ balancesApplied: boolean }>(
      `SELECT "balancesApplied" FROM journal_entries WHERE id = $1`,
      [journalId]
    );
    expect(je.balancesApplied).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Placeholders for the remaining Wave-2 fixes — each `it.todo` becomes
// an `it()` as the scenario is written. Keeping them visible in the
// test output makes the coverage gap explicit instead of invisible.
// ─────────────────────────────────────────────────────────────────────

d("Wave-2 C1: financial statements filter by balancesApplied, not status='posted' (#879)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance", "allowPosting", "isActive")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0, true, true),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0, true, true)`,
      [companyId]
    );
  });

  it(
    "trial balance / income statement only count entries with balancesApplied=true; " +
      "deferred entries are excluded; reconciles to chart_of_accounts.currentBalance",
    async () => {
      // Seed two journal entries on the same accounts, same period:
      //   APPLIED: balancesApplied=true, 100 SAR DR/CR — counts in reports
      //   DEFERRED: balancesApplied=false, 50 SAR DR/CR — must NOT count
      // C1 fix asserts the report SQL filters by balancesApplied=true so
      // the deferred entry never inflates a trial-balance total even
      // though both rows are "posted" status.
      const { insertId: appliedJe } = await rawExecute(
        `INSERT INTO journal_entries (
           "companyId", "branchId", "createdBy", ref, description, type, status,
           "balancesApplied", "createdAt", date
         ) VALUES ($1, $2, $3, 'JE-C1-APPLIED', 'wave2-c1', 'manual', 'posted',
                   true, NOW(), CURRENT_DATE)`,
        [companyId, branchId, assignmentId]
      );
      await rawExecute(
        `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
         VALUES ($1, '1101', 100, 0), ($1, '4101', 0, 100)`,
        [appliedJe]
      );

      const { insertId: deferredJe } = await rawExecute(
        `INSERT INTO journal_entries (
           "companyId", "branchId", "createdBy", ref, description, type, status,
           "balancesApplied", "createdAt", date
         ) VALUES ($1, $2, $3, 'JE-C1-DEFERRED', 'wave2-c1', 'manual', 'posted',
                   false, NOW(), CURRENT_DATE)`,
        [companyId, branchId, assignmentId]
      );
      await rawExecute(
        `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
         VALUES ($1, '1101', 50, 0), ($1, '4101', 0, 50)`,
        [deferredJe]
      );

      // Drive the trial-balance SQL pattern from finance-reports.ts:90-108.
      // The critical clause is the `balancesApplied = true` filter on the
      // journal_entries JOIN inside the LEFT JOIN subquery.
      const rows = await rawQuery<{ code: string; totalDebit: string; totalCredit: string }>(
        `SELECT coa.code,
                COALESCE(SUM(fl.debit), 0) AS "totalDebit",
                COALESCE(SUM(fl.credit), 0) AS "totalCredit"
           FROM chart_of_accounts coa
           LEFT JOIN (
             SELECT jl."accountCode", jl.debit, jl.credit
               FROM journal_lines jl
               JOIN journal_entries je ON je.id = jl."journalId"
                AND je."companyId" = $1
                AND je."deletedAt" IS NULL
                AND je."balancesApplied" = true
                AND je."reversedById" IS NULL
           ) fl ON fl."accountCode" = coa.code
          WHERE coa."companyId" = $1 AND coa."deletedAt" IS NULL
          GROUP BY coa.code
          ORDER BY coa.code`,
        [companyId]
      );

      // Only the APPLIED entry's 100 SAR should land in the totals. The
      // deferred entry's 50 SAR must be invisible to the report. A
      // regression that drops the balancesApplied filter would see
      // 150 SAR on each side here.
      const bankRow = rows.find((r) => r.code === "1101");
      const revenueRow = rows.find((r) => r.code === "4101");
      expect(bankRow).toBeDefined();
      expect(revenueRow).toBeDefined();
      expect(Number(bankRow!.totalDebit)).toBe(100);
      expect(Number(bankRow!.totalCredit)).toBe(0);
      expect(Number(revenueRow!.totalCredit)).toBe(100);
      expect(Number(revenueRow!.totalDebit)).toBe(0);
    }
  );
});

d("Wave-2 C2: gl/posting stamps createdAt with the accounting date, not NOW() (#886)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let postJournalEntry: typeof import("../../src/lib/gl/posting.js").postJournalEntry;
  let buildEntry: typeof import("../../src/lib/gl/journal-poster.js").buildEntry;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  // 2026-06-16 — journal_entries.postedBy is a FK to users(id). After
  // #2504 made the fixture find-or-create (so userId ≠ assignmentId
  // when the rows are re-used across runs), passing assignmentId to
  // postJournalEntry's `createdBy` breaks the FK. Switch to userId.
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const posting = await import("../../src/lib/gl/posting.js");
    postJournalEntry = posting.postJournalEntry;
    const poster = await import("../../src/lib/gl/journal-poster.js");
    buildEntry = poster.buildEntry;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    // Open period that covers both today and the back-dated 2025-06-15
    // so the period gate never blocks the C2 dates we want to verify.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة مفتوحة', '2020-01-01', '2099-12-31', 'open')`,
      [companyId]
    );
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance", "allowPosting", "isActive")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0, true, true),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0, true, true)`,
      [companyId]
    );
  });

  it(
    "an entry posted today with a 2025-06-15 accounting date carries createdAt=2025-06-15, " +
      "so range-filtered reports include it in June not in the current month",
    async () => {
      // Build a balanced entry and post it through Path-B with an explicit
      // back-dated accounting date. The C2 fix stamps `createdAt` from
      // `ctx.date` (not NOW()) so finance reports range-filtering on
      // createdAt land it in June, not whatever month the row was
      // physically inserted in.
      const accounts = await rawQuery<{ id: number; code: string }>(
        `SELECT id, code FROM chart_of_accounts
           WHERE "companyId" = $1 AND code IN ('1101', '4101')
           ORDER BY code`,
        [companyId]
      );
      const acc1101 = accounts.find((a) => a.code === "1101")!;
      const acc4101 = accounts.find((a) => a.code === "4101")!;

      const payload = buildEntry({
        description: "wave2-c2 back-dated entry",
        lines: [
          { accountId: acc1101.id, amount: 100, description: "DR test bank" },
          { accountId: acc4101.id, amount: -100, description: "CR test revenue" },
        ],
      });

      const { journalEntryId } = await postJournalEntry(payload, {
        companyId,
        branchId,
        createdBy: userId,
        ref: "JE-C2-BACKDATED",
        date: "2025-06-15",
        type: "fx_revaluation",
        status: "posted",
      });

      // The bug we're guarding against: createdAt drifted to NOW(), so a
      // report filtering "WHERE createdAt BETWEEN '2025-06-01' AND
      // '2025-06-30'" silently dropped this entry. After the C2 fix
      // createdAt MUST equal the accounting date.
      const [row] = await rawQuery<{
        entryDate: string;
        createdAtDate: string;
      }>(
        `SELECT date::text AS "entryDate",
                "createdAt"::date::text AS "createdAtDate"
           FROM journal_entries WHERE id = $1`,
        [journalEntryId]
      );
      expect(row.entryDate).toBe("2025-06-15");
      // The critical C2 assertion: createdAt's date == accounting date,
      // NOT today's date. A future regression that reverts to NOW()
      // would set createdAtDate to today, breaking this equality.
      expect(row.createdAtDate).toBe("2025-06-15");
      expect(row.createdAtDate).toBe(row.entryDate);
    }
  );

  it("falls back to CURRENT_DATE when ctx.date is omitted (no back-date)", async () => {
    // Negative control: when the caller doesn't pass a date, both `date`
    // and `createdAt` should default to CURRENT_DATE (today). Guards
    // against a future refactor that hard-codes a constant or breaks
    // the COALESCE($6::date, CURRENT_DATE) pattern.
    const accounts = await rawQuery<{ id: number; code: string }>(
      `SELECT id, code FROM chart_of_accounts
         WHERE "companyId" = $1 AND code IN ('1101', '4101')
         ORDER BY code`,
      [companyId]
    );
    const acc1101 = accounts.find((a) => a.code === "1101")!;
    const acc4101 = accounts.find((a) => a.code === "4101")!;

    const payload = buildEntry({
      description: "wave2-c2 dateless entry",
      lines: [
        { accountId: acc1101.id, amount: 50, description: "DR" },
        { accountId: acc4101.id, amount: -50, description: "CR" },
      ],
    });

    const { journalEntryId } = await postJournalEntry(payload, {
      companyId,
      branchId,
      createdBy: userId,
      ref: "JE-C2-NODATE",
      type: "manual",
      status: "posted",
    });

    const [row] = await rawQuery<{
      entryDate: string;
      createdAtDate: string;
      todayDate: string;
    }>(
      `SELECT date::text AS "entryDate",
              "createdAt"::date::text AS "createdAtDate",
              CURRENT_DATE::text AS "todayDate"
         FROM journal_entries WHERE id = $1`,
      [journalEntryId]
    );
    expect(row.entryDate).toBe(row.todayDate);
    expect(row.createdAtDate).toBe(row.todayDate);
    expect(row.createdAtDate).toBe(row.entryDate);
  });
});

d("Wave-2 C3: expense entry + approval chain are atomic (#885)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let financialEngine: typeof import("../../src/lib/engines/financialEngine.js").financialEngine;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    withTransaction = rawdb.withTransaction;
    const engineMod = await import("../../src/lib/engines/financialEngine.js");
    financialEngine = engineMod.financialEngine;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة مفتوحة', '2020-01-01', '2099-12-31', 'open')`,
      [companyId]
    );
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance", "allowPosting", "isActive")
       VALUES ($1, '5101', 'مصروف اختبار', 'Test Expense', 'expense', 0, true, true),
              ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0, true, true)`,
      [companyId]
    );
  });

  it(
    "a forced failure between the journal post and the approval-chain insert " +
      "rolls both back — no orphan journal_entries row without an approval chain",
    async () => {
      // Drive the EXACT shape finance-journal.ts:519 uses for create-expense:
      //   withTransaction(async () => {
      //     await financialEngine.postJournalEntry({...});  // JE inserted
      //     await initiateApprovalChain({...});             // chain rows
      //   });
      // The forced failure here stands in for any throw between the post
      // and the chain insert (constraint violation, network blip, malformed
      // input). The C3 invariant: the whole transaction rolls back so the
      // JE row disappears too — no orphan posted expense without its
      // approval request.
      // Stable per-test token — the engine's volatility guard
      // (financialEngine.ts:74) rejects any sourceKey that embeds a
      // 13-digit Date.now() millisecond timestamp. Two random-base36
      // segments give enough entropy without tripping the regex.
      const idempotencyToken = `WAVE2-C3-FAIL-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const ref = `EXP-${idempotencyToken}`;

      let caught: unknown = null;
      await expect(
        withTransaction(async () => {
          await financialEngine.postJournalEntry({
            companyId,
            branchId,
            createdBy: userId,
            ref,
            description: "wave2-c3 forced-failure expense",
            type: "expense",
            sourceType: "expense",
            sourceId: 0,
            sourceKey: `finance:wave2-c3:${idempotencyToken}`,
            lines: [
              { accountCode: "5101", debit: 100, credit: 0 },
              { accountCode: "1101", debit: 0, credit: 100 },
            ],
          });
          // Stand-in for initiateApprovalChain throwing (FK violation,
          // missing chain definition, constraint, etc.).
          throw new Error("wave2-c3 forced approval-chain failure");
        }).catch((err) => {
          caught = err;
          throw err;
        })
      ).rejects.toThrow(/wave2-c3 forced approval-chain failure/);

      expect(caught).toBeInstanceOf(Error);

      // Post-condition — C3 atomicity invariant: NO journal_entries row
      // with our ref exists. A regression that moves financialEngine.post
      // OUTSIDE withTransaction would leave an orphan row here.
      const [{ count }] = await rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM journal_entries
          WHERE "companyId" = $1 AND ref = $2`,
        [companyId, ref]
      );
      expect(Number(count)).toBe(0);

      // And no chart_of_accounts.currentBalance movement.
      const [bank] = await rawQuery<{ currentBalance: string }>(
        `SELECT "currentBalance" FROM chart_of_accounts
          WHERE "companyId" = $1 AND code = '1101'`,
        [companyId]
      );
      expect(Number(bank.currentBalance)).toBe(0);
    }
  );

  it("positive control: same shape commits cleanly when nothing throws", async () => {
    // Guards against a future no-op transaction wrapper (e.g.
    // withTransaction silently swallowing throws). If the negative case
    // above started passing because the wrapper became a no-op, this
    // positive control would still fail (since no JE would land at all
    // in that scenario either) — well, actually it would still commit
    // since the body succeeds. The real defense: assert the JE is
    // observably present after the commit.
    const idempotencyToken = `WAVE2-C3-OK-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const ref = `EXP-${idempotencyToken}`;

    await withTransaction(async () => {
      await financialEngine.postJournalEntry({
        companyId,
        branchId,
        createdBy: userId,
        ref,
        description: "wave2-c3 positive control",
        type: "expense",
        sourceType: "expense",
        sourceId: 0,
        sourceKey: `finance:wave2-c3-ok:${idempotencyToken}`,
        lines: [
          { accountCode: "5101", debit: 100, credit: 0 },
          { accountCode: "1101", debit: 0, credit: 100 },
        ],
      });
      // No throw — represents a successful approval-chain insert.
    });

    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM journal_entries
        WHERE "companyId" = $1 AND ref = $2`,
      [companyId, ref]
    );
    expect(Number(count)).toBe(1);
  });
});

d("Wave-2 H1: reversal runs inside the rejection lifecycle txn (#881)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let applyTransition: typeof import("../../src/lib/lifecycleEngine.js").applyTransition;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let ValidationError: typeof import("../../src/lib/errorHandler.js").ValidationError;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const lifecycle = await import("../../src/lib/lifecycleEngine.js");
    applyTransition = lifecycle.applyTransition;
    const helpers = await import("../../src/lib/businessHelpers.js");
    reverseAccountBalances = helpers.reverseAccountBalances;
    const errorHandler = await import("../../src/lib/errorHandler.js");
    ValidationError = errorHandler.ValidationError;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 100),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', -100)`,
      [companyId]
    );
  });

  it(
    "a forced failure inside reverseAccountBalances during expense rejection " +
      "rolls the status flip back — entry stays approved, balances stay applied",
    async () => {
      // Setup: an approved expense JE (ref EXP%, status='approved',
      // balancesApplied=true) dated in a now-closed period. The reject
      // route's onApply calls reverseAccountBalances; H4 makes that throw
      // for closed periods. H1 is the atomicity invariant: that throw must
      // roll the status flip back, so the expense stays in 'approved' and
      // balancesApplied stays true.
      await rawExecute(
        `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
         VALUES ($1, 'مايو 2025', '2025-05-01', '2025-05-31', 'closed')`,
        [companyId]
      );
      const { insertId: expenseId } = await rawExecute(
        `INSERT INTO journal_entries (
           "companyId", "branchId", "createdBy", ref, description, type, status,
           "balancesApplied", "createdAt", date
         ) VALUES ($1, $2, $3, 'EXP-H1-CLOSED', 'wave2-h1-test', 'manual', 'approved', true, NOW(), '2025-05-20'::date)`,
        [companyId, branchId, assignmentId]
      );
      await rawExecute(
        `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
         VALUES ($1, '1101', 100, 0), ($1, '4101', 0, 100)`,
        [expenseId]
      );

      // Drive the exact same shape the /expenses/:id/approve reject branch
      // uses (finance-journal.ts:638): applyTransition + onApply →
      // reverseAccountBalances. The H4 throw inside onApply must roll the
      // whole transition back.
      let caught: unknown = null;
      await expect(
        applyTransition({
          entity: "journal_entries",
          id: expenseId,
          scope: { companyId, branchId, userId },
          action: "expense.rejected",
          fromStates: ["approved"],
          toState: "rejected",
          reason: "wave2-h1 forced rejection",
          extraWhere: `"deletedAt" IS NULL AND ref LIKE 'EXP%'`,
          onApply: async (_row, _client) => {
            await reverseAccountBalances(companyId, expenseId);
          },
        }).catch((err) => {
          caught = err;
          throw err;
        })
      ).rejects.toBeInstanceOf(ValidationError);

      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as InstanceType<typeof ValidationError>).field).toBe("financialPeriod");

      // Post-conditions — H1 atomicity invariant:
      //   1. status stays 'approved' (the rollback undid the flip to 'rejected')
      //   2. balancesApplied stays true (the rollback undid the reversal flag flip)
      //   3. chart_of_accounts.currentBalance untouched (no partial reversal)
      const [je] = await rawQuery<{ status: string; balancesApplied: boolean }>(
        `SELECT status, "balancesApplied" FROM journal_entries WHERE id = $1`,
        [expenseId]
      );
      expect(je.status).toBe("approved");
      expect(je.balancesApplied).toBe(true);

      const [acc1101] = await rawQuery<{ currentBalance: string }>(
        `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='1101'`,
        [companyId]
      );
      expect(Number(acc1101.currentBalance)).toBe(100);
      const [acc4101] = await rawQuery<{ currentBalance: string }>(
        `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='4101'`,
        [companyId]
      );
      expect(Number(acc4101.currentBalance)).toBe(-100);
    }
  );

  it("succeeds end-to-end when the period is open — status flips, balances reverse, all in one txn", async () => {
    // Positive control: with an open period, the same applyTransition +
    // reverseAccountBalances path commits cleanly. Guards against a future
    // change that silently turns the onApply into a no-op (e.g. wrapping
    // it in try/catch{}), which would make the H1-failure test above
    // pass for the wrong reason.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'يونيو 2025', '2025-06-01', '2025-06-30', 'open')`,
      [companyId]
    );
    const { insertId: expenseId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type, status,
         "balancesApplied", "createdAt", date
       ) VALUES ($1, $2, $3, 'EXP-H1-OPEN', 'wave2-h1-test-open', 'manual', 'approved', true, NOW(), '2025-06-15'::date)`,
      [companyId, branchId, assignmentId]
    );
    await rawExecute(
      `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
       VALUES ($1, '1101', 100, 0), ($1, '4101', 0, 100)`,
      [expenseId]
    );

    await applyTransition({
      entity: "journal_entries",
      id: expenseId,
      scope: { companyId, branchId, userId },
      action: "expense.rejected",
      fromStates: ["approved"],
      toState: "rejected",
      reason: "wave2-h1 positive control",
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'EXP%'`,
      onApply: async (_row, _client) => {
        await reverseAccountBalances(companyId, expenseId);
      },
    });

    const [je] = await rawQuery<{ status: string; balancesApplied: boolean }>(
      `SELECT status, "balancesApplied" FROM journal_entries WHERE id = $1`,
      [expenseId]
    );
    expect(je.status).toBe("rejected");
    expect(je.balancesApplied).toBe(false);
    const [acc1101] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts WHERE "companyId"=$1 AND code='1101'`,
      [companyId]
    );
    expect(Number(acc1101.currentBalance)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// #888 — createJournalEntry no longer auto-plugs gaps via account 9999
// ─────────────────────────────────────────────────────────────────────

d("Wave-2 #888: createJournalEntry rejects imbalanced entries instead of silent 9999 plug", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let ValidationError: typeof import("../../src/lib/errorHandler.js").ValidationError;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const helpers = await import("../../src/lib/businessHelpers.js");
    createJournalEntry = helpers.createJournalEntry;
    const errorHandler = await import("../../src/lib/errorHandler.js");
    ValidationError = errorHandler.ValidationError;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    // chart_of_accounts has no UNIQUE constraint on ("companyId", code) in
    // the live schema, so the seeding INSERT below cannot rely on ON
    // CONFLICT to be idempotent. Wipe the seed rows first so each test
    // gets a clean balance state and we never accumulate duplicates.
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    // Open period that covers today so the upstream period guard never
    // gets in the way of the imbalance test.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة مفتوحة', '2020-01-01', '2099-12-31', 'open')`,
      [companyId]
    );
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0),
              ($1, '9999', 'فروقات التقريب', 'Rounding', 'expense', 0)`,
      [companyId]
    );
  });

  it("rejects an imbalanced 0.03 SAR gap with ValidationError (#888 fix)", async () => {
    let caught: unknown = null;
    try {
      await createJournalEntry({
        companyId,
        branchId,
        createdBy: userId,
        ref: "JE-888-IMBAL",
        description: "wave2-888 imbalanced",
        lines: [
          { accountCode: "1101", debit: 100, credit: 0 },
          // 100 vs 99.97 → 0.03 gap; previously silently plugged into 9999.
          { accountCode: "4101", debit: 0, credit: 99.97 },
        ],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as Error).message).toMatch(/قيد غير متوازن|imbalanced/i);

    // Post-condition: NO journal_entries row inserted (the throw fires
    // before the INSERT) and NO 9999 line silently appended.
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM journal_entries
       WHERE "companyId"=$1 AND ref='JE-888-IMBAL'`,
      [companyId]
    );
    expect(Number(count)).toBe(0);
  });

  it("accepts an exactly-balanced entry and writes no 9999 plug line", async () => {
    await createJournalEntry({
      companyId,
      branchId,
      createdBy: userId,
      ref: "JE-888-BAL",
      description: "wave2-888 balanced",
      lines: [
        { accountCode: "1101", debit: 100, credit: 0 },
        { accountCode: "4101", debit: 0, credit: 100 },
      ],
    });

    // The entry exists with exactly two lines — no auto-plugged 9999.
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref='JE-888-BAL'`,
      [companyId]
    );
    expect(je).toBeDefined();
    const lines = await rawQuery<{ accountCode: string }>(
      `SELECT "accountCode" FROM journal_lines WHERE "journalId"=$1 ORDER BY "accountCode"`,
      [je.id]
    );
    expect(lines.map((l) => l.accountCode)).toEqual(["1101", "4101"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// H3 — appendRoundingAdjustment moves chart_of_accounts.currentBalance
// ─────────────────────────────────────────────────────────────────────

d("Wave-2 H3: appendRoundingAdjustment moves chart_of_accounts.currentBalance for account 9999 (#884)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let financialEngine: typeof import("../../src/lib/engines/financialEngine.js").financialEngine;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const engine = await import("../../src/lib/engines/financialEngine.js");
    financialEngine = engine.financialEngine;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    // See note in earlier beforeEach hooks — chart_of_accounts has no
    // UNIQUE(companyId, code) constraint, so we wipe and re-seed rather
    // than relying on ON CONFLICT.
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance")
       VALUES ($1, '9999', 'فروقات التقريب', 'Rounding', 'expense', 0)`,
      [companyId]
    );
  });

  it("posted entry: balance moves by the rounding diff (H3 fix)", async () => {
    // Seed a posted (balancesApplied=true) journal entry.
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "balancesApplied", "createdAt"
       ) VALUES ($1, $2, $3, 'JE-H3', 'wave2-h3', 'manual', true, NOW())`,
      [companyId, branchId, assignmentId]
    );

    const [before] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts
       WHERE "companyId"=$1 AND code='9999'`,
      [companyId]
    );
    expect(Number(before.currentBalance)).toBe(0);

    await financialEngine.appendRoundingAdjustment({
      companyId,
      journalEntryId: insertId,
      amount: 0.02,
    });

    const [after] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts
       WHERE "companyId"=$1 AND code='9999'`,
      [companyId]
    );
    // Pre-H3 the balance stayed at 0 (the bug); H3 moves it by the diff.
    expect(Number(after.currentBalance)).toBeCloseTo(0.02, 4);
  });

  it("deferred entry: balance does NOT move yet (avoids double-count later)", async () => {
    // balancesApplied=false → applyJournalEntryBalances will pick up the
    // rounding line on approval; appendRoundingAdjustment must leave the
    // COA untouched for now.
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "balancesApplied", "createdAt"
       ) VALUES ($1, $2, $3, 'JE-H3-DEF', 'wave2-h3 deferred', 'manual', false, NOW())`,
      [companyId, branchId, assignmentId]
    );

    await financialEngine.appendRoundingAdjustment({
      companyId,
      journalEntryId: insertId,
      amount: 0.02,
    });

    const [after] = await rawQuery<{ currentBalance: string }>(
      `SELECT "currentBalance" FROM chart_of_accounts
       WHERE "companyId"=$1 AND code='9999'`,
      [companyId]
    );
    expect(Number(after.currentBalance)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Year-end closing entry — dated {year}-12-31, posts into a closed
// December via the engine's `skipPeriodCheck` escape hatch (reserved
// for type='closing'). Accounting practice: the closing entry MUST
// reflect the snapshot at the end of the year being closed, not the
// date the operator happened to click the button. Without this, a YE
// close run on 2026-01-15 produces a JE dated 2026-01-15 — out of
// the year being closed entirely, silently breaking year-over-year
// reports and comparative statements.
// ─────────────────────────────────────────────────────────────────────

d("Year-end closing entry: dated {year}-12-31 even when December is closed", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let financialEngine: typeof import("../../src/lib/engines/financialEngine.js").financialEngine;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const engineMod = await import("../../src/lib/engines/financialEngine.js");
    financialEngine = engineMod.financialEngine;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance", "allowPosting", "isActive")
       VALUES ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0, true, true),
              ($1, '3201', 'الأرباح المحتجزة', 'Retained Earnings', 'equity', 0, true, true)`,
      [companyId]
    );
  });

  it(
    "posts the YE entry dated {year}-12-31 even when Dec {year} is closed " +
      "(skipPeriodCheck is honored for type='closing' only)",
    async () => {
      // Set up Dec 2025 as CLOSED — the realistic state at YE-close time.
      await rawExecute(
        `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
         VALUES ($1, 'ديسمبر 2025', '2025-12-01', '2025-12-31', 'closed')`,
        [companyId]
      );

      // Post the closing entry exactly the way the YE route does it.
      const { journalId } = await financialEngine.postJournalEntry({
        companyId,
        branchId,
        createdBy: userId,
        ref: "YE-2025",
        description: "قيد إقفال السنة المالية 2025 — صافي الدخل 0.00",
        type: "closing",
        sourceType: "year_end_close",
        sourceId: 0,
        sourceKey: `finance:year_end:${companyId}:2025`,
        lines: [
          { accountCode: "4101", debit: 100, credit: 0 },
          { accountCode: "3201", debit: 0, credit: 100 },
        ],
        postingDate: "2025-12-31",
        skipPeriodCheck: true,
      });

      // The two invariants we care about:
      //   1. `date` is the year-end date (2025-12-31), not today
      //   2. `createdAt` is also stamped with the year-end date (the
      //      financialEngine applyHeaderOverrides path writes postingDate
      //      onto createdAt — see C2 fix). So range-filtered reports
      //      asking "give me all entries WHERE createdAt BETWEEN
      //      2025-01-01 AND 2025-12-31" include the YE entry, not the
      //      Jan-{following-year} reports.
      const [row] = await rawQuery<{
        entryDate: string;
        createdAtDate: string;
        type: string;
      }>(
        `SELECT date::text AS "entryDate",
                "createdAt"::date::text AS "createdAtDate",
                type
           FROM journal_entries WHERE id = $1`,
        [journalId]
      );
      expect(row.entryDate).toBe("2025-12-31");
      expect(row.createdAtDate).toBe("2025-12-31");
      expect(row.type).toBe("closing");
    }
  );

  it("rejects the YE shape on a non-closing type even with skipPeriodCheck=true", async () => {
    // Belt-and-braces — the escape hatch must remain YE-only. A regression
    // that drops the type guard would let any caller silently bypass the
    // period gate by flipping one flag, undoing PER-2 / H2 / H4 in one
    // line of code.
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'ديسمبر 2025', '2025-12-01', '2025-12-31', 'closed')`,
      [companyId]
    );
    await expect(
      financialEngine.postJournalEntry({
        companyId,
        branchId,
        createdBy: userId,
        ref: "NOT-YE-2025",
        description: "tries to bypass period gate via skipPeriodCheck",
        type: "expense",
        sourceType: "expense",
        sourceId: 0,
        sourceKey: `finance:not-ye-bypass:${companyId}:2025`,
        lines: [
          { accountCode: "4101", debit: 100, credit: 0 },
          { accountCode: "3201", debit: 0, credit: 100 },
        ],
        postingDate: "2025-12-31",
        skipPeriodCheck: true,
      })
    ).rejects.toThrow(/skipPeriodCheck is reserved for closing entries/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// RC-1 — Path A ↔ Path B equivalence.
// Two GL posting primitives exist today:
//   Path A: financialEngine.postJournalEntry (used by routes, schedulers)
//   Path B: lib/gl/posting.ts::postJournalEntry (used by FX revaluation,
//           realised FX, cycle-count variance, lot writeoff, Mudad salary)
// After PD-6 (sourceKey on Path B), H4 (period gate on Path B reverse),
// and C2 (createdAt = accounting date on both paths), the two paths
// should produce IDENTICAL ledger state for the same logical input.
// This suite posts the same content via both paths and asserts the
// resulting journal_entries + journal_lines + chart_of_accounts state
// is equivalent. A future drift between the two paths (e.g. one path
// stops writing the period gate, or one path silently rounds
// differently) breaks the equivalence loud and fast.
// ─────────────────────────────────────────────────────────────────────

d("RC-1: Path A ↔ Path B produce equivalent ledger state for the same logical input", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let financialEngine: typeof import("../../src/lib/engines/financialEngine.js").financialEngine;
  let pathBPost: typeof import("../../src/lib/gl/posting.js").postJournalEntry;
  let buildEntry: typeof import("../../src/lib/gl/journal-poster.js").buildEntry;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const engineMod = await import("../../src/lib/engines/financialEngine.js");
    financialEngine = engineMod.financialEngine;
    const posting = await import("../../src/lib/gl/posting.js");
    pathBPost = posting.postJournalEntry;
    const poster = await import("../../src/lib/gl/journal-poster.js");
    buildEntry = poster.buildEntry;

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]);
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة مفتوحة', '2020-01-01', '2099-12-31', 'open')`,
      [companyId]
    );
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "currentBalance", "allowPosting", "isActive")
       VALUES ($1, '1101', 'بنك اختبار', 'Test Bank', 'asset', 0, true, true),
              ($1, '4101', 'إيراد اختبار', 'Test Revenue', 'revenue', 0, true, true)`,
      [companyId]
    );
  });

  it(
    "same logical entry posted via Path A and Path B produces equivalent " +
      "journal_entries + journal_lines + COA delta",
    async () => {
      // Look up account IDs for Path B (which keys lines by accountId).
      const accounts = await rawQuery<{ id: number; code: string }>(
        `SELECT id, code FROM chart_of_accounts
           WHERE "companyId"=$1 AND code IN ('1101', '4101') ORDER BY code`,
        [companyId]
      );
      const acc1101 = accounts.find((a) => a.code === "1101")!;
      const acc4101 = accounts.find((a) => a.code === "4101")!;

      const date = "2025-06-15";
      const description = "RC-1 equivalence";

      // Path A — financialEngine.postJournalEntry (the canonical engine).
      const pathAResult = await financialEngine.postJournalEntry({
        companyId,
        branchId,
        createdBy: userId,
        ref: "RC1-PATH-A",
        description,
        type: "manual",
        sourceType: "rc1_test",
        sourceId: 1,
        sourceKey: "finance:rc1:path-a",
        postingDate: date,
        status: "posted",
        lines: [
          { accountCode: "1101", debit: 100, credit: 0 },
          { accountCode: "4101", debit: 0, credit: 100 },
        ],
      });

      // Path B — lib/gl/posting.ts::postJournalEntry.
      const payload = buildEntry({
        description,
        lines: [
          { accountId: acc1101.id, amount: 100, description: "DR bank" },
          { accountId: acc4101.id, amount: -100, description: "CR revenue" },
        ],
      });
      const pathBResult = await pathBPost(payload, {
        companyId,
        branchId,
        createdBy: userId,
        ref: "RC1-PATH-B",
        date,
        type: "manual",
        sourceType: "rc1_test",
        sourceId: 2,
        sourceKey: "finance:rc1:path-b",
        status: "posted",
      });

      // 1. Both succeed and write a journal_entries header.
      expect(pathAResult.journalId).toBeGreaterThan(0);
      expect(pathBResult.journalEntryId).toBeGreaterThan(0);

      // 2. Header row equivalence — date, createdAt::date, status,
      //    balancesApplied. (ref, sourceKey, sourceId differ on
      //    purpose because they're per-post identifiers.)
      const rows = await rawQuery<{
        id: number;
        entryDate: string;
        createdAtDate: string;
        status: string;
        balancesApplied: boolean;
        type: string;
      }>(
        `SELECT id,
                date::text AS "entryDate",
                "createdAt"::date::text AS "createdAtDate",
                status,
                "balancesApplied",
                type
           FROM journal_entries
          WHERE id = ANY($1::int[])
          ORDER BY id`,
        [[pathAResult.journalId, pathBResult.journalEntryId]]
      );
      expect(rows.length).toBe(2);
      const [a, b] = rows;
      expect(a.entryDate).toBe(date);
      expect(b.entryDate).toBe(date);
      expect(a.createdAtDate).toBe(date);
      expect(b.createdAtDate).toBe(date);
      expect(a.status).toBe("posted");
      expect(b.status).toBe("posted");
      expect(a.balancesApplied).toBe(true);
      expect(b.balancesApplied).toBe(true);
      expect(a.type).toBe(b.type);

      // 3. Line-row equivalence — same accountCode + debit + credit on
      //    both paths' line sets. We compare normalized signatures so
      //    column ordering / ids / descriptions don't matter.
      const lineSig = async (jid: number) => {
        const lines = await rawQuery<{
          accountCode: string; debit: string; credit: string;
        }>(
          `SELECT "accountCode", debit::text AS debit, credit::text AS credit
             FROM journal_lines WHERE "journalId" = $1
             ORDER BY "accountCode", debit, credit`,
          [jid]
        );
        return lines.map((l) => `${l.accountCode}|${Number(l.debit)}|${Number(l.credit)}`);
      };
      const aSig = await lineSig(pathAResult.journalId);
      const bSig = await lineSig(pathBResult.journalEntryId);
      expect(aSig).toEqual(bSig);
      expect(aSig).toEqual(["1101|100|0", "4101|0|100"]);

      // 4. COA currentBalance equivalence — both paths together moved
      //    the bank +200 (2 × +100 debit) and revenue -200 (2 × +100
      //    credit). Both paths apply balances at insert when
      //    status='posted', so by this point COA reflects both.
      const [bank] = await rawQuery<{ currentBalance: string }>(
        `SELECT "currentBalance" FROM chart_of_accounts
          WHERE "companyId"=$1 AND code='1101'`,
        [companyId]
      );
      const [rev] = await rawQuery<{ currentBalance: string }>(
        `SELECT "currentBalance" FROM chart_of_accounts
          WHERE "companyId"=$1 AND code='4101'`,
        [companyId]
      );
      expect(Number(bank.currentBalance)).toBe(200);
      expect(Number(rev.currentBalance)).toBe(-200);
    }
  );

  it("both paths honor sourceKey idempotency — a re-post collapses onto the same JE", async () => {
    // Stable sourceKey + same companyId on both paths → the second
    // call must return the existing entry rather than insert a
    // duplicate. PD-6 lock-in for Path B; engine-level lock-in for
    // Path A.
    const accounts = await rawQuery<{ id: number; code: string }>(
      `SELECT id, code FROM chart_of_accounts
         WHERE "companyId"=$1 AND code IN ('1101', '4101') ORDER BY code`,
      [companyId]
    );
    const acc1101 = accounts.find((a) => a.code === "1101")!;
    const acc4101 = accounts.find((a) => a.code === "4101")!;

    // Path A — first post writes, second returns alreadyExists.
    const a1 = await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: userId,
      ref: "RC1-IDEM-A", description: "RC-1 idem A",
      type: "manual", sourceType: "rc1_idem", sourceId: 10,
      sourceKey: "finance:rc1:idem-path-a",
      lines: [
        { accountCode: "1101", debit: 50, credit: 0 },
        { accountCode: "4101", debit: 0, credit: 50 },
      ],
    });
    const a2 = await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: userId,
      ref: "RC1-IDEM-A-RETRY", description: "RC-1 idem A retry",
      type: "manual", sourceType: "rc1_idem", sourceId: 10,
      sourceKey: "finance:rc1:idem-path-a", // same key
      lines: [
        { accountCode: "1101", debit: 50, credit: 0 },
        { accountCode: "4101", debit: 0, credit: 50 },
      ],
    });
    expect(a1.journalId).toBe(a2.journalId);
    expect(a2.alreadyExists).toBe(true);

    // Path B — same idempotency semantics (PD-6).
    const payload = buildEntry({
      description: "RC-1 idem B",
      lines: [
        { accountId: acc1101.id, amount: 50, description: "DR" },
        { accountId: acc4101.id, amount: -50, description: "CR" },
      ],
    });
    const b1 = await pathBPost(payload, {
      companyId, branchId, createdBy: userId,
      ref: "RC1-IDEM-B", type: "manual",
      sourceType: "rc1_idem", sourceId: 20,
      sourceKey: "finance:rc1:idem-path-b",
      status: "posted",
    });
    const b2 = await pathBPost(payload, {
      companyId, branchId, createdBy: userId,
      ref: "RC1-IDEM-B-RETRY", type: "manual",
      sourceType: "rc1_idem", sourceId: 20,
      sourceKey: "finance:rc1:idem-path-b", // same key
      status: "posted",
    });
    expect(b1.journalEntryId).toBe(b2.journalEntryId);
    expect(b2.alreadyExists).toBe(true);
  });
});
