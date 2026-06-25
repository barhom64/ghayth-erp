# مواصفة `FIN-RECURRING-POSTING-ENGINE` — المحرّك الدوري الموحّد للترحيلات

> **مستند تصميم — لا كود، لا migration، لا ترحيل.** تقرير معماري لقرار إبراهيم (بناء/لا بناء).
> يُكمّل: `UNSCHEDULED_FINANCE_GAPS_AUDIT_2026-06-14.md` (§3) + `FIN-EOSB-ACCRUAL_2252_PROFILE_DESIGN.md` (الذي يقول صراحةً إنه «موقوف على بناء المطور لـ`FIN-RECURRING-POSTING-ENGINE`»).
> التاريخ: 2026-06-24 · الحالة: مقترح بانتظار قرار.

---

## 1. المشكلة (لماذا)

**صدق الدفتر كل فترة يعتمد على بشر يتذكّرون.** المُؤتمَت الوحيد هو الإهلاك؛ بقية الترحيلات الدورية يدوية أو تذكير فقط:

| الترحيل الدوري | الحالة الحالية | المرجع |
|----------------|----------------|--------|
| إهلاك الأصول | ✅ مُؤتمَت (`monthly_auto_depreciation`) | `cronScheduler.ts:4904` |
| استحقاق نهاية الخدمة/الإجازات | ❌ endpoint يدوي | `hr.ts:7484` |
| إعادة تقييم العملات (FX) | ❌ تذكير فقط — لا وظيفة تُرحّل آليًّا | `cronScheduler.ts:4625` (تذكير) |
| تسوية الضرائب | ❌ بلا مسار مُؤتمَت | #2280 |
| مخصص الديون المشكوك فيها | ⚠️ endpoint موجود بلا أتمتة بالتقادم | `finance-invoices.ts:3940` |

**الأثر:** استحقاقات/مصروفات حقيقية (نهاية خدمة، إجازات، فروق صرف غير محققة، ضرائب، مخصص ديون) قد لا تُرحَّل في فترتها ما لم يتذكّر إنسان ⇒ قوائم مالية غير مكتملة عند الإقفال.

**القرار المعماري المعتمد سابقًا:** «محرّك دوري **واحد** لا أربعة». أي محرّك EOS/FX/ضرائب مستقل = مخالفة لهذا القرار.

---

## 2. المبدأ (ماذا)

**تعميم نمط الإهلاك العامل** إلى محرّك واحد يستهلك **profiles** قابلة للتركيب. كل profile **يصف** ولا يُنفّذ بنفسه:

> اختيار الصفوف · صيغة المبلغ · قالب القيد (أزواج حسابات + اتجاه عبر *purpose* صريح) · الأبعاد الموروثة · مفتاح التكرار (idempotency) · خطّاف العكس/التسوية.

النظير المُثبَت: `monthlyAutoDepreciation` — لكل أصل نشط، idempotent عبر `NOT EXISTS depreciation_entries(assetId,period)`، يُرحّل `DR 6100 / CR 1590` ببُعد `assetId`، يكتب `depreciation_entries` + يحدّث `fixed_assets`، خلف بوابة فترة.

---

## 3. عقد المحرّك (الواجهة المقترحة)

```ts
interface RecurringProfile<Row> {
  key: string;                       // "asset_depreciation" | "eos_accrual" | "leave_accrual" | "fx_revaluation" | "bad_debt_provision" | "tax_settlement"
  schedule: string;                  // cron — اليوم 2-3 من الشهر افتراضيًا
  // (1) مصدر صفوف pluggable: يُرجع صفوف الفترة (الكيان/المبلغ/الأبعاد)
  selectRows(ctx: PeriodCtx): Promise<Row[]>;
  // (2) صيغة المبلغ لكل صف (قد تكون 0 ⇒ تخطّي)
  amountFor(row: Row, ctx: PeriodCtx): number;
  // (3) قالب القيد: أزواج (purpose صريح + اتجاه) — لا fallback صامت
  journalTemplate(row: Row, amount: number): JournalLineSpec[];
  // (4) الأبعاد الموروثة من الصف إلى كل سطر
  dimensionsFor(row: Row): DimensionSet;
  // (5) idempotency لكل (صف، فترة)
  idempotencyKey(row: Row, period: string): string;
  trackingTable: string;             // جدول تتبّع الـprofile (NOT EXISTS guard)
  // (6) خطّاف عكس/تسوية يستدعيه حدث منفصل (اختياري)
  onSettlement?(event: DomainEvent): Promise<void>;
}
```

**مسؤوليات المحرّك (مشتركة، تُكتب مرة):**
1. لكل profile مجدول: `selectRows` → لكل صف: تحقّق `NOT EXISTS trackingTable(entity,period)` (idempotency)، احسب `amountFor` (≤0 ⇒ تخطّي).
2. ابنِ الأسطر عبر `journalTemplate` + `dimensionsFor`، حُلّ الحسابات بـ`resolveAccountCode` على *purpose صريح*.
3. **بوابة الفترة:** `checkFinancialPeriodOpen` (موجود) — لا ترحيل في فترة مُقفلة.
4. رحّل عبر `financialEngine.postJournalEntry` (نفس عقد الحدود — يمرّ على `lintGlBoundary`) داخل `withTransaction`.
5. اكتب صف التتبّع + أطلق حدث `*.gl_auto_posted` (نمط `eventCatalog.ts:1441`).
6. حارس ازدواج: `alreadyExists` ⇒ تخطّي (idempotency مزدوج عبر sourceKey + الجدول).

---

## 4. كتالوج الـprofiles المقترحة

| profile | مصدر الصفوف | الصيغة | قالب القيد (purpose) | الأبعاد |
|---|---|---|---|---|
| `asset_depreciation` *(يُرحّل القائم)* | أصول نشطة | قسط الإهلاك | DR `depreciation_expense` / CR `accum_depreciation` | assetId |
| `eos_accrual` | تعيينات نشطة `salary>0` | م84: salary/24 (≤5س) · salary/12 (>5س) | DR `eos_accrual_expense`(5260) / CR `eos_accrual_liability`(2220) | employee/dept/branch |
| `leave_accrual` | تعيينات نشطة | استحقاق الإجازة الشهري | DR `leave_accrual_expense`(5270) / CR `leave_accrual_liability`(**2150**) | employee/dept/branch |
| `fx_revaluation` | أرصدة ذمم/موردين بعملة ≠ SAR مفتوحة | `computeRevaluationLines` (موجود) | DR/CR `fx_unrealized_gain/loss` مقابل 1131/2111 لكل كيان | client/vendor |
| `bad_debt_provision` | ذمم متقادمة فوق عتبة | نسبة التقادم | عبر `/finance/bad-debt/post` (موجود) | client |
| `tax_settlement` | التزامات ضريبية مستحقة الفترة | حسب #2280 | TBD #2280 | — |

> **ملاحظة سلامة:** `leave_accrual` يستعمل **2150** (الحساب الصحيح الذي ثبّتته المالية بهجرة 365 وأُصلح في #2939) — لا 2220. أي بناء لهذا الـprofile يجب أن يحترم خريطة المالية، لا أن يعيد خلط الإجازات مع مخصص نهاية الخدمة.

---

## 5. احتياجات الـschema (تتطلب موافقة migration)

> ⛔ **لا أُنشئ migration بلا موافقتك (قاعدة 3).** هذه قائمة بما يلزم:

1. **جدول تتبّع عام أو لكل profile** على نمط `depreciation_entries`: `(companyId, profileKey, entityId, periodYm, journalId, amount)` مع فهرس فريد `(companyId, profileKey, entityId, periodYm)` — هو ضمان الـidempotency.
2. **بذور purpose صريحة** لكل زوج حسابات (`eos_accrual_*`, `leave_accrual_*`, `fx_unrealized_*`) في `accounting_mappings` — لإلغاء الاعتماد على fallback الصامت (مواد الدستور 16-17).
3. **توسيع عقد الأبعاد** (#2246/#2233): العقد الحالي يغطّي vehicle/property/project/vendor/client **لا** employee/department/branch — فأبعاد العمالة (EOS/الإجازات) **خارج العقد**؛ يلزم توسيع فئة أبعاد العمالة في `financePostingPolicy.assertDimensionContract` + `ledgerTruth.DIMENSION_COLUMN` **قبل** فرضها.

---

## 6. خطة تنفيذ تدرّجية (عند الموافقة)

كل خطوة دفعة مستقلة، خلف بوابة المجلس + **اختبار assertion على سطور القيد** (إلزامي لكل ما يمسّ الدفتر):

1. **المحرّك + الجدول العام** + ترحيل `asset_depreciation` كأول profile — **بإثبات تكافؤ** (نفس قيود الإهلاك الحالية بايت-ببايت) قبل إسقاط المسار القديم.
2. `eos_accrual` (بعد توسيع عقد أبعاد العمالة) — assertion: DR 5260 / CR 2220 ببُعد employee/dept/branch، متوازن.
3. `leave_accrual` — assertion: CR **2150** (لا 2220)، متوازن.
4. `fx_revaluation` — وصل `computeRevaluationLines` القائم + **إصلاح رابط التذكير المكسور** (`/finance/fx/revaluation/post` → `/finance/gl-helpers/fx-revaluation/:id`).
5. `bad_debt_provision` — أتمتة بالتقادم فوق الـendpoint القائم.
6. `tax_settlement` — تابع لـ#2280.

> القاعدة: لا profile يُرحّل بلا (أ) purpose صريح مزروع، (ب) أبعاده داخل العقد، (ج) assertion test على سطوره، (د) حكم مجلس «يُعتمد».

---

## 7. المخاطر

- **يمسّ الدفتر** — كل profile يُنشئ قيودًا حقيقية ⇒ assertion tests + اعتمادك لكل دفعة، لا اعتماد جماعي.
- **ازدواج الترحيل** — مُعالَج بالـidempotency المزدوج (sourceKey + الجدول الفريد)، لكن يجب اختبار «تشغيلان لنفس الفترة = قيد واحد».
- **تكافؤ الإهلاك** — ترحيل المسار القائم خطر؛ يُلزَم إثبات تكافؤ قبل إسقاط القديم (لا انحدار صامت).
- **فترات مُقفلة** — بوابة الفترة موجودة لكن يجب أن يحترمها المحرّك المشترك لا كل profile.

---

## 8. القرارات المطلوبة من إبراهيم

1. **بناء/لا بناء** `FIN-RECURRING-POSTING-ENGINE` أصلًا؟ (قرار معماري — محرّك واحد يبتلع 6 ترحيلات دورية.)
2. **موافقة schema:** الجدول العام للتتبّع + بذور الـpurposes + توسيع عقد الأبعاد للعمالة.
3. **ترتيب الأولوية:** أي profile أولًا بعد ترحيل الإهلاك؟ (الأعلى أثرًا تشغيليًّا: EOS + الإجازات، ثم FX.)
4. هل تُفتح issues منفصلة (نمط #2252/#2278/#2280) أم مسار واحد؟

> لا بناء قبل قرارك. هذا المستند يجعل EOSB profile (#2252) وبقية الـprofiles **جاهزة للتركيب لحظة موافقتك**، لا محرّكات متوازية.
