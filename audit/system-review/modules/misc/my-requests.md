# /my-requests — `artifacts/ghayth-erp/src/pages/dashboard.tsx`

## 1. الميتاداتا
- المسار: `/my-requests`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:65`
- المجموعة: `misc`
- الكومبوننت: `Dashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-requests`
- سطور الملف: 979
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/hr/check-in` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||
| _(call)_ | `/hr/check-out` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

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
- [ ] **TBD** — راجع `docs/blueprints/misc.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-requests` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/my-requests`
- لقطة: `audit/screenshots/my_requests.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
