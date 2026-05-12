# /umrah/pricing — `artifacts/ghayth-erp/src/pages/umrah/pricing.tsx`

## 1. الميتاداتا
- المسار: `/umrah/pricing`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/pricing.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:69`
- المجموعة: `operations`
- الكومبوننت: `UmrahPricing`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `pricing`
- سطور الملف: 407
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L363: "(بلا تسمية)" → `() => setEditing(null)`
- L392: "(بلا تسمية)" → `() => setDeleteId(null)`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `pricing` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/pricing`
- لقطة: `audit/screenshots/umrah_pricing.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
