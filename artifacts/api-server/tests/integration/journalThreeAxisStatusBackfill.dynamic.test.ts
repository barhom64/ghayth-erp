// #1945 — integration proof for migration 287 (three-axis status backfill).
//
// Runs against the live head-of-main DB: inserts journal_entries rows across
// every legacy `status` × `isPaid`, re-applies the migration's backfill, and
// asserts the three new columns (documentStatus / paymentStatus / postingStatus)
// are populated correctly — byte-for-byte matching the FE mapJournalStatus for
// document+posting, and the canBePaid invariant for payment (a draft/pending is
// never "paid"). Activates only when DATABASE_URL points at the test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mapJournalStatus } from "../../../ghayth-erp/src/lib/finance/status-model.ts";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Base ref — each inserted row gets a UNIQUE suffix: the regenerated schema
// dump (HR #2045) restored uniq_journal_entries_ref (companyId, ref) from
// migration 217, which the previous drifted dump had lost — same-ref bulk
// inserts now correctly violate it.
const REF = "test-287-backfill";
// Every legacy status the constraint allows, plus `reversed` (defensive).
const STATUSES = [
  "draft", "pending_approval", "approved", "posted",
  "rejected", "returned", "cancelled",
];

d("migration 287 — three-axis status backfill (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let companyId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const [c] = await rawQuery<{ id: number }>("SELECT id FROM companies ORDER BY id LIMIT 1");
    companyId = c.id;

    // Insert one row per (status × isPaid), with the three axes left NULL so
    // the backfill has to populate them.
    await rawExecute(`DELETE FROM journal_entries WHERE ref LIKE $1`, [REF + "%"]);
    for (const status of STATUSES) {
      for (const isPaid of [true, false]) {
        await rawExecute(
          `INSERT INTO journal_entries ("companyId", status, "isPaid", ref,
             "documentStatus", "paymentStatus", "postingStatus")
           VALUES ($1, $2, $3, $4, NULL, NULL, NULL)`,
          [companyId, status, isPaid, `${REF}-${status}-${isPaid ? "p" : "u"}`],
        );
      }
    }

    // Re-run the migration's backfill (the columns + constraints already exist
    // from migration 287). This UPDATE is byte-for-byte the migration's, scoped
    // to the rows just inserted so it never touches other data.
    await rawExecute(
      `UPDATE journal_entries SET
         "documentStatus" = CASE status
            WHEN 'posted' THEN 'approved' WHEN 'approved' THEN 'approved' WHEN 'reversed' THEN 'approved'
            WHEN 'pending_approval' THEN 'submitted' WHEN 'returned' THEN 'submitted'
            WHEN 'rejected' THEN 'rejected' WHEN 'cancelled' THEN 'cancelled' ELSE 'draft' END,
         "postingStatus" = CASE status
            WHEN 'posted' THEN 'posted' WHEN 'approved' THEN 'posted'
            WHEN 'cancelled' THEN 'reversed' WHEN 'reversed' THEN 'reversed' ELSE 'unposted' END,
         "paymentStatus" = CASE
            WHEN "isPaid" IS TRUE AND status IN ('posted','approved','reversed') THEN 'paid' ELSE 'unpaid' END
       WHERE ref LIKE $1 AND "documentStatus" IS NULL`,
      [REF + "%"],
    );
  });

  afterAll(async () => {
    if (rawExecute) await rawExecute(`DELETE FROM journal_entries WHERE ref LIKE $1`, [REF + "%"]);
  });

  it("populates documentStatus + postingStatus exactly like the FE mapJournalStatus", async () => {
    const rows = await rawQuery<{
      status: string; isPaid: boolean;
      documentStatus: string; paymentStatus: string; postingStatus: string;
    }>(
      `SELECT status, "isPaid", "documentStatus", "paymentStatus", "postingStatus"
         FROM journal_entries WHERE ref LIKE $1`,
      [REF + "%"],
    );
    expect(rows.length).toBe(STATUSES.length * 2);
    for (const r of rows) {
      const fe = mapJournalStatus(r.status);
      expect(r.documentStatus).toBe(fe.documentStatus);
      expect(r.postingStatus).toBe(fe.postingStatus);
    }
  });

  it("paymentStatus honours canBePaid — paid only when isPaid AND approved", async () => {
    const rows = await rawQuery<{ status: string; isPaid: boolean; paymentStatus: string }>(
      `SELECT status, "isPaid", "paymentStatus" FROM journal_entries WHERE ref LIKE $1`,
      [REF + "%"],
    );
    for (const r of rows) {
      const approved = mapJournalStatus(r.status).documentStatus === "approved";
      const expected = r.isPaid && approved ? "paid" : "unpaid";
      expect(r.paymentStatus).toBe(expected);
    }
  });

  it("a draft is never paid and never posted; an approved+paid row is paid+posted", async () => {
    const draftPaid = await rawQuery<{ documentStatus: string; paymentStatus: string; postingStatus: string }>(
      `SELECT "documentStatus","paymentStatus","postingStatus" FROM journal_entries
         WHERE ref LIKE $1 AND status='draft' AND "isPaid"=true LIMIT 1`, [REF + "%"]);
    expect(draftPaid[0]).toMatchObject({ documentStatus: "draft", paymentStatus: "unpaid", postingStatus: "unposted" });

    const postedPaid = await rawQuery<{ documentStatus: string; paymentStatus: string; postingStatus: string }>(
      `SELECT "documentStatus","paymentStatus","postingStatus" FROM journal_entries
         WHERE ref LIKE $1 AND status='posted' AND "isPaid"=true LIMIT 1`, [REF + "%"]);
    expect(postedPaid[0]).toMatchObject({ documentStatus: "approved", paymentStatus: "paid", postingStatus: "posted" });
  });

  it("every backfilled value satisfies the new CHECK constraints", async () => {
    // If any value were out of the allowed set the migration's CHECK would have
    // rejected the UPDATE; assert the domains explicitly too.
    const bad = await rawQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM journal_entries WHERE ref LIKE $1 AND (
         "documentStatus" NOT IN ('draft','submitted','approved','rejected','cancelled') OR
         "paymentStatus"  NOT IN ('unpaid','partially_paid','paid') OR
         "postingStatus"  NOT IN ('unposted','posted','reversed'))`, [REF + "%"]);
    expect(bad[0].n).toBe(0);
  });
});
