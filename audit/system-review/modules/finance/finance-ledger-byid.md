# /finance/ledger/:code — `artifacts/ghayth-erp/src/pages/finance/ledger.tsx`

## 1. الميتاداتا
- المسار: `/finance/ledger/:code`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/ledger.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:120`
- المجموعة: `finance`
- الكومبوننت: `Ledger`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:code`
- سطور الملف: 173
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L65: "(بلا تسمية)"
- L70: "(بلا تسمية)" → `() => window.print()`
- L73: "(بلا تسمية)" → `() => exportCSV(entries, ["date", "ref", "description", "debit", "credit", "runn`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:code` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/ledger/:code`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
