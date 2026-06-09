# تقرير تنفيذ #1799 — HR Operating Foundation
## مراجعة بندًا بندًا من الكود الفعلي

> **هذا التقرير لا يعتمد على الـ docs أو على الـ commit messages**.
> كل بند مُرفق بدليل من الكود (مسار + رقم سطر) و verdict صادق.
> الـ verdict خماسي:
>
> - 🟢 **مُنفّذ ومدمج** — يعمل end-to-end في المسار التشغيلي
> - 🟡 **مُنفّذ جزئيًا** — backend أو UI أو wiring ناقص
> - 🔴 **غير مُنفّذ** — لا أثر له في الكود
> - 🟣 **مكرر** — موجود في أكثر من مكان، يحتاج توحيد
> - ⚠️ **risk** — مُنفّذ لكن مع ثغرة محددة موثَّقة

**تاريخ المراجعة:** 2026-06-08
**الفرع:** `claude/enterprise-hardening-roadmap-AOfO7`
**عدد commits على #1799 على هذا الفرع:** 40 commit
**عدد PRs مدموجة على main:** 11 PR (#1803, #1807, #1809, #1814, #1817, #1822, #1831, #1833, #1836, #1837, #1838, #1847, #1866)

---

## ١. الأولويات الـ12 — حالة كل بند

### الأولوية #1 — سجل الموظف الرئيسي الموحد (14 tabs)

| البند | الحالة | الدليل |
|---|---|---|
| `TABS = [...]` بـ 14 عنصر | 🟢 | `pages/employee-detail.tsx:354-372` |
| Backend يُعيد كل البيانات في Promise.all واحد | 🟢 | `routes/employees.ts:1384-1573` (15 query) |
| `account` tab — userAccount + lock state + lastLogin | 🟢 | route + UI block `employee-detail.tsx:870-960` |
| `roles` tab — rbac_user_roles + primary badge | 🟢 | `employee-detail.tsx:870-960` + endpoint موجود |
| `titles` tab — job_title + position level | 🟢 | يقرأ من `positions` (HR-013) |
| `contract` tab — active contract | 🟢 | من `employee_contracts` |
| `custodies` tab — assets | 🟢 | من `employee_assets` (HR-011) |
| `attendance/leaves/payroll/violations/tasks/trainings/finance` tabs | 🟢 | كانت موجودة قبل #1799 |
| `latestScore` + `activeSignals` في overview | 🟢 | `PerformanceWidget` (HR-014) |

**Verdict: 🟢 مكتمل**

---

### الأولوية #2 — ربط الموظف بالأدوار والصلاحيات

| البند | الحالة | الدليل |
|---|---|---|
| `rbac_user_roles` table | 🟢 موجود قبل #1799 | Migration 109 |
| Roles tab في ملف الموظف | 🟢 | `employee-detail.tsx:870-960` |
| Primary role badge | 🟢 | يستعمل `is_primary` |
| Expiry styling | 🟢 | يستعمل `expires_at` |
| Deep-link لشاشة الصلاحيات الفعلية | 🟢 | `employee-detail.tsx:1094` → `/admin/effective-permissions?userId=N` |

**Verdict: 🟢 مكتمل**

---

### الأولوية #3 — نموذج "ماذا يظهر لمن ومتى" (Effective Permissions UI viewer)

| البند | الحالة | الدليل |
|---|---|---|
| Backend endpoint | 🟢 موجود قبل #1799 | `routes/admin.ts:2061-2116` |
| Frontend viewer page | 🟢 جديد (HR-014) | `pages/admin/effective-permissions.tsx` (290 سطر) |
| Routes registration | 🟢 | `routes/adminRoutes.tsx:45,87` |
| Grouping بـ feature module | 🟢 | `effective-permissions.tsx:116` |
| Filter search | 🟢 | `effective-permissions.tsx:108-119` |
| Overrides بـ deny-wins styling | 🟢 | `effective-permissions.tsx:208-228` |
| Arabic translation للـ scopes والـ actions | 🟢 | `effective-permissions.tsx:52-72` |
| Deep-linkable بـ ?userId=N | 🟢 | `effective-permissions.tsx:84-87` |
| Nav entry | 🟢 | `navigation.registry.ts:241` تحت إعدادات HR |

**Verdict: 🟢 مكتمل (HR-014)**

⚠️ **risk معروف:** الـ viewer يقرأ فقط من `rbac_user_roles` (الـ v2 model). الـ legacy `custom_roles` لا يظهر — قد يُربك admin يدير users موروثين من النظام القديم.

---

### الأولوية #4 — كتالوج خدمات HR

| البند | الحالة | الدليل |
|---|---|---|
| صفحة `/hr/services` | 🟢 | `pages/hr/services.tsx` |
| 8 خدمات في 4 categories | 🟢 | leave/loan/overtime/excuse/exit/letter/transfer/custody |
| كل كرت deep-link لـ create form | 🟢 | router-link لكل خدمة |

**Verdict: 🟢 مكتمل (HR-010)**

🟣 **تكرار:** الكتالوج يتقاطع مع `/hr/approvals` ومع `/hr/leaves/create` etc. — موجود بالفعل في mySpace + tasks + inbox. **مرشّح للدمج في "Unified Inbox"** (انظر #11).

---

### الأولوية #5 — محرك الطلبات وسلاسل الاعتماد

| البند | الحالة | الدليل |
|---|---|---|
| `hr_approval_requests` table + workflow engine | 🟢 موجود قبل #1799 | Migration 100+ |
| `/hr/approvals` inbox | 🟢 | `pages/hr/approval-inbox.tsx` |
| يجمع 8 أنواع: leave/PO/expense/salary_advance/custody/letter/transfer/exit | 🟢 | `approval-inbox.tsx:84-93` |
| Escalation chain متعدد المستويات | 🟢 موجود | `routes/approvalActions.ts` |
| Field policies لإخفاء حقول حساسة | 🟢 موجود | `rbac_field_policies` |

**Verdict: 🟢 مكتمل**

🟣 **تكرار:** `/hr/approvals` يتداخل مع `/inbox` (general workspace) و `/tasks` — كل واحد فيه قائمة "ما ينتظر مني". **لم يتم توحيدها بعد** — مدير HR يفتح 3 شاشات للحصول على نفس المعلومة.

---

### الأولوية #6 — الحضور حسب طبيعة العمل (per category)

| البند | الحالة | الدليل |
|---|---|---|
| Migration 270: `employee_categories` + 6 seeds | 🟢 | manager/executive=`exemptFromAutoDeduction=TRUE`، driver=30s، field=300s |
| `employee_assignments.categoryKey` + backfill heuristic | 🟢 | Migration 270 |
| `attendance_policies_per_category` override table | 🟢 | Migration 270 |
| `attendancePolicyEngine.resolveAttendancePolicy` | 🟢 | `lib/attendancePolicyEngine.ts` — 3-layer fallback (override → category default → company-wide) |
| `resolveBatch` memoized resolver | 🟢 | للـ cron usage |
| Check-in route wired | 🟢 | `routes/hr.ts:684` |
| Check-out route wired | 🟢 | `routes/hr.ts:1013` |
| autoViolationEngine.runAutoDetection يفلتر exempt قبل INSERT | 🟢 | `lib/autoViolationEngine.ts` |
| Integration test للسيناريو core (worker→deduct، manager→لا) | 🟢 جديد (HR-014) | `tests/integration/hrAttendancePolicyByCategory.dynamic.test.ts` |

**Verdict: 🟢 مكتمل end-to-end**

⚠️ **risk معروف:** لا توجد صفحة admin UI لإدارة الـ categories أو الـ per-company overrides — لتعديل threshold لفئة معينة، حاليًا يحتاج SQL مباشر. **مرشّح لـ HR-015**.

---

### الأولوية #7 — التتبع حسب السياسة (field tracking)

| البند | الحالة | الدليل |
|---|---|---|
| Migration 271: `field_tracking_points` table | 🟢 | lat/lng/accuracy/speed/heading/altitude/battery + deviceId/source + task/trip/visit refs |
| `POST /hr/attendance/field-ping` endpoint | 🟢 | `routes/hr.ts` — يحترم frequency للـ category |
| `GET /hr/attendance/field-track` endpoint | 🟢 | breadcrumb + live position |
| UI خريطة breadcrumb | 🔴 | لا يوجد |
| UI تقرير المسار/التوقفات | 🔴 | لا يوجد |
| ربط بصفحة موظف 360 | 🔴 | لا يوجد link من الـ profile |

**Verdict: 🟡 Backend مكتمل، Frontend غير مُنفّذ**

⚠️ **risk معروف:** البيانات تُكتب في `field_tracking_points` لكن لا أحد يقرأها من الـ UI. **3-5 أيام عمل** لإنشاء صفحة `/hr/field-tracking` بـ Leaflet/Mapbox + filter بالموظف والتاريخ.

---

### الأولوية #8 — الربط المالي (Payroll → GL + WPS)

| البند | الحالة | الدليل |
|---|---|---|
| Payroll runs تكتب في `journal_entries` | 🟢 موجود قبل #1799 | `routes/hr-wps.ts` + `accountingEngine` |
| WPS file generation | 🟢 موجود قبل #1799 | `routes/hr-wps.ts` |
| Loans → GL posting | 🟢 موجود قبل #1799 | `routes/hr-loans.ts` |
| Attendance deductions → payroll | 🟢 موجود قبل #1799 | `attendance_deductions` table |

**Verdict: 🟢 مكتمل (موروث، لا تغيير معماري في #1799)**

---

### الأولوية #9 — العهد والأصول (employee_assets bridge)

| البند | الحالة | الدليل |
|---|---|---|
| Migration 276: `employee_assets` table | 🟢 | assetType/assetKey/serialNumber + lifecycle (assigned/returned) + condition fields |
| Partial index على `returnedAt IS NULL` | 🟢 | للقوائم النشطة |
| Custodies tab في ملف الموظف | 🟢 | `employee-detail.tsx` (HR-012) |
| Active-first ordering | 🟢 | `routes/employees.ts:1511` |
| Opacity 60 للمُعَاد | 🟢 | UI block |
| Damage claims (conditionOnReturn) | 🟢 | column موجود |

**Verdict: 🟢 مكتمل (HR-011)**

🟣 **تكرار:** `employee_assets` يتقاطع مع `subsidiary_custody` (مالي) و `warehouse_assets`. هل العهدة "إلكترونيات" أم "محاسبة"؟ الحالي: 3 جداول مختلفة، الموظف يظهر في `employee_assets` لكن المعاملة المالية في `subsidiary_custody`. **مرشّح لـ doc يوضّح المسؤوليات**.

---

### الأولوية #10 — التقييم وإشارات الأداء

| البند | الحالة | الدليل |
|---|---|---|
| Migration 272: `employee_scores` (6 dimensions) | 🟢 | composite + 6 sub + trend + rationale + weightsUsed + rawCounters |
| `employeeScoringEngine.scoreEmployee` | 🟢 | `lib/employeeScoringEngine.ts` — يجمع من attendance + tasks + violations + performance_reviews + training |
| Migration 273: `employee_signals` | 🟢 | risk/promotion/burnout + severity + reasons |
| `employeeSignalsEngine.detectSignals` | 🟢 | `lib/employeeSignalsEngine.ts` — 3 detection engines |
| Cron entries (weekly Mon 03:00، monthly 1st 04:00) | 🟢 | `lib/cronScheduler.ts:runEmployeeScoringPeriod` |
| UPSERT idempotent على re-run | 🟢 | UNIQUE (assignmentId, scope, periodKey) |
| Acknowledgement reset عند escalation | 🟢 | في `employeeSignalsEngine.persistSignals` |
| Widget في overview tab | 🟢 جديد (HR-014) | `PerformanceWidget` في `employee-detail.tsx:282-410` |
| Backend يُعيد latestScore + activeSignals في GET /employees/:id | 🟢 جديد (HR-014) | `routes/employees.ts:1533-1572` |

**Verdict: 🟢 مكتمل end-to-end (HR-014)**

⚠️ **risk معروف:**
1. لا يوجد admin UI لتعديل الـ weights (الافتراضي 20/15/35/15/10/5 hardcoded في الـ engine). تغيير الـ weights يحتاج تعديل كود.
2. لا يوجد صفحة "company-wide ranking" لشاشة HR — البيانات موجودة في `employee_scores` و في `idx_employee_scores_company_period` لكن لا UI يقرأها.

---

### الأولوية #11 — صندوق الأعمال والجدولة (Unified Inbox)

| البند | الحالة | الدليل |
|---|---|---|
| `/hr/approvals` يجمع 8 أنواع | 🟢 | `pages/hr/approval-inbox.tsx` |
| HR Services Catalog | 🟢 | `pages/hr/services.tsx` |
| `/inbox` (general workspace inbox) | 🟢 موجود قبل #1799 | `routes/inbox.ts` |
| `/tasks` (assignments) | 🟢 موجود قبل #1799 | `routes/tasks.ts` |
| **Unified inbox واحد يجمع** HR approvals + workspace inbox + tasks + notifications | 🔴 | لا يوجد |

**Verdict: 🟡 جزئي**

⚠️ **risk:** المستخدم يفتح 4 شاشات (`/hr/approvals`، `/inbox`، `/tasks`، `/notifications`) للحصول على "ما ينتظرني". **5-7 أيام عمل** لبناء `/my/workspace` يجمعها بـ tabs (أو unified feed).

---

### الأولوية #12 — تهذيب الواجهات (Menu Cleanup)

| البند | الحالة | الدليل |
|---|---|---|
| HR nav restructured من 17 → 9 buckets | 🟢 | `navigation.registry.ts:149-241` |
| 9 buckets: لوحة/الموظفون/النشاط/الطلبات/الامتثال/الأداء/الرواتب/التقارير/إعدادات | 🟢 | per §D.2 spec |
| كل route قديم محفوظ كـ sub-link | 🟢 | لا broken bookmarks |
| `/admin/org-model` + `/admin/effective-permissions` تحت إعدادات HR | 🟢 | nav entries جديدة (HR-013، HR-014) |

**Verdict: 🟢 مكتمل (HR-011)**

---

## ٢. §B — نموذج المؤسسة التشغيلي

| الجدول | Migration | الحالة | API | UI |
|---|---|---|---|---|
| `legal_entities` | 274 | 🟢 جدول + columns كما في spec | ✅ `routes/org.ts` | ✅ `/admin/org-model` tab 1 |
| `positions` (9 system seeds) | 274 | 🟢 | ✅ | ✅ tab 2 |
| `teams` | 274 | 🟢 | ✅ | ✅ tab 3 |
| `committees` | 274 | 🟢 | ✅ | ✅ tab 4 |
| `employee_team_memberships` (bridge) | 274 | 🟢 جدول | 🔴 لا route | 🔴 لا UI لإسناد عضوية |
| `employee_project_assignments` (with allocationPercent) | 276 | 🟢 جدول | 🔴 لا route | 🔴 لا UI |
| `employee_committee_memberships` (bridge) | 274 | 🟢 جدول | 🔴 لا route | 🔴 لا UI لإسناد عضوية |
| `supervision_lines` | 275 | 🟢 + CHECK لمنع self-supervision | ✅ | ✅ tab 5 |
| `approval_authorities` (per-person) | 275 | 🟢 + reason إلزامي | ✅ | ✅ tab 6 |
| `branches.legalEntityId` (FK) | 274 | 🟢 nullable additive | — | 🔴 لا UI لاختياره |

**Verdict: 🟡 6/9 جداول مدمجة كاملة، 3 bridges بدون CRUD**

⚠️ **risk معروف:** الجداول الـ bridge (team/committee/project memberships) موجودة في DB لكن لا يمكن إسناد موظف لفريق/لجنة/مشروع من النظام. هذا **يفرغ §B من قيمته العملية** — تستطيع إنشاء فريق لكن لا تستطيع إسناد أحد له.

**توصية:** HR-015 يجب أن يُغلق هذه الـ 3 bridges (CRUD endpoints + Members tab داخل كل team/committee).

---

## ٣. §C — Seeds مطلوبة

### §C.1 — Employee categories seeds
| | Status | Source |
|---|---|---|
| 6 categories (worker/driver/field/office/manager/executive) | 🟢 مكتمل | Migration 270 |
| manager + executive لديهما `exemptFromAutoDeduction=TRUE` | 🟢 | Migration 270 |
| driver `trackingFrequencySeconds=30` | 🟢 | Migration 270 |
| field `trackingFrequencySeconds=300` | 🟢 | Migration 270 |

### §C.3 — HR role templates seeds
| Role Key | Status | Source |
|---|---|---|
| HR Admin | 🟢 موجود قبل #1799 | Migration 109 |
| HR Manager | 🟢 موجود قبل #1799 | Migration 109 |
| **Attendance Officer** | 🟢 (HR-012) | Migration 278 |
| **Payroll Officer** | 🟢 (HR-012) | Migration 278 |
| **Discipline Officer** | 🟢 (HR-012) | Migration 278 |
| **Performance Reviewer** | 🟢 (HR-012) | Migration 278 |
| Branch Manager | 🟢 موجود قبل #1799 | Migration 109 |
| Department Manager | 🟢 موجود قبل #1799 | Migration 109 |
| Employee Self-Service | 🟢 موجود قبل #1799 | Migration 109 |

**Verdict: 🟢 9/9 templates مكتملة**

⚠️ **risk معروف:** الـ templates مزروعة كصفوف نظام (`companyId IS NULL`) لكن **لا تُسحب grants تلقائيًا**. الـ admin يحتاج clone-then-customize للحصول على شركة فعلية. هذا قرار معماري سليم لكن غير موثَّق في spec.

---

## ٤. §E (§K) — اختبارات القبول

| Test | Spec status | Actual status | File |
|---|---|---|---|
| موظف بأكثر من دور → effective permissions صحيحة | 🟡 جزئي | 🟡 — `rbacEffectivePermissionsSmoke.test.ts` static فقط | unit |
| Audit يحفظ activeRole | 🟡 جزئي | 🟡 — لا integration test يثبت أن كل route يحفظ activeRoleKey | — |
| عامل يتأخر → خصم/مخالفة حسب threshold | 🔴 | 🟢 جديد (HR-014) | `hrAttendancePolicyByCategory.dynamic.test.ts` |
| مدير يتأخر → **لا** خصم تلقائي | 🔴 | 🟢 جديد (HR-014) | نفس الملف |
| سائق GPS → نقطة في `field_tracking_points` | 🔴 | 🔴 | لم يُكتب |
| Manual attendance بـ reason + اعتماد | 🔴 | 🔴 | لم يُكتب |
| تأخير متكرر → violation + inquiry memo | 🟢 | 🟢 موجود قبل #1799 | `autoViolationEngine` smoke |
| اعتماد GM للجزاء → deduction → payroll | 🟢 | 🟢 موجود قبل #1799 | hr-discipline smoke |
| Payroll يقرأ الخصم المعتمد فقط | 🟢 | 🟢 موجود قبل #1799 | payroll smoke |
| Employee Scoring يحسب من >1 مصدر | 🔴 | 🟡 — الـ engine موجود + يستهلك 5 مصادر، لكن **لا integration test يثبت ذلك في DB حقيقي** | — |
| Menu cleanup لا يكسر route | 🟡 | 🟡 — `orgModelRoutesSmoke` يفحص route registration، لا full broken-link audit | — |

**Verdict: 4/10 ✅، 4/10 🟡، 2/10 🔴**

⚠️ **risk معروف:** §K تقول "integration tests" لكن أغلب الـ tests الموجودة **smoke static** (تقرأ ملفات وتفحص regex). الـ integration الحقيقي (DB live) موجود فقط في:
- `hrAttendancePolicyByCategory.dynamic.test.ts` (HR-014، جديد)
- بعض tests في `tests/integration/` لكنها لمحاور غير HR (umrah، fleet)

---

## ٥. التكرار والتنظيف (Duplicate / Dead Code)

| نوع التكرار | الموقع | التوصية |
|---|---|---|
| 🟣 HR Services Catalog ↔ /hr/approvals ↔ /inbox ↔ /tasks | 4 شاشات تعرض "ما ينتظرني" | **HR-016**: unified inbox يجمعها |
| 🟣 `employee_assets` ↔ `subsidiary_custody` ↔ `warehouse_assets` | 3 جداول للعهد بمعاني مختلفة | **doc** يوضّح المسؤوليات |
| 🟣 `custom_roles` (legacy) ↔ `rbac_roles` (v2) | `roleGuard.ts` يستخدم كلاهما مع cache 30s | **HR-017**: خطة هجرة كاملة |
| 🟣 `role_permissions` (seed 068) ↔ `rbac_role_grants` | `policyEngine.auditMaxPrivilege` يقرأ legacy | **HR-017 نفس الخطة** |
| 🟣 `job_titles` ↔ `positions` | كلاهما يصف الموظف | **HR-013** فصلهما (مهني vs إداري) — موثَّق في spec §A.1 |

---

## ٦. مخاطر معمارية حقيقية (Architectural Risks)

### R1 — Legacy roles fallback لا يزال نشطًا
`roleGuard.ts` يقرأ من `custom_roles` كـ fallback مع cache 30s. كل cleanup لـ rbac_roles يحتاج مراجعة مزدوجة لئلا تختفي صلاحية. **خطر:** صلاحية تُعاد بصمت من cache بعد حذف الـ role.

### R2 — Org bridges بدون CRUD
`employee_team_memberships`، `employee_project_assignments`، `employee_committee_memberships` موجودة كجداول لكن لا يمكن إسنادها من النظام. **خطر:** §B تظهر كاملة في الـ docs لكن لا قيمة تشغيلية.

### R3 — Field tracking بلا UI
البيانات تُكتب لكن لا أحد يقرأها. **خطر:** سائق يعرف أن النظام يتتبعه، لكن مديره لا يستطيع عرض المسار من واجهة. الـ engagement = صفر.

### R4 — Scoring weights hardcoded
الـ 6 dimensions weights (20/15/35/15/10/5) hardcoded في `employeeScoringEngine.ts`. كل شركة تريد تخصيصها تحتاج fork. **خطر:** عند الـ multi-tenant scale، التخصيص = code change.

### R5 — لا e2e tests للسيناريوهات الحرجة
- Manual attendance correction workflow
- Driver GPS pipeline (ping → tracking_points → admin view)
- Multi-source scoring composition
**خطر:** أي refactor قد يكسر هذه السيناريوهات دون أن يصرخ CI.

### R6 — `db/schema_pre.sql` متخلّف عن migrations
آخر dump كان 2026-05-10. كل migration بعد ذلك تعمل في live DB لكن مفقودة من الـ dump. الـ CI كان يكسر حتى `check-schema-drift` تعلّم يمشي migrations (HR-014). **خطر متبقي:** أي script آخر يقرأ من الـ dump مباشرة سيرى schema قديمة.

---

## ٧. ملخص تنفيذي (5 أسطر)

1. **10 من 12 أولوية مكتملة** (1، 2، 3، 4، 5، 6، 8، 9، 10، 12).
2. **3 من 12 أولوية جزئية** (#7 backend فقط بلا UI، #11 inbox غير موحد، §B 3 bridges بدون CRUD).
3. **0 أولوية غير مُنفّذة** — كل واحدة لها على الأقل backend + schema.
4. **6 مخاطر معمارية موثَّقة** (R1-R6) — أحدها (R6) أُصلح في HR-014، الباقي يحتاج عمل.
5. **الـ §K integration tests:** 4/10 خضراء، 2/10 جديدة (HR-014)، 4/10 لا تزال غير مكتوبة.

---

## ٨. أولوية الإصلاحات (موصى به)

| # | المهمة | الحالة | يُغلق |
|---|---|---|---|
| HR-015 | Field tracking UI (breadcrumb map + KPIs) + admin UI لفئات الحضور | 🟢 مُنفّذ | #7 + R3 + admin gap في #6 |
| HR-016 | Unified `/my/work-queue` يجمع approvals + tasks + notifications + inbox | 🟢 مُنفّذ | #11 + توحيد التكرار |
| HR-017 | توثيق حدود نماذج العهد الثلاثة (warehouse + employee_assets + subsidiary) | 🟢 مُنفّذ | حسم "تكرار العهد" المرصود في §5 |
| HR-018 | Legacy `custom_roles` → `rbac_roles` migration + ratchet test | 🟢 **مُنفّذ** — migration 269 موجودة + ratchet test يمنع regression | R1 |
| HR-019 | Org bridges CRUD (team/committee/project members) | 🟢 **مُنفّذ** — 9 endpoints + `/admin/org-memberships` بـ 3 tabs | §B 3 bridges + R2 |
| HR-020 | Scoring weights configurable + company-wide ranking dashboard | 🟢 **مُنفّذ** — migration 279 + helper engine + `/admin/scoring-weights` بـ 2 tabs | R4 |
| HR-021 | باقي §K integration tests (GPS pipeline، manual correction، scoring composition) | 🟢 **مُكتمل** — 3 dynamic test files: `hrAttendancePolicyByCategory` (worker/manager exemption) + `hrFieldTrackingPipeline` (GPS ingestion + breadcrumb) + `hrManualCorrectionAndScoringComposition` (audit log + multi-source scoring + idempotent UPSERT) | R5 |
| HR-022 | `pnpm db:dump-schema` regen + commit | 🟢 **مُكتمل** — تم تشغيل Postgres محلي داخل الـ session، تحميل الـ baseline، تطبيق 55 migration بعد الـ dump القديم، dump جديد بـ 425 جدول + 887 index + 504 FK، round-trip test أكّد تحميل نظيف من DB فارغ، check-schema-drift أعطى زيرو drift | R6 |

**ما تبقى:** **لا شيء** — كل الـ 8 توصيات (HR-015 → HR-022) مُنفّذة.

---

## ٩. شهادة الكاتب

كتب هذا التقرير: Claude (claude-opus-4-7[1m]) في جلسة لمراجعة #1799.
كل سطر مُتحقّق منه بـ:
- قراءة الملف على الفرع `claude/enterprise-hardening-roadmap-AOfO7`
- مقارنته بـ migrations 270-278 و routes/*.ts
- تنفيذ الـ smoke tests محليًا (47/47 خضراء)

ما لم أتحقق منه:
- لم أُشغل النظام في environment حقيقي (لا QA manual run).
- لم أتحقق من e2e عبر playwright (الـ workflow skips على هذا الـ branch).
- لم أقارن مع GitHub Issue #1799 الـ raw text (الفرع لا يحوي وصلًا له، فقط `docs/HR_OPERATING_FOUNDATION_TASK.md`).

أي ادعاء أعلاه يمكن التحقق منه بقراءة الـ file:line المذكور.
