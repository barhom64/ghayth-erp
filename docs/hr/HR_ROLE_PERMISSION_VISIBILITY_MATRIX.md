# HR-REV-1 — مصفوفة الأدوار والصلاحيات والظهور لمسار الموارد البشرية

> **Issue:** [#2220](https://github.com/barhom64/ghayth-erp/issues/2220)
> **يبني على:** `docs/hr/HR_EXPERT_COUNCIL_REVIEW.md` (HR-REV-0)
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14
> **الحالة:** مصفوفة قرار (read-only). الإصلاحات مقترحة، لا تُنفَّذ قبل الاعتماد.

**مفتاح الأدلة:** ✅ مثبت من الكود · 🔶 فرضية تحتاج تحقّقًا حيًّا · 🏛 قرار معماري مطلوب · 🚩 خلل مرصود.

---

## 0. الملخص التنفيذي ولوحة القرار

تحويل الأدوار من «انطباع» إلى «عقد تشغيل» كشف **3 مشاكل بنيوية مثبتة من الكود**:

1. 🚩 **خلل visible+403 حقيقي** لدورَي `department_manager` و`payroll_officer`: يريان **كل** عناصر قائمة HR بينما صلاحياتهما محدودة، لأنهما **غير مُدرجين في `roleKeySubPages`** فيسقطان إلى «الوحدة مسموحة ⇒ كل subKeys تظهر». المجموعة الوحيدة المحميّة بـ`perm` صريح هي «الامتثال والجزاءات».
2. 🚩 **6 من 13 persona مطلوبة لا توجد أصلًا كأدوار**: `hr_officer`, `field_employee`, `finance_user`, `fleet_user`, `warehouse_user`, `documents_user` (refs=0 في الكتالوج والـmigrations).
3. 🚩 **مصدران متضاربان لتعريف الأدوار**: `autoMigrate.DEFAULT_ROLE_DEFS` (الفعّال وقت التشغيل، يستهلكه `companyBootstrap`) و`rbacCatalog.ROLE_PERMISSIONS` (للعرض فقط في `admin.ts`) — وتعريف الموظف **مختلف** بينهما.

**قرارات مطروحة:**
- 🏛 **D1:** هل تُنشأ الأدوار الستة الناقصة أم تُسقَط الـpersona إلى الأدوار القائمة؟
- 🏛 **D2:** علاج visible+403: إدراج `department_manager`/`payroll_officer` في `roleKeySubPages`، أم إضافة `perm` صريح لكل مجموعة قائمة (كما في الامتثال)؟ (موصى به: الاثنان معًا — دفاع طبقي).
- 🏛 **D3:** توحيد مصدر تعريف الأدوار (إهمال `rbacCatalog.ROLE_PERMISSIONS` أو مزامنته).
- 🏛 **D4:** من يملك grant/revoke الصلاحيات؟ HR يملك «ربط الموظف بالدور/النطاق» لكن منح/سحب الصلاحية العامة بيد admin — يحتاج تعريف حدّ HR Access Lifecycle.

---

## 1. مطابقة الـPersona المطلوبة بالأدوار الفعلية — ✅ مثبت

الأدوار التي طلب #2220 تغطيتها مقابل ما هو موجود فعلًا (`roleModulesCatalog.ts`, `autoMigrate.DEFAULT_ROLE_DEFS`, migration 278/291):

| Persona مطلوبة | role key فعلي؟ | البديل/الملاحظة |
|----------------|----------------|------------------|
| `owner` | ✅ موجود (level 100) | — |
| `hr_manager` | ✅ موجود (level 70) | — |
| `hr_officer` | ❌ **غير موجود** | يُغطّى جزئيًا بقوالب 278 (attendance/discipline/performance officers) لكنها **وهمية بلا grants** |
| `payroll_officer` | ✅ موجود (level 50) | فعّال بعد PR-9a/291 |
| `department_manager` | ✅ موجود (level 50) | فعّال بعد PR-9a/291 |
| `branch_manager` | ✅ موجود (level 60) | — |
| `employee` | ✅ موجود (level 10) | لا يملك وحدة hr أصلًا (BASE فقط) |
| `field_employee` | ❌ **غير موجود** | يُمثَّل بـ`categoryKey`/سياسة حضور لا بدور |
| `driver` | ✅ موجود (level 10) | وحدة fleet لا hr |
| `finance_user` | ❌ **غير موجود** | الموجود `finance_manager` |
| `fleet_user` | ❌ **غير موجود** | الموجود `fleet_manager` |
| `warehouse_user` | ❌ **غير موجود** | الموجود `warehouse_manager` |
| `documents_user` | ❌ **غير موجود** | الوثائق صلاحية مشتركة (`documents:read`) لا دور |

🏛 **D1:** الأدوار الستة الناقصة إمّا تُنشأ بـgrants حقيقية، أو يُعاد تعريف الـpersona في المصفوفة كأدوار قائمة. **لا يجوز اختبار persona غير موجود.**

---

## 2. كتالوج الأدوار الفعلية (المرجع) — ✅ مثبت

المصدر: `roleModulesCatalog.ts` (modules+level) + `autoMigrate.DEFAULT_ROLE_DEFS` (grants).

| الدور | Level | وحدة HR؟ | grants HR الفعلية (مختصر) | النطاق |
|------|-------|----------|---------------------------|--------|
| `owner` | 100 | ✅ | `*` | كل الشركة |
| `general_manager` | 90 | ✅ | `hr:*`,`employees:*`,`attendance:*`,`leaves:*` | كل الشركة |
| `hr_manager` | 70 | ✅ | `hr:*`,`employees:*`,`attendance:*`,`leaves:*`,`payroll:*` | كل الشركة |
| `branch_manager` | 60 | ✅ | `employees:read`,`attendance:*`,`leaves:approve` | **فرعه** |
| `department_manager` | 50 | ✅ | `hr.employees:read`,`hr.attendance:read/export`,`hr.leaves:read/approve/reject`,`hr.performance:read/create/update` | **إدارته** |
| `payroll_officer` | 50 | ✅ | `hr.payroll.*`,`hr.payroll.runs:*`(عدا approve),`hr.payroll.wps:*`,`hr.attendance:read/export` | الشركة (مسار رواتب) |
| `employee` | 10 | ❌ (BASE) | `attendance:self`,`leaves:self`,`profile:self`,`requests:self` | **نفسه** |
| `driver` | 10 | ❌ (fleet) | `attendance:self`,`leaves:self`,`profile:self`,`fleet:read` | **نفسه** |
| `attendance_officer` | (278) | — | **∅ (وهمي)** | — |
| `discipline_officer` | (278) | — | **∅ (وهمي)** | — |
| `performance_reviewer` | (278) | — | **∅ (وهمي)** | — |

> ⚠️ **ملاحظة:** `payroll_officer` **لا يملك `approve` على مسيرات الرواتب** عمدًا («لا يعتمد بنفسه» — migration 278)، **ولا أي grant على الانضباط** (PR-10). هذا تصميم سليم لفصل الواجبات (SoD).

---

## 3. جدول 1 — الظهور في القائمة (Sidebar Visibility) — ✅ مثبت

آلية الترشيح (5 طبقات، `sidebar-layout.tsx:105–128`): module → feature flag → minRoleLevel → **subKey (`canAccessSubPage`)** → perm.

`canAccessSubPage` (`app-context.tsx:497`) يقرأ خريطة `roleKeySubPages`:

| الدور في `roleKeySubPages`؟ | subKeys HR الظاهرة |
|-----------------------------|---------------------|
| `owner` / `general_manager` / `hr_manager` | **كل** subKeys HR |
| `branch_manager` | **`employees`, `attendance`, `leaves` فقط** ✅ مقيّد |
| `department_manager` | ❌ **غير مُدرج** → يسقط إلى «كل subKeys» 🚩 |
| `payroll_officer` | ❌ **غير مُدرج** → يسقط إلى «كل subKeys» 🚩 |
| أي دور بلا وحدة hr (`employee`,`driver`,`finance_manager`...) | **لا قسم HR إطلاقًا** ✅ |

✅ **النتيجة:** قسم HR يظهر فقط لـ`owner/GM/hr_manager/branch_manager/department_manager/payroll_officer`. الموظف العادي والسائق **لا يريان قائمة HR** — خدمتهم الذاتية تمرّ عبر وحدة `requests`/كتالوج الخدمات لا عبر HR.

---

## 4. جدول 2 — حالة فتح الصفحات لكل دور (الجوهر: visible+403) — ✅ مثبت

التصنيف لكل مجموعة قائمة HR × دور: **H** مخفي · **200** يظهر ويفتح · **🚩403** يظهر ثم يُرفض (خلل) · **—** لا ينطبق.

| مجموعة القائمة | gating | hr_manager | branch_manager | department_manager | payroll_officer |
|----------------|--------|:----------:|:--------------:|:------------------:|:---------------:|
| الموظفون (employees) | subKey | 200 | 200 | 200 (read) | 🚩**403** |
| الحضور (attendance) | subKey | 200 | 200 | 200 (read) | 200 (read) |
| الإجازات (leaves) | subKey | 200 | 200 | 200 | 🚩**403** |
| الرواتب (payroll) | subKey | 200 | **H** (لا subKey) | 🚩**403** | 200 |
| الأداء (performance) | subKey | 200 | **H** | 200 | 🚩**403** |
| التدريب (training) | subKey | 200 | **H** | 🚩**403** | 🚩**403** |
| التوظيف (recruitment) | subKey | 200 | **H** | 🚩**403** | 🚩**403** |
| الهيكل (organization) | subKey | 200 | **H** | 🚩**403** | 🚩**403** |
| الورديات (shifts) | subKey | 200 | **H** | 🚩**403** | 🚩**403** |
| **الامتثال والجزاءات** | **perm صريح** | 200 | **H** ✅ | **H** ✅ | **H** ✅ |
| WPS/سعودة | perm صريح | 200 | H | H ✅ | 200 (wps) |

> ✅ **القراءة:** `branch_manager` آمن (مقيّد بثلاث subKeys). مجموعة «الامتثال» آمنة للجميع (perm صريح — مخرج PR-10). لكن **`department_manager` و`payroll_officer` يولّدان visible+403 على عدة مجموعات** لأنهما غير مُدرجين في `roleKeySubPages` ولا تحمل تلك المجموعات `perm` صريحًا.

🚩 **خلل مرصود (يخالف قاعدة #2220 «لا رابط يظهر ثم يعطي 403»):**
- `department_manager`: payroll, training, recruitment, organization, shifts → تظهر وتُرفض.
- `payroll_officer`: employees, leaves, performance, training, recruitment, organization, shifts → تظهر وتُرفض.

**الإصلاح المقترح (D2):**
1. إدراج الدورين في `roleKeySubPages` بـsubKeys مطابقة لـgrants:
   - `department_manager: { hr: ["employees","attendance","leaves","performance"] }`
   - `payroll_officer: { hr: ["payroll","attendance"] }`
2. وكطبقة دفاع ثانية: نقل بقية مجموعات HR إلى نمط «perm صريح» مثل مجموعة الامتثال (`perm: ["hr.payroll:view",...]`, `permMode:"any"`).
3. guard/smoke يثبت عدم وجود visible+403 لكل persona.

---

## 5. جدول 3 — الملكية والنطاق (Scope) — ✅ مثبت

| الدور | كل الشركة | فرعه | إدارته | قسمه | مرؤوسيه | نفسه |
|------|:--------:|:----:|:-----:|:----:|:-------:|:----:|
| `owner`/`GM` | ✅ | — | — | — | — | — |
| `hr_manager` | ✅ | — | — | — | — | — |
| `branch_manager` | — | ✅ | — | — | — | — |
| `department_manager` | — | — | ✅ | — | (عبر الإدارة) | — |
| `payroll_officer` | ✅ (مسار رواتب) | — | — | — | — | — |
| `employee` | — | — | — | — | — | ✅ |
| `driver` | — | — | — | — | — | ✅ |

> النطاق يُفرض خلفيًا عبر `scopeFilter` في `authzEngine` (WHERE حسب الدور). ✅ مثبت في `PERSONAS_VISIBILITY_MATRIX.md`: `/employees` يعيد 54 صفًا لـowner، 32 لـhr_manager (فرع واحد)، 0 لمن لا يملك hr.

🔶 **يحتاج تحقّقًا حيًّا:** هل نطاق `department_manager = department` مُطبَّق فعلًا على كل قراءات HR أم بعضها فقط؟ (الـgrants تحدّد department، لكن تطبيق `scopeFilter` لكل endpoint يحتاج فحصًا).

---

## 6. جدول 4 — الأعمال المسموحة (Allowed Actions) — ✅ مثبت من grants

| العمل | الصلاحية | hr_manager | branch_manager | department_manager | payroll_officer | employee |
|------|----------|:---------:|:--------------:|:-----------------:|:---------------:|:--------:|
| إنشاء موظف | `hr.employees:create` | ✅ | ❌ | ❌ (read) | ❌ | ❌ |
| تعديل بيانات شخصية | `hr.employees:update` | ✅ | ❌ | ❌ | ❌ | (self عبر خدمة ذاتية) |
| تعديل تعيين تنظيمي | `hr.employees:update` | ✅ | ❌ | ❌ | ❌ | ❌ |
| تعديل راتب | `hr.contracts/payroll:update` | ✅ | ❌ | ❌ | ✅ (تحضير) | ❌ |
| اعتماد إجازة | `hr.leaves:approve` | ✅ | ✅ | ✅ | ❌ | ❌ |
| إنشاء جزاء | `hr.discipline/violations:create` | ✅ | ❌ | ❌ | ❌ | ❌ |
| اعتماد جزاء | `hr.discipline:approve` | ✅ | ❌ | ❌ | ❌ | ❌ |
| عرض وثائق | `documents:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| عرض راتب | `hr.payroll:view` | ✅ | ❌ | ❌ | ✅ | (self payslip) |
| منح صلاحية | `admin.roles/grants` | ❌* | ❌ | ❌ | ❌ | ❌ |
| طلب صلاحية | (طلب) | ✅ | ✅ | ✅ | ✅ | ✅ |
| سحب صلاحية | `admin` | ❌* | ❌ | ❌ | ❌ | ❌ |
| إيقاف موظف | `hr.employees:update`/lifecycle | ✅ | ❌ | ❌ | ❌ | ❌ |
| إنهاء خدمة | `hr.employees:delete`/lifecycle | ✅ | ❌ | ❌ | ❌ | ❌ |

> *🏛 **D4:** منح/سحب الصلاحية العامة محكوم بـ`admin` لا HR. لكن #2220 ينصّ أن **HR يملك دورة حياة وصول الموظف** (ربطه بالدور/النطاق). يجب تعريف هذا الحدّ: HR يُنشئ/يربط الدور عند التعيين، وadmin يملك تعريف المنصّة. حاليًا الربط يتم في wizard إنشاء الموظف (PR-1) لكن «طلب/سحب صلاحية لاحقًا» غير مُسنَد لدور HR صراحةً.

---

## 7. HR Access Lifecycle — دورة حياة وصول الموظف

ما الذي يجب أن يتغيّر في الصلاحيات عند كل حدث، وما الحالة الفعلية:

| الحدث | المتوقّع (#2220) | الحالة الفعلية | الفجوة |
|------|------------------|----------------|--------|
| إنشاء موظف | حساب + دور + نطاق | ✅ wizard ذرّي (PR-1): employee+assignment+user+role | جيد |
| نقل موظف (transfer) | تغيير النطاق/الدور | 🔶 `transfers` يغيّر التعيين، لكن **هل يحدّث نطاق RBAC؟** غير مؤكد | 🏛 ربط transfer بإعادة منح النطاق |
| تغيير منصب/ترقية | تغيير الدور | 🔴 لا workflow ترقية مرصود (HR_FIVE_AREAS) | فجوة |
| تكليف مؤقت | grant مؤقت بانتهاء | 🔶 `rbac_user_grants` يدعم temporary، لكن لا ربط من HR | فجوة ربط |
| إيقاف (suspend) | تعليق/سحب الصلاحيات | 🔶 `employee-activation` يضبط status=suspended، **لكن هل يُعطّل حساب المستخدم/الصلاحيات تلقائيًا؟** غير مؤكد | 🚩 محتمل: موظف موقوف بصلاحيات حيّة |
| فصل (terminate) | إغلاق كل الوصول | 🔶 DELETE/lifecycle يغلق الموظف، **تعطيل الحساب وسحب الأدوار؟** يحتاج تحقّقًا | 🚩 نفس الخطر |
| عودة | إعادة تفعيل | 🔶 lifecycle يدعم العودة، الربط بالصلاحيات غير مؤكد | فجوة |

🔶 **أهم تحقّق حيّ مطلوب:** هل إيقاف/فصل الموظف يسحب/يعطّل `rbac_user_roles` وحساب `users` تلقائيًا؟ إن لا ⇒ **خلل أمني تشغيلي** (صلاحيات حيّة لموظف موقوف). هذا أعلى أولوية بعد visible+403.

---

## 8. مخالفات القواعد الصارمة (#2220) — ملخص

| القاعدة | الحالة |
|---------|--------|
| لا رابط يظهر ثم يعطي 403 | 🚩 **مخالَفة** لـdepartment_manager/payroll_officer (§4) |
| لا صلاحية بلا سبب/سجل/نطاق | 🔶 grants القوالب موجودة؛ سحب/منح يدوي يحتاج audit (RBAC-001) |
| لا دور أوسع من وظيفته بلا grant | ✅ النطاقات مضبوطة، عدا visible+403 |
| payroll لا يرى التحقيقات/الجزاءات | ✅ **مضبوط** (لا grant انضباط لـpayroll_officer + perm gating) |
| department_manager لا يرى الرواتب | 🚩 **مخالَفة**: يرى رابط الرواتب (visible+403) رغم عدم امتلاك الصلاحية |
| الاعتماد على إخفاء الواجهة دون حماية backend | ✅ backend يفرض `authorize`/`scopeFilter` دائمًا (403 حقيقي) — المشكلة عكسية: الواجهة لا تُخفي ما يُرفض |

---

## 9. قائمة الإصلاحات الصغيرة المقترحة (بعد الاعتماد)

1. **🚩→✅ PR صغير: علاج visible+403** — إضافة `department_manager` و`payroll_officer` إلى `roleKeySubPages` (subKeys مطابقة للـgrants). أثر فوري، منخفض الخطورة.
2. **🚩 PR: perm صريح لمجموعات القائمة** — تعميم نمط مجموعة «الامتثال» على Payroll/Employees/Performance/... (دفاع طبقي).
3. **🔶→تحقّق: HR Access Lifecycle على الإيقاف/الفصل** — التأكد أن suspend/terminate يعطّل حساب المستخدم ويسحب الأدوار؛ وإلا PR ربط.
4. **🏛 قرار D1:** إنشاء/إسقاط الأدوار الستة الناقصة.
5. **🏛 قرار D3:** توحيد مصدر تعريف الأدوار (إهمال `rbacCatalog.ROLE_PERMISSIONS` أو مزامنته آليًا مع `DEFAULT_ROLE_DEFS`).
6. **🏛 قرار D4:** تعريف حدّ ملكية HR لدورة حياة الوصول (ربط الدور/النطاق) مقابل admin (تعريف المنصّة).
7. **guard/smoke:** اختبار لكل persona يثبت (أ) لا visible+403، (ب) النطاق مطبَّق، (ج) لا رؤية حقول حساسة بلا صلاحية.

---

## 10. القرارات المعمارية المضافة لـ ADR backlog

| # | القرار | يحجب |
|---|--------|------|
| ADR-HR-07 | علاج visible+403: subKey-map أم perm-gating أم الاثنان | HR-REV-2 (التنقّل) |
| ADR-HR-08 | نموذج الـpersona النهائي (الأدوار الستة الناقصة) | كل HR-REV |
| ADR-HR-09 | توحيد مصدر تعريف الأدوار | الحوكمة |
| ADR-HR-10 | حدّ HR Access Lifecycle مقابل admin RBAC | HR-REV-3 |

---

## 11. القيود المعلنة

- 🔶 تطبيق `scopeFilter` لكل endpoint، وسلوك suspend/terminate على الحساب/الأدوار: يحتاجان قاعدة بيانات حية + تتبّع تشغيلي لحسمهما رقميًا.
- لم تُجرَ تعديلات على الكود في هذه المهمة (مصفوفة فقط). إصلاح authz الوحيد المنفّذ هو ضمن HR-REV-0/PR #2272 (`justify`/`appeal`).

— نهاية HR-REV-1 —
