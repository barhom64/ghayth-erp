# /store/products/create — `artifacts/ghayth-erp/src/pages/create/store/products-create.tsx`

## 1. الميتاداتا
- المسار: `/store/products/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/store/products-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/storeRoutes.tsx:11`
- المجموعة: `store`
- الكومبوننت: `ProductsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 96
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L59: "مسح المسودة" → `clearDraft`
- L88: "(بلا تسمية)" → `() => setLocation("/store")` 🔒
- L89: "(بلا تسمية)" 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إضافة منتج للمتجر. يختلف عن warehouse — focus على المبيعات.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء منتج بيع | store | `store.ts` POST `/products` | `store_products` | ✅ |
| ربط بمنتج المخزن (إن مخزني) | warehouse | `store_products.warehouseProductId` → `warehouse_products` | للـ stock sync | ⚠ تحقق |
| تسعير (sales price + discount tiers) | store | `store_products.salesPrice`, `pricing_tiers` | ✅ |
| ضريبة VAT (per category) | finance-zatca | `store_products.taxCategory` يحدّد VAT rate | ✅ |
| توفّر المخزون | warehouse | يقرأ `warehouse_products.qty` لحظياً | aggregation | ✅ |
| ربط بـ promotions/coupons | marketing | `store_promotions.productId` | ⚠ |
| عرض في المتجر للعملاء (visibility) | store | `store_products.published`, `featured` | ✅ |
| تتبّع المبيعات | store/orders | aggregation من `sales_order_lines` | views | ✅ |
| أكثر المنتجات مبيعاً | bi | aggregation per period | views | ✅ |
| إشعار عند نفاد | comms | event=`stock_out` | راجع `warehouse-products-byid.md` | ✅ |
| Audit log | core | `auditMiddleware` (لو `/store` مضافة) | `audit_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل تغيير السعر يطبق على الأوامر القائمة المفتوحة أم الجديدة فقط؟
- [ ] هل المنتج مخفي (`published=false`) يبقى في تقارير المبيعات السابقة؟
- [ ] هل ربط منتج المخزن المغلق يطلق تنبيه؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/store/products/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/store_products_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
