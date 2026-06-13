// #2118 follow-up (first executive PR after FINANCE-CORRECTION-PHASE-2) —
// custody-advances report alignment. The #2176 census proved this was the ONLY
// GL report lacking a posting filter: it read CUSTODY%/ADV% journal entries
// with NO balancesApplied gate and returned raw je.status, so UNPOSTED (draft)
// entries were counted in the custody/advance totals. This test drives the REAL
// report over HTTP on the live DB and proves the fix: unposted entries are
// EXCLUDED from the totals, posted entries are INCLUDED, the truthful axes are
// surfaced (postingStatus='posted'), the legacy status is kept, and the
// response shape is unchanged. No posting/journal/balance logic is touched —
// only the report's read. Test cluster only.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

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
const PFX = "test-cadv-"; // marker embedded in description for cleanup
const CUSTODY = "CUSTODY-test-cadv-"; // report filters ref LIKE 'CUSTODY%'
const ADV = "ADV-test-cadv-";         // report filters ref LIKE 'ADV%'

d("custody-advances report — posting-gated totals + truthful axes (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;

  let token: string;
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };
  const ids = { custodyPosted: 0, custodyUnposted: 0, advPosted: 0, advUnposted: 0 };

  // Insert a journal entry with an explicit balancesApplied, plus a single
  // line on the given control account. The migration-311 trigger derives the
  // axes on insert (status='draft' + balancesApplied=true → postingStatus
  // 'posted'; balancesApplied=false → 'unposted').
  async function makeEntry(ref: string, accountCode: string, amount: number, balancesApplied: boolean) {
    const [je] = await rawQuery<{ id: number }>(
      `INSERT INTO journal_entries ("companyId","branchId",ref,description,status,"balancesApplied","isPaid","createdBy")
       VALUES ($1,$2,$3,$4,'draft',$5,false,$6) RETURNING id`,
      [COMPANY, BRANCH, ref + Math.random().toString(36).slice(2, 7), PFX + "entry", balancesApplied, created.assignmentId],
    );
    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,$3,0,$4)`,
      [je.id, accountCode, amount, PFX + "line"],
    );
    return je.id;
  }

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
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

    ids.custodyPosted   = await makeEntry(CUSTODY, "1400", 100, true);
    ids.custodyUnposted = await makeEntry(CUSTODY, "1400", 50, false);
    ids.advPosted       = await makeEntry(ADV, "1410", 70, true);
    ids.advUnposted     = await makeEntry(ADV, "1410", 30, false);
  }, 60_000);

  afterAll(cleanup);

  async function cleanup() {
    if (!rawExecute) return;
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "companyId"=$1 AND description=$2)`,
      [COMPANY, PFX + "entry"]);
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1 AND description=$2`, [COMPANY, PFX + "entry"]);
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }

  it("UNPOSTED entries are excluded; POSTED are included; totals exclude drafts", async () => {
    const res = await request(app)
      .get("/api/finance/reports/custody-advances")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const custodies: any[] = res.body?.custodies ?? [];
    const advances: any[] = res.body?.advances ?? [];
    const custodyIds = custodies.map((r) => r.id);
    const advanceIds = advances.map((r) => r.id);

    // posted present, unposted absent — the core fix
    expect(custodyIds).toContain(ids.custodyPosted);
    expect(custodyIds, "an UNPOSTED custody must NOT enter the report").not.toContain(ids.custodyUnposted);
    expect(advanceIds).toContain(ids.advPosted);
    expect(advanceIds, "an UNPOSTED advance must NOT enter the report").not.toContain(ids.advUnposted);

    // strong invariant independent of seed data: EVERY returned row is posted
    for (const r of custodies) expect(r.postingStatus).toBe("posted");
    for (const r of advances) expect(r.postingStatus).toBe("posted");

    // the drafts' amounts (50 / 30) are not in the totals
    const mineCustody = custodies.find((r) => r.id === ids.custodyPosted);
    expect(Number(mineCustody.amount)).toBe(100);
    // totalCustodies must reflect only posted rows (our posted 100 is in; our draft 50 is not)
    const sumCustody = custodies.reduce((s, r) => s + Number(r.amount), 0);
    expect(res.body?.summary?.totalCustodies).toBeCloseTo(sumCustody, 2);
    expect(sumCustody).toBeGreaterThanOrEqual(100); // includes our posted
    // the draft amount is provably excluded: no returned row carries it as an unposted entry
    expect(custodies.some((r) => r.id === ids.custodyUnposted)).toBe(false);
  });

  it("the truthful axes are surfaced and the legacy status is kept (shape unchanged)", async () => {
    const res = await request(app)
      .get("/api/finance/reports/custody-advances")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const mine = (res.body?.custodies ?? []).find((r: any) => r.id === ids.custodyPosted);
    expect(mine).toBeTruthy();
    // axes surfaced
    expect(mine.postingStatus).toBe("posted");
    expect(mine).toHaveProperty("documentStatus");
    expect(mine).toHaveProperty("paymentStatus");
    // legacy status KEPT (not removed)
    expect(mine).toHaveProperty("status");
    expect(mine.status).toBe("draft"); // directly-posted entry keeps legacy status='draft'
    expect(mine.status).not.toBe(mine.postingStatus); // the misleading divergence, now surfaced truthfully

    // response shape preserved
    expect(res.body).toHaveProperty("custodies");
    expect(res.body).toHaveProperty("advances");
    expect(res.body?.summary).toMatchObject({
      totalCustodies: expect.any(Number),
      custodyCount: expect.any(Number),
      totalAdvances: expect.any(Number),
      advanceCount: expect.any(Number),
      total: expect.any(Number),
    });
  });
});
