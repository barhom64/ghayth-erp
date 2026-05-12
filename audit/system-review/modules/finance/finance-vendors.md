# /finance/vendors — `artifacts/ghayth-erp/src/pages/finance/vendors.tsx`

## 1. الميتاداتا
- المسار: `/finance/vendors`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/vendors.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:99`
- المجموعة: `finance`
- الكومبوننت: `Vendors`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `vendors`
- سطور الملف: 194
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الموردون. AP sub-ledger + ربط بـ chart of accounts.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل مورد | finance | `finance-vendors.ts` POST `/vendors` | `vendors` | ✅ |
| تخصيص حساب AP (sub-ledger) | finance/accounts | `vendors.apAccountCode` → `chart_of_accounts` | ✅ |
| تقييم المورد | warehouse | `vendor_ratings` (per delivery quality, timeliness, price) | ⚠ |
| ربط بـ POs | finance/purchase | `purchase_orders.vendorId` | ✅ |
| رصيد المورد | finance | `vendors.balance` = AP الإجمالي | aggregation | ✅ |
| AP Aging | finance/ap-aging | aging buckets على فواتير الشراء | view | ✅ |
| تسجيل دفعة للمورد → سند صرف | finance | POST `/vouchers` (type='payment') | `vouchers` + قيد | ✅ |
| **قيد محاسبي** عند الدفع | finance/GL | DR AP / CR Cash/Bank | `gl_entries` | ✅ |
| تقييم 1099 / ZATCA buyer info | finance-zatca | حقول `vendors.taxId`, `vatNumber` | تظهر في فواتير الشراء | ✅ |
| حجب المورد (blocked) | finance | `vendors.status='blocked'` يمنع POs جديدة | ⚠ تحقق |
| تكامل WPS (لو مقاول عمالة) | gov-integrations | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/finance/vendors`) | `audit_logs` (entity=`vendor`) | ✅ |

تحقق يدوي:
- [ ] هل مورد مكرر (نفس CR) يُمنع/يُحذّر منه؟
- [ ] هل تقييم المورد ينعكس على فرص فتح POs له؟
- [ ] هل المورد المحظور يبقى في الـ history مع علامة واضحة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `vendors` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/vendors`
- لقطة: `audit/screenshots/finance_vendors.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
