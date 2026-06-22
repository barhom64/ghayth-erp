// periodCloseOrphanSource.dynamic.test.ts
//
// B3 / #2874 — مانع إقفال الفترة "orphan_source" (قيود مُرحَّلة بلا مصدر).
//
// قرار إبراهيم: القيد اليتيم بالمصدر = مانع حاجب بصفر تسامح — وجود ≥1 قيد يتيم
// يرفض إقفال الفترة. هذا الاختبار assertion إلزامي على البوابة نفسها
// (closeFiscalPeriodCanonical) لا على رأي الوكيل:
//
//   (أ) فترة فيها قيد يتيم بالمصدر (آلي، sourceType=NULL، balancesApplied،
//       غير معكوس، نوع غير مستثنى، createdAt ضمن نطاق الفترة) →
//       collectPeriodCloseBlockers يتضمّن "orphan_source" و
//       closeFiscalPeriodCanonical يرمي ConflictError (الإقفال مرفوض).
//   (ب) بعد إزالة/تصحيح القيد (إعطاؤه مصدراً) → لا مانع "orphan_source"
//       والإقفال ينجح (open → closed).
//   (ج) قيد يدوي (isManual=true) أو معكوس (reversedById) أو من نوع مستثنى
//       (closing…) → لا يُحتسب مانعاً ولا يحجب الإقفال.
//
// Activation: يُتجاوَز تلقائياً (describe.skip) ما لم تشر DATABASE_URL إلى قاعدة
// الاختبار المخصّصة — نفس markers الذي تستخدمه بقية الـ*.dynamic.test.ts.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("B3 #2874 — period-close orphan_source blocker (zero tolerance)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let collectPeriodCloseBlockers: typeof import("../../src/lib/periodCloseCoordinator.js").collectPeriodCloseBlockers;
  let closeFiscalPeriodCanonical: typeof import("../../src/lib/fiscalPeriodLifecycle.js").closeFiscalPeriodCanonical;
  let ConflictError: typeof import("../../src/lib/errorHandler.js").ConflictError;

  let companyId: number;
  let branchId: number;
  let assignmentId: number;
  let userId: number;

  // فترة الاختبار: مارس 2025. createdAt للقيود يقع داخلها.
  const PERIOD = { startDate: "2025-03-01", endDate: "2025-03-31" };
  const IN_PERIOD_TS = "2025-03-15T10:00:00Z";

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawExecute = rawdb.rawExecute;
    rawQuery = rawdb.rawQuery;
    const coord = await import("../../src/lib/periodCloseCoordinator.js");
    collectPeriodCloseBlockers = coord.collectPeriodCloseBlockers;
    const lifecycle = await import("../../src/lib/fiscalPeriodLifecycle.js");
    closeFiscalPeriodCanonical = lifecycle.closeFiscalPeriodCanonical;
    const errorHandler = await import("../../src/lib/errorHandler.js");
    ConflictError = errorHandler.ConflictError;

    // Clear any financial_periods left by a PRIOR run of this suite BEFORE the
    // fixture truncates employee_assignments: a closed period stamps
    // closedBy → employee_assignments (FK), which would otherwise block the
    // fixture's assignment teardown. Scoped to the fixture companies only.
    await rawExecute(
      `DELETE FROM financial_periods WHERE "companyId" IN
         (SELECT id FROM companies WHERE name = ANY($1))`,
      [["Test Company A", "Test Company B"]]
    );

    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    const fx = await setupTwoCompanyFixture();
    companyId = fx.companyA.id;
    branchId = fx.companyA.branchId;
    assignmentId = fx.companyA.assignmentId;
    userId = fx.companyA.userId;
  });

  beforeEach(async () => {
    // نظّف الصفوف التي يلمسها هذا الاختبار. journal_lines مرتبطة بأبيها فقط.
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1)`,
      [companyId]
    );
    await rawExecute(`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]);
  });

  // قيد مُرحَّل (balancesApplied=true). الافتراضات قابلة للضبط لتغطية
  // الحالات (أ)/(ج). createdAt يقع داخل الفترة دائماً (هو عمود النافذة).
  async function insertPostedEntry(opts: {
    ref: string;
    isManual?: boolean;
    type?: string;
    withSource?: boolean;
    reversed?: boolean;
  }): Promise<number> {
    const isManual = opts.isManual ?? false;
    const type = opts.type ?? "system";
    const sourceType = opts.withSource ? "invoice" : null;
    const sourceId = opts.withSource ? 1 : null;
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries (
         "companyId", "branchId", "createdBy", ref, description, type,
         "isManual", "balancesApplied", "sourceType", "sourceId",
         "createdAt", date
       ) VALUES ($1, $2, $3, $4, 'b3-orphan-test', $5,
                 $6, true, $7, $8, $9::timestamptz, '2025-03-15'::date)`,
      [companyId, branchId, assignmentId, opts.ref, type, isManual, sourceType, sourceId, IN_PERIOD_TS]
    );
    await rawExecute(
      `INSERT INTO journal_lines ("journalId", "accountCode", debit, credit)
       VALUES ($1, '1101', 100, 0), ($1, '4101', 0, 100)`,
      [insertId]
    );
    // قيد معكوس: نشير إليه عبر reversedById لقيد لاحق (يكفي ضبط reversedById≠NULL).
    if (opts.reversed) {
      await rawExecute(
        `UPDATE journal_entries SET "reversedById" = $2 WHERE id = $1`,
        [insertId, insertId]
      );
    }
    return insertId;
  }

  async function insertOpenPeriod(): Promise<number> {
    const { insertId } = await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'مارس 2025', $2, $3, 'open')`,
      [companyId, PERIOD.startDate, PERIOD.endDate]
    );
    return insertId;
  }

  function scope() {
    return { companyId, branchId, userId, activeAssignmentId: assignmentId };
  }

  it("(أ) قيد يتيم بالمصدر → مانع orphan_source + الإقفال مرفوض (ConflictError)", async () => {
    const periodId = await insertOpenPeriod();
    await insertPostedEntry({ ref: "JE-ORPHAN-1" }); // آلي، بلا مصدر، نوع غير مستثنى

    const blockers = await collectPeriodCloseBlockers({ companyId, period: PERIOD });
    expect(blockers.map((b) => b.type)).toContain("orphan_source");

    await expect(
      closeFiscalPeriodCanonical({ periodId, scope: scope() })
    ).rejects.toBeInstanceOf(ConflictError);

    // الفترة بقيت مفتوحة (لم تُقفل).
    const [p] = await rawQuery<{ status: string }>(
      `SELECT status FROM financial_periods WHERE id=$1`,
      [periodId]
    );
    expect(p.status).toBe("open");
  });

  it("(ب) بعد ربط القيد بمصدر (فترة نظيفة) → لا مانع orphan_source والإقفال ينجح", async () => {
    const periodId = await insertOpenPeriod();
    // قيد مُرحَّل لكنه يحمل مصدراً → ليس يتيماً.
    await insertPostedEntry({ ref: "JE-SOURCED-1", withSource: true });

    const blockers = await collectPeriodCloseBlockers({ companyId, period: PERIOD });
    expect(blockers.map((b) => b.type)).not.toContain("orphan_source");
    expect(blockers).toEqual([]);

    const result = await closeFiscalPeriodCanonical({ periodId, scope: scope() });
    expect(result.status).toBe("closed");

    const [p] = await rawQuery<{ status: string }>(
      `SELECT status FROM financial_periods WHERE id=$1`,
      [periodId]
    );
    expect(p.status).toBe("closed");
  });

  it("(ج) قيد يدوي / معكوس / نوع مستثنى → لا يُحتسب مانعاً ولا يحجب الإقفال", async () => {
    const periodId = await insertOpenPeriod();
    // يدوي بلا مصدر → يُستبعد بشرط isManual=false.
    await insertPostedEntry({ ref: "JE-MANUAL", isManual: true });
    // معكوس بلا مصدر → يُستبعد بشرط reversedById IS NULL.
    await insertPostedEntry({ ref: "JE-REVERSED", reversed: true });
    // نوع مستثنى (closing) بلا مصدر → يُستبعد بقائمة الأنواع المستثناة.
    await insertPostedEntry({ ref: "JE-CLOSING", type: "closing" });

    const blockers = await collectPeriodCloseBlockers({ companyId, period: PERIOD });
    expect(blockers.map((b) => b.type)).not.toContain("orphan_source");

    // ملاحظة: القيد اليدوي قد يُلتقط بمانع آخر (manual_no_reason) فقط إن كان مرتبطاً
    // تشغيلياً — وهنا أسطره على حسابات عامة بلا أبعاد، فلا يُحتسب. نؤكد أن أي مانع
    // قائم ليس من نوع orphan_source.
    const orphan = blockers.filter((b) => b.type === "orphan_source");
    expect(orphan).toHaveLength(0);

    const result = await closeFiscalPeriodCanonical({ periodId, scope: scope() });
    expect(result.status).toBe("closed");
  });
});
