# /umrah/invoices — `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`

## 1. الميتاداتا
- المسار: `/umrah/invoices`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:48`
- المجموعة: `operations`
- الكومبوننت: `UmrahInvoices`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `invoices`
- سطور الملف: 146
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L100: "إنشاء فاتورة" → `generate` 🔒

### القراءات (GET)
- GET `/umrah/agent-invoices`
- GET `/umrah/agents`
- GET `/umrah/seasons`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
- الجدول: `invoices` (export: `invoices`, 12 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id, clients.id

## 5. البيانات الوهمية الثابتة
- ⚠ L52 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah/invoices`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
