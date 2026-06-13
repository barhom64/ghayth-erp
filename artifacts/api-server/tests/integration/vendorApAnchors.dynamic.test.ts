// #2140 slice 2-أ — Accounts-Payable accounting anchors (live head-of-main DB).
//
// Proves the vendor-document GL routing resolves to REAL, POSTABLE accounts
// after migration 336 + the corrected handler fallbacks. Before this slice a
// clean install resolved 10/11 finance-purchase intents to missing (1420,
// 1400, 2115) or group/non-postable (2100, 2110, 5400) accounts, so vendor
// invoice + advance + credit all 500'd at creation.
//
// This tests the ANCHOR layer (resolveAccountCode → chart) and the posting
// engine (createJournalEntry) using the exact JE legs each handler builds.
// The HTTP handlers themselves are slice 2-ب; their end-to-end behaviour is
// verified live in the PR report.
//
// Activates only when DATABASE_URL points at the seeded test cluster.
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Al-Diyaa (seeded SOCPA chart) — the company where the broken anchors bit.
const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
const PFX = "test-2a-";

// The nine AP intents this slice anchors, with the postable account each
// MUST resolve to (mirrors migration 336 + the handler fallbacks).
const EXPECTED: Record<string, string> = {
  vendor_advance_receivable: "1190",
  vendor_advance_cash:       "1111",
  purchase_vendor_ap:        "2111",
  vendor_credit_clearing:    "2111",
  vendor_invoice_expense:    "5340",
  vendor_return_revenue:     "5110",
  purchase_vat_input:        "1180",
  vat_input_reversal:        "1180",
  purchase_grni:             "2150",
};

d("FIN #2140 slice 2-أ — vendor AP accounting anchors (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let resolve: (op: string, side: "debit" | "credit", fb: string) => Promise<string>;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const h = await import("../../src/lib/businessHelpers.js");
    createJournalEntry = h.createJournalEntry;
    reverseAccountBalances = h.reverseAccountBalances;
    const { financialEngine } = await import("../../src/lib/engines/index.js");
    resolve = (op, side, fb) => financialEngine.resolveAccountCode(COMPANY, op, side, fb);
  });

  async function cleanup() {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2)`,
      [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
  }
  afterEach(cleanup);
  afterAll(cleanup);

  const entry = (ref: string, lines: any[]) => ({
    companyId: COMPANY, branchId: BRANCH, createdBy: BY,
    ref: PFX + ref, description: "2-أ anchor " + ref,
    sourceType: "test", sourceKey: PFX + ref, lines,
  });

  // ── 1. the new account exists and is postable ──────────────────────────
  it("1190 'دفعات مقدمة للموردين' exists as a POSTABLE asset under 1100", async () => {
    const [acc] = await rawQuery<{ allowPosting: boolean; type: string; parentCode: string | null }>(
      `SELECT "allowPosting", type, "parentCode" FROM chart_of_accounts
         WHERE "companyId"=$1 AND code='1190' AND "deletedAt" IS NULL`, [COMPANY]);
    expect(acc, "1190 must exist on the seeded chart").toBeTruthy();
    expect(acc.allowPosting).toBe(true);
    expect(acc.type).toBe("asset");
    expect(acc.parentCode).toBe("1100");
  });

  // ── 2. every AP intent resolves to its postable account ────────────────
  it("all nine AP intents resolve to the expected POSTABLE account (never a group)", async () => {
    for (const [op, code] of Object.entries(EXPECTED)) {
      const resolved = await resolve(op, "debit", "9999"); // bad fb proves it's NOT falling through
      expect(resolved, `${op} should resolve to ${code}`).toBe(code);
      const [acc] = await rawQuery<{ allowPosting: boolean }>(
        `SELECT "allowPosting" FROM chart_of_accounts
           WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`, [COMPANY, resolved]);
      expect(acc, `${op} → ${resolved} must exist`).toBeTruthy();
      expect(acc.allowPosting, `${op} → ${resolved} must be postable, not a group`).toBe(true);
    }
  });

  // ── 3. each of the three documents posts a BALANCED entry ──────────────
  it("vendor invoice legs (expense + input VAT / AP) post a balanced JE", async () => {
    const [exp, vat, ap] = await Promise.all([
      resolve("vendor_invoice_expense", "debit", "5340"),
      resolve("purchase_vat_input", "debit", "1180"),
      resolve("purchase_vendor_ap", "credit", "2111"),
    ]);
    const jid = await createJournalEntry(entry("vinv", [
      { accountCode: exp, debit: 1000, credit: 0, description: "expense" },
      { accountCode: vat, debit: 150, credit: 0, description: "input VAT" },
      { accountCode: ap, debit: 0, credit: 1150, description: "AP" },
    ]));
    expect(typeof jid).toBe("number");
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(1150);
    expect(Number(s.d)).toBe(Number(s.c));
  });

  it("vendor advance legs (advances / cash) post a balanced JE", async () => {
    const [adv, cash] = await Promise.all([
      resolve("vendor_advance_receivable", "debit", "1190"),
      resolve("vendor_advance_cash", "credit", "1111"),
    ]);
    const jid = await createJournalEntry(entry("vadv", [
      { accountCode: adv, debit: 2000, credit: 0, description: "advance to supplier" },
      { accountCode: cash, debit: 0, credit: 2000, description: "cash out" },
    ]));
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(2000);
    expect(Number(s.d)).toBe(Number(s.c));
  });

  it("vendor credit memo legs (AP / return-cost + VAT reversal) post a balanced JE", async () => {
    const [ap, ret, vatRev] = await Promise.all([
      resolve("purchase_vendor_ap", "debit", "2111"),
      resolve("vendor_return_revenue", "credit", "5110"),
      resolve("vat_input_reversal", "credit", "1180"),
    ]);
    const jid = await createJournalEntry(entry("vcm", [
      { accountCode: ap, debit: 300, credit: 0, description: "reduce AP" },
      { accountCode: ret, debit: 0, credit: 260.87, description: "return (net)" },
      { accountCode: vatRev, debit: 0, credit: 39.13, description: "VAT reversal" },
    ]));
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(300);
    expect(Number(s.d)).toBe(Number(s.c));
  });

  // ── 4. the engine refuses a group account (no posting to a parent) ─────
  it("rejects posting to a non-postable group account (2110 الموردون header)", async () => {
    await expect(createJournalEntry(entry("group", [
      { accountCode: "2110", debit: 100, credit: 0 },
      { accountCode: "2111", debit: 0, credit: 100 },
    ]))).rejects.toThrow(/تجميعي|الحركة|posting|postable/i);
  });

  // ── 5. idempotency on sourceKey — replay returns the same entry ────────
  it("is idempotent on sourceKey — a replay does not duplicate the JE", async () => {
    const [adv, cash] = await Promise.all([
      resolve("vendor_advance_receivable", "debit", "1190"),
      resolve("vendor_advance_cash", "credit", "1111"),
    ]);
    const lines = [
      { accountCode: adv, debit: 500, credit: 0 },
      { accountCode: cash, debit: 0, credit: 500 },
    ];
    const j1 = await createJournalEntry(entry("idem", lines));
    const j2 = await createJournalEntry(entry("idem", lines));
    expect(j2).toBe(j1);
    const [{ n }] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM journal_entries WHERE "companyId"=$1 AND ref=$2`,
      [COMPANY, PFX + "idem"]);
    expect(Number(n)).toBe(1);
  });
});
