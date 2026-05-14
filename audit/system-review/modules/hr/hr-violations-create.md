# /hr/violations/create — `artifacts/ghayth-erp/src/pages/create/hr/violations-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/violations/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/violations-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:132`
- المجموعة: `hr`
- الكومبوننت: `ViolationsCreate`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 454
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/violations` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L162: "(بلا تسمية)"
- L363: "(بلا تسمية)" → `() => setLocation("/hr/violations")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تسجيل مخالفة موظف — disciplinary action per Saudi Labor Law.

| نوع المخالفة | الأمثلة | الجزاء |
|------------|---------|--------|
| Tardiness (تأخر) | repeated | warning / deduction |
| Absence (غياب) | unauthorized | deduction + warning |
| Insubordination | عصيان | written warning |
| Negligence | إهمال | written warning + deduction |
| Misconduct | سوء سلوك | depending on severity |
| Theft / Fraud | سرقة/احتيال | termination + legal action |
| Safety violation | مخالفة سلامة | warning + training |
| Confidentiality breach | إفشاء سر | termination + legal |
| Traffic violation (لو driver) | راجع `fleet-traffic-violations-byid.md` | as per fleet |

| التدرّج (per Saudi Labor Law Article 80) | الإجراء |
|-------------------------------------------|---------|
| 1st offense | verbal warning |
| 2nd offense | written warning |
| 3rd offense | financial penalty (max 1/2 day pay) |
| 4th offense | suspension (max 5 days/year) |
| Severe | direct termination per MA 80 |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create violation | POST `/hr/violations` | `employee_violations` | ✅ |
| Auto-determine penalty level | based on history | per regulation | ⚠ |
| Manager input | description + evidence | mandatory | ✅ |
| Employee acknowledgment | signature | required | ⚠ |
| Employee dispute (grievance) | راجع `hr-grievance.md` | ⚠ |
| Approval workflow | manager → HR → maybe legal | راجع `governance/approvals.md` | ✅ |
| Apply penalty (deduction) | راجع `hr-payroll.md` | salary deduction | ✅ critical |
| Apply penalty (suspension) | راجع `hr-attendance.md` | days off without pay | ✅ |
| Update employee file | history | راجع `employees-byid.md` | ✅ |
| Issue official letter | راجع `print-templates` | ✅ |
| GL entry — penalty income (لو فيه) | Dr Salary Payable / Cr Other Income | rare | ⚠ |
| Termination trigger (لو severe) | راجع `hr-exit.md` | ✅ critical |
| تكامل مع `hr-payroll.md` (deduction) | ✅ critical |
| تكامل مع `hr-discipline-regulation.md` (rules) | راجع doc | ✅ |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| تكامل مع `legal.md` (لو escalates) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| **PDPL** — confidentiality | restrict to HR + manager | ✅ critical |
| RBAC | manager + hr-manager | ✅ |

تحقق يدوي:
- [ ] هل penalty escalation يتبع Saudi Labor Law بدقة (max 1/2 day pay)؟
- [ ] هل employee acknowledgment mandatory قبل تطبيق الـ penalty؟
- [ ] هل dispute process له deadline (15 يوم typically)?
- [ ] هل severe violations تستدعي legal review قبل termination?
- [ ] هل violation history يطلق training مقترح؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/violations/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_violations_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
