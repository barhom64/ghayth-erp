# /finance/expenses — `artifacts/ghayth-erp/src/pages/finance/expenses.tsx`

## 1. الميتاداتا
- المسار: `/finance/expenses`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/expenses.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:93`
- المجموعة: `finance`
- الكومبوننت: `Expenses`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `expenses`
- سطور الملف: 362
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L349: "عرض الصفحة الكاملة"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
مصروف. المرجع: `docs/blueprints/finance-invoices.md` §"Expenses".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء مصروف + قيد محاسبي | finance/GL | `finance-journal.ts` POST `/expenses` → ينشئ entry في `gl_entries` (DR Expense / CR Cash أو AP) | `expenses`, `gl_entries`, `gl_lines` | ✅ |
| استقطاع VAT (إن مفعّل) | finance-zatca | حساب VAT تلقائي حسب `taxCategory` | `gl_lines` (CR VAT Receivable/Payable) | ✅ موجود |
| ربط بـ vendor (لو موجود) | finance/vendors | `expenses.vendorId` → `vendors` | تحديث `vendors.balance` (AP) | ⚠ تحقق |
| سير موافقة (لو > حد) | governance/workflows | `business_rules.expense_approval_threshold` | `approval_chains` | ✅ |
| إشعار لـ Finance Manager | comms | event=`expense_pending_approval` | `notifications` | ⚠ يعتمد على القاعدة |
| تأثير الميزانية (budget) | finance/budget | يخصم من `budgets.spent` للفئة | `budgets`, `budget_actuals` | ⚠ تحقق من ربط `categoryId` |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`expenses`) | ✅ |

تحقق يدوي:
- [ ] هل المصروف يتجاوز الميزانية يطلق إشعار/يُمنع؟
- [ ] هل المصاريف المدفوعة نقداً vs آجلة تنشئ قيوداً مختلفة؟
- [ ] هل مرفقات الفاتورة (`storage`) ترتبط بالمصروف؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `expenses` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/expenses`
- لقطة: `audit/screenshots/finance_expenses.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
