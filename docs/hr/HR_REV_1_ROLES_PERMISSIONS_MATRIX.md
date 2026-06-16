# HR-REV-1 — مصفوفة الأدوار والصلاحيات لمسار الموارد البشرية

> **Issue الأم:** [#2219](https://github.com/barhom64/ghayth-erp/issues/2219) — المهمة المنهجية لكل `HR-REV-*`
> **يستند إلى:** `docs/hr/HR_EXPERT_COUNCIL_REVIEW.md` (HR-REV-0)
> **الفرع:** `claude/wizardly-babbage-mgsv2i`
> **التاريخ:** 2026-06-14
> **الحالة:** تقرير مصفوفة وقرار (read-only) — **لا يبدأ أي تنظيف صفحات (HR-REV-2) أو تفعيل سريع (HR-REV-3) قبل اعتماد هذه المصفوفة.**

هذا التقرير يجيب على سؤال HR-REV-1 الأربعة: **مَن يرى؟ مَن يملك؟ ما النطاق (شركة/فرع/قسم/ذاتي)؟ ومِن أين يأتي القرار (الدور أم الإشراف أم سلطة اعتماد شخصية)؟**

---

## مفتاح الأدلة (Legend)

| الوسم | المعنى |
|------|--------|
| ✅ **مثبت** | حقيقة من الكود مع `file:line`. |
| 🔶 **فرضية** | مرجّح ويحتاج تحقّقًا حيًّا (استعلام DB أو تتبّع تشغيلي). |
| 🏛 **قرار** | قرار معماري مطلوب من المجلس قبل أي علاج. |

---

## 0. الملخص التنفيذي ولوحة القرار

نموذج صلاحيات الموارد البشرية **خماسي الطبقات** وحقيقي: موديول → ميزة → إجراء → نطاق → حقل. لكن **مصدر القرار ليس الدور وحده**؛ هناك **أربع آليات قرار متوازية** تتقاطع وأحيانًا تتضارب:

1. **منحة الدور** (`rbac_role_grants`) عبر `authorize()` — الطبقة الأساسية.
2. **نطاق الإشراف** (`managedDepartmentIds` / `directReportEmployeeIds`) — يوسّع/يضيّق ما يراه القرار حسب من تُدير، لا حسب دورك.
3. **سلطة الاعتماد الشخصية** (`approval_authorities` فوق `rbac_approval_limits`) — تتقدّم على حدّ الدور لكل (تكليف × ميزة × إجراء).
4. **مجموعات الأدوار النصية** في `rbacCatalog.ts` (`LEAVE_APPROVAL_ROLES`…) — بوابة ثانية **داخل المعالِج** بفحص `scope.role` نصيًّا.

**المشكلة الجوهرية (🏛):** الآليتان (1) و(4) **بوابتان متوازيتان غير متّسقتين**. دور يملك منحة `hr.leaves:approve` لكنه خارج `LEAVE_APPROVAL_ROLES` → **يُحجب رغم امتلاكه الصلاحية**. وبالعكس، الاعتماد في عدة مسارات يُفحَص بـ`action:"update"` لا `approve` → **من يملك تعديلًا يعتمد** متجاوزًا `approvableActions` في الكتالوج.

**الحجم المُحصى من الكود:**

| المؤشر | العدد | الدليل |
|--------|------|--------|
| ميزات `hr.*` في الكتالوج | **25** | `featureCatalog.ts:66–169` |
| أدوار لها منح HR فعلية | **6** | hr_manager, hr_specialist, department_manager, payroll_officer, general_manager, branch_manager |
| قوالب HR **بلا أي منح** (phantom) | **3** | `278`: attendance_officer, discipline_officer, performance_reviewer |
| آليات قرار متوازية | **4** | §4 |
| مسارات اعتماد محكومة بـ`update` بدل `approve` | **≥8** | §5، `hr.ts`/`hr-loans.ts`/`hr-overtime.ts` |

**أهم 6 قرارات مطروحة على المجلس** (التفصيل §6):

1. 🏛 **توحيد بوابتَي القرار**: إلغاء فحص `scope.role` النصي والاكتفاء بمنحة `feature:action`، أو جعل المجموعات النصية مُشتقّة من المنح.
2. 🏛 **تصحيح فعل الاعتماد**: مسارات `*/approve` يجب أن تُحكَم بـ`action:"approve"` لا `"update"`.
3. 🏛 **مصير القوالب الشبحية الثلاثة** (278): تُمنح صلاحيات حقيقية أم تُحذف.
4. 🏛 **حبيبية حارس `org.ts`**: `admin:update` واحد يفتح خطوط الإشراف وسلطات الاعتماد معًا — يحتاج تمييزًا.
5. 🏛 **اعتماد `internal_auditor`** (أُضيف في #2356) كبديل رسمي لمجموعة `APPROVAL_AUDIT_ROLES` النصية.
6. 🏛 **سياسة النطاق الافتراضي للأدوار الجديدة**: تأكيد `department` لمدير القسم و`company` لمسؤول الرواتب كقاعدة.

---

## 1. المنهجية ومصادر الأدلة

مبني من قراءة الكود مباشرة:

- **الكتالوج:** `artifacts/api-server/src/lib/rbac/featureCatalog.ts`.
- **المنح المزروعة:** `migrations/258_seed_standard_functional_roles.sql` (قوالب نظام)، `migrations/306_seed_standard_role_grants_fix.sql` (منح department_manager/payroll_officer الحيّة)، `migrations/278_default_hr_role_templates.sql` (صفوف قوالب بلا منح).
- **بوتستراب الشركات الجديدة:** `lib/rbac/autoMigrate.ts:192–230` (`DEFAULT_ROLE_DEFS`).
- **محرّك الفحص والنطاق:** `lib/rbac/authzEngine.ts` (loadScopeContext، evaluateScopeForRecord).
- **آليات القرار:** `migrations/109` (rbac_approval_limits)، `migrations/275_supervision_approval_authorities.sql`، `migrations/140_rbac_jit_elevation.sql`، `lib/rbacCatalog.ts` (مجموعات الأدوار).
- **المعالِجات:** `routes/hr.ts`, `hr-loans.ts`, `hr-overtime.ts`, `employees.ts`, `org.ts`, `rbacV2.ts`.
- **وثائق سابقة:** `docs/hr/PERSONAS_VISIBILITY_MATRIX.md`, `docs/rbac/UNIFIED_USER_ROLE_MODEL.md`, `docs/hr/SIDEBAR_MATRIX.md`.

### تصحيحات مرجعية (إفصاح أمين)

- ✅ المنح الحيّة لـ`department_manager`/`payroll_officer` مزروعة في **`306`** لا 291. التعليق في `autoMigrate.ts:210` يُسمّيها «migration 291» خطأً (291 يخص GRNI المالية).
- ✅ ملف **`278`** يزرع **صفوف الأدوار فقط بلا `rbac_role_grants`** — أي قوالب بلا صلاحيات فعلية.
- ✅ لا وجود لدور `internal_auditor` في الأساس (258/306/autoMigrate)؛ أُضيف كقالب جديد في PR **#2356** على هذا الفرع.

---

## 2. كتالوج ميزات HR (الطبقة 2–4)

الثوابت: `ALL_ACTIONS = [view, list, create, update, delete, approve, reject, cancel, export]` (`featureCatalog.ts:58`)، `ALL_SCOPES = [self, team, department, department_tree, branch, branches, company, multi_company, all]` (`:60`).

| الميزة | labelAr | النطاقات | يقبل approve؟ | ذاتية؟ | حقول حساسة | حرجة | سطر |
|--------|---------|----------|:---:|:---:|------------|:---:|----|
| `hr.employees` | ملفات الموظفين | ALL | — | — | salary, iban, nationalId, iqama, passport, dob, phone | — | 68 |
| `hr.employees.self` | ملفي الشخصي | self | — | ✅ | — | — | 73 |
| `hr.attendance` | الحضور | ALL | — | — | — | — | 77 |
| `hr.attendance.checkin` | تسجيل حضوري | self | — | ✅ | — | — | 80 |
| `hr.leaves` | الإجازات | ALL | ✅ | — | — | — | 84 |
| `hr.leaves.my` | إجازاتي | self | — | ✅ | — | — | 88 |
| `hr.payroll` | الرواتب | dept/branch/company | ✅ | — | amount, netPay, bankAccount | — | 92 |
| `hr.payroll.my_payslip` | كشف راتبي | self | — | ✅ | — | — | 97 |
| `hr.payroll.runs` | تشغيلات الرواتب | branch/company | ✅ | — | — | — | 101 |
| `hr.payroll.wps` | حماية الأجور WPS | branch/company | — | — | iban, iqama, amount, bankRef | — | 105 |
| `hr.saudization` | السعودة | company | — | — | — | — | 112 |
| `hr.discipline` | الانضباط | ALL | ✅ | — | — | — | 118 |
| `hr.recruitment` | التوظيف | ALL | — | — | — | — | 122 |
| `hr.training` | التدريب | ALL | — | — | — | — | 125 |
| `hr.performance` | الأداء | ALL | — | — | rating, managerNotes | — | 128 |
| `hr.performance.self` | تقييمي | self | — | ✅ | — | — | 132 |
| `hr.organization` | الهيكل التنظيمي | company | — | — | — | — | 136 |
| `hr.violations` | المخالفات | ALL | — | — | — | — | 139 |
| `hr.loans` | السلف والقروض | ALL | ✅ | — | amount, monthlyDeduction | — | 146 |
| `hr.loans.my` | سلفي | self | — | ✅ | — | — | 150 |
| `hr.overtime` | العمل الإضافي | ALL | ✅ | — | totalAmount | — | 154 |
| `hr.overtime.my` | ساعاتي الإضافية | self | — | ✅ | — | — | 158 |
| `hr.contracts` | عقود الموظفين | ALL | — | — | salary, allowances | — | 162 |
| `hr.exit` | إنهاء الخدمة | ALL | ✅ | — | finalSettlement, eosb | **✅** | 166 |
| `hr` (الجذر) | الموارد البشرية | ALL | — | — | — | — | 66 |

**ملاحظة (🔶):** `hr.violations` و`hr.discipline` ميزتان منفصلتان؛ `violations` **لا تُعرّف `approve` كـapprovableAction** رغم أن مساره يستخدم approve/reject (§5) — مصدر التباس مرشّح لـHR-REV-7.

---

## 3. المصفوفة: الأدوار × صلاحيات HR × النطاق

> «✱» = المنحة على `hr.*` (كل ميزات HR). الأفعال بالاختصار: R=view/list، C=create، U=update، A=approve/reject، X=export، D=delete.

| الدور | المستوى | منحة HR | الأفعال | النطاق | مصدر المنحة |
|------|:---:|---------|---------|--------|------------|
| `owner` | 100 | `*` | كل الأفعال | all | autoMigrate:193 |
| `general_manager` | 90 | `*` | R C U A X D | company | 258:25 / autoMigrate:194 |
| `hr_manager` | 70 | `hr.*` ✱ | R C U A X D + reopen/cancel/share | company | 258:60 |
| `branch_manager` | 60 | `*` (بلا U/D) | R C A X (لا update/delete) | branch | 258:34 |
| `department_manager` | 50 | جزئي | employees:R · attendance:R/X · leaves:R/**A** · performance:R/C/U | **department** | 306:50–68 |
| `payroll_officer` | 50 | جزئي | payroll:R/X · payroll.runs:R/X/**C/U** (لا A/D) · payroll.wps:R/X/C/U/submit · attendance:R/X | **company** | 306:98–116 |
| `hr_specialist` | 30 | `hr.*` ✱ | R C X (submit) — **لا A/U/D** | **department** | 258:198 |
| `employee` | 10 | ذاتية فقط | attendance:self · leaves:self · profile:self | self | autoMigrate:229 |
| `driver` | 15 | — (selfService floor) | حضوره/إجازاته/راتبه فقط | self | 258:232 + selfService |
| `attendance_officer` | 🔶 | **لا منح** | — | — | 278 (صف بلا grants) |
| `discipline_officer` | 🔶 | **لا منح** | — | — | 278 (صف بلا grants) |
| `performance_reviewer` | 🔶 | **لا منح** | — | — | 278 (صف بلا grants) |

### قراءة المصفوفة (نقاط مثبتة)

- ✅ **مدير القسم لا يرى رواتب**: منحه يقتصر على employees(قراءة)/attendance/leaves/performance بنطاق `department` (`306:50–68`). يعتمد الإجازات (`leaves:approve`) لكن **لا يملك أي منحة على `hr.payroll*`**.
- ✅ **مسؤول الرواتب يُحضّر ولا يعتمد**: `payroll.runs` بأفعال `create/update` فقط — **بلا `approve` وبلا `delete`** (`306:104`)، ومستبعَد عمدًا من `hr.discipline` و`hr.employees` (تعليق `306:92–95`). هذا فصل مهام مزروع في البيانات.
- ✅ **أخصائي الموارد ينفّذ ولا يعتمد**: `hr.*` بأفعال `view/list/export/create/submit` بنطاق `department` — **لا `approve/update/delete`** (`258:198`).
- ✅ **مدير الفرع لا يعدّل/يحذف**: منحته العامة `*` تُسقِط `update/delete` (`258:34`) — يرى ويُنشئ ويعتمد ضمن فرعه فقط.
- 🔶 **القوالب الثلاثة (278) شبحية**: لها صفّ دور لكن صفر `rbac_role_grants` → أي موظف يُسنَد إليها **محجوب عن كل ميزة** (checkAccess لا fallback) عدا أرضية الخدمة الذاتية.

---

## 4. مصدر القرار — الآليات الأربع المتوازية

### 4-أ) منحة الدور (الأساس)
`authorize({feature, action})` → `checkAccess` يطابق `rbac_role_grants` ثم النطاق ثم الحقول. هذه الطبقة الوحيدة المعلنة في تعريف المسار.

### 4-ب) نطاق الإشراف (يقرّره «من تُدير» لا دورك)
- ✅ `authzEngine.ts:283–307` `loadScopeContext`: يحسب `managedDepartmentIds` (`departments.managerId = employeeId`) و`directReportEmployeeIds` (`employee_assignments.managerId = employeeId AND status='active'`).
- ✅ `authzEngine.ts:309–340` `evaluateScopeForRecord`: نطاق `department_tree` يطابق «قسمك والأقسام التابعة لك»؛ والتصفية في SQL (`:375–383`) تمرّر `[employeeId, ...directReportEmployeeIds]`.
- ✅ خطوط الإشراف كبيانات: `supervision_lines` (`275`)، مسارات `/org/supervision-lines` (`org.ts:448/484/509`).
- **الأثر:** موظفان بنفس الدور `department_manager` يريان مجموعتَي سجلّات مختلفتين تمامًا حسب الأقسام/المرؤوسين المرتبطين بهما — **القرار من الإشراف لا الدور**.

### 4-ج) سلطة الاعتماد الشخصية (تتقدّم على حدّ الدور)
- ✅ حدّ الدور: `rbac_approval_limits` (`109:110–122`: role_id, feature, action, currency, max_amount, requires_dual_control)، يُقرأ في `authzEngine.ts:223`.
- ✅ تجاوز الشخص: `approval_authorities` (`275:74–93`: assignmentId, featureKey, action, maxAmount, requiresDualControl, **reason NOT NULL**, expiresAt, grantedBy) — يتقدّم على حدّ الدور لكل (تكليف×ميزة×إجراء). مثال التعليق: «يعتمد إلى 200K رغم أن دوره محدود بـ100K».
- ✅ المسارات: `/org/approval-authorities` (`org.ts:538/570/598`).

### 4-د) مجموعات الأدوار النصية (بوابة ثانية داخل المعالِج)
- ✅ `rbacCatalog.ts:54–72`: `LEAVE_APPROVAL_ROLES`, `PAYROLL_ROLES`, `LOAN_APPROVAL_ROLES`, `HR_APPROVAL_ROLES`, `APPROVAL_AUDIT_ROLES`…
- ✅ تُفحَص نصيًّا داخل المعالِجات: `hr-loans.ts:485,654`، `hr.ts:2245,2721,4494,4532,5241,5357`، `hr-overtime.ts:432,548`.
- **الأثر:** قرار الاعتماد الفعلي في كثير من مسارات HR يأتي من **هذه القائمة النصية**، لا من منحة `approve` في الكتالوج → §5.

### 4-هـ) الرفع المؤقت (JIT) — مسار استثناء
- ✅ `rbac_jit_requests` (`140`): طلب رفع بمبرّر ومدة [5..1440] دقيقة؛ الموافقة تُدرج صفًا مؤقتًا في `rbac_user_grants` بـ`expires_at`. `/jit/request` مفتوح لأي مستخدم (`rbacV2.ts:1104`)، الموافقة بحارس `admin.roles:update`.

---

## 5. الثغرات والتضاربات (مدخل HR-REV-7، للقرار لا للعلاج الآن)

### 5-أ) اعتماد محكوم بـ`update` بدل `approve` (يلتف على approvableActions) — ✅ مثبت
| المسار | الحارس الفعلي | المتوقَّع |
|--------|---------------|----------|
| `hr.ts:2228` `PATCH /leave-requests/:id/approve` | `hr.leaves action:update` | `approve` |
| `hr.ts:2716` `escalate` | `hr.leaves action:update` | `approve` |
| `hr.ts:4567–4569` `violations approve/reject/return` | `hr.violations action:update` | `approve`* |
| `hr-loans.ts:479/650` `approve/reject` | `hr.loans action:update` + `LOAN_APPROVAL_ROLES` نصيًّا | `approve` |
| `hr-overtime.ts:426/544` `approve/reject` | `hr.overtime action:update` + `HR_APPROVAL_ROLES` نصيًّا | `approve` |
| `hr.ts:4238` `approval-requests/:id/decide` | `hr.organization action:update` | فعل اعتماد مخصّص |

\* `hr.violations` لا يُعرّف `approve` كـapprovableAction أصلًا — يحتاج قرار كتالوج.

### 5-ب) ازدواج البوابة (over-restrict / over-permit) — 🏛
- **over-restrictive**: دور مخصّص يملك منحة `hr.leaves:approve` لكنه ليس ضمن `LEAVE_APPROVAL_ROLES` → يُحجب رغم المنحة.
- **over-permissive**: دور يملك `hr.leaves:update` (بلا approve) لكنه ضمن `HR_APPROVAL_ROLES` نصيًّا → يعتمد بلا منحة اعتماد.

### 5-ج) حارس `org.ts` غير حبيبي — 🏛
- ✅ كل كتابات `org.ts` (positions/teams/committees/**supervision-lines**/**approval-authorities**) محكومة بـ`ADMIN_WRITE = {feature:"admin", action:"update"}` (`org.ts:26`). صلاحية `admin:update` واحدة تفتح **خطوط الإشراف وسلطات الاعتماد الشخصية** معًا — لا تمييز بين الكيانات شديدة الحساسية وغيرها.

---

## 6. القرارات المطروحة على المجلس (🏛)

| # | القرار | الأثر / المخاطرة | مدخل المرحلة |
|---|--------|------------------|--------------|
| 1 | **توحيد بوابتَي القرار**: إلغاء فحص `scope.role` النصي والاعتماد على `feature:action`، أو اشتقاق المجموعات من المنح | يزيل تضارب §5-ب؛ مخاطرة: مسّ مسارات اعتماد حيّة كثيرة | HR-REV-7 |
| 2 | **تصحيح فعل الاعتماد** في مسارات `*/approve` إلى `action:"approve"` | يجعل `approvableActions` ذا معنى؛ يتطلب منح approve صريحة للأدوار المعتمِدة أولًا | HR-REV-7 |
| 3 | **مصير القوالب الشبحية الثلاثة** (attendance/discipline/performance officer): منحها صلاحيات حقيقية (نمط 306) أم حذفها | اليوم تُسبّب «دور بلا صلاحيات» إن أُسند | HR-REV-1→2 |
| 4 | **تفكيك حارس `org.ts`**: مفاتيح ميزة منفصلة لخطوط الإشراف وسلطات الاعتماد بدل `admin:update` العام | يحدّ من تركّز صلاحية الحوكمة | HR-REV-7 |
| 5 | **اعتماد `internal_auditor`** (#2356) كبديل رسمي لـ`APPROVAL_AUDIT_ROLES` النصية | دور قراءة-فقط حقيقي بدل قائمة نصية | HR-REV-1 |
| 6 | **تثبيت سياسة النطاق الافتراضي**: department لمدير القسم، company لمسؤول الرواتب، self للموظف/السائق | يمنع انجراف النطاق في الأدوار الجديدة | HR-REV-3/4 |

---

## 7. التسليم إلى HR-REV-2

بعد اعتماد هذه المصفوفة:
- **HR-REV-2 (تنظيف الهيكل)** يبدأ بالقرار #3 (القوالب الشبحية) والقرار #6 (تثبيت النطاقات) كأساس قبل دمج/حذف الصفحات.
- **HR-REV-7 (السياسات)** يحمل القرارات #1/#2/#4 (توحيد بوابة الاعتماد وتفكيك حارس الحوكمة).
- **لا تفعيل سريع (HR-REV-3) قبل تثبيت النطاق الافتراضي (#6).**

> **بوابة:** هذه الوثيقة read-only. أي تعديل على المنح أو المسارات يبدأ بـPR منفصل بعد اعتماد المجلس، موسومًا بقرار من §6.
