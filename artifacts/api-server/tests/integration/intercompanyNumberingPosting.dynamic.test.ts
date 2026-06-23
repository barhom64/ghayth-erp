// #1141 (intercompany side) — "each leg its own number". The two journal
// entries an intercompany transaction posts now each get their OWN
// center-issued number from their OWN company's `finance.intercompany`
// counter (replacing the old inline `IC-${idempotencyToken}` stamped on
// BOTH legs). This test drives the REAL HTTP route
//   POST /api/finance/intercompany
// on the live head-of-main DB and asserts, as a LEDGER guard:
//
//   • the FROM-leg JE lines (exact DR ar / CR revenue accounts + amounts,
//     ΣDR = ΣCR), with `ref` matching the FROM company's IC format
//     (^IC<fromCompany>-\d{4}-\d{5}$) and sourced from the FROM company's
//     numbering counter;
//   • the TO-leg JE lines (exact DR expense / CR ap accounts + amounts,
//     ΣDR = ΣCR), with `ref` matching the TO company's IC format
//     (^IC<toCompany>-\d{4}-\d{5}$) and sourced from the TO company's
//     numbering counter;
//   • the two refs are DIFFERENT (each leg its own number);
//   • each company has EXACTLY ONE numbering_assignment for the document
//     (both pointing at the parent intercompany_transactions row), proving
//     the per-leg issue + link-back fired once per company;
//   • a same-Idempotency-Key retry creates NO duplicate — one pair only
//     (the stable-sourceKey short-circuit).
//
// Companies (seeded test cluster): FROM = 2 (Al-Diyaa, rich SOCPA chart),
// TO = 1. Account codes are CONFIRMED postable leaves in each company:
//   FROM (co 2): DR ar 1160 (إيرادات مستحقة) / CR revenue 4111 (مبيعات نقدية)
//   TO   (co 1): DR expense 5110 (تكلفة البضاعة المباعة) / CR ap 2115 (GRNI)
// All four leaves carry NO enforced GL dimension (gl/ledgerTruth.ts). The
// route's schema-default codes 1200/2100/4000/5000 are non-postable parent
// accounts in this chart, so the test passes explicit leaves.
//
// Activates only when DATABASE_URL points at the seeded test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Cross-company: FROM (home / active) company and TO (destination) company.
const FROM_COMPANY = 2;
const TO_COMPANY = 1;
const FROM_BRANCH = 2;
const TO_BRANCH = 1; // company 1's main branch (employee_assignments.branchId is NOT NULL here)
const PFX = "test-icnum-";

// Confirmed postable leaves per company that carry NO enforced GL
// dimension (gl/ledgerTruth.ts enforces: 113[1-3]=client, 211[1-3]=vendor,
// 55xx/5710=vehicle, 56xx=property, 5130/4140=project — all avoided here):
const AR_CODE = "1160";       // FROM co 2 — DR ar (إيرادات مستحقة, asset, no dimension)
const REVENUE_CODE = "4111";  // FROM co 2 — CR revenue (مبيعات نقدية, no dimension)
const EXPENSE_CODE = "5110";  // TO co 1 — DR expense (تكلفة البضاعة المباعة, no dimension)
const AP_CODE = "2115";       // TO co 1 — CR ap (GRNI 2115 — outside 211[1-3], no dimension)

// Each company's IC scheme uses a per-company prefix 'IC'+companyId so the
// two legs' rendered numbers are deterministically DIFFERENT (the owner's
// "two numbers differ" rule) while each stays sourced from its OWN
// company's counter. See migration 414 design notes.
const FROM_IC_RE = new RegExp(`^IC${FROM_COMPANY}-\\d{4}-\\d{5}$`); // co 2 → IC2-YYYY-NNNNN
const TO_IC_RE = new RegExp(`^IC${TO_COMPANY}-\\d{4}-\\d{5}$`);     // co 1 → IC1-YYYY-NNNNN
const seqOf = (ref: string) => Number(ref.split("-")[2]);          // IC2-2026-00005 → 5

d("FIN #1141 — intercompany 'each leg its own number' (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  let token: string;
  const created = { employeeId: 0, fromAsgId: 0, toAsgId: 0, userId: 0 };

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
    const { signToken } = await import("../../src/lib/auth.js");

    await cleanup();

    // One person, owner assignments in BOTH companies so allowedCompanies
    // includes the destination company (authMiddleware expands owner reach
    // to every company the person owns). Active assignment is the FROM one.
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`,
      [PFX + "owner", PFX + "owner@test.local"]);
    created.employeeId = emp.id;
    const [fromAsg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`,
      [emp.id, FROM_COMPANY, FROM_BRANCH]);
    created.fromAsgId = fromAsg.id;
    const [toAsg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',FALSE,'active') RETURNING id`,
      [emp.id, TO_COMPANY, TO_BRANCH]);
    created.toAsgId = toAsg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"]);
    created.userId = usr.id;
    // Active assignment = the FROM company one.
    token = signToken({ userId: usr.id, assignmentId: fromAsg.id, role: "owner" });

    // Sanity: the four account leaves we drive are postable in their company.
    const checks: Array<[number, string]> = [
      [FROM_COMPANY, AR_CODE], [FROM_COMPANY, REVENUE_CODE],
      [TO_COMPANY, EXPENSE_CODE], [TO_COMPANY, AP_CODE],
    ];
    for (const [co, code] of checks) {
      const [acc] = await rawQuery<{ allowPosting: boolean }>(
        `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`,
        [co, code]);
      expect(acc, `account ${code} must exist in company ${co}`).toBeTruthy();
      expect(acc.allowPosting, `account ${code} must be postable in company ${co}`).toBe(true);
    }
  }, 60_000);

  async function cleanup() {
    if (!rawExecute) return;
    // Find this test's intercompany rows (created by our owner assignment).
    const ics = await rawQuery<{ id: number; fromJournalId: number | null; toJournalId: number | null }>(
      `SELECT id, "fromJournalId", "toJournalId" FROM intercompany_transactions
         WHERE "createdBy" IN (
           SELECT id FROM employee_assignments WHERE "employeeId" IN
             (SELECT id FROM employees WHERE email LIKE $1))`,
      [PFX + "%"]).catch(() => [] as { id: number; fromJournalId: number | null; toJournalId: number | null }[]);
    const jeIds = new Set<number>();
    for (const ic of ics) {
      if (ic.fromJournalId) jeIds.add(ic.fromJournalId);
      if (ic.toJournalId) jeIds.add(ic.toJournalId);
    }
    // Rewind balances + delete JE lines/headers, then numbering links + parent rows.
    for (const jid of jeIds) {
      const [je] = await rawQuery<{ companyId: number }>(
        `SELECT "companyId" FROM journal_entries WHERE id=$1`, [jid]).catch(() => [] as { companyId: number }[]);
      if (je) { try { await reverseAccountBalances(je.companyId, jid); } catch { /* not applied */ } }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [jid]).catch(() => {});
    }
    for (const ic of ics) {
      await rawExecute(`DELETE FROM intercompany_transactions WHERE id=$1`, [ic.id]).catch(() => {});
    }
    for (const jid of jeIds) {
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [jid]).catch(() => {});
    }
    await rawExecute(
      `DELETE FROM numbering_assignments WHERE "entityTable"='intercompany_transactions'
         AND "entityId" IN (SELECT id FROM intercompany_transactions WHERE id = ANY($1::int[]))`,
      [ics.map((x) => x.id)]).catch(() => {});
    // Belt-and-braces: drop any orphan numbering rows our owner issued.
    await rawExecute(
      `DELETE FROM numbering_assignments WHERE "entityTable"='intercompany_transactions'
         AND "issuedBy" IN (SELECT id FROM users WHERE email LIKE $1)`,
      [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
  }
  afterAll(cleanup);

  // Helper: read the counter's current nextNumber for (company, IC scheme)
  // so we can prove a leg's number came from THAT company's counter.
  async function nextIcSeq(companyId: number): Promise<number> {
    const [row] = await rawQuery<{ nextNumber: string | number }>(
      `SELECT nc."nextNumber"
         FROM numbering_counters nc
         JOIN numbering_schemes ns ON ns.id = nc."schemeId"
        WHERE ns."companyId"=$1 AND ns."moduleKey"='finance' AND ns."entityKey"='intercompany'
          AND nc."companyId"=$1
        ORDER BY nc."fiscalYear" DESC NULLS LAST
        LIMIT 1`,
      [companyId]);
    return row ? Number(row.nextNumber) : 1;
  }

  it("posts two legs, each numbered from its OWN company's IC counter; the two refs differ; balanced JEs; one numbering link per company", async () => {
    const amount = 7000;

    // Capture each company's next IC sequence BEFORE the call.
    const fromSeqBefore = await nextIcSeq(FROM_COMPANY);
    const toSeqBefore = await nextIcSeq(TO_COMPANY);

    const res = await request(app)
      .post("/api/finance/intercompany")
      .set("Authorization", `Bearer ${token}`)
      .send({
        toCompanyId: TO_COMPANY,
        amount,
        description: PFX + "txn",
        transactionDate: "2026-06-22",
        arAccountCode: AR_CODE,
        revenueAccountCode: REVENUE_CODE,
        expenseAccountCode: EXPENSE_CODE,
        apAccountCode: AP_CODE,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { ref, fromJournalId, toJournalId } = res.body;
    expect(fromJournalId, JSON.stringify(res.body)).toBeTruthy();
    expect(toJournalId, JSON.stringify(res.body)).toBeTruthy();

    // Parent row ref = FROM company's IC number.
    expect(ref).toMatch(FROM_IC_RE);

    // ── FROM-leg JE: ref is the FROM company's IC number, from its counter ──
    const [fromJe] = await rawQuery<{ ref: string; companyId: number }>(
      `SELECT ref, "companyId" FROM journal_entries WHERE id=$1`, [fromJournalId]);
    expect(fromJe.companyId).toBe(FROM_COMPANY);
    expect(fromJe.ref).toBe(ref);                 // parent ref === from-leg ref
    expect(fromJe.ref).toMatch(FROM_IC_RE);
    // sourced from FROM company's counter (seq == nextNumber it consumed).
    expect(seqOf(fromJe.ref)).toBe(fromSeqBefore);

    // ── TO-leg JE: ref is the TO company's OWN IC number, from its counter ──
    const [toJe] = await rawQuery<{ ref: string; companyId: number }>(
      `SELECT ref, "companyId" FROM journal_entries WHERE id=$1`, [toJournalId]);
    expect(toJe.companyId).toBe(TO_COMPANY);
    expect(toJe.ref).toMatch(TO_IC_RE);
    expect(seqOf(toJe.ref)).toBe(toSeqBefore);

    // ── the two refs DIFFER (each leg its own number) ──
    expect(toJe.ref).not.toBe(fromJe.ref);

    // ── FROM-leg journal lines: DR ar / CR revenue = amount, ΣDR=ΣCR ──
    const fromLines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`, [fromJournalId]);
    expect(fromLines.length).toBe(2);
    expect(fromLines[0].accountCode).toBe(AR_CODE);        // DR ar
    expect(Number(fromLines[0].debit)).toBe(amount);
    expect(Number(fromLines[0].credit)).toBe(0);
    expect(fromLines[1].accountCode).toBe(REVENUE_CODE);   // CR revenue
    expect(Number(fromLines[1].credit)).toBe(amount);
    expect(Number(fromLines[1].debit)).toBe(0);
    const [sFrom] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [fromJournalId]);
    expect(Number(sFrom.d)).toBe(amount);
    expect(Number(sFrom.c)).toBe(amount);

    // ── TO-leg journal lines: DR expense / CR ap = amount, ΣDR=ΣCR ──
    const toLines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`, [toJournalId]);
    expect(toLines.length).toBe(2);
    expect(toLines[0].accountCode).toBe(EXPENSE_CODE);     // DR expense
    expect(Number(toLines[0].debit)).toBe(amount);
    expect(Number(toLines[0].credit)).toBe(0);
    expect(toLines[1].accountCode).toBe(AP_CODE);          // CR ap
    expect(Number(toLines[1].credit)).toBe(amount);
    expect(Number(toLines[1].debit)).toBe(0);
    const [sTo] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [toJournalId]);
    expect(Number(sTo.d)).toBe(amount);
    expect(Number(sTo.c)).toBe(amount);

    // ── parent intercompany_transactions row ──
    const [ic] = await rawQuery<{ id: number; ref: string; fromJournalId: number; toJournalId: number }>(
      `SELECT id, ref, "fromJournalId", "toJournalId" FROM intercompany_transactions
         WHERE ref=$1 AND "fromCompanyId"=$2 AND "toCompanyId"=$3 AND "deletedAt" IS NULL`,
      [ref, FROM_COMPANY, TO_COMPANY]);
    expect(ic).toBeTruthy();
    expect(ic.fromJournalId).toBe(fromJournalId);
    expect(ic.toJournalId).toBe(toJournalId);

    // ── EXACTLY ONE numbering_assignment per company, both → the parent row ──
    const [naFrom] = await rawQuery<{ n: string; number: string | null }>(
      `SELECT count(*)::text n, max(number) number FROM numbering_assignments
         WHERE "companyId"=$1 AND "entityTable"='intercompany_transactions' AND "entityId"=$2`,
      [FROM_COMPANY, ic.id]);
    expect(Number(naFrom.n)).toBe(1);
    expect(naFrom.number).toBe(fromJe.ref);

    const [naTo] = await rawQuery<{ n: string; number: string | null }>(
      `SELECT count(*)::text n, max(number) number FROM numbering_assignments
         WHERE "companyId"=$1 AND "entityTable"='intercompany_transactions' AND "entityId"=$2`,
      [TO_COMPANY, ic.id]);
    expect(Number(naTo.n)).toBe(1);
    expect(naTo.number).toBe(toJe.ref);
  });

  it("a same-Idempotency-Key retry creates NO duplicate — one pair only", async () => {
    const key = `${PFX}idem-A`;
    const post = () =>
      request(app)
        .post("/api/finance/intercompany")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", key)
        .send({
          toCompanyId: TO_COMPANY,
          amount: 1234,
          description: PFX + "retry",
          transactionDate: "2026-06-22",
          arAccountCode: AR_CODE,
          revenueAccountCode: REVENUE_CODE,
          expenseAccountCode: EXPENSE_CODE,
          apAccountCode: AP_CODE,
        });

    const r1 = await post();
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    const r2 = await post();
    // Retry short-circuits BEFORE issuing → 200 replay, same parent ref.
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    expect(r2.headers["x-idempotent-replay"]).toBe("true");
    expect(r2.body.ref).toBe(r1.body.ref);

    // Exactly ONE parent row for this (from-company, sourceKey).
    const [rows] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM intercompany_transactions
         WHERE "fromCompanyId"=$1 AND ref=$2 AND "deletedAt" IS NULL`,
      [FROM_COMPANY, r1.body.ref]);
    expect(Number(rows.n)).toBe(1);

    // Exactly ONE from-leg JE and ONE to-leg JE.
    const [fromJes] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM journal_entries WHERE "companyId"=$1 AND ref=$2`,
      [FROM_COMPANY, r1.body.ref]);
    expect(Number(fromJes.n)).toBe(1);

    const [ic] = await rawQuery<{ toJournalId: number }>(
      `SELECT "toJournalId" FROM intercompany_transactions
         WHERE "fromCompanyId"=$1 AND ref=$2 AND "deletedAt" IS NULL`,
      [FROM_COMPANY, r1.body.ref]);
    const [toJes] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM journal_entries WHERE id=$1`, [ic.toJournalId]);
    expect(Number(toJes.n)).toBe(1);

    // And exactly one numbering_assignment per company for the document.
    const [naFrom] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM numbering_assignments
         WHERE "companyId"=$1 AND "entityTable"='intercompany_transactions'
           AND "entityId" IN (SELECT id FROM intercompany_transactions WHERE "fromCompanyId"=$1 AND ref=$2)`,
      [FROM_COMPANY, r1.body.ref]);
    expect(Number(naFrom.n)).toBe(1);
  });
});
