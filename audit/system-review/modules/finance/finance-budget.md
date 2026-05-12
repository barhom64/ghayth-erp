# /finance/budget — `artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/budget`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:96`
- المجموعة: `finance`
- الكومبوننت: `ExpensesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `budget`
- سطور الملف: 749
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/expenses` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L328: "مسح المسودة" → `clearDraft`
- L740: "(بلا تسمية)" → `() => setLocation("/finance/expenses")` 🔒
- L741: "(بلا تسمية)" → `handleSubmit` 🔒

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
- الجدول: `budgets` (export: `budgets`, 6 عمود)
- tenant col: ✅ | createdBy: — | createdAt: — | updatedAt: — | softDelete: — | lifecycle col: —
- FKs: companies.id

## 5. البيانات الوهمية الثابتة
- ⚠ L69 _(inline-data-array)_: `const TAX_CATEGORIES = [`
- ⚠ L79 _(inline-data-array)_: `const INVOICE_TYPE_CODES = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/budget`
- لقطة: `audit/screenshots/finance_budget.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
