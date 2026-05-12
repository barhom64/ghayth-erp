# /finance/ar-aging — `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx`

## 1. الميتاداتا
- المسار: `/finance/ar-aging`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:121`
- المجموعة: `finance`
- الكومبوننت: `ArAging`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `ar-aging`
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `ar-aging` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L34 _(inline-data-array)_: `const BUCKETS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/ar-aging`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
