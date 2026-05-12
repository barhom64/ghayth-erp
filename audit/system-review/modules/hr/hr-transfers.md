# /hr/transfers — `artifacts/ghayth-erp/src/pages/hr/transfers.tsx`

## 1. الميتاداتا
- المسار: `/hr/transfers`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/transfers.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:154`
- المجموعة: `hr`
- الكومبوننت: `Transfers`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `transfers`
- سطور الملف: 298
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/transfers` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L206: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L238: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/transfers`
- GET `/employees?status=active&limit=200`
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `transfers` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/transfers`
- لقطة: `audit/screenshots/hr_transfers.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
