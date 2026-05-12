# /store/orders — `artifacts/ghayth-erp/src/pages/store.tsx`

## 1. الميتاداتا
- المسار: `/store/orders`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/store.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/storeRoutes.tsx:13`
- المجموعة: `store`
- الكومبوننت: `Store`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `orders`
- سطور الملف: 348
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L128: "(بلا تسمية)" → `() => setShowForm(false)`
- L215: "(بلا تسمية)"
- L262: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/store/products`
- GET `/store/orders`
- GET `/store/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
أمر بيع (Sales Order). متاجر بسيطة + B2B.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء أمر + حجز مخزون | store + warehouse | `store.ts` POST `/orders` → `warehouse_products.reservedQty += qty` | `sales_orders`, `sales_order_lines`, `warehouse_products` | ⚠ تحقق من atomicity |
| إخراج المخزون عند الشحن | warehouse | POST `/orders/:id/ship` → ينشئ `warehouse_movement(type='out')` | `warehouse_movements` | ⚠ |
| فاتورة بيع → ZATCA | finance/invoices + zatca | يولّد `invoices` تلقائياً + توقيع ZATCA | `invoices`, `zatca_documents` | ⚠ تحقق من التزامن |
| قيد محاسبي | finance/GL | DR AR (أو Cash) / CR Sales / CR VAT Payable | `gl_entries`, `gl_lines` | ✅ متوقع |
| تكلفة البضاعة المباعة | finance/GL | DR COGS / CR Inventory (FIFO/AVG layer) | `gl_lines` | ✅ |
| رصيد العميل | crm/clients | `clients.balance += orderTotal` | `client_balances_history` | ⚠ |
| إشعار للعميل (تأكيد + شحن) | comms | event=`order_confirmed`, `order_shipped` | `notifications` | ✅ |
| طلب موافقة (للأوامر الكبيرة/الائتمان) | governance/workflows | `business_rules.sales_credit_limit` | `approval_chains` | ⚠ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`sales_orders`) | ✅ |

تحقق يدوي:
- [ ] هل حجز المخزون يُحرر تلقائياً عند إلغاء الأمر؟
- [ ] هل المرتجعات (returns) تنشئ قيد عكسي + حركة إدخال مخزون؟
- [ ] هل أمر بيع يتجاوز حد ائتمان العميل يطلق موافقة أم يُمنع؟
- [ ] هل الأسعار في الأمر مجمّدة وقت الإنشاء أم محسوبة من `products.price` ديناميكياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `orders` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L315 _(inline-data-array)_: `const statCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/store/orders`
- لقطة: `audit/screenshots/store_orders.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
