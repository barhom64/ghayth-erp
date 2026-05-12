# /properties/owners — `artifacts/ghayth-erp/src/pages/properties-owners.tsx`

## 1. الميتاداتا
- المسار: `/properties/owners`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-owners.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:44`
- المجموعة: `properties`
- الكومبوننت: `PropertiesOwners`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `owners`
- سطور الملف: 182
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L102: "تعديل"
- L106: "(بلا تسمية)" → `() => setDeletingOwner({ id: o.id, name: o.name || "—"`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ملاك العقارات. ربط مالي + ضريبي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل مالك (فرد أو شركة) | properties | POST `/owners` | `property_owners` | ✅ |
| IBAN للتحويل | properties | `owners.iban` (validated SA format) | ✅ |
| ربط بمباني وأصول | properties | `property_buildings.ownerId` | ✅ |
| **رصيد المالك** (مستحقاته من الإيجارات) | properties | aggregation من `property_payments` بعد العمولة | view | ✅ |
| نسبة العمولة (للشركة) | properties | `owners.commissionRate` % | ✅ |
| **قيد توزيع الإيرادات** | finance/GL | عند تحصيل إيجار: DR Cash / CR Owner Liability + CR Commission Revenue | `gl_entries` | ✅ |
| تحويل دفعات للمالك | finance | POST `/owners/:id/transfer` → voucher | `vouchers` (DR Owner Liability / CR Bank) | ✅ |
| كشف حساب المالك (شهري) | finance/reports | aggregation per owner per month | `owner_statements` | ✅ |
| ربط بـ WHT (Withholding Tax) | finance | اقتطاع 5% للملاك غير المقيمين (ZATCA rule) | `wht_lines` | ⚠ تحقق |
| توليد فاتورة عمولة | finance/invoices + ZATCA | عمولة → فاتورة B2B | `invoices` | ⚠ |
| إشعارات للمالك | comms | event=`owner_statement_ready\|payment_due\|transfer_completed` | `notifications` | ⚠ |
| تكامل Ejar | gov-integrations | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل عمولة الإدارة محسوبة على الإيراد الإجمالي أم بعد خصم الصيانة؟
- [ ] هل المالك متعدد الجنسية يخضع لـ WHT بشكل صحيح؟
- [ ] هل IBAN يُتحقّق من صحته قبل أي تحويل؟
- [ ] هل المالك المتوفى ينتقل تلقائياً لورثة (workflow أو يدوي)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `owners` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/owners`
- لقطة: `audit/screenshots/properties_owners.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
