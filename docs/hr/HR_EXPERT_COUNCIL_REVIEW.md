# HR-REV-0 — تقرير مراجعة مجلس الخبراء لمسار الموارد البشرية

> **Issue:** [#2219](https://github.com/barhom64/ghayth-erp/issues/2219) — المهمة الأم المنهجية لكل مهام `HR-REV-*`
> **الفرع:** `claude/wizardly-babbage-mgsv2i`
> **التاريخ:** 2026-06-14
> **الحالة:** تقرير جرد وقرار (read-only) — **لا يبدأ أي PR علاجي قبل اعتماد هذا التقرير.**

هذا التقرير هو **بوابة** بقية مهام المراجعة. كل ما بعده (`HR-REV-1 … HR-REV-9`) يستند إلى الجداول والقرارات هنا.

---

## مفتاح الأدلة (Legend)

كل نقطة في هذا التقرير موسومة بأحد التصنيفات التالية، تنفيذًا لقاعدة #2219:

| الوسم | المعنى |
|------|--------|
| ✅ **مثبت** | حقيقة مثبتة من الكود مع `file:line`. |
| 🔶 **فرضية** | مرجّح لكنه يحتاج تحقّقًا إضافيًا (غالبًا استعلام قاعدة بيانات حية أو تتبّع تشغيلي). |
| 🏛 **قرار** | قرار معماري مطلوب من المجلس قبل أي علاج. |

### تصنيف الصفحات (من #2219)

`canonical` · `duplicate` · `merge-candidate` · `remove-candidate` · `redirect/back-compat` · `deep-link-only` · `wrong-owner` · `service-path-owned`

---

## 0. الملخص التنفيذي ولوحة القرار

مسار الموارد البشرية **ليس فارغًا ولا هيكليًا** — بل هو من أنضج مسارات النظام: ملف موظف 360 حقيقي بـ18 تبويبًا، Command Center تشغيلي، نموذج RBAC v2 متعدّد الطبقات، ومحرّك دورة حياة (lifecycle ledger). المشكلة ليست النقص بل **التضخّم والتشتّت**: صفحات تتكاثر حول نفس الوظيفة، ومفاتيح صلاحيات محمّلة فوق طاقتها، وتمثيل مكرّر للمفاهيم الأساسية (المسمى الوظيفي ممثَّل في **4 أماكن**)، وعدد محدود من ثغرات الحوكمة (عمليات كتابة محكومة بصلاحية قراءة).

**الحجم المثبت من الكود:**

| المؤشر | العدد المُحصى (هذا التقرير) | رقم #2219 | الحالة |
|--------|---------------------------|-----------|--------|
| صفحات `pages/hr/*` | **63** | 63 | ✅ مطابق |
| نماذج `pages/create/hr/*` | **20** | 20 | ✅ مطابق |
| صفحات تفاصيل HR في `pages/details/*` | **8** | — | ✅ |
| مسارات HR في `hrRoutes.tsx` | **~90** | — | ✅ |
| endpoints عائلة HR (api-server) | **~252** | 249 | ✅ ضمن هامش المنهجية |
| مفاتيح ميزات `hr.*` في `featureCatalog` | **25** | 24 | ✅ ضمن الهامش |
| أدوار HR فعّالة (لها grants) | **~5** | 5 من 9 | 🔶 يحتاج عدّ grants حيًّا |
| أدوار قوالب فارغة (phantom) | **3 مؤكدة + 1 مدّعاة** | 4 | ✅/🔶 |

**أهم 7 قرارات مطروحة على المجلس** (تفصيلها في §11):

1. 🏛 **توحيد تمثيل المسمى الوظيفي** (4 تمثيلات حاليًا) — قرار قبل أي عمل على القوالب (`HR-REV-4`).
2. 🏛 **canonical للهيكل التنظيمي**: 3 صفحات (`organization` / `organization/structure` / `org-tree`) لوظيفة واحدة.
3. 🏛 **canonical للمخالفات/الانضباط**: `violations` مقابل `violations/management` + تشتّت اللائحة/التصعيد/الرصد (مدخل `HR-REV-7`).
4. 🏛 **مالك الهيكل التنظيمي**: `org.ts` محكوم بمزيج `hr.employees` + `admin` — من يملك بنية المؤسسة؟
5. ✅ **إصلاح ثغرات authz فورية**: `justify` و`appeal` (كتابة) محكومتان بـ`list` (قراءة).
6. 🏛 **مصير «الأصداف المتقدمة»** (`*/advanced`): `performance/advanced`, `recruitment/advanced`, `training/advanced`.
7. 🏛 **توحيد لوحتَي التفعيل**: `employee-activation` و`onboarding-review` (مدخل `HR-REV-3`).

---

## 1. المنهجية ومصادر الأدلة

تم بناء هذا الجرد من قراءة الكود مباشرة، لا من الذاكرة أو الوثائق وحدها:

- **المسارات:** `artifacts/ghayth-erp/src/routes/hrRoutes.tsx` (مصدر الحقيقة للـroutes).
- **التنقّل:** `artifacts/ghayth-erp/src/components/layout/navigation.registry.ts` + منطق الترشيح في `sidebar-layout.tsx`.
- **الصفحات والنماذج:** `src/pages/hr/*`, `src/pages/create/hr/*`, `src/pages/employee-detail.tsx`, `src/pages/employees.tsx`, `src/pages/hr.tsx`.
- **الخلفية والصلاحيات:** `artifacts/api-server/src/routes/hr*.ts`, `org.ts`, `employees.ts`, `lib/rbac/featureCatalog.ts`, `lib/rbacCatalog.ts`, migrations.
- **المخطط:** `lib/db/src/schema/index.ts` + `artifacts/api-server/src/migrations/*`.
- **وثائق سابقة مُستفاد منها:** `docs/hr/SIDEBAR_MATRIX.md`, `docs/hr/PERSONAS_VISIBILITY_MATRIX.md`, `docs/hr/HR_FIVE_AREAS_DEEP_AUDIT.md`, `docs/hr/WAVE_CLOSURE_REPORT.md`, `docs/HR_REFERENCE_MODEL.md`, `docs/HR_OPERATING_FOUNDATION_TASK.md`, `docs/rbac/UNIFIED_USER_ROLE_MODEL.md`.

### قيود الجرد (إفصاح أمين)

- 🔶 **المرفقان** `HR_جرد_تفصيلي_من_واقع_النظام.docx` و`HR_النماذج_والمسميات_والتبعية.docx` (المشار إليهما في تعليق #2219) **مرفوعان على الـIssue وليسا في المستودع**، فتعذّر سحب نصّهما الخام داخل الحاوية. عوّضنا ذلك بدمج النقاط الإلزامية التي لخّصها التعليق (§8) بعد التحقق منها من الكود. **مطلوب:** إن كان النصّ الكامل ضروريًا، يُرفع الملفان إلى `docs/hr/_inbox/` أو يُلصق محتواهما.
- 🔶 أعداد الـ`grants` لكل دور تحتاج استعلامًا على قاعدة بيانات حية لحسمها رقميًا؛ ما دُوّن هنا مستند إلى تعريفات القوالب في الـmigrations والكتالوج.

---

## 2. القاعدة الحاكمة (مرجع كل قرار)

تثبيتًا لمبدأ #2219: **الموارد البشرية مسار قائد**، والمسارات الأخرى **خادمة**.

| المسار | علاقته بـHR | الحد |
|--------|-------------|------|
| المالية | قيود الرواتب والأثر المحاسبي | HR يقرّر الخصم/الاستحقاق، والمالية تنفّذ القيد. لا منطق GL داخل HR. |
| المستودع/العهد | صرف وإرجاع العهد | HR **يطلب خدمة**؛ لا ينشئ عهدة بلا وثيقة صرف/استلام. |
| الأسطول | تخصيص المركبة | HR **يطلب تخصيصًا**؛ لا ينشئ/يدير مركبة. |
| الوثائق | حفظ وتحقّق | HR يربط ويستعرض ضمن السياق. |
| RBAC | منصة صلاحيات عامة | HR **يملك ربط الموظف بالمسمى/الدور/النطاق ودورة حياة الوصول**، لا تعريف المنصة. |

🚩 **مخالفات محتملة لهذه القاعدة رُصدت** (تفصيلها لاحقًا): نموذج إنشاء الموظف يحمل حقول بنك/إقامة/مركبة/عهدة/PBX داخله (§6)، و`org.ts` يخلط ملكية `hr.employees` مع `admin` (§8.5).

---

## 3. جرد المسارات (Routes Inventory)

المصدر: `hrRoutes.tsx` (✅ مثبت). صُنّفت المسارات وظيفيًا. أعمدة: المسار · المكوّن · `subKey` · التصنيف المقترح.

### 3.1 المركز والموظفون (Core)

| المسار | المكوّن | subKey | التصنيف |
|--------|---------|--------|---------|
| `/hr` | `pages/hr` | — | `canonical` (Command Center) |
| `/hr/services` | `hr/services` | services | `canonical` (كتالوج خدمات ذاتية) |
| `/employees` | `pages/employees` | employees | `canonical` |
| `/employees/create` | `create/employees-create` | employees | `canonical` (نموذج عملاق — §6) |
| `/employees/:id` | `pages/employee-detail` | employees | `canonical` (ملف 360 — §5) |
| `/hr/employee-activation` | `hr/employee-activation` | employees | `merge-candidate` ↔ onboarding-review |
| `/hr/onboarding-review` | `hr/onboarding-review` | employees | `merge-candidate` ↔ employee-activation |
| `/hr/transfers` (+`/:id`,`/:id/edit`) | `hr/transfers` | employees | `canonical` (حركة وظيفية) |
| `/hr/exit` (+`/create`,`/:id`) | `hr/exit-requests` | employees | `canonical` (نهاية خدمة) |
| `/hr/expiring-documents` | `hr/expiring-documents` | employees | `merge-candidate` → لوحة نواقص (§7) |
| `/hr/documents` | `hr/documents` | employees | `canonical` (خدمة وثائق) |
| `/hr/official-letters` | `hr/official-letters` | employees | `canonical` |
| `/hr/contracts` (+`create`,`:id`,`:id/edit`) | `hr/contracts` | employees | `canonical` |

### 3.2 الهيكل التنظيمي (تشتّت مؤكد)

| المسار | المكوّن | التصنيف |
|--------|---------|---------|
| `/hr/organization` | `hr/organization` | 🏛 `merge-candidate` |
| `/hr/organization/structure` | `hr/organization-structure` | 🏛 `duplicate` / `merge-candidate` |
| `/hr/org-tree` | `hr/org-tree` (PR-7 «الموحّدة») | 🏛 **مرشّح canonical** |
| `/hr/delegations` | `hr/delegations` | `canonical` |

> ✅ **مثبت:** ثلاث صفحات منفصلة لعرض البنية التنظيمية، واثنتان منها (`organization`, `organization/structure`) ظاهرتان معًا في القائمة بعنوانين «الهيكل التنظيمي» و«الهيكل المصوّر». `org-tree` هو الأحدث ووُصِف بأنه «الموحّد». **قرار §11-2.**

### 3.3 الحضور والوقت (مفتاح `hr.attendance` محمّل فوق طاقته)

| المسار | subKey | التصنيف |
|--------|--------|---------|
| `/hr/attendance` (+`create`,`:id`,`:id/edit`) | attendance | `canonical` |
| `/hr/attendance/reports` | attendance | `canonical` (يظهر مرّتين: مجموعة الحضور + مجموعة التقارير) |
| `/hr/attendance/field-tracking` | attendance | `canonical` (خلفية مكتملة، تطبيق ميداني ناقص — §10) |
| `/hr/attendance/qr-scanner` | attendance | `canonical` |
| `/hr/overtime` (+`create`,`:id`) | attendance | `canonical` |
| `/hr/excuse-requests` (+`create`,`:id`,`:id/edit`) | attendance | `canonical` |
| `/hr/attendance-policy` | attendance | `canonical` (إعداد) |
| `/hr/attendance-categories` | attendance | `redirect/back-compat` (نفس مكوّن `/admin/attendance-categories`) |
| `/hr/shifts` (+`create`,`:id`) | shifts | `canonical` |
| `/hr/shifts/management` | shifts | `merge-candidate` ↔ shifts |

### 3.4 الإجازات

| المسار | التصنيف |
|--------|---------|
| `/hr/leaves` (+`create`,`:id`,`:id/edit`) | `canonical` |
| `/hr/leaves/management` | `merge-candidate` ↔ leaves (كلاهما في القائمة) |
| `/hr/leaves/approval-chains` | `canonical` (إعداد سلاسل) |
| `/hr/approvals` | `canonical` (صندوق وارد موحّد — `approval-inbox`) |
| `/hr/public-holidays` | `canonical` (إعداد) |
| `/hr/accruals` | `canonical` |

### 3.5 الرواتب والمستحقات

| المسار | التصنيف |
|--------|---------|
| `/hr/payroll` (+`create`,`:id`) | `canonical` |
| `/hr/payroll/salary-components` | `canonical` |
| `/hr/loans` (+`create`,`:id`) | `canonical` |
| `/hr/gratuity` | `canonical` |
| `/hr/wps` (+`:id`) | `canonical` |
| `/hr/saudi-compliance` | 🏛 `merge-candidate` (تداخل مع `saudization` — أنظر أدناه) |
| `/hr/saudization` | `canonical` (نطاقات) — مالك subKey `employees` بينما الامتثال في `payroll` |

### 3.6 الأداء والتطوير (تشتّت على 4 أسطح)

| المسار | التصنيف |
|--------|---------|
| `/hr/performance` (+`create`,`:id`) | `canonical` |
| `/hr/performance/advanced` | 🏛 `merge-candidate` («صدفة متقدمة») |
| `/hr/evaluation-360` (+`create`,`:id`,`:id/peer`,`:id/upward`,`history/:employeeId`) | `canonical` (منظومة 360 فرعية) |
| `/hr/idp` | `canonical` (خطط تطوير فردية) |
| `/hr/employees/:id/score` | `deep-link-only` (تفصيل من ملف 360) |
| `/hr/scoring-weights` | `canonical` (إعداد، مرآة لـ`/admin/scoring-weights`) |
| `/hr/turnover-report` | `canonical` (تقرير) |

### 3.7 التوظيف

| المسار | التصنيف |
|--------|---------|
| `/hr/recruitment` (+`create`) | `canonical` |
| `/hr/recruitment/applications` + `applicants/create` | `canonical` |
| `/hr/recruitment/jobs/:id` | `deep-link-only` |
| `/hr/recruitment/advanced` | 🏛 `merge-candidate` («صدفة متقدمة»، مصنّفة خطأً تحت «التقارير» في القائمة) |

### 3.8 التدريب

| المسار | التصنيف |
|--------|---------|
| `/hr/training` (+`create`,`:id`) | `canonical` |
| `/hr/training/advanced` | 🏛 `merge-candidate` («صدفة متقدمة») |

### 3.9 الامتثال والجزاءات (مدخل `HR-REV-7`)

| المسار | التصنيف |
|--------|---------|
| `/hr/violations` (+`create`,`:id`) | `canonical` (نظرة عامة) |
| `/hr/violations/management` | 🏛 `duplicate`/`merge-candidate` |
| `/hr/violations/penalty-escalation` | `merge-candidate` → tab داخل مركز الامتثال |
| `/hr/violations/auto-detection` | `merge-candidate` → tab |
| `/hr/discipline/regulation` | `canonical` (السياسة/اللائحة — كيان مختلف عن الواقعة) |
| `/hr/discipline/memos/:id` | `deep-link-only` |

### 3.10 المسارات اليتيمة (Orphan — غير ظاهرة في القائمة)

✅ **مثبت:** ~26 مسارًا (كل `*/create`, `*/edit`, وأغلب `*/:id`) غير مُدرجة في `navigation.registry.ts` وتُفتح عبر deep-link فقط من أزرار القوائم. **هذا سلوك مقصود وسليم** (لا يُحشى نموذج الإنشاء في القائمة)، ويُصنّف بالكامل `deep-link-only`. لا إجراء مطلوب سوى ضمان عدم ظهور أيٍّ منها في القائمة لأي دور.

---

## 4. جرد التنقّل (Navigation / Sidebar)

المصدر: `navigation.registry.ts` (✅ مثبت). القائمة منظّمة في **9 مجموعات** تحت `module: "hr"`:

1. **لوحة HR** — `/module-dashboards?tab=hr` · `/hr`
2. **الموظفون** — قائمة الموظفين، التوظيف، المتقدمين، التفعيل، مراجعة التعيين، النقل، الوثائق المنتهية، الهيكل التنظيمي، الهيكل المصوّر، التفويضات، وثائق الموظفين، العقود، الخطابات، نهاية الخدمة
3. **النشاط والحضور** — السجل اليومي، تقارير الحضور، التتبع الميداني، QR، الورديات، إدارة الورديات
4. **الطلبات** — كتالوج الخدمات، صندوق الواردات، الإجازات، إدارة الإجازات، الوقت الإضافي، الأعذار، سلاسل الموافقات
5. **الامتثال والجزاءات** — (محكومة بصلاحية صريحة، أنظر أدناه)
6. **الأداء والتطوير** — التقييم، المتقدم، 360، IDP، التدريب، التدريب المتقدم
7. **الرواتب والمستحقات** — المسيرات، المكونات، السلف، نهاية الخدمة، الاستحقاقات، WPS
8. **التقارير** — الدوران، تقارير الحضور، تحليلات التوظيف المتقدمة
9. **إعدادات HR** — سياسة الحضور، العطل، نموذج المؤسسة، الشجرة التنظيمية، عضويات المؤسسة، أوزان التقييم، الصلاحيات الفعلية، فئات الموظفين

### 4.1 آلية الحجب (5 طبقات) — ✅ مثبت (`sidebar-layout.tsx:105–128`)

```
1) canAccessModule(module)        → حجب على مستوى الوحدة (اشتراك/ترخيص)
2) isFeatureEnabled(module)       → علم الميزة (feature flag)
3) minRoleLevel ≤ effectiveLevel  → مستوى الدور
4) canAccessSubPage(mod, subKey)  → بوابة subKey الدقيقة
5) perm + permMode (any/all)      → صلاحية صريحة مثل hr.violations:view
```

ثم فحص `isRegisteredRoute(path)` قبل الإظهار.

### 4.2 ملاحظات حوكمة على التنقّل

- ✅ **«الامتثال والجزاءات» هي المجموعة الوحيدة المحكومة بصلاحية صريحة** (`perm: hr.violations:* / hr.discipline:*`, `permMode: "any"`) — لمنع «يظهر ثم 403» لمن لا يملك رؤية الجزاءات (مثل `payroll_officer`). بقية المجموعات تعتمد على `subKey` فقط.
- 🔶 **خطر «visible+403»:** بقية مجموعات HR لا تحمل `perm` صريحًا على عناصرها؛ تعتمد على `subKey`/الوحدة. هذا يفترض أن من يملك الوحدة يملك كل صفحاتها — وهو ما تنقضه فكرة الأدوار المتخصصة. **هذا جوهر `HR-REV-1`** (مصفوفة hidden / visible+200 / visible+403).
- ✅ **ازدواج عرض:** «تقارير الحضور» (`/hr/attendance/reports`) تظهر في مجموعتَي «النشاط والحضور» و«التقارير» — ازدواج عرضي مقصود لكنه يستحق توثيقًا.
- 🏛 **عناصر «إعدادات HR» تشير إلى `/admin/*`** (نموذج المؤسسة، العضويات، الصلاحيات الفعلية) — تداخل ملكية HR/Admin (أنظر §8.5).

---

## 5. ملف الموظف 360 (Employee 360 Tabs)

المصدر: `pages/employee-detail.tsx` (✅ مثبت، ~2308 سطرًا). **هذا هو المركز الحقيقي للموظف**، وفيه 18 تبويبًا حقيقيًا (لا placeholders)، مع شارات حالة لكل تبويب (`complete` / `missing` / `action_needed` / `forbidden`):

| التبويب | المحتوى | ملاحظة الجرد |
|---------|---------|---------------|
| نظرة شاملة | بطاقات + شريط حالة تشغيلية + ربط مالي + مؤشر أداء | `canonical` |
| البيانات الشخصية | شخصي + عمل + هوية حكومية (تحرير مضمّن) | `canonical` |
| الوثائق | هوية/إقامة/رخصة + انتهاءات + روابط `/hr/documents` | `canonical` (يُغني عن صفحة نواقص منفصلة جزئيًا) |
| المسميات والمناصب | المسمى + المنصب الإداري + القسم/الفرع/المدير | 🚩 يكشف **رباعية تمثيل المسمى** (§8.7) |
| الحساب والدخول | حالة حساب المستخدم + آخر دخول + قفل | `canonical` |
| الأدوار والصلاحيات | أدوار RBAC + النطاق + الانتهاء + رابط الصلاحيات الفعلية | `canonical` (قلب `HR-REV-1`) |
| العقد | رقم/نوع/حالة/توقيع | `canonical` |
| الحضور | ملخص + سجل يومي | `canonical` |
| الإجازات | رصيد + طلبات | `canonical` |
| العهد والأصول | جدول أصول (لابتوب/جوال/شريحة/مركبة) | ✅ **خدمة خادمة معروضة في سياقها** — صحيح |
| الرواتب | جدول مسيرات (إجمالي/خصومات/صافي) | `canonical` |
| المخالفات | خط زمني + مؤشر تصعيد | `canonical` |
| التقييم | درجة مركّبة (6 أبعاد) + تاريخ 12 شهرًا | `canonical` |
| المهام | قائمة مهام | `canonical` |
| التدريب | دورات | `canonical` |
| النشاط | سجل تدقيق (محكوم بـ`admin.audit:view`، يعرض «غير مصرح» عند 403) | ✅ نموذج صحيح لـvisible-but-forbidden داخل صفحة |
| دورة الحياة | آلة حالة (11 حالة) + انتقالات محروسة + خط زمني | `canonical` (مخرج PR-8) |
| المالية | سلف + وقت إضافي + زر PnL | `canonical` |

🟢 **استنتاج:** كثير ممّا هو معروض كصفحات مستقلة في القائمة موجود أصلًا كتبويب هنا. هذا **الدليل الأقوى لقرارات الدمج في `HR-REV-2`/`HR-REV-6`**: القاعدة = «إن كان tab داخل 360 ولا تشغيل جماعي له، فلا يكون صفحة قائمة مستقلة».

---

## 6. جرد نماذج الإدخال (Input Forms)

المصدر: `pages/create/hr/*` + `employees-create.tsx` (✅ مثبت). الجدول الكامل لملكية الحقول تفصيله في `HR-REV-5`؛ هنا الجرد التصنيفي والإشارات الحمراء.

| النموذج | عدد الحقول | حجم | حماية صريحة | إشارة |
|---------|-----------|-----|-------------|-------|
| `employees-create` | **46+** (5 خطوات) | 🔴 عملاق | ❌ لا تجزئة بالدور | 🚩 **الطفل المشكلة** |
| `training-create` | 15 | 🟠 كبير | ❌ | محتوى LMS/مالية مدمج |
| `recruitment-create` | 14 | 🟠 كبير | ❌ | محتوى تسويقي مدمج |
| `leaves-create` | 9 + تفويض (~8) | 🟠 كبير | ❌ | يخلط خدمة ذاتية + تفويض إداري |
| `performance-create` | 11 + 6 كفاءات | 🟠 كبير | ❌ | كفاءات hardcoded |
| `violations-create` | 11 | 🟡 متوسط | ❌ (خلفي) | تصميم جيد (Zod + مسودة) |
| `exit-create` | 9 | 🟡 | ✅ `hr.exit:create` | حسّاس ومحمي — جيد |
| `loans-create` | 6–9 | 🟡 | ✅ (ضمني) | جيد |
| `contracts-create` | 9 | 🟡 | ✅ `hr.contracts:create` | جيد |
| `overtime-create` | 7–10 | 🟡 | ❌ | جيد |
| `evaluation-360-create` | 9+ | 🟡 | ❌ | منتقي مشاركين ديناميكي |
| `payroll-create` | 4 | 🟢 صغير | ❌ (خلفي) | عملية دفعية — مناسب |
| `applicants-create` | 11 | 🟢 | ❌ | جيد |
| `shifts-create` | 11 | 🟢 | ❌ | جيد |
| `attendance-create/edit` | 6–7 | 🟢 | ❌ | جيد |
| `excuse-create/edit` | 6 | 🟢 | ❌ | جيد |
| `leaves-edit` | 2 | 🟢 | ❌ | محصور بإحكام — جيد |
| `transfers-edit` | 5 | 🟢 | ❌ | محصور — جيد |
| `contracts-edit` | 8 | 🟢 | ❌ (مقفول بعد الاعتماد) | جيد |

### 6.1 الإشارات الحمراء (مدخلات `HR-REV-5`)

1. 🚩 ✅ **`employees-create` يخلط 7 نطاقات ملكية** في نموذج واحد بلا تجزئة بالدور: شخصي + توظيف + ربط مؤسسي + اتصالات (بريد/PBX) + مالية (بنك/IBAN) + حكومي (إقامة/تأشيرة/رخصة) + خدمات خادمة (عهدة/مركبة). **يخالف القاعدة الحاكمة** (§2): حقول البنك/الإقامة/المركبة/العهدة يجب أن يملكها المالية/الوثائق/الأسطول/المستودع لا HR. → هذا بالضبط `HR-REV-3` (التفعيل السريع الموزّع) و`HR-REV-4` (قوالب الوظائف).
2. 🚩 ✅ **قائمة بنوك hardcoded** (11 بنكًا) داخل النموذج بدل جدول إعداد.
3. 🔶 **تضارب تسمية مُعرّف الموظف**: النماذج تخزّن `employeeId` بينما الخلفية تتوقّع `assignmentId` في عدة مسارات (إعادة هيكلة Wave-1/B قيد التنفيذ حسب تعليقات الكود) — يحتاج إغلاقًا.
4. 🚩 **لا «ملخص أثر قبل الحفظ»** في النماذج الكبيرة (تتطلبه قاعدة UX في `HR-REV-5`).

---

## 7. جرد صفحات العرض (Display / Boards)

المصدر: ✅ مثبت من قراءة الصفحات.

| الصفحة | النوع | تشغيلي/أرشيفي | التصنيف |
|--------|------|----------------|---------|
| `/hr` | Command Center (8 KPIs قابلة للنقر + روابط سريعة + إجراءات) | تشغيلي | `canonical` |
| `/employees` | قائمة (فلاتر + KPIs + إجراءات صف + طباعة CSV) | تشغيلي | `canonical` |
| `/employees/:id` | ملف 360 (18 tab) | تشغيلي | `canonical` |
| `/hr/services` | كتالوج خدمات ذاتية (واعٍ بالصلاحيات) | تشغيلي | `canonical` |
| `/hr/approvals` | صندوق وارد موافقات موحّد عبر كل المجالات | تشغيلي | `canonical` |
| `/hr/employee-activation` | لوحة تفعيل (تفعيل/تعليق/إنهاء جماعي) | تشغيلي | `merge-candidate` |
| `/hr/onboarding-review` | لوحة onboarding (قوائم مهام) | تشغيلي | `merge-candidate` |
| `/hr/expiring-documents` | قائمة وثائق منتهية | تشغيلي | `merge-candidate` → Deficiencies Board |

🔴 **فجوات عرض مطلوبة في `HR-REV-6`** (غير موجودة حاليًا كصفحة مستقلة):
- **Activation Board** موحّدة (الناقص/المسؤول/منذ متى/SLA) — مشتّتة الآن بين `employee-activation` + `onboarding-review`.
- **Deficiencies Board** (ناقص هوية/عقد/بنك/رخصة/سياسة حضور/اعتماد راتب) — موجودة جزئيًا في تبويبات 360 و`expiring-documents` لكن بلا لوحة جامعة.
- **Role/Access Board** (صلاحيات شاذة/مؤقتة قاربت الانتهاء) — غير موجودة.

🔶 **تداخل لوحة HR مع `/module-dashboards?tab=hr`**: عنصر «لوحة الموارد البشرية» يشير إلى مسار محكوم بوحدة `bi`؛ `hr_manager` لا يملك `bi` فيُحجب (FU-2 المعروف في `PERSONAS_VISIBILITY_MATRIX.md`). 🏛 قرار: فصل لوحة HR عن وحدة BI.

---

## 8. النقاط الإلزامية من تعليق #2219 (محقّقة من الكود)

تحويل نقاط التعليق إلى جداول رسمية موسومة بالأدلة:

### 8.1 عدد الـEndpoints — ✅ مثبت

| الملف | endpoints |
|------|-----------|
| `hr.ts` | 126 |
| `org.ts` | 39 |
| `hr-discipline.ts` | 24 |
| `employees.ts` | 18 |
| `hr-contracts.ts` | 13 (عبر `contractsRouter`) |
| `hr-wps.ts` | 8 |
| `hr-overtime.ts` | 7 |
| `hr-exit.ts` · `hr-loans.ts` | 6 + 6 |
| `hr-compliance.ts` | 3 |
| `myFieldTracking.ts` | 2 |
| **الإجمالي** | **~252** |

> الفارق عن رقم #2219 (249) ضمن هامش المنهجية (طريقة العدّ + ملفات حافّة). الجوهر مؤكد: **مسار ضخم جدًا على مستوى الخلفية**.

### 8.2 مفاتيح الميزات — ✅ مثبت

✅ **25 مفتاح `hr.*`** متمايز في `featureCatalog.ts` (مقابل 24 في #2219 — فرق واحد، غالبًا متغيّر `self/my`). أمثلة: `hr.employees`, `hr.attendance`, `hr.leaves`, `hr.payroll.runs`, `hr.payroll.wps`, `hr.discipline`, `hr.violations`, `hr.contracts`, `hr.exit`, `hr.loans`, `hr.overtime`, `hr.organization`, `hr.recruitment`, `hr.training`, `hr.performance`, `hr.saudization` + متغيّرات `*.self/*.my`.

### 8.3 الأدوار: فعّالة مقابل وهمية — ✅/🔶

| الدور | مصدره | الحالة |
|------|-------|--------|
| `attendance_officer` | `migrations/278:28` (قالب `is_template`, `companyId=NULL`) | ✅ **وهمي** (بلا grants) |
| `discipline_officer` | `migrations/278:34` | ✅ **وهمي** |
| `performance_reviewer` | `migrations/278:37` | ✅ **وهمي** |
| `hr_admin` | مذكور في تعليق rollback بـ`278:5` فقط (لم يُدرَج هنا) | 🔶 **ادّعاء وهمي** — يحتاج تحديد مصدر التعريف وعدّ grants |
| `payroll_officer` | `278:31` + backfill في `291` (PR-9a) | ✅ **فعّال** (أُضيفت grants لاحقًا) |
| `department_manager` | أُنشئ في `291` (PR-9a) بـ7 وحدات | ✅ **فعّال** |
| `hr_manager` | `rbacCatalog.ts` | ✅ **فعّال** (`hr:*`) |
| `owner` / `general_manager` | مجموعات أدوار | ✅ **فعّال** |
| `employee_self_service` | مذكور في `278:6` | 🔶 يحتاج تحقق grants |

> ✅ **مثبت:** migration 278 يبذر قوالب أدوار **بلا grants**؛ migration 291 عالج `department_manager` و`payroll_officer` فقط. ⇒ يتبقّى `attendance_officer`/`discipline_officer`/`performance_reviewer` قوالب فارغة مؤكدة. **هذا يطابق روح #2219 (5 فعّالة من 9).** 🔶 الأرقام الدقيقة للـgrants تحتاج استعلامًا حيًّا.

### 8.4 مفاتيح محمّلة فوق طاقتها — ✅ مثبت

| المفتاح | الحِمل |
|--------|--------|
| `hr.attendance` | يحكم: السجل اليومي + التقارير + التتبع الميداني + QR + الوقت الإضافي + الأعذار + السياسة + الفئات (≈8 صفحات/مجموعات) |
| `hr.organization` | يحكم: organization + structure + (يتقاطع مع org-tree/delegations) |
| `hr.exit` | يحكم نهاية الخدمة بكاملها كحركة وظيفية حسّاسة بمفتاح واحد |

🏛 **قرار:** هل تُجزّأ هذه المفاتيح (مثلاً `hr.attendance.policy` مستقل عن `hr.attendance.field`) أم تبقى خشنة؟ يؤثّر على `HR-REV-1`.

### 8.5 ملكية `org.ts` — ✅ مثبت + 🏛 قرار

✅ `org.ts`: **4 endpoints محكومة بـ`feature:"hr.employees"`** و**1 محكوم بـ`feature:"admin"`**، مع **26 عملية كتابة** و**32 إشارة audit**.

- 🏛 **تداخل ملكية:** بنية المؤسسة (فروع/إدارات/أقسام) موزّعة بين `hr.employees` و`admin` و(في القائمة) روابط `/admin/org-model`. **من يملك الهيكل التنظيمي canonically؟** قرار يسبق توحيد صفحات §3.2.
- 🔶 **audit:** نسبة 32/26 توحي بتغطية جيدة لكن **ليست مضمونة لكل كتابة**؛ يحتاج فحصًا لكل endpoint (مدخل `HR-REV-5`/الحوكمة).

### 8.6 ثغرة authz في الانضباط — ✅ مثبت (إصلاح فوري)

| Endpoint | الفعل (HTTP) | `authorize` action | الحكم |
|----------|--------------|---------------------|-------|
| `POST /memos/:id/justify` (`hr-discipline.ts:770`) | كتابة | `hr.discipline:list` | 🚩 **خطأ: كتابة بصلاحية قراءة** |
| `POST /memos/:id/appeal` (`hr-discipline.ts:1094`) | كتابة | `hr.discipline:list` | 🚩 **خطأ: كتابة بصلاحية قراءة** |
| `POST /memos/:id/appeal-decision` (`hr-discipline.ts:1143`) | كتابة | `hr.discipline:approve` | ✅ صحيح |

> ✅ هذا أوضح خلل تشغيلي يستحق PR صغيرًا فوريًا: تصحيح `justify` → `create`/`update`، و`appeal` → `create` (تقديم اعتراض من الموظف) مع مراعاة النطاق (`self`). **بند §11-5.**

### 8.7 تضارب تمثيل المسمى الوظيفي — ✅ مثبت (أسوأ من المُدّعى: **4 تمثيلات**)

| التمثيل | المكان | الدليل |
|---------|--------|--------|
| `employees.jobTitle` (نص) | جدول الموظفين | `lib/db/src/schema/index.ts:63` |
| `employee_assignments.jobTitle` (نص) | جدول التعيينات | `lib/db/src/schema/index.ts` (كتلة `employeeAssignments`) |
| جدول `job_titles` | كيان مستقل | `migrations/012_job_titles.sql:2` |
| جدول `positions` | كيان مستقل (org model) | `migrations/274_org_model_foundation.sql:66` |

> ✅ **التمثيل رباعي لا ثلاثي.** نموذج إنشاء الموظف يستخدم `jobTitle` (Select) **و**`positionId` (PositionSelect) معًا. 🏛 **هذا أخطر قرار معماري في الجرد** ويجب حسمه **قبل** `HR-REV-4` (قوالب الوظائف تبني عليه): ما هو المصدر القانوني للمسمى؟ وما علاقة «المسمى المهني» بـ«المنصب الإداري»؟ **بند §11-1.**

### 8.8 تكرار الصفحات — ✅ مثبت

| المجموعة المكرّرة | الصفحات | الدليل |
|------------------|---------|--------|
| الهيكل التنظيمي | `organization` / `organization-structure` / `org-tree` | `hrRoutes.tsx` + كلاهما الأولان في القائمة |
| المخالفات | `violations` / `violations-management` | كلاهما في القائمة بعنوانين |
| الورديات | `shifts` / `shifts-management` | كلاهما في القائمة |
| الإجازات | `leaves` / `leaves-management` | كلاهما في القائمة |
| التفعيل | `employee-activation` / `onboarding-review` | تداخل وظيفي |
| الأصداف المتقدمة | `performance/advanced`, `recruitment/advanced`, `training/advanced` | أنماط `*-advanced.tsx` |

---

## 9. مصفوفة التصنيف المجمّعة (Decision Matrix)

خلاصة قرارات الصفحات (لا تُنفَّذ قبل الاعتماد):

| القرار | الصفحات | التبرير |
|--------|---------|---------|
| **keep (canonical)** | `/hr`, `/employees`, `/employees/:id`, `/hr/services`, `/hr/approvals`, الرواتب الأساسية، الإجازات الأساسية، الحضور الأساسي، العقود، النقل، نهاية الخدمة | أسطح تشغيلية حقيقية بلا بديل |
| **merge** | `organization`+`structure` → `org-tree` ؛ `violations-management` → `violations` ؛ `shifts-management` → `shifts` ؛ `leaves-management` → `leaves` ؛ `onboarding-review` ↔ `employee-activation` | وظيفة واحدة بصفحتين |
| **merge (advanced shells)** | `performance/advanced`, `recruitment/advanced`, `training/advanced` | «صدفة متقدمة» تُدمج كـtab أو تُزال |
| **redirect/back-compat** | `/hr/attendance-categories` → `/admin/attendance-categories` ؛ `/hr/scoring-weights` ↔ `/admin/scoring-weights` | نفس المكوّن من مسارين |
| **deep-link-only** | كل `*/create`, `*/edit`, `*/:id`, `:id/score`, memos/:id | صحيح كما هو |
| **wrong-owner / cross-boundary** | حقول بنك/إقامة/مركبة/عهدة في `employees-create` ؛ `/admin/org-model` داخل قائمة HR | يخالف القاعدة الحاكمة §2 |
| **service-path-owned** | تبويب «العهد والأصول» و«المركبات» في 360 | صحيح: تُعرض كخدمة خادمة في سياقها |
| **remove-candidate** | لا حذف مقترح في هذه المرحلة | يُمنع الحذف قبل تأكيد عدم الاستخدام + redirect |

> ⚠️ تنفيذًا لقاعدة #2219: **لا حذف route بلا redirect، ولا دمج وظيفتين مختلفتين لتشابه الاسم** (مثلاً `saudization` ≠ `saudi-compliance` رغم التشابه — الأولى نطاقات، الثانية WPS/مدد/بنوك).

---

## 10. جدول فجوات التشغيل الفعلية (يربط ببقية مهام HR-REV)

| المحور | الحالة | الفجوة | المهمة المالكة |
|--------|--------|--------|----------------|
| الأدوار والصلاحيات | 🟡 | لا `perm` صريح على أغلب عناصر القائمة (خطر visible+403)؛ أدوار وهمية؛ مفاتيح محمّلة | **HR-REV-1** |
| تنظيف التكرار | 🟡 | تكرارات §8.8 + أصداف متقدمة | **HR-REV-2** |
| التفعيل السريع | 🔴 | لا «حد أدنى + خطة تفعيل موزّعة»؛ النموذج عملاق أحادي | **HR-REV-3** |
| قوالب الوظائف | 🔴 | لا Job Activation Profile؛ عهدة/مركبة كـcheckbox يدوي؛ تمثيل المسمى رباعي | **HR-REV-4** |
| نماذج الإدخال | 🟡 | 4 نماذج كبيرة بلا ملكية حقول/ملخص أثر | **HR-REV-5** |
| صفحات العرض | 🟡 | لا Activation/Deficiencies/Access Boards موحّدة؛ تداخل لوحة HR مع BI | **HR-REV-6** |
| السياسات والامتثال | 🟡 | تشتّت violations/regulation/escalation/auto-detection؛ خلط السياسة بالواقعة | **HR-REV-7** |
| المرفقات والعرض الموحّد | 🟡 | يحتاج جرد PageShell/مرفقات حسّاسة/raw URLs | **HR-REV-9** |
| بوابة القبول | 🔴 | لا رحلات end-to-end مثبتة | **HR-REV-8** |
| التتبع الميداني | 🟠 | خلفية مكتملة، تطبيق ميداني ناقص (`HR_FIVE_AREAS_DEEP_AUDIT`) | تشغيلي مستقل |

---

## 11. قائمة الـPRs العلاجية الصغيرة المقترحة (مرتّبة، بعد الاعتماد)

> لا يُنفّذ أيٌّ منها قبل اعتماد المجلس. مرتّبة حسب أولوية #2219.

1. **🏛 قرار: المصدر القانوني للمسمى الوظيفي** (§8.7). مخرَج: ADR + خطة توحيد `jobTitle`/`positions`/`job_titles`. **يسبق `HR-REV-4`.**
2. **🏛 قرار: canonical الهيكل التنظيمي** = `org-tree`؛ تحويل `organization` + `organization/structure` إلى redirect/tab.
3. **✅ PR صغير فوري: إصلاح authz** لـ`justify`/`appeal` (§8.6) — كتابة محكومة بـ`list`.
4. **🏛 قرار: مالك الهيكل** في `org.ts` (`hr.employees` vs `admin`) (§8.5).
5. **🏛 قرار: مصير الأصداف المتقدمة** (`*/advanced`) — دمج كـtab أم إزالة.
6. **🏛 قرار: توحيد لوحتَي التفعيل** (`employee-activation` + `onboarding-review`) — مدخل `HR-REV-3`.
7. **🔶 تحقق حيّ:** عدّ grants لكل دور لتثبيت «5 من 9» وحسم `hr_admin`/`employee_self_service`.
8. **🔶 إغلاق:** توحيد `employeeId`↔`assignmentId` في نماذج الإنشاء (§6.1).
9. **🏛 قرار:** تجزئة المفاتيح المحمّلة (`hr.attendance`, `hr.organization`, `hr.exit`) (§8.4).
10. **🏛 قرار:** فصل لوحة HR عن وحدة `bi` (FU-2) (§7).

---

## 12. سجل القرارات المعمارية المطلوبة (ADR backlog)

| # | القرار | يحجب |
|---|--------|------|
| ADR-HR-01 | المصدر القانوني للمسمى الوظيفي (توحيد رباعي) | HR-REV-4 |
| ADR-HR-02 | canonical الهيكل التنظيمي ومالكه | HR-REV-2 |
| ADR-HR-03 | حدود ملكية HR مقابل المسارات الخادمة في نموذج إنشاء الموظف | HR-REV-3 |
| ADR-HR-04 | سياسة تجزئة مفاتيح الصلاحيات الخشنة | HR-REV-1 |
| ADR-HR-05 | فصل لوحة HR عن BI | HR-REV-6 |
| ADR-HR-06 | نموذج «السياسة ≠ الواقعة ≠ الجزاء ≠ الاعتماد» ومركزه | HR-REV-7 |

---

## 13. ما لم يُنجز / القيود المعلنة

- 🔶 لم يُسحب نصّ المرفقين `.docx` (مرفوعان على الـIssue لا في المستودع). دُمجت نقاطهما الملخّصة في §8 بعد التحقق. **إجراء مطلوب:** رفعهما إلى `docs/hr/_inbox/` لإكمال الدمج الحرفي إن لزم.
- 🔶 أعداد الـgrants الدقيقة لكل دور تحتاج قاعدة بيانات حية.
- 🔶 تغطية audit لكل كتابة في `org.ts` تحتاج فحصًا لكل endpoint.
- لم تُجرَ أي تعديلات على navigation أو صفحات أو schema (التزامًا بـ«ممنوع تعديل navigation قبل معرفة canonical»).

---

## 14. التوصية للمجلس

**اعتماد هذا الجرد كخط أساس**، ثم البدء بالترتيب: `HR-REV-1` (مصفوفة الأدوار) مع تنفيذ **PR §11-3 فقط** (إصلاح authz الفوري) بالتوازي لأنه حقيقة مثبتة لا قرار. تبقى كل قرارات الدمج/الحذف/التوحيد محجوزة خلف ADRs §12 حتى اعتمادها صراحة.

— نهاية HR-REV-0 —
