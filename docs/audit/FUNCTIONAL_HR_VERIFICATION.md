# التحقق الوظيفي لمسار الموارد البشرية — Functional HR Verification

> **النوع:** تدقيق ثابت (Static code-trace) — لا تشغيل، لا تعديل كود، لا PR.
> **الإصدار:** Rev 2 — **2026-05-21** (يَستبدل تتبّع 2026-05-20).
> **النطاق:** مسار HR التشغيلي الكامل فقط: `Page → API → handler → DB → lifecycle → audit/events → permissions → reports/exports`.
> **خارج النطاق (لم يُمَس):** Finance، #685 Scope Normalization، Deployment، Runtime Harness، Umrah.
> **المنهجية:** التتبّع الكامل لـ 80 مسار/صفحة في `routes/hrRoutes.tsx` مقابل 9 ملفات API (`hr.ts`, `employees.ts`, `hr-contracts.ts`, `hr-discipline.ts`, `hr-exit.ts`, `hr-loans.ts`, `hr-overtime.ts`, `recruitment.ts`, `training.ts`) ومحرّكات HR. أُعيد التحقّق من **كل مسار كان مكسورًا أو ناقصًا** في تتبّع 2026-05-20 مقابل كود `main` الحالي بعد دمج حزمة الإصلاح.

---

## 0. الخلاصة التنفيذية

**الحكم العام:** الموارد البشرية في غيث **مسار تشغيلي فعلي end-to-end**. ما كان في تتبّع 2026-05-20 «محرّك حقيقي بمفاتيح قيادة مكسورة» صار الآن قابلًا للقيادة بالكامل من الواجهة: الرواتب تُعتمَد وتُرحَّل، العقود تُكمل دورة حياتها، تقييم الأداء يتقدّم، مخالفات التأديب تُحَلّ، إخلاء الطرف يُتَمّ، وخطّ التوظيف يُفضي إلى موظف.

**التغيّر منذ Rev 1:** كل **الثغرات الحرجة الثماني (C1–C8)** أُغلقت عبر **PR #733** (`hr(functional): restore end-to-end operational flows`)، وأُغلقت معها 7 ثغرات متوسطة (M2, M4, M7, M8, M10, M11, M14). ثم كشف التشغيل عيبًا على مستوى المحرّك (آلة الحالات `applyTransition` تكتب `"updatedAt"` على جداول تفتقده ⇒ خطأ 500) فأُغلق جذريًا عبر **PR #738 / #743 / #753 / #758 / #765** (migrations 182 + 183 تضيفان `updatedAt` إلى `employee_violations`، `employee_transfers`، `job_postings`؛ + إصلاح دلالات اعتماد النقل وعدم تطابق إغلاق التوظيف).

**ما تبقّى:** لا توجد صفحة مكسورة. المتبقّي 9 صفحات «ناقصة» وكلّها بنود متوسطة مؤجَّلة عمدًا (انجراف حمولة النماذج، إعادة تصميم قسيمة الراتب، سُلّم التصعيد المثبَّت… إلخ) — لا واحد منها يكسر تدفّقًا تشغيليًا جوهريًا.

**الإحصاء (80 مسارًا):**

| الحكم | Rev 1 (2026-05-20) | **Rev 2 (2026-05-21)** |
|---|---|---|
| ✅ شغّال | 54 (67%) | **71 (89%)** |
| ⚠️ ناقص | 17 (21%) | **9 (11%)** |
| ❌ مكسور | 9 (11%) | **0** |
| ❓ غير قابل للتحقق static-only | 0 | **0** |

**الحكم:** HR **ليس مجرد واجهات وجداول** — هو مسار تشغيلي حقيقي بمحرّكات موضوعية (ترحيل GL، حسابات نظام العمل السعودي، آلات حالات ذرّية، تأديب، رصد آلي). المتبقّي تحسينات متوسطة، لا أعطال مسار.

---

## 1. الجدول route-by-route

الأعمدة: المسار · ملف الصفحة · endpoint(s) · الحكم · ملاحظة.
كل الصفحات تحت `artifacts/ghayth-erp/src/`؛ كل الـ APIs تحت `artifacts/api-server/src/routes/`.
العمود «↔ Rev 1» يبيّن التغيّر منذ تتبّع 2026-05-20.

### 1.A الموظفون والهيكل التنظيمي

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr` | `pages/hr.tsx` | `/employees`, `/hr/leave-requests`, `/hr/payroll`, `/hr/attendance`, `/hr/loans`, `/hr/overtime`, `/hr/exit`, `/hr/violations-stats` | ✅ شغّال | = | لوحة قيادة؛ الـ8 endpoints موجودة وبيانات حقيقية؛ loading/error موجودة. |
| `/employees` | `pages/employees.tsx` | `GET /employees`, `/hr/employees-status`, `PATCH/DELETE /employees/:id` | ✅ شغّال | = | قائمة حقيقية، scope مع `enforceBranchScope`، فلاتر، تصدير CSV، RBAC، audit تلقائي. |
| `/employees/:id` | `pages/employee-detail.tsx` | `GET /employees/:id`, `/hr/employee-status/:id`, `/hr/leave-balance`, `PATCH /employees/:id` | ✅ شغّال | = | تفصيل متداخل (مهام/حضور/إجازات/رواتب/مخالفات/سلف). |
| `/employees/create` | `pages/create/employees-create.tsx` | `POST /employees` | ✅ شغّال | = | إنشاء متعدد الخطوات، تحقق، مسودة تلقائية، يُرجع بيانات دخول مؤقتة. هو أيضًا هدف «تحويل لموظف» (راجع C5). |
| `/hr/employee-profile/:id` | `pages/hr/employee-profile.tsx` | — | ✅ شغّال | = | إعادة توجيه مقصودة إلى `/employees/:id`. |
| `/hr/employee-activation` | `pages/hr/employee-activation.tsx` | `GET /employees?limit=200`, `PATCH/DELETE /employees/:id` | ✅ شغّال | = | تفعيل/إيقاف/إنهاء مع سبب إلزامي، RBAC. |
| `/hr/onboarding-review` | `pages/hr/onboarding-review.tsx` | `GET /employees?limit=200`, `/hr/onboarding-steps` | ⚠️ ناقص | = | للقراءة فقط؛ الحالة مشتقّة من `hireDate` بالعميل؛ `PUT /hr/onboarding-steps` و`/employees/onboarding-tasks` بلا واجهة (M18). |
| `/hr/organization` | `pages/hr/organization.tsx` | `/settings/departments`, `/employees?limit=…` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح M2** — يجلب `/employees` بسقف صريح ⇒ مؤشرات الأقسام/المناصب حقيقية. |
| `/hr/organization/structure` | `pages/hr/organization-structure.tsx` | `/settings/departments`, `/employees?limit=200` | ⚠️ ناقص | = | شجرة قراءة فقط؛ لا تحرير؛ تجميع مسطّح قسم→موظف بلا تسلسل إداري (قيد تصميم، لا ثغرة مرقّمة). |
| `/hr/transfers` | `pages/hr/transfers.tsx` | `GET/POST /hr/transfers`, `PATCH /hr/transfers/:id/approve` | ✅ شغّال | = | CRUD حقيقي، `createAuditLog`+`emitEvent`؛ دلالات الاعتماد صُحّحت في #765. |
| `/hr/transfers/:id` | `pages/details/transfer-detail.tsx` | `GET /hr/transfers/:id`, `PATCH .../approve`, `PATCH /hr/transfers/:id` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح C8** — صفحة `transfers-edit` + مسار `:id/edit` + `PATCH /hr/transfers/:id` موجودة. |
| `/hr/transfers/:id/edit` | `pages/create/hr/transfers-edit.tsx` | `GET/PATCH /hr/transfers/:id` | ✅ شغّال | 🆕 | صفحة تحرير جديدة (#733). |
| `/hr/expiring-documents` | `pages/hr/expiring-documents.tsx` | `GET /hr/expiring-documents?days=` | ✅ شغّال | = | تجميع حقيقي (إقامة/جواز/رخصة عمل/عقود). للقراءة فقط بالتصميم. |
| `/hr/official-letters` | `pages/hr/official-letters.tsx` | `GET/POST /hr/official-letters`, `PATCH .../approve` | ✅ شغّال | = | CRUD حقيقي، معاينة طباعة، audit تلقائي (ENTITY_MAP). |

### 1.B الحضور والورديات والعمل الإضافي والأعذار

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr/attendance` | `pages/hr/attendance.tsx` | `GET /hr/attendance`, `/hr/attendance-stats`, `/export/excel/attendance` | ✅ شغّال | = | بيانات حقيقية، scope مُرسَل ومُطبَّق، تصدير Excel حقيقي. |
| `/hr/attendance/create` | `pages/create/hr/attendance-create.tsx` | `POST /hr/check-in`, `/hr/check-out` | ✅ شغّال | = | تسجيل ذاتي فقط (لا منتقي موظف بالتصميم)، audit تلقائي. |
| `/hr/attendance/reports` | `pages/hr/attendance-reports.tsx` | `/hr/attendance-stats`, `/hr/monthly-attendance`, `/hr/deductions` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C1** — المسار النصّي صار قبل `:id` في `hrRoutes.tsx` ⇒ الصفحة قابلة للوصول. |
| `/hr/attendance/field-tracking` | `pages/hr/field-tracking.tsx` | `GET /hr/attendance` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C1**؛ ملاحظة باقية: مؤشر متوسط الحضور قد يظهر `-` (تجميل، غير معطِّل). |
| `/hr/attendance/qr-scanner` | `pages/hr/qr-scanner.tsx` | `POST /hr/check-in`, `/hr/check-out` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C1**. |
| `/hr/attendance/:id` | `pages/details/attendance-detail.tsx` | `GET/PATCH /hr/attendance/:id` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح C8** — صفحة `attendance-edit` + `PATCH /hr/attendance/:id` موجودة. |
| `/hr/attendance/:id/edit` | `pages/create/hr/attendance-edit.tsx` | `GET/PATCH /hr/attendance/:id` | ✅ شغّال | 🆕 | صفحة تحرير جديدة (#733). |
| `/hr/shifts` | `pages/hr/shifts.tsx` | `GET /hr/shifts`, `/hr/shift-assignments`, `PATCH/DELETE /hr/shifts/:id` | ✅ شغّال | = | CRUD مضمّن، audit+events. |
| `/hr/shifts/create` | `pages/create/hr/shifts-create.tsx` | `POST /hr/shifts` | ✅ شغّال | = | يحفظ؛ ملاحظة باقية: `gracePeriod` يُرسَل بلا عمود (انجراف حمولة — M3). |
| `/hr/shifts/:id` | `pages/details/shift-detail.tsx` | `GET /hr/shifts` (قائمة)، `PATCH/DELETE /hr/shifts/:id` | ⚠️ ناقص | = | لا `GET /shifts/:id` — يجلب القائمة كاملة ويبحث بالعميل. |
| `/hr/shifts/management` | `pages/hr/shifts-management.tsx` | `GET /hr/shifts`, `/hr/shift-assignments`, `/employees`, `POST /hr/shift-assignments` | ✅ شغّال | = | منتقي موظف صحيح، فحوص FK خلفية. |
| `/hr/overtime` | `pages/hr/overtime.tsx` | `GET /hr/overtime`, `PATCH /hr/overtime/:id/{approve,reject}` | ✅ شغّال | = | بيانات+إحصاءات، اعتماد/رفض مع RBAC. |
| `/hr/overtime/create` | `pages/create/hr/overtime-create.tsx` | `POST /hr/overtime`, `GET /employees` | ✅ شغّال | = | يحفظ، معاينة تكلفة، سلسلة اعتماد + workflow. |
| `/hr/overtime/:id` | `pages/hr/overtime-detail.tsx` | `GET /hr/overtime/:id`, `PATCH .../{approve,reject}` | ✅ شغّال | = | مراحل، ApprovalActions، ActionHistory. |
| `/hr/excuse-requests` | `pages/hr/excuse-requests.tsx` | `GET /hr/excuse-requests`, `PATCH .../:id/approve` | ✅ شغّال | = | بيانات حقيقية، اعتماد/رفض، scope مُرسَل. |
| `/hr/excuse-requests/create` | `pages/create/hr/excuse-create.tsx` | `POST /hr/excuse-requests`, `GET /employees` | ⚠️ ناقص | = | لا منتقي موظف ⇒ `assignmentId` فارغ ⇒ الخلفية تستخدم الموظف الحالي فقط (ذاتي). |
| `/hr/excuse-requests/:id` | `pages/details/excuse-detail.tsx` | `GET/PATCH /hr/excuse-requests/:id`, `PATCH .../approve` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح C8 + M11** — صفحة تحرير + `PATCH /hr/excuse-requests/:id`؛ مسار «الرفض» صار سليمًا. |
| `/hr/excuse-requests/:id/edit` | `pages/create/hr/excuse-edit.tsx` | `GET/PATCH /hr/excuse-requests/:id` | ✅ شغّال | 🆕 | صفحة تحرير جديدة (#733). |

### 1.C الإجازات والعطل والمسارات

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr/leaves` | `pages/hr/leaves.tsx` | `GET /hr/leave-requests`, `/hr/leave-stats`, `.../:id/stages`, `PATCH .../:id/approve` | ✅ شغّال | = | بيانات حقيقية، KPIs، اعتماد متعدد المراحل. |
| `/hr/leaves/create` | `pages/create/hr/leaves-create.tsx` | `POST /hr/leave-requests`, `/hr/leave-types`, `/hr/leave-balance`, `/employees` | ✅ شغّال | = | يحفظ مع 8 تحقّقات + حجز رصيد في معاملة؛ ملاحظة باقية: قيم `leaveTypeId` احتياطية مثبتة (M12). |
| `/hr/leaves/:id` | `pages/details/leave-detail.tsx` | `GET /hr/leaves/:id`, `PATCH /hr/leave-requests/:id`, `PATCH .../:id/approve` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح C8** — صفحة `leaves-edit` + مسار `:id/edit`؛ `PATCH /hr/leave-requests/:id` صار موصولًا. |
| `/hr/leaves/:id/edit` | `pages/create/hr/leaves-edit.tsx` | `GET/PATCH /hr/leave-requests/:id` | ✅ شغّال | 🆕 | صفحة تحرير جديدة (#733). |
| `/hr/leaves/management` | `pages/hr/leave-management.tsx` | `GET /hr/leave-requests?status=pending`, `/hr/leave-balance`, `/hr/leave-types`, `/hr/leave-stats`, `POST /hr/impact-preview/leave` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C1** — المسار النصّي صار قبل `:id`. |
| `/hr/leaves/approval-chains` | `pages/hr/approval-chains.tsx` | `GET /hr/approval-chains` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C1**؛ ملاحظة باقية: للقراءة فقط رغم وجود `POST/DELETE /hr/approval-chain-definitions` (API-without-UI، §4.1). |
| `/hr/public-holidays` | `pages/hr/public-holidays.tsx` | `GET/POST/PATCH/DELETE /hr/public-holidays` | ✅ شغّال | = | CRUD كامل، فلتر سنة، ConfirmDeleteDialog، RBAC. |

### 1.D الرواتب والسلف والمكافأة ومكوّنات الراتب

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr/payroll` | `pages/hr/payroll.tsx` | `GET /hr/payroll`, `/hr/payroll/:id/lines` | ✅ شغّال | = | بيانات حقيقية، scope، KPIs، تصدير Excel. |
| `/hr/payroll/create` | `pages/create/hr/payroll-create.tsx` | `POST /hr/payroll` | ✅ شغّال | = | تشغيل فعلي يحسب البنود (GOSI/بدلات/غياب/تأخر/مخالفة/سلفة/إضافي/صافي) ويرحّل قيدًا؛ ملاحظة باقية: `scope/reference/notes` تُسقَط (M3). |
| `/hr/payroll/:id` | `pages/details/payroll-detail.tsx` | `GET /hr/payroll/:id`, `PATCH .../:id/approve`, `PATCH /hr/payroll/:id` | ⚠️ ناقص | ⬆️ جزئيًا | **أُصلح C2** — مفردات الحالة (`pending_approval→completed→posted`) ولوحة «اعتماد» + «ترحيل القيد» موصولتان؛ زر «تعديل» أُزيل عمدًا (`payroll_runs` تشغيل محسوب بلا أعمدة قابلة للتحرير). يبقى **M6**: الصفحة مُصمَّمة كقسيمة فردية بينما الكيان «تشغيل» متعدد ⇒ حقول فردية فارغة. |
| `/hr/payroll/salary-components` | `pages/hr/salary-components.tsx` | `GET/POST /hr/salary-components` | ⚠️ ناقص | = | إنشاء فقط؛ لا update/delete؛ عمود `status` ملفّق (M5). |
| `/hr/loans` | `pages/hr/loans.tsx` | `GET /hr/loans`, `PATCH /hr/loans/:id/{approve,reject}` | ✅ شغّال | = | بيانات+إحصاءات، اعتماد/رفض مضمّن، RBAC. |
| `/hr/loans/create` | `pages/create/hr/loans-create.tsx` | `POST /hr/loans`, `GET /employees` | ✅ شغّال | = | يحفظ، سقف 3× الراتب، يبدأ سلسلة اعتماد. |
| `/hr/loans/:id` | `pages/hr/loan-detail.tsx` | `GET /hr/loans/:id`, `PATCH .../{approve,reject}` | ✅ شغّال | = | جدول أقساط من API؛ الاعتماد يولّد الجدول + قيد. |
| `/hr/gratuity` | `pages/hr/gratuity.tsx` | `GET /hr/gratuity/:employeeId` | ✅ شغّال | = | حساب نظام العمل (م.84): شرائح + معامل تخفيض الاستقالة. |

### 1.E الأداء والتدريب وتقييم 360 والتطوير

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr/performance` | `pages/hr/performance.tsx` | `GET /hr/performance` | ✅ شغّال | = | قائمة حقيقية (JOIN employees)، KPIs/فلاتر/StarRating، RBAC. |
| `/hr/performance/create` | `pages/create/hr/performance-create.tsx` | `POST /hr/performance`, `/employees` | ⚠️ ناقص | = | الكفاءات/الأهداف تُسطَّح نصيًا؛ أعمدة `scores/strengths` لا تُملأ؛ المرفقات لا تُرسَل (M3). |
| `/hr/performance/advanced` | `pages/hr/performance-advanced.tsx` | `GET /hr/performance` | ✅ شغّال | = | تحليلات على نفس القائمة. |
| `/hr/performance/:id` | `pages/details/performance-detail.tsx` | `GET/PATCH/DELETE /hr/performance/:id` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C4 + M4** — استُبدل `:id/approve` غير الموجود بتقدّم حالة (`pending→in_progress→completed→acknowledged`) على `PATCH /hr/performance/:id`؛ اسم الحقل `improvements` صُحّح. |
| `/hr/training` | `pages/hr/training.tsx` | `GET /hr/training/{programs,enrollments,stats}`, `PATCH/DELETE` | ✅ شغّال | = | DB حقيقي، تصدير CSV، تحرير/حذف مضمّن؛ لا واجهة «إضافة تسجيل». |
| `/hr/training/create` | `pages/create/hr/training-create.tsx` | `POST /hr/training/programs` | ✅ شغّال | = | إدراج حقيقي + audit + event؛ ملاحظة باقية: 8+ حقول تُسقَط (M3). |
| `/hr/training/:id` | `pages/hr/training-detail.tsx` | `GET .../programs/:id`, `.../enrollments`, `PATCH .../{approve,reject}` | ✅ شغّال | = | بيانات حقيقية، اعتماد/رفض موجود. |
| `/hr/training/advanced` | `pages/hr/training-advanced.tsx` | `GET .../{stats,programs,enrollments}` | ✅ شغّال | = | تحليلات فقط، بيانات حقيقية. |
| `/hr/evaluation-360` | `pages/hr/evaluation-360.tsx` | `GET /hr/evaluation-cycles` | ✅ شغّال | = | دورات + درجات ملخّص حقيقية، RBAC. |
| `/hr/evaluation-360/create` | `pages/create/hr/evaluation-360-create.tsx` | `POST /hr/evaluation-cycles`, `/employees` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح M7** — مفتاح إبطال الكاش صار `evaluation-cycles` ⇒ القائمة تُحدَّث بعد الإنشاء. |
| `/hr/evaluation-360/:id` | `pages/hr/evaluation-360-detail.tsx` | `GET /hr/evaluation-cycles/:id` | ✅ شغّال | = | حمولة كاملة؛ رابط الرجوع صُحّح (M14). |
| `/hr/evaluation-360/:id/peer` | `pages/hr/evaluation-360-peer.tsx` | `POST .../:id/peer-evaluation` | ✅ شغّال | = | إدراج حقيقي، إعادة حساب الملخّص. |
| `/hr/evaluation-360/:id/upward` | `pages/hr/evaluation-360-upward.tsx` | `POST .../:id/upward-review` | ✅ شغّال | = | إدراج مجهول برمز HMAC، تجميع محدود بعتبة. |
| `/hr/evaluation-360/history/:employeeId` | `pages/hr/evaluation-360-history.tsx` | `GET /hr/employees/:id/evaluation-history` | ✅ شغّال | = | بيانات اتجاه حقيقية. |
| `/hr/development-plans` | `pages/hr/development-plans.tsx` | — | ⚠️ ناقص | = | ملف بسطر واحد `export { default } from "./idp"` — مسار مكرّر لنفس صفحة IDP (M13). |
| `/hr/idp` | `pages/hr/idp.tsx` | `GET/POST/PATCH /hr/idp`, `/employees` | ✅ شغّال | = | CRUD حقيقي على `employee_development_plans`، audit يدوي. |
| `/hr/turnover-report` | `pages/hr/turnover-report.tsx` | `GET /hr/turnover-report?year=` | ✅ شغّال | = | تجميع حقيقي؛ لا زر تصدير ملف (M16). |

### 1.F التوظيف والعقود

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr/recruitment` | `pages/hr/recruitment.tsx` | `GET/POST/PATCH/DELETE /hr/recruitment/{postings,applications}`, `/stats` | ✅ شغّال | = | بيانات حقيقية، تحرير/حذف مضمّن، RBAC الجانبين. |
| `/hr/recruitment/create` | `pages/create/hr/recruitment-create.tsx` | `POST .../postings` | ✅ شغّال | = | يحفظ؛ ملاحظة باقية: `vacancies/benefits/skills` تُسقَط (M3). |
| `/hr/recruitment/advanced` | `pages/hr/recruitment-advanced.tsx` | `GET .../{stats,applications}` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح M14** — المسار مسجَّل وقابل للوصول. |
| `/hr/recruitment/applicants/create` | `pages/create/hr/applicants-create.tsx` | `POST .../applications` | ✅ شغّال | = | يحفظ؛ `source/experience` تُسقَط (M3). |
| `/hr/recruitment/applications` | `pages/hr/application-list.tsx` | `GET .../applications` | ✅ شغّال | ⬆️ تعزيز | يحتوي زر **«تحويل لموظف»** للمتقدّمين بحالة `hired` ⇒ `/employees/create` بحقول مُعبّأة مسبقًا (C5). |
| `/hr/recruitment/jobs/:id` | `pages/hr/job-detail.tsx` | `GET .../postings/:id`, `.../applications`, `POST .../{close,reopen}` | ✅ شغّال | = | تفصيل + إغلاق/إعادة فتح بدورة حياة حقيقية؛ عدم تطابق إغلاق التوظيف وقت التشغيل صُحّح في #765؛ رابط الرجوع صُحّح (M14). |
| `/hr/contracts` | `pages/hr/contracts.tsx` | `GET /`, `POST /:id/{submit,approve,reject,sign-company,sign-employee,activate,renew,terminate}` | ✅ شغّال | = | قائمة + إجراءات آلة حالات حقيقية. |
| `/hr/contracts/create` | `pages/create/hr/contracts-create.tsx` | `POST /hr/contracts` | ✅ شغّال | = | يحفظ؛ الخلفية تحلّ التعيين الفعّال. |
| `/hr/contracts/:id` | `pages/details/hr-contract-detail.tsx` | `GET /hr/contracts/:id`, `POST /:id/{submit,approve,reject,sign-company,sign-employee,activate,renew,terminate}`, `PATCH /hr/contracts/:id` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C3** — مكوّن `ContractLifecycleActions` يقود كل انتقالات `POST` الحقيقية (بما فيها `sign-employee` و`renew` اللذين كانا بلا واجهة)؛ كتلة الاعتماد الخاطئة (`PATCH`/حالات وهمية/endpoint «return») أُزيلت. |
| `/hr/contracts/:id/edit` | `pages/create/hr/contracts-edit.tsx` | `GET/PATCH /hr/contracts/:id` | ✅ شغّال | 🆕 | صفحة تحرير جديدة (#733). |

### 1.G التأديب والمخالفات وإخلاء الطرف

| المسار | ملف الصفحة | API | الحكم | ↔ Rev 1 | ملاحظة |
|---|---|---|---|---|---|
| `/hr/violations` | `pages/hr/violations.tsx` | `GET /hr/discipline/{memos,stats}` | ✅ شغّال | = | الصفحة تعرض **مذكرات تأديب** (`hr_inquiry_memos`)؛ KPIs/تبويبات حقيقية. |
| `/hr/violations/create` | `pages/create/hr/violations-create.tsx` | `POST /hr/violations` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C7** — قيم النوع صارت الكنسية (`late/early_leave/absence/behavior/organization/custom`) ⇒ `resolveArticle` يحلّ المادة/العقوبة فعليًا. |
| `/hr/violations/management` | `pages/hr/violations-management.tsx` | `GET /hr/violations`, `/hr/violations-stats`, `PATCH /hr/violations/:id/approve` | ✅ شغّال | ⬆️ من ❌ | **أُصلح C7** — زر «الحل» ينادي `/hr/violations/:id/approve` الحقيقي؛ شرط الحالة الميتة (`active`) أُزيل. |
| `/hr/violations/:id` | `pages/hr/violation-detail.tsx` | `GET /hr/violations/:id`, `PATCH .../{approve,reject}` | ✅ شغّال | ⬆️ تأكيد | اعتماد عبر `applyTransition`؛ **العيب وقت التشغيل** (`column "updatedAt" does not exist`) أُغلق بـ migration 182 (`employee_violations.updatedAt`) — راجع §0. |
| `/hr/violations/penalty-escalation` | `pages/hr/penalty-escalation.tsx` | `GET /hr/violations` | ⚠️ ناقص | = | سُلّم التصعيد مثبَّت بالعميل لا من `hr_discipline_regulation` (M9). |
| `/hr/violations/auto-detection` | `pages/hr/auto-detection.tsx` | `GET/PUT .../auto-detection/settings`, `POST .../run`, `GET .../{log,summary}` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح M8** — استعلام `summary` صار يقرأ أعمدة موجودة ⇒ KPIs حقيقية. |
| `/hr/discipline/regulation` | `pages/hr/discipline-regulation.tsx` | `GET/PATCH /hr/discipline/regulation`, `POST .../reseed` | ✅ شغّال | = | كتالوج DB حقيقي، تحرير + reseed مع audit؛ لا create/delete في الواجهة. |
| `/hr/discipline/memos` | `pages/hr/discipline-memos.tsx` | — | ✅ شغّال | = | إعادة توجيه مقصودة إلى `/hr/violations?tab=memos`. |
| `/hr/discipline/memos/:id` | `pages/hr/discipline-memo-detail.tsx` | `GET .../memos/:id`, `POST .../{justify,manager-recommendation,gm-decision,cancel,appeal,appeal-decision,close}` | ✅ شغّال | = | آلة حالات كاملة؛ قرار المدير العام يحلّ العقوبة ويُدرج `attendance_deductions` (خصم راتب فعلي). |
| `/hr/exit` | `pages/hr/exit-requests.tsx` | `GET /hr/exit`, `PATCH /hr/exit/:id/approve` | ✅ شغّال | = | قائمة + إحصاءات، اعتماد مضمّن، RBAC. |
| `/hr/exit/create` | `pages/create/hr/exit-create.tsx` | `POST /hr/exit` | ✅ شغّال | = | حساب مكافأة خلفي (م.84/85)، رصيد إجازات، خصم سلف، 6 صفوف إخلاء + سلسلة اعتماد. |
| `/hr/exit/:id` | `pages/hr/exit-detail.tsx` | `GET /hr/exit/:id`, `PATCH /hr/exit/:id/approve`, `PATCH /hr/exit/clearance/:id`, `PATCH /hr/exit/:id/complete` | ✅ شغّال | ⬆️ من ⚠️ | **أُصلح C6 + M10** — إجراءا «تم الإخلاء» و«إتمام نهاية الخدمة» موصولان؛ أسماء حقول التسوية صُحّحت ⇒ الأرقام تظهر صحيحة. |

---

## 2. الثغرات الحرجة (Critical gaps)

> **الحالة العامة: 0 ثغرة حرجة مفتوحة.** الثمانية كلّها أُغلقت. مُدرَجة هنا كسجلّ تحقّق.

| # | الوصف (كما في Rev 1) | الحالة | الإغلاق |
|---|---|---|---|
| **C1** | خطأ تظليل المسارات يقتل 5 صفحات (`attendance/reports,field-tracking,qr-scanner`، `leaves/management,approval-chains`). | ✅ **مُغلَق** | `hrRoutes.tsx` يضع المسارات النصّية قبل `:id` مع تعليق توضيحي صريح (PR #727/#733). أُعيد التحقّق: الترتيب صحيح. |
| **C2** | دورة الرواتب لا تكتمل من الواجهة (مفردات حالة غير متطابقة، بطاقة اعتماد لا تظهر، الترحيل غير قابل للوصول). | ✅ **مُغلَق** | `payroll-detail.tsx`: `STATUS_LABELS` = `pending_approval/completed/posted`؛ لوحة دورة حياة تنادي `PATCH /payroll/:id/approve` ثم `PATCH /payroll/:id {status:"posted"}` (#733). |
| **C3** | دورة العقود غير قابلة للوصول بعد `approved` (فعل/حالات اعتماد خاطئة، `sign-employee`/`renew` بلا واجهة). | ✅ **مُغلَق** | `ContractLifecycleActions` يقود كل انتقالات `POST` الحقيقية (#733). |
| **C4** | اعتماد تقييم الأداء مكسور — `PATCH /performance/:id/approve` غير موجود. | ✅ **مُغلَق** | استُبدل بتقدّم حالة على `PATCH /performance/:id`؛ أُعيد التحقّق: `hr.ts` يعرّف `GET/POST/PATCH/DELETE /performance` فقط، ولا endpoint `/approve` — والواجهة لم تعد تطلبه (#733). |
| **C5** | جسر «التوظيف → موظف» غير موجود. | ✅ **مُغلَق** | تحويل **موجَّه**: زر «تحويل لموظف» في `application-list.tsx` يفتح `/employees/create` بحقول مُعبّأة. الإدراج التلقائي غير ممكن (المتقدّم يحمل اسم/بريد/هاتف فقط، بينما الموظف يلزمه هوية/جنسية/قسم/راتب/عقد) — قرار تصميم سليم (#733). |
| **C6** | إخلاء الطرف لا يُتمّ من الواجهة (`complete`/`clearance` بلا مستدعٍ). | ✅ **مُغلَق** | `exit-detail.tsx`: `clearanceMut` → `PATCH /hr/exit/clearance/:id`، `completeMut` → `PATCH /hr/exit/:id/complete` (#733). |
| **C7** | إنشاء المخالفة اليدوية + «حل» المخالفة مكسوران (أنواع عربية، حقل `status` مرفوض، حالة `active` ميتة). | ✅ **مُغلَق** | أنواع كنسية في `violations-create.tsx`؛ `violations-management.tsx` ينادي `/violations/:id/approve` (#733). **+ عيب وقت التشغيل** (`employee_violations.updatedAt` مفقود ⇒ 500) أُغلق بـ migration 182 (#738/#753) و#758. |
| **C8** | أزرار «تعديل» ميتة عبر 6 صفحات تفصيل. | ✅ **مُغلَق** | 5 صفحات تحرير + مساراتها (transfer/attendance/excuse/leave/contract) + 3 endpoints `PATCH` جديدة؛ زر تعديل الرواتب أُزيل عمدًا (`payroll_runs` بلا أعمدة قابلة للتحرير) (#733). |

**عيب على مستوى المحرّك — أُغلق:** كان `applyTransition` يكتب `"updatedAt"=NOW()` على كل جدول دورة حياة؛ ثلاثة جداول HR كانت تفتقد العمود (`employee_violations`, `employee_transfers`, `job_postings`) ⇒ خطأ 500 / SQLSTATE 42703 عند الاعتماد. أُغلق جذريًا: **migration 182** (`employee_violations`) + **migration 183** (`employee_transfers`, `job_postings`)، مع توحيد سلوك `updatedAt` عبر جداول دورة حياة HR (#758).

---

## 3. الثغرات المتوسطة (Medium gaps)

> **مُغلَق منذ Rev 1 (7):** M2 (سقف الأقسام) · M4 (`improvements`) · M7 (مفتاح إبطال eval-360) · M8 (SQL auto-detection) · M10 (أسماء حقول التسوية) · M11 (رفض/إرجاع العذر) · M14 (روابط رجوع ميتة).

**المتبقّي مفتوحًا (11):**

| # | الثغرة | الأثر | الحالة |
|---|---|---|---|
| M1 | **branchId غير مُطبَّق على كثير من قراءات `/hr`** — الواجهة ترسل `branchIds` لكن المعالِجات تُصفّي `companyId` فقط. | منتقي الفرع لا يضيّق هذه القوائم. | **مفتوح — خارج نطاق HR.** صميم #685 Scope Normalization؛ يُعالَج هناك. |
| M3 | **انجراف حمولة نماذج الإنشاء** — حقول تُرسَل وتُسقطها مخططات zod بصمت: recruitment-create، applicants-create، training-create (8+)، performance-create (الدرجات المهيكلة)، payroll-create (`scope/reference/notes`)، shifts-create (`gracePeriod`). | فقدان بيانات / حقول واجهة بلا أثر. | مفتوح. |
| M5 | `salary-components`: لا update/delete؛ عمود `status` ملفّق. | المكوّنات لا تُحرَّر/تُعطَّل. | مفتوح — أُعيد التحقّق: `hr.ts` يعرّف `POST /salary-components` فقط. |
| M6 | `payroll-detail` مُصمَّم كقسيمة موظف فردي بينما `GET /hr/payroll/:id` يُرجِع تجميع تشغيل متعدد. | `overtime/bonus/employeeName/paymentMethod/bankAccount` تُعرض فارغة. | مفتوح (دورة الرواتب نفسها صارت قابلة للقيادة عبر C2). |
| M9 | `penalty-escalation` سُلّم التصعيد مثبَّت بالعميل لا من `hr_discipline_regulation`. | الصفحة غير مرتبطة بالعقوبات الحقيقية. | مفتوح. |
| M12 | `leaves-create` قيم `leaveTypeId` احتياطية مثبتة (1–5) عند فراغ `leave-types`. | إرسال معرّفات قد لا توجد ⇒ `NotFoundError`. | مفتوح. |
| M13 | `development-plans.tsx` مجرّد `export { default } from "./idp"` ⇒ مساران لنفس الصفحة. | مسار مكرّر. | مفتوح — أُعيد التحقّق: الملف لا يزال سطرًا واحدًا. |
| M15 | **أحداث منبعثة بلا مستهلك** — `hr.contract.*`, `hr.loan.*`, `hr.overtime.*`, `hr.exit.*`, `training.*`, `recruitment.*` تُبعَث لكن لا listener (تصل `event_logs` فقط). | لا أثر جانبي event-driven رغم تصنيف بعضها `critical` في `eventCatalog`. | مفتوح. |
| M16 | لا تصدير ملفات لـ violations/loans/overtime/exit/contracts/recruitment/قائمة الموظفين/turnover (JSON فقط). فقط الرواتب والحضور لهما Excel/PDF حقيقي. | فجوة تقارير. | مفتوح. |
| M17 | لا آلة حالات مُسجَّلة مركزيًا لـ `payroll_runs`, `hr_employee_loans`, `hr_overtime_requests`, `employee_contracts/transfers` — تعتمد قوائم `fromStates` محلية. | اتساق دورة الحياة غير مركزي. | مفتوح جزئيًا — #758 وحّد سلوك `updatedAt` لكن لم يُسجِّل آلات حالات لهذه الكيانات. |
| M18 | `onboarding-review` للقراءة فقط ومشتق من `hireDate`؛ لا واجهة لتعليم الخطوات. | لا إدارة فعلية للتعيين. | مفتوح. |

---

## 4. عدم تطابق UI-only / API-only

### 4.1 API موجود بلا واجهة (API-without-UI)
- **بلا أي مستهلك:** `GET/PUT /hr/attendance-policy` · `POST /hr/accruals/monthly` + `GET /hr/accruals/preview` · `GET/POST /hr/company-documents` · `GET/POST /hr/delegations` · `GET/POST/DELETE /hr/approval-chain-definitions` · `PUT /hr/onboarding-steps` · `GET/PATCH /employees/onboarding-tasks`.
- **endpoint بلا زر:** `DELETE /hr/payroll/:id` · `POST /hr/leave-requests/:id/cancel` (يُعيد الرصيد) · `DELETE /hr/leave-requests/:id` · `PATCH /hr/leave-requests/:id/escalate` · `POST/DELETE /hr/discipline/regulation` · `DELETE /hr/violations/:id` · `GET /hr/discipline/penalty-preview` · `GET /hr/discipline/employee/:id/summary` · `POST /hr/training/enrollments` (لا واجهة «تسجيل موظف») · `GET /hr/evaluation-cycles/:id/{summary,system-report}` · `GET /hr/upward-reviews/manager/:managerId`.
- **استُهلك منذ Rev 1:** `PATCH /hr/{transfers,attendance,excuse-requests}/:id` · `PATCH /hr/contracts/:id` · `POST /hr/contracts/:id/{sign-employee,renew}` · `PATCH /hr/payroll/:id` (الترحيل) · `PATCH /hr/leave-requests/:id` · `PATCH /hr/exit/:id/complete` + `clearance/:id`.

### 4.2 واجهة تنادي API غير موجود (UI-without-API)
- **لا شيء مفتوح.** كل عناصر Rev 1 (المسارات الستة `/.../:id/edit`، `PATCH /performance/:id/approve`، إجراء «return» في العقد، حقل `status` في إدارة المخالفات، إجراء «إرجاع» العذر) أُغلقت في #733.

### 4.3 التباس كيانات / تسمية (بلا تغيير — توثيق فقط)
- صفحة `/hr/violations` تعرض `hr_inquiry_memos` (مذكرات)، بينما `/hr/violations/management` تعرض `employee_violations` — كيانان خلف مسارين متشابهين.
- التباس تسمية فقط (لا جداول مفقودة): `hr_contracts`→`employee_contracts`، `hr_discipline_memos`→`hr_inquiry_memos`، `hr_official_letters`→`official_letters`.
- `hr_violations` و`employee_violations` كلاهما موجود — تكرار/إرث محتمل.

---

## 5. ما يحتاج تحقّقًا تشغيليًا (Runtime validation)

> أمور لا يحسمها التتبّع الثابت. (#733 ضمّ أدلّة smoke إيجابية لمسارات C3/C4/C7؛ ما يلي يبقى مفتوحًا للتأكيد على دفتر أستاذ حقيقي / بيانات حقيقية.)

1. **ازدواج ترحيل قيد الرواتب** — `postPayrollRunGL` (وقت التشغيل) مقابل `postPayrollPostGL` (`PATCH :id`): يبدوان متكاملين (استحقاق مصروف مقابل صرف بنكي) و`hrEngine` يحمل `sourceKey` idempotency، لكن C2 وصل زرّ الترحيل فقط ولم يلمس منطق GL ⇒ يجب تأكيده على تشغيل حقيقي مقابل الأستاذ.
2. **مطابقة فترة الإضافي بالراتب** — تشغيل الراتب يجمع `hr_overtime_requests` بحالة `approved` عبر `TO_CHAR` — يحتاج تأكيدًا.
3. **استهلاك `attendance_deductions`** — قرار المدير العام يُدرج صفوفًا؛ تأكيد أن `type` (`penalty`/`violation`) يطابق ما يقرأه تشغيل الراتب.
4. **بوابات الأدوار الخلفية الصلبة** — `PAYROLL_ROLES`/`LOAN_APPROVAL_ROLES` مقابل سلاسل `hr:*` على `GuardedButton`؛ قد يرى المستخدم زرًّا مُفعَّلًا ثم يحصل 403 (سلوك maker-checker مقصود في الرواتب).
5. **`/hr/employees-status`** — يستدعي `computeEmployeeOperationalStatus` لكل موظف (حتى 500) — قلق N+1، يحتاج قياس أداء.
6. **`/entity-meta/bulk-action`** لـ `leave-request` — تأكيد أن الاعتماد الجماعي يطبّق آثار الرصيد/الحضور كالاعتماد المرحلي.
7. **سلوك branchId في قراءات `/hr`** — قرار منتج (على مستوى الشركة أم انحدار) — ضمن #685.
8. **تحويل «التوظيف → موظف» (C5)** — تأكيد أن الحقول المُعبّأة مسبقًا في `/employees/create` تكفي وأن إنشاء الموظف ينجح ويُغلق دورة المتقدّم.

---

## 6. توصية ترتيب الـ PR لاحقًا (لا تُفتَح PR الآن)

> الثغرات الحرجة كلّها أُغلقت. ما تبقّى تحسينات متوسطة. مرتّبة حسب (العائد ÷ الجهد).

| # | PR المقترح | يعالج | الجهد | المخاطر |
|---|---|---|---|---|
| **PR-1** | تنظيف انجراف حمولة النماذج — مواءمة حقول الواجهة مع مخططات zod (أو إزالتها) | M3 | منخفض | منخفضة جدًا — **ابدأ هنا** |
| **PR-2** | `salary-components` — إضافة `PATCH/DELETE` + عمود `status` حقيقي | M5 | منخفض | منخفضة |
| **PR-3** | تنظيفات صغيرة — توحيد `development-plans` مع `idp`؛ معالجة `leaveTypeId` الاحتياطية | M12، M13 | تافه | منخفضة جدًا |
| **PR-4** | `penalty-escalation` — قراءة سُلّم التصعيد من `hr_discipline_regulation` | M9 | متوسط | منخفضة |
| **PR-5** | إعادة تصميم `payroll-detail` كملخّص تشغيل متعدد لا قسيمة فردية | M6 | متوسط | منخفضة |
| **PR-6** | سطح API-without-UI — واجهات لـ delegations / accruals / approval-chain-definitions / onboarding-steps | §4.1، M18 | متوسط–مرتفع | منخفضة |
| **PR-7** | تصدير ملفات للقوائم الناقصة (violations/loans/overtime/exit/contracts/recruitment/turnover) | M16 | متوسط | منخفضة |
| **PR-8** | listeners للأحداث المنبعثة بلا مستهلك (`hr.*` critical) | M15 | متوسط | متوسطة (آثار جانبية) |
| **PR-9** | تسجيل آلات حالات مركزية لـ `payroll_runs/loans/overtime/contracts/transfers` | M17 | مرتفع | متوسطة (يلامس دورة الحياة) |

**استثناء صريح:** **M1 (branchId scope)** **لا تدخل** أي PR من HR — صميم **#685 Scope Normalization** (`docs/audit/SCOPE_NORMALIZATION_RCA_685.md`). تُعالَج وتُنسَّق هناك.

---

## 7. حالة المحرّكات والبنية التحتية (مرجع)

- **المحرّكات حقيقية وموضوعية:** `hrEngine` (8 طرق ترحيل GL متوازنة بفحص debit=credit + `sourceKey` idempotency)؛ `disciplineEngine` (حلّ المواد، عدّ التكرار، تحليل نص العقوبة العربي)؛ `autoViolationEngine` (مسح حضور كامل بحراسة idempotency)؛ `hrHelpers` (حسابات نظام العمل السعودي)؛ `lifecycleEngine` (آلات حالات ذرّية لـ `hr_leave_requests/hr_exit_requests/hr_inquiry_memos`).
- **توحيد `updatedAt`:** بعد #758، آلة `applyTransition` متّسقة مع كل جداول دورة حياة HR — لا جدول دورة حياة يفتقد العمود الذي تكتبه (migrations 182 + 183).
- **RBAC نظيف:** كل سلسلة `feature` في `authorize()` معرّفة في `featureCatalog.ts`؛ **لا مسار HR mutation بلا `authorize()`**؛ لا فجوة fail-closed.
- **Audit:** `auditMiddleware` يغطّي تلقائيًا `/employees`, `/hr/leaves`, `/hr/leave-requests`, `/hr/check-in/out`, `/hr/violations`, `/hr/official-letters`, `/hr/performance`, `/hr/payroll`, `/hr/evaluation-cycles`, `/hr/loans`, `/hr/training`. المسارات خارج الخريطة (`contracts/discipline/exit/overtime/recruitment/transfers/idp/shifts/excuse/public-holidays`) تبعث `createAuditLog`+`emitEvent` يدويًا على عمليات الإنشاء/الاعتماد.
- **المخطّط:** كل جداول HR الأساسية موجودة (`db/schema_pre.sql` + migrations 182/183 الأحدث). لا جداول مفقودة (راجع §4.3 لالتباس التسمية).

---

## 8. سجلّ التغيّر (Rev 1 → Rev 2)

| التتبّع | التاريخ | المرجع |
|---|---|---|
| Rev 1 — التتبّع الأصلي (54✅/17⚠️/9❌) | 2026-05-20 | هذا الملف، النسخة السابقة |
| إغلاق C1–C8 + M2/M4/M7/M8/M10/M11/M14 | 2026-05-21 | PR #733 `hr(functional): restore end-to-end operational flows` |
| إغلاق عيب `updatedAt` على المحرّك | 2026-05-21 | PR #738، #753 (migration 182)، #743، #758 (migration 183، توحيد جذري)، #765 (دلالات النقل + إغلاق التوظيف) |
| Rev 2 — إعادة تحقّق ثابتة (71✅/9⚠️/0❌) | 2026-05-21 | هذا الملف |

---

*انتهى التقرير. تدقيق ثابت فقط — لم يُعدَّل أي كود، ولم تُفتَح أي PR، ولم يُمَس أي نطاق خارج HR.*
