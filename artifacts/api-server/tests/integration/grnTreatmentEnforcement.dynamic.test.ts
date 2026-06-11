// #1945 FIN-SUB-01 (#2097) — GRN treatment is ENFORCED on the server: the
// account each received line posts to MUST match its treatment's chart nature
// (inventory/fixed_asset/prepayment/custody → asset/balance-sheet; expense/
// service/vehicle/property → expense/P&L). Drives the REAL PATCH /purchase-
// orders/:id/receive route over HTTP on the live head-of-main DB and asserts
// the ACTUAL journal_lines (account/debit/credit/branch/vendor + DR=CR), plus
// the rejection of a fixed-asset line pinned to an expense account (the R-005
// catastrophe: an asset hitting P&L). Activates only on the test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;   // Al-Diyaa — SOCPA chart
const BRANCH = 2;
const PFX = "test-grn01-";
const CSRF = "test-grn01-csrf";
// Real postable leaves on the SOCPA chart:
const INV = "1151";   // مخزون البضائع (asset) — where `inventory` should land
const CIP = "1270";   // أعمال تحت التنفيذ (asset) — a valid fixed-asset target
const EXP = "5350";   // الصيانة والإصلاحات (expense)
const GRNI = "2115";  // فواتير لم تُستلم (liability)

d("FIN-SUB-01 — GRN treatment ↔ account nature enforced (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  let token: string;
  let supplierId: number;
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };

  async function makePO(lines: Array<{ name: string; qty: number; price: number; treatment: string; accountCode?: string }>) {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const [po] = await rawQuery<{ id: number }>(
      `INSERT INTO purchase_orders ("companyId","branchId","supplierId",ref,status,"totalAmount")
       VALUES ($1,$2,$3,$4,'approved',$5) RETURNING id`,
      [COMPANY, BRANCH, supplierId, PFX + Math.random().toString(36).slice(2, 8), subtotal],
    );
    for (const l of lines) {
      await rawExecute(
        `INSERT INTO purchase_order_items ("orderId","itemName",quantity,"unitPrice","lineTotal","lineTreatment","accountCode","allocationStatus")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [po.id, l.name, l.qty, l.price, l.qty * l.price, l.treatment, l.accountCode ?? null, l.accountCode ? "resolved" : "unmapped"],
      );
    }
    return po.id;
  }

  const receive = (poId: number) =>
    request(app)
      .patch(`/api/finance/purchase-orders/${poId}/receive`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({});

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
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

    const [sup] = await rawQuery<{ id: number }>(
      `INSERT INTO suppliers ("companyId",name) VALUES ($1,$2) RETURNING id`, [COMPANY, PFX + "supplier"]);
    supplierId = sup.id;
  }, 60_000);

  async function cleanup() {
    if (!rawExecute) return;
    const pos = await rawQuery<{ id: number }>(
      `SELECT id FROM purchase_orders WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
    for (const po of pos) {
      const grns = await rawQuery<{ id: number; journalId: number | null }>(
        `SELECT id, "journalId" FROM goods_receipts WHERE "companyId"=$1 AND "poId"=$2`, [COMPANY, po.id]);
      for (const g of grns) {
        if (g.journalId) { try { await reverseAccountBalances(COMPANY, g.journalId); } catch { /* not applied */ }
          await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [g.journalId]);
          await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [g.journalId]); }
        await rawExecute(`DELETE FROM goods_receipt_items WHERE "grnId"=$1`, [g.id]);
      }
      await rawExecute(`DELETE FROM goods_receipts WHERE "companyId"=$1 AND "poId"=$2`, [COMPANY, po.id]);
      await rawExecute(`DELETE FROM purchase_order_items WHERE "orderId"=$1`, [po.id]);
    }
    await rawExecute(`DELETE FROM purchase_orders WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM suppliers WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }
  afterAll(cleanup);

  async function jeLines(grnRef: string) {
    return rawQuery<{ accountCode: string; debit: string; credit: string; branchId: number | null; vendorId: number | null }>(
      `SELECT jl."accountCode", jl.debit::text, jl.credit::text, jl."branchId", jl."vendorId"
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId"
        WHERE je."companyId"=$1 AND je.ref=$2 ORDER BY jl.credit DESC, jl."accountCode"`,
      [COMPANY, grnRef]);
  }

  it("posts each treatment to a nature-correct account: inventory→1151(asset), fixed_asset→1270(asset/CIP), expense→5350(P&L)", async () => {
    const poId = await makePO([
      { name: PFX + "stock", qty: 2, price: 50, treatment: "inventory", accountCode: INV },
      { name: PFX + "machine", qty: 1, price: 300, treatment: "fixed_asset", accountCode: CIP },
      { name: PFX + "repair", qty: 1, price: 40, treatment: "expense", accountCode: EXP },
    ]);
    const res = await receive(poId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const [grn] = await rawQuery<{ ref: string }>(`SELECT ref FROM goods_receipts WHERE "poId"=$1`, [poId]);
    const lines = await jeLines(grn.ref);

    const byAcct = new Map(lines.filter((l) => Number(l.debit) > 0).map((l) => [l.accountCode, Number(l.debit)]));
    expect(byAcct.get(INV)).toBe(100); // inventory 2×50 on a real inventory asset (NOT leasehold 1250)
    expect(byAcct.get(CIP)).toBe(300); // fixed asset on the balance sheet, never P&L
    expect(byAcct.get(EXP)).toBe(40);  // expense on P&L

    // GRNI credit + balance
    const grniLine = lines.find((l) => l.accountCode === GRNI && Number(l.credit) > 0);
    expect(grniLine, "GRNI credit must exist").toBeTruthy();
    const totalD = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalC = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(roundEq(totalD, totalC)).toBe(true);

    // branch = PO branch, vendor dim stamped on the DR lines
    for (const l of lines) if (Number(l.debit) > 0 && l.accountCode !== "1180") {
      expect(l.branchId).toBe(BRANCH);
      expect(l.vendorId).toBe(supplierId);
    }
  });

  it("REJECTS fixed-asset on an expense account (asset must not hit P&L) and leaves ZERO trace", async () => {
    const poId = await makePO([
      { name: PFX + "bad-asset", qty: 1, price: 500, treatment: "fixed_asset", accountCode: EXP }, // 5350 = expense
    ]);
    const poItemBefore = await rawQuery<{ id: number; receivedQty: string }>(
      `SELECT id, COALESCE("receivedQty",0)::text AS "receivedQty" FROM purchase_order_items WHERE "orderId"=$1`, [poId]);
    const statusBefore = (await rawQuery<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [poId]))[0].status;

    const res = await receive(poId);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/لا يجوز ترحيلها على حساب مصروف|أصل/);

    // ── full rejection: NO permanent trace whatsoever ──
    // 1. no GRN row created (and therefore no journal entry)
    const grns = await rawQuery<{ id: number }>(`SELECT id FROM goods_receipts WHERE "poId"=$1`, [poId]);
    expect(grns.length, "no goods_receipts row may be created on a rejected receipt").toBe(0);
    // 2. receivedQty unchanged
    const poItemAfter = await rawQuery<{ id: number; receivedQty: string }>(
      `SELECT id, COALESCE("receivedQty",0)::text AS "receivedQty" FROM purchase_order_items WHERE "orderId"=$1`, [poId]);
    expect(poItemAfter.map((r) => r.receivedQty)).toEqual(poItemBefore.map((r) => r.receivedQty));
    // 3. PO status unchanged
    const statusAfter = (await rawQuery<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [poId]))[0].status;
    expect(statusAfter).toBe(statusBefore);
  });

  it("REJECTS an inventory line pinned to an expense account (inventory must not be expensed)", async () => {
    const poId = await makePO([
      { name: PFX + "bad-stock", qty: 1, price: 70, treatment: "inventory", accountCode: EXP },
    ]);
    const res = await receive(poId);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/مخزون/);
  });

  it("unpinned inventory line resolves to a real inventory account (1151), not leasehold 1250", async () => {
    const poId = await makePO([
      { name: PFX + "stock2", qty: 3, price: 10, treatment: "inventory" }, // no accountCode → treatment default
    ]);
    const res = await receive(poId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [grn] = await rawQuery<{ ref: string }>(`SELECT ref FROM goods_receipts WHERE "poId"=$1`, [poId]);
    const lines = await jeLines(grn.ref);
    const dr = lines.find((l) => Number(l.debit) === 30);
    expect(dr).toBeTruthy();
    expect(dr!.accountCode).toBe(INV);
    expect(dr!.accountCode).not.toBe("1250");
  });
});

function roundEq(a: number, b: number) { return Math.abs(a - b) < 0.005; }
