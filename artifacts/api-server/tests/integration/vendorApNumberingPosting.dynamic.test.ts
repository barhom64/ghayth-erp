// #1141 (AP side) — vendor advance + vendor credit memo numbers now come
// from the CENTRAL numbering authority (numberingService.issueNumber),
// replacing the old internalTechRef("VENDOR-ADV-…") / internalTechRef("VCM-…")
// tech refs. This test drives the REAL HTTP routes
//   POST /api/finance/vendor-advances
//   POST /api/finance/vendor-credits
// on the live head-of-main DB and asserts, as a LEDGER guard:
//
//   • the EXACT journal_lines (account code / debit / credit / vendor) each
//     document posts, with ΣDR = ΣCR = the document total;
//   • the user-facing number is the center-issued number (VADV-YYYY-NNNNN /
//     VCN-YYYY-NNNNN) AND it equals BOTH the table `ref` AND journal_entries.ref;
//   • EXACTLY ONE numbering_assignments row links each document (entityTable +
//     entityId), proving the post-INSERT link-back fired once.
//
// Account codes are CONFIRMED from the seeded SOCPA chart (Al-Diyaa, company 2)
// and mirror routes/finance-purchase.ts + tests/integration/vendorApAnchors:
//   vendor_advance     : DR vendor_advance_receivable 1190 / CR vendor_advance_cash 1111
//   vendor_credit_memo : DR purchase_vendor_ap 2111 / CR vendor_return_revenue 5110 / CR vat_input_reversal 1180
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

// Al-Diyaa (seeded SOCPA chart) — the company the AP anchors target.
const COMPANY = 2;
const BRANCH = 2;
const PFX = "test-apnum-";

d("FIN #1141 — vendor AP numbers via the central numbering center (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let resolveAccountCode: (op: string, side: "debit" | "credit", fb: string) => Promise<string>;

  let token: string;
  let supplierId: number;
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };

  // Resolved (and asserted) account codes — the contract is "what the engine
  // routes to", and we additionally pin the expected SOCPA leaves.
  let advRecvCode: string;   // 1190
  let advCashCode: string;   // 1111
  let apCode: string;        // 2111
  let returnsCode: string;   // 5110
  let vatRevCode: string;    // 1180

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
    const { signToken } = await import("../../src/lib/auth.js");
    const { financialEngine } = await import("../../src/lib/engines/index.js");
    resolveAccountCode = (op, side, fb) => financialEngine.resolveAccountCode(COMPANY, op, side, fb);

    await cleanup();

    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`,
      [PFX + "owner", PFX + "owner@test.local"]);
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`,
      [emp.id, COMPANY, BRANCH]);
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"]);
    created.userId = usr.id;
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "owner" });

    const [sup] = await rawQuery<{ id: number }>(
      `INSERT INTO suppliers ("companyId",name) VALUES ($1,$2) RETURNING id`, [COMPANY, PFX + "supplier"]);
    supplierId = sup.id;

    [advRecvCode, advCashCode, apCode, returnsCode, vatRevCode] = await Promise.all([
      resolveAccountCode("vendor_advance_receivable", "debit", "1190"),
      resolveAccountCode("vendor_advance_cash", "credit", "1111"),
      resolveAccountCode("purchase_vendor_ap", "debit", "2111"),
      resolveAccountCode("vendor_return_revenue", "credit", "5110"),
      resolveAccountCode("vat_input_reversal", "credit", "1180"),
    ]);
  }, 60_000);

  async function cleanup() {
    if (!rawExecute) return;
    // Rewind balances + delete the JEs these documents posted, then the docs.
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1
         AND ("sourceType" IN ('vendor_advance','vendor_credit_memo'))
         AND ref LIKE 'V%'
         AND id IN (
           SELECT "journalId" FROM vendor_advances WHERE "companyId"=$1 AND "supplierId" IN
             (SELECT id FROM suppliers WHERE "companyId"=$1 AND name LIKE $2)
           UNION
           SELECT "journalId" FROM vendor_credit_memos WHERE "companyId"=$1 AND "supplierId" IN
             (SELECT id FROM suppliers WHERE "companyId"=$1 AND name LIKE $2)
         )`,
      [COMPANY, PFX + "%"]).catch(() => [] as { id: number }[]);
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* not applied */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
    // numbering_assignments link rows for these documents.
    await rawExecute(
      `DELETE FROM numbering_assignments WHERE "companyId"=$1 AND "entityTable" IN ('vendor_advances','vendor_credit_memos')
         AND "entityId" IN (
           SELECT id FROM vendor_advances WHERE "companyId"=$1 AND "supplierId" IN
             (SELECT id FROM suppliers WHERE "companyId"=$1 AND name LIKE $2)
           UNION
           SELECT id FROM vendor_credit_memos WHERE "companyId"=$1 AND "supplierId" IN
             (SELECT id FROM suppliers WHERE "companyId"=$1 AND name LIKE $2))`,
      [COMPANY, PFX + "%"]).catch(() => {});
    await rawExecute(
      `DELETE FROM vendor_advances WHERE "companyId"=$1 AND "supplierId" IN
         (SELECT id FROM suppliers WHERE "companyId"=$1 AND name LIKE $2)`,
      [COMPANY, PFX + "%"]).catch(() => {});
    await rawExecute(
      `DELETE FROM vendor_credit_memos WHERE "companyId"=$1 AND "supplierId" IN
         (SELECT id FROM suppliers WHERE "companyId"=$1 AND name LIKE $2)`,
      [COMPANY, PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM suppliers WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }
  afterAll(cleanup);

  // ── sanity: the five AP accounts resolve to postable SOCPA leaves ──
  it("resolves the five AP accounts to the expected POSTABLE codes", async () => {
    const expected: Record<string, string> = {
      [advRecvCode]: "1190", [advCashCode]: "1111", [apCode]: "2111",
      [returnsCode]: "5110", [vatRevCode]: "1180",
    };
    expect(advRecvCode).toBe("1190");
    expect(advCashCode).toBe("1111");
    expect(apCode).toBe("2111");
    expect(returnsCode).toBe("5110");
    expect(vatRevCode).toBe("1180");
    for (const code of Object.keys(expected)) {
      const [acc] = await rawQuery<{ allowPosting: boolean }>(
        `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`,
        [COMPANY, code]);
      expect(acc, `account ${code} must exist`).toBeTruthy();
      expect(acc.allowPosting, `account ${code} must be postable`).toBe(true);
    }
  });

  // ── L1: vendor advance ──
  it("vendor advance: number is center-issued (VADV-…), equals ref + JE ref, with exactly one numbering link and a balanced 2-leg JE", async () => {
    const amount = 2000;
    const res = await request(app)
      .post("/api/finance/vendor-advances")
      .set("Authorization", `Bearer ${token}`)
      .send({ supplierId, amount, method: "bank_transfer", paidDate: "2026-06-22" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { advanceId, ref, journalId } = res.body;
    expect(advanceId).toBeTruthy();
    expect(journalId).toBeTruthy();

    // number shape — issued by the center, NOT a tech ref.
    expect(ref).toMatch(/^VADV-\d{4}-\d{5}$/);

    // table ref === issued number === JE ref
    const [adv] = await rawQuery<{ ref: string; amount: string; status: string; journalId: number }>(
      `SELECT ref, amount::text, status, "journalId" FROM vendor_advances WHERE id=$1`, [advanceId]);
    expect(adv.ref).toBe(ref);
    expect(adv.journalId).toBe(journalId);
    const [je] = await rawQuery<{ ref: string; sourceKey: string }>(
      `SELECT ref, "sourceKey" FROM journal_entries WHERE id=$1`, [journalId]);
    expect(je.ref).toBe(ref);

    // exactly one numbering assignment links this advance.
    const [na] = await rawQuery<{ n: string; number: string | null }>(
      `SELECT count(*)::text n, max(number) number FROM numbering_assignments
         WHERE "companyId"=$1 AND "entityTable"='vendor_advances' AND "entityId"=$2`,
      [COMPANY, advanceId]);
    expect(Number(na.n)).toBe(1);
    expect(na.number).toBe(ref);

    // ── the exact journal lines ──
    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string; vendorId: number | null }>(
      `SELECT "accountCode", debit::text, credit::text, "vendorId"
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`, [journalId]);
    expect(lines.length).toBe(2);
    // DR vendor_advance_receivable (1190) = amount
    expect(lines[0].accountCode).toBe(advRecvCode);
    expect(Number(lines[0].debit)).toBe(amount);
    expect(Number(lines[0].credit)).toBe(0);
    expect(lines[0].vendorId).toBe(supplierId);
    // CR vendor_advance_cash (1111) = amount
    expect(lines[1].accountCode).toBe(advCashCode);
    expect(Number(lines[1].credit)).toBe(amount);
    expect(Number(lines[1].debit)).toBe(0);
    expect(lines[1].vendorId).toBe(supplierId);
    // ΣDR = ΣCR = amount
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [journalId]);
    expect(Number(s.d)).toBe(amount);
    expect(Number(s.c)).toBe(amount);
  });

  // ── L2: vendor credit memo ──
  it("vendor credit memo: number is center-issued (VCN-…), equals ref + JE ref, with exactly one numbering link and a balanced 3-leg JE", async () => {
    // vatIncluded=true, 15% → subtotal 100, vat 15, full 115
    const total = 115;
    const expectedSub = 100;
    const expectedVat = 15;
    const res = await request(app)
      .post("/api/finance/vendor-credits")
      .set("Authorization", `Bearer ${token}`)
      .send({ supplierId, amount: total, reason: PFX + "return", memoDate: "2026-06-22", vatIncluded: true });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { memoId, ref, amount: subtotal, vatAmount, totalAmount, journalId } = res.body;
    expect(memoId).toBeTruthy();
    expect(journalId).toBeTruthy();
    expect(Number(subtotal)).toBe(expectedSub);
    expect(Number(vatAmount)).toBe(expectedVat);
    expect(Number(totalAmount)).toBe(total);

    // number shape — issued by the center, NOT a tech ref.
    expect(ref).toMatch(/^VCN-\d{4}-\d{5}$/);

    // table ref === issued number === JE ref
    const [memo] = await rawQuery<{ ref: string; amount: string; vatAmount: string; totalAmount: string; journalId: number }>(
      `SELECT ref, amount::text, "vatAmount"::text, "totalAmount"::text, "journalId" FROM vendor_credit_memos WHERE id=$1`, [memoId]);
    expect(memo.ref).toBe(ref);
    expect(memo.journalId).toBe(journalId);
    expect(Number(memo.amount)).toBe(expectedSub);
    expect(Number(memo.vatAmount)).toBe(expectedVat);
    expect(Number(memo.totalAmount)).toBe(total);
    const [je] = await rawQuery<{ ref: string }>(`SELECT ref FROM journal_entries WHERE id=$1`, [journalId]);
    expect(je.ref).toBe(ref);

    // exactly one numbering assignment links this memo.
    const [na] = await rawQuery<{ n: string; number: string | null }>(
      `SELECT count(*)::text n, max(number) number FROM numbering_assignments
         WHERE "companyId"=$1 AND "entityTable"='vendor_credit_memos' AND "entityId"=$2`,
      [COMPANY, memoId]);
    expect(Number(na.n)).toBe(1);
    expect(na.number).toBe(ref);

    // ── the exact journal lines ──
    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string; vendorId: number | null }>(
      `SELECT "accountCode", debit::text, credit::text, "vendorId"
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC, credit DESC`, [journalId]);
    expect(lines.length).toBe(3);
    // DR purchase_vendor_ap (2111) = full
    expect(lines[0].accountCode).toBe(apCode);
    expect(Number(lines[0].debit)).toBe(total);
    expect(Number(lines[0].credit)).toBe(0);
    // CR vendor_return_revenue (5110) = subtotal
    const retLine = lines.find((l) => l.accountCode === returnsCode);
    expect(retLine).toBeTruthy();
    expect(Number(retLine!.credit)).toBe(expectedSub);
    expect(Number(retLine!.debit)).toBe(0);
    // CR vat_input_reversal (1180) = vat
    const vatLine = lines.find((l) => l.accountCode === vatRevCode);
    expect(vatLine).toBeTruthy();
    expect(Number(vatLine!.credit)).toBe(expectedVat);
    expect(Number(vatLine!.debit)).toBe(0);
    // subtotal + vat === full, ΣDR = ΣCR
    expect(expectedSub + expectedVat).toBe(total);
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [journalId]);
    expect(Number(s.d)).toBe(total);
    expect(Number(s.c)).toBe(total);
  });

  // ── sequence advances per call (proves the counter, not a static ref) ──
  it("issues strictly increasing VADV sequence numbers on consecutive advances", async () => {
    const mk = async () => {
      const r = await request(app)
        .post("/api/finance/vendor-advances")
        .set("Authorization", `Bearer ${token}`)
        .send({ supplierId, amount: 10, method: "bank_transfer", paidDate: "2026-06-22" });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return String(r.body.ref);
    };
    const a = await mk();
    const b = await mk();
    expect(a).toMatch(/^VADV-\d{4}-\d{5}$/);
    expect(b).toMatch(/^VADV-\d{4}-\d{5}$/);
    const seq = (s: string) => Number(s.split("-")[2]);
    expect(seq(b)).toBe(seq(a) + 1);
  });

  // ── idempotency: a retry with the SAME Idempotency-Key must NOT duplicate
  //    the document, the JE, or burn a second number (the stable-sourceKey
  //    short-circuit; regression guard for the #1141 numbering wiring). ──
  it("vendor advance: a same-key retry replays (one row, one JE, no second number)", async () => {
    const key = `${PFX}adv-idem-A`;
    const post = () =>
      request(app)
        .post("/api/finance/vendor-advances")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", key)
        .send({ supplierId, amount: 333, method: "bank_transfer", paidDate: "2026-06-22" });
    const r1 = await post();
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    const r2 = await post();
    expect(r2.status, JSON.stringify(r2.body)).toBe(200); // replay path
    expect(r2.headers["x-idempotent-replay"]).toBe("true");
    expect(r2.body.ref).toBe(r1.body.ref);
    const [rows] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM vendor_advances WHERE "companyId"=$1 AND ref=$2`, [COMPANY, r1.body.ref]);
    expect(Number(rows.n)).toBe(1);
    const [jes] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM journal_entries WHERE "companyId"=$1 AND ref=$2`, [COMPANY, r1.body.ref]);
    expect(Number(jes.n)).toBe(1);
  });

  it("vendor credit memo: a same-key retry replays (one row, one JE, no second number)", async () => {
    const key = `${PFX}vcn-idem-A`;
    const post = () =>
      request(app)
        .post("/api/finance/vendor-credits")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", key)
        .send({ supplierId, amount: 230, reason: PFX + "retry", memoDate: "2026-06-22", vatIncluded: true });
    const r1 = await post();
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    const r2 = await post();
    expect(r2.status, JSON.stringify(r2.body)).toBe(201); // memo replay echoes the same body
    expect(r2.body.ref).toBe(r1.body.ref);
    expect(r2.body.memoId).toBe(r1.body.memoId);
    const [rows] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM vendor_credit_memos WHERE "companyId"=$1 AND ref=$2`, [COMPANY, r1.body.ref]);
    expect(Number(rows.n)).toBe(1);
    const [jes] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM journal_entries WHERE "companyId"=$1 AND ref=$2`, [COMPANY, r1.body.ref]);
    expect(Number(jes.n)).toBe(1);
  });
});
