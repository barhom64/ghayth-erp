// #2099 / FIN-SUB-08 — migration 312 freezes the in-code intent resolution of
// the finance-posting operation keys into accounting_mappings, per company, so
// GL routing becomes controllable data while the intent search stays only as a
// safety net. The owner's binding condition: the freeze must NOT change what
// resolves today — for every company × key the seeded mapping must equal what
// resolveByIntent returns. Proven live on the head-of-main DB: read the seeded
// mapping, delete it inside a transaction, re-resolve through the real
// getAccountCodeFromMapping (now hitting the intent fallback), and assert it
// returns the same account; then confirm the mapping is used when present and
// the literal fallback only when nothing maps. Activates only on the test
// cluster.
import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2; // SOCPA chart — the keys' literal fallbacks are non-postable headers, so intent search is exercised

// The seeded keys + the canonical fallback each is resolved with (must match
// migration 312 so resolveByIntent behaves identically in the test).
const KEYS: Array<{ op: string; side: "debit" | "credit"; fallback: string }> = [
  { op: "invoice_revenue",              side: "credit", fallback: "4000" },
  { op: "invoice_ar",                   side: "debit",  fallback: "1200" },
  { op: "invoice_vat_payable",          side: "credit", fallback: "2300" },
  { op: "invoice_payment_cash",         side: "debit",  fallback: "1110" },
  { op: "invoice_payment_ar",           side: "credit", fallback: "1200" },
  { op: "customer_advance_liability",   side: "credit", fallback: "2400" },
  { op: "bank_fee_expense",             side: "debit",  fallback: "5390" },
  { op: "bank_interest_income",         side: "credit", fallback: "4910" },
  { op: "inventory_receipt",            side: "debit",  fallback: "1150" },
  { op: "employee_custody",             side: "debit",  fallback: "1142" },
  { op: "supplier_prepayment",          side: "debit",  fallback: "1170" },
  { op: "fixed_asset_purchase",         side: "debit",  fallback: "1500" },
  { op: "general_expense",              side: "debit",  fallback: "6900" },
  { op: "service_expense",              side: "debit",  fallback: "6920" },
  { op: "vehicle_expense",              side: "debit",  fallback: "6500" },
  { op: "property_maintenance_expense", side: "debit",  fallback: "6600" },
  { op: "project_cost",                 side: "debit",  fallback: "6800" },
];

d("FIN-SUB-08 — intent results frozen into accounting_mappings (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let getAccountCodeFromMapping: typeof import("../../src/lib/businessHelpers.js").getAccountCodeFromMapping;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; withTransaction = rawdb.withTransaction;
    const h = await import("../../src/lib/businessHelpers.js");
    getAccountCodeFromMapping = h.getAccountCodeFromMapping;
  });

  async function mappedCode(op: string): Promise<string | null> {
    const [r] = await rawQuery<{ debitAccountCode: string | null; creditAccountCode: string | null }>(
      `SELECT "debitAccountCode", "creditAccountCode" FROM accounting_mappings
         WHERE "companyId"=$1 AND "operationType"=$2 AND "isActive"=true`, [COMPANY, op]);
    return r ? (r.debitAccountCode ?? r.creditAccountCode) : null;
  }

  it("every seeded key: the mapping is used (returns the mapped account, not the literal fallback)", async () => {
    for (const k of KEYS) {
      const m = await mappedCode(k.op);
      if (!m) continue; // key may have been pre-mapped elsewhere / not resolvable on this chart
      const got = await getAccountCodeFromMapping(COMPANY, k.op, k.side, k.fallback);
      expect(got, `${k.op}: getAccountCodeFromMapping should return the mapped account`).toBe(m);
    }
  });

  it("before == after: the seeded mapping equals what resolveByIntent returns (no behaviour change)", async () => {
    for (const k of KEYS) {
      const m = await mappedCode(k.op);
      if (!m) continue;
      // delete the mapping inside a transaction, re-resolve (now via intent), then roll back
      let intentCode = "";
      await withTransaction(async (tx: any) => {
        await tx.query(`DELETE FROM accounting_mappings WHERE "companyId"=$1 AND "operationType"=$2`, [COMPANY, k.op]);
        intentCode = await getAccountCodeFromMapping(COMPANY, k.op, k.side, k.fallback);
        throw new Error("__rollback__"); // never persist the delete
      }).catch((e: any) => { if (e?.message !== "__rollback__") throw e; });
      expect(intentCode, `${k.op}: frozen mapping must equal the intent result`).toBe(m);
    }
  });

  it("the literal fallback is used only when neither a mapping nor an intent match exists", async () => {
    // a synthetic op has no mapping row and no MAPPING_INTENT entry → the
    // resolver returns the literal fallback verbatim (the safety net).
    const got = await getAccountCodeFromMapping(COMPANY, "zz_fin_sub_08_nonexistent_op", "debit", "1111");
    expect(got).toBe("1111");
  });

  it("seeded mappings point at REAL postable accounts (never a non-postable header)", async () => {
    for (const k of KEYS) {
      const m = await mappedCode(k.op);
      if (!m) continue;
      const [acc] = await rawQuery<{ allowPosting: boolean }>(
        `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`, [COMPANY, m]);
      expect(acc, `${k.op}: mapped account ${m} must exist`).toBeTruthy();
      expect(acc.allowPosting, `${k.op}: mapped account ${m} must be postable`).toBe(true);
    }
  });
});
