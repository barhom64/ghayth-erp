// #2140 شريحة 5-أ — مرتكزات الأصول الثابتة المحاسبية والبنيوية (live head-of-main DB).
//
// يثبت أن:
// 1. الحسابات الجديدة (1291 / 3600 / 5850 / 5860) موجودة وقابلة للترحيل.
// 2. الأعمدة الجديدة (departmentId / costCenterId / accumulatedImpairment)
//    موجودة في جدول fixed_assets.
// 3. كل intent من intents دورة الحياة السبعة يُحل إلى حساب postable حقيقي.
// 4. fallback إعادة التقييم لا يعود إلى 3300 (الأرباح المحتجزة).
// 5. قيود الاستبعاد / الهبوط / النقل / إعادة التقييم متوازنة على تنصيب نظيف.
// 6. الترحيل على حساب تجميعي مرفوض برسالة عربية.
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

const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
const PFX = "test-5a-";

// intents دورة الحياة مع الحسابات المتوقعة بعد تصحيح 5-أ
const EXPECTED_INTENTS: Record<string, string> = {
  asset_disposal_cash:          "1100",
  asset_disposal_gain:          "4920",
  asset_disposal_loss:          "5810",
  asset_impairment_loss:        "5850",
  asset_accumulated_impairment: "1291",
  asset_revaluation_surplus:    "3600",
  asset_revaluation_loss:       "5860",
};

d("FIN #2140 شريحة 5-أ — مرتكزات الأصول الثابتة (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let resolve: (op: string, side: "debit" | "credit", fb: string) => Promise<string>;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const h = await import("../../src/lib/businessHelpers.js");
    createJournalEntry = h.createJournalEntry;
    const { financialEngine } = await import("../../src/lib/engines/index.js");
    resolve = (op, side, fb) => financialEngine.resolveAccountCode(COMPANY, op, side, fb);
  });

  async function cleanup() {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2)`,
      [COMPANY, PFX + "%"]);
    await rawExecute(
      `DELETE FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`,
      [COMPANY, PFX + "%"]);
    await rawExecute(
      `DELETE FROM fixed_assets WHERE "companyId"=$1 AND code LIKE $2`,
      [COMPANY, PFX + "%"]);
  }
  afterEach(cleanup);
  afterAll(cleanup);

  const je = (ref: string, lines: any[]) => ({
    companyId: COMPANY, branchId: BRANCH, createdBy: BY,
    ref: PFX + ref, description: "5-أ anchor " + ref,
    sourceType: "test", sourceKey: PFX + ref, lines,
  });

  // ── 1. الحسابات الجديدة موجودة وقابلة للترحيل ─────────────────────────
  it("1291 مجمع انخفاض قيمة الأصول الثابتة موجود وقابل للترحيل تحت 1200", async () => {
    const [acc] = await rawQuery<{ allowPosting: boolean; type: string; parentCode: string | null }>(
      `SELECT "allowPosting", type, "parentCode" FROM chart_of_accounts
         WHERE "companyId"=$1 AND code='1291' AND "deletedAt" IS NULL`, [COMPANY]);
    expect(acc, "1291 must exist on the seeded chart").toBeTruthy();
    expect(acc.allowPosting).toBe(true);
    expect(acc.type).toBe("asset");
    expect(acc.parentCode).toBe("1200");
  });

  it("3600 فائض إعادة التقييم موجود وقابل للترحيل كحقوق ملكية مستقلة", async () => {
    const [acc] = await rawQuery<{ allowPosting: boolean; type: string; parentCode: string | null }>(
      `SELECT "allowPosting", type, "parentCode" FROM chart_of_accounts
         WHERE "companyId"=$1 AND code='3600' AND "deletedAt" IS NULL`, [COMPANY]);
    expect(acc, "3600 must exist on the seeded chart").toBeTruthy();
    expect(acc.allowPosting).toBe(true);
    expect(acc.type).toBe("equity");
    expect(acc.parentCode).toBe("3000");
  });

  it("5850 خسارة انخفاض القيمة موجودة وقابلة للترحيل تحت 5800", async () => {
    const [acc] = await rawQuery<{ allowPosting: boolean; type: string; parentCode: string | null }>(
      `SELECT "allowPosting", type, "parentCode" FROM chart_of_accounts
         WHERE "companyId"=$1 AND code='5850' AND "deletedAt" IS NULL`, [COMPANY]);
    expect(acc, "5850 must exist on the seeded chart").toBeTruthy();
    expect(acc.allowPosting).toBe(true);
    expect(acc.type).toBe("expense");
    expect(acc.parentCode).toBe("5800");
  });

  it("5860 خسارة إعادة التقييم موجودة وقابلة للترحيل تحت 5800", async () => {
    const [acc] = await rawQuery<{ allowPosting: boolean; type: string; parentCode: string | null }>(
      `SELECT "allowPosting", type, "parentCode" FROM chart_of_accounts
         WHERE "companyId"=$1 AND code='5860' AND "deletedAt" IS NULL`, [COMPANY]);
    expect(acc, "5860 must exist on the seeded chart").toBeTruthy();
    expect(acc.allowPosting).toBe(true);
    expect(acc.type).toBe("expense");
    expect(acc.parentCode).toBe("5800");
  });

  // ── 2. 3300 لا يزال أرباح محتجزة وليس فائض إعادة تقييم ─────────────────
  it("3300 لا يزال حساب الأرباح المحتجزة ولا يُستخدم كفائض إعادة التقييم", async () => {
    const [acc] = await rawQuery<{ name: string; type: string }>(
      `SELECT name, type FROM chart_of_accounts
         WHERE "companyId"=$1 AND code='3300' AND "deletedAt" IS NULL`, [COMPANY]);
    expect(acc).toBeTruthy();
    // يجب ألا يكون مرتبطًا بـ intent إعادة التقييم
    const [mapping] = await rawQuery<{ operationType: string } | undefined>(
      `SELECT "operationType" FROM accounting_mappings
         WHERE "companyId"=$1 AND "operationType"='asset_revaluation_surplus'
           AND ("debitAccountCode"='3300' OR "creditAccountCode"='3300')`, [COMPANY]);
    expect(mapping, "3300 must NOT be mapped to asset_revaluation_surplus").toBeUndefined();
  });

  // ── 3. كل intent من السبعة يُحل إلى حساب postable حقيقي ─────────────────
  it("جميع intents دورة حياة الأصول السبعة تُحل إلى حسابات postable صحيحة", async () => {
    for (const [op, expectedCode] of Object.entries(EXPECTED_INTENTS)) {
      const resolved = await resolve(op, "debit", "9999"); // fb سيء يثبت أنه يُحل من intent
      expect(resolved, `${op} should resolve to ${expectedCode}`).toBe(expectedCode);
      const [acc] = await rawQuery<{ allowPosting: boolean }>(
        `SELECT "allowPosting" FROM chart_of_accounts
           WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`,
        [COMPANY, resolved]);
      expect(acc, `${op} → ${resolved} must exist in chart`).toBeTruthy();
      expect(acc.allowPosting, `${op} → ${resolved} must be postable (not a group)`).toBe(true);
    }
  });

  // ── 4. الأعمدة الجديدة موجودة في fixed_assets ────────────────────────────
  it("fixed_assets تحتوي على الأعمدة الجديدة departmentId و costCenterId و accumulatedImpairment", async () => {
    const cols = await rawQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_name='fixed_assets'
           AND column_name IN ('departmentId','costCenterId','accumulatedImpairment')`,
      []);
    const names = cols.map((c) => c.column_name);
    expect(names).toContain("departmentId");
    expect(names).toContain("costCenterId");
    expect(names).toContain("accumulatedImpairment");
  });

  // ── 5. قيد الاستبعاد متوازن على التنصيب النظيف ───────────────────────────
  it("قيد استبعاد أصل بخسارة (بيع < قيمة دفترية) — متوازن على تنصيب نظيف", async () => {
    const [cashCode, lossCode, gainCode] = await Promise.all([
      resolve("asset_disposal_cash", "debit", "1100"),
      resolve("asset_disposal_loss", "debit", "5810"),
      resolve("asset_disposal_gain", "credit", "4920"),
    ]);
    // أصل بتكلفة 10000، مجمع إهلاك 6000، قيمة دفترية 4000، حصيلة بيع 2500
    // الخسارة = 2500 - 4000 = -1500
    const cost = 10000, accDep = 6000, proceeds = 2500;
    const bookValue = cost - accDep;
    const gainLoss = proceeds - bookValue;
    const accDepAcc = "1211"; // مجمع إهلاك المركبات (موجود في القالب)
    const assetAcc = "1210"; // المركبات (موجود في القالب)

    const lines: any[] = [
      { accountCode: cashCode, debit: proceeds, credit: 0, description: "حصيلة بيع" },
      { accountCode: accDepAcc, debit: accDep, credit: 0, description: "إلغاء مجمع إهلاك" },
      { accountCode: assetAcc, debit: 0, credit: cost, description: "إلغاء أصل ثابت" },
    ];
    if (gainLoss < 0) lines.push({ accountCode: lossCode, debit: Math.abs(gainLoss), credit: 0, description: "خسارة استبعاد" });
    else if (gainLoss > 0) lines.push({ accountCode: gainCode, debit: 0, credit: gainLoss, description: "ربح استبعاد" });

    const jid = await createJournalEntry(je("disp-loss", lines));
    expect(typeof jid).toBe("number");
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(Number(s.c));
    expect(Number(s.d)).toBe(10000);
  });

  it("قيد استبعاد أصل بربح (بيع > قيمة دفترية) — متوازن على تنصيب نظيف", async () => {
    const [cashCode, gainCode] = await Promise.all([
      resolve("asset_disposal_cash", "debit", "1100"),
      resolve("asset_disposal_gain", "credit", "4920"),
    ]);
    // أصل بتكلفة 5000، مجمع إهلاك 3000، قيمة دفترية 2000، حصيلة 2800 → ربح 800
    const lines = [
      { accountCode: cashCode, debit: 2800, credit: 0, description: "حصيلة بيع" },
      { accountCode: "1231", debit: 3000, credit: 0, description: "إلغاء مجمع إهلاك حاسبات" },
      { accountCode: "1230", debit: 0, credit: 5000, description: "إلغاء أصل" },
      { accountCode: gainCode, debit: 0, credit: 800, description: "ربح استبعاد" },
    ];
    const jid = await createJournalEntry(je("disp-gain", lines));
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(Number(s.c));
    expect(Number(s.d)).toBe(5800);
  });

  // ── 6. قيد هبوط القيمة متوازن ومستقل عن مجمع الإهلاك ────────────────────
  it("قيد هبوط القيمة (IAS 36) — متوازن، يُرحَّل على 5850/1291 لا 5995/1591", async () => {
    const [lossCode, accImpCode] = await Promise.all([
      resolve("asset_impairment_loss", "debit", "9999"),
      resolve("asset_accumulated_impairment", "credit", "9999"),
    ]);
    expect(lossCode).toBe("5850");
    expect(accImpCode).toBe("1291");

    const jid = await createJournalEntry(je("impair", [
      { accountCode: lossCode, debit: 3000, credit: 0, description: "خسارة انخفاض قيمة" },
      { accountCode: accImpCode, debit: 0, credit: 3000, description: "مجمع انخفاض قيمة" },
    ]));
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(Number(s.c));
    expect(Number(s.d)).toBe(3000);
  });

  // ── 7. قيد إعادة التقييم الصاعدة يستخدم 3600 لا 3300 ────────────────────
  it("إعادة التقييم الصاعدة — يُرحَّل على 3600 (فائض) لا 3300 (أرباح محتجزة)", async () => {
    const surplusCode = await resolve("asset_revaluation_surplus", "credit", "9999");
    expect(surplusCode).toBe("3600");

    const jid = await createJournalEntry(je("reval-up", [
      { accountCode: "1210", debit: 5000, credit: 0, description: "إعادة تقييم — زيادة" },
      { accountCode: surplusCode, debit: 0, credit: 5000, description: "فائض إعادة تقييم" },
    ]));
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(Number(s.c));
    expect(Number(s.d)).toBe(5000);
  });

  it("إعادة التقييم النازلة — يُرحَّل على 5860 لا 5996", async () => {
    const lossCode = await resolve("asset_revaluation_loss", "debit", "9999");
    expect(lossCode).toBe("5860");

    const jid = await createJournalEntry(je("reval-dn", [
      { accountCode: lossCode, debit: 2000, credit: 0, description: "خسارة إعادة تقييم" },
      { accountCode: "1210", debit: 0, credit: 2000, description: "إعادة تقييم — نقص" },
    ]));
    const [s] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [jid]);
    expect(Number(s.d)).toBe(Number(s.c));
    expect(Number(s.d)).toBe(2000);
  });

  // ── 8. الترحيل على حساب تجميعي مرفوض ────────────────────────────────────
  it("يرفض الترحيل على حساب تجميعي — 5800 (مصروفات أخرى) ليس postable", async () => {
    await expect(createJournalEntry(je("group-reject", [
      { accountCode: "5800", debit: 1000, credit: 0, description: "تجميعي — مرفوض" },
      { accountCode: "1210", debit: 0, credit: 1000, description: "أصل ثابت" },
    ]))).rejects.toThrow(/تجميعي|الحركة|posting|postable/i);
  });

  // ── 9. نقل الأصل يحفظ الفرع والقسم ومركز التكلفة في سجل الأصل ───────────
  it("fixed_assets تقبل قيم departmentId و costCenterId و accumulatedImpairment", async () => {
    await rawExecute(
      `INSERT INTO fixed_assets
         (code, name, "companyId", "branchId", "departmentId", "costCenterId",
          "purchaseDate", "purchaseCost", "currentBookValue",
          "depreciationMethod", "usefulLifeYears", "accumulatedImpairment",
          status, "assetAccountCode", "depreciationAccountCode", "accDepreciationAccountCode")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),10000,10000,'straight_line',5,0,'active','1210','6100','1211')`,
      [PFX + "dept-cc", "أصل تجريبي نقل", COMPANY, BRANCH, 1, 1]
    );

    const [row] = await rawQuery<{ departmentId: number | null; costCenterId: number | null; accumulatedImpairment: string }>(
      `SELECT "departmentId", "costCenterId", "accumulatedImpairment"
         FROM fixed_assets WHERE code=$1 AND "companyId"=$2`,
      [PFX + "dept-cc", COMPANY]);
    expect(row).toBeTruthy();
    expect(row.departmentId).toBe(1);
    expect(row.costCenterId).toBe(1);
    expect(Number(row.accumulatedImpairment)).toBe(0);
  });
});
