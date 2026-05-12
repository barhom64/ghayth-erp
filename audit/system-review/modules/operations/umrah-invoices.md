# /umrah/invoices — `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`

## 1. الميتاداتا
- المسار: `/umrah/invoices`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:48`
- المجموعة: `operations`
- الكومبوننت: `UmrahPenalties`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `invoices`
- سطور الملف: 142
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L78: "(بلا تسمية)" → `(e) => handleWaive(e, p.id)`
- L89: "تشغيل محرك الغرامات" → `runPenaltyEngine`

### القراءات (GET)
- GET `/umrah/penalties`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
- الجدول: `invoices` (export: `invoices`, 7 عمود)
- tenant col: ✅ | createdBy: — | createdAt: — | updatedAt: — | softDelete: — | lifecycle col: —
- FKs: companies.id, clients.id

## 5. البيانات الوهمية الثابتة
- ⚠ L54 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/invoices`
- لقطة: `audit/screenshots/umrah_invoices.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
