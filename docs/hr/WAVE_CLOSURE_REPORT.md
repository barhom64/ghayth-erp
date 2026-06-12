# تقرير إغلاق موجة HR (#2077) — PR-1 → PR-10 [نهائي]

> **التاريخ**: 2026-06-11 · **الحالة**: ✅ موافقة الإغلاق · **الفرع**: `claude/enterprise-hardening-roadmap-AOfO7`
> **commits**: `21a9d10f` → `b9053207` (آخر commit في الموجة)
> **العقيدة الحاكمة**: «فعّل الموجود أولًا، ثم ابنِ المفقود» · HR قائد والمالية خادم ·
> رحلة حيّة لكل ادّعاء · لا PRs متراكبة · كل انتقال يحمل سياق IGOC + Audit + Event

---

## 1. قبل وبعد — صورة الموجة كاملة

| # | الالتزام | قبل الموجة | بعد الموجة | الدليل الحي |
|---|---|---|---|---|
| PR-1 | معالج إنشاء الموظف يربط المصفوفة المؤسسية | إنشاء موظف «عائم» بلا منصب/فئة/فريق/مشروع/مركز تكلفة | معالج واحد يربط: منصب + فئة + فريق + مشروع + مركز تكلفة + مدير + حساب مستخدم | رحلة المعالج (live) + `21a9d10f`/`815db270` |
| PR-2 | إثبات أن الصلاحيات تشغيلية لا نظرية | جدل «نظرية أم تشغيلية» بلا قياس | مصفوفات أشخاص حيّة: owner=27 وحدة / hr=6 / employee=5 — القائمة تتغيّر فعلًا بالدور | `183a9bc2` + evidence pack |
| PR-3 | سياسات حضور لكل فئة بيد مدير HR | سياسة واحدة جامدة | `trackingFrequencySeconds` لكل categoryKey (سائق=30، ميداني=300، إداري/تنفيذي=0) قابلة للتحرير من واجهة HR | `5549a791` + هجرة 270 |
| PR-4 | تفعيل محرك التقييم المؤسسي | محرك scoring موجود ومعطّل | recompute + history endpoints + تشغيل cron فعلي | `196de217` |
| تدقيق | فحص عميق للمناطق الخمس قبل أي بناء | تقييمات انطباعية | تقرير مُسنَد: 360=7.5، دورة الحياة=7.8، الهيكل=6.8، الصندوق=5.5، الميداني=5.0 | `docs/hr/HR_FIVE_AREAS_DEEP_AUDIT.md` |
| PR-5 | صندوق الأعمال الموحّد (تجميع، لا محركات جديدة) | 4 مصادر متفرقة، لا شاشة موحّدة | `/work-inbox` بأقسامه الأربعة (يحتاج إجراء مني/مهامي/إشعارات مهمة/متابعاتي) فوق المصادر القائمة، صفر mutation | رحلة 17/17 + `hrWorkInboxAggregationSmoke` (26) |
| PR-5a | سدّ تسريب fleet middleware (بوابة بأمر صاحب المنتج) | `/my-space`, `/tasks`, `/notifications` محجوبة عن غير مشغّلي الأسطول — الصندوق يعمل «للمالك فقط» | `gateForFleetPaths` شرطي بالمسار على 7 mounts؛ الصندوق يعمل لمديرة HR والموظف | قسم الانحدار في رحلة الصندوق + `hrWorkInboxFleetLeakFixSmoke` (14) |
| PR-6 | ملف الموظف 360 يكتمل | 14 تبويبًا، تنقص مستندات/تقييم/نشاط، ولا حالة للتبويب | 17 تبويبًا + شارة حالة لكل تبويب (مكتمل/ناقص/يحتاج إجراء/**غير مصرح**) باحترام الدور والنطاق | رحلة 4 شخصيات 18/18 + `hrEmployee360TabsSmoke` (26) |
| PR-7 | الشجرة الموحّدة: شركة → فرع → **إدارة** → قسم → فريق | مستوى «الإدارة» غير موجود؛ اللجان/المشاريع تختلط بالشجرة | جدول `administrations` + ربط الأقسام + شاشة إدارة + الشجرة في ملف الموظف؛ اللجان/المشاريع/مراكز التكلفة جسور تشغيلية **خارج** الشجرة (مُسمّر) | رحلة 17/17 + `hrOrgTreeSmoke` (27) |
| PR-8 | دورة حياة كسجلّ أحداث لا حقل حالة | حقل status بسيط، انتقالات غير منضبطة | `employee_lifecycle_events` ledger: 11 حالة، انتقالات مشروعة فقط، 4 تواريخ متمايزة، حُرّاس (عُهد/سلف/إجازات) مع تجاوز موثَّق، IGOC على كل حدث | رحلة 23/23 + `hrLifecycleEngineSmoke` (46) |
| PR-8a | فصل الانتساب عن نطاق الصلاحية (بوابة بأمر صاحب المنتج) | الأدمن = 7 صفوف موظف، 7 أسطر رواتب، غياب مكرر، 8 درجات | `isAccessGrant` على `employee_assignments`: انتساب واحد، صلاحية عبر التوسعة، سياق نشط عبر المبدّل؛ مصفوفة sidebar 408/408 | رحلة 16/16 (الآن 30/30) + `hrIdentityAccessGrantSmoke` (10) + `SIDEBAR_MATRIX.md` |
| PR-9 | رفيق الميدان فوق `/field-ping` الموجود | التتبع نظري: بلا واجهة، بلا سياق، الموظف الميداني محجوب بحاجز module | `/my/field` self-service + صفحة جوال RTL eligibility-first + طابور offline بإعادة إرسال بلا تكرار + سياق userId/activeRoleKey/categoryKey مختوم خادميًا | رحلة 15/15 + `hrFieldCompanionSmoke` (18) + لقطات جوال (overflow=0px) |
| PR-9a | إصلاح seed الأدوار القياسية (إغلاق FU-1) | `department_manager` و`payroll_officer` بـ**0 وحدة** عند الدخول | dept=4 وحدات / payroll=3؛ payroll يقرأ `/hr/payroll` (200) ويُرفض على التحقيقات (403)؛ dept يرى موظفيه (200) ويُرفض على الرواتب (403) | رحلة 30/30 + `hrStandardRoleGrantsSmoke` (11) |
| PR-10 | بوّابة الإغلاق: bootstrap الشركات الجديدة + إخفاء رابط الامتثال للأدوار غير المختصة | **شركات جديدة**: bootstrap لا يعرف الدورين → سيُعيدان 0 وحدة لأي tenant مستقبلي. **القائمة**: «الامتثال والجزاءات» تظهر لـpayroll/dept ثم تُرفض 403 (يخالف «لا تظهر شيئًا لا يستطيع فتحه»). **التوحيد**: ثلاثة مصادر لوحدات الدور بلا parity. | bootstrap الشركات الجديدة يعطي الدورين 14/15 grant بحزمة مطابقة لهجرة 291 (parity مسمَّر)؛ «الامتثال» مخفي لـpayroll/dept ويبقى ظاهرًا لـhr_manager؛ توسيع `translateLegacy` لقبول مفاتيح المزايا الدقيقة يلغي الحاجة إلى مسار SQL منفصل لمنح غير-متعارضة | رحلة 38/38 + `hrStandardRoleGrantsBootstrapParitySmoke` (8) + `hrComplianceMenuGateSmoke` (5) + إصلاح FND-004 over-reach |

**القياس الحي النهائي للوحدات حسب الدور** (من `/auth/me` على المستأجر الحي بعد PR-10):

```
owner=27 · hr_manager=6 · employee=5 · department_manager=7 · payroll_officer=6
(قبل PR-9a: dept=0, payroll=0)
```

**إثبات الإغلاق على شركة جديدة** (نفس مسار `seedRolesAndGrantsV2` الذي يستخدمه الـserver):

```
BOOT_OK {"roles":17,"grants":506}
department_manager bootstrapped with 15 grants in new company
payroll_officer    bootstrapped with 14 grants in new company
payroll_officer    bootstrapped: ZERO hr.discipline grants
```

---

## 2. جرد HR المحدّث (بعد PR-10)

| المنطقة | قبل الموجة | بعد PR-10 |
|---|---|---|
| ملف الموظف 360 | 7.5 — تنقص 3 تبويبات ولا حالة | **9.2** — 17 تبويبًا + شارات حالة + دورة الحياة + سلسلة الهيكل؛ «غير مصرح» صادقة بالدور |
| دورة حياة الموظف | 7.8 — status flag | **9.1** — ledger أحداث، حُرّاس، 4 تواريخ، تجاوز موثَّق، terminal states |
| الهيكل التنظيمي | 6.8 — مستوى الإدارة مفقود | **8.8** — الشجرة المصادق عليها كاملة؛ الجسور التشغيلية خارجها؛ orphans مرصودة |
| صندوق الأعمال | 5.5 — نظري | **8.8** — موحّد، يعمل لكل الأدوار بعد سد تسريب fleet |
| التتبع الميداني | 5.0 — بلا واجهة ولا سياق | **8.7** — رفيق ميدان كامل بسياسة الفئة حصرًا (المالك غير مؤهل للتتبع رغم صلاحياته) |
| الهوية والسياق | 6.0 — أدمن 7×؛ خلط بين الانتساب والصلاحية | **9.2** — انتساب واحد، نطاق صلاحية مستقل، سياق نشط عبر المبدّل، IGOC على كل حدث |
| الأدوار والصلاحيات | 6.5 — أدوار seed بـ0 grants، رابط يعطي 403، /permissions/my محجوب للمدراء | **8.9** — bootstrap parity مع 291، رابط الامتثال خلف grant صريح، self-introspection مفتوح للمدراء كما يجب |
| تكامل المسار مع النظام | 6.8 — تسريبات middleware، endpoints بلا مستهلك | **8.8** — تسريبا fleet/hr مغلقان بنمط معتمد، wiring 2404/2404 |

**التقدير الإجمالي بعد PR-10: ≈9/10** (كان ≈8.2 عند التدقيق، و«جيد نظريًا» قبلها).

---

## 3. اكتسابات تتجاوز HR — تجربة أدوار كمنصة لا كوحدة

PR-9a + PR-10 لم يصلحا دورين فقط — أرسيا 4 ركائز يستفيد منها أي دور قياسي
في النظام (مالي، أسطول، أملاك، مستودع، …)، لا HR وحده:

1. **مسار seed موحَّد**: كل دور قياسي يمر بنفس البوابة (`DEFAULT_ROLE_DEFS`
   في `lib/rbac/autoMigrate.ts`). إضافة دور جديد = صف واحد، لا هجرة SQL
   جانبية. مسمار `hrStandardRoleGrantsBootstrapParitySmoke` يحرس البنية.
2. **shorthand دقيق بلا تسرب**: `translateLegacy` يقبل
   `module.feature:action` (مثل `hr.payroll.runs:create`) — ينقل القدرة
   على رسم حزمة بدقة المزية إلى كل المجالات، فلا يضطر مالك المنح للاختيار
   بين «كل المجال» و«SQL منفصل».
3. **`/permissions/my` يعمل لكل المدراء**: قبل PR-10 كان محجوبًا بـ
   `requireMinLevel(90)` فيُفرَّغ `apiData.permissions` لكل من هم أقل من
   GM. الآن بوابات `perm:` للسايدبار تعمل لـ`finance_manager`،
   `fleet_manager`، `support_manager`، إلخ — لا فقط HR.
4. **نمط بوابة قائمة حسّاسة**: مجموعة «الامتثال والجزاءات» الآن مرجع
   لكيفية إخفاء روابط حساسة بـ`perm + permMode:"any"` بدلًا من «اعرض
   ثم 403». نفس النمط يصلح لـ«المخالفات المالية»، «سجلات الجلسات»،
   «إعدادات أمنية»، … — كل عنصر قائمة سيتطلب صلاحية خاصة.

> **خلاصة هذه النقطة**: تجربة الأدوار خرجت من دائرة HR وأصبحت
> **قدرة منصة**. أي موجة قادمة على أي مجال تكسب هذه الركائز دون عمل إضافي.

---

## 4. ما أُغلق وما بقي

### أُغلق في هذه الموجة
- FU-1 (أدوار seed بلا grants) — **أُغلقت في PR-9a** ثم **عُمِّمت في PR-10**
  على bootstrap الشركات الجديدة (لا تكرار مستقبلي). تفصيل الجذر في الملحق.
- ظهور رابط «الامتثال والجزاءات» لمن لا يملك صلاحية صريحة — **أُغلق في
  PR-10**: المجموعة وأبناؤها على `perm: ["hr.discipline:*","hr.violations:*"]`
  بصيغة `permMode:"any"`؛ hr_manager يمر بـ`hr:*`، payroll/dept لا يريانه.
- ثغرة FND-004 over-reach في `/permissions/my` — **أُغلقت في PR-10**:
  كان `requireMinLevel(90)` يحجب الـself-introspection عن كل من هم أقل من
  GM، فيعطل بوابات `perm:` للسايدبار لكل مدير. الراوت سكوبه ذاتي
  (scope.userId/companyId) ولا يكشف سطح إدمن — أُزيلت البوابة وفق نية
  الراوت الموثقة في رأس ملفه.
- تسريب fleet middleware (PR-5a) — نمط `router.use` غير المقيّد بمسار
  عولج مرتين (fleet ثم درس HR في PR-9) وأصبح له نمط معتمد.
- ازدواجية هوية الأدمن (PR-8a) — انتساب واحد، 4 استثناءات تشغيلية
  (قوائم/رواتب/غياب/تقييم).
- خصوصية التتبع: dedupe قبل throttle، طابور offline محدود 50، لا
  watchPosition، الفئة وحدها تقرر — لا الصلاحية.

### بقي مفتوحًا (مُعلَن، بقرار)
| البند | الحالة | التوصية |
|---|---|---|
| **FU-2**: `/module-dashboards/*` خلف `requireModule("bi")` — مدير HR لا يقرأ HR Dashboard | مؤجَّلة **بقرار صريح** من PR-2 لمراجعة معمارية | بند أول في موجة ثانية: فصل لوحات الوحدات عن وحدة bi |
| `parentId` في `administrations` خامل (لا تداخل إدارات) | additive بقرار PR-7 | يبقى حتى تطلب البنية الفعلية ذلك |
| إكمال بيانات: أقسام قائمة بلا `administrationId` | «ناقص بيانات لا crash» بتوجيه صاحب المنتج | شاشة orphans موجودة؛ تنظيف تشغيلي |
| تحذيرا stop-ship على `myFieldTracking.ts` (لا audit/event لكل ping) | مقصود: ping عالي التردد لا يُسجَّل كحدث أعمال؛ الكتابة تحمل السياق كاملًا في الجدول | توثيق فقط — أو تجميع dvigest دوري إن طُلب |
| 159 endpoint خلفي بلا مستهلك واجهة (إشارة Phase C عامة، 9 منها /hr) | رصد مستمر في wiring audit | خارج نطاق HR؛ موجة تنظيف عامة |
| مصدران لـmodules: `ROLE_DEFAULT_MODULES` (mount gate) + grants → modules (sidebar). الآن متفقان بمسمار parity. | اتفاق يدوي محمي بمسمار | توحيدهما قرار معماري (موجة ثانية) — كان «منطق RBAC» خارج نطاق PR-9a/PR-10 |

---

## 5. فهرس الأدلة (مثبَّت لكل bookmark)

**كل commits الموجة**:

| PR | commit | عنوان |
|---|---|---|
| PR-1 | `21a9d10f` + `815db270` | معالج إنشاء الموظف يربط المصفوفة المؤسسية |
| PR-2 | `183a9bc2` | personas visibility evidence pack |
| PR-3 | `5549a791` | سياسات الحضور لكل فئة بيد مدير HR |
| PR-4 | `196de217` | تفعيل محرك التقييم المؤسسي |
| تدقيق | `0d20244a` | الفحص العميق للمناطق الخمس |
| PR-5 | `db8af573` | صندوق الأعمال الموحّد |
| PR-5a | `6fa53dba` | سد تسريب fleet middleware |
| PR-6 | `2db3bdde` | Employee 360 — التبويبات الثلاثة الناقصة |
| PR-7 | `69fdf32a` | الشجرة الموحّدة شركة → فرع → إدارة → قسم → فريق |
| PR-8 | `0289f050` | محرك دورة حياة الموظف |
| PR-8a | `088480b8` | فصل الانتساب عن نطاق الصلاحية |
| PR-9 | `a89aa0ad` | رفيق الميدان |
| PR-9a | `6a9724f6` | إصلاح seed الأدوار القياسية (FU-1) |
| PR-10 | `b9053207` | بوّابة الإغلاق |

**رحلات حيّة** (`curl + psql` على المستأجر الحي — قابلة لإعادة التشغيل):

| الرحلة | الملف | النتيجة |
|---|---|---|
| work-inbox (+ قسم انحدار PR-5a) | `scripts/verify-hr-work-inbox-journey.sh` | 17/17 |
| employee 360 — 4 شخصيات | `scripts/verify-hr-employee-360-personas-journey.sh` | 18/18 |
| org tree | `scripts/verify-hr-org-tree-journey.sh` | 17/17 |
| employee lifecycle | `scripts/verify-hr-employee-lifecycle-journey.sh` | 23/23 |
| identity + sidebar (+ D bootstrap + E compliance gate) | `scripts/verify-hr-identity-sidebar-journey.sh` | **38/38** |
| field tracking (6 شخصيات/فئات) | `scripts/verify-hr-field-tracking-journey.sh` | 15/15 |

**مسامير الوحدات** (10,225 backend + 7 frontend — guard كامل أخضر،
wiring 2404/2404، schema drift / numbering / stop-ship نظيفة):

| المسمار | الفحوصات | الملف |
|---|---|---|
| `hrWorkInboxAggregationSmoke` | 26 | `artifacts/api-server/tests/unit/hrWorkInboxAggregationSmoke.test.ts` |
| `hrWorkInboxFleetLeakFixSmoke` | 14 | `artifacts/api-server/tests/unit/hrWorkInboxFleetLeakFixSmoke.test.ts` |
| `hrEmployee360TabsSmoke` | 26 | `artifacts/ghayth-erp/src/test/hrEmployee360TabsSmoke.test.tsx` |
| `hrOrgTreeSmoke` | 27 | `artifacts/api-server/tests/unit/hrOrgTreeSmoke.test.ts` |
| `hrLifecycleEngineSmoke` | 46 | `artifacts/api-server/tests/unit/hrLifecycleEngineSmoke.test.ts` |
| `hrIdentityAccessGrantSmoke` | 10 | `artifacts/api-server/tests/unit/hrIdentityAccessGrantSmoke.test.ts` |
| `hrFieldCompanionSmoke` | 18 | `artifacts/api-server/tests/unit/hrFieldCompanionSmoke.test.ts` |
| `hrStandardRoleGrantsSmoke` | 11 | `artifacts/api-server/tests/unit/hrStandardRoleGrantsSmoke.test.ts` |
| `hrStandardRoleGrantsBootstrapParitySmoke` | 8 | `artifacts/api-server/tests/unit/hrStandardRoleGrantsBootstrapParitySmoke.test.ts` |
| `hrComplianceMenuGateSmoke` | 5 | `artifacts/ghayth-erp/src/test/hrComplianceMenuGateSmoke.test.tsx` |
| `hrWave0BackendRouteGuardsRatchet` | يحرس 223 endpoint HR خلف `authorize()` | `artifacts/api-server/tests/unit/hrWave0BackendRouteGuardsRatchet.test.ts` |

**هجرات حاسمة**:

| رقم | ماذا تفعل |
|---|---|
| 270 | `tracking_frequency_seconds` لكل فئة (PR-3) |
| 287 | جدول `administrations` + ربط الأقسام (PR-7) |
| 288 | `employee_lifecycle_events` ledger (PR-8) |
| 289 | `isAccessGrant` على `employee_assignments` (PR-8a) |
| 290 | سياق + dedupe index لـ`field_tracking_points` (PR-9) |
| 291 | seed grants للدورين القياسيين (PR-9a) |

**لقطات** (مرفقة في خيط المراجعة):
- جوال RTL لرفيق الميدان (ميداني نشط / مكتبي غير خاضع، overflow=0px).
- قوائم جانبية لشخصيات PR-8a الخمس.
- قوائم dept/payroll بعد PR-9a (كلاهما حصل على وحدات بعد 0).
- قوائم dept/payroll بعد PR-10 («الامتثال والجزاءات» اختفى).

---

## 6. المخاطر المتبقية (لا تمنع الإغلاق)

1. **خريطتا وحدات**: `ROLE_DEFAULT_MODULES` (mount gate) و«وحدات من
   grants» (sidebar) مصدران يجب أن يتفقا يدويًا. اتفقا اليوم بمسمار
   parity؛ التوحيد الجذري قرار معماري (كان «منطق RBAC» خارج نطاق
   PR-9a/PR-10) — بند الموجة الثانية #2.
2. **مستأجر واحد مُقاس حيًا**: كل الرحلات على tenant الضياء الحي؛ سلوك
   bootstrap للشركات الجديدة مُغطى بمسار `seedRolesAndGrantsV2` من
   الكود (§D من الرحلة) لكن لم يُختبر على tenant إنتاج حقيقي ثانٍ.
3. **FU-2** يحجب لوحة HR التحليلية عن مديرها — أثر يومي ملموس وإن كان
   بقرار تأجيل واعٍ. بند الموجة الثانية #1.
4. **تحذيرا stop-ship على `myFieldTracking.ts`**: مقصود (ping عالي
   التردد لا يُسجَّل كحدث أعمال؛ السياق كامل في الجدول). توثيق فقط.

---

## 7. التوصية النهائية

**أغلِق #2077 الآن.**

الالتزامات الإحدى عشرة (PR-1 → PR-10) نُفّذت، كل واحدة خلفها رحلة حيّة
قابلة لإعادة التشغيل ومسمار يمنع الانحدار. الفجوات الأربع التي كادت تبقى
مفتوحة — FU-1، bootstrap الشركات الجديدة، رابط الامتثال يعرض ثم 403،
ثغرة FND-004 على `/permissions/my` — أُغلقت كلها في PR-9a + PR-10 **قبل**
هذا التقرير. ما بقي (§6) بنود معمارية مُعلنة، ليست نقصًا في التزامات الموجة.

PR-10 كان البوابة التي حوّلت الإغلاق من «مقبول مع تحفظ» إلى **إغلاق نظيف
ومدافع عنه**. مكسبه يتجاوز HR: تجربة الأدوار أصبحت قدرة منصة (§3).

### الموجة الثانية المنفصلة (تُسجَّل issue جديد، خارج #2077)

1. **فصل `/module-dashboards/*` عن `requireModule("bi")`** (FU-2) —
   أعلى أثر يومي؛ مدير HR يستعيد لوحته التحليلية.
2. **توحيد مصدر «وحدات الدور»** جذريًا — مصدر واحد يحل محل
   `ROLE_DEFAULT_MODULES` + grants→modules؛ يلغي مسمار parity.
3. **مسح Phase C** لـ9 نقاط HR غير مستهلَكة من الواجهة (ربط أو إزالة).
4. **شاشة orphans** للبيانات التنظيمية الناقصة (`administrationId` خامل،
   أقسام بلا إدارة) — أداة تنظيف تشغيلية دورية.

---

## ملحق — جذر FU-1 الدقيق (للأرشيف)

ليست ثغرة بوابات — البوابات عملت كما صُمّمت. خللان في الـseed كشفهما PR-9a:

1. **`payroll_officer`**: هجرة 278 زرعت صف الدور (قالب) **بلا أي grants**.
2. **`department_manager`**: لا صف دور أصلًا في `rbac_roles` (تعليق 278
   «موجود» كان خاطئًا — الموجود قالب `tpl_department_manager` من هجرة 110
   بمفتاح مختلف)، فكان ربط المستخدم بالدور يُدخل 0 صف **بصمت**.

وفي أثناء العلاج ظهرت حقيقتان معماريتان وُثّقتا وسُمّرتا:

- محرك التصريح يطابق `feature_key` الدقيق أو `<module>.*` أو `*` فقط —
  لذا `hr.payroll.*` كانت ستكون grant **ميتًا**؛ الزرع استخدم المفاتيح
  الدقيقة (`hr.payroll.runs`, `hr.payroll.wps`, …).
- طبقة الجلسة تعرض الأدوار غير-القالبية فقط في `/auth/me` — لذا الزرع
  ينسخ الدور+الحزمة لكل شركة قائمة (نفس نمط employee/driver/hr_manager)
  ويعيد توجيه الارتباطات القديمة العالقة على القالب.

**العلاج (بيانات فقط)**: هجرة `291` (idempotent، ثابتة على التطبيق المزدوج:
6 أدوار / 39 grants) + سطران في خريطة `ROLE_DEFAULT_MODULES`/`ROLE_LEVELS`.
عُمِّم في PR-10 على bootstrap الشركات الجديدة. **لم يُمسّ**: منطق RBAC،
`authMiddleware`، القائمة الجانبية.
