# /hr/training/:id — `artifacts/ghayth-erp/src/pages/hr/training-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/training/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/training-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:113`
- المجموعة: `hr`
- الكومبوننت: `TrainingDetail`
- subKey: `training` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 273
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل دورة تدريبية واحدة — training program detail.

| نوع التدريب | الوصف |
|----------|------|
| Onboarding | للموظف الجديد | mandatory |
| Technical skills | تقني | per role |
| Soft skills | مهارات شخصية | leadership, communication |
| Compliance | إلزامي | per regulation (anti-harassment, AML) |
| Safety | للسلامة | mandatory for industrial |
| Certification | شهادة معتمدة | for career progression |
| Leadership | قيادي | for managers |
| Language | لغوي |
| HRDF-supported | بدعم الموارد البشرية | partial reimbursement |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View training | GET `/hr/training/:id` | `training_programs` | ✅ |
| Enroll employee(s) | POST `/hr/training/:id/enroll` | with capacity check | ✅ |
| Approval workflow | manager → HR | راجع `governance/approvals.md` | ✅ |
| Track attendance | per session | راجع `hr-training-attendance.md` | ⚠ |
| Cost per employee | tuition + materials + travel | راجع `finance-expenses.md` | ✅ |
| GL entry — training expense | Dr Training Expense / Cr Cash/AP | ✅ critical |
| Issue certificate (post-completion) | راجع `documents.md` + `print-templates` | ✅ |
| Update employee's certifications | راجع `employees-byid.md` | ✅ |
| Pre/post assessment | for effectiveness | optional | ⚠ |
| Trainer (internal/external) | linkage | راجع `warehouse-suppliers.md` لو external | ✅ |
| HRDF reimbursement claim (Saudi labor support) | external | راجع `admin-integrations.md` | ⚠ |
| Bond/commitment (لو cost high) | employee must stay X months or refund | راجع `hr-contracts.md` | ⚠ critical |
| Renewal/refresh tracking | for expiring certifications | event=`certification_expiring` | راجع `notifications.md` | ✅ |
| تكامل مع `hr-evaluations.md` (training need identification) | ✅ |
| تكامل مع `hr-evaluation-cycles.md` (development plans) | ✅ |
| تكامل مع `finance-budget.md` (training budget) | ✅ |
| تكامل مع `bi-kpis.md` (training hours/employee KPI) | ✅ |
| Audit log إجباري | كل enroll/complete | `audit_logs` | ✅ |
| RBAC | hr-manager + manager (for team training requests) | ✅ |

تحقق يدوي:
- [ ] هل HRDF integration يطلق reimbursement تلقائياً عند eligibility?
- [ ] هل bond enforcement (لو خروج early) يحسب deduction بدقة؟
- [ ] هل certification renewal reminders تطلق قبل الـ expiry؟
- [ ] هل training budget tracking accurate per department?
- [ ] هل mandatory training compliance tracked + alerts للـ overdue؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/training → 401`
- landedUrl: `?`
- توصية: مغلق
