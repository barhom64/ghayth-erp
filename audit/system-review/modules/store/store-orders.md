# /store/orders — `artifacts/ghayth-erp/src/pages/create/store/products-create.tsx`

## 1. الميتاداتا
- المسار: `/store/orders`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/store/products-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/storeRoutes.tsx:13`
- المجموعة: `store`
- الكومبوننت: `ProductsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `orders`
- سطور الملف: 96
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L59: "مسح المسودة" → `clearDraft`
- L88: "(بلا تسمية)" → `() => setLocation("/store")` 🔒
- L89: "(بلا تسمية)" 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/store.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `orders` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/store/orders`
- لقطة: `audit/screenshots/store_orders.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
