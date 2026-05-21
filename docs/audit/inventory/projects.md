# جرد المسار — المشاريع (Projects)

جرد ثابت مستقل لمسار «المشاريع» في نظام Ghayth ERP، يغطي وحدات `projects.ts` و`tasks.ts` الخلفية وصفحاتها الأمامية، ومقاطعة مسار التكاليف مع المالية. كل بند موسوم بحالته ومدعوم بدليل `file:line`. لم يُشغَّل النظام ولم يُعدَّل أي سطر برمجي.

نطاق التحقق: `artifacts/api-server/src/routes/projects.ts` (2151 سطر)، `tasks.ts` (539 سطر)، `finance-hardening.ts` (مقطع المشاريع)، وصفحات `pages/projects.tsx`, `pages/projects/{gantt,risks}.tsx`, `pages/tasks.tsx`, `pages/create/{projects-create,tasks-create}.tsx`, `pages/details/{project-detail,task-detail}.tsx`، ومخطط قاعدة البيانات `db/schema_pre.sql`.

نقاط التركيب: `/projects` و`/tasks` تحت `requireModule("operations")` (routes/index.ts:313, 321)؛ مسار المالية `financeHardeningRouter` مركّب تحت `/finance` (routes/index.ts:306) فتُصبح نهاياته `/finance/projects*`.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-01 | `/projects` | pages/projects.tsx | شغّال | `GET /projects/stats/overview`, `GET /projects/stats/summary`, `GET /projects` | لا يوجد؛ تبويب «نظرة عامة» و«القائمة» يطابقان نهايات موجودة |
| P-02 | `/projects/create` | pages/create/projects-create.tsx | شغّال | `POST /projects`, `POST /projects/impact-preview` | الواجهة لا ترسل `phases` رغم دعم الـ schema لها (نقص وظيفي بسيط، PRJ-009) |
| P-03 | `/projects/tasks` و`/tasks` | pages/tasks.tsx | شغّال | `GET /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id` | حالات الواجهة (`pending/overdue`) لا تطابق آلة حالات الـ backend (`todo`...) — تعارض دلالي PRJ-005 |
| P-04 | `/projects/gantt` | pages/projects/gantt.tsx | مكسور جزئياً | `GET /projects?limit=100`, `GET /projects/:id/gantt` | يقرأ `row.progress` للمهام، والعمود `progress` غير موجود في جدول `project_tasks` (PRJ-001) |
| P-05 | `/projects/risks` | pages/projects/risks.tsx | شغّال | `GET /projects?limit=100`, `GET /projects/:id/risks`, `POST /projects/:id/risks`, `PATCH /projects/risks/:riskId` | قائمة حالات الواجهة تُغفل `realized` المعرّفة في الـ backend (PRJ-010) |
| P-06 | `/projects/:id` | pages/details/project-detail.tsx | شغّال | `GET /projects/:id`, `/risks`, `/milestones`, `/resources`, `/costs`, `/letters`, `POST /phases`, `POST /tasks`, `POST /costs`, `PATCH /tasks/:taskId`, `PATCH /phases/:phaseId/complete`, `PATCH /:id`, `DELETE /:id`, `POST /:id/close` | تبويب «المعالم» يعرض المعالم لكن لا يوفّر زر إنشاء معلَم رغم وجود `POST /:id/milestones` (PRJ-008 dead) |
| P-07 | `/tasks/create` | pages/create/tasks-create.tsx | شغّال | `POST /tasks`, `GET /tasks/entity-search`, `GET /clients` | يرسل `assignedTo` كاسم المستخدم دائماً؛ يعتمد على fallback اسم→assignment في الـ backend |
| P-08 | `/tasks/:id` | pages/details/task-detail.tsx | مكسور جزئياً | `GET /tasks/:id`, `PATCH /tasks/:id` | يقرأ `task.assignedToName` بينما الـ API يُرجع `assigneeName` (PRJ-006)؛ زر «تعديل» يوجّه إلى `/tasks/:id/edit` غير الموجود (PRJ-007 dead) |
| P-09 | `/finance/project-costing` | pages/finance/project-costing.tsx | مكسور | `GET /finance/projects`, `POST /finance/projects/:id/costs` | نهاية الـ POST غير موجودة على router المالية — إضافة تكلفة تُرجع 404 (PRJ-002) |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| projects.tsx (Overview) | «مشروع جديد» | فتح نموذج الإنشاء | تنقّل `/projects/create` | شغّال | — |
| projects.tsx (Overview) | «تكاليف المشاريع» | فتح تكاليف المالية | تنقّل `/finance/project-costing` | شغّال (التنقّل) لكن الصفحة الهدف مكسورة | dead |
| projects.tsx (List) | «تعديل» سطري | `PATCH` المشروع | `PATCH /projects/:id` | شغّال | — |
| projects.tsx (List) | «حذف» سطري | حذف ناعم | `DELETE /projects/:id` | شغّال | — |
| projects.tsx (List) | تصدير CSV | تنزيل ملف | محلي (لا API) | شغّال | — |
| projects-create.tsx | «إنشاء» | إنشاء مشروع | `POST /projects` | شغّال | — |
| projects-create.tsx | «معاينة أثر المشروع» | حساب أثر | `POST /projects/impact-preview` | شغّال | — |
| project-detail.tsx | «إضافة مرحلة» | إنشاء مرحلة | `POST /projects/:id/phases` | شغّال | — |
| project-detail.tsx | «إكمال» مرحلة | نقل حالة + فوترة | `PATCH /projects/:id/phases/:phaseId/complete` | شغّال | — |
| project-detail.tsx | «إضافة مهمة» | إنشاء مهمة مشروع | `POST /projects/:id/tasks` | شغّال | — |
| project-detail.tsx | تغيير حالة مهمة (Select) | نقل حالة المهمة | `PATCH /projects/tasks/:taskId` | مكسور | mismatch (PRJ-001) |
| project-detail.tsx | «تكلفة جديدة» | تسجيل تكلفة + قيد GL | `POST /projects/:id/costs` | شغّال | — |
| project-detail.tsx | «إقفال المشروع» | تحويل WIP + إكمال | `POST /projects/:id/close` | شغّال | — |
| project-detail.tsx | «تعديل» / «حفظ» | تعديل بيانات المشروع | `PATCH /projects/:id` | شغّال | — |
| project-detail.tsx | «حذف» | حذف ناعم | `DELETE /projects/:id` | شغّال | — |
| project-detail.tsx | «خطاب جديد» (Letters) | تنقّل إنشاء مراسلة | تنقّل `/communications/letters/create` | شغّال | — |
| risks.tsx | «إضافة مخاطرة» | إنشاء مخاطرة | `POST /projects/:id/risks` | شغّال | — |
| risks.tsx | تغيير حالة (Select) | نقل حالة المخاطرة | `PATCH /projects/risks/:riskId` | شغّال | — |
| gantt.tsx | اختيار مشروع (Select) | تحميل بيانات غانت | `GET /projects/:id/gantt` | شغّال | — |
| tasks.tsx | «إكمال المهمة» سريع | `PATCH status=completed` | `PATCH /tasks/:id` | شغّال | — |
| tasks.tsx | «بدء العمل» سريع | `PATCH status=in_progress` | `PATCH /tasks/:id` | شغّال | — |
| tasks.tsx | «نسخ» / «نسخ المهمة» | تنقّل إنشاء بنسخة | تنقّل `/tasks/create?copy=` | شغّال | — |
| tasks.tsx | «تعديل» سطري / «حفظ» | `PATCH` المهمة | `PATCH /tasks/:id` | شغّال | — |
| tasks.tsx | «حذف» | حذف ناعم | `DELETE /tasks/:id` | شغّال | — |
| task-detail.tsx | «تعليم كمكتملة» | `PATCH status=completed` | `PATCH /tasks/:id` | شغّال | — |
| task-detail.tsx | «تعديل» | فتح صفحة تعديل | تنقّل `/tasks/:id/edit` | مكسور | dead (PRJ-007) |
| project-costing.tsx | «تسجيل تكلفة» | إضافة تكلفة مالية | `POST /finance/projects/:id/costs` | مكسور | dead (PRJ-002) |

---

## جدول 3 — APIs

جميع نهايات مسار المشاريع/المهام (35 نهاية: 22 في `projects.ts` + 7 في `tasks.ts` + 4 في `finance-hardening.ts` + ملاحظتان).

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/projects/impact-preview` | POST | projects.ts:202 | impactPreviewSchema | projects-create.tsx | projects/employees | شغّال | يقرأ `employees` مباشرة (F3) |
| `/projects` | GET | projects.ts:315 | — (query) | projects.tsx, gantt, risks | projects | شغّال | يقرأ `employees` مباشرة عبر JOIN |
| `/projects` | POST | projects.ts:392 | createProjectSchema | projects-create.tsx | projects/project_phases | شغّال | — |
| `/projects/:id` | GET | projects.ts:513 | — | project-detail.tsx | projects/project_tasks/phases | شغّال | يقرأ `employees` مباشرة |
| `/projects/:id` | PATCH | projects.ts:586 | updateProjectSchema | project-detail.tsx, projects.tsx | projects | شغّال | — |
| `/projects/:id` | DELETE | projects.ts:703 | — | project-detail.tsx, projects.tsx | projects | شغّال | — |
| `/projects/:id/phases` | POST | projects.ts:754 | createPhaseSchema | project-detail.tsx | project_phases | شغّال | — |
| `/projects/:id/phases/:phaseId/complete` | PATCH | projects.ts:796 | — | project-detail.tsx | project_phases/projects | شغّال | — |
| `/projects/:id/tasks` | POST | projects.ts:878 | createTaskSchema | project-detail.tsx | project_tasks/dependencies | شغّال | يقرأ `employees` مباشرة |
| `/projects/tasks/:taskId` | PATCH | projects.ts:1005 | updateTaskSchema | project-detail.tsx | project_tasks | مكسور | يكتب عمود `progress` غير الموجود (PRJ-001) |
| `/projects/stats/summary` | GET | projects.ts:1216 | — | projects.tsx | projects | شغّال | — |
| `/projects/stats/overview` | GET | projects.ts:1233 | — | projects.tsx | projects/tasks/milestones/risks | شغّال | يقرأ `employees` عبر subquery |
| `/projects/manager/:employeeId/workload` | GET | projects.ts:1334 | — | ManagerWorkloadCard | projects/project_tasks | شغّال | — |
| `/projects/:id/milestones` | GET | projects.ts:1387 | — | project-detail.tsx | project_milestones | شغّال | — |
| `/projects/:id/milestones` | POST | projects.ts:1400 | createMilestoneSchema | لا أحد (انظر PRJ-008) | project_milestones | شغّال (لكن بلا UI) | dead في طبقة UI |
| `/projects/milestones/:milestoneId` | PATCH | projects.ts:1479 | updateMilestoneSchema | لا أحد | project_milestones | شغّال (بلا UI) | dead في طبقة UI |
| `/projects/:id/risks` | GET | projects.ts:1555 | — | risks.tsx, project-detail.tsx | project_risks | شغّال | — |
| `/projects/:id/risks` | POST | projects.ts:1568 | createRiskSchema | risks.tsx | project_risks | شغّال | — |
| `/projects/risks/:riskId` | PATCH | projects.ts:1625 | updateRiskSchema | risks.tsx | project_risks | شغّال | — |
| `/projects/:id/resources` | GET | projects.ts:1712 | — | project-detail.tsx | project_resources | شغّال | — |
| `/projects/:id/resources` | POST | projects.ts:1730 | createResourceSchema | لا أحد (انظر PRJ-004) | project_resources | شغّال (بلا UI) | dead في طبقة UI |
| `/projects/:id/costs` | GET | projects.ts:1784 | — | project-detail.tsx | project_costs | شغّال | — |
| `/projects/:id/costs` | POST | projects.ts:1812 | createCostSchema | project-detail.tsx | project_costs/projects | شغّال | — |
| `/projects/:id/close` | POST | projects.ts:1917 | closeProjectSchema | project-detail.tsx | projects/project_costs | شغّال | الواجهة ترسل `{reason}` غير مدعوم في الـ schema (PRJ-011) |
| `/projects/:id/gantt` | GET | projects.ts:2068 | — | gantt.tsx | phases/tasks/milestones | شغّال | يُرجع `progress` لمهام لا يوجد بها عمود (PRJ-001) |
| `/projects/:id/letters` | GET | projects.ts:2129 | — | project-detail.tsx | correspondence | شغّال | — |
| `/tasks` | GET | tasks.ts:113 | — (query) | tasks.tsx | tasks | شغّال | — |
| `/tasks/entity-search` | GET | tasks.ts:243 | — (query) | tasks-create.tsx | متعدد | شغّال | — |
| `/tasks/:id` | GET | tasks.ts:269 | — | task-detail.tsx | tasks | شغّال | يُرجع `assigneeName` لا `assignedToName` (PRJ-006) |
| `/tasks` | POST | tasks.ts:296 | createTaskSchema | tasks-create.tsx | tasks | شغّال | — |
| `/tasks/:id` | PATCH | tasks.ts:400 | updateTaskSchema | tasks.tsx, task-detail.tsx | tasks | شغّال | — |
| `/tasks/:id` | DELETE | tasks.ts:505 | — | tasks.tsx | tasks | شغّال | — |
| `/finance/projects` | GET | finance-hardening.ts:1262 | — | project-costing.tsx | projects/journal_entries | شغّال | — |
| `/finance/projects` | POST | finance-hardening.ts:1284 | createProjectSchema (محلي) | لا أحد ظاهر | projects | مكسور | يُدرج عمودي `ref` و`branchId` غير الموجودين في `projects` (PRJ-003) |
| `/finance/projects/:id` | GET | finance-hardening.ts:1322 | — | project-costing-detail.tsx | projects | شغّال | — |
| `/finance/projects/:id/costs` | GET | finance-hardening.ts:1339 | — | project-costing-detail.tsx | journal_entries/journal_lines | شغّال | — |
| `/finance/projects/:id/costs` | POST | غير موجود | — | project-costing.tsx (يستدعيه) | — | مكسور | النهاية غير معرّفة — 404 (PRJ-002) |

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| project-detail.tsx:195 → `PATCH /projects/tasks/:taskId` | `{status}` | updateTaskSchema يقبل `status/progress/actualHours` | الـ handler عند projects.ts:1046-1048 يكتب `progress=$N` على `project_tasks`، لكن جدول `project_tasks` (schema_pre.sql:10806-10821) لا يحوي عمود `progress` إطلاقاً. أي طلب يمرّر `progress` (أو يحسب التقدّم) يُسبب خطأ SQL `column "progress" does not exist` | إضافة `progress integer DEFAULT 0` إلى `project_tasks` عبر migration جديدة، أو إزالة كتلة `progress` من updateTaskSchema و projects.ts:1046-1048 ومن مخرجات gantt |
| project-costing.tsx:56 → `POST /finance/projects/:id/costs` | `{description, amount, category, costDate, projectId}` | لا يوجد handler | لا يوجد سوى `GET /finance/projects/:id/costs` على router المالية (finance-hardening.ts:1339)؛ POST غير معرّف فيُعيد Express 404 | إمّا إضافة `financeHardeningRouter.post("/projects/:id/costs", ...)` يكتب في `project_costs` ويستدعي `projectsEngine.postProjectCostGL`، أو تحويل زر الواجهة لاستدعاء `POST /projects/:id/costs` الموجود فعلاً في projects.ts:1812 |
| finance-hardening.ts:1291 INSERT | يُدرج `ref` و`branchId` و`managerId` في `projects` | جدول `projects` (schema_pre.sql:10848-10864) لا يحوي عمودَي `ref` ولا `branchId` | الـ schema المحلي `createProjectSchema` (finance-hardening.ts:119) يقبل `ref/branchId`، والـ INSERT يكتبهما → خطأ SQL `column "ref" of relation "projects" does not exist` | إزالة `ref` و`branchId` من INSERT و من الـ schema المحلي، أو إضافة العمودين إلى `projects` عبر migration |
| task-detail.tsx:78,145,178 | يقرأ `task.assignedToName` و`task.assignedTo` | `GET /tasks/:id` يُرجع الحقل باسم `assigneeName` (tasks.ts:280) | اسم الحقل في الاستجابة `assigneeName` لا `assignedToName`؛ النتيجة دائماً تُعرض `#<id>` أو «غير مُعيَّن» | توحيد اسم الحقل: قراءة `task.assigneeName` في task-detail.tsx |
| risks.tsx:30-31 (riskSchema) | `probability/impact` أعداد 1..5 | createRiskSchema يقبل `number|string` ويحدّها backend بـ `Math.min(5,Math.max(1,...))` | متطابق وظيفياً؛ لا عيب فعلي — مُدرَج للتوثيق فقط | لا إجراء |
| project-detail.tsx:225 → `POST /projects/:id/close` | `{reason: "إقفال المشروع"}` | closeProjectSchema هو `z.object({})` (يتجاهل الحقول الزائدة بصمت) | الحقل `reason` يُرسَل ولا يُخزَّن في أي مكان — سبب الإقفال يُفقد | إمّا إضافة `reason` إلى closeProjectSchema وتخزينه في audit/event، أو إزالته من جسم الطلب في الواجهة |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| إنشاء مشروع | `POST /projects` (projects.ts:392) — يكتب `name/status/budget/phases` بحالة افتراضية `planning` ويسجّل obligation | `POST /finance/projects` (finance-hardening.ts:1284) — يكتب `ref/branchId/managerId` ولا يسجّل obligation | duplicate (نفس الوظيفة بمسارين بمنطقين مختلفين؛ المسار المالي مكسور أصلاً — PRJ-003) | إلغاء `POST /finance/projects` نهائياً وإبقاء مسار `projects.ts` المرجعي الوحيد للإنشاء |
| استعلام تحقّق HR-assignment للموظف | projects.ts:237, 437, 649, 893, 1579, 1739 — نفس الاستعلام `SELECT e.id FROM employees JOIN employee_assignments ...` مكرّر ست مرات حرفياً | داخل وحدة المشاريع نفسها فقط | duplicate (تكرار نصّي لاستعلام واحد ٦ مرّات) | استخراج دالة `assertEmployeeInCompany(employeeId, companyId)` في `businessHelpers` أو `lib/hr` واستدعاؤها |
| قراءة جدول `employees` من خارج مسار HR | projects.ts:339, 534, 1278, 1287, 1720, 2080 (JOIN/subquery مباشر على `employees`) | الجدول مملوك لمسار HR | conflict (مسار المشاريع يقرأ بيانات يملكها مسار آخر مباشرةً بدل واجهة موحّدة — يطابق F3) | تمرير قراءات أسماء الموظفين عبر دالة/خدمة HR موحّدة، أو view مخصّص `employee_directory` للمسارات غير-HR |
| حساب نسبة التقدّم وكتابتها في `projects.progress` | projects.ts:870-871 (PATCH phase complete) | projects.ts:1096-1099 (PATCH task) | conflict (مصدران يحدّثان `projects.progress` بقاعدتين: نسبة المهام المكتملة في الموقعين، لكن دون قفل تزامني — race) | توحيد منطق إعادة الحساب في دالة واحدة `recomputeProjectProgress(projectId)` تُستدعى من كلا الموقعين داخل معاملة |
| تتبّع «المنصرف» على المشروع | `projects.spentAmount` يُزاد عند `POST /projects/:id/costs` (projects.ts:1842) | `actualCost` في finance-hardening محسوب من `journal_lines` (finance-hardening.ts:1267) | conflict (رقمان للمنصرف من مصدرين مختلفين قد يتباعدان: قيد عمود مقابل قيد دفتر أستاذ) | اعتماد مصدر واحد للحقيقة؛ إمّا اشتقاق `spentAmount` دائماً من journal_lines، أو ضمان أن كل تكلفة تُرحَّل GL وتُحدّث العمود ذرياً |

---

## يحتاج Runtime Verification

- هل خطأ `column "progress" does not exist` (PRJ-001) يظهر فعلياً عند كل `PATCH /projects/tasks/:taskId`، أم أن migration غير مرصودة أضافت العمود لاحقاً؟ يجب فحص قاعدة البيانات الحيّة لجدول `project_tasks`.
- هل عمودا `ref`/`branchId` (PRJ-003) أُضيفا إلى `projects` بـ migration بعد لقطة `schema_pre.sql`؟ يلزم فحص الجدول الفعلي.
- سلوك Express عند `POST /finance/projects/:id/costs` (PRJ-002): هل يُعاد 404 أم يلتقطه handler عام آخر؟
- استدعاء `projectsEngine.postProjectCostGL` و`postProjectClosureGL` و`requestInvoiceCreation` — لم تُفحَص محرّكات `lib/engines` ضمن هذا النطاق؛ نجاح ترحيل القيود يحتاج تحقّقاً تشغيلياً.
- منطق `loadBalanceAssign` و`criticalPathLength` و`applyTransition` (lib/algorithms, lib/lifecycleEngine) — صناديق سوداء هنا؛ صحّتها تحتاج تحقّقاً تشغيلياً.
- سباق تحديث `projects.progress` من مسارَي phase-complete و task-PATCH المتزامنين (تعارض جدول 5) — يحتاج اختبار حمل.
- هل `maskFields` يحجب حقولاً تعتمد عليها صفحات المشاريع (مثل `budget`/`spentAmount`) لأدوار معيّنة؟ يحتاج تحقّقاً تشغيلياً.

---

## العيوب المُرقّمة (Defect Register)

1. **PRJ-001 · mismatch · blocking · structural** — `PATCH /projects/tasks/:taskId` يكتب `progress=$N` على `project_tasks` بينما الجدول لا يحوي عمود `progress`؛ كل محاولة تحديث مهمة تمرّر `progress` تفشل بخطأ SQL. الدليل: projects.ts:1046-1048 + schema_pre.sql:10806-10821. التبعية: تعطّل تبويب «المهام» في project-detail.tsx و`row.progress` في gantt.tsx.
2. **PRJ-002 · dead · blocking · narrow** — `POST /finance/projects/:id/costs` التي تستدعيها صفحة تكاليف المشاريع غير معرّفة على router المالية (يوجد GET فقط)؛ زر «تسجيل التكلفة» يُرجع 404. الدليل: project-costing.tsx:56 + finance-hardening.ts:1339 (GET فقط). التبعية: يعطّل صفحة `/finance/project-costing`.
3. **PRJ-003 · mismatch · blocking · narrow** — `POST /finance/projects` يُدرج `ref` و`branchId` في `projects`، وكلاهما غير موجود في الجدول؛ الإنشاء يفشل بخطأ SQL. الدليل: finance-hardening.ts:1291 + schema_pre.sql:10848-10864. التبعية: مستقلة.
4. **PRJ-004 · dead · impairing · narrow** — `POST /projects/:id/resources` (إضافة عضو فريق) موجود وسليم في الـ backend لكن لا توجد أي واجهة تستدعيه؛ تبويب «الفريق» في project-detail.tsx يعرض الموارد فقط دون زر إضافة. الدليل: projects.ts:1730 + project-detail.tsx:559-585 (عرض فقط). التبعية: مستقلة.
5. **PRJ-005 · conflict · impairing · structural** — صفحة `/tasks` تستخدم مجموعة حالات `pending/in_progress/completed/overdue` بينما `tasks.ts` يستخدم آلة انتقالات `pending→in_progress→completed/blocked/cancelled`؛ الحالة `overdue` خيار فلترة لا حالة فعلية، و`blocked/cancelled` غير ظاهرة في الواجهة. الدليل: tasks.tsx:26-31 + tasks.ts:43-49. التبعية: مستقلة.
6. **PRJ-006 · mismatch · impairing · narrow** — task-detail.tsx يقرأ `task.assignedToName` بينما `GET /tasks/:id` يُرجع الحقل باسم `assigneeName`؛ اسم المُعيَّن لا يظهر أبداً. الدليل: task-detail.tsx:78,145,178 + tasks.ts:280. التبعية: مستقلة.
7. **PRJ-007 · dead · impairing · narrow** — زر «تعديل» في task-detail.tsx يوجّه إلى `/tasks/:id/edit` ولا يوجد مسار بهذا الاسم في `miscRoutes.tsx` (المسارات الموجودة: `/tasks/create` و`/tasks/:id`). الدليل: task-detail.tsx:207 + miscRoutes.tsx:117-119. التبعية: مستقلة.
8. **PRJ-008 · dead · impairing · narrow** — `POST /projects/:id/milestones` و`PATCH /projects/milestones/:milestoneId` سليمان في الـ backend لكن لا توجد واجهة لإنشاء/تعديل معلَم؛ project-detail.tsx يعرض المعالم للقراءة فقط. الدليل: projects.ts:1400,1479 + project-detail.tsx:424-447 (عرض فقط). التبعية: مستقلة.
9. **PRJ-009 · dead · cosmetic · narrow** — `createProjectSchema` يدعم مصفوفة `phases` عند إنشاء المشروع، لكن نموذج `projects-create.tsx` لا يوفّر أي حقل لإدخالها؛ ميزة backend غير منفّذة في UI. الدليل: projects.ts:45-49 + projects-create.tsx:46-55. التبعية: مستقلة.
10. **PRJ-010 · mismatch · cosmetic · narrow** — قائمة حالات المخاطر في risks.tsx (`open/mitigated/closed`) تُغفل الحالة `realized` المعرّفة في `RISK_STATUSES` بالـ backend؛ المخاطر بحالة `realized` تظهر بقيمة خام في الـ Select. الدليل: risks.tsx:71-73 + projects.ts:193. التبعية: مستقلة.
11. **PRJ-011 · mismatch · cosmetic · narrow** — `POST /projects/:id/close` تستقبل `{reason}` من الواجهة لكن `closeProjectSchema` هو `z.object({})`؛ سبب الإقفال يُرسَل ويُهمَل بصمت دون تخزين. الدليل: project-detail.tsx:225 + projects.ts:146,1919. التبعية: مستقلة.

---

## خلاف مع تقارير سابقة

**خلاف 1 — مع `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` (البند F3):**
التقرير السابق صنّف F3 («استعلام HR-assignment مكرّر + قراءات مباشرة لجداول `employees`») بخطورة **🟠 Medium** وأرجأه ضمن مسار «#685 Scope Normalization». هذا الجرد يؤكّد وجود العيب بالدليل المباشر (projects.ts:237,437,649,893,1579,1739 للاستعلام المكرّر؛ و339,534,1278,1287,1720,2080 للقراءات المباشرة) — لكنه **يختلف في التصنيف**: القراءة المباشرة لجدول يملكه مسار آخر هي **conflict** بنيوي (ملكية بيانات متقاطعة)، لا مجرّد «عدم اتّساق scopedQuery». كما أن التقرير السابق ذكر «~10×» للاستعلام المكرّر بينما العدّ الفعلي داخل `projects.ts` وحده هو **٦ نسخ حرفية** للاستعلام نفسه؛ الرقم المعمَّم غير دقيق على مستوى الوحدة.

**خلاف 2 — مع `FUNCTIONAL_FINANCE_VERIFICATION.md` (مقطع project-costing):**
التقرير المالي ذكر أن `POST /finance/projects/:id/costs` «غير موجود». هذا الجرد **يؤكّد** ذلك (لا يوجد سوى GET عند finance-hardening.ts:1339)، لكنه **يضيف عيباً أخطر فاته التقرير المالي**: نهاية `POST /finance/projects` نفسها (finance-hardening.ts:1284) **مكسورة بنيوياً** لأنها تُدرج عمودَي `ref` و`branchId` غير الموجودين في جدول `projects` (PRJ-003) — أي أن إنشاء مشروع من مسار المالية يفشل بخطأ SQL، وليس فقط إضافة التكلفة. التقرير المالي صنّف صفحة project-costing «مكسورة» بسبب الـ POST المفقود فقط، بينما العطل يمتدّ إلى نهاية الإنشاء أيضاً. كما أن الحلّ الأنظف ليس «إضافة» النهاية المفقودة بل **إلغاء ازدواج مسار الإنشاء المالي** وتوجيه الواجهة إلى `POST /projects/:id/costs` الموجود والسليم في `projects.ts:1812`.
