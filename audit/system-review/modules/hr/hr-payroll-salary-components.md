# /hr/payroll/salary-components — `artifacts/ghayth-erp/src/pages/hr/salary-components.tsx`

## 1. الميتاداتا
- المسار: `/hr/payroll/salary-components`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/salary-components.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:104`
- المجموعة: `hr`
- الكومبوننت: `SalaryComponents`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `salary-components`
- سطور الملف: 180
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L133: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/salary-components`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

مكوّنات الراتب — Salary components (earnings + deductions).

| المكوّن | النوع | GOSI eligible? | Tax? |
|---------|------|----------------|------|
| Basic salary (راتب أساسي) | earning | ✅ | depends |
| Housing allowance (بدل سكن) | earning | usually no | depends |
| Transportation allowance | earning | usually no | depends |
| Phone allowance | earning | no | depends |
| Performance bonus | earning | yes (subject to GOSI) | yes |
| Overtime pay | earning | yes | yes |
| Night shift differential | earning | yes | yes |
| GOSI deduction (employee) | deduction | — | — |
| GOSI deduction (employer) | employer cost | — | — |
| Loan repayment | deduction | — | — |
| Violation deduction | deduction | — | — |
| Garnishment (لو court order) | deduction | — | — |
| Custody settlement | deduction | — | — |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List components per employee | GET `/hr/salary-components/:employeeId` | `salary_components` | ✅ |
| Add component | POST | with effective date | ✅ |
| Update component (with history) | PATCH + create snapshot | راجع `audit_logs` | ✅ critical |
| Deactivate component | with effective date | ✅ |
| Bulk update (per role/department) | bulk | with approval | ⚠ |
| Validate min wage (Saudi Labor Law) | server-side | ✅ critical |
| Calculate gross/net | derived | for payroll | ✅ critical |
| GOSI calculation | per Saudi law | راجع `hr-payroll.md` | ✅ critical |
| WPS file generation | راجع `admin-integrations.md` (Mudad) | ✅ critical |
| Component history (audit trail) | snapshots | ✅ critical |
| تكامل مع `hr-payroll.md` (monthly run) | ✅ critical |
| تكامل مع `hr-contracts.md` (linked to contract) | ✅ |
| تكامل مع GOSI (calculation + reporting) | ✅ critical |
| تكامل مع Mudad (WPS submission) | ✅ critical |
| تكامل مع `finance-payroll-posting.md` (GL) | ✅ critical |
| Audit log إجباري | كل تغيير راتب | `audit_logs` | ✅ critical |
| **PDPL** — most sensitive HR data | restricted | ✅ critical |
| RBAC | hr-manager + finance + payroll-officer | ✅ critical |

تحقق يدوي:
- [ ] هل GOSI calculation accurate per latest regulation rates?
- [ ] هل minimum wage validation enforced?
- [ ] هل component changes effective-dated (لا retroactive without approval)?
- [ ] هل WPS file format matches latest Mudad spec?
- [ ] هل bulk updates require multi-level approval?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `salary-components` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/payroll/salary-components`
- لقطة: `audit/screenshots/hr_payroll_salary_components.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
