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
| _(write)_ | `/employees` | POST | — | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L185: "(بلا تسمية)"
- L206: "(بلا تسمية)" → `() => setLocation("/employees")`
- L219: "مسح المسودة" → `clearDraft`
- L475: "(بلا تسمية)" → `() => setLocation("/employees")` 🔒
- L476: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L23 _(inline-data-array)_: `const OPERATIONS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/employees/create`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
