# /hr/payroll/create — `artifacts/ghayth-erp/src/pages/create/hr/payroll-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/payroll/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/payroll-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:103`
- المجموعة: `hr`
- الكومبوننت: `PayrollCreate`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 191
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/payroll` | POST | — | — | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L85: "مسح المسودة" → `clearDraft`
- L183: "(بلا تسمية)" → `() => setLocation("/hr/payroll")` 🔒
- L184: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
- GET `/employees${scopeSuffix}`
- GET `/settings/branches`



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
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/payroll/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_payroll_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
