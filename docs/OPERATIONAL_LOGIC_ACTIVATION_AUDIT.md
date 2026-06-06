# تقرير جرد وتفعيل المنطق التشغيلي لغيث
# Operational Logic Activation Audit

> **المرجع:** Issue #1594 — تفعيل منطق غيث التشغيلي قبل الذكاء الاصطناعي
> **النوع:** المرحلة الأولى (جرد الموجود والميت والمكرر) — البوابة الإلزامية قبل أي كود جديد
> **التاريخ:** 2026-06-06
> **المنهج:** فحص فعلي على الكود الحالي (`claude/ghaith-operational-readiness-bvaUU`) + قاعدة بيانات حية (PostgreSQL 16) أُقلعت من `db/bootstrap.sh` + تطبيق كل الـ migrations + رحلة End-to-End فعلية عبر HTTP API.

---

## 0. ملخص تنفيذي

النتيجة الجوهرية: **النظام تطوّر كثيرًا منذ تقرير `GHAITH_FULL_SYSTEM_VERIFICATION_REPORT.md` (2026-05-06).** أغلب ما وُصِف هناك كـ«ناقص» أو «بلوكر» أصبح **مبنيًّا فعلًا** في الكود:

| البند في تقرير مايو | الحالة الفعلية الآن (يونيو) |
| --- | --- |
| `financial_periods = 0` (بلوكر) | ✅ تُزرع فترة مالية مفتوحة لكل شركة عبر `db/seed-financial-periods.sql` + `129_seed_financial_periods.sql` |
| الجداول المفقودة (7 جداول) | ✅ كلها موجودة كـ migrations (`119`, `170`, `021`, `248`, `074/125/150`, …) |
| `event_logs / dlq` غير مفعّلة | ✅ `eventBus` + `eventListeners` + نمط **outbox** (`event_outbox`, `187`) + `event_dlq` (`110`) كلها قائمة ومُسجّلة عند الإقلاع |
| `journey_instances` مفقود | ✅ الجدول موجود (`248`) والمحرك مكتمل — لكنه **غير مربوط بأي route** (محجوز بقرار منتج) |
| Import عام مفقود | ✅ `genericImportEngine` يغطي clients/suppliers/products/employees/expenses/invoices |
| خطر AI في التشغيل | ✅ `aiEngine` معزول في وظائف استشارية فقط (لا يستبدل أي قاعدة حتمية) |

لكن الفحص الحي كشف **بلوكرين تشغيليين حقيقيين** كانا يمنعان رحلة المالية فعليًا على أي قاعدة بيانات جديدة — وقد **أُصلِحا وأُثبِت إصلاحهما end-to-end** في هذا الـ PR (التفاصيل في القسم 4).

---

## 1. جرد محركات الحوكمة (Core Governance Engines)

المسار: `artifacts/api-server/src/lib/`

| المحرك | LOC | الحالة | الجداول | يُستدعى من | القرار المعماري |
| --- | --: | --- | --- | --- | --- |
| `lifecycleEngine` | ~865 | ✅ مفعّل بقوة (المنسّق المركزي) — 28 آلة حالة | `event_logs` (+ أي كيان) | 25 route | **إبقاء كما هو** |
| `systemGovernor` | ~220 | ✅ مفعّل — 6 حُرّاس (system_stop, company_active, **financial_period**, trial_limits, posting_failures, audit_violations) | `financial_periods`, `system_stops`, `financial_posting_failures`, … | middleware | **إبقاء** |
| `eventBus` | ~440 | ✅ مفعّل — outbox + DLQ + envelope versioning | `event_outbox`, `event_dlq` | 6 routes | **إبقاء** |
| `eventCatalog` | ~1572 | ✅ مرجع توثيقي (562 تعريف حدث) — بلا إنفاذ بقصد | — | تحقق فقط | **إبقاء كمرجع** |
| `eventListeners` | ~1971 | ✅ مفعّل ومُسجّل عند bootstrap (`index.ts`) — 50+ معالج | يكتب `event_logs`, `audit_logs`, `journal_entries`, … | عبر eventBus | **إبقاء** (يُنصح بتقسيمه لاحقًا للصيانة) |
| `workflowEngine` | ~1042 | ✅ مفعّل — 9 أنواع موافقات + SLA scanner | `workflow_*`, … | 6 routes | **إبقاء** |
| `policyEngine` | ~139 | ⚠️ **موجود لكن بلا إنفاذ وقت الطلب** — دوال تدقيق فقط (SoD, max-privilege) | `users`, `role_permissions` | admin (تدقيق) | **توسيع** → طبقة إنفاذ (مهمة Rules & Policies) |
| `notificationEngine` | ~724 | ✅ مفعّل — متعدد القنوات + DLP + قوالب + retry | `notifications`, `outbound_queue`, … | lifecycle/obligations/workflow | **إبقاء** |
| `obligationsEngine` | ~454 | ✅ مفعّل — متتبّع مهل عام + ماسح كل ساعة | `obligations` | 10 routes | **إبقاء** |
| `journeyEngine` | ~258 | ⚠️ **مكتمل + الجدول موجود (`248`) لكن صفر routes تربطه** — محجوز بقرار منتج | `journey_instances` | لا شيء | **تفعيل/ربط** (مهمة Journey Activation) |
| `audit` / `auditDiff` | 49 / 31 | ✅ مفعّل — يكتب `audit_logs` مع diff | `audit_logs` | عبر eventListeners | **إبقاء** |
| `rbacCatalog` | ~399 | ✅ مفعّل — ثوابت مجموعات الأدوار (واجهة legacy) | `role_permissions` (بذر) | 25 route | **إبقاء** |

## 2. جرد المحركات النطاقية (Domain Engines)

كلها **كود حقيقي ومربوط** (لا stubs):

| المحرك | الحالة | ملاحظة |
| --- | --- | --- |
| `disciplineEngine` (~493) | ✅ حتمي ومربوط | جزاءات HR بقواعد لائحية — لا AI |
| `autoViolationEngine` (~580) | ✅ مجدول (cron) | كشف تأخير/غياب يومي + مذكرات استفسار |
| `umrahImportEngine` (~1281) | ✅ مربوط | استيراد معتمرين/فواتير NUSK — لا يُبنى محرك استيراد جديد للعمرة |
| `umrahCommissionEngine` (~474) | ✅ مربوط | عمولات بـ snapshot قابل لإعادة الاحتساب |
| `umrahInvoicingEngine` (~1225) | ✅ مربوط | فواتير بيع + ترحيل GL |
| `genericImportEngine` (~481) | ✅ مربوط | **يغطي** clients/suppliers/products/employees/expenses/invoices — التوسعة = adapter جديد في `importAdapters.ts` فقط |
| `kpiEngine` (~326) | ✅ حتمي (SQL aggregation) | لا AI |
| `proactiveEngine` (~605) | ✅ مجدول + event-driven | إنشاء مهام/تنبيهات بقواعد (انتهاء عقود، تأخر تحصيل…) |
| `fiscalPeriodLifecycle` (~119) | ✅ مربوط | إقفال الفترة المالية بحُرّاس + audit + event |
| `recurringJournalProcessor` (~101) | ✅ مجدول | قيود دورية مع idempotency |
| `accountingAllocation` (~599) | ✅ مربوط | توزيع GL سطري (Phase 5.2) |
| `aiEngine` (~215) | ✅ **معزول استشاريًا فقط** | الدوال الخطرة (`rulesEngineEvaluate`, `predictorForecast`) تُستدعى فقط من `/intelligence` ولا تكتب جداول تشغيلية — **مطابق لشرط «لا AI في المنطق التشغيلي»** |

### ملاحظة AI (شرط #1594 الحاسم)
لا يوجد أي مكان يستبدل فيه الذكاء الاصطناعي قاعدة حتمية في الترحيل/الرواتب/الجزاءات/الاستيراد. التوصية الاحترازية: وضع `rulesEngineEvaluate`/`predictorForecast` خلف feature-flag صريح منفصل عن `admin` لمنع أي إساءة استخدام مستقبلية.

---

## 3. حالة عناصر P1 (الجداول والأحداث)

| العنصر | الحالة | الدليل |
| --- | --- | --- |
| `financial_periods` | ✅ موجود + يُبذر فترة مفتوحة/شركة | `129`, `207`, `db/seed-financial-periods.sql` — تحقق حي: فترة «السنة المالية 2026» مفتوحة للشركتين 1 و2 |
| `journey_instances` | ✅ موجود (`248`) — المحرك غير مربوط | — |
| `financial_posting_failures` | ✅ موجود (`119`) — يكتب فيه 7 مواضع | — |
| `budget_approval_requests` | ✅ موجود (إنشاء وقت التشغيل في `finance-budget.ts` + ALTER `074`) | — |
| `employee_salary_components` | ✅ موجود (`021`) — يُستخدم في `employees.ts` | — |
| `vendor_contracts` | ✅ موجود (`170`) — CRUD + تنبيه انتهاء (cron) | — |
| `event_logs` | ✅ موجود (append-only) — يكتب فيه lifecycle/listeners | — |
| `event_dlq` | ✅ موجود (`110`) — فشل الأحداث | — |
| `event_outbox` | ✅ موجود (`187`) — التقاط transactional (Phase 1؛ المُرحِّل لاحقًا) | — |

> **استنتاج:** «الجداول المفقودة» في تقرير مايو لم تعد مفقودة. البلوكر الحقيقي لم يكن غياب الجداول، بل **خلل في تعريف بعضها** (القسم 4).

---

## 4. البلوكرات التشغيلية الحقيقية المكتشَفة والمُصلَحة في هذا الـ PR

تم اكتشافهما بتشغيل قاعدة بيانات حقيقية من `db/bootstrap.sh` ومحاولة تنفيذ رحلة المالية فعليًا.

### 4.1 — أعمدة `id` بلا قيمة افتراضية (9 جداول) — `204_repair_serial_id_defaults.sql`

**العَرَض:** كل `INSERT` يعتمد على `serial` يفشل بـ:
`null value in column "id" of relation "<table>" violates not-null constraint`

**السبب الجذري:** الجداول أُنشئت في migrations بـ `id serial`، لكن نسخة الـ baseline dump (`db/schema_pre.sql`) التقطتها كـ `id integer NOT NULL` **وفقدت قيمة الـ sequence الافتراضية**. وبما أن الجدول صار موجودًا من الـ dump، فإن `CREATE TABLE IF NOT EXISTS` في الـ migration الأصلي يصبح no-op ولا يُعيد القيمة الافتراضية.

**نطاق الأثر (مُتحقَّق):**
`accounting_allocation_results` (**يمنع ترحيل GL للفواتير**)، `accounting_allocation_rules`، `budget_approval_requests` (**يمنع موافقات الميزانية**)، `vendor_contracts` (**يمنع إنشاء عقود الموردين**)، `tax_codes` (أفشل migration `205`)، `wht_categories` (أفشل migration `208`)، `fleet_alerts`، `umrah_attachments`، `umrah_import_mapping_presets`.

**الإصلاح:** migration `204` idempotent يُعيد بناء/ربط sequence ويضبط الـ default على max(id)+1 لكل جدول متأثر. رُقِّم `204` ليعمل **قبل** `205/208` فتنجح بذور tax_codes/wht.

### 4.2 — قيد حالة الفاتورة لا يسمح بـ `posted` — `251_align_invoice_status_constraint_with_lifecycle.sql`

**العَرَض:** `POST /finance/invoices/:id/post` يفشل دائمًا بـ:
`new row for relation "invoices" violates check constraint "chk_invoices_status"`

**السبب الجذري:** آلة الحالة في `lifecycleEngine` تعرّف للفاتورة الحالات `posted/partial/returned/closed`، بينما قيد `chk_invoices_status` (من `084` + dump) لا يسمح بها. أي: تُعتمد الفاتورة ويُنشأ قيدها لكن **يستحيل ترحيلها**.

**الإصلاح:** migration `251` يوحّد القيد ليشمل حالات legacy + حالات دورة الحياة (`posted/partial/returned/closed`).

### 4.3 — إثبات الرحلة (End-to-End، على قاعدة نظيفة بلا تعديل يدوي)

السكربت القابل لإعادة التشغيل: `scripts/verify-finance-posting-journey.sh`

| الخطوة | النتيجة |
| --- | --- |
| إنشاء عميل | ✅ |
| إنشاء فاتورة (2×750 + 15% ضريبة = 1725) | ✅ |
| اعتماد → قيد GL متوازن | ✅ مدين 1200 ذمم 1725 / دائن 4000 إيراد 1500 / دائن 2300 ضريبة 225 |
| ترحيل (`/post`) | ✅ الحالة = `posted` |
| إغلاق الفترة المالية | ✅ الحالة = `closed` |
| محاولة الترحيل بعد الإغلاق | ✅ **مرفوض** بـ `SYSTEM_GUARD_BLOCK / financial_period` |

---

## 5. ملاحظات إضافية (خارج نطاق هذا الـ PR — للمتابعة)

1. **هجرات تفشل على إقلاع نظيف (idempotency drift):** `200_users_preferred_calendar_locale`, `219_vendor_settings_hub`, `232_portal_client_links_composite_fk`, `244_companies_subscription_scaffolding` — كلها من نوع «الكائن موجود مسبقًا» بسبب تداخل الـ dump. غير مرتبطة بالمالية. **مرشّحة لمهمة تنظيف migrations** + إعادة توليد `db/schema_pre.sql / schema_post.sql` (وهو الإصلاح الجذري لمشكلة 4.1 أيضًا).
2. **`journeyEngine`:** جاهز بالكامل بلا ربط — يُفعَّل ضمن مهمة Journey Engine Activation (ربط `startJourney/advanceJourney` بمستمعي الأحداث الرئيسية).
3. **`policyEngine`:** يحتاج طبقة إنفاذ وقت الطلب — مهمة Rules & Policies Activation.
4. **VAPID / WhatsApp / SMS:** تتدهور بلطف عند غياب الإعداد (ليست أعطالًا).

---

## 6. مطابقة معايير القبول (#1594) — حالة هذا الـ PR

| المعيار | الحالة |
| --- | --- |
| لا محركات مكررة بلا سبب | ✅ تم الجرد — لا تكرار؛ التوصيات «توسيع/ربط» لا «بناء جديد» |
| كل محرك إما مفعّل أو موثّق سبب عدم تفعيله | ✅ (journeyEngine/policyEngine موثّقان) |
| لا جداول يطلبها الكود وهي مفقودة | ✅ كلها موجودة (المشكلة كانت تعريف لا غياب) |
| `financial_periods` منشأة/bootstrap جاهز | ✅ |
| `event_logs` تحفظ أحداثًا فعلية | ✅ (outbox + listeners) |
| `event_dlq` يستقبل الفشل | ✅ |
| رحلة المالية تعمل end-to-end | ✅ مُثبَتة (القسم 4.3) |
| لا AI كبديل للقواعد | ✅ |

> هذا الـ PR يغطّي **بوابة المرحلة الأولى (الجرد)** + **أول بلوكر تشغيلي (المالية)**. بقية المهام موزّعة كمهام فرعية تحت #1594 (Epic).

---

## 7. اكتشافات رحلات المسارات (Fleet / Umrah / Payroll) — #1609

عند قيادة الرحلات التشغيلية عبر الـAPI الحقيقي، ظهر التالي:

### 7.1 — عطل برمجي حقيقي مُصلَح: `fleet_trips.updatedAt`
إكمال رحلة الأسطول (`POST /fleet/trips/:id/complete`) كان يفشل بـ **500**:
`column "updatedAt" of relation "fleet_trips" does not exist` — لأن `lifecycleEngine.applyTransition` يكتب `updatedAt` دائمًا بينما الجدول يفتقده. **الإصلاح:** migration `252_fleet_trips_updated_at.sql` (مُتحقَّق: اختفى الـ500). الأسطول صار يكمل حتى خطوة الترحيل المحاسبي.

### 7.2 — بلوكر مشترك (config لا code): ربط الحسابات ناقص
محركات Fleet/Umrah/Payroll ترحّل على **أكواد GL افتراضية لا تطابق دليل الحسابات المزروع**، فيُرفض الترحيل:
- الأسطول يرحّل الوقود على `5200`، لكن `5200` = «مصروفات الموظفين» (تجميعي غير قابل للترحيل)؛ مصروفات الأسطول الفعلية تحت `55xx` (وقود 5510، صيانة 5520، تأمين 5530…).
- العمرة تحتاج `4200`/`2300` غير الموجودَين كأوراق قابلة للترحيل في كلتا الشركتين التجريبيتين.
- الرواتب تحتاج حسابات راتب/التزام + اكتمال الحضور لكل الموظفين.

**التشخيص:** الحاجة إلى **بذر `account_mappings` لكل شركة** يربط كل مفتاح GL منطقي (`fleet_fuel_expense`, `fleet_driver_fare`, `umrah_invoice_revenue`, …) بحساب **فرعي قابل للترحيل** صحيح. هذا قرار مالي يجب أن يُتخذ بدقة (لا يُخمَّن) — لذا لم يُنفَّذ تلقائيًا تفاديًا لترحيلات خاطئة.

### 7.3 — الحالة
- **`scripts/verify-fleet-trip-journey.sh`** يُثبت: مركبة → سائق → تأمين → رحلة (`in_progress`) ✅؛ والترحيل المحاسبي **معلّق على بذر ربط الحسابات** (موثّق داخل السكربت).
- **متابعة #1609 / #1602:** مهمة «بذر `account_mappings` كامل لكل شركة» تفتح Fleet + Umrah + Payroll end-to-end دفعة واحدة (كلها محظورة بنفس السبب). الرحلات الأخرى (HR كاملة، عمرة) جاهزة منطقيًا وتنتظر هذا البذر.
