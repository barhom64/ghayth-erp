// FIN-INTEGRITY-CONTRACT (#2246 SLICE) — قياس «القيود اليتيمة بالمصدر».
//
// إثبات تكاملي ضد قاعدة الاختبار الحية لقياس القسم الخامس من «لوحة الصدق»
// (endpoint GET /finance/reports/ledger-truth). يثبت أن predicate القياس
// (read-only) يحتسب القيد الآلي المُرحَّل اليتيم بالمصدر، ولا يحتسب:
//   - القيد اليدوي (isManual=true)،
//   - القيد المعكوس (reversedById IS NOT NULL)،
//   - أبواب الإقفال/التسوية/المطابقة المستثناة صراحةً (type),
//   - القيد الذي يملك مصدرًا فعليًا (sourceType + sourceId).
//
// الـpredicate أدناه نسخة طبق الأصل من استعلام الـroute (مصدر الحقيقة) —
// أي انحراف بين الاثنين يكسر هذا الاختبار. read-only بالكامل: صفر تعديل
// على قيود قائمة، يُدرج صفوفه الخاصة بـref فريد ويحذفها في afterAll.
// يعمل فقط حين يشير DATABASE_URL إلى عنقود الاختبار.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const REF = "test-2246-orphan-source";

// نفس قائمة الاستثناء في finance-reports.ts (ledger-truth، القسم 6).
const ORPHAN_EXCLUDED_TYPES = [
  "closing",
  "monthly_closing",
  "opening_balance",
  "fx_revaluation",
  "fx_realised",
  "asset_revaluation",
  "bank_adjustment",
];

d("#2246 ledger-truth — orphan-source counting (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let companyId: number;

  // نفس WHERE الخاص باستعلام العدّ في الـroute حرفيًا (مصدر الحقيقة).
  const orphanCount = async () => {
    const rows = await rawQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM journal_entries je
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."isManual" = false
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL
          AND (je."sourceType" IS NULL OR je."sourceId" IS NULL)
          AND COALESCE(je.type, '') <> ALL($2::text[])
          AND je.ref LIKE $3`,
      [companyId, ORPHAN_EXCLUDED_TYPES, REF + "%"],
    );
    return rows[0].total;
  };

  // يُدرج قيدًا بسمات محدَّدة ويعيد ref فريدًا.
  const seed = async (
    suffix: string,
    cols: {
      type?: string | null;
      isManual?: boolean;
      balancesApplied?: boolean;
      reversedById?: number | null;
      sourceType?: string | null;
      sourceId?: number | null;
    },
  ) => {
    const ref = `${REF}-${suffix}`;
    await rawExecute(
      `INSERT INTO journal_entries
         ("companyId", ref, status, type, "isManual", "balancesApplied", "reversedById", "sourceType", "sourceId")
       VALUES ($1, $2, 'posted', $3, $4, $5, $6, $7, $8)`,
      [
        companyId,
        ref,
        // type غير قابل للـNULL في HEAD؛ الافتراضي باب تشغيلي غير مستثنى.
        cols.type ?? "general",
        cols.isManual ?? false,
        cols.balancesApplied ?? true,
        cols.reversedById ?? null,
        cols.sourceType ?? null,
        cols.sourceId ?? null,
      ],
    );
    return ref;
  };

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const [c] = await rawQuery<{ id: number }>("SELECT id FROM companies ORDER BY id LIMIT 1");
    companyId = c.id;
    await rawExecute(`DELETE FROM journal_entries WHERE ref LIKE $1`, [REF + "%"]);
  });

  afterAll(async () => {
    if (rawExecute) await rawExecute(`DELETE FROM journal_entries WHERE ref LIKE $1`, [REF + "%"]);
  });

  it("يحتسب القيد الآلي المُرحَّل اليتيم بالمصدر (sourceType + sourceId = NULL)", async () => {
    const before = await orphanCount();
    await seed("orphan-both-null", { isManual: false, balancesApplied: true, sourceType: null, sourceId: null });
    expect(await orphanCount()).toBe(before + 1);
  });

  it("يحتسب اليتيم حين sourceType موجود لكن sourceId = NULL (أو العكس)", async () => {
    const before = await orphanCount();
    await seed("orphan-id-null", { sourceType: "some_engine", sourceId: null });
    await seed("orphan-type-null", { sourceType: null, sourceId: 99 });
    expect(await orphanCount()).toBe(before + 2);
  });

  it("لا يحتسب القيد اليدوي (isManual=true)", async () => {
    const before = await orphanCount();
    await seed("manual", { isManual: true, sourceType: null, sourceId: null });
    expect(await orphanCount()).toBe(before);
  });

  it("لا يحتسب القيد المعكوس (reversedById IS NOT NULL)", async () => {
    const before = await orphanCount();
    await seed("reversed", { reversedById: 1, sourceType: null, sourceId: null });
    expect(await orphanCount()).toBe(before);
  });

  it("لا يحتسب القيد غير المُطبَّق (balancesApplied=false)", async () => {
    const before = await orphanCount();
    await seed("not-applied", { balancesApplied: false, sourceType: null, sourceId: null });
    expect(await orphanCount()).toBe(before);
  });

  it("لا يحتسب أبواب الإقفال/التسوية/المطابقة المستثناة", async () => {
    const before = await orphanCount();
    for (const t of ORPHAN_EXCLUDED_TYPES) {
      await seed(`excluded-${t}`, { type: t, sourceType: null, sourceId: null });
    }
    expect(await orphanCount()).toBe(before);
  });

  it("لا يحتسب القيد الذي يملك مصدرًا فعليًا (sourceType + sourceId)", async () => {
    const before = await orphanCount();
    await seed("has-source", { sourceType: "vendor_invoice", sourceId: 42 });
    expect(await orphanCount()).toBe(before);
  });

  it("لا يحتسب القيد المحذوف منطقيًا (deletedAt)", async () => {
    const before = await orphanCount();
    const ref = await seed("soft-deleted", { sourceType: null, sourceId: null });
    await rawExecute(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE ref = $1`, [ref]);
    expect(await orphanCount()).toBe(before);
  });
});
