# /warehouse/movements — `artifacts/ghayth-erp/src/pages/warehouse.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/movements`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:104`
- المجموعة: `warehouse`
- الكومبوننت: `Warehouse`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `movements`
- سطور الملف: 387
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L30: "حركة جديدة"
- L36: "منتج جديد"
- L153: "إضافة منتج"
- L238: "إضافة حركة"
- L298: "تصنيف جديد"
- L365: "إضافة مورد"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
حركة مخزون (إدخال/إخراج/تحويل). المرجع: `docs/INVENTORY_ADVANCED_DESIGN.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تحديث الكمية في المخزن | warehouse | `warehouse.ts` POST `/movements` → يحدّث `warehouse_products.qty` | `warehouse_movements`, `warehouse_products.qty` | ✅ |
| تكلفة المخزون (FIFO/AVG/LIFO) | finance/inventory | `lib/inventory/valuation/` | `inventory_layers`, `inventory_cost_lines` | ✅ موجود |
| **قيد محاسبي** (إخراج → DR COGS / CR Inventory) | finance/GL | `accounting-engine.ts` (postInventoryMovement) | `gl_entries`, `gl_lines` | ✅ متوقع |
| ربط بأمر شراء (إن إدخال) | finance/purchase | `purchase_orders.id` → `warehouse_movements.refId` | `purchase_order_lines.receivedQty` يتحدّث | ⚠ تحقق |
| ربط بأمر بيع/عميل (إن إخراج) | crm/store | `sales_orders.id` → `warehouse_movements.refId` | `sales_order_lines.deliveredQty` | ⚠ تحقق |
| إشعار عند نفاد المخزون | comms | event=`stock_low` بناءً على `min_qty` | `notifications` | ⚠ تحقق من cron |
| سير موافقة (للتحويلات الكبيرة) | governance/workflows | `business_rules` | `approval_chains` | ⚠ اختياري |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`warehouse_movements`) | ✅ |

تحقق يدوي:
- [ ] هل التحويل بين مخزنين ذرّي (يخصم من A و يضيف إلى B في معاملة واحدة)؟
- [ ] هل الحركة العكسية (إلغاء/مرتجع) تولّد قيد محاسبي عكسي تلقائياً؟
- [ ] في حالة inventory-count (جرد فعلي): هل التسوية تنشئ حركة + قيد adjustment؟
- [ ] هل وحدات القياس (UoM) متسقة بين المخزون والمحاسبة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `movements` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/movements`
- لقطة: `audit/screenshots/warehouse_movements.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
