# /hr/idp — `artifacts/ghayth-erp/src/pages/hr/idp.tsx`

## 1. الميتاداتا
- المسار: `/hr/idp`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/idp.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:157`
- المجموعة: `hr`
- الكومبوننت: `IDP`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `idp`
- سطور الملف: 279
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/idp` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L197: "(بلا تسمية)" → `() => setShowForm(true)`
- L238: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/idp`
- GET `/employees?status=active&limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `idp` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L92 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/idp`
- لقطة: `audit/screenshots/hr_idp.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
