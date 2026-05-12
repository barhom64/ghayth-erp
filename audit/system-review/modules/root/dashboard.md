# /dashboard — `Dashboard`

## 1. الميتاداتا
- المسار: `/dashboard`
- ملف الصفحة: `—`
- مسجّلة في: `artifacts/ghayth-erp/src/App.tsx:125`
- المجموعة: `root`
- الكومبوننت: `Dashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `dashboard`
- سطور الملف: 979
- مصدر موجود: —

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/check-in` | POST | ✅ | — | — | — | ✅ | ✅ | — |
| _(write)_ | `/hr/check-out` | POST | ✅ | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L272: "(بلا تسمية)" → `handleCheckIn` 🔒
- L282: "(بلا تسمية)" → `handleCheckOut` 🔒
- L519: "عرض الكل"
- L530: "(بلا تسمية)" → `() => setLocation("/tasks")`
- L576: "عرض الكل"
- L734: "(بلا تسمية)"
- L838: "(بلا تسمية)" → `() => setLocation("/finance/invoices/create")`
- L879: "(بلا تسمية)" → `() => setLocation("/hr/attendance")`

### القراءات (GET)
- GET `/my-space`
- GET `/intelligence/suggestions`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/root.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `dashboard` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=PASS | fetch=PASS | CTA=SKIP | nav=PASS | smoke=PASS
- landedUrl: `http://localhost/dashboard`
- توصية: مغلق
