# /umrah/pilgrims/:id — `artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx`

## 1. الميتاداتا
- المسار: `/umrah/pilgrims/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:41`
- المجموعة: `operations`
- الكومبوننت: `UmrahPilgrims`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 145
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L81: "إضافة معتمر"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L26 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /umrah/pilgrims/:id`
- landedUrl: `?`
- توصية: مغلق
