// FIN-SUB-03b (#2118) slice 5 — the SALARY-ADVANCES LIST read surface
// (GET /api/finance/salary-advances) now returns the three status axes
// (documentStatus / paymentStatus / postingStatus) ALONGSIDE the legacy
// status (KEPT, nothing removed). Proves the new read is MORE CORRECT in the
// known-misleading case: a directly-posted advance carries status='draft'
// WITH balancesApplied=true, so the legacy `status` alone reads it as a
// draft/unposted entry, while `postingStatus` reads it truthfully as 'posted'
// (derived from balancesApplied by the migration-311 trigger). Driven over
// REAL HTTP on the live DB — only the read surface is exercised; no
// payment/posting/trigger behaviour changes. The advance DETAIL
// (/salary-advances/:id), opening balances, and the remaining reads are NOT
// in this slice; they stay on the legacy column and are documented as a
// follow-up list (see PR), each converted under independent permission.
// Test cluster only.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2; // Al-Diyaa — SOCPA chart (1111/1112 are real postable leaves)
const BRANCH = 2;
const PFX = "SALARY-ADV-test-fin03b5-"; // advances list filters ref LIKE 'SALARY-ADV%'
const CASH = "1111";
const SUBCASH = "1112";

d("FIN-SUB-03b slice 5 — salary-advances list surfaces the three status axes (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  let token: string;
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };
  const journalIds: number[] = [];

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const h = await import("../../src/lib/businessHelpers.js");
    createJournalEntry = h.createJournalEntry;
    reverseAccountBalances = h.reverseAccountBalances;
    const { signToken } = await import("../../src/lib/auth.js");

    await cleanup();

    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`, [PFX + "owner", PFX + "owner@test.local"]);
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`, [emp.id, COMPANY, BRANCH]);
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"]);
    created.userId = usr.id;
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "owner" });
  }, 60_000);

  afterAll(cleanup);

  async function cleanup() {
    if (!rawExecute) return;
    for (const id of journalIds) {
      try { await reverseAccountBalances(COMPANY, id); } catch { /* not applied — fine */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [id]);
    }
    const stale = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
    for (const r of stale) {
      try { await reverseAccountBalances(COMPANY, r.id); } catch { /* not applied */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [r.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [r.id]);
    }
    journalIds.length = 0;
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }

  async function makeAdvance(suffix: string) {
    const ref = PFX + suffix; // starts with SALARY-ADV → matches the filter
    const id = await createJournalEntry({
      companyId: COMPANY, branchId: BRANCH, createdBy: created.assignmentId,
      ref, description: "fin03b5 " + suffix, sourceType: "test", sourceKey: ref,
      operationType: "expense",
      lines: [
        { accountCode: CASH, debit: 10, credit: 0 },
        { accountCode: SUBCASH, debit: 0, credit: 10 },
      ],
    });
    journalIds.push(id);
    return id;
  }

  it("a directly-posted advance (status='draft', balancesApplied=true) reads postingStatus='posted' in the list — where the legacy status alone misleads", async () => {
    const id = await makeAdvance("direct");

    const [raw] = await rawQuery<{ status: string; balancesApplied: boolean; postingStatus: string }>(
      `SELECT status, "balancesApplied", "postingStatus" FROM journal_entries WHERE id=$1`, [id]);
    expect(raw.status).toBe("draft");
    expect(raw.balancesApplied).toBe(true);
    expect(raw.postingStatus).toBe("posted");

    const res = await request(app)
      .get("/api/finance/salary-advances")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const rows = res.body?.data ?? [];
    expect(Array.isArray(rows)).toBe(true);
    const mine = rows.find((r: any) => r.id === id);
    expect(mine, "the created advance must appear in the list read").toBeTruthy();

    // legacy column KEPT (not removed)
    expect(mine.status).toBe("draft");

    // the three axes are now SURFACED by this read (previously absent)
    expect(mine).toHaveProperty("documentStatus");
    expect(mine).toHaveProperty("paymentStatus");
    expect(mine).toHaveProperty("postingStatus");

    // the new read is MORE CORRECT: this advance IS posted
    expect(mine.postingStatus).toBe("posted");
    expect(mine.status).not.toBe(mine.postingStatus); // the divergence is the whole point
    expect(mine.documentStatus).toBe("draft");        // approval lifecycle from legacy status
    expect(mine.paymentStatus).toBe("unpaid");        // canBePaid: a draft is never paid
  });

  it("the legacy status stays present in the same read (additive, nothing removed)", async () => {
    const id = await makeAdvance("kept");
    const res = await request(app)
      .get("/api/finance/salary-advances")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const mine = (res.body?.data ?? []).find((r: any) => r.id === id);
    expect(mine).toBeTruthy();
    expect(mine).toHaveProperty("status");
    expect(mine).toHaveProperty("documentStatus");
    expect(mine).toHaveProperty("paymentStatus");
    expect(mine).toHaveProperty("postingStatus");
  });
});
