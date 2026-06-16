# FINANCE_STATUS_COLUMNS_MIGRATION_PLAN

> #1945 — الخطوة المؤجَّلة عمدًا: ترقية الفصل الثلاثي للحالة من **FE-first**
> (نموذج + اشتقاق عبر `mapJournalStatus`) إلى **أعمدة فعلية** في
> `journal_entries`. هذا المستند خطة جاهزة للتنفيذ في بيئة فيها قاعدة بيانات
> Postgres (لا يمكن تنفيذها/التحقق منها في بيئة بلا DB لأن `guard` يتحقق من
> schema dump المُولَّد من قاعدة حيّة).
>
> الأساس جاهز: `src/lib/finance/status-model.ts` يحمل المحاور الثلاثة وقواعدها،
> و`mapJournalStatus` يحمل خريطة التحويل المستخدمة في الـ backfill أدناه.

## لماذا تدريجيًّا (لا دفعة واحدة)
`journal_entries` هو دفتر الأستاذ الأساسي. القاعدة: **لا نكسر القراءات/الكتابات
الحالية**. لذلك الأعمدة الجديدة تُضاف كـ«مرآة مشتقّة» قابلة للـ NULL أولًا،
ويبقى `status` + `isPaid` المصدر التشغيلي حتى تكتمل التعبئة والاختبارات، ثم
(اختياريًا، لاحقًا) تُصبح الأعمدة الجديدة هي المرجع.

---

## المرحلة A — الهجرة الإضافية (آمنة، قابلة للتراجع)

ملف: `artifacts/api-server/src/migrations/286_journal_three_axis_status.sql`

```sql
-- 286_journal_three_axis_status.sql
--
-- PROBLEM
-- journal_entries يخلط ثلاثة مفاهيم في عمود status واحد + علامة isPaid:
-- حالة المستند، حالة الدفع، حالة الترحيل. #1945 فصلها على مستوى الواجهة
-- (status-model.ts). هذه الهجرة تجعل الفصل أول المخطّط.
--
-- FIX
-- إضافة ثلاثة أعمدة مشتقّة (NULLable) + backfill من status/isPaid بنفس خريطة
-- mapJournalStatus، + قيود CHECK على المفردات القانونية. لا تغيير على
-- status/isPaid (يبقيان المصدر التشغيلي حتى مرحلة لاحقة).
--
-- @rollback:
--   ALTER TABLE journal_entries
--     DROP CONSTRAINT IF EXISTS journal_entries_documentstatus_chk,
--     DROP CONSTRAINT IF EXISTS journal_entries_paymentstatus_chk,
--     DROP CONSTRAINT IF EXISTS journal_entries_postingstatus_chk,
--     DROP COLUMN IF EXISTS "documentStatus",
--     DROP COLUMN IF EXISTS "paymentStatus",
--     DROP COLUMN IF EXISTS "postingStatus";

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "documentStatus" text,
  ADD COLUMN IF NOT EXISTS "paymentStatus"  text,
  ADD COLUMN IF NOT EXISTS "postingStatus"  text;

-- backfill — يطابق mapJournalStatus(status) + (isPaid ? paid : unpaid)
UPDATE journal_entries SET
  "documentStatus" = CASE status
     WHEN 'posted'           THEN 'approved'
     WHEN 'approved'         THEN 'approved'
     WHEN 'reversed'         THEN 'approved'
     WHEN 'pending_approval' THEN 'submitted'
     WHEN 'returned'         THEN 'submitted'
     WHEN 'rejected'         THEN 'rejected'
     WHEN 'cancelled'        THEN 'cancelled'
     ELSE 'draft' END,
  "postingStatus" = CASE status
     WHEN 'posted'    THEN 'posted'
     WHEN 'approved'  THEN 'posted'
     WHEN 'cancelled' THEN 'reversed'
     WHEN 'reversed'  THEN 'reversed'
     ELSE 'unposted' END,
  "paymentStatus" = CASE WHEN "isPaid" IS TRUE THEN 'paid' ELSE 'unpaid' END
WHERE "documentStatus" IS NULL;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_documentstatus_chk
    CHECK ("documentStatus" IS NULL OR "documentStatus" IN ('draft','submitted','approved','rejected','cancelled')),
  ADD CONSTRAINT journal_entries_paymentstatus_chk
    CHECK ("paymentStatus"  IS NULL OR "paymentStatus"  IN ('unpaid','partially_paid','paid')),
  ADD CONSTRAINT journal_entries_postingstatus_chk
    CHECK ("postingStatus"  IS NULL OR "postingStatus"  IN ('unposted','posted','reversed'));
```

ثم **إعادة توليد المخطّط** (إلزامي ليمر `check:schema-drift` في CI):
```bash
pnpm db:dump-schema   # يحدّث db/schema_pre.sql + schema_post.sql من قاعدة عند HEAD
```

> ملاحظة قيد الحالة: الترحيل (#283) أضاف `reversed` لقيد `status`. هذه الهجرة
> لا تمسّ قيد `status`؛ تضيف قيودًا منفصلة للأعمدة الجديدة فقط.

---

## المرحلة B — تعبئة على الكتابة (الخادم)

تبقى `status`/`isPaid` المصدر التشغيلي، لكن كل كاتب يعبّئ الأعمدة الثلاثة بنفس
الخريطة. نقاط التعديل:

| الموقع | ماذا يُضاف |
|---|---|
| `finance-journal.ts` → `POST /expenses` (بعد `postJournalEntry` + `UPDATE … SET isPaid`) | `SET "documentStatus"/"postingStatus"` من حالة القيد، `"paymentStatus"` من isPaid |
| `finance-journal.ts` → تحويلات الاعتماد (`pending_approval`/`approved`/`rejected`) | تحديث `documentStatus`/`postingStatus` ضمن نفس المعاملة |
| `finance-purchase.ts` / السندات / العكس (`reversed`) | نفس الاشتقاق عند تغيّر الحالة |

يُفضَّل دالة مشتركة `deriveAxesFromStatus(status, isPaid)` في
`api-server/src/lib/financeStatusAxes.ts` تطابق FE `mapJournalStatus` حرفيًّا،
مع **اختبار وحدة يربط الاثنين** (نفس أسلوب `financeScenarioModel.test.ts`).

---

## المرحلة C — القراءة

- استعلامات القائمة/التفصيل (`SELECT … FROM journal_entries`) تُرجِع الأعمدة
  الثلاثة.
- الواجهة (`expenses.tsx` وغيرها) تقرأ `e.documentStatus/paymentStatus/
  postingStatus` مباشرةً، ويصبح `mapJournalStatus(e.status)` احتياطًا فقط
  للسجلّات قبل الـ backfill.

---

## المرحلة D — (اختياري، لاحقًا) جعل الأعمدة مرجعًا

بعد استقرار B+C: حوّل منطق الاعتماد/الدفع/الترحيل ليكتب الأعمدة الثلاثة مباشرةً
ويشتقّ `status` القديم منها (توافق خلفي)، أو أوقف الاعتماد على `status` المختلط.

---

## الاختبارات / القبول
- وحدة: `deriveAxesFromStatus` ⇄ `mapJournalStatus` (تطابق حرفي)، وكل حالة
  `status` تُنتج المحاور الصحيحة.
- تكامل (DB): إنشاء مصروف يملأ الأعمدة الثلاثة؛ مسودة ⇒ `unpaid`+`unposted`؛
  اعتماد ⇒ `approved`+`posted`؛ عكس ⇒ `reversed`.
- `guard` أخضر بما فيه `check:schema-drift` بعد `db:dump-schema`.

## المتطلبات البيئية
- Postgres حيّ عند migration HEAD (لتشغيل الهجرة + `db:dump-schema`).
- لا يمكن التحقق في بيئة بلا DB؛ هذا سبب تأجيلها سابقًا.
