# /finance/expenses/create — `artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/expenses/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:94`
- المجموعة: `finance`
- الكومبوننت: `ExpensesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 749
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/expenses` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L69 _(inline-data-array)_: `const TAX_CATEGORIES = [`
- ⚠ L79 _(inline-data-array)_: `const INVOICE_TYPE_CODES = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/expenses/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_expenses_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
