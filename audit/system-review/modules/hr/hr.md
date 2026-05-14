# /hr — `artifacts/ghayth-erp/src/pages/hr.tsx`

## 1. الميتاداتا
- المسار: `/hr`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:87`
- المجموعة: `hr`
- الكومبوننت: `HR`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `hr`
- سطور الملف: 318
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

وحدة الموارد البشرية الرئيسية — entry point لكل وظائف HR.

| القسم الفرعي | الوصف | المرجع |
|--------------|------|--------|
| Employees | الموظفون | راجع `employees.md` |
| Attendance | الحضور والانصراف | راجع `hr-attendance.md` |
| Leaves | الإجازات | راجع `hr-leaves.md` |
| Payroll | المرتبات | راجع `hr-payroll.md` |
| Contracts | العقود | راجع `hr-contracts.md` |
| Evaluations | تقييم الأداء | راجع `hr-evaluations.md` |
| Training | التدريب | راجع `hr-training.md` |
| Violations | المخالفات | راجع `hr-violations.md` |
| Loans | السلف | راجع `hr-loans.md` |
| Transfers | النقل | راجع `hr-transfers.md` |
| Exit | إنهاء الخدمة | راجع `hr-exit.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Landing dashboard | GET `/hr` | aggregations | ✅ |
| Headcount summary | per branch/department | aggregate | ✅ |
| Active vs inactive | count | ✅ |
| Pending approvals (my queue) | manager queue | راجع `governance/approvals.md` | ✅ |
| Quick actions | new employee, attendance, etc. | navigation | ✅ |
| تكامل مع `governance.md` (HR approval workflows) | ✅ |
| تكامل مع Saudi MoL (Qiwa) | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع GOSI | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع Mudad (WPS) | راجع `admin-integrations.md` | ✅ critical |
| **PDPL** — مستوى confidentiality عالي | ✅ critical |
| RBAC | hr-manager + scope per employee | راجع `admin-rbac-matrix.md` | ✅ critical |
| Audit log إجباري | كل وصول للموظفين | `access_logs` + `audit_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل manager يرى فقط team تحت إدارته؟
- [ ] هل employees يستطيعون تعديل بياناتهم الشخصية؟
- [ ] هل GOSI/Qiwa/Mudad sync حالة tracking ظاهر للـ HR manager؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `hr` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr`
- لقطة: `audit/screenshots/hr.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
