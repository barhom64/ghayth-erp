# /finance/reports — `artifacts/ghayth-erp/src/pages/finance/reports.tsx`

## 1. الميتاداتا
- المسار: `/finance/reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:105`
- المجموعة: `finance`
- الكومبوننت: `FinancialReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `reports`
- سطور الملف: 1171
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L35: "(بلا تسمية)" → `() => window.print()`
- L201: "(بلا تسمية)" → `() => setViewMode("tree")`
- L202: "(بلا تسمية)" → `() => setViewMode("flat")`
- L206: "(بلا تسمية)" → `() => exportCSV(rows, ["code", "name", "type", "totalDebit", "totalCredit", "bal`
- L367: "(بلا تسمية)" → `() => exportCSV([...revenues.map((r: any) => ({ ...r, section: "إيرادات"`
- L505: "(بلا تسمية)" → `() => exportCSV([...assets, ...liabilities, ...equity], ["code", "name", "type",`
- L575: "(بلا تسمية)" → `() => exportCSV([...inflows.map((f: any) => ({ ...f, type: "وارد"`
- L670: "(بلا تسمية)" → `() => exportCSV(entries, ["ref", "description", "debit", "credit", "runningBalan`
- L728: "(بلا تسمية)" → `() => exportCSV([...custodies, ...advances], ["ref", "description", "amount", "e`
- L824: "(بلا تسمية)" → `() => exportCSV(rows, ["key", "label", "amount", "entryCount"], "expenses-analys`
- L886: "(بلا تسمية)" → `() => exportCSV(byAccount, ["code", "name", "amount", "entryCount"], "revenue-an`
- L981: "(بلا تسمية)" → `() => exportCSV(rows, ["accountCode", "accountName", "budget", "actual", "varian`
- L1102: "(بلا تسمية)" → `() => exportCSV(rowsWithBalance, ["ref", "description", "debit", "credit", "runn`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/reports`
- لقطة: `audit/screenshots/finance_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
