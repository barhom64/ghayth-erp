# /clients — `artifacts/ghayth-erp/src/pages/operations-center.tsx`

## 1. الميتاداتا
- المسار: `/clients`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/operations-center.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:80`
- المجموعة: `operations`
- الكومبوننت: `OperationsCenter`
- subKey: — | minRoleLevel: 40
- الكيان المستنبط: `clients`
- سطور الملف: 284
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L117: "الإقفال اليومي"
- L122: "(بلا تسمية)" → `() => { setRefreshKey(k => k + 1); refetch();`
- L174: "(بلا تسمية)"
- L245: "عرض الكل"

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
- الجدول: `clients` (export: `clients`, 11 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/clients`
- لقطة: `audit/screenshots/clients.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
