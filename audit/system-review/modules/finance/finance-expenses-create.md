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

إنشاء مصروف جديد — صرف من custody أو فاتورة مورّد أو دفعة مباشرة.

| نوع المصروف | الوصف | gl impact |
|------------|------|-----------|
| Petty cash | من العهدة | Dr Expense / Cr Custody |
| Direct payment | دفعة مباشرة | Dr Expense / Cr Cash/Bank |
| Vendor bill | فاتورة مورد | Dr Expense / Cr AP |
| Reimbursement | استرداد للموظف | Dr Expense / Cr Employee-payable |
| Pre-paid | مدفوع مقدماً | Dr Prepaid Asset / Cr Cash |

| الحقل | المتطلب |
|------|--------|
| Date | إجباري — period open |
| Vendor/Beneficiary | optional or required per type |
| Expense account | إجباري — from COA |
| Cost center | للـ allocation | optional |
| Project (لو مرتبط) | راجع `projects.md` |
| Department | إجباري للـ analysis |
| Amount + VAT | per ZATCA rules |
| Attachments | receipt/invoice | إجباري للأمور > X |
| Payment method | cash, bank, transfer |
| Reference | external (invoice #) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create draft | POST `/finance/expenses` | `expenses` | ✅ |
| Validate budget (لو فيه) | راجع `finance-budget.md` | ✅ |
| Validate period | open period | ✅ critical |
| Submit for approval | لو > threshold | راجع `governance/approvals.md` | ✅ |
| Approve | with audit | ✅ |
| Post to GL | يولّد `gl_entries` | ✅ critical |
| Cash payment | يخصم من cash account | راجع `finance-cash-register.md` | ✅ |
| Bank transfer | يخصم من bank account | راجع `finance-bank-accounts.md` | ✅ |
| Custody deduction | يخصم من custody | راجع `finance-custodies.md` | ✅ |
| Vendor bill creation | يولّد AP entry | راجع `finance-vendor-bills.md` | ✅ |
| VAT (ZATCA) | input tax | راجع `finance-tax.md` | ✅ critical |
| WHT (withholding) | لو applicable | راجع `finance-tax.md` | ⚠ |
| تكامل مع `finance-budget.md` | يخصم من budget | راجع `finance-budget-byid.md` | ✅ |
| تكامل مع `posting-queue` | إذا async | راجع `finance-gl-posting-queue.md` | ✅ |
| Attachment as document | راجع `documents.md` | ✅ |
| Notification | event=`expense_created/approved` | راجع `notifications.md` | ✅ |
| Audit log إجباري | كل إنشاء/تعديل | `audit_logs` | ✅ critical |
| RBAC | finance staff + approval per threshold | ✅ |

تحقق يدوي:
- [ ] هل يمنع المصروف لو budget exceeded أم warning فقط؟
- [ ] هل ZATCA VAT input recorded بشكل صحيح للـ refund?
- [ ] هل attachment إجباري لو amount > X؟
- [ ] هل WHT calculated تلقائياً لـ services من suppliers معينين؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/expenses/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_expenses_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
