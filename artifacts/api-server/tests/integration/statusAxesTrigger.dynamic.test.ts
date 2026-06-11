// #2098 / FIN-SUB-03 — every journal_entries write is born (and stays) with the
// three status axes correctly derived, via the DB trigger (migration 311), on
// the live head-of-main DB. The owner's decisions: postingStatus from the
// ACTUAL posting (balancesApplied), NOT the loose `status` (a directly-posted
// entry carries status='draft' + balancesApplied=true); and a central trigger
// fills the triad for every writer. Asserts: a real post is documentStatus
// reflecting the legacy lifecycle, postingStatus='posted' even when status is
// 'draft'; status transitions keep the axes in sync; a balance reversal flips
// postingStatus; and the canBePaid invariant (no paid draft). Activates only on
// the test cluster.
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
const CASH = "1111";
const SUBCASH = "1112";
const PFX = "test-axes-";

d("FIN-SUB-03 — status axes derived on every write (live DB trigger)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let applyJournalEntryBalances: typeof import("../../src/lib/businessHelpers.js").applyJournalEntryBalances;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute; withTransaction = rawdb.withTransaction;
    const h = await import("../../src/lib/businessHelpers.js");
    createJournalEntry = h.createJournalEntry;
    applyJournalEntryBalances = h.applyJournalEntryBalances;
    reverseAccountBalances = h.reverseAccountBalances;
  });

  const balanced = [
    { accountCode: CASH, debit: 10, credit: 0 },
    { accountCode: SUBCASH, debit: 0, credit: 10 },
  ];
  const base = (ref: string) => ({
    companyId: COMPANY, branchId: BRANCH, createdBy: BY,
    ref: PFX + ref, description: "axes " + ref, sourceType: "test", sourceKey: PFX + ref, lines: balanced,
  });

  async function axes(ref: string) {
    const [r] = await rawQuery<{ status: string; balancesApplied: boolean; isPaid: boolean; documentStatus: string; paymentStatus: string; postingStatus: string }>(
      `SELECT status, "balancesApplied", "isPaid", "documentStatus", "paymentStatus", "postingStatus"
         FROM journal_entries WHERE "companyId"=$1 AND ref=$2`, [COMPANY, PFX + ref]);
    return r;
  }
  async function cleanup() {
    await rawExecute(`DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2)`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
  }
  afterEach(cleanup); afterAll(cleanup);

  it("a directly-posted entry: status='draft' but balancesApplied=true → postingStatus='posted' (NOT unposted)", async () => {
    await createJournalEntry(base("direct"));
    const a = await axes("direct");
    expect(a.status).toBe("draft");          // legacy status untouched
    expect(a.balancesApplied).toBe(true);    // it IS posted
    expect(a.postingStatus).toBe("posted");  // truthful — the whole point of the owner's decision
    expect(a.documentStatus).toBe("draft");  // approval lifecycle from status
    expect(a.paymentStatus).toBe("unpaid");  // draft can never be paid (canBePaid)
  });

  it("axes stay derived through a status transition draft→pending_approval→approved (UPDATE)", async () => {
    await createJournalEntry(base("transition"));
    await rawExecute(`UPDATE journal_entries SET status='pending_approval' WHERE "companyId"=$1 AND ref=$2`, [COMPANY, PFX + "transition"]);
    let a = await axes("transition");
    expect(a.documentStatus).toBe("submitted");
    expect(a.postingStatus).toBe("posted"); // balances still applied

    await rawExecute(`UPDATE journal_entries SET status='approved' WHERE "companyId"=$1 AND ref=$2`, [COMPANY, PFX + "transition"]);
    a = await axes("transition");
    expect(a.documentStatus).toBe("approved");
    expect(a.postingStatus).toBe("posted");
  });

  it("reversing the balances flips postingStatus to reversed when the entry is cancelled", async () => {
    const id = await createJournalEntry(base("reverse"));
    // apply balances explicitly (already applied on create), then cancel + reverse
    await rawExecute(`UPDATE journal_entries SET status='posted' WHERE id=$1`, [id]);
    expect((await axes("reverse")).postingStatus).toBe("posted");

    // the real reversal flow: status→cancelled (+ balance rewind)
    await reverseAccountBalances(COMPANY, id);
    await rawExecute(`UPDATE journal_entries SET status='cancelled' WHERE id=$1`, [id]);
    const a = await axes("reverse");
    expect(a.balancesApplied).toBe(false);
    expect(a.postingStatus).toBe("reversed");
    expect(a.documentStatus).toBe("cancelled");
  });

  it("a deferred (unapplied) entry is postingStatus='unposted'", async () => {
    await createJournalEntry({ ...base("deferred"), deferBalances: true } as any);
    const a = await axes("deferred");
    expect(a.balancesApplied).toBe(false);
    expect(a.postingStatus).toBe("unposted");
  });

  it("canBePaid invariant: isPaid=true on an approved entry → paid; on a draft → still unpaid", async () => {
    // approved + paid
    const id1 = await createJournalEntry(base("paid-approved"));
    await rawExecute(`UPDATE journal_entries SET status='approved', "isPaid"=true WHERE id=$1`, [id1]);
    expect((await axes("paid-approved")).paymentStatus).toBe("paid");

    // draft + isPaid=true → must stay unpaid (no paid draft)
    const id2 = await createJournalEntry(base("paid-draft"));
    await rawExecute(`UPDATE journal_entries SET "isPaid"=true WHERE id=$1`, [id2]); // status stays 'draft'
    const a2 = await axes("paid-draft");
    expect(a2.documentStatus).toBe("draft");
    expect(a2.paymentStatus).toBe("unpaid");
  });

  it("every derived value satisfies the migration-287 CHECK domains", async () => {
    await createJournalEntry(base("domains"));
    await rawExecute(`UPDATE journal_entries SET status='approved', "isPaid"=true WHERE "companyId"=$1 AND ref=$2`, [COMPANY, PFX + "domains"]);
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND (
         "documentStatus" NOT IN ('draft','submitted','approved','rejected','cancelled') OR
         "paymentStatus"  NOT IN ('unpaid','partially_paid','paid') OR
         "postingStatus"  NOT IN ('unposted','posted','reversed'))`, [COMPANY, PFX + "domains"]);
    expect(n).toBe(0);
  });
});
