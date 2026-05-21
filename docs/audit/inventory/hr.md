# جرد المسار — الموارد البشرية (HR)
> تدقيق ثابت مستقل · 2026-05-21 · الملفات المفحوصة: `routes/{hr.ts (7424 سطرًا), employees.ts, hr-contracts.ts, hr-discipline.ts, hr-exit.ts, hr-loans.ts, hr-overtime.ts, recruitment.ts, training.ts}` · `routes/hrRoutes.tsx` · صفحات `pages/hr/*` و`pages/create/hr/*` و`pages/details/*` و`pages/employees*.tsx` و`pages/my-*.tsx` · `lib/{lifecycleEngine.ts, hrHelpers.ts, hrEnums.ts}` · `db/schema_pre.sql` · migrations 182/183 · PR #758 (8b577f3) و#765 (bbe0122).

> **ملاحظة منهجية حاسمة:** تقرير `FUNCTIONAL_HR_VERIFICATION.md` المؤرّخ 2026-05-20 قديمٌ بدرجة كبيرة. غالبية ثغراته الحرجة الثمانية (C1, C2, C3, C4, C6, C7, C8) **أُصلحت فعليًا** في PRs لاحقة، وتم التحقق من ذلك في الكود مباشرةً (انظر قسم «خلاف مع تقارير سابقة»). الثغرة الوحيدة الباقية كما وُصفت هي C5.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-01 | `/hr` | `pages/hr.tsx` | شغّال | `/employees`, `/hr/leave-requests`, `/hr/payroll`, `/hr/attendance`, `/hr/loans`, `/hr/overtime`, `/hr/exit`, `/hr/violations-stats` | — |
| P-02 | `/employees` | `pages/employees.tsx` | شغّال | `GET /employees`, `/hr/employees-status`, `PATCH/DELETE /employees/:id` | — |
| P-03 | `/employees/:id` | `pages/employee-detail.tsx` | شغّال | `GET /employees/:id`, `/hr/employee-status/:id`, `/hr/leave-balance`, `PATCH /employees/:id` | — |
| P-04 | `/employees/create` | `pages/create/employees-create.tsx` | شغّال | `POST /employees` | — |
| P-05 | `/hr/employee-profile/:id` | `pages/hr/employee-profile.tsx` | شغّال | — (إعادة توجيه إلى `/employees/:id`) | — |
| P-06 | `/hr/employee-activation` | `pages/hr/employee-activation.tsx` | شغّال | `GET /employees`, `PATCH/DELETE /employees/:id` | — |
| P-07 | `/hr/onboarding-review` | `pages/hr/onboarding-review.tsx` | ناقص | `GET /employees`, `/hr/onboarding-steps` | للقراءة فقط؛ `PUT /hr/onboarding-steps` و`/employees/onboarding-tasks` بلا واجهة |
| P-08 | `/hr/organization` | `pages/hr/organization.tsx` | ناقص | `/settings/departments`, `/employees` | يجلب `/employees` بلا `limit` ⇒ سقف 20 صفًا |
| P-09 | `/hr/organization/structure` | `pages/hr/organization-structure.tsx` | ناقص | `/settings/departments`, `/employees?limit=200` | شجرة قراءة فقط، لا تحرير |
| P-10 | `/hr/transfers` | `pages/hr/transfers.tsx` | شغّال | `GET/POST /hr/transfers`, `PATCH /hr/transfers/:id/approve` | — |
| P-11 | `/hr/transfers/:id` | `pages/details/transfer-detail.tsx` | شغّال | `GET /hr/transfers/:id`, `PATCH .../approve` | زر «تعديل» يصل إلى `transfers-edit.tsx` المسجّل فعليًا |
| P-12 | `/hr/transfers/:id/edit` | `pages/create/hr/transfers-edit.tsx` | شغّال | `GET /hr/transfers/:id`, `PATCH /hr/transfers/:id` | — |
| P-13 | `/hr/expiring-documents` | `pages/hr/expiring-documents.tsx` | شغّال | `GET /hr/expiring-documents?days=` | للقراءة بالتصميم |
| P-14 | `/hr/official-letters` | `pages/hr/official-letters.tsx` | شغّال | `GET/POST /hr/official-letters`, `PATCH .../approve` | — |
| P-15 | `/hr/attendance` | `pages/hr/attendance.tsx` | شغّال | `GET /hr/attendance`, `/hr/attendance-stats`, `/export/excel/attendance` | — |
| P-16 | `/hr/attendance/create` | `pages/create/hr/attendance-create.tsx` | شغّال | `POST /hr/check-in`, `/hr/check-out` | — |
| P-17 | `/hr/attendance/:id` | `pages/details/attendance-detail.tsx` | شغّال | `GET /hr/attendance/:id` | زر «تعديل» يصل إلى `attendance-edit.tsx` المسجّل فعليًا |
| P-18 | `/hr/attendance/:id/edit` | `pages/create/hr/attendance-edit.tsx` | غير قابل للتحقق | `PATCH /hr/attendance/:id` | لا handler `PATCH /hr/attendance/:id` ظاهر في hr.ts — يحتاج تحقّق |
| P-19 | `/hr/attendance/reports` | `pages/hr/attendance-reports.tsx` | شغّال | `/hr/attendance-stats`, `/hr/monthly-attendance`, `/hr/deductions` | مسارٌ سليم — لم يَعُد مظلَّلًا (التظليل أُصلح) |
| P-20 | `/hr/attendance/field-tracking` | `pages/hr/field-tracking.tsx` | شغّال | `GET /hr/attendance` | لم يَعُد مظلَّلًا |
| P-21 | `/hr/attendance/qr-scanner` | `pages/hr/qr-scanner.tsx` | شغّال | `POST /hr/check-in`, `/hr/check-out` | لم يَعُد مظلَّلًا |
| P-22 | `/hr/shifts` | `pages/hr/shifts.tsx` | شغّال | `GET /hr/shifts`, `/hr/shift-assignments`, `PATCH/DELETE /hr/shifts/:id` | — |
| P-23 | `/hr/shifts/create` | `pages/create/hr/shifts-create.tsx` | ناقص | `POST /hr/shifts` | `gracePeriod` يُرسَل ولا عمود له في INSERT ⇒ يُهمَل |
| P-24 | `/hr/shifts/:id` | `pages/details/shift-detail.tsx` | ناقص | `GET /hr/shifts` (قائمة), `PATCH/DELETE /hr/shifts/:id` | لا endpoint `GET /shifts/:id` — بحث في العميل |
| P-25 | `/hr/shifts/management` | `pages/hr/shifts-management.tsx` | شغّال | `GET /hr/shifts`, `/hr/shift-assignments`, `/employees`, `POST /hr/shift-assignments` | — |
| P-26 | `/hr/overtime` | `pages/hr/overtime.tsx` | شغّال | `GET /hr/overtime`, `PATCH /hr/overtime/:id/{approve,reject}` | — |
| P-27 | `/hr/overtime/create` | `pages/create/hr/overtime-create.tsx` | شغّال | `POST /hr/overtime`, `GET /employees` | — |
| P-28 | `/hr/overtime/:id` | `pages/hr/overtime-detail.tsx` | شغّال | `GET /hr/overtime/:id`, `PATCH .../{approve,reject}` | — |
| P-29 | `/hr/excuse-requests` | `pages/hr/excuse-requests.tsx` | شغّال | `GET /hr/excuse-requests`, `PATCH .../:id/approve` | — |
| P-30 | `/hr/excuse-requests/create` | `pages/create/hr/excuse-create.tsx` | ناقص | `POST /hr/excuse-requests`, `GET /employees` | لا منتقي موظف ⇒ ذاتي فقط |
| P-31 | `/hr/excuse-requests/:id` | `pages/details/excuse-detail.tsx` | شغّال | `GET /hr/excuse-requests/:id`, `PATCH .../approve` | زر «تعديل» يصل إلى `excuse-edit.tsx` المسجّل |
| P-32 | `/hr/leaves` | `pages/hr/leaves.tsx` | شغّال | `GET /hr/leave-requests`, `/hr/leave-stats`, `.../:id/stages`, `PATCH .../:id/approve` | — |
| P-33 | `/hr/leaves/create` | `pages/create/hr/leaves-create.tsx` | شغّال | `POST /hr/leave-requests`, `/hr/leave-types`, `/hr/leave-balance`, `/employees` | قيم احتياطية مثبتة لـ `leaveTypeId` عند فراغ القائمة |
| P-34 | `/hr/leaves/:id` | `pages/details/leave-detail.tsx` | شغّال | `GET /hr/leaves/:id`, `PATCH .../:id/approve` | زر «تعديل» يصل إلى `leaves-edit.tsx` المسجّل |
| P-35 | `/hr/leaves/management` | `pages/hr/leave-management.tsx` | شغّال | `GET /hr/leave-requests?status=pending`, `/hr/leave-balance`, `/hr/leave-types`, `/hr/leave-stats`, `POST /hr/impact-preview/leave` | لم يَعُد مظلَّلًا |
| P-36 | `/hr/leaves/approval-chains` | `pages/hr/approval-chains.tsx` | ناقص | `GET /hr/approval-chains` | للقراءة فقط رغم وجود `POST/DELETE /hr/approval-chain-definitions` |
| P-37 | `/hr/public-holidays` | `pages/hr/public-holidays.tsx` | شغّال | `GET/POST/PATCH/DELETE /hr/public-holidays` | — |
| P-38 | `/hr/payroll` | `pages/hr/payroll.tsx` | شغّال | `GET /hr/payroll`, `/hr/payroll/:id/lines` | — |
| P-39 | `/hr/payroll/create` | `pages/create/hr/payroll-create.tsx` | شغّال | `POST /hr/payroll` | `scope/reference/notes` تُسقَط؛ يفحص قفل الفترة المالية |
| P-40 | `/hr/payroll/:id` | `pages/details/payroll-detail.tsx` | شغّال | `GET /hr/payroll/:id`, `PATCH .../:id/approve`, `PATCH /hr/payroll/:id` | مفردات الحالة صحيحة الآن؛ يربط الاعتماد والترحيل |
| P-41 | `/hr/payroll/salary-components` | `pages/hr/salary-components.tsx` | ناقص | `GET/POST /hr/salary-components` | إنشاء فقط؛ لا update/delete؛ KPI `status` مفقود من الـ API |
| P-42 | `/hr/loans` | `pages/hr/loans.tsx` | شغّال | `GET /hr/loans`, `PATCH /hr/loans/:id/{approve,reject}` | — |
| P-43 | `/hr/loans/create` | `pages/create/hr/loans-create.tsx` | شغّال | `POST /hr/loans`, `GET /employees` | — |
| P-44 | `/hr/loans/:id` | `pages/hr/loan-detail.tsx` | شغّال | `GET /hr/loans/:id`, `PATCH .../{approve,reject}` | — |
| P-45 | `/hr/gratuity` | `pages/hr/gratuity.tsx` | شغّال | `GET /hr/gratuity/:employeeId` | — |
| P-46 | `/hr/performance` | `pages/hr/performance.tsx` | شغّال | `GET /hr/performance` | — |
| P-47 | `/hr/performance/create` | `pages/create/hr/performance-create.tsx` | ناقص | `POST /hr/performance`, `/employees` | المرفقات لا تُرسَل؛ الدرجات تُحفَظ في `scores` JSON |
| P-48 | `/hr/performance/advanced` | `pages/hr/performance-advanced.tsx` | شغّال | `GET /hr/performance` | — |
| P-49 | `/hr/performance/:id` | `pages/details/performance-detail.tsx` | شغّال | `GET/PATCH/DELETE /hr/performance/:id` | لا يستدعي `/approve` الوهمي؛ يقود `PATCH /:id {status}` فعليًا |
| P-50 | `/hr/training` | `pages/hr/training.tsx` | شغّال | `GET /hr/training/{programs,enrollments,stats}`, `PATCH/DELETE` | — |
| P-51 | `/hr/training/create` | `pages/create/hr/training-create.tsx` | ناقص | `POST /hr/training/programs` | `objectives/targetAudience/maxParticipants` يقبلها schema لكن INSERT يُسقط `objectives/targetAudience` |
| P-52 | `/hr/training/:id` | `pages/hr/training-detail.tsx` | شغّال | `GET .../programs/:id`, `.../enrollments`, `PATCH .../{approve,reject}` | — |
| P-53 | `/hr/training/advanced` | `pages/hr/training-advanced.tsx` | شغّال | `GET .../{stats,programs,enrollments}` | — |
| P-54 | `/hr/evaluation-360` | `pages/hr/evaluation-360.tsx` | شغّال | `GET /hr/evaluation-cycles` | — |
| P-55 | `/hr/evaluation-360/create` | `pages/create/hr/evaluation-360-create.tsx` | ناقص | `POST /hr/evaluation-cycles`, `/employees` | احتمال عدم تطابق مفتاح الإبطال |
| P-56 | `/hr/evaluation-360/:id` | `pages/hr/evaluation-360-detail.tsx` | شغّال | `GET /hr/evaluation-cycles/:id` | `backPath` رابط ميت محتمل |
| P-57 | `/hr/evaluation-360/:id/peer` | `pages/hr/evaluation-360-peer.tsx` | شغّال | `POST .../:id/peer-evaluation` | — |
| P-58 | `/hr/evaluation-360/:id/upward` | `pages/hr/evaluation-360-upward.tsx` | شغّال | `POST .../:id/upward-review` | — |
| P-59 | `/hr/evaluation-360/history/:employeeId` | `pages/hr/evaluation-360-history.tsx` | شغّال | `GET /hr/employees/:id/evaluation-history` | لا رابط داخلي يصل إليها |
| P-60 | `/hr/development-plans` | `pages/hr/development-plans.tsx` | ناقص | — | ملف سطر واحد `export from "./idp"` ⇒ مسار مكرّر |
| P-61 | `/hr/idp` | `pages/hr/idp.tsx` | شغّال | `GET/POST/PATCH /hr/idp`, `/employees` | — |
| P-62 | `/hr/turnover-report` | `pages/hr/turnover-report.tsx` | شغّال | `GET /hr/turnover-report?year=` | لا تصدير ملفات |
| P-63 | `/hr/recruitment` | `pages/hr/recruitment.tsx` | شغّال | `GET/POST/PATCH/DELETE /hr/recruitment/{postings,applications}`, `/stats` | — |
| P-64 | `/hr/recruitment/create` | `pages/create/hr/recruitment-create.tsx` | ناقص | `POST .../postings` | حقول تُسقَط بصمت |
| P-65 | `/hr/recruitment/advanced` | `pages/hr/recruitment-advanced.tsx` | ناقص | `GET .../{stats,applications}` | لا رابط تنقّل — صفحة يتيمة |
| P-66 | `/hr/recruitment/applicants/create` | `pages/create/hr/applicants-create.tsx` | ناقص | `POST .../applications` | `source/experience` تُسقَط |
| P-67 | `/hr/recruitment/applications` | `pages/hr/application-list.tsx` | شغّال | `GET .../applications` | — |
| P-68 | `/hr/recruitment/jobs/:id` | `pages/hr/job-detail.tsx` | شغّال | `GET .../postings/:id`, `.../applications`, `POST .../{close,reopen}` | close/reopen يعملان بعد migration 183 |
| P-69 | `/hr/contracts` | `pages/hr/contracts.tsx` | شغّال | `GET /`, `POST /:id/{submit,approve,reject,sign-company,activate,terminate}` | — |
| P-70 | `/hr/contracts/create` | `pages/create/hr/contracts-create.tsx` | شغّال | `POST /hr/contracts` | — |
| P-71 | `/hr/contracts/:id` | `pages/details/hr-contract-detail.tsx` | شغّال | `GET /hr/contracts/:id`, `POST .../{submit,approve,reject,sign-company,sign-employee,activate,renew,terminate}` | دورة الحياة كاملة الآن — أُصلح C3 |
| P-72 | `/hr/contracts/:id/edit` | `pages/create/hr/contracts-edit.tsx` | شغّال | `GET /hr/contracts/:id`, `PATCH /hr/contracts/:id` | يحظر التعديل بعد المسودة (سليم) |
| P-73 | `/hr/violations` | `pages/hr/violations.tsx` | شغّال | `GET /hr/discipline/{memos,stats}` | يعرض مذكرات تأديب لا `employee_violations` |
| P-74 | `/hr/violations/create` | `pages/create/hr/violations-create.tsx` | شغّال | `POST /hr/violations` | قيم النوع تطابق `knownIncidentTypes` الآن — أُصلح C7 |
| P-75 | `/hr/violations/management` | `pages/hr/violations-management.tsx` | شغّال | `GET /hr/violations`, `/hr/violations-stats`, `PATCH /hr/violations/:id/approve` | زر «اعتماد» سليم؛ KPI «نشطة» يقرأ `stats.active` غير الموجود |
| P-76 | `/hr/violations/:id` | `pages/hr/violation-detail.tsx` | شغّال | `GET /hr/violations/:id`, `PATCH .../{approve,reject,return}` | — |
| P-77 | `/hr/violations/penalty-escalation` | `pages/hr/penalty-escalation.tsx` | مكسور | `GET /hr/violations` | يُصفّي بحالة `active` غير موجودة ⇒ صفحة فارغة دائمًا |
| P-78 | `/hr/violations/auto-detection` | `pages/hr/auto-detection.tsx` | شغّال | `GET/PUT .../auto-detection/settings`, `POST .../run`, `GET .../{log,summary}` | استعلام summary أُصلح |
| P-79 | `/hr/discipline/regulation` | `pages/hr/discipline-regulation.tsx` | شغّال | `GET/PATCH/POST/DELETE /hr/discipline/regulation`, `.../reseed` | — |
| P-80 | `/hr/discipline/memos` | `pages/hr/discipline-memos.tsx` | شغّال | — (إعادة توجيه إلى `/hr/violations?tab=memos`) | — |
| P-81 | `/hr/discipline/memos/:id` | `pages/hr/discipline-memo-detail.tsx` | شغّال | `GET .../memos/:id`, `POST .../{justify,manager-recommendation,gm-decision,cancel,appeal,appeal-decision,close}` | — |
| P-82 | `/hr/exit` | `pages/hr/exit-requests.tsx` | شغّال | `GET /hr/exit`, `PATCH /hr/exit/:id/approve` | — |
| P-83 | `/hr/exit/create` | `pages/create/hr/exit-create.tsx` | شغّال | `POST /hr/exit` | — |
| P-84 | `/hr/exit/:id` | `pages/hr/exit-detail.tsx` | شغّال | `GET /hr/exit/:id`, `PATCH .../{approve,complete}`, `PATCH /hr/exit/clearance/:id` | يربط complete/clearance؛ أسماء الحقول صحيحة — أُصلح C6 |
| P-85 | `/my-attendance` | `pages/my-attendance.tsx` | شغّال | `GET /hr/attendance` (ذاتي) | — |
| P-86 | `/my-leave-request` | `pages/my-leave-request.tsx` | شغّال | — (إعادة توجيه إلى `/hr/leaves/create`) | — |
| P-87 | `/my-payslip` | `pages/my-payslip.tsx` | شغّال | `GET /hr/payroll-summary` أو ما يماثله | — |
| P-88 | `/my-loans` | `pages/my-loans.tsx` | شغّال | `GET /hr/loans/my` | — |
| P-89 | `/my-overtime` | `pages/my-overtime.tsx` | شغّال | `GET /hr/overtime/my` | — |
| P-90 | `/my-performance` | `pages/my-performance.tsx` | شغّال | `GET /hr/performance` (ذاتي) | — |
| P-91 | `/my-documents` | `pages/my-documents.tsx` | شغّال | `GET /hr/employee-documents` | — |

> **التظليل (C1) أُصلح:** `hrRoutes.tsx:98-113` و`:167,176,181` ترتّب المسارات النصّية و`:id/edit` قبل `:id`، مع تعليقات صريحة تشير إلى إصلاح التظليل. الصفحات P-19/20/21/35/36 لم تَعُد ميتة.

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| payroll-detail (P-40) | اعتماد المسير | `pending_approval → completed` | `PATCH /hr/payroll/:id/approve` | شغّال | — |
| payroll-detail (P-40) | ترحيل المسير محاسبيًا | `completed → posted` + قيد GL | `PATCH /hr/payroll/:id {status:"posted"}` | شغّال (بتحفّظ) | conflict |
| payroll-create (P-39) | تشغيل المسير | إنشاء `payroll_runs` + قيد GL | `POST /hr/payroll` | شغّال | — |
| hr-contract-detail (P-71) | تقديم/اعتماد/رفض/توقيع شركة/توقيع موظف/تفعيل/تجديد/إنهاء | دورة حياة العقد كاملة | `POST /hr/contracts/:id/<action>` | شغّال | — |
| performance-detail (P-49) | اعتماد التقييم (إكمال) | `pending/in_progress → completed` | `PATCH /hr/performance/:id {status}` | شغّال | — |
| performance-detail (P-49) | إقرار الموظف بالاطلاع | `completed → acknowledged` | `PATCH /hr/performance/:id {status}` | شغّال | — |
| violations-management (P-75) | اعتماد | `... → approved` | `PATCH /hr/violations/:id/approve` | شغّال | — |
| violation-detail (P-76) | اعتماد/رفض/إرجاع | تحويل حالة عبر `applyTransition` | `PATCH /hr/violations/:id/{approve,reject,return}` | شغّال (بتحفّظ) | conflict |
| exit-detail (P-84) | اعتماد الطلب | `pending → approved` | `PATCH /hr/exit/:id/approve` | شغّال | — |
| exit-detail (P-84) | إخلاء بند (تم/مرفوض) | تحديث `hr_exit_clearance` | `PATCH /hr/exit/clearance/:id` | شغّال | — |
| exit-detail (P-84) | إتمام نهاية الخدمة | `approved → completed` + GL + تعطيل التعيين | `PATCH /hr/exit/:id/complete` | شغّال | — |
| transfer-detail (P-11) | اعتماد/إرجاع/رفض | تحويل حالة + `approval_actions` | `PATCH /hr/transfers/:id/approve` | شغّال | — |
| transfers-edit (P-12) | حفظ التعديلات | `returned → pending` (إعادة تقديم) | `PATCH /hr/transfers/:id` | شغّال | — |
| recruitment (P-63) | تغيير حالة طلب توظيف (`hired`...) | نقل المرشح إلى موظف | `PATCH /hr/recruitment/applications/:id` | مكسور | dead |
| job-detail (P-68) | إغلاق/إعادة فتح إعلان | `job_postings` lifecycle | `POST /hr/recruitment/postings/:id/{close,reopen}` | شغّال | — |
| salary-components (P-41) | إضافة بند راتب | `POST` بند جديد | `POST /hr/salary-components` | شغّال | — |
| salary-components (P-41) | (تعديل/حذف بند) | لا وجود لزر | — | مكسور | dead |
| penalty-escalation (P-77) | عرض سُلّم التصعيد | فلترة المخالفات النشطة | `GET /hr/violations` | مكسور | dead |
| training-create (P-51) | حفظ البرنامج (الأهداف/الجمهور) | INSERT كامل الحقول | `POST /hr/training/programs` | ناقص | mismatch |
| shifts-create (P-23) | حفظ الوردية (فترة السماح) | INSERT يشمل `gracePeriod` | `POST /hr/shifts` | ناقص | mismatch |
| onboarding-review (P-07) | تعليم خطوة onboarding | `PUT /hr/onboarding-steps` | — | مكسور | dead |
| approval-chains (P-36) | إنشاء/حذف سلسلة اعتماد | `POST/DELETE /hr/approval-chain-definitions` | — | مكسور | dead |
| attendance-edit (P-18) | حفظ تعديل الحضور | `PATCH /hr/attendance/:id` | غير مؤكد | dead |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/employees` | GET | employees.ts:195 | scope filters | P-02,P-06,P-08 | employees | شغّال | — |
| `/employees` | POST | employees.ts:265 | createEmployeeSchema | P-04 | employees | شغّال | — |
| `/employees/:id` | GET/PATCH/DELETE | employees.ts:823/936/1245 | updateEmployeeSchema | P-03 | employees | شغّال | — |
| `/employees/onboarding-tasks` | GET/PATCH | employees.ts:712/742 | — | لا واجهة | employee_onboarding | شغّال | dead (API بلا UI) |
| `/employees/job-titles` | GET | employees.ts:778 | — | نماذج التعيين | — | شغّال | — |
| `/hr/check-in` `/hr/check-out` | POST | hr.ts:423/790 | checkInSchema | P-16,P-21 | attendance | شغّال | — |
| `/hr/attendance` | GET | hr.ts (قائمة) | — | P-15,P-19,P-20,P-85 | attendance | شغّال | — |
| `/hr/attendance/:id` | GET | hr.ts | — | P-17 | attendance | شغّال | — |
| `/hr/attendance/:id` | PATCH | غير موجود ظاهرًا | — | P-18 | attendance | غير قابل للتحقق | dead |
| `/hr/leave-requests` | POST | hr.ts:1321 | leaveRequestSchema | P-33 | hr_leave_requests | شغّال | — |
| `/hr/leave-requests/:id/approve` | PATCH | hr.ts:1723 | — | P-32,P-34 | hr_leave_requests | شغّال | — |
| `/hr/leave-requests/:id/escalate` | PATCH | hr.ts:2197 | — | لا واجهة | hr_leave_requests | شغّال | dead (API بلا UI) |
| `/hr/leave-requests/:id` | PATCH | hr.ts:3987 | — | leaves-edit (P-34) | hr_leave_requests | شغّال | — |
| `/hr/leave-requests/:id/cancel` | POST | hr.ts:4028 | — | لا واجهة | hr_leave_requests | شغّال | dead (API بلا UI) |
| `/hr/leave-requests/:id` | DELETE | hr.ts:4119 | — | لا واجهة | hr_leave_requests | شغّال | dead (API بلا UI) |
| `/hr/payroll` | GET | hr.ts:2369 | — | P-38 | payroll_runs | شغّال | — |
| `/hr/payroll/:id` | GET | hr.ts:2394 | — | P-40 | payroll_runs | شغّال | — |
| `/hr/payroll/:id/lines` | GET | hr.ts:2436 | — | P-38 | payroll_lines | شغّال | — |
| `/hr/payroll` | POST | hr.ts:2468 | payrollRunSchema | P-39 | payroll_runs | شغّال | — |
| `/hr/payroll/:id/approve` | PATCH | hr.ts:2886 | — | P-40 | payroll_runs | شغّال | — |
| `/hr/payroll/:id` | PATCH | hr.ts:4262 | payrollPatchSchema | P-40 | payroll_runs | شغّال | conflict (status بلا enum) |
| `/hr/payroll/:id` | DELETE | hr.ts:4315 | — | لا واجهة | payroll_runs | شغّال | dead (API بلا UI) |
| `/hr/violations` | GET | hr.ts:2918 | — | P-75,P-77 | employee_violations | شغّال | — |
| `/hr/violations/:id` | GET | hr.ts:2933 | — | P-76 | employee_violations | شغّال | — |
| `/hr/violations` | POST | hr.ts:2964 | violationSchema | P-74 | employee_violations | شغّال | — |
| `/hr/violations/:id` | PATCH | hr.ts:3731 | violationPatchSchema | (تحرير) | employee_violations | شغّال | — |
| `/hr/violations/:id/{approve,reject,return}` | PATCH | hr.ts:3805-3807 | violationApprovalSchema | P-75,P-76 | employee_violations | شغّال | conflict (لا `fromStates`) |
| `/hr/violations/:id` | DELETE | hr.ts:4458 | — | لا واجهة | employee_violations | شغّال | dead (API بلا UI) |
| `/hr/violations-stats` | GET | hr.ts:3714 | — | P-01,P-75 | employee_violations | شغّال | mismatch (`active` غير مُرجَع) |
| `/hr/shifts` | GET/POST | hr.ts:3096/3104 | shiftSchema | P-22,P-23,P-25 | shifts | شغّال | mismatch (`gracePeriod`) |
| `/hr/shifts/:id` | PATCH/DELETE | hr.ts | shiftPatchSchema | P-22,P-24 | shifts | شغّال | — |
| `/hr/performance` | GET/POST | hr.ts:3160/3193 | performanceSchema | P-46,P-47 | performance_reviews | شغّال | — |
| `/hr/performance/:id` | GET/PATCH/DELETE | hr.ts:3174/4393/4434 | — | P-49 | performance_reviews | شغّال | — |
| `/hr/salary-components` | GET/POST | hr.ts:3244/3254 | — | P-41 | salary_components | شغّال | dead (لا update/delete) |
| `/hr/approval-chain-definitions` | GET/POST/DELETE | hr.ts:3301/3318/3358 | — | لا واجهة | approval_chain_definitions | شغّال | dead (API بلا UI) |
| `/hr/attendance-policy` | GET/PUT | hr.ts:3529/3546 | — | لا واجهة | attendance_policy | شغّال | dead (API بلا UI) |
| `/hr/official-letters` | GET/POST/PATCH/DELETE | hr.ts:3864... | — | P-14 | official_letters | شغّال | — |
| `/hr/onboarding-steps` | GET/PUT | hr.ts:4744/4759 | — | P-07 (GET فقط) | — | شغّال | dead (PUT بلا UI) |
| `/hr/transfers` | GET/POST | hr.ts:5933/6122 | transferSchema | P-10 | employee_transfers | شغّال | — |
| `/hr/transfers/:id` | PATCH | hr.ts:6060+ | transferPatchSchema | P-12 | employee_transfers | شغّال | — |
| `/hr/transfers/:id/approve` | PATCH | hr.ts:6217 | transferApprovalSchema | P-10,P-11 | employee_transfers | شغّال | — |
| `/hr/transfers/:id/receive` | PATCH | hr.ts:6170 | — | P-11 | employee_transfers | شغّال | — |
| `/hr/idp` | GET/POST/PATCH/DELETE | hr.ts:6298... | — | P-61 | employee_development_plans | شغّال | — |
| `/hr/accruals/preview` `/accruals/monthly` | GET/POST | hr.ts:6606 | — | لا واجهة | — | شغّال | dead (API بلا UI) |
| `/hr/delegations` | GET/POST | hr.ts:5739/5758 | — | لا واجهة | hr_delegations | شغّال | dead (API بلا UI) |
| `/hr/turnover-report` | GET | hr.ts:6677 | — | P-62 | (تجميع) | شغّال | — |
| `/hr/expiring-documents` | GET | hr.ts:6768 | — | P-13 | (تجميع) | شغّال | — |
| `/hr/company-documents` | GET/POST | hr.ts:6928/6950 | — | لا واجهة | hr_company_documents | شغّال | dead (API بلا UI) |
| `/hr/excuse-requests` | GET/POST | hr.ts:7056/7099 | — | P-29,P-30 | hr_excuse_requests | شغّال | — |
| `/hr/excuse-requests/:id/approve` | PATCH | hr.ts:7140 | — | P-29,P-31 | hr_excuse_requests | شغّال | — |
| `/hr/evaluation-cycles` | GET/POST | hr.ts:5056/5112 | — | P-54,P-55 | evaluation_cycles | شغّال | — |
| `/hr/evaluation-cycles/:id/{peer-evaluation,upward-review}` | POST | hr.ts:5366/5454 | — | P-57,P-58 | evaluation_* | شغّال | — |
| `/hr/contracts` | GET/POST | hr-contracts.ts:53/117 | createContractSchema | P-69,P-70 | employee_contracts | شغّال | — |
| `/hr/contracts/:id` | GET/PATCH | hr-contracts.ts:91/183 | updateContractSchema | P-71,P-72 | employee_contracts | شغّال | — |
| `/hr/contracts/:id/{submit,approve,reject,sign-company,sign-employee,activate,terminate,renew}` | POST | hr-contracts.ts:245-563 | — | P-71 | employee_contracts | شغّال | scaling (لا lifecycleEngine — `fromStates` يدوية) |
| `/hr/discipline/regulation` | GET/POST/PATCH/DELETE | hr-discipline.ts:246... | — | P-79 | hr_discipline_regulation | شغّال | — |
| `/hr/discipline/memos` | GET/POST | hr-discipline.ts:566/621 | — | P-73,P-81 | hr_inquiry_memos | شغّال | — |
| `/hr/discipline/memos/:id/{justify,manager-recommendation,gm-decision,cancel,appeal,appeal-decision,close}` | POST | hr-discipline.ts:736-1142 | — | P-81 | hr_inquiry_memos | شغّال | — |
| `/hr/discipline/auto-detection/{settings,run,log,summary}` | GET/PUT/POST | hr-discipline.ts:1290-1378 | — | P-78 | auto_detection_log | شغّال | — |
| `/hr/discipline/penalty-preview` | POST | hr-discipline.ts:1183 | — | لا واجهة مباشرة | — | شغّال | dead (API بلا UI) |
| `/hr/exit` | GET | hr-exit.ts:173 | — | P-82 | hr_exit_requests | شغّال | — |
| `/hr/exit/:id` | GET | hr-exit.ts:219 | — | P-84 | hr_exit_requests | شغّال | — |
| `/hr/exit` | POST | hr-exit.ts:252 | createExitSchema | P-83 | hr_exit_requests | شغّال | scaling (CREATE TABLE وقت التشغيل) |
| `/hr/exit/:id/approve` | PATCH | hr-exit.ts:407 | approvalDecisionSchema | P-82,P-84 | hr_exit_requests | شغّال | — |
| `/hr/exit/clearance/:id` | PATCH | hr-exit.ts:519 | updateClearanceSchema | P-84 | hr_exit_clearance | شغّال | — |
| `/hr/exit/:id/complete` | PATCH | hr-exit.ts:567 | — | P-84 | hr_exit_requests | شغّال | — |
| `/hr/loans` | GET/POST | hr-loans.ts:170/293 | createLoanSchema | P-42,P-43 | hr_employee_loans | شغّال | scaling (CREATE TABLE وقت التشغيل) |
| `/hr/loans/my` | GET | hr-loans.ts:239 | — | P-88 | hr_employee_loans | شغّال | — |
| `/hr/loans/:id/{approve,reject}` | PATCH | hr-loans.ts:410/563 | approvalDecisionSchema | P-44 | hr_employee_loans | شغّال | — |
| `/hr/overtime` | GET/POST | hr-overtime.ts:134/263 | createOvertimeSchema | P-26,P-27 | hr_overtime_requests | شغّال | — |
| `/hr/overtime/my` | GET | hr-overtime.ts:182 | — | P-89 | hr_overtime_requests | شغّال | — |
| `/hr/overtime/:id/{approve,reject}` | PATCH | hr-overtime.ts:374/492 | approvalDecisionSchema | P-26,P-28 | hr_overtime_requests | شغّال | — |
| `/hr/recruitment/postings` | GET/POST/PATCH/DELETE | recruitment.ts:100-267 | — | P-63,P-64 | job_postings | شغّال | — |
| `/hr/recruitment/postings/:id/{close,reopen}` | POST | recruitment.ts:185/234 | closePostingSchema | P-68 | job_postings | شغّال | — |
| `/hr/recruitment/applications` | GET/POST/DELETE | recruitment.ts:286/298/378 | — | P-63,P-66,P-67 | job_applications | شغّال | — |
| `/hr/recruitment/applications/:id` | PATCH | recruitment.ts:342 | updateApplicationSchema | P-63 | job_applications | مكسور وظيفيًا | dead (لا جسر «توظيف→موظف») |
| `/hr/training/programs` | GET/POST/PATCH/DELETE | training.ts:116-272 | createProgramSchema | P-50,P-51,P-52 | training_programs | شغّال | mismatch (حقول مُسقَطة) |
| `/hr/training/programs/:id/{approve,reject}` | PATCH | training.ts:209/239 | approveSchema | P-52 | training_programs | شغّال | — |
| `/hr/training/enrollments` | GET/POST/PATCH/DELETE | training.ts:289-389 | createEnrollmentSchema | P-50 (قائمة) | training_enrollments | شغّال | dead (لا واجهة «تسجيل موظف») |

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| shifts-create P-23 | `gracePeriod: number` ضمن `POST /hr/shifts` | `shiftSchema` يقبل `gracePeriod` (hr.ts:98) لكن INSERT (hr.ts:3140-3145) لا يُدرج العمود | الحقل يُتحقَّق منه ثم يُهمَل بصمت؛ «فترة السماح» في الواجهة بلا أثر | إضافة عمود `gracePeriod` إلى INSERT وإلى `shifts` (migration)، أو إزالة الحقل من الواجهة |
| training-create P-51 | `objectives`, `targetAudience` | `createProgramSchema` يقبلهما (training.ts:78-79) لكن INSERT (training.ts:142) يُدرج 16 عمودًا لا تشمل `objectives/targetAudience` | حقلان من نموذج الإنشاء يُسقَطان دون رسالة | إضافة العمودين إلى INSERT و`training_programs`، أو حذف الحقلين |
| violations-management P-75 | يقرأ `stats.active` لبطاقة «نشطة» | `/hr/violations-stats` (hr.ts:3714-3728) يُرجِع `total/thisMonth/totalDeductions` فقط | مؤشر «نشطة» يعرض 0 دائمًا (قيمة احتياطية) | إضافة `active` إلى استجابة `/violations-stats` أو إزالة البطاقة |
| performance-create P-47 | مرفقات + كفاءات مهيكلة | `performanceSchema` يقبل `scores/categories` (تُحفَظ JSON) لكن لا حقل مرفقات | المرفقات لا تصل الخادم | إزالة عنصر المرفقات أو إضافة `attachments` للـ schema وعمود تخزين |
| payroll-create P-39 | `scope`, `reference`, `notes` | `payrollRunSchema` يقبل `month` فقط | حقول الواجهة تُسقَط | إزالتها من الواجهة (الكيان «تشغيل» لا يحملها) |
| recruitment-create/applicants-create P-64/66 | `vacancies/benefits/skills/source/experience` | schema الإعلان/الطلب لا يحوي هذه الحقول | فقدان بيانات صامت | مواءمة الـ schema والـ INSERT مع حقول الواجهة |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| ترحيل قيد الرواتب إلى GL | `postPayrollRunGL` عند `POST /hr/payroll` (hr.ts:2826) — يُرحّل وقت التشغيل | `postPayrollPostGL` عند `PATCH /hr/payroll/:id {posted}` (hr.ts:4300) — يُرحّل وقت «الترحيل» | conflict | كلا الاستدعاءين يصيبان دفتر الأستاذ لنفس المسيرة؛ يجب أن يُرحّل أحدهما فقط (يُرجَّح حصر الترحيل في `posted`) ويعتمد كلٌّ على `sourceKey` idempotency. يحتاج تحقّق Runtime |
| إدارة المخالفات | `/hr/violations` (P-73) يعرض `hr_inquiry_memos` | `/hr/violations/management` (P-75) و`penalty-escalation` (P-77) يعرضان `employee_violations` | duplicate | كيانان مختلفان خلف مسارات متشابهة الاسم؛ توحيد التسمية: «المذكرات» مقابل «سجل المخالفات» |
| صفحة خطط التطوير | `/hr/development-plans` (P-60) `export { default } from "./idp"` | `/hr/idp` (P-61) نفس المكوّن | duplicate | إزالة مسار `development-plans` أو جعله إعادة توجيه صريحة |
| حالة دورة حياة المخالفة | DB default `employee_violations.status = 'pending_inquiry'` (schema_pre.sql) | `applyTransition` في `violationApprovalAction` ينتقل إلى `approved/rejected/returned` بلا `fromStates`؛ وصفحات `penalty-escalation`/KPI تفترض `active` | conflict | المخالفة ليست مُسجَّلة في `STATE_MACHINES` (lifecycleEngine يسجّل `hr_leave_requests/hr_exit_requests/hr_inquiry_memos` فقط). توحيد قاموس الحالة وتسجيل آلة حالة لـ `employee_violations` مع `fromStates` صريحة |
| صرف سلف HR مقابل `loan_accounts` | تشغيل الراتب يجمع من `loan_accounts` و`hr_loan_installments` معًا (hr.ts:2616-2630) | جدولان متوازيان لنفس مفهوم السلفة | duplicate | توحيد مصدر السلف في جدول واحد، أو توثيق أن `loan_accounts` إرثي |

---

## يحتاج Runtime Verification

1. **ازدواج ترحيل قيد الرواتب (HR-001):** هل `postPayrollRunGL` (عند التشغيل) و`postPayrollPostGL` (عند `posted`) يصيبان دفتر الأستاذ لنفس المسيرة؟ خطر ترحيل مزدوج إن لم يمنع `sourceKey`.
2. **`PATCH /hr/attendance/:id`:** صفحة `attendance-edit` (P-18) تستدعي تحديث الحضور — لم أعثر على handler `PATCH /hr/attendance/:id` في hr.ts؛ يحتاج تأكيد وجوده/غيابه.
3. **مطابقة فترة الإضافي بالراتب:** تشغيل الراتب يجمع `hr_overtime_requests` بحالة `approved` عبر `TO_CHAR("overtimeDate",'YYYY-MM')` ويأخذ الأعلى مع حساب الحضور (`Math.max`) — يحتاج تأكيد عدم احتساب مزدوج.
4. **استهلاك `attendance_deductions`:** قرار المدير العام (gm-decision) يُدرج صفوفًا بحالة `pending_payroll`؛ تشغيل الراتب يقرأ `type IN ('late','early_departure','penalty','violation')` — تأكيد تطابق قيمة `type`.
5. **تسلسل `contract_number_seq`:** مُستخدَم في hr-contracts.ts:142,575؛ غيابه ⇒ 500 عند إنشاء/تجديد العقد.
6. **`CREATE TABLE IF NOT EXISTS` وقت التشغيل** لـ `hr_employee_loans/hr_loan_installments/hr_exit_requests/hr_exit_clearance` — تأكيد عدم تعارض مع migrations وعدم وجود سباق إنشاء تحت التزامن.
7. **بوابات الأدوار الصلبة:** `PAYROLL_ROLES`/`LOAN_APPROVAL_ROLES`/`HR_ROLES` مقابل صلاحيات `hr:approve/hr:update` على `GuardedButton` — قد يرى المستخدم زرًا مُفعَّلًا ثم يحصل على 403.
8. **`/hr/employees-status`:** يحسب `computeEmployeeOperationalStatus` لكل موظف — قلق N+1 تحت عدد كبير.
9. **`PATCH /hr/payroll/:id {status:"posted"}`:** يسمح بالترحيل من أي حالة سابقة (يفحص `!== 'posted'` فقط لا `=== 'completed'`) — تأكيد أثر ترحيل مسيرة لم تُعتمَد.
10. **مفتاح إبطال `evaluation-360-create`:** تأكيد تطابق queryKey بين الإنشاء والقائمة.

---

## العيوب المُرقّمة (Defect Register)

- **HR-001** · conflict · impairing · structural · ترحيل قيد الرواتب يحدث مرتين — `postPayrollRunGL` وقت التشغيل و`postPayrollPostGL` وقت `posted` لنفس المسيرة · `hr.ts:2826` و`hr.ts:4300` · يعتمد على `sourceKey` idempotency — يحتاج تحقّق Runtime.
- **HR-002** · conflict · impairing · structural · `PATCH /hr/payroll/:id` يقبل `status` كنص حر بلا enum ويسمح بالترحيل `posted` من أي حالة سابقة (يفحص `!== 'posted'` فقط) · `hr.ts:302-304` (`payrollPatchSchema`)، `hr.ts:4277` · لا تبعية.
- **HR-003** · conflict · impairing · structural · `violationApprovalAction` ينقل `employee_violations` إلى `approved/rejected/returned` عبر `applyTransition` بلا `fromStates` ودون آلة حالة مُسجَّلة ⇒ لا تحقّق من الحالة المبدئية إطلاقًا · `hr.ts:3785-3797`، `lifecycleEngine.ts:171-199` · يرتبط بـ HR-004.
- **HR-004** · dead · impairing · narrow · صفحة `penalty-escalation` تُصفّي `v.status === "active"` بينما `employee_violations` لا يحمل الحالة `active` إطلاقًا (الافتراضي `pending_inquiry`) ⇒ الصفحة فارغة دائمًا · `penalty-escalation.tsx:18`، `schema_pre.sql` (`status DEFAULT 'pending_inquiry'`) · لا تبعية.
- **HR-005** · dead · blocking · structural · جسر «التوظيف → موظف» غير موجود — `PATCH /hr/recruitment/applications/:id` يحدّث عمود `status` فقط (حتى `hired`) دون `INSERT INTO employees` ولا إنشاء تعيين/عقد · `recruitment.ts:342-375` · يرتبط بـ employees route.
- **HR-006** · dead · cosmetic · narrow · `salary-components` صفحة إنشاء فقط — لا أزرار/استدعاءات `PATCH`/`DELETE` رغم وجود البيانات؛ البنود لا تُحرَّر أو تُعطَّل · `salary-components.tsx:47-51` · لا تبعية.
- **HR-007** · mismatch · cosmetic · narrow · `gracePeriod` يُرسَل من `shifts-create` ويقبله `shiftSchema` لكن INSERT لا يُدرجه ⇒ «فترة السماح» بلا أثر · `shifts-create.tsx:96`، `hr.ts:98`، `hr.ts:3140-3145` · لا تبعية.
- **HR-008** · mismatch · cosmetic · narrow · `objectives` و`targetAudience` يقبلهما `createProgramSchema` لكن INSERT في training يُسقطهما · `training.ts:78-79` و`training.ts:142` · لا تبعية.
- **HR-009** · mismatch · cosmetic · narrow · بطاقة KPI «نشطة» في `violations-management` تقرأ `stats.active` غير المُرجَع من `/hr/violations-stats` ⇒ صفر دائمًا · `violations-management.tsx:106`، `hr.ts:3714-3728` · لا تبعية.
- **HR-010** · dead · impairing · structural · سطح API كبير بلا أي واجهة: `GET/PUT /hr/attendance-policy`، `POST /hr/accruals/monthly` + `GET /accruals/preview`، `GET/POST /hr/delegations`، `GET/POST/DELETE /hr/approval-chain-definitions`، `PUT /hr/onboarding-steps`، `GET/PATCH /employees/onboarding-tasks`، `POST /hr/training/enrollments`، `GET /hr/discipline/penalty-preview` · hr.ts:3318/3529/4759/6606/5758، training.ts:301 · قرار منتج.
- **HR-011** · dead · cosmetic · narrow · endpoints بلا زر: `DELETE /hr/payroll/:id`، `DELETE /hr/violations/:id`، `POST /hr/leave-requests/:id/cancel`، `DELETE /hr/leave-requests/:id`، `PATCH /hr/leave-requests/:id/escalate` · hr.ts:4315/4458/4028/4119/2197 · لا تبعية.
- **HR-012** · duplicate · cosmetic · narrow · `/hr/development-plans` (`pages/hr/development-plans.tsx`) مجرّد `export from "./idp"` ⇒ مساران لنفس صفحة IDP · `development-plans.tsx`، `hrRoutes.tsx:169-170` · لا تبعية.
- **HR-013** · duplicate · impairing · structural · `/hr/violations` يعرض `hr_inquiry_memos` بينما `/hr/violations/management` و`penalty-escalation` يعرضان `employee_violations` — كيانان مختلفان خلف مسارات متشابهة · `violations.tsx:68`، `violations-management.tsx:19` · يرتبط بـ HR-003/HR-004.
- **HR-014** · scaling · impairing · structural · جداول `hr_employee_loans/hr_loan_installments/hr_exit_requests/hr_exit_clearance` تُنشَأ بـ `CREATE TABLE IF NOT EXISTS` في كل طلب (`ensureLoanTables`/`ensureExitTables`) بدل migration — DDL متكرر وخطر سباق تحت التزامن ولا تتبّع schema · `hr-loans.ts:96-139`، `hr-exit.ts:84-131` · لا تبعية.
- **HR-015** · scaling · impairing · structural · لا آلة حالة (`lifecycleEngine`) مُسجَّلة لـ `employee_contracts/employee_transfers/payroll_runs/hr_employee_loans/hr_overtime_requests/job_postings` — تعتمد على قوائم `fromStates` يدوية مبعثرة في المسارات؛ تعليق migration 183 «9 جداول دورة حياة» تطلّعيٌّ جزئيًا (5 منها بلا graph مُسجَّل) · `lifecycleEngine.ts:470/482/493` · يرتبط بـ HR-003.
- **HR-016** · duplicate · cosmetic · structural · مفهوم السلفة مُمثَّل في جدولين متوازيين `loan_accounts` و`hr_employee_loans` وتشغيل الراتب يجمعهما معًا · `hr.ts:2616-2660` · يحتاج توثيق أيهما إرثي.

---

## خلاف مع تقارير سابقة

> هذا التدقيق مستقل ويُخالف `FUNCTIONAL_HR_VERIFICATION.md` (2026-05-20) و`HR_CERTIFICATION.md` (2026-05-19) في نقاط جوهرية، بالدليل:

1. **C1 (تظليل المسارات — 5 صفحات ميتة): التقرير السابق ❌ مكسور — الكود يُخالف.** `hrRoutes.tsx:98-103,109-113,167,176,181` يُسجّل المسارات النصّية و`:id/edit` **قبل** `:id`، مع تعليقات صريحة تشير إلى إصلاح التظليل. الصفحات `attendance-reports`, `field-tracking`, `qr-scanner`, `leave-management`, `approval-chains` قابلة للوصول. **الثغرة C1 مُصلَحة.**

2. **C8 (أزرار «تعديل» ميتة عبر 6 صفحات): التقرير السابق ❌ مكسور — الكود يُخالف.** صفحات التحرير الخمس (`AttendanceEdit, LeavesEdit, ExcuseEdit, ContractsEdit, TransfersEdit`) **مسجَّلة فعليًا** في `hrRoutes.tsx:85-89,105,112,167,176,181`، وملف `contracts-edit.tsx` يقود `PATCH /hr/contracts/:id` ويحظر التعديل بعد المسودة. **الثغرة C8 مُصلَحة.**

3. **C2 (دورة الرواتب لا تكتمل): التقرير السابق ❌ مكسور — الكود يُخالف.** `payroll-detail.tsx:31-46` يستعمل المفردات الصحيحة (`pending_approval/completed/posted`)، وبطاقة الإجراءات تظهر عند `pending_approval` للاعتماد وعند `completed` للترحيل (`runPayrollAction`)، ويستدعي `PATCH /hr/payroll/:id {status:"posted"}` فعليًا. **C2 مُصلَحة وظيفيًا** (يبقى عيب HR-002 حول غياب enum/state-guard في الخادم).

4. **C3 (دورة العقود غير قابلة للوصول بعد `approved`): التقرير السابق ❌ مكسور — الكود يُخالف.** `hr-contract-detail.tsx:290-353` (`ContractLifecycleActions`) يعرض أزرار `submit/approve/reject/sign-company/sign-employee/activate/renew/terminate` كاملة، كلها عبر `POST /hr/contracts/:id/<action>` (`runAction`، السطر 67). **C3 مُصلَحة.**

5. **C4 (اعتماد تقييم الأداء مكسور — endpoint غير موجود): التقرير السابق ❌ مكسور — الكود يُخالف.** `performance-detail.tsx:96,361-395` لا يستدعي `/approve` الوهمي إطلاقًا؛ يستعمل `apiPatch('/hr/performance/:id',{status})` الموجود فعليًا (hr.ts:4393)، مع تعليق صريح بأن `performance_reviews` لا يملك سير اعتماد. **C4 مُصلَحة.**

6. **C6 (إخلاء الطرف لا يُتمّ من الواجهة): التقرير السابق ❌ مكسور — الكود يُخالف.** `exit-detail.tsx:71-83,245,297` يربط `PATCH /hr/exit/clearance/:id` و`PATCH /hr/exit/:id/complete` بأزرار حقيقية، ويقرأ أسماء الحقول الصحيحة `gratuityAmount/leaveCompensation/loanDeductions/netSettlement`. **C6 مُصلَحة** (بما فيها M10).

7. **C7 (إنشاء/«حل» المخالفة مكسوران): التقرير السابق ❌ مكسور — الكود يُخالف.** `violations-create.tsx:29-60` يستعمل قيم النوع الإنجليزية (`late/early_leave/absence/behavior/organization/custom`) المطابقة لـ `knownIncidentTypes` (hr.ts:3010-3013)، و`violations-management.tsx:27-89` يستدعي `/hr/violations/:id/approve` ويُبدّل شرط `active` بـ `!["approved","rejected"]`. **C7 مُصلَحة** (يبقى عيب HR-004 المتعلق بصفحة `penalty-escalation` المنفصلة).

8. **M8 (auto-detection/summary SQL خاطئ): التقرير السابق ⚠️ — الكود يُخالف.** `hr-discipline.ts:1378-1434` أُعيد كتابته ليقرأ `detectedAt` و`ruleType` الموجودين فعلًا في `auto_detection_log` (schema_pre.sql:3041-3046)، مع تعليقات صريحة بإصلاح M8. **M8 مُصلَحة.**

9. **خلاف على PR #758 و#765 (تأكيد إيجابي):** كلا الـ PR موجودان فعلًا في الكود الحالي. migration 183 يُضيف `updatedAt` إلى `employee_transfers` و`job_postings`؛ لا تبقّى أي `skipUpdatedAt` في hr.ts (فقط تعريف الخيار في `lifecycleEngine.ts`)؛ recruitment close لا يضع `updatedAt` على `job_applications` (recruitment.ts:207-213)؛ `transferApprovalSchema.approved` افتراضيّ `true` (hr.ts:403)؛ INSERTs إلى `approval_actions` موجودة في فروع returned/approved/rejected للنقل. **كلا الـ PR ينفّذان ما يدّعيانه.** ملاحظة تحفّظ: التعليق في migration 183 يصف «9 جداول دورة حياة HR» بينما 5 منها (`employee_violations/employee_transfers/job_postings/training_programs/hr_excuse_requests`) ليست مُسجَّلة في `STATE_MACHINES` لمحرّك `lifecycleEngine` — تحمل العمود لكن دون graph (انظر HR-015).

10. **`HR_CERTIFICATION.md` السطر 160-162 (`PATCH /violations/:id/{approve,reject,return}` يرسب RBAC/Audit/Events):** التقرير يصنّفها ❌ FAIL — والكود يُخالف جزئيًا: المسارات الثلاثة مُغلَّفة بـ `authorize({feature:"hr.violations",action:"update"})` (hr.ts:3805-3807) و`violationApprovalAction` يُدرج `approval_actions` ويُحوّل عبر `applyTransition`. ما يصحّ هو غياب `fromStates` (عيب HR-003 المستقل)، لا غياب RBAC. أداة الشهادة الآلية أعطت تقييمًا أدقّ من تقرير التحقّق الوظيفي في هذه النقطة.
