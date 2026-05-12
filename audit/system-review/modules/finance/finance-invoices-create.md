# /finance/invoices/create — `artifacts/ghayth-erp/src/pages/create/finance/invoices-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/invoices/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/invoices-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:91`
- المجموعة: `finance`
- الكومبوننت: `InvoicesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 320
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/invoices` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L169: "مسح المسودة" → `clearDraft`
- L230: "+ إضافة بند" → `() => removeLine(idx)` 🔒
- L233: "+ إضافة بند" → `addLine`
- L311: "(بلا تسمية)" → `() => setLocation("/finance/invoices")` 🔒
- L312: "(بلا تسمية)" → `handleSubmit` 🔒

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
- ⚠ L21 _(inline-data-array)_: `const INVOICE_TYPE_CODES = [`
- ⚠ L34 _(inline-data-array)_: `const PAYMENT_TERMS_OPTIONS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/invoices/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_invoices_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
