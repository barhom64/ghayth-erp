# /finance/inventory-costing — `artifacts/ghayth-erp/src/pages/finance/inventory-costing.tsx`

## 1. الميتاداتا
- المسار: `/finance/inventory-costing`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/inventory-costing.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:128`
- المجموعة: `finance`
- الكومبوننت: `InventoryCosting`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inventory-costing`
- سطور الملف: 238
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/rounding-account/setup` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/inventory-costing`
- GET `/finance/rounding-account`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تكلفة المخزون (Inventory Costing). FIFO/AVG/LIFO. المرجع: `docs/INVENTORY_ADVANCED_DESIGN.md`.

| الطريقة | الوصف | متى تُستخدم |
|---------|------|------------|
| **FIFO** (First-In First-Out) | كل واحدة لها cost = أقدم layer | الافتراضي IFRS |
| **AVG** (Weighted Average) | running average per product | شائع في الـ retail |
| **LIFO** | آخر داخل أول خارج | غير مسموح IFRS لكن يُستخدم محلياً |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء inventory layer عند الإدخال | `lib/inventory/valuation/` | `inventory_layers` (qty, cost, date) | ✅ |
| استهلاك من layer عند الإخراج | FIFO: من الأقدم؛ AVG: weighted | يخفض `qty`، يحفظ snapshot في `inventory_cost_lines` | ✅ |
| **قيد محاسبي عند الإخراج** | finance/GL | DR COGS / CR Inventory (بقيمة الـ layer المستخدمة) | راجع `finance-fixed-assets.md` | ✅ |
| Variance من standard cost | aggregation per product | تقرير | ⚠ تحقق |
| Cycle count adjustments | warehouse | عند inventory-count discrepancy | يولّد قيد adjustment | راجع `warehouse-products-byid.md` |
| Lot tracking (للأدوية/الأغذية) | warehouse | `inventory_lots.expiryDate` | ✅ |
| Write-off (expired/damaged) | finance/GL | DR Inventory Loss / CR Inventory | `lotWriteoffJournal` test يغطّيها | ✅ |
| تأثير على balance sheet | finance/reports | `inventory_value` aggregate | ✅ |
| GL reconciliation | راجع `admin-gl-reconciliation.md` | sum layers vs gl_lines Inventory account | ✅ |
| Audit log | core | `auditMiddleware` (`/warehouse/movements`) | ✅ |

تحقق يدوي:
- [ ] هل التحوّل من طريقة لأخرى (FIFO ↔ AVG) محظور أم ممكن مع revaluation؟
- [ ] هل cost layer منفصل per branch/warehouse أم unified؟
- [ ] هل expired lots تطلق تنبيه قبل anti-write-off?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inventory-costing` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/inventory-costing`
- لقطة: `audit/screenshots/finance_inventory_costing.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
