# /properties/payments — `artifacts/ghayth-erp/src/pages/properties-payments.tsx`

## 1. الميتاداتا
- المسار: `/properties/payments`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-payments.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:51`
- المجموعة: `properties`
- الكومبوننت: `PropertiesPayments`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `payments`
- سطور الملف: 118
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L45: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
دفعات إيجار. المرجع: `docs/blueprints/properties-ejar.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| توليد جدول الأقساط (عند إنشاء العقد) | properties | تلقائي مع `/properties/contracts` POST | `property_payments` (1 صف لكل قسط) | ✅ |
| تسجيل دفعة من المستأجر | properties | POST `/properties/payments/:id/pay` | `property_payments.paidAt`, `paidAmount` | ✅ |
| قيد محاسبي عند الدفعة | finance/GL | DR Cash/Bank / CR Rental Revenue (+ VAT إن ينطبق) | `gl_entries`, `gl_lines` | ✅ متوقع — تحقق من `accounting-mappings` |
| فاتورة ZATCA (للوحدات التجارية) | finance-zatca | اختياري بناءً على `contract.commercial` | `invoices`, `zatca_documents` | ⚠ يعتمد |
| تحديث رصيد المالك | properties/owners | `owner_balances` يتحدّث بصافي الإيرادات بعد العمولة | `owner_balances_history` | ⚠ تحقق |
| إشعار للمستأجر (إيصال) | comms | event=`payment_confirmed` | `notifications` | ✅ |
| إشعار للمالك (دفعة جديدة) | comms | event=`owner_payment_received` | `notifications` | ⚠ |
| تذكير بالاستحقاق (cron) | comms | cron يقرأ `property_payments.dueDate` ويرسل قبل 3/1 يوم | `notifications` | ✅ |
| تحويل التأخير → غرامة | properties | `late_fees` policy بناءً على `business_rules` | `late_fee_lines` (إن وُجد) | ⚠ تحقق |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` (entity=`property`) | ✅ |

تحقق يدوي:
- [ ] هل دفعة جزئية تترك الباقي مفتوحاً ويظهر في AR aging؟
- [ ] هل المرتجعات (security deposit refund) تنشئ قيد عكسي؟
- [ ] هل ربط الإيجار بـ Ejar الحكومي يُحدّث تلقائياً عند الدفع؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `payments` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/payments`
- لقطة: `audit/screenshots/properties_payments.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
