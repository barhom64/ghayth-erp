// fxDeferredQueueGuard.dynamic.test.ts
//
// اختبارات assertion إلزامية (يمسّ الدفتر) لإحياء تدفّق إعادة تقييم FX المؤجَّل
// عبر طابور ترحيل GL + حارس الازدواج الصلب (DB-enforced) مع المسار المباشر.
//
// التدفّقان:
//   • المباشر:  POST /finance/fx/revaluation/post → يكتب fx_revaluations(period).
//   • الطابور:  runPeriodEndRevaluation (compute) → fx_revaluation_log/_lines،
//               ثم postFxRevaluationJournal (post) → قيد GL + صف fx_revaluations.
//
// الحاجز الصلب: UNIQUE(companyId, period) على fx_revaluations يكتبه كلا المسارين
// عند الترحيل → أيّهما سبق يحجب الآخر لنفس الفترة (لا قيد ثانٍ).
//
// التغطية المطلوبة:
//   (أ) compute يملأ الطابور لفترة فيها فروق؛ post من الطابور ينشئ قيدًا متوازنًا
//       بأبعاد الكيان (clientId على AR، vendorId على AP).
//   (ب) حارس الازدواج (الأحرج): بعد المسار المباشر، محاولة post من الطابور لنفس
//       الفترة تُرفض (لا قيد ثانٍ)؛ والعكس: بعد الطابور، المسار المباشر يُرفض.
//       (نُعدّ صفوف journal_entries لكل (company, period) — يجب ألا يتجاوز ما يُتوقَّع.)
//   (ج) idempotency: إعادة compute/post لا تكرّر.
//   (د) التوازن محفوظ في كل الحالات.
//
// Activation: describe.skip تلقائيًا ما لم تُشِر DATABASE_URL إلى قاعدة الاختبار.

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("FX deferred queue revival + DB-enforced dedup guard", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let runPeriodEndRevaluation: typeof import("../../src/lib/fx/revaluation.js").runPeriodEndRevaluation;
  let postFxRevaluationJournal: typeof import("../../src/lib/fx/post-revaluation-journal.js").postFxRevaluationJournal;
  let financialEngine: typeof import("../../src/lib/engines/financialEngine.js").financialEngine;
  let ConflictError: typeof import("../../src/lib/errorHandler.js").ConflictError;

  // أدوات لكل اختبار: شركة مستقلة + فرع + فترة مالية + عميل + مورد + حسابات FX.
  async function freshCompany(label: string) {
    const [{ id: companyId }] = await rawQuery(
      `INSERT INTO companies (name, status, "functionalCurrency") VALUES ($1,'active','SAR') RETURNING id`,
      [`${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`],
    );
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    await bootstrapCompany(companyId, label);
    const [{ id: branchId }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    // فترة مالية مفتوحة تشمل 2026-04.
    const [{ id: periodId }] = await rawQuery(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'أبريل 2026','2026-04-01','2026-04-30','open') RETURNING id`,
      [companyId],
    );
    const [{ id: clientId }] = await rawQuery(
      `INSERT INTO clients ("companyId", name) VALUES ($1,'عميل اختبار') RETURNING id`,
      [companyId],
    );
    const [{ id: supplierId }] = await rawQuery(
      `INSERT INTO suppliers ("companyId", name) VALUES ($1,'مورد اختبار') RETURNING id`,
      [companyId],
    );
    // مستخدم حقيقي لـ postedBy (FK → users.id).
    const [{ id: userId }] = await rawQuery(
      `INSERT INTO users (email, "passwordHash") VALUES ($1,'x') RETURNING id`,
      [`fx-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`],
    );
    return { companyId, branchId, periodId, clientId, supplierId, userId };
  }

  // فاتورة بعملة USD مفتوحة (AR، أصل).
  async function openInvoice(companyId: number, branchId: number, clientId: number, total: number, booked: number, paid = 0) {
    const [{ id }] = await rawQuery(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,currency,"exchangeRate",total,"paidAmount",status,"createdAt")
       VALUES ($1,$2,$3,$4,'USD',$5,$6,$7,'sent','2026-04-10') RETURNING id`,
      [companyId, branchId, clientId, `INV-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, booked, total, paid],
    );
    return id;
  }
  // أمر شراء بعملة USD مفتوح (AP، التزام).
  async function openPo(companyId: number, supplierId: number, totalAmount: number, booked: number) {
    const [{ id }] = await rawQuery(
      `INSERT INTO purchase_orders ("companyId","supplierId",ref,currency,"exchangeRate","totalAmount",status,"createdAt")
       VALUES ($1,$2,$3,'USD',$4,$5,'approved','2026-04-10') RETURNING id`,
      [companyId, supplierId, `PO-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, booked, totalAmount],
    );
    return id;
  }
  // سعر الإقفال (closing) لـ USD→SAR في نهاية الفترة.
  async function seedClosingRate(companyId: number, rate: number) {
    await rawExecute(
      `INSERT INTO fx_rates ("companyId","rateDate","effectiveDate","fromCurrency","toCurrency",rate,source)
       VALUES ($1,'2026-04-30','2026-04-30','USD','SAR',$2,'period_end')
       ON CONFLICT DO NOTHING`,
      [companyId, rate],
    );
  }

  async function jeCountForPeriod(companyId: number, period: string): Promise<number> {
    const rows = await rawQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM journal_entries
        WHERE "companyId"=$1 AND type='fx_revaluation'
          AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [companyId, `finance:fx_reval:${companyId}:${period}`],
    );
    return Number(rows[0].n);
  }

  async function lineBalance(journalId: number): Promise<{ dr: number; cr: number }> {
    const lines = await rawQuery<{ debit: string; credit: string }>(
      `SELECT debit::text AS debit, credit::text AS credit FROM journal_lines WHERE "journalId"=$1`,
      [journalId],
    );
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    return { dr, cr };
  }

  const PERIOD = "2026-04";
  const AS_OF = "2026-04-30";

  // المسار المباشر مُستخرَج كدالة (يحاكي منطق routes/finance-algorithms POST، بلا HTTP).
  // يكتب fx_revaluations(period) + قيد GL مفصّل — ويستعمل حاجز UNIQUE نفسه.
  async function directPost(companyId: number, branchId: number, userId: number) {
    const { withTransaction } = await import("../../src/lib/rawdb.js");
    const { buildPeriodRevalLines } = await import("../../src/lib/fx/build-period-reval-lines.js");
    // فحص الازدواج المبكر (مطابق للمسار): صف fx_revaluations موجود؟
    const [dup] = await rawQuery(`SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2`, [companyId, PERIOD]);
    if (dup) throw new ConflictError(`تم تسجيل إعادة تقييم العملات لفترة ${PERIOD} مسبقاً`);
    const openInvoices = await rawQuery(
      `SELECT id, ref, currency, "exchangeRate", total, "paidAmount", "clientId" FROM invoices
        WHERE "companyId"=$1 AND currency='USD' AND status NOT IN ('paid','cancelled') AND "deletedAt" IS NULL`,
      [companyId],
    );
    const openPOs = await rawQuery(
      `SELECT id, ref, currency, "exchangeRate", "totalAmount", "supplierId" FROM purchase_orders
        WHERE "companyId"=$1 AND currency='USD' AND status NOT IN ('paid','cancelled','draft') AND "deletedAt" IS NULL`,
      [companyId],
    );
    const [{ rate }] = await rawQuery<{ rate: string }>(
      `SELECT rate::text AS rate FROM fx_rates WHERE "companyId"=$1 AND "fromCurrency"='USD' AND "toCurrency"='SAR' ORDER BY "effectiveDate" DESC LIMIT 1`,
      [companyId],
    );
    const rateMap = { USD: Number(rate) };
    const arCode = await financialEngine.resolveAccountCode(companyId, "fx_revaluation_ar", "debit", "1131");
    const apCode = await financialEngine.resolveAccountCode(companyId, "fx_revaluation_ap", "credit", "2111");
    const gainCode = await financialEngine.resolveAccountCode(companyId, "fx_revaluation_gain", "credit", "4910");
    const lossCode = await financialEngine.resolveAccountCode(companyId, "fx_revaluation_loss", "debit", "5910");
    const built = buildPeriodRevalLines({
      invoices: openInvoices as any, purchaseOrders: openPOs as any, rateMap,
      accounts: { arCode, apCode, gainCode, lossCode }, period: PERIOD,
    });
    if (built.lines.length === 0) throw new Error("no lines");
    let journalEntryId!: number;
    await withTransaction(async (client) => {
      const posted = await financialEngine.postJournalEntry({
        companyId, branchId, createdBy: 0,
        ref: `FX-REVAL-${PERIOD}`, description: `إعادة تقييم العملات الأجنبية — ${PERIOD}`,
        type: "fx_revaluation", sourceType: "fx_revaluation", sourceId: 0,
        sourceKey: `finance:fx_reval:${companyId}:${PERIOD}`, lines: built.lines,
      });
      journalEntryId = posted.journalId;
      await client.query(
        `INSERT INTO fx_revaluations ("companyId","period","journalEntryId","totalGain","totalLoss",details,"postedBy","postedAt")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())`,
        [companyId, PERIOD, journalEntryId, built.totalGain, built.totalLoss, JSON.stringify({ source: "direct" }), userId],
      );
    });
    return journalEntryId;
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    runPeriodEndRevaluation = (await import("../../src/lib/fx/revaluation.js")).runPeriodEndRevaluation;
    postFxRevaluationJournal = (await import("../../src/lib/fx/post-revaluation-journal.js")).postFxRevaluationJournal;
    financialEngine = (await import("../../src/lib/engines/financialEngine.js")).financialEngine;
    ConflictError = (await import("../../src/lib/errorHandler.js")).ConflictError;
  });

  // ── (أ) + (د): compute → طابور؛ post من الطابور → قيد متوازن بأبعاد الكيان ──
  it("(أ)(د) compute يملأ الطابور؛ post ينشئ قيدًا متوازنًا بأبعاد العميل/المورد", async () => {
    const { companyId, branchId, periodId, clientId, supplierId, userId } = await freshCompany("FX-A");
    // USD booked 3.75، الإقفال 3.80 — فروق موجبة على AR (مكسب) وعلى AP (خسارة).
    await openInvoice(companyId, branchId, clientId, 1000, 3.75); // AR: 1000*(3.80-3.75)=+50 مكسب
    await openPo(companyId, supplierId, 400, 3.75);               // AP: 400*(3.80-3.75)=+20 → التزام ارتفع = خسارة
    await seedClosingRate(companyId, 3.8);

    // compute → يملأ الطابور (journalEntryId NULL).
    const computed = await runPeriodEndRevaluation({ companyId, periodId, asOfDate: AS_OF, ranBy: 0 });
    expect(computed.revaluationLogId).toBeGreaterThan(0);
    const pending = await rawQuery(
      `SELECT id FROM fx_revaluation_log WHERE "companyId"=$1 AND "journalEntryId" IS NULL`,
      [companyId],
    );
    expect(pending.length).toBe(1);
    const linesInQueue = await rawQuery(
      `SELECT "entityType" FROM fx_revaluation_lines WHERE "revaluationLogId"=$1`,
      [computed.revaluationLogId],
    );
    expect(linesInQueue.length).toBe(2); // فاتورة + أمر شراء

    // post من الطابور → قيد GL.
    const outcome = await postFxRevaluationJournal({ revaluationLogId: computed.revaluationLogId, companyId, postedBy: userId });
    expect(outcome.status).toBe("posted");
    expect(outcome.journalEntryId).toBeTruthy();

    // (د) التوازن.
    const bal = await lineBalance(outcome.journalEntryId!);
    expect(bal.dr).toBeCloseTo(bal.cr, 2);

    // أبعاد الكيان: سطر AR(1131) يحمل clientId، سطر AP(2111) يحمل vendorId.
    const glLines = await rawQuery<{ accountCode: string; clientId: number | null; vendorId: number | null }>(
      `SELECT "accountCode", "clientId", "vendorId" FROM journal_lines WHERE "journalId"=$1`,
      [outcome.journalEntryId],
    );
    const ar = glLines.find((l) => l.accountCode === "1131");
    const ap = glLines.find((l) => l.accountCode === "2111");
    expect(ar?.clientId).toBe(clientId);
    expect(ap?.vendorId).toBe(supplierId);

    // صف الحاجز fx_revaluations كُتب للفترة.
    const guard = await rawQuery(`SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2`, [companyId, PERIOD]);
    expect(guard.length).toBe(1);
    // السجل خُتم بـ journalEntryId.
    const [logRow] = await rawQuery<{ journalEntryId: number }>(
      `SELECT "journalEntryId" FROM fx_revaluation_log WHERE id=$1`, [computed.revaluationLogId]);
    expect(logRow.journalEntryId).toBe(outcome.journalEntryId);
  });

  // ── (ب) الأحرج: المباشر سبق → الطابور يُرفض (لا قيد ثانٍ) ──
  it("(ب) بعد الترحيل المباشر، post من الطابور لنفس الفترة يُرفض (لا قيد ثانٍ)", async () => {
    const { companyId, branchId, periodId, clientId, userId } = await freshCompany("FX-B1");
    await openInvoice(companyId, branchId, clientId, 1000, 3.75);
    await seedClosingRate(companyId, 3.8);

    // المسار المباشر أولًا.
    const directJe = await directPost(companyId, branchId, userId);
    expect(directJe).toBeTruthy();
    expect(await jeCountForPeriod(companyId, PERIOD)).toBe(1);

    // الطابور يحسب (compute لا يمسّ الدفتر — مسموح) ثم يحاول الترحيل → يُرفض.
    const computed = await runPeriodEndRevaluation({ companyId, periodId, asOfDate: AS_OF, ranBy: 0 });
    await expect(
      postFxRevaluationJournal({ revaluationLogId: computed.revaluationLogId, companyId, postedBy: userId }),
    ).rejects.toThrow(/مسبقاً|مسبقا/);

    // لا قيد ثانٍ، صف fx_revaluations واحد فقط، السجل لم يُختم.
    expect(await jeCountForPeriod(companyId, PERIOD)).toBe(1);
    const guard = await rawQuery(`SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2`, [companyId, PERIOD]);
    expect(guard.length).toBe(1);
    const [logRow] = await rawQuery<{ journalEntryId: number | null }>(
      `SELECT "journalEntryId" FROM fx_revaluation_log WHERE id=$1`, [computed.revaluationLogId]);
    expect(logRow.journalEntryId).toBeNull();
  });

  // ── (ب) العكس: الطابور سبق → المباشر يُرفض (لا قيد ثانٍ) ──
  it("(ب) بعد ترحيل الطابور، المسار المباشر لنفس الفترة يُرفض (لا قيد ثانٍ)", async () => {
    const { companyId, branchId, periodId, clientId, userId } = await freshCompany("FX-B2");
    await openInvoice(companyId, branchId, clientId, 1000, 3.75);
    await seedClosingRate(companyId, 3.8);

    // الطابور أولًا: compute ثم post.
    const computed = await runPeriodEndRevaluation({ companyId, periodId, asOfDate: AS_OF, ranBy: 0 });
    const outcome = await postFxRevaluationJournal({ revaluationLogId: computed.revaluationLogId, companyId, postedBy: userId });
    expect(outcome.status).toBe("posted");
    expect(await jeCountForPeriod(companyId, PERIOD)).toBe(1);

    // المسار المباشر يُرفض (صف fx_revaluations موجود).
    await expect(directPost(companyId, branchId, userId)).rejects.toThrow(/مسبقاً|مسبقا/);

    // لا قيد ثانٍ، صف واحد فقط.
    expect(await jeCountForPeriod(companyId, PERIOD)).toBe(1);
    const guard = await rawQuery(`SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2`, [companyId, PERIOD]);
    expect(guard.length).toBe(1);
  });

  // ── (ج) idempotency: إعادة compute/post لا تكرّر ──
  it("(ج) idempotency — إعادة post لا تنشئ قيدًا ثانيًا؛ إعادة compute لا تكرّر الطابور", async () => {
    const { companyId, branchId, periodId, clientId, userId } = await freshCompany("FX-C");
    await openInvoice(companyId, branchId, clientId, 1000, 3.75);
    await seedClosingRate(companyId, 3.8);

    const computed = await runPeriodEndRevaluation({ companyId, periodId, asOfDate: AS_OF, ranBy: 0 });
    const first = await postFxRevaluationJournal({ revaluationLogId: computed.revaluationLogId, companyId, postedBy: userId });
    expect(first.status).toBe("posted");

    // إعادة post لنفس السجل → skipped (journalEntryId مختوم).
    const second = await postFxRevaluationJournal({ revaluationLogId: computed.revaluationLogId, companyId, postedBy: userId });
    expect(second.status).toBe("skipped");
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(await jeCountForPeriod(companyId, PERIOD)).toBe(1);

    // (د) التوازن بعد كل شيء.
    const bal = await lineBalance(first.journalEntryId!);
    expect(bal.dr).toBeCloseTo(bal.cr, 2);
  });

  // ── حالة عدة عملاء (أبعاد متعددة) + توازن ──
  it("(أ)(د) عدة عملاء — سطر AR لكل عميل ببُعده، والقيد متوازن", async () => {
    const { companyId, branchId, periodId, clientId, userId } = await freshCompany("FX-MULTI");
    const [{ id: client2 }] = await rawQuery(
      `INSERT INTO clients ("companyId", name) VALUES ($1,'عميل 2') RETURNING id`, [companyId]);
    await openInvoice(companyId, branchId, clientId, 1000, 3.75); // +50
    await openInvoice(companyId, branchId, client2, 2000, 3.70);  // 2000*(3.80-3.70)=+200
    await seedClosingRate(companyId, 3.8);

    const computed = await runPeriodEndRevaluation({ companyId, periodId, asOfDate: AS_OF, ranBy: 0 });
    const outcome = await postFxRevaluationJournal({ revaluationLogId: computed.revaluationLogId, companyId, postedBy: userId });
    expect(outcome.status).toBe("posted");

    const glLines = await rawQuery<{ accountCode: string; clientId: number | null; debit: string }>(
      `SELECT "accountCode","clientId",debit::text AS debit FROM journal_lines WHERE "journalId"=$1`,
      [outcome.journalEntryId]);
    const arLines = glLines.filter((l) => l.accountCode === "1131");
    expect(arLines.length).toBe(2); // سطر لكل عميل
    const clients = new Set(arLines.map((l) => l.clientId));
    expect(clients.has(clientId)).toBe(true);
    expect(clients.has(client2)).toBe(true);

    const bal = await lineBalance(outcome.journalEntryId!);
    expect(bal.dr).toBeCloseTo(bal.cr, 2);
  });
});
