# /warehouse/products/:id — `artifacts/ghayth-erp/src/pages/details/warehouse-product-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/products/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/warehouse-product-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:100`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseProductDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 297
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ملف المنتج في المخزن. المرجع: `docs/INVENTORY_ADVANCED_DESIGN.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء منتج | warehouse | `warehouse.ts` POST `/products` | `warehouse_products` | ✅ |
| تخصيص فئة + مورد افتراضي | warehouse | `products.categoryId`, `defaultSupplierId` | ✅ |
| نقاط إعادة الطلب (reorder point) | warehouse | `products.minQty`, `reorderQty` | ✅ |
| **حركات مخزون** (in/out/transfer) | warehouse | `warehouse_movements` (يُحدّث `products.qty`) | ✅ |
| تكلفة المخزون (FIFO/AVG/LIFO) | finance/inventory | `inventory_layers` (مرتبطة بـ productId) | محسوبة في `finance-algorithms.ts` | ✅ |
| طلب شراء تلقائي عند نفاد | finance/purchase | عند `qty < minQty` → اقتراح PR | `purchase_request_drafts` | ⚠ تحقق |
| ربط بـ store/sales (إن متجر مفعّل) | store | `sales_order_lines.productId` | ✅ |
| ربط بـ properties (assets داخل المبنى) | properties | اختياري للأثاث | ⚠ |
| **قيد محاسبي** عند الإدخال | finance/GL | DR Inventory / CR AP | `gl_entries`, `gl_lines` | ✅ |
| قيد عند الإخراج (COGS) | finance/GL | DR COGS / CR Inventory | `gl_entries` | ✅ |
| Aging (slow-moving) | warehouse/reports | aggregation no_movement_days | view | ✅ |
| Stock count (جرد فعلي) | warehouse | POST `/inventory-count` → adjustments | `inventory_counts`, `warehouse_movements(type='adjustment')` | ✅ |
| إشعار عند نفاد | comms | event=`stock_low\|stock_out` | `notifications` | ⚠ |
| ZATCA (للبيع) | finance-zatca | عند صدور فاتورة | ✅ |
| Audit log | core | `auditMiddleware` (`/warehouse/products`) | `audit_logs` (entity=`warehouse_product`) | ✅ |

تحقق يدوي:
- [ ] هل دمج منتجات متشابهة (deduplication) مدعوم؟
- [ ] هل المنتج المؤرشف يبقى في تاريخ الحركات أم يختفي؟
- [ ] هل تغيير unit of measure بعد حركات سابقة يُعيد حساب الكميات؟
- [ ] هل serialized items (لكل قطعة رقم تسلسلي) مدعومة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/warehouse/products → 401`
- landedUrl: `?`
- توصية: مغلق
