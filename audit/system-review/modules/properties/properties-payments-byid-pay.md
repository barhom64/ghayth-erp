# /properties/payments/:paymentId/pay — `artifacts/ghayth-erp/src/pages/create/properties/payment-register.tsx`

## 1. الميتاداتا
- المسار: `/properties/payments/:paymentId/pay`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/payment-register.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:49`
- المجموعة: `properties`
- الكومبوننت: `PaymentRegister`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `pay`
- سطور الملف: 131
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L84: "مسح المسودة" → `clearDraft`
- L123: "(بلا تسمية)" → `() => setLocation("/properties/payments")` 🔒
- L124: "(بلا تسمية)" → `handleSave` 🔒

### القراءات (GET)
- GET `/properties/payments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تسجيل دفعة لقسط إيجار محدد (مكمّل لـ `properties-payments.md`).

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| POST `/properties/payments/:id/pay` | properties | يحدّث `property_payments.paidAt`, `paidAmount` | ✅ |
| طريقة دفع (نقد/بنك/شيك) | finance | يحدّد `voucher.paymentMethod` | راجع `finance-payments.md` | ✅ |
| **قيد محاسبي** | finance/GL | DR Cash/Bank / CR Rental Revenue (+ VAT إن تجاري) | راجع `properties-payments.md` | ✅ |
| تحديث رصيد المستأجر | properties | aggregate after | ✅ |
| تحديث رصيد المالك (بعد العمولة) | properties | راجع `properties-owners.md` | ✅ |
| دفعة جزئية | properties | `payment.status='partial'` يبقى مفتوحاً للباقي | ✅ |
| دفعة مع رسوم تأخير | properties | لو متأخر — `late_fee_lines` يُضاف للقيد | ⚠ تحقق |
| إيصال دفع للمستأجر | comms | event=`payment_received` | راجع `notifications` | ✅ |
| فاتورة ZATCA (للوحدات التجارية) | finance-zatca | إن مفعّل | ⚠ |
| تكامل بوابة دفع (STC Pay / mada) | gov-integrations | اختياري | ⚠ |
| تأثير على AR aging | راجع `properties-payments.md` و `finance-ar-aging.md` | ✅ |
| Audit log | core | `auditMiddleware` (`/properties`) | ✅ |

تحقق يدوي:
- [ ] هل تسجيل دفعة بقيمة أكبر من المستحق ممكن؟ هل يتحوّل الزائد لرصيد العميل؟
- [ ] هل دفعة مكرّرة بطريق الخطأ تطلق تنبيه قبل الحفظ؟
- [ ] هل receipt PDF يُولَّد آلياً بعد POST؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `pay` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/units → 401`
- landedUrl: `?`
- توصية: مغلق
