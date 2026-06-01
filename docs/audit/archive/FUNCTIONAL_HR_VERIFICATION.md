# التحقق الوظيفي لمسار الموارد البشرية — Functional HR Verification

> **النوع:** تدقيق ثابت (Static code-trace) — لا تشغيل، لا تعديل كود.
> **التاريخ:** 2026-05-20
> **النطاق:** مسار HR التشغيلي الكامل فقط: `Page → API → handler → DB → lifecycle → audit/events → permissions → reports/exports`.
> **خارج النطاق (لم يُمَس):** Finance، #685 Scope Normalization، Deployment، Runtime Harness، Umrah.
> **المنهجية:** تتبّع 80 مسار/صفحة في `routes/hrRoutes.tsx` مقابل 9 ملفات API (`hr.ts`, `employees.ts`, `hr-contracts.ts`, `hr-discipline.ts`, `hr-exit.ts`, `hr-loans.ts`, `hr-overtime.ts`, `recruitment.ts`, `training.ts`) ومحرّكات HR.

---

## 0. الخلاصة التنفيذية

**الحكم العام:** الموارد البشرية في غيث هي **مسار تشغيلي حقيقي إلى حدٍّ كبير** — المحرّكات الخلفية (`hrEngine` لترحيل القيود، `disciplineEngine`، `autoViolationEngine`، `lifecycleEngine`، `hrHelpers` بحسابات نظام العمل السعودي) **حقيقية وموضوعية وليست هياكل فارغة**. الرواتب تحسب فعليًا (GOSI، خصومات، أقساط سلف، إضافي)؛ اعتماد الإجازة يحجز/يستهلك الرصيد ويكتب صفوف حضور؛ سير مذكرات التأديب آلة حالات حقيقية تُنشئ خصومات رواتب؛ إنشاء إخلاء الطرف يحسب مكافأة نهاية خدمة فعلية.

**لكنه ليس end-to-end نظيفًا.** المشكلة ليست في الواجهات الوهمية ولا في الـ APIs الفارغة — بل في **عيوب طبقة الواجهة والربط**: 5 صفحات غير قابلة للوصول إطلاقًا بسبب خطأ ترتيب مسارات بسطر واحد، و3 دورات حياة جوهرية (ترحيل الرواتب، تفعيل العقود، إتمام إخلاء الطرف) **لا يمكن قيادتها حتى النهاية من الواجهة** رغم أن الخلفية تدعمها. المحرّك حقيقي؛ بعض مفاتيح القيادة في قمرة القيادة مكسورة.

**الإحصاء (80 مسارًا):**

| الحكم | العدد | النسبة |
|---|---|---|
| ✅ شغّال | 54 | 67% |
| ⚠️ ناقص | 17 | 21% |
| ❌ مكسور | 9 | 11% |
| ❓ غير قابل للتحقق static-only | 0 | — |

**أبرز 8 ثغرات حرجة:** خطأ تظليل المسارات (5 صفحات ميتة) · دورة الرواتب لا تكتمل من الواجهة · دورة العقود غير قابلة للوصول بعد `approved` · اعتماد تقييم الأداء مكسور (endpoint غير موجود) · جسر «التوظيف → موظف» غير موجود · إخلاء الطرف لا يُتمّ من الواجهة · إنشاء المخالفة اليدوية مكسور (عدم تطابق الأنواع) · أزرار «تعديل» ميتة عبر 6 صفحات تفصيل.

---

## 1. الجدول route-by-route

الأعمدة: المسار · ملف الصفحة · endpoint(s) · الحكم · ملاحظة.
كل المسارات تحت `artifacts/ghayth-erp/src/`؛ كل الـ APIs تحت `artifacts/api-server/src/routes/`.

### 1.A الموظفون والهيكل التنظيمي

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr` | `pages/hr.tsx` | `/employees`, `/hr/leave-requests`, `/hr/payroll`, `/hr/attendance`, `/hr/loans`, `/hr/overtime`, `/hr/exit`, `/hr/violations-stats` | ✅ شغّال | لوحة قيادة؛ كل الـ8 endpoints موجودة وبيانات حقيقية؛ loading/error موجودة. |
| `/employees` | `pages/employees.tsx` | `GET /employees`, `/hr/employees-status`, `PATCH/DELETE /employees/:id` | ✅ شغّال | قائمة حقيقية، scope مع `enforceBranchScope`، فلاتر، تصدير CSV، RBAC، audit تلقائي. |
| `/employees/:id` | `pages/employee-detail.tsx` | `GET /employees/:id`, `/hr/employee-status/:id`, `/hr/leave-balance`, `PATCH /employees/:id` | ✅ شغّال | تفصيل متداخل (مهام/حضور/إجازات/رواتب/مخالفات/سلف). |
| `/employees/create` | `pages/create/employees-create.tsx` | `POST /employees` | ✅ شغّال | إنشاء حقيقي متعدد الخطوات، تحقق، مسودة تلقائية، يُرجع بيانات دخول مؤقتة. |
| `/hr/employee-profile/:id` | `pages/hr/employee-profile.tsx` | — | ✅ شغّال | إعادة توجيه مقصودة إلى `/employees/:id`. |
| `/hr/employee-activation` | `pages/hr/employee-activation.tsx` | `GET /employees?limit=200`, `PATCH/DELETE /employees/:id` | ✅ شغّال | تفعيل/إيقاف/إنهاء مع سبب إلزامي، RBAC. |
| `/hr/onboarding-review` | `pages/hr/onboarding-review.tsx` | `GET /employees?limit=200`, `/hr/onboarding-steps` | ⚠️ ناقص | للقراءة فقط؛ حالة الـ onboarding مشتقّة من `hireDate` في العميل؛ `PUT /hr/onboarding-steps` و`/employees/onboarding-tasks` بلا واجهة. |
| `/hr/organization` | `pages/hr/organization.tsx` | `/settings/departments`, `/employees` | ⚠️ ناقص | عرض فقط؛ يجلب `/employees` **بلا `limit`** ⇒ سقف 20 صفًا ⇒ كل مؤشرات الأقسام/المناصب أقل من الواقع. |
| `/hr/organization/structure` | `pages/hr/organization-structure.tsx` | `/settings/departments`, `/employees?limit=200` | ⚠️ ناقص | شجرة قراءة فقط؛ لا تحرير؛ لا تسلسل إداري (تجميع مسطّح قسم→موظف). |
| `/hr/transfers` | `pages/hr/transfers.tsx` | `GET/POST /hr/transfers`, `PATCH /hr/transfers/:id/approve` | ✅ شغّال | CRUD حقيقي، `createAuditLog` + `emitEvent`، نموذج zod مضمّن. |
| `/hr/transfers/:id` | `pages/details/transfer-detail.tsx` | `GET /hr/transfers/:id`, `PATCH .../approve` | ⚠️ ناقص | زر «تعديل» ينتقل إلى `/hr/transfers/:id/edit` — **المسار غير موجود** ولا endpoint تحديث. |
| `/hr/expiring-documents` | `pages/hr/expiring-documents.tsx` | `GET /hr/expiring-documents?days=` | ✅ شغّال | تجميع حقيقي (إقامة/جواز/رخصة عمل/عقود). للقراءة فقط بالتصميم. |
| `/hr/official-letters` | `pages/hr/official-letters.tsx` | `GET/POST /hr/official-letters`, `PATCH .../approve` | ✅ شغّال | CRUD حقيقي، معاينة طباعة، audit تلقائي (ENTITY_MAP). |

### 1.B الحضور والورديات والعمل الإضافي والأعذار

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr/attendance` | `pages/hr/attendance.tsx` | `GET /hr/attendance`, `/hr/attendance-stats`, `/export/excel/attendance` | ✅ شغّال | بيانات حقيقية، scope مُرسَل ومُطبَّق، تصدير Excel حقيقي. |
| `/hr/attendance/create` | `pages/create/hr/attendance-create.tsx` | `POST /hr/check-in`, `/hr/check-out` | ✅ شغّال | تسجيل ذاتي فقط (لا منتقي موظف بالتصميم)، audit تلقائي. |
| `/hr/attendance/:id` | `pages/details/attendance-detail.tsx` | `GET /hr/attendance/:id` | ⚠️ ناقص | زر «تعديل» → `/hr/attendance/:id/edit` غير مُسجَّل ⇒ NotFound؛ لا endpoint تحديث. |
| `/hr/attendance/reports` | `pages/hr/attendance-reports.tsx` | `/hr/attendance-stats`, `/hr/monthly-attendance`, `/hr/deductions` | ❌ مكسور | **مظلَّل بالمسار** — `/hr/attendance/:id` (سطر 93) قبله ⇒ يُعرض AttendanceDetail بدلًا منه. |
| `/hr/attendance/field-tracking` | `pages/hr/field-tracking.tsx` | `GET /hr/attendance` | ❌ مكسور | **مظلَّل** بنفس السبب؛ + لا يُرسل scope؛ + مؤشر متوسط الحضور ثابت `-`. |
| `/hr/attendance/qr-scanner` | `pages/hr/qr-scanner.tsx` | `POST /hr/check-in`, `/hr/check-out` | ❌ مكسور | **مظلَّل** بنفس السبب؛ منطق الصفحة نفسه سليم. |
| `/hr/shifts` | `pages/hr/shifts.tsx` | `GET /hr/shifts`, `/hr/shift-assignments`, `PATCH/DELETE /hr/shifts/:id` | ✅ شغّال | CRUD مضمّن، audit+events؛ الخلفية تُصفّي بـ companyId فقط. |
| `/hr/shifts/create` | `pages/create/hr/shifts-create.tsx` | `POST /hr/shifts` | ✅ شغّال | يحفظ؛ لكن `gracePeriod` يُرسَل ولا عمود له في INSERT ⇒ يُهمَل. |
| `/hr/shifts/:id` | `pages/details/shift-detail.tsx` | `GET /hr/shifts` (قائمة)، `PATCH/DELETE /hr/shifts/:id` | ⚠️ ناقص | لا endpoint `GET /shifts/:id` — يجلب القائمة كاملة ويبحث في العميل. |
| `/hr/shifts/management` | `pages/hr/shifts-management.tsx` | `GET /hr/shifts`, `/hr/shift-assignments`, `/employees`, `POST /hr/shift-assignments` | ✅ شغّال | منتقي موظف صحيح، فحوص FK خلفية. |
| `/hr/overtime` | `pages/hr/overtime.tsx` | `GET /hr/overtime`, `PATCH /hr/overtime/:id/{approve,reject}` | ✅ شغّال | بيانات+إحصاءات حقيقية، اعتماد/رفض مع RBAC. |
| `/hr/overtime/create` | `pages/create/hr/overtime-create.tsx` | `POST /hr/overtime`, `GET /employees` | ✅ شغّال | يحفظ، معاينة تكلفة، سلسلة اعتماد + workflow. |
| `/hr/overtime/:id` | `pages/hr/overtime-detail.tsx` | `GET /hr/overtime/:id`, `PATCH .../{approve,reject}` | ✅ شغّال | مراحل، ApprovalActions، ActionHistory. |
| `/hr/excuse-requests` | `pages/hr/excuse-requests.tsx` | `GET /hr/excuse-requests`, `PATCH .../:id/approve` | ✅ شغّال | بيانات حقيقية، اعتماد/رفض، scope مُرسَل. |
| `/hr/excuse-requests/create` | `pages/create/hr/excuse-create.tsx` | `POST /hr/excuse-requests`, `GET /employees` | ⚠️ ناقص | لا منتقي موظف ⇒ `assignmentId` فارغ دائمًا ⇒ الخلفية تستخدم الموظف الحالي فقط (ذاتي). |
| `/hr/excuse-requests/:id` | `pages/details/excuse-detail.tsx` | `GET /hr/excuse-requests/:id`, `PATCH .../approve` | ⚠️ ناقص | زر «تعديل» ميت؛ + إجراء «إرجاع» غير وظيفي (الخلفية تسمح بـ pending→approved/rejected فقط). |

### 1.C الإجازات والعطل والمسارات

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr/leaves` | `pages/hr/leaves.tsx` | `GET /hr/leave-requests`, `/hr/leave-stats`, `.../:id/stages`, `PATCH .../:id/approve` | ✅ شغّال | بيانات حقيقية، KPIs، اعتماد متعدد المراحل. |
| `/hr/leaves/create` | `pages/create/hr/leaves-create.tsx` | `POST /hr/leave-requests`, `/hr/leave-types`, `/hr/leave-balance`, `/employees` | ✅ شغّال | يحفظ مع 8 تحقّقات + حجز رصيد في معاملة؛ ملاحظة: قيم `SelectItem` احتياطية مثبتة (1–5). |
| `/hr/leaves/:id` | `pages/details/leave-detail.tsx` | `GET /hr/leaves/:id`, `PATCH .../:id/approve` | ⚠️ ناقص | زر «تعديل» → `/hr/leaves/:id/edit` غير مُسجَّل؛ `PATCH /hr/leave-requests/:id` يتيم. |
| `/hr/leaves/management` | `pages/hr/leave-management.tsx` | `GET /hr/leave-requests?status=pending`, `/hr/leave-balance`, `/hr/leave-types`, `/hr/leave-stats`, `POST /hr/impact-preview/leave` | ❌ مكسور | **مظلَّل بالمسار** — `/hr/leaves/:id` (سطر 99) قبله ⇒ تُعرض LeaveDetail. |
| `/hr/leaves/approval-chains` | `pages/hr/approval-chains.tsx` | `GET /hr/approval-chains` | ❌ مكسور | **مظلَّل** بنفس السبب؛ + الصفحة للقراءة فقط رغم وجود `POST/DELETE /hr/approval-chain-definitions`. |
| `/hr/public-holidays` | `pages/hr/public-holidays.tsx` | `GET/POST/PATCH/DELETE /hr/public-holidays` | ✅ شغّال | CRUD كامل، فلتر سنة، ConfirmDeleteDialog، RBAC. |

### 1.D الرواتب والسلف والمكافأة ومكوّنات الراتب

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr/payroll` | `pages/hr/payroll.tsx` | `GET /hr/payroll`, `/hr/payroll/:id/lines` | ✅ شغّال | بيانات حقيقية، scope، KPIs، تصدير Excel. |
| `/hr/payroll/create` | `pages/create/hr/payroll-create.tsx` | `POST /hr/payroll` | ✅ شغّال | تشغيل فعلي يحسب البنود (GOSI/بدلات/غياب/تأخر/مخالفة/سلفة/إضافي/صافي) ويرحّل قيدًا؛ لكن `scope/reference/notes` تُسقَط. |
| `/hr/payroll/:id` | `pages/details/payroll-detail.tsx` | `GET /hr/payroll/:id`, `PATCH .../:id/approve` | ⚠️ ناقص | زر «تعديل» ميت؛ + عدم تطابق مفردات الحالة؛ + الصفحة مُصمَّمة كقسيمة فردية بينما الكيان «تشغيل» متعدد الموظفين ⇒ حقول كثيرة فارغة. |
| `/hr/payroll/salary-components` | `pages/hr/salary-components.tsx` | `GET/POST /hr/salary-components` | ⚠️ ناقص | إنشاء فقط؛ لا update/delete؛ عمود `status` ملفّق (كل صف «inactive»). |
| `/hr/loans` | `pages/hr/loans.tsx` | `GET /hr/loans`, `PATCH /hr/loans/:id/{approve,reject}` | ✅ شغّال | بيانات+إحصاءات، اعتماد/رفض مضمّن، RBAC. |
| `/hr/loans/create` | `pages/create/hr/loans-create.tsx` | `POST /hr/loans`, `GET /employees` | ✅ شغّال | يحفظ، سقف 3× الراتب على الجانبين، يبدأ سلسلة اعتماد. |
| `/hr/loans/:id` | `pages/hr/loan-detail.tsx` | `GET /hr/loans/:id`, `PATCH .../{approve,reject}` | ✅ شغّال | جدول أقساط من API؛ الاعتماد يولّد الجدول + قيد. |
| `/hr/gratuity` | `pages/hr/gratuity.tsx` | `GET /hr/gratuity/:employeeId` | ✅ شغّال | حساب نظام العمل (م.84): شرائح + معامل تخفيض الاستقالة. |

### 1.E الأداء والتدريب وتقييم 360 والتطوير

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr/performance` | `pages/hr/performance.tsx` | `GET /hr/performance` | ✅ شغّال | قائمة حقيقية (JOIN employees)، KPIs/فلاتر/StarRating، RBAC. |
| `/hr/performance/create` | `pages/create/hr/performance-create.tsx` | `POST /hr/performance`, `/employees` | ⚠️ ناقص | الكفاءات/نقاط القوة/الأهداف تُسطَّح في `notes` نصيًا؛ أعمدة `scores/strengths` لا تُملأ؛ المرفقات لا تُرسَل. |
| `/hr/performance/advanced` | `pages/hr/performance-advanced.tsx` | `GET /hr/performance` | ✅ شغّال | تحليلات على نفس القائمة. |
| `/hr/performance/:id` | `pages/details/performance-detail.tsx` | `GET/PATCH/DELETE /hr/performance/:id`, `PATCH .../:id/approve` | ❌ مكسور | `ApprovalActions` ينادي `PATCH /hr/performance/:id/approve` — **غير موجود** (مؤكَّد: hr.ts يعرّف فقط GET/PATCH/DELETE) ⇒ اعتماد/رفض 404. |
| `/hr/training` | `pages/hr/training.tsx` | `GET /hr/training/{programs,enrollments,stats}`, `PATCH/DELETE` | ✅ شغّال | DB حقيقي، تصدير CSV، تحرير/حذف مضمّن؛ لا واجهة «إضافة تسجيل». |
| `/hr/training/create` | `pages/create/hr/training-create.tsx` | `POST /hr/training/programs` | ✅ شغّال | إدراج حقيقي + audit + event؛ لكن 8+ حقول نموذج تُسقَط خلفيًا. |
| `/hr/training/:id` | `pages/hr/training-detail.tsx` | `GET .../programs/:id`, `.../enrollments`, `PATCH .../{approve,reject}` | ✅ شغّال | بيانات حقيقية، اعتماد/رفض موجود. |
| `/hr/training/advanced` | `pages/hr/training-advanced.tsx` | `GET .../{stats,programs,enrollments}` | ✅ شغّال | تحليلات فقط، بيانات حقيقية. |
| `/hr/evaluation-360` | `pages/hr/evaluation-360.tsx` | `GET /hr/evaluation-cycles` | ✅ شغّال | دورات + درجات ملخّص حقيقية، RBAC. |
| `/hr/evaluation-360/create` | `pages/create/hr/evaluation-360-create.tsx` | `POST /hr/evaluation-cycles`, `/employees` | ⚠️ ناقص | عدم تطابق مفتاح الإبطال (`evaluation-360` مقابل `evaluation-cycles`) ⇒ قائمة قديمة بعد الإنشاء. |
| `/hr/evaluation-360/:id` | `pages/hr/evaluation-360-detail.tsx` | `GET /hr/evaluation-cycles/:id` | ✅ شغّال | حمولة كاملة؛ `backPath="/hr/evaluations"` رابط ميت. |
| `/hr/evaluation-360/:id/peer` | `pages/hr/evaluation-360-peer.tsx` | `POST .../:id/peer-evaluation` | ✅ شغّال | إدراج حقيقي، إعادة حساب الملخّص. |
| `/hr/evaluation-360/:id/upward` | `pages/hr/evaluation-360-upward.tsx` | `POST .../:id/upward-review` | ✅ شغّال | إدراج مجهول برمز HMAC، تجميع محدود بعتبة. |
| `/hr/evaluation-360/history/:employeeId` | `pages/hr/evaluation-360-history.tsx` | `GET /hr/employees/:id/evaluation-history` | ✅ شغّال | بيانات اتجاه حقيقية؛ لا رابط داخلي يصل إليها. |
| `/hr/development-plans` | `pages/hr/development-plans.tsx` | — | ⚠️ ناقص | ملف بسطر واحد: `export { default } from "./idp"` — مسار مكرّر لنفس صفحة IDP. |
| `/hr/idp` | `pages/hr/idp.tsx` | `GET/POST/PATCH /hr/idp`, `/employees` | ✅ شغّال | CRUD حقيقي على `employee_development_plans`، audit يدوي. |
| `/hr/turnover-report` | `pages/hr/turnover-report.tsx` | `GET /hr/turnover-report?year=` | ✅ شغّال | تجميع حقيقي؛ لا زر تصدير (JSON فقط). |

### 1.F التوظيف والعقود

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr/recruitment` | `pages/hr/recruitment.tsx` | `GET/POST/PATCH/DELETE /hr/recruitment/{postings,applications}`, `/stats` | ✅ شغّال | بيانات حقيقية، تحرير/حذف مضمّن، RBAC الجانبين. |
| `/hr/recruitment/create` | `pages/create/hr/recruitment-create.tsx` | `POST .../postings` | ✅ شغّال | يحفظ؛ لكن `vacancies/benefits/skills/...` تُسقَط بصمت. |
| `/hr/recruitment/advanced` | `pages/hr/recruitment-advanced.tsx` | `GET .../{stats,applications}` | ⚠️ ناقص | بيانات حقيقية لكن **لا رابط تنقّل** في أي مكان — صفحة يتيمة. |
| `/hr/recruitment/applicants/create` | `pages/create/hr/applicants-create.tsx` | `POST .../applications` | ✅ شغّال | يحفظ؛ `source/experience/...` تُسقَط. |
| `/hr/recruitment/applications` | `pages/hr/application-list.tsx` | `GET .../applications` | ✅ شغّال | قائمة، فلاتر، KPIs (للقراءة). |
| `/hr/recruitment/jobs/:id` | `pages/hr/job-detail.tsx` | `GET .../postings/:id`, `.../applications`, `POST .../{close,reopen}` | ✅ شغّال | تفصيل + إغلاق/إعادة فتح بدورة حياة حقيقية؛ `backPath="/hr/jobs"` رابط ميت؛ close يُرسل `{}` بينما `reason` مطلوب (راجع §6). |
| `/hr/contracts` | `pages/hr/contracts.tsx` | `GET /`, `POST /:id/{submit,approve,reject,sign-company,activate,terminate}` | ✅ شغّال | قائمة + إجراءات آلة حالات حقيقية؛ لا `renew` ولا `sign-employee` في هذه الواجهة. |
| `/hr/contracts/create` | `pages/create/hr/contracts-create.tsx` | `POST /hr/contracts` | ✅ شغّال | يحفظ؛ الخلفية تحلّ التعيين الفعّال بنفسها. |
| `/hr/contracts/:id` | `pages/details/hr-contract-detail.tsx` | `GET /hr/contracts/:id` | ❌ مكسور | كتلة الاعتماد: حالات خاطئة (`pending/returned` غير موجودة)، فعل خاطئ (`PATCH` بدل `POST`)، endpoint «return» غير موجود؛ + زر «تعديل» → `/hr/contracts/:id/edit` غير موجود. |

### 1.G التأديب والمخالفات وإخلاء الطرف

| المسار | ملف الصفحة | API | الحكم | ملاحظة |
|---|---|---|---|---|
| `/hr/violations` | `pages/hr/violations.tsx` | `GET /hr/discipline/{memos,stats}` | ✅ شغّال | الصفحة فعليًا تعرض **مذكرات تأديب** (`hr_inquiry_memos`) لا `employee_violations`؛ KPIs/تبويبات حقيقية. |
| `/hr/violations/create` | `pages/create/hr/violations-create.tsx` | `POST /hr/violations` | ❌ مكسور | يرسل قيم نوع عربية (`تأخر/غياب/...`) لا تطابق `knownIncidentTypes` ⇒ كل مخالفة يدوية تصبح `custom` ⇒ **لا تُحلّ أي مادة/عقوبة**؛ + `witness/location/...` تُسقَط؛ + `invalidate` يستهدف مفتاحًا خاطئًا. |
| `/hr/violations/management` | `pages/hr/violations-management.tsx` | `GET /hr/violations`, `/hr/violations-stats`, `PATCH /hr/violations/:id` | ❌ مكسور | زر «حل» يرسل `{status:"resolved"}` لكن `violationPatchSchema` لا يحوي `status` ⇒ no-op يرمي «لا توجد بيانات»؛ + الزر مشروط بحالة `active` غير موجودة في دورة الحياة. |
| `/hr/violations/:id` | `pages/hr/violation-detail.tsx` | `GET /hr/violations/:id`, `PATCH .../{approve,reject,return}` | ✅ شغّال | تفصيل + اعتماد عبر `applyTransition`؛ ملاحظة: عمود مبلغ المذكرة يقرأ `totalDeductionAmount` غير المُسقَط ⇒ 0. |
| `/hr/violations/penalty-escalation` | `pages/hr/penalty-escalation.tsx` | `GET /hr/violations` | ⚠️ ناقص | سُلّم التصعيد **مثبَّت في العميل** لا من `hr_discipline_regulation`؛ يُصفّي بحالة `active` ميتة ⇒ صفحة شبه فارغة. |
| `/hr/violations/auto-detection` | `pages/hr/auto-detection.tsx` | `GET/PUT .../auto-detection/settings`, `POST .../run`, `GET .../{log,summary}` | ✅ شغّال (بتحفّظ) | المحرّك حقيقي يفحص `attendance` + `employee_violations`؛ **لكن** استعلام `summary` يقرأ أعمدة غير موجودة ⇒ KPIs دائمًا فارغة/خاطئة. |
| `/hr/discipline/regulation` | `pages/hr/discipline-regulation.tsx` | `GET/PATCH /hr/discipline/regulation`, `POST .../reseed` | ✅ شغّال | كتالوج DB حقيقي، تحرير + reseed مع audit؛ لا create/delete في الواجهة. |
| `/hr/discipline/memos` | `pages/hr/discipline-memos.tsx` | — | ✅ شغّال | ملف ~1KB: إعادة توجيه مقصودة إلى `/hr/violations?tab=memos`. |
| `/hr/discipline/memos/:id` | `pages/hr/discipline-memo-detail.tsx` | `GET .../memos/:id`, `POST .../{justify,manager-recommendation,gm-decision,cancel,appeal,appeal-decision,close}` | ✅ شغّال | آلة حالات كاملة حقيقية؛ قرار المدير العام يحلّ العقوبة ويُدرج `attendance_deductions` (خصم راتب فعلي). |
| `/hr/exit` | `pages/hr/exit-requests.tsx` | `GET /hr/exit`, `PATCH /hr/exit/:id/approve` | ✅ شغّال | قائمة + إحصاءات حقيقية، اعتماد مضمّن، RBAC. |
| `/hr/exit/create` | `pages/create/hr/exit-create.tsx` | `POST /hr/exit` | ✅ شغّال | حساب مكافأة خلفي حقيقي (م.84/85)، رصيد إجازات، خصم سلف، 6 صفوف إخلاء + سلسلة اعتماد. |
| `/hr/exit/:id` | `pages/hr/exit-detail.tsx` | `GET /hr/exit/:id`, `PATCH /hr/exit/:id/approve` | ⚠️ ناقص | عدم تطابق أسماء الحقول ⇒ أرقام التسوية تظهر 0؛ + **لا واجهة** لـ `/exit/:id/complete` ولا `/exit/clearance/:id` ⇒ الإخلاء يتوقف عند `approved`. |

---

## 2. الثغرات الحرجة (Critical gaps)

> ثغرات تُعطّل تدفّقًا تشغيليًا جوهريًا أو تجعل صفحات كاملة غير قابلة للوصول.

### C1 — خطأ تظليل المسارات يقتل 5 صفحات (مكسور، إصلاح بسطر واحد)
`routes/hrRoutes.tsx` يسجّل مسار `:id` **قبل** المسارات النصّية الأخوة. `App.tsx:127-130` يحقن `allModuleRoutes` بالترتيب داخل `<Switch>` (wouter — أول تطابق يفوز)، و`:id` في wouter يطابق أي مقطع:
- `/hr/attendance/:id` (سطر 93) يظلّل `reports` (94)، `field-tracking` (95)، `qr-scanner` (96).
- `/hr/leaves/:id` (سطر 99) يظلّل `management` (100)، `approval-chains` (101).

**النتيجة:** 5 صفحات عاملة تمامًا غير قابلة للوصول؛ التنقّل إليها يعرض صفحة التفصيل مع `id="reports"` ونحوه. الشريط الجانبي يربط مباشرة إلى هذه المسارات الميتة.
**الإصلاح:** نقل مساري `:id` إلى ما بعد المسارات النصّية. **سطر واحد لكل مجموعة — أعلى عائد، أقل جهد.**

### C2 — دورة الرواتب لا تكتمل من الواجهة (مكسور)
- **عدم تطابق مفردات الحالة:** فلاتر الواجهة `draft/completed/approved/paid` (payroll.tsx)، وتفصيل `STATUS_LABELS` يتوقّع `draft/pending/approved/paid`. الخلفية تُنتج فعليًا `pending_approval` (التشغيل، hr.ts:3951)، `completed` (الاعتماد، hr.ts:2827)، `posted` (`PATCH :id`).
- بطاقة الاعتماد تظهر فقط عند `status==="pending"` بينما الخلفية تضع `pending_approval` ⇒ **بطاقة الاعتماد لا تظهر أبدًا لمسيرة جديدة**.
- لا مسار واجهة يستدعي `PATCH /hr/payroll/:id` بـ `status:"posted"` ⇒ ترحيل القيد/الاعتماد النهائي غير قابل للوصول من الواجهة. الرواتب لا يمكن أن تُرحَّل/تُدفَع end-to-end.

### C3 — دورة العقود غير قابلة للوصول بعد `approved` (مكسور)
- `hr-contract-detail.tsx` كتلة الاعتماد تستخدم حالات غير موجودة (`pending/returned`)، وفعلًا خاطئًا (`PATCH` بينما الحقيقي `POST /:id/approve` — مؤكَّد في hr-contracts.ts:286)، وendpoint «return» لا وجود له ⇒ اعتماد/رفض من صفحة التفصيل يُرجِع 404/405.
- `POST /:id/sign-employee` (موجود، السطر 428) و`POST /:id/renew` (موجود، 563) **بلا أي زر**؛ والعقد يحتاج توقيعين ليصل `signed` ثم `active` ⇒ **دورة العقد لا تتجاوز `approved` من الواجهة**.

### C4 — اعتماد تقييم الأداء مكسور (مكسور)
`performance-detail.tsx` ينادي `PATCH /hr/performance/:id/approve` — **endpoint غير موجود** (مؤكَّد: hr.ts يعرّف فقط `GET/POST /performance` و`GET/PATCH/DELETE /performance/:id`). أزرار الاعتماد/الرفض/الإرجاع كلها 404.

### C5 — جسر «التوظيف → موظف» غير موجود (مكسور وظيفيًا)
`PATCH /hr/recruitment/applications/:id` يقبل أي `status` نصّي (يمكن ضبطه `hired`) لكنه يُجري تحديث عمود عاديًا فقط — **لا `INSERT INTO employees`**، لا إنشاء تعيين/عقد، لا حدث ذو أثر. انتقالات المراحل (`new→screening→interview→offer→hired`) **تجميلية**؛ خطّ التوظيف لا يُنتج موظفًا.

### C6 — إخلاء الطرف لا يُتمّ من الواجهة (مكسور وظيفيًا)
`PATCH /hr/exit/:id/complete` و`PATCH /hr/exit/clearance/:id` موجودان ويُنفّذان عملًا حقيقيًا (`settlementPaid`، `employee_assignments.status='terminated'`، `hrEngine.postExitSettlementGL`) لكن **بلا أي مستدعٍ في الواجهة** ⇒ بنود الإخلاء لا تُخلَّص، وترحيل قيد المكافأة + إنهاء الموظف غير قابلين للوصول. الإخلاء يتجمّد عند `approved`.

### C7 — إنشاء المخالفة اليدوية + «حل» المخالفة مكسوران (مكسور)
- `violations-create.tsx` يرسل قيم نوع عربية لا تطابق `knownIncidentTypes` الإنجليزية ⇒ كل مخالفة يدوية = `custom` ⇒ `resolveArticle` يُرجِع null ⇒ لا عقوبة/مادة تُحلّ أبدًا.
- `violations-management.tsx` زر «حل» يرسل حقل `status` يرفضه `violationPatchSchema` ⇒ خطأ تحقّق؛ والزر مشروط بحالة `active` لا توجد في دورة حياة المخالفة الحقيقية (`pending/approved/rejected`).

### C8 — أزرار «تعديل» ميتة عبر صفحات التفصيل (مكسور)
أزرار «تعديل» تنتقل إلى مسارات `/.../:id/edit` غير مُسجَّلة في `hrRoutes.tsx` ⇒ NotFound، في: `transfer-detail`، `payroll-detail`، `leave-detail`، `attendance-detail`، `excuse-detail`، `hr-contract-detail`. (عنقود واحد — إمّا تسجيل صفحات تحرير أو إزالة الأزرار.)

---

## 3. الثغرات المتوسطة (Medium gaps)

| # | الثغرة | الأثر |
|---|---|---|
| M1 | **branchId غير مُطبَّق على كثير من قراءات `/hr`** — الواجهة ترسل `branchIds` لكن المعالِجات تُصفّي `companyId` فقط: `/hr/transfers`, `/hr/official-letters`, `/hr/expiring-documents`, `/hr/employees-status`, `/hr/shifts`, `/hr/shift-assignments`, `/hr/monthly-attendance`, `/hr/deductions`, `/hr/overtime`, recruitment postings, hr-contracts. | منتقي الفرع لا يضيّق هذه القوائم. **⚠️ هذا في صميم #685 — لا يُعالَج هنا، يُنسَّق مع #685.** |
| M2 | `organization.tsx` يجلب `/employees` بلا `limit` ⇒ سقف 20. | كل مؤشرات الأقسام/المناصب أقل من الواقع بصمت. |
| M3 | **انجراف حمولة نماذج الإنشاء** — حقول تُرسَل وتُسقطها مخططات zod بصمت: recruitment-create، applicants-create، training-create (8+)، performance-create (الدرجات المهيكلة)، payroll-create (`scope/reference/notes`)، shifts-create (`gracePeriod`). | فقدان بيانات / حقول واجهة وهمية. |
| M4 | `performance-detail.tsx` يقرأ `areasForImprovement` بينما العمود `improvements`. | قسم «مجالات التحسين» لا يُعرض أبدًا. |
| M5 | `salary-components`: لا update/delete؛ عمود `status` ملفّق (كل صف «inactive»، الفلتر لا يطابق). | المكوّنات لا تُحرَّر/تُعطَّل. |
| M6 | `payroll-detail` مُصمَّم كقسيمة موظف فردي بينما `GET /hr/payroll/:id` يُرجِع تجميع تشغيل متعدد. | `overtime/bonus/employeeName/paymentMethod/bankAccount` تُعرض فارغة. |
| M7 | `evaluation-360-create` يُبطل `["evaluation-360"]` بينما القائمة `["evaluation-cycles"]`. | قائمة قديمة بعد إنشاء دورة. |
| M8 | `auto-detection/summary` SQL يقرأ `detectedAt` و`details[].type` غير الموجودين. | `totalDetected/lastRunAt/byType` فارغة دائمًا؛ `totalRuns==totalDetected`. |
| M9 | `penalty-escalation` سُلّم التصعيد مثبَّت في العميل لا من `hr_discipline_regulation`؛ فلتر `active` ميت. | الصفحة شبه فارغة دائمًا وغير مرتبطة بالعقوبات الحقيقية. |
| M10 | `exit-detail` يقرأ `estimatedGratuity/leaveCashOut/loanBalance` بينما API يُرجِع `gratuityAmount/leaveCompensation/loanDeductions`. | تفصيل التسوية المالية يظهر أصفارًا. |
| M11 | إجراء «إرجاع» العذر غير وظيفي — الخلفية تسمح بـ `pending→approved/rejected` فقط. | فرع «returned» مكسور بصمت. |
| M12 | `leaves-create` قيم `leaveTypeId` احتياطية مثبتة (1–5) عند فراغ `leave-types`. | إرسال معرّفات قد لا توجد ⇒ `NotFoundError`. |
| M13 | `development-plans.tsx` مجرّد إعادة تصدير لـ `idp` ⇒ مساران لنفس الصفحة. | مسار مكرّر/ميّت. |
| M14 | روابط «رجوع» ميتة: `job-detail` → `/hr/jobs`؛ `evaluation-360-detail` → `/hr/evaluations`؛ + `recruitment-advanced` يتيمة بلا رابط تنقّل. | تنقّل مكسور / صفحات معزولة. |
| M15 | **أحداث منبعثة بلا مستهلك** — `hr.contract.*`, `hr.loan.*`, `hr.overtime.*`, `hr.exit.*`, `training.*`, `recruitment.posting.*/application.*` تُبعَث لكن **لا listener** لها (تصل `event_logs` فقط). صرف السلفة / ترحيل قيد الإضافي ليسا event-driven. | لا إشعار/أثر جانبي رغم تصنيف بعضها `critical` في `eventCatalog`. |
| M16 | لا تصدير ملفات لـ violations/loans/overtime/exit/contracts/recruitment/قائمة الموظفين/turnover (JSON فقط). فقط الرواتب والحضور لهما Excel/PDF حقيقي عبر `routes/export.ts`. | فجوة تقارير. |
| M17 | لا آلة حالات (`lifecycleEngine`) مُسجَّلة لـ `payroll_runs`, `hr_employee_loans`, `hr_overtime_requests`, `employee_contracts/transfers` — تعتمد على قوائم `fromStates` محلية في المسار. | اتساق دورة الحياة أضعف وغير مركزي. |
| M18 | `onboarding-review` للقراءة فقط ومشتق من `hireDate`؛ لا واجهة لتعليم الخطوات أو تقديم الموظف. | لا إدارة فعلية للتعيين. |

---

## 4. عدم تطابق UI-only / API-only

### 4.1 API موجود بلا واجهة (API-without-UI)
- **بلا أي مستهلك إطلاقًا:** `GET/PUT /hr/attendance-policy` · `POST /hr/accruals/monthly` + `GET /hr/accruals/preview` (استحقاقات شهرية مدعومة بمحرّك) · `GET/POST /hr/company-documents` · `GET/POST /hr/delegations` · `GET/POST/DELETE /hr/approval-chain-definitions` (CRUD سلاسل الاعتماد) · `PUT /hr/onboarding-steps` · `GET/PATCH /employees/onboarding-tasks`.
- **endpoint بلا زر:** `DELETE /hr/payroll/:id` · `PATCH /hr/payroll/:id` (تدفّق `posted`) · `PATCH /hr/leave-requests/:id` (تحرير) · `POST /hr/leave-requests/:id/cancel` (يُعيد الرصيد) · `DELETE /hr/leave-requests/:id` · `PATCH /hr/leave-requests/:id/escalate` · `POST /hr/contracts/:id/{sign-employee,renew}` · `PATCH /hr/contracts/:id` · `PATCH /hr/exit/:id/complete` · `PATCH /hr/exit/clearance/:id` · `POST/DELETE /hr/discipline/regulation` · `DELETE /hr/violations/:id` · `GET /hr/discipline/penalty-preview` · `GET /hr/discipline/employee/:id/summary` · `POST /hr/training/enrollments` (لا واجهة «تسجيل موظف») · `GET /hr/evaluation-cycles/:id/{summary,system-report}` · `GET /hr/upward-reviews/manager/:managerId`.
- **مُضمَّن جزئيًا فقط:** `GET /hr/deductions` و`/hr/monthly-attendance` (داخل `attendance-reports` المظلَّلة فقط) · `GET /hr/payroll-summary`.

### 4.2 واجهة تنادي API غير موجود (UI-without-API)
- المسارات الستة `/.../:id/edit` (راجع C8) — لا صفحة ولا endpoint.
- `PATCH /hr/performance/:id/approve` (راجع C4).
- إجراء «return» في `hr-contract-detail` — لا فعل خلفي.
- حقل `status` في `violations-management` «حل» — لا endpoint يقبله.
- إجراء «إرجاع» العذر — لا حالة `returned` خلفية.

### 4.3 التباس كيانات / تسمية
- صفحة `/hr/violations` تعرض `hr_inquiry_memos` (مذكرات)، بينما `/hr/violations/management` تعرض `employee_violations` — **كيانان مختلفان خلف مسارين متشابهين**.
- جداول لا توجد بالاسم: `hr_contracts` (الفعلي `employee_contracts`)، `hr_discipline_memos` (الفعلي `hr_inquiry_memos`)، `hr_official_letters` (الفعلي `official_letters`) — التباس تسمية فقط، لا جداول مفقودة.
- `hr_violations` و`employee_violations` كلاهما موجود — تكرار/إرث محتمل.

---

## 5. ما يحتاج تحقّقًا تشغيليًا (Runtime validation)

> أمور لا يحسمها التتبّع الثابت — تحتاج تشغيل التطبيق فعليًا.

1. **تأكيد تظليل المسارات (C1)** — التنقّل إلى `/hr/attendance/reports` و`/hr/leaves/management` ومراقبة عرض صفحة التفصيل الخاطئة.
2. **ازدواج ترحيل قيد الرواتب** — `postPayrollRunGL` (وقت التشغيل) مقابل `postPayrollPostGL` (`PATCH :id`): هل يصيبان دفتر الأستاذ لنفس المسيرة؟ خطر ترحيل مزدوج.
3. **مطابقة فترة الإضافي بالراتب** — تشغيل الراتب يجمع `hr_overtime_requests` بحالة `approved` حسب الفترة عبر `TO_CHAR` — يحتاج تأكيدًا.
4. **استهلاك `attendance_deductions`** — قرار المدير العام يُدرج صفوفًا؛ تأكيد أن قيمة `type` (`penalty` مقابل `violation`) تطابق ما يقرأه تشغيل الراتب.
5. **`job-detail` close/reopen** — الواجهة ترسل `{}` بينما `closePostingSchema` يتطلّب `reason` (`min(1)`) ⇒ يُرجَّح فشل التحقّق — يحتاج تأكيدًا.
6. **بوابات الأدوار الخلفية الصلبة** — `PAYROLL_ROLES`/`LOAN_APPROVAL_ROLES` (hr.ts:2394، hr-loans.ts:416) مقابل سلاسل صلاحيات `hr:create/hr:approve` على `GuardedButton` — قد يرى المستخدم زرًا مُفعَّلًا ثم يحصل على 403.
7. **`contract_number_seq`** — تسلسل Postgres مُستخدَم في hr-contracts.ts:142,575؛ غيابه ⇒ 500 عند الإنشاء/التجديد.
8. **`/hr/employees-status`** — يستدعي `computeEmployeeOperationalStatus` لكل موظف (حتى 500) — قلق N+1، يحتاج قياس أداء.
9. **`/entity-meta/bulk-action`** لـ `leave-request` — الاعتماد الجماعي يتجاوز `/approve` المرحلي؛ تأكيد أنه يطبّق آثار الرصيد/الحضور.
10. **سلوك branchId** — هل إهماله في قراءات `/hr` قرار تصميم «على مستوى الشركة» أم انحدار؟ (قرار منتج — ضمن #685).
11. **`contract_templates`** — `migration 081` لا يحوي أي `CREATE TABLE`؛ تأكيد عدم وجود مسار يشير إلى هذا الجدول.
12. **`hr_clone_default_regulation()`** — وجود دالة SQL وبذرة الـ49 مادة.

---

## 6. توصية ترتيب الـ PR لاحقًا (لا تُفتَح PR الآن)

> مرتّبة حسب (العائد ÷ الجهد) ومع احترام حدود النطاق.

| # | PR المقترح | يعالج | الجهد | المخاطر |
|---|---|---|---|---|
| **PR-1** | **إصلاح ترتيب المسارات** في `hrRoutes.tsx` — نقل `:id` بعد المسارات النصّية | C1 (5 صفحات) | تافه (سطران) | منخفضة جدًا — **ابدأ هنا** |
| **PR-2** | معالجة أزرار «تعديل» الميتة — إزالة الأزرار أو إضافة صفحات/مسارات تحرير | C8 | منخفض | منخفضة |
| **PR-3** | تطبيع حالة الرواتب — مواءمة مفردات الواجهة مع الخلفية (`pending_approval/completed/posted`)، توصيل إجراء «الترحيل»، إصلاح شرط بطاقة الاعتماد | C2 | متوسط | متوسطة (يلامس دورة حياة — اختبار دقيق) |
| **PR-4** | دورة العقود — إصلاح فعل/حالات الاعتماد في `hr-contract-detail`، إضافة واجهة `sign-employee` و`renew` | C3 | متوسط | متوسطة |
| **PR-5** | اعتماد الأداء — إضافة `POST/PATCH /performance/:id/approve` أو إزالة واجهة الاعتماد؛ إصلاح `improvements`؛ حفظ الدرجات المهيكلة | C4، M4، M3(الأداء) | متوسط | منخفضة |
| **PR-6** | التأديب — مواءمة أنواع `violations-create`، إصلاح زر «حل»، إصلاح SQL `auto-detection/summary`، ربط `penalty-escalation` بالعقوبات الحقيقية | C7، M8، M9 | متوسط | منخفضة |
| **PR-7** | إتمام إخلاء الطرف — إضافة واجهة `complete` + `clearance`؛ إصلاح أسماء حقول `exit-detail` | C6، M10 | متوسط | متوسطة (يلامس GL — اختبار) |
| **PR-8** | جسر «التوظيف → موظف» — انتقالات مراحل حقيقية + إنشاء موظف عند `hired` | C5 | مرتفع | متوسطة |
| **PR-9** | تنظيف انجراف حمولة النماذج + روابط الرجوع الميتة + سطح API-without-UI (delegations/accruals/approval-chain-definitions) | M3، M14، §4.1 | متوسط | منخفضة |

**استثناء صريح:** ثغرة **M1 (branchId scope)** **لا تدخل** أي PR من HR — هي صميم **#685 Scope Normalization** (راجع `docs/audit/SCOPE_NORMALIZATION_RCA_685.md`). يجب أن تُعالَج هناك وتُنسَّق، لا أن تُكرَّر في مسار HR.

---

## 7. حالة المحرّكات والبنية التحتية (مرجع)

- **المحرّكات حقيقية وموضوعية:** `hrEngine` (8 طرق ترحيل GL متوازنة بفحص debit=credit + `sourceKey` idempotency)؛ `disciplineEngine` (حلّ المواد، عدّ التكرار، تحليل نص العقوبة العربي)؛ `autoViolationEngine` (مسح حضور كامل بحراسة idempotency)؛ `hrHelpers` (حسابات نظام العمل السعودي)؛ `lifecycleEngine` (آلات حالات ذرّية لـ `hr_leave_requests/hr_exit_requests/hr_inquiry_memos`).
- **RBAC نظيف:** كل سلسلة `feature` مُستخدَمة في `authorize()` معرّفة في `featureCatalog.ts`؛ **لا مسار HR mutation بلا `authorize()`**؛ لا فجوة fail-closed.
- **Audit:** `auditMiddleware` يغطّي تلقائيًا `/employees`, `/hr/leaves`, `/hr/leave-requests`, `/hr/check-in/out`, `/hr/violations`, `/hr/official-letters`, `/hr/performance`, `/hr/payroll`, `/hr/evaluation-cycles`, `/hr/loans`, `/hr/training`. المسارات خارج الخريطة (`contracts/discipline/exit/overtime/recruitment/transfers/idp/shifts/excuse/public-holidays`) تبعث `createAuditLog`+`emitEvent` يدويًا — تم التحقّق من وجودها على عمليات الإنشاء/الاعتماد الرئيسة.
- **المخطّط:** كل جداول HR الأساسية موجودة (`db/schema_pre.sql` + migrations). لا جداول مفقودة (راجع §4.3 لالتباس التسمية).

---

*انتهى التقرير. تدقيق ثابت فقط — لم يُعدَّل أي كود، ولم تُفتَح أي PR، ولم يُمَس أي نطاق خارج HR.*
