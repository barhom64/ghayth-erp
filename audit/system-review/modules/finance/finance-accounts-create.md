# /finance/accounts/create — `artifacts/ghayth-erp/src/pages/create/finance/accounts-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/accounts/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/accounts-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:82`
- المجموعة: `finance`
- الكومبوننت: `AccountsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 111
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/accounts` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L58: "مسح المسودة" → `clearDraft`
- L103: "(بلا تسمية)" → `() => setLocation("/finance/accounts")` 🔒
- L104: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء حساب جديد في Chart of Accounts (دليل الحسابات) — أساس المحاسبة.

| الحقل | المتطلب |
|------|--------|
| Account code | إجباري — unique per tenant | numeric hierarchy |
| Account name (ar/en) | إجباري | i18n |
| Type | Asset, Liability, Equity, Revenue, Expense | إجباري |
| Sub-type | Current/Non-current asset, etc. | إجباري |
| Parent account | للـ tree | optional |
| Normal balance | Dr or Cr | derived from type |
| Currency | per account | optional (multi-currency) |
| Tax behavior | per ZATCA | راجع `finance-tax.md` |
| Cost center | optional | للـ allocation |
| Is bank/cash | flag | لو bank/cash account |
| Is reconcilable | flag | للـ AR/AP/Bank |
| Description | optional |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create account | POST `/finance/accounts` | `chart_of_accounts` | ✅ |
| Validate uniqueness | server-side | code unique per tenant | ✅ critical |
| Validate hierarchy | type/sub-type consistent | ✅ |
| Validate parent type | child must match parent type | ✅ critical |
| Activate/Deactivate | toggle | `isActive` | ✅ |
| Cannot delete if used | guard | حتى بعد deactivate | ✅ critical |
| Reorder hierarchy | sortOrder | drag-drop | ⚠ |
| Map to standard COA (IFRS) | per type | راجع `finance-coa-standard.md` | ⚠ |
| Bulk import (CSV) | POST `/finance/accounts/import` | for go-live | راجع `finance-opening-balances.md` ⚠ |
| Map to tax codes | راجع `finance-tax.md` | per VAT scenarios | ✅ |
| Default account per category | راجع `warehouse-categories.md` | inheritance | ✅ |
| تكامل مع `gl_entries` | الحساب يستخدم في القيود | ✅ critical |
| تكامل مع `finance-trial-balance.md` | sum per account | ✅ |
| تكامل مع `finance-reports.md` | grouped by type | ✅ |
| Audit log إجباري | كل create/update/deactivate | `audit_logs` | ✅ critical |
| RBAC | finance director + CFO فقط | level≥80 | ✅ critical |

تحقق يدوي:
- [ ] هل code unique enforced at DB level (UNIQUE constraint)?
- [ ] هل deactivated account ممنوع استخدامه في قيود جديدة لكن بياناته السابقة محفوظة؟
- [ ] هل لمحاسبي ينشأ حسابات جديدة أم فقط finance director؟
- [ ] هل tax code mapping يطبَّق تلقائياً عند استخدام الحساب؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/accounts/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_accounts_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
