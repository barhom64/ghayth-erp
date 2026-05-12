# /store — `artifacts/ghayth-erp/src/pages/store.tsx`

## 1. الميتاداتا
- المسار: `/store`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/store.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/storeRoutes.tsx:10`
- المجموعة: `store`
- الكومبوننت: `Store`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `store`
- سطور الملف: 347
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L118: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L127: "(بلا تسمية)" → `() => setShowForm(false)`
- L214: "(بلا تسمية)"
- L252: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L261: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/store/products`
- GET `/store/orders`
- GET `/store/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/store.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `store` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L314 _(inline-data-array)_: `const statCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/store`
- لقطة: `audit/screenshots/store.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
