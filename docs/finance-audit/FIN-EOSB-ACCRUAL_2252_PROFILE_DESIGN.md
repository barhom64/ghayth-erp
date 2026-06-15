# تصميم profile الـEOSB على المحرك الدوري — #2252 (المرحلة 2، تصميم فقط)

> **مستند تصميم — لا كود، لا migration، لا ترحيل.** يكمّل تقرير التحقّق `FIN-EOSB-ACCRUAL_2252_VERIFICATION.md`.
> **موقوف على:** (أ) بناء المطور لـ`FIN-RECURRING-POSTING-ENGINE`، (ب) عقد الأبعاد #2246، (ج) اعتماد المالك للتنفيذ.
> الهدف: أن يكون EOSB **profile جاهزًا للتركيب** لحظة توفّر المحرك — لا محرّكًا متوازيًا.

---

## 1. المبدأ والنظير المُثبَت

اتّساقًا مع القرار «محرّك دوري واحد»: EOSB ليس محرّكًا، بل **مستهلك** يصف:
*اختيار الصفوف · صيغة المبلغ · قالب القيد · الأبعاد الموروثة · مفتاح التكرار · منطق السحب عند الخروج.*

النظير العامل بالفعل في المالية هو **الإهلاك الشهري التلقائي** `monthlyAutoDepreciation` (`cronScheduler.ts:2588-2700`):

| عنصر النمط | الإهلاك (موجود) | EOSB profile (المطلوب) |
|------------|------------------|------------------------|
| التكرار | لكل أصل نشط | لكل تعيين موظف نشط `salary>0` |
| الـidempotency لكل فترة | `NOT EXISTS depreciation_entries(assetId,period)` | `NOT EXISTS hr_eos_accruals(employeeId,period)` ← **جدول جديد** |
| الصيغة | قسط ثابت/متناقص | م84: `salary/24` ≤5س، `salary/12` >5س |
| القيد | `DR 6100 / CR 1590` ببُعد `assetId` | `DR 5260 / CR 2220` بأبعاد employee/dept/branch |
| السجل الميداني | INSERT `depreciation_entries` + UPDATE `fixed_assets` | INSERT `hr_eos_accruals` (المتراكم لكل موظف) |
| حارس الازدواج | `alreadyExists` ⇒ تخطّي | نفسه |
| الجدولة | `monthly_auto_depreciation` (يوم 2) | `monthly_eos_accrual` (مقترح يوم 2-3) |

> **الفكرة:** المحرك الدوري المشترك = تعميم نمط الإهلاك. EOSB profile = نفس النمط بصفوف لكل موظف بدل كل أصل.

---

## 2. متطلبات على عقد المحرك الدوري (TBD — تابعة لتصميم المطور)

ما يحتاجه EOSB من المحرك (يُثبّت عند بناء العقد، لا أفترضه نهائيًّا):

1. **مصدر صفوف pluggable** — دالة تُرجع صفوفًا (موظف/فترة/مبلغ/أبعاد).
2. **قالب قيد باتجاه + أزواج حسابات** عبر purpose صريح (لا fallback).
3. **توريث الأبعاد** من الصف إلى أسطر القيد (employee/dept/branch).
4. **idempotency لكل (صف، فترة)** عبر sourceKey + جدول تتبّع للـprofile.
5. **بوابة الفترة** (لا ترحيل في فترة مُقفلة — موجود في `checkFinancialPeriodOpen`).
6. **خطّاف عكس/تسوية** يستدعيه حدث منفصل (هنا: إتمام نهاية الخدمة).

> أي اختلاف في توقيع المحرك النهائي يُكيَّف هنا؛ منطق EOSB أدناه مستقل عن الـAPI.

---

## 3. عقد profile الـEOSB

### 3.1 اختيار الصفوف والصيغة
- المصدر: `employee_assignments` النشطة `salary>0` + بداية العقد (`employee_contracts.startDate ?? hireDate`) — نفس استعلام `hr.ts:7514-7522`.
- الأساس: **المكافأة الكاملة (م84)** — `salary/24` لأول 5 سنوات، `salary/12` بعدها (`hr.ts:7544-7552`). المخصص متحفّظ؛ خصم الاستقالة (م85) يُطبَّق **عند التسوية فقط**، لا في التراكم.
- النطاق الزمني: شهر واحد لكل تشغيل (`period = YYYY-MM`).

### 3.2 قالب القيد — يُصلح الفجوتين #2 و#3
```
DR  5260  eos_accrual_expense      = monthlyEosAccrual   [employeeId, departmentId, branchId]
CR  2220  eos_accrual_liability    = monthlyEosAccrual   [employeeId, departmentId, branchId]
```
- ربط **purpose صريح** لـ`eos_accrual_liability → 2220` و`eos_accrual_expense → 5260` في الـseed (لا الاعتماد على fallback).
- **تصحيح مقترن (الفجوة #3):** التزام الإجازات في `postMonthlyAccrualsGL` يسقط حاليًّا على 2220؛ يجب فصله إلى **2150** عبر profile «استحقاق الإجازات» منفصل (خارج نطاق #2252 لكنه يشارك نفس الدالة المعطوبة `hrEngine.ts:521-559` — يلزم تنسيق عند التنفيذ حتى لا يبقى الخلط).
- كل سطر يحمل الأبعاد (الـbreakdown يُحسب أصلًا في `hr.ts:7556` ثم يُهمَل — هنا يُمرَّر).
- **تحديث (#2233 هبط، `6016330`):** عقد البُعد المُنفَّذ يغطّي vehicle/property/project/vendor/client **فقط، لا employee/department/branch**. فأبعاد EOSB **خارج العقد الحالي** — يلزم توسيع فئة أبعاد العمالة في العقد (`financePostingPolicy.assertDimensionContract` + `ledgerTruth.DIMENSION_COLUMN`) قبل أن تُفرَض هنا. التصميم يفرض هذا المتطلّب على العقد، لا يكتفي باستهلاكه.

### 3.3 الـidempotency + جدول التتبّع (مقترح)
نظير `depreciation_entries`:
```sql
-- تصميم مقترح (لا يُطبَّق الآن)
CREATE TABLE hr_eos_accruals (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL,
  "employeeId"  INTEGER NOT NULL,
  "branchId"    INTEGER,
  "departmentId" INTEGER,
  period        TEXT NOT NULL,            -- YYYY-MM
  amount        NUMERIC(12,2) NOT NULL,
  "journalEntryId" INTEGER,
  status        TEXT NOT NULL DEFAULT 'posted',  -- posted | settled | reversed
  "postedAt"    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId","employeeId",period)        -- منع تكرار الفترة لكل موظف
);
```
- `sourceKey = hr:eos_accrual:${employeeId}:${period}` (لكل موظف، بدل المجمّع الحالي `:${companyId}:${period}`).
- المتراكم لكل موظف = `SUM(amount) WHERE employeeId=? AND status='posted'` — هذا ما يُسحب منه عند الخروج.

### 3.4 الجدولة
- وظيفة `monthly_eos_accrual` في `cronScheduler.ts` (نمط `monthly_auto_depreciation`)، مع قفل الفترة + حارس `alreadyExists`.
- يبقى endpoint `POST /hr/accruals/monthly` للتشغيل اليدوي/التصحيحي (إعادة للفترة الحالية)، لكن المصدر الموثوق يصبح الـcron.

---

## 4. السحب عند الخروج — يُصلح الفجوة #4 (الأهم)

اليوم: التسوية `postExitSettlementGL` (`hrEngine.ts:137-206`) تَخصم `5260` بالكامل ولا تمسّ `2220` ⇒ ازدواج مصروف + مخصص لا يُسحب منه. التصميم:

عند إتمام الخروج، للجزء الخاص بـEOS:
```
accrued  = SUM(hr_eos_accruals.amount)  للموظف، status='posted'   (= رصيد 2220 المنسوب له)
gratuity = calcGratuity(...).total                                  (المستحق الفعلي بعد م85)

DR 2220  = min(accrued, gratuity)            ← تحرير المخصص المتراكم
الفرق:
  if gratuity > accrued:  DR 5260 = gratuity − accrued   ← نقص مخصص (مصروف تكميلي)
  if accrued > gratuity:  DR 2220 (الباقي) مقابل CR 5260 = accrued − gratuity  ← عكس فائض المخصص
CR 2140  = gratuity                          ← مستحق التسوية (كما هو، ضمن صافي التسوية)

ثم: UPDATE hr_eos_accruals SET status='settled' للموظف.
```
- **النتيجة:** إجمالي مصروف EOS طوال الخدمة = المستحق الفعلي (لا ازدواج)، ورصيد 2220 للموظف يعود صفرًا عند المغادرة.
- **مثال:** موظف استقال بعد 3 سنوات، راتب 6000. المتراكم (full basis) = 36×(6000/24)=9000. المستحق (م85، ثلث) = (6000×0.5×3)×⅓=3000. عند الخروج: `DR 2220 3000` + `DR 2220 6000 / CR 5260 6000` (عكس الفائض) ⇒ صافي مصروف عمري = 3000، و2220 ← 0. ✅

> هذا التصالُح هو جوهر «الصدق»: بدونه، تفعيل الاستحقاق الشهري يُفسد دفتر الأستاذ بدل إصلاحه.

---

## 5. الهجرة / الـbackfill (موقوف على إذن المالك)

- **لا backfill تاريخي** لأرصدة 2220/2150 دون تفويض صريح (يلامس FIN-SUB-02).
- عند الاعتماد: تقرير أثر أولًا (كم رصيد 2220 الحالي؟ كم منه التزام إجازات مخلوط؟) قبل أي تصحيح.
- إنشاء `hr_eos_accruals` فارغًا والبدء من الفترة الجارية (forward-only) هو الخيار الأقل مخاطرة.

---

## 6. اختبارات journal_lines المطلوبة (ضابط لا يُتجاوز — سياسة #2230)

أي PR تنفيذي يحمل في نفسه:
1. استحقاق شهر واحد لموظف ⇒ قيد متوازن `DR 5260 / CR 2220` يحمل `employeeId+departmentId+branchId`.
2. إعادة التشغيل لنفس (موظف، فترة) ⇒ لا قيد ثانٍ (idempotency).
3. التزام الإجازات لا يُرحَّل على 2220 (يذهب 2150).
4. الخروج يَخصم 2220 المتراكم ويعترف بالفرق فقط في 5260 (لا ازدواج)؛ 2220 للموظف ← 0.
5. استقالة <2 سنة ⇒ عكس كامل المخصص المتراكم (لا مصروف صافٍ يتبقّى).
6. الخروج لا يكرّر المصروف لو سبق ترحيل التسوية (`alreadyExists`).

---

## 7. اعتماديات وخارج النطاق ونقاط قرار

**يعتمد على:** `FIN-RECURRING-POSTING-ENGINE` (المصدر+القالب+التوريث) · عقد الأبعاد #2246 · ربط purpose صريح.
**خارج النطاق:** تعديل سياسة HR · backfill تاريخي بلا إذن · profile الإجازات الكامل (مذكور كتصحيح مقترن فقط) · إعادة كتابة `calcGratuity` (صحيحة).
**نقاط قرار للمطور (عند بناء المحرك):** (أ) توقيع «مصدر الصفوف» pluggable؟ (ب) جدول التتبّع لكل profile أم جدول موحّد للمحرك؟ (ج) خطّاف العكس حدثي أم استدعاء مباشر من `hr-exit:complete`؟

> **الحالة: تصميم جاهز. لا تنفيذ قبل المحرك + إذن المالك.**
