# HR Operating Foundation — جرد وخارطة تنفيذ (Task #1799)

> **مرحلة 0 — الجرد قبل التنفيذ.** هذه الوثيقة هي المخرج الأول للمهمة #1799.
> لا يجوز إنشاء أي مكوّن جديد قبل إثبات أن الموجود لا يمكن توسيعه أو مواءمته.
> كل بند مصنّف وفق:
>
> - 🟢 **موجود ومكتمل** — يعمل ويُستخدم في المسار التشغيلي
> - 🟡 **موجود ويحتاج تطوير** — يعمل جزئيًا، تنقصه ميزة أو سياسة
> - 🟠 **موجود ويحتاج ربط** — يعمل بمعزل، يحتاج تكاملًا مع مسار آخر
> - 🟣 **موجود ويحتاج دمج** — مكرر أو متشظٍ، يحتاج توحيدًا
> - 🔴 **غير موجود** — يلزم بناؤه بعد إثبات استحالة التوسعة

---

## 0) ملخص تنفيذي (One-pager)

النظام يحتوي **95 endpoint** و**51 صفحة HR** و**5 محركات** و**~15 جدول** غطّت
معظم القدرات (CRUD، حضور أساسي، إجازات، رواتب، قروض، WPS، خدمة نهاية، انضباط).
الفجوة الجوهرية ليست في *البناء* بل في:

1. **التمايز بين فئات الموظفين** — سياسة حضور واحدة على مستوى الشركة (`UNIQUE(companyId)` في `attendance_policies`) تطبق على المدير والسائق والعامل بنفس المعاملة.
2. **النموذج التنظيمي** — لا يوجد `teams` ولا `committees` ولا `positions` (مفصول عن `job_titles`)، ولا جدول bridge لربط الموظف بالمشاريع أو اللجان.
3. **ملف الموظف 360** — 9 تبويبات موجودة من أصل 14 مطلوبة؛ الباقي موجود لكن في صفحات مستقلة (`/hr/contracts`، `/hr/evaluation-360`، إلخ).
4. **التتبع الميداني** — صفحة UI تعرض نقاط الـ check-in فقط؛ لا يوجد `field_tracking_points` ولا persistent location pings.
5. **مصدر الحضور** — جدول `attendance` لا يحتوي عمود `source/capture_method`، فلا يمكن التمييز بين QR/GPS/manual/selfie في التقارير ولا تطبيق `manual_correction` كتصنيف مستقل.
6. **الـ activeRole في Audit** — البنية موجودة (header `x-selected-role`، param `activeRoleKey`)، لكن ليست كل الـ routes تمرّر القيمة.
7. **توحيد ملف الـ user مع ملف الـ employee** — `users.employeeId` موجود لكن لا يوجد UI واحد يجمع "حساب الدخول + الموظف + الأدوار" بلا تشتت.

**القرار المعماري:** التنفيذ سيكون **مواءمة وتوسعة**، لا إعادة بناء.
كل أولوية من الـ12 تبدأ بإثبات أن الموجود لا يكفي، ثم تضيف فقط ما ينقص.

---

## A) جرد بحسب المحاور التشغيلية الـ12

### A.1 — الموظفون (Employees)

| البند | الحالة | المكان |
|---|---|---|
| جدول `employees` (الكيان الأساسي) | 🟢 مكتمل | `db/schema_pre.sql` |
| جدول `employee_assignments` (multi-row per company) | 🟢 مكتمل | جدول جسر شامل (companyId/branchId/departmentId/jobTitle/managerId/salary/isPrimary) |
| Onboarding 12 خطوة (employee + assignment + leave_balance + shift + contract + onboarding_tasks + user + custody + driver + pbx + salary_components + obligations) | 🟢 مكتمل | `routes/employees.ts:POST /employees` — atomic transaction |
| `POST /employees` (إنشاء كامل) | 🟢 مكتمل | يدعم تحويل من application (sourceApplicationId) |
| `GET /employees/:id/finance-summary` | 🟢 مكتمل | subsidiary custody + loans + vehicles |
| Documents expiry obligations (iqama/passport/visa/work permit) | 🟢 مكتمل | `businessHelpers.registerObligation()` |
| ملف الموظف 360 — 14 تبويبات | 🟢 مكتمل (HR-012) | overview / info / titles / account / roles / contract / attendance / leaves / custodies / payroll / violations / tasks / trainings / finance |
| Employee → User dual model | 🟢 مكتمل | `users.employeeId` FK + multi-role |
| Performance / 360 / IDP TABS داخل الملف | 🟠 يحتاج ربط | موجود في `/hr/performance` و `/hr/evaluation-360` و `/hr/idp` كصفحات مستقلة |

**القرار:** توسعة `employee-detail.tsx` لاستضافة الـ14 تبويبًا (5 ناقصة: account+login، titles+positions، roles+permissions، contract embed، custodies embed). الـ routes الفرعية تبقى كروابط مباشرة لكن المحتوى يُحقن داخل التبويب.

---

### A.2 — الصلاحيات والأدوار (RBAC)

| البند | الحالة | المكان |
|---|---|---|
| `rbac_roles` (v2, layered) | 🟢 مكتمل | Migration 109، 5 templates |
| `rbac_role_grants` (feature/action/scope/conditions) | 🟢 مكتمل | seed 110 (~40 grants/template) |
| `rbac_field_policies` (visible/masked/hidden/readonly) | 🟢 مكتمل | HR Clerk template: 8 hidden fields |
| `rbac_approval_limits` (max_amount + dual_control) | 🟢 مكتمل | Dept Manager template |
| `rbac_user_roles` (multi-role per user) | 🟢 مكتمل | UNIQUE(userId, companyId, role_id) + expires_at + is_primary |
| `authzEngine.ts` + `authorize()` middleware | 🟢 مكتمل | يحترم scope + conditions + approval_limits + field policies |
| Frontend role selector (`selectedRole` + `x-selected-role` header) | 🟢 مكتمل | `app-context.tsx` localStorage-backed |
| **`activeRole` logging في كل الـ audit rows** | 🟡 يحتاج تطوير | البنية موجودة (`businessHelpers.ts:413`، `auditMiddleware.ts`)، لكن ليست كل الـ routes تمرّر activeRoleKey |
| **Effective permissions viewer UI** | 🔴 stub-only | API موجود (`GET /admin/users/:id/effective-permissions`) — لا UI |
| **Role composer UI (Arabic 5-tier)** | 🟡 يحتاج تطوير | `permissionLevels.ts` يحوّل 14 action + 9 scope إلى 5 طبقات — لكن UI ناقصة |
| **SoD conflict analyzer UI** | 🔴 stub-only | `GET /sod` API + `rbac_sod_rules` table — لا UI |
| Legacy `custom_roles` + `user_roles` (دور flat) | 🟣 يحتاج دمج | لا يزال يقرأ منه `roleGuard.ts` كـ fallback (cache 30s). يلزم migration plan |
| Legacy `role_permissions` (seed 068) | 🟣 يحتاج دمج | لا يزال يُقرأ في `policyEngine.auditMaxPrivilege` |
| Validate `selectedRole ∈ user's assigned roles` على الـ backend | 🟡 يحتاج تطوير | لا يوجد enforcement أن الـ header لا يحوي دورًا غير ممنوح |

**القرار:** لا rebuild لـ RBAC. الإضافات:
- تمرير `activeRoleKey` في كل الـ state-changing routes (audit).
- بناء UI `Effective Permissions` + `Role Composer` + `SoD Resolver`.
- خطة هجرة تدريجية من `custom_roles` → `rbac_roles` بدون كسر.

---

### A.3 — الحضور والانصراف (Attendance + Activity)

| البند | الحالة | المكان |
|---|---|---|
| جدول `attendance` (checkIn/checkOut/GPS/lateMinutes/status) | 🟢 مكتمل | Migrations 009, 073, 083 |
| `POST /hr/check-in` + `POST /hr/check-out` (rate-limited 10/min) | 🟢 مكتمل | `routes/hr.ts:527-1294` |
| `attendance_policies` (UNIQUE per company) | 🟡 يحتاج تطوير | **سياسة واحدة لكل الشركة** — لا تمييز per category/role |
| Penalty escalation (1→10 lates → 5 levels) | 🟡 يحتاج تطوير | hardcoded داخل route، لم يُستخرج إلى Engine قابل للاختبار/التعديل |
| **Source/Capture method enum** على `attendance` | 🔴 غير موجود | لا يمكن التمييز بين GPS / QR / manual / selfie / device في التقارير |
| Manual correction (سبب + اعتماد + Audit) كمصدر مستقل | 🟡 يحتاج تطوير | الـ PATCH موجود، لكن لا يُكتب `source='manual_correction'` ولا يتطلب reason مرفقًا و workflow |
| **Selfie Attendance** | 🔴 غير موجود | لا حقول `selfie_url` ولا adapter |
| **Face Recognition (Face ID)** | 🔴 غير موجود | UI تذكره لكن لا adapter ولا حقل `not_configured` |
| **QR Scanner** | 🟡 stub-only | صفحة `/hr/attendance/qr-scanner` موجودة لكن لا API يولّد/يقرأ QR tokens صلاحيتها 30s |
| **Field tracking** persistent table | 🔴 غير موجود | لا `field_tracking_points` ولا `location_pings`. صفحة UI تعرض check-in lat/lon فقط |
| Field tracking سياسة per role (driver: 10-30s، field: 1-5min، office: لا تتبع) | 🔴 غير موجود | لا engine لتحديد frequency |
| `attendance_deductions` (per attendance) | 🟢 مكتمل | لكن source_type / source_id ينقصها structure أوسع |
| `hr_overtime_requests` (Saudi Article 98، multiplier 1.5x) | 🟢 مكتمل | `routes/hr-overtime.ts` + payroll linkage |
| `hr_excuse_requests` (early_leave/late_arrival/personal) | 🟢 مكتمل | Migration 082 + integrated مع check-out deduction |
| Auto-violation engine (نقطة نومية لـ late/absence/GPS) | 🟢 مكتمل | `autoViolationEngine.runAutoDetection()` |
| `shifts` table — في migration | 🟣 يحتاج دمج | الجدول معرّف inline في route، **ليس في migrations** — قد ينكسر على fresh DBs |
| `employee_shift_assignments` | 🟡 يحتاج تطوير | بدون schema doc واضح |
| Calendar/timeline view للورديات | 🔴 غير موجود | shifts تعرض كقائمة فقط، لا visual scheduling |

**القرار:** هذا أكبر مجال للعمل التنفيذي. التغييرات الإلزامية:

1. **Migration جديد:** إضافة `attendance.source` enum (`qr`, `gps`, `manual`, `selfie`, `device`, `manual_correction`).
2. **Migration جديد:** إضافة `attendance.source_metadata jsonb` (يحتوي QR token، selfie URL، deviceId، manual reason، manual approval reference).
3. **Migration جديد:** إنشاء `field_tracking_points` (lat/lng/accuracy/speed/heading/battery/deviceId/timestamp/employeeId/assignmentRef).
4. **Migration جديد:** إنشاء `attendance_policies_per_category` (employee_category + late_threshold + grace_period + auto_deduction_enabled + max_overtime_hours).
5. **استخراج Engine جديد:** `attendancePolicyEngine.ts` يحلّ السياسة per (employee_category × role × branch) ويعيد penalty أو exemption.
6. **Migration جديد:** إضافة `shifts` table إلى migrations رسميًا (نسخ من inline definition + idempotent CREATE IF NOT EXISTS).
7. **Adapter Interfaces (لا تنفيذ كامل):** `faceRecognitionAdapter.ts` يعيد `{ status: 'not_configured', message }`، `qrTokenIssuer.ts` يولّد token صلاحيته 30s.

---

### A.4 — التتبع الميداني (Field Tracking)

(مغطى ضمن A.3 — كلّه 🔴 غير موجود ما عدا عرض الـ markers لنقاط الـ check-in.)

---

### A.5 — الرواتب (Payroll + WPS)

| البند | الحالة | المكان |
|---|---|---|
| `payroll_runs` (period, status, totalNet) | 🟢 مكتمل | |
| `payroll_lines` (per-employee breakdown) | 🟢 مكتمل | salary/allowances/deductions/net/gosi/wht |
| Auto-calc gross+net + OT + loan + violation deductions | 🟢 مكتمل | `routes/hr.ts` |
| GL posting (atomic txn، per-employee dimensional) | 🟢 مكتمل | `hrEngine.postPayrollRunGL()` |
| `salary_components` (active/inactive) | 🟢 مكتمل | |
| `employee_salary_components` (per-employee overrides) | 🟢 مكتمل | |
| WPS file generation (NCB/Alrajhi/Riyad/Alinma adapters) | 🟢 مكتمل | `saudi-compliance/wps` |
| WPS preflight (IBAN/iqama/positive net) | 🟢 مكتمل | |
| WPS bank ack file processing (PAID/HELD/FAILED) | 🟢 مكتمل | `POST /hr/wps/runs/:id/ack` |
| Period lock guard | 🟢 مكتمل | `businessHelpers.checkFinancialPeriodOpen()` |
| **Cost allocation للموظف على المشاريع** | 🔴 غير موجود | لا bridge `employee_cost_assignments` |

**القرار:** المسار شبه مكتمل. الإضافة الوحيدة: bridge `employee_project_assignments` لتقسيم تكلفة الموظف على مشاريع/لجان.

---

### A.6 — الإجازات (Leaves)

| البند | الحالة | المكان |
|---|---|---|
| `hr_leave_types` (annual, sick, unpaid, ...) | 🟢 مكتمل | per-company |
| `hr_leave_balances` (per employee × type × year) | 🟢 مكتمل | entitled/used/reserved/carried |
| `hr_leave_requests` + multi-stage approval chain | 🟢 مكتمل | `routes/hr.ts:1294-2632` |
| Monthly leave accrual GL (`postLeaveAccrualGL`) | 🟢 مكتمل | |
| `excuse_requests` (early_leave/late_arrival/personal) | 🟢 مكتمل | Migration 082 |
| Public holidays calendar | 🟢 مكتمل | `/hr/public-holidays` |

**القرار:** مكتمل. لا تغيير معماري مطلوب.

---

### A.7 — العهد والأصول (Custodies + Assets)

| البند | الحالة | المكان |
|---|---|---|
| `subsidiary_accounts` (per-employee custody account) | 🟢 مكتمل | auto-created on hire if jobTitle.opensCustody |
| Custody account ledger (advances + settlements) | 🟢 مكتمل | تبويب Finance في employee-detail |
| Vehicles assignment (fleet_drivers link) | 🟢 مكتمل | auto-binding on driver role |
| PBX extensions assignment | 🟢 مكتمل | auto-binding for SIP-eligible roles |
| **Generic asset/custody catalog** (laptop, phone, uniform, ...) | 🟠 يحتاج ربط | جدول `assets` موجود في warehouse، لكن غير مربوط بـ employee_assignment بشكل first-class |
| **Asset return on exit** | 🟠 يحتاج ربط | `hr_exit_clearance` تحتوي IT/Admin clearance لكن لا يفرض إرجاع الأصل المسجل |

**القرار:** إضافة bridge `employee_assets` (assetId, assignmentId, assignedAt, returnedAt, condition) لربط الأصول العامة بدورة حياة الموظف.

---

### A.8 — مساحة العمل (Workspace)

| البند | الحالة | المكان |
|---|---|---|
| `branches` (مكاتب فعلية lat/lon) | 🟢 مكتمل | |
| `office_locations` / desk assignment | 🔴 غير موجود | |
| Workspace booking (شغل غرفة اجتماع، إلخ) | 🔴 غير موجود | |
| Remote shift flag (`workType='remote'`) | 🟢 مكتمل | يتجاوز GPS check |

**القرار:** الـ branches يكفي للغرض الحالي. لا حاجة لـ workspace booking في النطاق #1799.

---

### A.9 — التقييم (Performance + Evaluation)

| البند | الحالة | المكان |
|---|---|---|
| `hr_performance_evaluations` + `hr_performance_ratings` | 🟢 مكتمل | CRUD + 360 multi-rater support |
| Evaluation 360 UI (peer/upward/self/history) | 🟡 يحتاج تطوير | الصفحات الفرعية stub أو needs-development |
| Training programs + enrollments | 🟢 مكتمل | `routes/training.ts` |
| IDP (Individual Development Plan) | 🟡 يحتاج تطوير | UI موجود لكن لا يرتبط بـ evaluation outcomes |
| **Employee Scoring Engine** (Discipline/Activity/Productivity/Quality/Manager/Development) | 🔴 غير موجود | المهمة #1799 تحدّد 6 مصادر و weights قابلة للتعديل |
| **Risk / Promotion / Burnout Engines** | 🔴 غير موجود | المهمة تتطلب 3 محرّكات منفصلة |

**القرار:** بناء `employeeScoringEngine.ts` كـ aggregator يستهلك من المصادر الموجودة:
- Discipline: من `employee_violations` + `attendance` (موجود).
- Activity: من `audit_logs` (موجود) + `tasks.assignedTo`.
- Productivity: من `tasks.status='done'` + per-module counters (invoices, JEs, cases, ...).
- Quality: من `audit_logs` لرفض اعتمادات + reopened transitions.
- Manager: من `hr_performance_evaluations` (موجود).
- Development: من `training_enrollments.status='completed'` (موجود).

**لا داعي لجداول جديدة** — كل المصادر موجودة. الإضافة الوحيدة: `employee_scoring_periods` (per period × employee × dimension × score + rationale).

---

### A.10 — الهيكل التنظيمي (Organizational Structure)

| البند | الحالة | المكان |
|---|---|---|
| `companies` (multi-tenant) | 🟢 مكتمل | |
| `branches` (per company، lat/lon، letterhead) | 🟢 مكتمل | |
| `departments` (parent/child، managerId) | 🟢 مكتمل | recursive CTE للـ department_tree scope |
| `job_titles` (catalog + defaultRoleKey + opensCustody) | 🟢 مكتمل | |
| `cost_centers` (per company، parentId، relatedEntityType+Id) | 🟢 مكتمل | |
| `projects` (large table، per company) | 🟢 مكتمل | |
| `employee_assignments` (employee ↔ org context) | 🟢 مكتمل | single-row per (employee, company) |
| `employee_assignments.managerId` (reporting line) | 🟢 مكتمل | |
| **`positions`** (متمايز عن job_titles — مدير قسم، نائب، مشرف) | 🔴 غير موجود | يُستخدم `job_titles` كـ proxy، نخلط بين المهنة (محامي) والمنصب (مدير قسم) |
| **`teams`** (داخل قسم) | 🔴 غير موجود | |
| **`committees`** (لجان، عابرة للأقسام) | 🔴 غير موجود | |
| **Employee → Project bridge** | 🔴 غير موجود | |
| **Employee → Committee bridge** | 🔴 غير موجود | |
| **Employee → Team bridge** | 🔴 غير موجود | |
| **Approval lines (متمايز عن reporting lines)** | 🟡 يحتاج تطوير | `approval_chains.requiredRole` لا يربط بـ supervisor الفعلي |
| **Visibility rules per-team/per-project** | 🟠 يحتاج ربط | RBAC scope يفرض company/branch/department، لكن لا scope=team أو scope=project |
| **Cost attribution لكل ساعة موظف على مشاريع متعددة** | 🔴 غير موجود | لا time tracking ولا allocation engine |

**القرار:** هذا أهم قسم. سنبني (انظر القسم B أدناه: "نموذج المؤسسة التشغيلي").

---

## B) نموذج المؤسسة التشغيلي (Operational Enterprise Model) — جديد

> هذا القسم لم يكن موجودًا في #1799 الأصلي. أُضيف هنا كما طلب صاحب المهمة.

### B.1 — المسوّغ

النظام اليوم يعرف الموظف من خلال **بُعدين فقط**:
1. مع أي **شركة** (companyId).
2. تحت أي **قسم** (departmentId).

هذا لا يكفي لـ:
- موظف يخدم **مشروعًا** عابرًا لقسمين.
- موظف عضو في **لجنة** اعتماد عابرة.
- مدير يشرف على **فريق** داخل قسم لكن ليس على كل القسم.
- محاسب يخدم **فرعين** في **نفس الوقت** (multi-assignment).

### B.2 — الكيانات المطلوبة

| الكيان | الحالة الحالية | الإضافة المقترحة |
|---|---|---|
| `companies` | 🟢 موجود | — |
| `legal_entities` (كيان قانوني) | 🔴 غير موجود | إضافة جدول جديد: كل company تحوي legal_entity واحد أو أكثر (يفيد للتقارير الزكوية والـ ZATCA متعددة الـ TINs) |
| `branches` | 🟢 موجود | إضافة `legal_entity_id` FK |
| `departments` | 🟢 موجود | — |
| `teams` | 🔴 غير موجود | جدول جديد: `id, companyId, departmentId, leaderId, name, scope_type, isActive` |
| `committees` | 🔴 غير موجود | جدول جديد: `id, companyId, name, chairId, type (audit/discipline/safety/...), startDate, endDate, isActive` |
| `projects` | 🟢 موجود | — |
| `cost_centers` | 🟢 موجود | — |
| `positions` | 🔴 غير موجود | منفصل عن `job_titles`: مدير، نائب، مشرف، عضو فريق |
| `job_titles` | 🟢 موجود | يبقى كـ "المسمى المهني" (محامي، محاسب، ...) |

### B.3 — جداول الجسر المطلوبة

| Bridge | الحالة | القرار |
|---|---|---|
| `employee_assignments` (شركة + فرع + قسم + منصب) | 🟢 موجود | إضافة `position_id` FK + `legal_entity_id` |
| `employee_team_memberships` | 🔴 غير موجود | جديد: (assignmentId, teamId, role, startDate, endDate) |
| `employee_project_assignments` | 🔴 غير موجود | جديد: (assignmentId, projectId, role, allocationPercent, startDate, endDate, costAllocationCenterId) |
| `employee_committee_memberships` | 🔴 غير موجود | جديد: (assignmentId, committeeId, role, isVoting) |
| `supervision_lines` | 🔴 غير موجود | جديد: من يشرف على من خارج الـ org-chart الافتراضي (مثال: مدير مشروع يشرف على موظفين من أقسام مختلفة دون أن يكون مديرهم الإداري) |
| `approval_lines` | 🟡 يحتاج تطوير | `approval_chains` يحدّد role، لكن نحتاج جدول `approval_authorities` يربط (feature, max_amount) ↔ (position أو employee) |

### B.4 — الأسئلة الستة التي يجب أن يجيب عنها النموذج

| السؤال | الإجابة الحالية | الإجابة بعد الإضافة |
|---|---|---|
| من يتبع من؟ | `employee_assignments.managerId` + `departments.managerId` (مستوى واحد فقط) | إضافة `supervision_lines` لدعم خطوط إشراف متعدّدة (إداري + مشروع + لجنة) |
| من يعتمد من؟ | `approval_chains.requiredRole` (دور عام) | إضافة `approval_authorities` لربط الصلاحية المالية بشخص معيّن، لا فقط بدور |
| من يرى من؟ | RBAC scope = self/team/department/branch/company/all (لكن `team` لا يطبَّق فعليًا) | تفعيل scope=team بعد إنشاء `employee_team_memberships` + scope=project |
| من يتحمّل التكلفة؟ | `journal_entries.costCenter` + `departmentId` (يدوي على القيد) | bridge `employee_project_assignments.allocationPercent` يولّد توزيع تلقائي للراتب على مشاريع |
| كيف يرتبط الموظف بالمشاريع/اللجان/الفرق؟ | لا يوجد | الـ3 جداول bridge أعلاه |
| كيف نمنع تعارض الأدوار (SoD)؟ | `rbac_sod_rules` موجود (5 قواعد) | إضافة قواعد SoD بين عضوية اللجان (مثال: عضو لجنة المشتريات لا يكون مدير المشتريات) |

### B.5 — Migration plan للنموذج

سيتم تنفيذ النموذج التنظيمي على دفعات صغيرة، PR منفصل لكل دفعة:

| دفعة | الجداول/التغييرات | حجم تقريبي |
|---|---|---|
| 1 | `legal_entities` + إضافة `branches.legal_entity_id` (nullable + backfill) | صغيرة |
| 2 | `positions` + إضافة `employee_assignments.position_id` (nullable + backfill من job_title) | متوسطة |
| 3 | `teams` + `employee_team_memberships` + RBAC scope='team' enforcement | كبيرة |
| 4 | `committees` + `employee_committee_memberships` + SoD rules للجان | متوسطة |
| 5 | `employee_project_assignments` + allocation engine + payroll cost split | كبيرة |
| 6 | `supervision_lines` + `approval_authorities` + UI تجميع | كبيرة |

---

## C) الحضور حسب فئة الموظف — حالة الفجوة وخارطة الإصلاح

### C.1 — الفئات الافتراضية (Seeds مطلوبة)

| Category | الحالة | السياسة الحالية | السياسة المطلوبة |
|---|---|---|---|
| `worker` (عامل) | 🔴 الفئة غير معرّفة | نفس policy الشركة | حضور إلزامي + خصم تأخير + خصم غياب + انصراف مبكر يؤثر ماليًا |
| `driver` (سائق) | 🔴 الفئة غير معرّفة | نفس policy الشركة + tracking غير مفعّل | حضور إلزامي + تتبع GPS كل 10-30 ثانية + ربط بالرحلات |
| `field_employee` (موظف ميداني) | 🔴 الفئة غير معرّفة | نفس policy الشركة + لا tracking | حضور بالموقع + تتبع كل 1-5 دقائق |
| `office_employee` (إداري) | 🔴 الفئة غير معرّفة | نفس policy الشركة | حضور إلزامي بسياسة سماح مستقلة + لا تتبع لحظي |
| `manager` (مدير قسم) | 🔴 الفئة غير معرّفة | يُعامَل كعامل تمامًا — هذا خطأ | حضور مرن + لا خصم تلقائي + يظهر في تقارير المتابعة لا الجزاء |
| `executive` (تنفيذي) | 🔴 الفئة غير معرّفة | يُعامَل كعامل تمامًا — هذا خطأ | متابعة نشاط فقط + لا خصم تلقائي إطلاقًا |

### C.2 — المحرّك الجديد المطلوب

```
attendancePolicyEngine.resolve(employee, attendance_event) ⇒ {
  category,                  // worker | driver | office | field | manager | executive
  late_threshold_minutes,
  grace_period_minutes,
  early_leave_allowed,
  auto_deduction_enabled,    // false للمدير والتنفيذي
  tracking_frequency_seconds, // 30 للسائق، 300 للميداني، 0 للإداري والمدير
  required_source,           // gps | qr | selfie | any
  exempt_from_violation_engine
}
```

المنطق:
1. اقرأ `employee_assignments.position_id` أو `jobTitleId` → اربط بـ `employee_categories` (seed).
2. اقرأ override من `attendance_policies_per_category` (per company × category).
3. طبّق على check-in/check-out + auto-detection.

### C.3 — Seed لكتالوج الـ HR roles

| Role Key | الحالة | الإضافة |
|---|---|---|
| HR Admin | 🟢 موجود (rbac_roles template) | — |
| HR Manager | 🟢 موجود | — |
| Attendance Officer | 🔴 غير موجود | إضافة template |
| Payroll Officer | 🟡 يحتاج تطوير (موجود كـ legacy permission، لا كـ rbac_role template) | ترقية إلى rbac_roles template |
| Discipline Officer | 🔴 غير موجود | إضافة template |
| Performance Reviewer | 🔴 غير موجود | إضافة template |
| Branch Manager | 🟢 موجود | — |
| Department Manager | 🟢 موجود | — |
| Employee Self-Service | 🟢 موجود (default `employee` role) | — |

---

## D) خارطة التهذيب (Menu Cleanup)

### D.1 — القائمة الحالية vs المقترحة

| القائمة الحالية | المقترحة | القرار |
|---|---|---|
| نظرة عامة، التوظيف، الموظفون، الورديات، الحضور والانصراف، الإجازات، الرواتب، الامتثال السعودي، الأداء، التدريب، الانضباط، صناديق الواردات، الوثائق، نهاية الخدمة، الخطابات، العقود | لوحة HR، الموظفون، النشاط والحضور، الطلبات، الامتثال والجزاءات، الأداء والتطوير، الرواتب، التقارير، الإعدادات | دمج كبير |

### D.2 — جدول الدمج

| الصفحة القديمة | المكان الجديد | القرار |
|---|---|---|
| `/hr/recruitment/*` | تحت "الموظفون" → tab فرعي | ربط داخلي |
| `/hr/shifts/*` | تحت "النشاط والحضور" → tab "الورديات" | دمج |
| `/hr/attendance-policy` | تحت "الإعدادات" | نقل |
| `/hr/excuse-requests` | تحت "الطلبات" | دمج |
| `/hr/overtime` | تحت "الطلبات" | دمج |
| `/hr/leaves/*` | تحت "الطلبات" → tab فرعي | دمج |
| `/hr/wps` + `/hr/saudi-compliance` | تحت "الرواتب" | دمج |
| `/hr/loans` + `/hr/gratuity` + `/hr/accruals` | تحت "الرواتب" → tabs | دمج |
| `/hr/violations/*` + `/hr/discipline/regulation` + `/hr/violations/auto-detection` + `/hr/violations/penalty-escalation` | تحت "الامتثال والجزاءات" | دمج كبير |
| `/hr/performance` + `/hr/evaluation-360` + `/hr/idp` + `/hr/training` + `/hr/turnover-report` | تحت "الأداء والتطوير" | دمج كبير |
| `/hr/organization/*` + `/hr/delegations` + `/hr/transfers` + `/hr/contracts` + `/hr/official-letters` + `/hr/documents` + `/hr/expiring-documents` | تحت "الموظفون" → tabs على ملف الموظف | دمج كبير |
| `/hr/employee-activation` + `/hr/onboarding-review` | تحت "الموظفون" → tab "Onboarding" | دمج |

**القاعدة:** كل route قديم يبقى موجودًا (لا نكسر روابط مكتوبة)، لكن لا يظهر في القائمة الرئيسية إن كان مدموجًا.

---

## E) الاختبارات المطلوبة (#1799 §K)

| Test | الحالة | الملف المتوقع |
|---|---|---|
| موظف بأكثر من دور → effective permissions صحيحة | 🟡 جزئي | `tests/unit/rbacEffectivePermissionsSmoke.test.ts` (موسّع) |
| Audit يحفظ activeRole | 🟡 جزئي | `tests/unit/auditActiveRoleSmoke.test.ts` (جديد) |
| عامل يتأخر → policy عامل → خصم/مخالفة حسب threshold | 🔴 غير موجود | `tests/unit/attendancePolicyWorkerSmoke.test.ts` (جديد) |
| مدير يتأخر → لا خصم تلقائي | 🔴 غير موجود | `tests/unit/attendancePolicyManagerSmoke.test.ts` (جديد) |
| سائق GPS → نقطة محفوظة في `field_tracking_points` | 🔴 غير موجود (يعتمد على إنشاء الجدول أولًا) | |
| Manual attendance → سبب + اعتماد + ظهور كمصدر يدوي | 🔴 غير موجود | |
| تأخير متكرر → violation + inquiry memo | 🟢 موجود (`autoViolationEngine.runAutoDetection`) | |
| اعتماد GM للجزاء → deduction → payroll | 🟢 موجود | |
| Payroll يقرأ الخصم المعتمد فقط | 🟢 موجود | |
| Employee Scoring يحسب أسبوعي/شهري من >1 مصدر | 🔴 غير موجود | |
| Menu cleanup لا يكسر route | 🟡 يحتاج اختبار جديد | `tests/unit/hrMenuRouteIntegritySmoke.test.ts` |

---

## F) ترتيب التنفيذ (12 أولوية)

ترتيب الـ12 أولوية كما جاء في إرشاد المهمة، مع **PR scope** لكل واحدة:

| # | الأولوية | الحالة الحالية | PR-Scope مقترح |
|---|---|---|---|
| 1 | سجل الموظف الرئيسي الموحد | 🟢 **مكتمل 14/14 tabs** (HR-012) | overview / info / titles / account / roles / contract / attendance / leaves / custodies / payroll / violations / tasks / trainings / finance ✅ |
| 2 | ربط الموظف بالأدوار والصلاحيات | 🟢 موجود لكن غير مرئي في ملف الموظف | إضافة تبويب "الأدوار والصلاحيات" يقرأ من `rbac_user_roles` + يعرض effective permissions |
| 3 | نموذج "ماذا يظهر لمن ومتى" | 🟡 RBAC scope يفي بالغرض | UI viewer للـ Effective Permissions per user (RBAC-004) |
| 4 | كتالوج خدمات HR | 🟢 **مكتمل** (HR-010) — صفحة `/hr/services` بـ 8 خدمات في 4 categories. | بناء صفحة "خدمات HR" ✅ |
| 5 | محرك الطلبات وسلاسل الاعتماد | 🟢 موجود | توحيد UI inbox واحد بدل تشتيت |
| 6 | الحضور حسب طبيعة العمل | 🟢 **مكتمل من جانب الـ engine + كل callsites السيرفر** (HR-002 → HR-004). بقي: UI لإدارة الفئات والـ overrides من شاشة الإعدادات. | جداول + engine ✅ — check-in ✅ — check-out ✅ — autoViolation cron ✅ — UI لاحقًا |
| 7 | التتبع حسب السياسة | 🟡 **الأساس + ingestion مبني** (HR-005): `field_tracking_points` + `POST field-ping` (مع enforcement لتردد الفئة) + `GET field-track` (breadcrumb + live). بقي: ربط الواجهة + تقرير المسار/التوقفات. | إنشاء `field_tracking_points` ✅ + ingestion API ✅ + policy frequency ✅ — UI wiring لاحقًا |
| 8 | الربط المالي | 🟢 موجود (payroll GL + WPS) | لا تغيير معماري |
| 9 | العهد والأصول | 🟢 **مكتمل** (HR-011) — `employee_assets` bridge مع lifecycle كامل + condition tracking. | إضافة `employee_assets` bridge ✅ |
| 10 | التقييم وإشارات الأداء | 🟢 **مكتمل من جانب الـ engine + cron** (HR-006, HR-007, HR-009). UI داخل ملف الموظف لاحقًا. | scoring + signals + cron ✅ |
| 11 | صندوق الأعمال والجدولة | 🟡 موجود `/hr/approvals` + Services Catalog (HR-010). توحيد inbox واحد لـ HR workflows لاحقًا. | catalog ✅ |
| 12 | تهذيب الواجهات | 🟢 **مكتمل** (HR-011) — 17 entries → 9 canonical entries من §D.2، كل route قديم محفوظ. | تنفيذ §D.2 ✅ |

---

## G) ما تم تفعيله في هذه المهمة (سيُحدّث مع كل PR)

| PR | ما تم | التاريخ |
|---|---|---|
| #1803 | مرحلة 0 — وثيقة الجرد + خارطة الـ12 أولوية + قسم نموذج المؤسسة. | 2026-06-07 |
| #1807 | الأولوية #1 جزئية — تبويبا «الحساب والدخول» + «الأدوار والصلاحيات» داخل ملف الموظف 360. البَك إند يعيد `userAccount` (single row من `users`، بدون passwordHash/MFA) + `roles` (array من `rbac_user_roles` مع primary/templates/expiry). الواجهة تعرض حالة الحساب + آخر دخول + محاولات فاشلة + قفل + قائمة الأدوار مع primary highlight + expired styling + deep-link لشاشة الصلاحيات الفعلية. التبويبات الآن 11/14 — باقي 3 (titles+positions، contract embed، custodies embed). | 2026-06-08 |
| #1809 | **الأولوية #6 — الحضور حسب فئة الموظف (الأساس)**. Migration 270 يُضيف: (1) جدول `employee_categories` مع seed لـ 6 فئات نظام (worker/driver/field/office/manager/executive) — manager و executive لديهما `exemptFromAutoDeduction = TRUE`؛ driver لديه `trackingFrequencySeconds = 30`؛ field لديه `300`. (2) جدول `attendance_policies_per_category` للـ override لكل (company × category). (3) عمود `employee_assignments.categoryKey` (nullable) + backfill heuristic من role/jobTitle. **محرك جديد** `lib/attendancePolicyEngine.ts` يحلّ السياسة الفعلية بـ 3 طبقات (override → system category → company default) مع batch resolver للـ cron jobs. Backward-compatible: NULL category يُرجِع نفس السلوك القديم. 18/18 smoke tests خضراء. | 2026-06-08 |
| #1814 | **الأولوية #6 — wiring 1/2**. ربط `POST /hr/check-in` بـ `resolveAttendancePolicy`. `lateThresholdMinutes` و `gpsRadiusMeters` يقرآن من المحرك (مع legacy fallback). `autoDeductionEnabled` يُمرَّر إلى exceedsThreshold حتى لا يفتح violation/deduction للمدراء والتنفيذيين تلقائيًا. 8/8 wiring smoke tests خضراء. | 2026-06-08 |
| #1817 | **الأولوية #6 — wiring 2/2**. (أ) ربط `POST /hr/check-out` بنفس النمط — early-departure violation + deduction يحرسهما `autoDeductionEnabledCheckout`. (ب) ربط `autoViolationEngine.runAutoDetection` بـ `resolveBatch` (memoized) ⇒ الـ cron الليلي يحذف incidents الفئات المُعفاة قبل INSERT INTO `employee_violations` و قبل `ensureInquiryMemoForViolation`. `result.detected` يبقى يعكس الـ raw count قبل الفلترة للـ audit. fallback آمن: فشل engine = legacy behavior + error log. 12/12 wiring smoke tests خضراء، 23/23 existing autoViolation tests لا تزال خضراء. | 2026-06-08 |
| #1822 | **الأولوية #7 — التتبع الميداني (الأساس + ingestion)**. Migration 271 + endpoints `POST/GET /hr/attendance/field-{ping,track}` (راجع HR-005 سابقاً). 17/17 smoke tests خضراء. | 2026-06-08 |
| #1831 | **الأولوية #10 — Employee Scoring Engine**. راجع HR-006 سابقاً. 27/27 smoke tests خضراء. | 2026-06-08 |
| HR-007 | **الأولوية #10 §G — Risk/Promotion/Burnout Signals**. Migration 273 + `lib/employeeSignalsEngine.ts` بـ 3 detection engines. UPSERT idempotent مع acknowledgement reset عند escalation الـ severity فقط. 32/32 smoke tests خضراء. | 2026-06-08 |
| #1836 | **§B (نموذج المؤسسة التشغيلي) — الدفعة الأساسية**. راجع HR-008 سابقاً (5 جداول + 3 أعمدة + 9 system positions). 18/18 smoke tests. | 2026-06-08 |
| #1837 | **§B إكمال + #10 cron**. supervision_lines + approval_authorities + scoring cron entries. 22/22 smoke tests. | 2026-06-08 |
| #1838 | **الأولوية #4 — HR Services Catalog** — راجع HR-010. 16/16 smoke tests. | 2026-06-08 |
| HR-011 | **الأولوية #12 (تهذيب القائمة) + الأولوية #9 (employee_assets)**. (أ) إعادة هيكلة `navigation.registry.ts` HR section من 17 entry إلى 9 canonical entries من §D.2: لوحة HR / الموظفون / النشاط والحضور / الطلبات / الامتثال والجزاءات / الأداء والتطوير / الرواتب / التقارير / إعدادات. **كل route قديم محفوظ** كـ sub-link — الـ bookmarks والـ deep-links لا تنكسر. (ب) Migration 276 يُنشئ `employee_assets` bridge مع assetType + assetKey + serialNumber + warehouseAssetId اختياري + lifecycle كامل (assignedAt/assignedBy/returnedAt/returnedBy) + conditionOnAssign/conditionOnReturn للـ damage claims + partial index على returnedAt IS NULL للقوائم النشطة. 24/24 smoke tests خضراء. | 2026-06-08 |
| HR-012 | **الأولوية #1 إكمال — 14/14 تبويبات + §J seed 4/4 templates**. (أ) إضافة 3 تبويبات نهائية لـ `employee-detail.tsx`: **«المسميات والمناصب»** يعرض الـ job title + position من جدول `positions` (مع level badge من §B.5) + الفئة الإدارية + categoryKey badge — **«العقد»** يعرض العقد النشط من `employee_contracts` (ref + dates + probation + signature status) مع empty-state deep-link لـ `/hr/contracts` — **«العهد والأصول»** يعرض custodies من `employee_assets` بـ active-first ordering + opacity 60 للمُعَاد + condition fields. (ب) `GET /employees/:id` يمرر contract + position + custodies ضمن نفس Promise.all (3 queries إضافية، لا N+1). (ج) custodies count badge في tab header. (د) Migration 278 يبذر 4 من 9 HR role templates الناقصة من §J (احتُجِز 277 من قِبل main لـ maintenance_request_linked_expense): `attendance_officer` (40) + `payroll_officer` (50) + `discipline_officer` (45) + `performance_reviewer` (45) كـ system templates (companyId IS NULL) — idempotent عبر `ON CONFLICT ("companyId", role_key) DO NOTHING`. 25/25 smoke tests خضراء. | 2026-06-08 |
| HR-013 | **§B (نموذج المؤسسة) — تفعيل الجداول اليتيمة بـ admin UI**. الجداول الـ6 التي أنشأتها migrations 274/275 (`legal_entities`, `positions`, `teams`, `committees`, `supervision_lines`, `approval_authorities`) كانت موجودة في DB بدون **أي** route أو صفحة — مدير HR لا يستطيع إنشاء فريق أو لجنة من النظام. (أ) `routes/org.ts` جديد بـ 18 endpoint (CRUD كامل + UPSERT للـ approval_authorities + soft delete لـ entities/positions/teams/committees + hard delete لـ approval_authorities + end-date لـ supervision_lines). كل endpoint محمي بـ `authorize({feature:"admin"})` + `companyId` scope + audit log + `activeRoleKey` في الـ audit. مرفق تحت `/org` بـ HR module gate. (ب) صفحة واحدة `/admin/org-model` بـ 6 tabs (Tabs/TabsList/TabsContent من ui-core) — كل tab له DataTable + add form + soft delete. (ج) nav entry تحت «إعدادات الموارد البشرية». (د) supervision_lines يرفض self-supervision في الـ frontend + الـ backend + DB CHECK constraint. approval_authorities يفرض `reason` كحقل مطلوب (audit trail للـ override). 25/25 smoke tests خضراء. **يُغلق الـ 🟡 «جداول بدون UI» إلى 🟢 «مُنفّذ ومدمج»**. | 2026-06-08 |

---

## H) ما بقي لاحقًا

- بناء `legal_entities` (نموذج المؤسسة §B.5 دفعة 1).
- بناء `positions` (§B.5 دفعة 2).
- بناء `teams` + `committees` + `employee_project_assignments` (§B.5 دفعات 3-5).
- بناء `supervision_lines` + `approval_authorities` (§B.5 دفعة 6).
- نقل legacy `custom_roles` → `rbac_roles` كاملًا.

---

## مرجع المهمة

GitHub Issue: **#1799** — HR Operating Foundation: تفعيل وتنظيم الموارد البشرية والأدوار والسياسات وإزالة التكرار.

