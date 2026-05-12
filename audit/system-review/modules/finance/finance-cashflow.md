# /finance/cashflow — `artifacts/ghayth-erp/src/pages/finance/cashflow-dashboard.tsx`

## 1. الميتاداتا
- المسار: `/finance/cashflow`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/cashflow-dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:139`
- المجموعة: `finance`
- الكومبوننت: `CashflowDashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `cashflow`
- سطور الملف: 413
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L86: "الوحدة المالية" → `() => refetchSummary()`
- L88: "الوحدة المالية"
- L325: "عرض الكل"
- L361: "عرض الكل"

### القراءات (GET)
- GET `/finance/invoices?status=draft&limit=5${qstr ? `
- GET `/finance/expenses?limit=5${qstr ? `



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `cashflow` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/cashflow`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
