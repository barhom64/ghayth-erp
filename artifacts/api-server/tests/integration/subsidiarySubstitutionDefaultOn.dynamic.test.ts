// البند ٤ (إذن إبراهيم «نعم حساب خاص») — «حساب خاص لكل كيان» مُفعَّل افتراضيًّا.
//
// الدستور م٣: تغييرٌ يمسّ الدفتر يُشحن مع assertion. هذا يثبت أن استبدال الحساب
// الفرعي للكيان يحدث **افتراضيًّا بلا أي إعداد** (default-on): سطرٌ على حساب التحكّم
// الأب يحمل بُعد كيانٍ له حساب فرعي → يُبدَّل تلقائيًّا لحساب الكيان الفرعي. ويُعطَّل
// فقط بإيقاف صريح لكل شركة (gl_subsidiary_substitution='false') — مخرج الشركات القائمة.
// التجميع على شجرة الحسابات (الأب) لا يتأثّر.
//
// يُفعَّل فقط حين يشير DATABASE_URL لعنقود الاختبار؛ يُتخطّى محليًّا.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Subsidiary substitution is ON by default (per-entity GL account, opt-out only)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let createSubsidiaryAccountsForEntity: typeof import("../../src/routes/accounting-engine.js").createSubsidiaryAccountsForEntity;
  let substituteSubsidiaryAccountCodes: typeof import("../../src/lib/journalLineDimensionalEnricher.js").substituteSubsidiaryAccountCodes;
  let _resetSubsidiarySubstitutionCache: typeof import("../../src/lib/journalLineDimensionalEnricher.js")._resetSubsidiarySubstitutionCache;

  let companyId: number;
  let vehicleId: number;
  let parentCode: string; // the control parent (e.g. 5520 صيانة المركبات)
  let subCode: string;    // the per-vehicle subsidiary leaf (e.g. 5520-0001)

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    withTransaction = rawdb.withTransaction;
    ({ createSubsidiaryAccountsForEntity } = await import("../../src/routes/accounting-engine.js"));
    ({ substituteSubsidiaryAccountCodes, _resetSubsidiarySubstitutionCache } = await import("../../src/lib/journalLineDimensionalEnricher.js"));
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    // شركة جديدة تمامًا ⇒ لا إعداد gl_subsidiary_substitution ⇒ يُختبَر الافتراض.
    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`SubDefault Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "SubDefault Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);

    const [{ id: vid }] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_vehicles ("companyId","branchId",make,model,"plateNumber",status)
       VALUES ($1,$2,'Test','Sub','test-b4-subdef-0001','active') RETURNING id`,
      [companyId, bid]);
    vehicleId = vid;

    // افتح حسابات المركبة الفرعية (محروقات/صيانة/إهلاك تحت أبٍ متخصّص لكل لوحة).
    await createSubsidiaryAccountsForEntity(companyId, "vehicle", vehicleId, "test-b4-subdef");

    // اقرأ حسابًا فرعيًّا فعليًّا + كود أبيه (بلا افتراض كود ثابت).
    const [row] = await rawQuery<{ subCode: string; parentCode: string }>(
      `SELECT child.code AS "subCode", parent.code AS "parentCode"
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts child ON child.id = sa."accountId"
         JOIN chart_of_accounts parent ON parent.id = child."parentId"
        WHERE sa."companyId"=$1 AND sa."entityType"='vehicle' AND sa."entityId"=$2 AND sa."isActive"=true
        ORDER BY child.code ASC LIMIT 1`,
      [companyId, vehicleId]);
    expect(row, "vehicle subsidiary account must have been created").toBeTruthy();
    parentCode = row.parentCode;
    subCode = row.subCode;
  });

  afterAll(async () => {
    if (!rawExecute) return;
    await rawExecute(`DELETE FROM system_settings WHERE "companyId"=$1 AND key='gl_subsidiary_substitution'`, [companyId]);
  });

  it("DEFAULT-ON: a line on the control parent with vehicleId is swapped to the per-vehicle subsidiary (no setting)", async () => {
    await rawExecute(`DELETE FROM system_settings WHERE "companyId"=$1 AND key='gl_subsidiary_substitution'`, [companyId]);
    _resetSubsidiarySubstitutionCache();
    const line: { accountCode: string; vehicleId: number } = { accountCode: parentCode, vehicleId };
    await withTransaction(async (client) => {
      await substituteSubsidiaryAccountCodes(client, [line], companyId);
    });
    // بلا أي إعداد ⇒ يُبدَّل الأب بحساب المركبة الفرعي تلقائيًّا.
    expect(line.accountCode).toBe(subCode);
    expect(line.accountCode).not.toBe(parentCode);
  });

  it("OPT-OUT: gl_subsidiary_substitution='false' keeps the control parent code (escape hatch)", async () => {
    await rawExecute(
      `INSERT INTO system_settings (key, value, "companyId", "branchId")
       VALUES ('gl_subsidiary_substitution','false',$1,NULL)`, [companyId]);
    _resetSubsidiarySubstitutionCache();
    const line: { accountCode: string; vehicleId: number } = { accountCode: parentCode, vehicleId };
    await withTransaction(async (client) => {
      await substituteSubsidiaryAccountCodes(client, [line], companyId);
    });
    expect(line.accountCode).toBe(parentCode); // لم يُبدَّل — الشركة أوقفته صراحةً.
  });
});
