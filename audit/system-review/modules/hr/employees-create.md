# /employees/create — `artifacts/ghayth-erp/src/pages/create/employees-create.tsx`

## 1. الميتاداتا
- المسار: `/employees/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/employees-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:89`
- المجموعة: `hr`
- الكومبوننت: `EmployeesCreate`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 483
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/employees` | POST | ✅ | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L185: "(بلا تسمية)"
- L206: "(بلا تسمية)" → `() => setLocation("/employees")`
- L219: "مسح المسودة" → `clearDraft`
- L475: "(بلا تسمية)" → `() => setLocation("/employees")` 🔒
- L476: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء موظف جديد — Employee onboarding.

| الحقل | المتطلب |
|------|--------|
| Full name (Ar/En) | إجباري |
| National ID (Saudi) / Iqama (expat) | إجباري — unique per tenant |
| Date of birth | إجباري |
| Nationality | enum |
| Gender | enum |
| Religion | optional |
| Marital status | for benefits |
| Contact (phone, email, address) | إجباري |
| Emergency contact | إجباري |
| Photo | optional |
| Bank account | for payroll | encrypted |
| Department + Position | راجع `settings-departments.md` |
| Manager | FK | إجباري |
| Hire date | إجباري — affects GOSI/gratuity |
| Salary components | راجع `hr-payroll-salary-components.md` | إجباري |
| Contract | linked | راجع `hr-contracts.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create employee | POST `/employees` | `employees` | ✅ |
| Validate ID uniqueness | server-side | unique per tenant | ✅ critical |
| Validate Iqama (لو expat) | external API | راجع `admin-integrations.md` | ⚠ |
| Create linked user account | auto | راجع `admin-users.md` | ✅ critical |
| Register with GOSI | external | راجع `admin-integrations.md` | ✅ critical |
| Register with Qiwa | external | راجع `admin-integrations.md` | ✅ |
| Create initial contract | راجع `hr-contracts.md` | ✅ critical |
| Set salary components | راجع `hr-payroll-salary-components.md` | ✅ critical |
| Generate employee ID/badge | راجع `print-templates` | ⚠ |
| Encrypt bank info | at-rest | ✅ critical |
| Photo upload | راجع `documents.md` | ✅ |
| Setup IT access | راجع `admin-users.md` | ⚠ |
| Initial leave balance | راجع `hr-leave-balances.md` | ✅ |
| Notification (onboarding) | event=`employee_created` | راجع `notifications.md` | ✅ |
| تكامل مع `admin-users.md` (user account) | ✅ critical |
| تكامل مع GOSI | mandatory | ✅ critical |
| تكامل مع `hr-contracts.md` (initial contract) | ✅ critical |
| تكامل مع `hr-payroll.md` (active payroll) | ✅ critical |
| Audit log إجباري | `audit_logs` | ✅ critical |
| **PDPL** — encryption + consent collection | ✅ critical |
| RBAC | hr-manager + admin for user account | ✅ critical |

تحقق يدوي:
- [ ] هل GOSI registration mandatory + automatic؟
- [ ] هل ID uniqueness enforced at DB?
- [ ] هل bank info encrypted at-rest (column-level)?
- [ ] هل PDPL consent collected + stored?
- [ ] هل onboarding workflow generates initial leave balance per policy?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/employees/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/employees_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
