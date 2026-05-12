# /finance/accounts/:id/edit — `artifacts/ghayth-erp/src/pages/create/finance/accounts-edit.tsx`

## 1. الميتاداتا
- المسار: `/finance/accounts/:id/edit`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/accounts-edit.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:83`
- المجموعة: `finance`
- الكومبوننت: `AccountsEdit`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `edit`
- سطور الملف: 104
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L75: "مسح المسودة" → `clearDraft`
- L96: "(بلا تسمية)" → `() => setLocation("/finance/accounts")` 🔒
- L97: "(بلا تسمية)" → `handleSave` 🔒

### القراءات (GET)
- GET `/finance/accounts`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `edit` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/accounts/:id/edit`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
