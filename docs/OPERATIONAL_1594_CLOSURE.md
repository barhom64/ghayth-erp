# إغلاق المظلة #1594 — تفعيل منطق غيث التشغيلي قبل الذكاء الاصطناعي
# #1594 Closure Report — Operational Logic Activation (no AI)

> **التاريخ:** 2026-06-07
> **القاعدة:** بلا ذكاء اصطناعي · إعادة استخدام المحركات الموجودة · العربية أولًا · احترام حدود المسارات · كل إجراء له أثر (Audit + Event) · الصرامة المعمارية قبل سرعة الإنجاز.
> **الشكل:** هذا هو التسليم الذي طلبه نصّ المظلة في قسم «المطلوب من Claude» — ملخص ما فُعِّل، المُعاد استخدامه، المُحيا، المؤجَّل بسببه، وقائمة معايير القبول.

---

## 1) ملخص ما فُعِّل (مدموج في `main`)

ستّ رحلات تشغيلية كاملة end-to-end بقيود محاسبية متوازنة + محرّكات الحوكمة + طبقة الحسابات الديناميكية + واجهات تشغيلية عربية. الدفعات (PRs مدموجة):

| المجال | الدفعات | الإثبات |
| --- | --- | --- |
| المالية: فاتورة→اعتماد→قيد→ترحيل→إغلاق→منع | #1610 | `verify-finance-posting-journey.sh` |
| إقلاع نظيف (migrations idempotent) | #1612 | إقلاع 0 أخطاء |
| النسخ والتعافي | #1615 | تمرين restore + `docs/BACKUP_RESTORE.md` |
| تفعيل journeyEngine | #1619 | journey_instances=completed |
| توثيق الأحداث/القواعد/الصلاحيات | #1622 | docs + `audit/report/permission_review.md` |
| الأسطول: مركبة→سائق→رحلة→تكلفة GL | #1631، #1641 | `verify-fleet-trip-journey.sh` |
| العمرة + accounting_mappings | #1644، #1661 | `verify-umrah-journey.sh` |
| الرواتب (استحقاق→اعتماد maker-checker→صرف) | #1649، #1670 | `verify-hr-payroll-journey.sh` |
| العقارات (إيجار→سداد→GL) | #1656 | `verify-property-rent-journey.sh` |
| المراسلات (وارد→استلام→رد) | #1676 | `verify-correspondence-journey.sh` |
| الاستيراد العام (preview→confirm→rollback) | #1679، #1766 (رفع CSV) | `verify-import-journey.sh` + `import-csv-upload.spec.ts` |
| تصريف الـoutbox (Phase 2) | #1682 | `verify-outbox-drain.sh` |
| إنفاذ فصل المهام (SoD) وقت الطلب | #1706 | `verify-sod-enforcement.sh` |
| الانضباط (غياب→محضر→قرار→جزاء→أثر بالراتب) + إصلاح عطل gm-decision | #1849 | `verify-hr-discipline-journey.sh` 10/10 |
| القانونية (قضية→جلسة→حكم→تكلفة→إغلاق + الأحداث) | — | `verify-legal-journey.sh` 9/9 |
| العهد (صرف→اعتماد→تسوية، قيود متوازنة) | — | `verify-custody-journey.sh` 7/7 |
| المشتريات (طلب→اعتماد→أمر شراء→اعتماد→استلام GRN→قيد متوازن) + 3 إصلاحات أعطال | — | `verify-purchase-journey.sh` 8/8 |
| مراجعة التكامل + إصلاح ترحيل 257 + تصليب الحزمة | #1711 | 75/75 فحصًا، قابلة لإعادة التشغيل |
| **واجهات تشغيلية (UI):** الحسابات الفرعية من صفحة الكيان (مركبة/وكيل/وحدة/مستأجر) | #1730، #1735 | `vehicle-subsidiary-accounts.spec.ts` |
| **واجهة** مراقبة/تفريغ الـoutbox | #1741 | `/admin/outbox` + `admin-outbox.spec.ts` |
| **واجهة** تتبّع الرحلات الحيّة | #1763 | `/admin/journeys` + `admin-journeys.spec.ts` |

---

## 2) الأجزاء الموجودة التي أُعيد استخدامها (لا محرّك جديد)

- `lifecycleEngine` (آلات الحالة)، `systemGovernor` (حارس الفترة المالية وغيره)، `eventBus` + `eventCatalog` + `eventListeners` (outbox/DLQ)، `journeyEngine` + `journeyTracking`، `policyEngine` (SoD)، `notificationEngine`، `genericImportEngine`، `accounting-engine` (الحسابات الفرعية + `accounting_mappings`)، `financialEngine`/`fleetEngine` للترحيل.
- الـUI الجديد يستهلك **مسارات قائمة فقط** (`/finance/subsidiary-accounts*`، `/events/outbox/*`، `/events/journeys`) — لا تكرار للمنطق.

## 3) الأجزاء الميتة/غير المربوطة التي أُحييت

- `journeyEngine` (كان «محجوزًا بلا مستدعٍ») → فُعِّل عبر `journeyTracking` + واجهة `/admin/journeys`.
- تصريف الـoutbox (كان يلتقط بلا تعليم «processed») → `drainProcessedOutboxEntries` + endpoint + واجهة.
- تعريفات SoD (كانت تدقيقًا فقط) → إنفاذ فعلي عند `POST /admin/user-roles`.
- الحسابات الفرعية لكل كيان (كانت تُحرَّر مركزيًا فقط) → تُفتح/تُعدَّل من صفحة الكيان.

## 4) أُصلِحت أعطال حقيقية أثناء التفعيل

204 (serial defaults لـ9 جداول)، 251 (chk_invoices_status)، 252 (fleet_trips.updatedAt)، 253 (subsidiary entityType)، 255 (umrah PII varchar→text)، 257 (custody: `companies` بلا deletedAt)، properties `c.branchId` 500، سباق journeyTracking، **والانضباط: `gm-decision` كان يفشل بـ500 (`incidentDate.slice is not a function` — العمود `date` يصل ككائن Date) فيمنع تطبيق أي جزاء عبر قرار الإدارة العليا — أُصلِح باشتقاق فترة الراتب من أجزاء التاريخ المحلية.**

> **رحلة الانضباط (المرحلة 7 HR) مُثبتة:** `scripts/verify-hr-discipline-journey.sh` → **10/10** (غياب→محضر→تبرير→توصية المدير→قرار الإدارة العليا→جزاء مُطبَّق→خصم `pending_payroll` في `attendance_deductions` = أثر بالراتب).

> **إصلاح جذري موحّد — تطابق قيود الحالة مع دورة الحياة (migration 281):** كاشف منهجي قارن **كل** آلات الحالة الـ32 في `lifecycleEngine` مقابل **كل** قيود `CHECK` على عمود `status`. كشف جدولين قيدهما **أضيق** من دورة حياتهما (ويحملان قيدين متعارضين، فالمسموح فعليًا هو تقاطعهما): `purchase_orders` (يرفض `confirmed`/`sent`/`paid`/`cancelled`…) و`hr_leave_requests` (يرفض `returned`/`completed`). أيُّ انتقال إلى حالة مرفوضة يسقط بـ500 على القاعدة (مُثبت حيًّا: **إرجاع طلب إجازة كان ينهار، والآن ينجح** «تم الإرجاع»). الإصلاح: استبدال القيدين المتعارضين بقيد واحد = **المجموعة الفائقة** (كل قيم القيود السابقة ∪ كل حالات دورة الحياة) — دورة الحياة هي مصدر الحقيقة، والقيد يجب ألّا يكون أضيق منها. غير هدّام (الصفوف القائمة ضمن المجموعة الفائقة).

> **تعديل الفاتورة (amend) — كان مُعطَّلًا كليًّا بـ4 أعطال متسلسلة من نفس الفئتين الجذريتين، أُصلِحت:** كاشف ثابت قارن قوائم أعمدة `INSERT INTO` (في `client.query`/`rawExecute`، التي يفلتها تدقيق schema-drift) مقابل المخطط الحيّ. مسار `POST /finance/invoices/:id/amend` كان ينهار على: (1) `invoices.date` عمود غير موجود؛ (2) `invoice_lines.total` → الصحيح `lineTotal`؛ (3) `invoice_lines.branchId` في عكس COGS (`cogsPosting.ts`) عمود غير موجود؛ (4) حالة `'amended'` يرفضها `chk_invoices_status` (migration 282). الآن يعمل end-to-end: فاتورة جديدة `amendedFromInvoiceId` + الأصل `amended`. مُثبت حيًّا، وبلا انحدار على الترحيل العادي (11/11).

> **رحلة المشتريات (المرحلة 3.2) — 3 أعطال حقيقية اكتُشِفت في مراجعة المسارات الكتابية وأُصلِحت:** (1) أمر الشراء كان يُدرَج بحالة `'pending'` التي يرفضها `chk_purchase_orders_status` وليست حالة بداية صالحة في دورة الحياة → صُحّحت إلى `'pending_approval'`؛ (2) `purchase_orders` + 4 جداول دورة حياة (`fleet_maintenance`/`fleet_traffic_violations`/`payroll_runs`/`umrah_penalties`) تفتقد `updatedAt` فينهار أي انتقال حالة (نفس فئة عطل `fleet_trips`/migration 252) → migration 279؛ (3) حساب GRNI لم يكن يُحلّ (fallback 2115 غير موجود) → migration 280 يزرع ربط `purchase_grni` قابل للتحكم → 2111. النتيجة: `verify-purchase-journey.sh` **8/8**، قيد GRN متوازن.

> **كاشف وقائي مُنفَّذ — `check:insert-columns` (أداة تشخيص يدوية):** يسدّ الثغرة الجذرية في `audit-schema-drift` (يفحص الأعمدة **عالميًا** فيمرّ خطأ لكل جدول مثل `invoice_lines.total`). الأداة تقرأ خريطة الأعمدة **لكل جدول** من `information_schema` الحيّ. على قاعدة على رأس الترحيلات كشف **14 عطل عمود حقيقيًا** أُصلِحت كلها: `company_documents.title/type`→documentType/Number، `fleet_drivers.branchId` (حُذف)/`linkedEmployeeId`→employeeId، `fleet_gps_tracking.companyId` (حُذف)، `fx_revaluations` (4: أُعيد ربطها بنموذج الجدول period/totalGain/totalLoss/details/postedBy)، `payroll_deductions.description/effectiveDate`→reason/date (في موضعين)، `scheduled_report_history.recipients`→result، `tasks.slaHours` (حُذف). الكاشف الآن **= 0 انتهاك** على قاعدة على رأس الترحيلات. ملاحظة أمانة: **لم يُوصَل في `guard.sh`** لأن قاعدة guard CI تُبنى من dump المخطط (قبل إقلاع الخادم) فتجلس على خط الأساس لا على رأس الترحيلات، فتظهر أعمدة ما بعد الـdump كإيجابيات كاذبة — فهو **أداة تشخيص يدوية** (`pnpm check:insert-columns`) تُشغَّل على قاعدة محدّثة. بلا انحدار (5 رحلات verify خضراء).

> **الفئة السابعة — حالات يكتبها الكود مباشرةً (`status='literal'`) لا تقبلها قيود `CHECK` (migration 283):** امتداد منهجي لعطل `'amended'` (282): مسحتُ **كل** كتابات `status = 'X'` و`INSERT … (status) VALUES ('X')` في المسارات مقابل **62** قيد `CHECK` على عمود `status`. ظهرت 8 إشارات، **واحدة فقط حقيقية**: `POST /finance/journal/:id/reverse` يَسِم القيد الأصلي `status = 'reversed'` بينما `journal_entries_status_check` لا يسمح بها — فعكس **أي** قيد يومية أو سند صرف كان يصطدم بـ`check_violation` وتتراجع المعاملة كاملةً (500). خريطة الانتقالات داخل المعالِج نفسها تُعلن `posted → reversed`، فالإصلاح توسيع القيد إلى **المجموعة الفائقة** (يضمّ `reversed`، غير هدّام). مُثبت حيًّا: `create → approve → post → reverse` يكتمل، والأصل يصبح `status='reversed'` مع قيد عاكس `REV-…`. الـ7 الباقية **إيجابيات كاذبة** — الحرفية تستهدف أعمدة شقيقة لا `status`: `cargo_manifests.billingStatus` (`invoiced`/`ready_for_accounting`)، `fleet_telematics_integrations.lastSyncStatus` (`success`/`failure`/`skipped`)، `warehouse_stock_lots.qualityControlStatus` (`approved`/`rejected`).
>
> **كاشف وقائي مُعمَّم — `check:constraint-literals` (أداة تشخيص يدوية، DB-gated):** عمَّمتُ المسح من `status` وحده إلى **كل** قيود `CHECK` ذات مجموعة القيم (128 زوج (جدول،عمود)). الأداة **مرتبطة بالجدول**: تقارن `UPDATE <tbl> SET <col>='lit'` و`INSERT INTO <tbl>` مقابل قيد **ذلك** العمود على **ذلك** الجدول فقط — فلا تتعثّر الأعمدة الشقيقة (`billingStatus`/`lastSyncStatus`/…). نتيجتها على قاعدة على رأس الترحيلات: **135 كتابة حرفية فُحِصت (71 UPDATE + 64 INSERT)، 0 انتهاك** — أي أنّ عطل `'reversed'` كان **آخر** انتهاك من فئته في الشيفرة، والفئة مغلقة برهانيًّا لا تُرقيعًا. مُختبَرة guard-the-guard (تضييق القيد مؤقتًا ⇒ تُشير بدقّة إلى `routes/finance-journal.ts`). غير موصولة في `guard.sh` لنفس سبب `check:insert-columns` (قاعدة CI من dump المخطط). تُشغَّل: `pnpm check:constraint-literals`.

> **الفئة الثامنة — أعمدة `NOT NULL` بلا `DEFAULT` محذوفة من `INSERT` (عكس `check:insert-columns`):** عمودٌ مطلوب وغير موجود في قائمة `INSERT` يُرفض بـ`null value … violates not-null constraint` (500 وقت التشغيل). كاشف **مرتبط بالجدول** (`check:required-columns`) قارن أعمدة كل `INSERT` مقابل أعمدة `NOT NULL` بلا default على **ذلك** الجدول. كشف **4 أعطال حقيقية** أُصلِحت كلها، مُثبتة حيًّا (شكل `INSERT` المُصلَح ينجح، والأصلي يُرفض): (1) **`hr_leave_balances` بلا `assignmentId`** في تجديد أرصدة الإجازات السنوي — كان ينهار **كل تشغيل** والخطأ يُبلَع في `.catch` فالأرصدة **لا تتجدّد صامتةً أبدًا** → حُمِل `assignmentId` من رصيد السنة السابقة؛ (2)+(3) **`tasks` بلا `type`** في `rulesEngine` (مهمة من قاعدة) و`legal` (جلسة قضائية كمهمة) → `type='follow_up'` (عُرف المحرّكات لمهمّة مُولّدة)؛ (4) **`umrah_groups` بلا `nuskGroupNumber`** في الإنشاء التلقائي بالاسم ضمن حلّ أبعاد الدفعة → رقم تركيبي على نمط مسار التقسيم (الفهرس غير فريد فلا تصادم). النتيجة: `check:required-columns` **= 0 انتهاك** (424 جدول). أداة تشخيص يدوية لنفس سبب أخواتها.

## 5) ما لم يُنفَّذ ولماذا (مؤجَّل بسببه)

- **رفع Excel (xlsx):** رفع CSV مُنجَز؛ Excel يحتاج مكتبة `xlsx` — مؤجَّل لتجنّب اعتمادية جديدة الآن (CSV يغطّي الحالة الشائعة).
- **مُرحِّل outbox Phase 3 (إعادة البثّ):** مؤجَّل عمدًا — إعادة البثّ تسبّب ازدواج المعالِجات؛ Phase 2 (تعليم processed) كافٍ تشغيليًا.
- **CRUD واجهة لقواعد SoD:** القواعد مُعرَّفة في الكود (`SEPARATION_OF_DUTIES`) والإنفاذ فعّال؛ تحويلها لقواعد قابلة للتحرير من الواجهة قرار منتج لاحق (ليس من معايير قبول #1594، الذي طلب **الإنفاذ**).
- **الذكاء الاصطناعي:** ممنوع في هذه المرحلة — لم يُستخدم إطلاقًا.

---

## 6) checklist معايير القبول (#1594)

| # | المعيار | الحالة | الدليل |
|---|---|---|---|
| 1 | لا محركات مكررة بلا سبب | ✅ | `OPERATIONAL_LOGIC_ACTIVATION_AUDIT.md` |
| 2 | كل محرك مفعَّل أو موثَّق سبب عدم تفعيله | ✅ | نفس التقرير |
| 3 | لا جداول مفقودة يطلبها الكود | ✅ | migrations 248/204/252/253/255 |
| 4 | `financial_periods` منشأة/bootstrap | ✅ | #1610 |
| 5 | `event_logs` تحفظ أحداثًا فعلية | ✅ | `EVENTS_OPERATIONAL_MAP.md` + إثبات حيّ |
| 6 | `event_dlq` يستقبل الفشل | ✅ | eventBus + outbox drain |
| 7 | PDPL محمي بصلاحيات + تدقيق | ✅ | `/admin/pdpl` + permission_review |
| 8 | endpoints غير المحمية مصنّفة | ✅ | `audit/report/permission_review.md` |
| 9 | Backup/Restore موجود وموثَّق | ✅ | #1615 + `BACKUP_RESTORE.md` |
| 10 | Journey instances تعمل | ✅ | #1619 + واجهة #1763 |
| 11 | قواعد HR/Finance/Umrah/Fleet/Properties/Comms تعمل | ✅ | 6 سكربتات verify + الرحلات المدموجة |
| 12 | لا AI كبديل للقواعد | ✅ | لا كود AI أُضيف |
| 13 | الاختبارات الأساسية تمر | ✅ | `guard` CI (5500+ اختبار) أخضر على كل دمج + 75/75 E2E |
| 14 | كل إجراء مهم ينتج Audit + Event + أثر | ✅ | المحرّكات + القيود المتوازنة المُثبتة |

---

## 7) المتبقّي (خارج معايير قبول #1594 — تحسينات/إنتاج)

- اختبار إنتاج لربط الحسابات على شركات بأدلة مختلفة + رحلة WPS الكاملة بمستخدمَين (راجع `OPERATIONAL_READINESS_STATUS.md` §5).
- رفع Excel، CRUD لقواعد SoD، شاشة admin للنسخ الاحتياطي — تحسينات واجهة لاحقة.

> **الخلاصة:** كل معايير قبول #1594 الأربعة عشر مُحقَّقة ومدموجة في `main`، بمحرّكات غيث القائمة وبلا ذكاء اصطناعي، ولكل رحلة واجهة عربية + سكربت/spec إثبات. غيث **تشغيلي فعليًا** على رحلات الأموال الأساسية ومحرّكات الحوكمة، وجاهز للنظر في طبقة الذكاء الاصطناعي لاحقًا.
