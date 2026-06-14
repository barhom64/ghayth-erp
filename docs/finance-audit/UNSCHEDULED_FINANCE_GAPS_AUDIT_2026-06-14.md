# تدقيق فجوات مالية غير مجدوَلة ولا محجوزة — 2026-06-14

> **تدقيق قراءة-فقط** (لا كود). الهدف: مشاكل مالية حقيقية **خارج** backlog #2230–#2252 والـPRs المفتوحة.
> الفرع: `claude/festive-cori-a9gwz4` · يكمّل تقريري #2252.

## المنهج
مسح: كل fallback لـ`resolveAccountCode(..., "CODE")`، الإدراج المباشر في `journal_lines`، حارس التوازن، وظائف cron للترحيلات الدورية، مسارات FX، وكنس «مُعتمد بلا ترحيل». تقاطُع كل نتيجة مع المهام المحجوزة لاستبعاد المعروف.

---

## 🔴 1) خلط حساب 2150 «مصروفات مستحقة» — نظامي وأوسع من #2251

**11 غرضًا متمايزًا** يسقط على حساب `2150` الواحد عند غياب ربط صريح:
`cargo_freight_payable` · `commission_payable` · `fleet_fines_payable` · `fleet_trip_payable` · `leave_accrual_liability` · `legal_fee_payable` · `legal_payable` · `owner_payable` · `property_owner_payable` · `property_maintenance_payable` · `purchase_grni`.

- **الدليل:** مسح `resolveAccountCode(..., "2150")`؛ الحسم عبر `getAccountCodeFromMapping` ثم fallback (`financialEngine.ts:resolveAccountCode`)؛ **صفر صفوف seed في `account_mappings`** (بحث `INSERT INTO account_mappings` في `db/` + migrations = 0) ⇒ الـfallback نشط **افتراضيًّا في كل تركيب**.
- **الأثر:** الميزانية تعجز عن التمييز بين ديون مُلّاك العقارات/المحامين/الموردين (GRNI)/العمولات/غرامات الأسطول — كتلة واحدة. تعذُّر التقادم والتسوية بالطرف من دفتر الأستاذ.
- **لماذا غير محجوز:** #2251 يغطّي **2160 فقط**. الحارس `assertPostableAccount` يمنع الترحيل على حساب غير قابل لكنه **لا يمنع الخلط** (عدّة أغراض ← حساب واحد).
- **الخطورة:** 🔴 عالية (نشط افتراضيًّا، واسع، يضرب صدق الميزانية).
- **التوصية:** ربط purpose صريح لكل غرض (حساب فرعي مخصّص حيث يلزم: ذمم مُلّاك، GRNI، عمولات، غرامات)؛ + guard يفشل عند سقوط غرضين متمايزين على نفس الحساب العام. backfill تاريخي موقوف على إذن المالك.

## 🟠 2) إعادة تقييم العملات ليست مُؤتمَتة — تذكير لا محرّك

- المنطق كامل: `computeRevaluationLines` + `runPeriodEndRevaluation` يكتب `fx_revaluation_log` (`fx/revaluation.ts:198-206`)؛ endpoint ترحيل `POST /finance/gl-helpers/fx-revaluation/:id` (`finance-gl-helpers.ts:306`)؛ قائمة pending (`:139`).
- **لكن** وظائف cron لـFX: جلب يومي (`daily_fx_rate_fetch`) + تنبيه قِدَم (`fx_staleness_check`) + **تذكير CFO** (`monthly_fx_revaluation_reminder` يوم 28، `cronScheduler.ts:4625`). **لا وظيفة تُشغّل التقييم/الترحيل آليًّا.**
- **عيب مقترن:** نصّ التذكير يحيل إلى `‎/finance/fx/revaluation/post` بينما المسار الفعلي `‎/finance/gl-helpers/fx-revaluation/:id` — **رابط خاطئ في الإشعار**.
- **الأثر:** أرباح/خسائر صرف غير محققة على ذمم/موردين بعملة أجنبية مفتوحة لا تُرحَّل ما لم يتذكّر إنسان (مشروط بتعرّض غير-SAR — وارد في العمرة/الموردين الأجانب).
- **الخطورة:** 🟠 متوسطة (مشروطة بالتعرّض). **غير موجود في #2230.**
- **التوصية:** أتمتة كـprofile على `FIN-RECURRING-POSTING-ENGINE` (نمط `monthly_auto_depreciation`) + بوّابة الإقفال + إصلاح رابط التذكير.

## 🟡 3) نمط نظامي: «تذكير/يدوي بدل محرّك» في ترحيلات نهاية الفترة

| الترحيل الدوري | الحالة |
|----------------|--------|
| إهلاك الأصول | ✅ مُؤتمَت (`monthly_auto_depreciation`, `cronScheduler.ts:4590`) |
| استحقاق نهاية الخدمة/الإجازات | ❌ endpoint يدوي (`hr.ts:7484`) — راجع تقرير #2252 |
| إعادة تقييم العملات | ❌ تذكير فقط (البند 2) |
| تحضير الإقفال | ⚠️ تذكير (`monthly_closing_prep`, `:4575`) |

صدق الدفتر كل فترة يعتمد على بشر يتذكّرون. #2247/#2248/#2250 ستؤتمت المؤجّل/الإطفاء/الإقفال — لكن **FX وجدولة استحقاقات HR قد تسقط بين المهام**. التوصية: `FIN-RECURRING-POSTING-ENGINE` يبتلعهما كـprofiles أيضًا.

## ⚪ 4) دوال ترحيل ميتة ومتباعدة (ثانوي)

`postLeaveAccrualGL` (`hrEngine.ts:208` — يستخدم 2150 الصحيح للإجازات) و`postEOSAccrualGL` (`:236`) **غير مستخدمتين**؛ المسار الحيّ `postMonthlyAccrualsGL` (`:521` — يستخدم 2220 الخاطئ لالتزام الإجازات). الدالة الميتة «أصحّ». **التوصية:** حذف الميت + توحيد على المسار الصحيح (يتقاطع مع إصلاح #2252-#3).

---

## استُبعد (سليم)
- ✅ حارس التوازن DR=CR مُنفَّذ (`gl/posting.ts:85` يرمي عند فرق >0.01).
- ✅ الإدراج المباشر في `journal_lines` هو المرحِّل الكنسي (`posting.ts`/`financialEngine.ts:259`) لا تجاوز.
- ✅ `property_maintenance_payable → 2160` ضمن نطاق #2251 (محجوز).

---

# ملحق — مسودّتا issue جاهزتان (للمراجعة قبل الفتح)

## مسودّة A — البند 1
**العنوان:** `FIN-FIX-2150-CONFLATION: أغراض متمايزة تسقط على حساب 2150 العام`
**الأم:** #2230

> ## المشكلة
> 11 غرضًا محاسبيًّا متمايزًا (`cargo_freight_payable`, `commission_payable`, `fleet_fines_payable`, `fleet_trip_payable`, `leave_accrual_liability`, `legal_fee_payable`, `legal_payable`, `owner_payable`, `property_owner_payable`, `property_maintenance_payable`, `purchase_grni`) يسقط على حساب `2150` الواحد عند غياب ربط صريح. ولا توجد صفوف seed في `account_mappings` ⇒ الخلط نشط افتراضيًّا. يضرب صدق الميزانية ويمنع التقادم/التسوية بالطرف.
>
> ## المرحلة 1 — Audit
> لكل غرض: ما الحساب الصحيح؟ (حساب فرعي مخصّص: ذمم مُلّاك، GRNI، عمولات، غرامات...) — في وصف الـPR.
> ## المرحلة 2 — إصلاح محدود
> ربط purpose صريح لكل غرض عبر `account_mappings`/الـseed؛ + guard يفشل عند سقوط غرضين متمايزين على نفس الحساب العام (نظير lint الموجود). لا backfill تاريخي بلا إذن المالك.
> ## اختبارات
> assertion على `journal_lines`: كل غرض يُرحَّل على حسابه المخصّص لا 2150 العام.
> ## خارج النطاق
> تصحيح أرصدة تاريخية دون تفويض · تغيير شجرة الحسابات الكاملة.
> ## القبول
> لا غرضان متمايزان يتشاركان حسابًا عامًّا · guard أخضر · اختبارات تثبت الفصل.

## مسودّة B — البند 2
**العنوان:** `FIN-FX-REVALUATION-AUTOMATION: أتمتة إعادة تقييم العملات (محرّك بدل تذكير)`
**الأم:** #2230

> ## المشكلة
> منطق إعادة التقييم كامل (`computeRevaluationLines`/`runPeriodEndRevaluation` → `fx_revaluation_log`؛ endpoint `POST /finance/gl-helpers/fx-revaluation/:id`)، لكن الترحيل **يدوي** — وظيفة cron الوحيدة الشهرية هي تذكير CFO (`monthly_fx_revaluation_reminder`). إضافةً: نصّ التذكير يحيل إلى رابط خاطئ (`/finance/fx/revaluation/post`).
>
> ## المرحلة 1 — تحقّق
> هل `runPeriodEndRevaluation` يُحسب دوريًّا؟ كم سجلّ pending متراكم؟ ما تعرّض غير-SAR الحالي؟
> ## المرحلة 2 — أتمتة (profile على المحرك الدوري)
> تشغيل التقييم + ترحيل آلي شهري (نمط `monthly_auto_depreciation`) مع بوّابة الإقفال + idempotency؛ + إصلاح رابط التذكير ليطابق المسار الفعلي.
> ## اختبارات
> assertion على `journal_lines`: قيد إعادة تقييم متوازن (DR/CR على `fx_revaluation_gain/loss` + `ar/ap`) لا يتكرّر لنفس الفترة.
> ## خارج النطاق
> تغيير مصادر الأسعار · backfill تاريخي بلا إذن.
> ## القبول
> إعادة التقييم تُرحَّل آليًّا للفترات ذات التعرّض · رابط التذكير صحيح · guard أخضر.
