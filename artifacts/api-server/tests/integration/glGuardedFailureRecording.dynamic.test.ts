// Live proof that a GUARDED GL posting failure is NOT silently swallowed:
// createGuardedJournalEntry records the failure into financial_posting_failures
// (and rethrows) so an admin / the postingFailureRetry cron can drain it.
//
// This is the evidence behind retiring the gl-swallow allowlist: every flagged
// site posts through a guardTable path, so the swallowing catch loses nothing —
// the failure is queued. Here we force a guarded post to fail (non-existent
// account code) and assert a financial_posting_failures row appears.
//
// Wrapped in runIf(dbReady) like every other *.dynamic.test — skips cleanly
// without a test Postgres.
import { describe, it, expect, beforeAll } from "vitest";

const dbReady =
  !!process.env.DATABASE_URL && /:54329\//.test(process.env.DATABASE_URL);
const d = dbReady ? describe : describe.skip;

d("gl guarded-failure recording (financial_posting_failures)", () => {
  let createGuardedJournalEntry: typeof import("../../src/lib/businessHelpers.js").createGuardedJournalEntry;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let companyId: number;
  let branchId: number;
  let userId: number;

  beforeAll(async () => {
    ({ createGuardedJournalEntry } = await import("../../src/lib/businessHelpers.js"));
    ({ rawQuery } = await import("../../src/lib/rawdb.js"));
    const [co] = await rawQuery<{ id: number }>(`SELECT id FROM companies ORDER BY id LIMIT 1`);
    companyId = co!.id;
    const [br] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId" = $1 ORDER BY id LIMIT 1`, [companyId]);
    branchId = br?.id ?? 0;
    const [u] = await rawQuery<{ id: number }>(
      `SELECT id FROM users ORDER BY id LIMIT 1`);
    userId = u!.id;
  });

  it("records a guarded GL posting failure into financial_posting_failures and rethrows", async () => {
    // A unique source id so we can find exactly this failure row.
    const sourceId = 900000000 + Math.floor(Math.random() * 90000000);

    let threw = false;
    try {
      await createGuardedJournalEntry(
        {
          companyId,
          branchId,
          createdBy: userId,
          ref: `GL-SWALLOW-PROOF-${sourceId}`,
          description: "deliberate failure — non-existent account",
          type: "general",
          sourceType: "gl_swallow_proof",
          sourceId,
          sourceKey: `gl_swallow_proof:${sourceId}`,
          // 9999999 is not in any company's chart_of_accounts → createJournalEntry throws.
          lines: [
            { accountCode: "9999999", debit: 100, credit: 0 },
            { accountCode: "9999999", debit: 0, credit: 100 },
          ],
        },
        { table: "gl_swallow_proof", id: sourceId },
      );
    } catch {
      threw = true; // guarded post rethrows after recording — the caller's catch is what "swallows"
    }

    expect(threw).toBe(true);

    // The decisive assertion: the failure is queued, not lost.
    const rows = await rawQuery<{ id: number; error: string }>(
      `SELECT id, error FROM financial_posting_failures
        WHERE "companyId" = $1 AND "sourceType" = 'gl_swallow_proof' AND "sourceId" = $2`,
      [companyId, sourceId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // cleanup the synthetic row
    await rawQuery(
      `DELETE FROM financial_posting_failures
        WHERE "companyId" = $1 AND "sourceType" = 'gl_swallow_proof' AND "sourceId" = $2`,
      [companyId, sourceId],
    );
  });
});
