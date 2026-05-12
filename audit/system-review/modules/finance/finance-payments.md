# /finance/payments — `artifacts/ghayth-erp/src/pages/finance/payments-page.tsx`

## 1. الميتاداتا
- المسار: `/finance/payments`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/payments-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:109`
- المجموعة: `finance`
- الكومبوننت: `Payments`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `payments`
- سطور الملف: 105
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/payments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
شاشة المدفوعات (Collection center). المرجع: `docs/blueprints/finance-invoices.md` §"Collection".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| عرض الفواتير المستحقة | finance/invoices | GET `/finance/invoices?status=unpaid` | aggregation | ✅ |
| تسجيل دفعة → سند قبض | finance | `finance-collection.ts` POST `/collection/payments` | `vouchers`, `voucher_allocations` | ✅ |
| تحديث `invoices.paidAmount` | finance | تلقائياً عند sand allocation | `invoices.paidAmount`, `invoices.status` | ✅ |
| AR Aging يتحدّث | finance/ar-aging | aggregation فقط من `invoices.dueDate` | view محسوب | ✅ |
| قيد محاسبي | finance/GL | DR Cash/Bank / CR AR | `gl_entries`, `gl_lines` | ✅ |
| إشعار للعميل (إيصال) | comms | event=`payment_confirmed` | `notifications` | ⚠ |
| تكامل بوابة دفع (إن مفعّل) | gov-integrations | اختياري — STC Pay/Mada | `payment_gateway_txns` | ⚠ |
| سير موافقة (للمبالغ الكبيرة) | governance/workflows | `business_rules` | `approval_chains` | ⚠ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`vouchers`) | ✅ |

تحقق يدوي:
- [ ] هل دفعة جزئية تترك الفاتورة في `partially_paid` وتظهر في AR Aging بالباقي؟
- [ ] هل دفعة بـ over-payment تُحوَّل تلقائياً إلى رصيد العميل (credit)؟
- [ ] هل يوجد لوحة `collection-aging` تعرض السلوك الزمني للعميل؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `payments` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/payments`
- لقطة: `audit/screenshots/finance_payments.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
