# /finance/invoices — `artifacts/ghayth-erp/src/pages/finance/journal.tsx`

## 1. الميتاداتا
- المسار: `/finance/invoices`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/journal.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:90`
- المجموعة: `finance`
- الكومبوننت: `Journal`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `invoices`
- سطور الملف: 333
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L153: "عكس القيد"
- L183: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
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
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/invoices`
- لقطة: `audit/screenshots/finance_invoices.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
