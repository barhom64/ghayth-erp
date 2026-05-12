# /finance/vouchers/create — `artifacts/ghayth-erp/src/pages/create/finance/vouchers-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/vouchers/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/vouchers-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:86`
- المجموعة: `finance`
- الكومبوننت: `VouchersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 475
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/vouchers` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L204: "مسح المسودة" → `clearDraft`
- L467: "(بلا تسمية)" → `() => setLocation("/finance/vouchers")` 🔒
- L468: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
سند قبض/صرف. المرجع: `docs/blueprints/finance-invoices.md` §"Vouchers".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء سند | finance | `finance-journal.ts` POST `/vouchers` | `vouchers` | ✅ |
| قيد محاسبي تلقائي | finance/GL | DR Cash / CR AR (سند قبض) أو DR AP / CR Cash (سند صرف) | `gl_entries`, `gl_lines` | ✅ |
| تحديث رصيد العميل/المورد | crm + finance/vendors | `clients.balance` أو `vendors.balance` | `client_balances_history`, `vendor_balances` | ⚠ تحقق |
| ربط بفاتورة (allocation) | finance/invoices | `voucher_allocations` (one voucher → many invoices) | `voucher_allocations`, `invoices.paidAmount` | ⚠ |
| طريقة دفع (نقدي/بنك/شيك) | finance | `vouchers.paymentMethod` → DR account مختلف | يحدّد `cash_account_id` أو `bank_account_id` | ✅ |
| توافق بنكي (إن طريقة بنك) | finance/bank-reconciliation | يظهر في `bank_reconciliation_pending` | `bank_transactions` | ⚠ |
| إشعار للعميل/المورد | comms | event=`payment_received` | `notifications` | ⚠ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`vouchers`) | ⚠ ملاحظة: missing-audit في FINDINGS |

تحقق يدوي:
- [ ] هل توزيع السند على عدة فواتير ذرّي؟ ماذا لو فشل تحديث `paidAmount` لإحداها؟
- [ ] هل إلغاء سند مدفوع يولّد قيد عكسي + يعكس `paidAmount`؟
- [ ] هل الشيكات المؤجلة (post-dated) تُدخل في حساب prepaid وتنتقل تلقائياً عند الاستحقاق؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L44 _(inline-data-array)_: `const PAYMENT_METHODS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/vouchers/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_vouchers_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
