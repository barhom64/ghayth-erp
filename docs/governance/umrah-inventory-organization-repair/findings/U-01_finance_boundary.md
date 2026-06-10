# U-01 — تقرير فحص قفل الحدود المالية داخل مسار العمرة

> **PR وثائقي + smoke test يجمّد الحالة. صفر تغيير كود إنتاج.**
>
> **المهمة:** [U-01 من #2080](https://github.com/barhom64/ghayth-erp/issues/2080) — أول مهمة في الموجة الأولى المعتمدة.
> **القاعدة:** *العمرة لا تكتب قيوداً خارج engine المالية* (Service Boundary Lock، #1870 + #2071).
> **النطاق:** routes العمرة (`routes/umrah.ts` + `routes/umrah-entities.ts`) + صفحات `pages/umrah/**`. لا فحص خارج العمرة.

## ١. النتيجة باختصار

| العنصر | الحالة | الدليل |
|--------|--------|--------|
| `routes/umrah.ts` (3,750 سطراً) | ✅ **نظيف** | صفر استدعاءات GL، صفر كتابة SQL على `journal_*`، قراءتان SELECT مشروعتان فقط |
| `routes/umrah-entities.ts` (5,836 سطراً) | ✅ **نظيف** | صفر استدعاءات GL مباشرة، صفر كتابة SQL، 6 قراءات SELECT للتجميع/الكشوف |
| `pages/umrah/**` (44 ملفاً) | ✅ **نظيف** | صفر إصابات على جداول/مساعدات GL |

**خلاصة:** لا انتهاكات Service Boundary المالية في routes/الواجهة لمسار العمرة على main لحظة الفحص (`commit 3f10ebab`). كل قيود العمرة المالية (نسك، بيع، عمولة، إعادة تصنيف) تمر عبر engines رسمية في `lib/umrah*Engine.ts`. الـsmoke المضاف يحرس استمرار هذه الحالة.

## ٢. المنهجية

ثلاث مجموعات بحث مباشرة على الشجرة لحظة الفحص:

1. أي استدعاء لـ`createGuardedJournalEntry` أو `createJournalEntry` من ملف داخل النطاق.
2. أي SQL مكتوب (`INSERT INTO`/`UPDATE`/`DELETE FROM`) يستهدف جدولي `journal_entries` أو `journal_lines`.
3. أي ذكر للجدولين أو لمساعدي GL من الواجهة (FE).

السماح: قراءات (`SELECT … FROM journal_entries` / `LEFT JOIN journal_entries` / `JOIN journal_lines`) داخل routes العمرة **مسموح بها** للعرض/التجميع، لا تكسر قفل الحدود.

## ٣. الأدلة الميدانية (مخرجات `grep` فعلية)

### ٣.١ استدعاءات GL من routes العمرة

```text
grep "createGuardedJournalEntry|createJournalEntry"
  → routes/umrah.ts          : 0
  → routes/umrah-entities.ts : 0
```

### ٣.٢ كتابة SQL مباشرة على `journal_*`

```text
grep "INSERT INTO journal_|UPDATE journal_|DELETE FROM journal_"
  → routes/umrah.ts          : 0
  → routes/umrah-entities.ts : 0
```

### ٣.٣ القراءات المسموح بها (للتوثيق وتثبيت السقف)

`routes/umrah.ts` — قراءتان:

```text
line 1990:   LEFT JOIN journal_entries je ON je.id = pen."journalEntryId"
             (عرض ربط قيد الغرامة في كشف الغرامات)
line 3664:   JOIN journal_entries je ON je.id = spa."journalEntryId"
             (تجميع رصيد محفظة نسك من ledger الموردين)
```

`routes/umrah-entities.ts` — ست قراءات (تعليق واحد + خمس SELECT/JOIN):

```text
line 2665:   SELECT SUM(jl.debit) AS total FROM journal_entries je
line 2666:     JOIN journal_lines jl ON jl."journalId" = je.id
line 2671:   SELECT SUM(jl.credit) AS total FROM journal_entries je
line 2672:     JOIN journal_lines jl ON jl."journalId" = je.id
             (تجميعات كشف الوكيل/الوكيل الفرعي)
line 4587:   // (تعليق توثيق)
line 4644:   FROM journal_entries je
line 4663:   FROM journal_lines jl
             (تجميعات تقرير الإيراد المُعاد تصنيفه)
```

### ٣.٤ ذكر الواجهة لجداول/مساعدات GL

```text
grep "journal_entries|journal_lines|createJournalEntry" في pages/umrah/**
  → 0 إصابات (44 ملف .tsx/.ts)
```

### ٣.٥ النمط الصحيح — routes thin-wrapper على engines

كل عملية مالية في العمرة تمر عبر محرّك دالّته معروفة. على سبيل المثال:

```text
umrah-entities.ts:32     import { reclassifyRevenueForInvoices } from "../lib/umrahReclassifyEngine.js";
umrah-entities.ts:3715   router.post("/reclassify-revenue", authorize(...), async (req, res) => {
umrah-entities.ts:3724     const result = await reclassifyRevenueForInvoices(scope, body);
                          // ↑ thin wrapper — لا بناء JE lines في الـroute
```

المحرّكات الأربعة التي تستدعي `createGuardedJournalEntry`:

| المحرّك | الدورة المغطّاة | المرجع |
|---------|------------------|--------|
| `lib/umrahImportEngine.ts` | شراء نسك + رد نسك | #2025 |
| `lib/umrahInvoicingEngine.ts` | فاتورة بيع بسطرين + VAT الهامش | #2016 |
| `lib/umrahCommissionEngine.ts` | عمولة المسوّق عبر HR | #2027 |
| `lib/umrahReclassifyEngine.ts` | إعادة تصنيف الإيراد بأبعاد | (موجود على main) |

## ٤. الـSmoke المضاف (تجميد لا إصلاح)

ملف: `artifacts/api-server/tests/unit/umrahFinanceBoundarySmoke.test.ts`

يثبّت ٨ invariants موزّعة على ٣ مجموعات:

**§A — `routes/umrah.ts`**
1. صفر استدعاءات `createGuardedJournalEntry`.
2. صفر استدعاءات `createJournalEntry`.
3. صفر كتابة SQL على `journal_entries`/`journal_lines`.
4. عدد القراءات على `journal_*` = 2 بالضبط (sentinel — أي زيادة تحتاج تبرير في PR لاحق).

**§B — `routes/umrah-entities.ts`**
5. صفر استدعاءات `createGuardedJournalEntry`.
6. صفر استدعاءات `createJournalEntry`.
7. صفر كتابة SQL على `journal_*`.

**§C — `pages/umrah/**`**
8. كل صفحة (44 ملفاً) خالية من ذكر `journal_entries`/`journal_lines` أو `createGuardedJournalEntry`/`createJournalEntry`، مع defensive check يضمن أن المشي على المجلد فعلاً جلب الملفات (لا pass زائف عند عطل المسار).

كل assertion لها تعليق يشرح: «لماذا هذه القيمة؟ ماذا تعني زيادتها؟»

## ٥. ما تم منعه

- **منعت** أي PR مستقبلي يدخل استدعاء `createGuardedJournalEntry` أو `createJournalEntry` في routes العمرة → الـsmoke يفشل قبل المراجعة.
- **منعت** أي `INSERT/UPDATE/DELETE` مباشر على `journal_entries`/`journal_lines` يدخل routes العمرة.
- **منعت** تسريب منطق GL إلى الواجهة (FE) في صفحات العمرة الـ44.
- **سقّفت** عدد القراءات في `umrah.ts` عند 2 — أي قراءة ثالثة تحتاج رفع السقف عمداً في PR لاحق بمبرر.

## ٦. ما لم يتغير

- صفر تعديل على أي engine (`umrahImportEngine`، `umrahInvoicingEngine`، `umrahCommissionEngine`، `umrahReclassifyEngine`، `umrahPenaltyEngine`، إلخ).
- صفر تعديل على `routes/umrah.ts` و`routes/umrah-entities.ts`.
- صفر migrations، صفر UI changes، صفر تعديل صلاحيات، صفر مساس بأي smoke أو integration قائم.
- صفر تغيير سلوكي — الـsmoke الجديد لا يُنشئ شيئاً، لا يحذف، ولا يستدعي شيئاً وقت التشغيل في الإنتاج.

## ٧. الاختبارات

- **smoke جديد:** `umrahFinanceBoundarySmoke.test.ts` — 8 invariants تمر محلياً على main لحظة هذا الـPR.
- **smokes العمرة المالية القائمة** لم تُمَسّ: `MarginVat`, `Split`, `DimensionalRevenueRouting`, `PerLineVat`, `NuskPurchaseDimensions`, `CommissionViaHr`, `SettingsFinanceKnobs`, `OverstayPenalty`, `ServiceProducts`.
- **integration tests** القائمة (TwoLineInvoice، NuskPurchaseJE، CommissionViaHrJE، FullCycleE2E) لم تُمَسّ.

## ٨. المخاطر

| المخاطرة | احتمال | شدّة | تخفيف |
|---------|--------|------|--------|
| smoke جديد يفشل على PR مستقبلي يحتاج فعلاً قراءة ثالثة من ledger في `umrah.ts` | منخفض-متوسط | منخفضة | الـsentinel على عدد القراءات يفشل بوضوح ويذكر السبب في التعليق؛ رفعه قرار واعٍ مرئي في الـdiff |
| ظنّ خاطئ بإغلاق نهائي بينما هناك مسار خفي | منخفض | متوسطة | المسح شامل لـ`grep` على الأنماط القاطعة (`createGuardedJournalEntry`، `createJournalEntry`، الكتابة المباشرة)؛ أي تجاوز للمحرّك يلتقطه أحد الثلاثة |

## ٩. خطة الرجوع (Rollback)

PR وثائقي + ملف test جديد + لا تعديل على إنتاج. الرجوع: revert واحد. لا migration، لا تغيير في انتقال البيانات، لا أثر تشغيلي.

## ١٠. ما بقي من فحص U-01

كل ما طلبه U-01 منجَز: «فحص إغلاق Service Boundary المالي على routes العمرة + smoke يثبّت صفر كتابة JE خارج engines». الفحص شامل، النتيجة موثّقة بالدليل، التجميد قائم. **المتبقي للموجة 1 هو U-02 فقط** (توحيد مصدر النقل) في PR منفصل، حسب نص إذنك.

## ١١. ملاحظة عن سياق الفحص (شفافية)

الـsnapshot الأوّلي الذي راجعته أثناء جلسة سابقة في هذا السياق كان **قديماً** وأظهر استدعاءً مباشراً لـ`createGuardedJournalEntry` في handler `/reclassify-revenue` (قبل استخراج المنطق إلى `umrahReclassifyEngine`). إعادة المسح بعد المزامنة على main أكدت أن الاستخراج تمّ سابقاً (المحرّك موجود ويُستدعى بـthin wrapper). التقرير يعكس الحقيقة الحالية على `commit 3f10ebab`، والـsmoke يحرس هذه الحقيقة من التراجع.

## ١٢. مرجعية

- المهمة: #2080 (الموجة 1، U-01)
- الميثاق: #1870 (Service Boundary Lock)
- الميثاق التشغيلي الموحد: #2071
- الـPRs المالية المنجزة قبلاً (سياق): #2016 / #2025 / #2027 / #2031 / #2035 / #2084
