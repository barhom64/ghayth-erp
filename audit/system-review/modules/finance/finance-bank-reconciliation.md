# /finance/bank-reconciliation — `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx`

## 1. الميتاداتا
- المسار: `/finance/bank-reconciliation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:123`
- المجموعة: `finance`
- الكومبوننت: `ArAging`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `bank-reconciliation`
- سطور الملف: 174
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L86: "(بلا تسمية)" → `() => exportCSV(clients, `ar-aging-${asOfDate`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `bank-reconciliation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L34 _(inline-data-array)_: `const BUCKETS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/bank-reconciliation`
- لقطة: `audit/screenshots/finance_bank_reconciliation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
