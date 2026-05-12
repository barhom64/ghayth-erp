# /finance/bank-reconciliation/manual-match/:batchId/:rowId — `artifacts/ghayth-erp/src/pages/finance/ap-aging.tsx`

## 1. الميتاداتا
- المسار: `/finance/bank-reconciliation/manual-match/:batchId/:rowId`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/ap-aging.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:124`
- المجموعة: `finance`
- الكومبوننت: `ApAging`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:rowId`
- سطور الملف: 164
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L86: "(بلا تسمية)" → `() => exportCSV(suppliers, `ap-aging-${asOfDate`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:rowId` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L34 _(inline-data-array)_: `const BUCKETS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /finance/bank-reconciliation/manual-match/:batchId/:rowId`
- landedUrl: `?`
- توصية: مغلق
