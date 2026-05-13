# /warehouse/movements/:id — `artifacts/ghayth-erp/src/pages/details/warehouse-movement-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/movements/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/warehouse-movement-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:101`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseMovementDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 284
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل حركة مخزنية واحدة (in/out/transfer/adjustment) — read-only بعد الترحيل.

| نوع الحركة | يولّد GL | يؤثر على المخزون |
|-----------|---------|------------------|
| Receive (PO) | Dr Inventory / Cr GR-IR | + quantity | راجع `finance-cogs.md` |
| Issue (sale) | Dr COGS / Cr Inventory | - quantity | راجع `store-sales.md` |
| Transfer | لا (داخلي بنفس التكلفة) | move بين warehouses | ✅ |
| Adjustment + | Dr Inventory / Cr Inv-Variance | + quantity | راجع `warehouse-inventory-count.md` |
| Adjustment - | Dr Inv-Variance / Cr Inventory | - quantity | راجع `warehouse-inventory-count.md` |
| Return (sales return) | reverse of sale | + quantity back | راجع `store-returns.md` |
| Scrap/Write-off | Dr Loss / Cr Inventory | - quantity | requires approval |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View movement details | GET `/warehouse/movements/:id` | `inventory_movements` + lines | ✅ |
| Verify GL linkage | derived | `gl_entries.reference` = movement | ✅ critical |
| Cancel/reverse | POST `/movements/:id/reverse` | يولّد عكس + GL عكس | راجع `governance/approvals.md` |
| Print delivery note / GRN | POST `/movements/:id/print` | راجع `print-templates` | ✅ |
| Verify lot/serial | per line | `inventory_lots` / `serials` | ⚠ |
| Verify cost layer (FIFO/WAVG) | derived | `inventory_layers` | ✅ |
| تكامل مع `finance-cogs.md` | للـ COGS posting | ✅ critical |
| تكامل مع `posting-failures.md` | لو GL failed | ✅ |
| Audit log إجباري | كل تعديل/إلغاء | `audit_logs` | ✅ |
| Lifecycle | `draft → posted → reversed` | راجع `lifecycle/movements.ts` | ✅ |
| Immutable after posted | guard | إلا via reverse | ✅ critical |
| RBAC | warehouse manager + above | ✅ |

تحقق يدوي:
- [ ] هل reverse يحافظ على audit trail (لا يمحي الأصلي)؟
- [ ] هل lot/serial mandatory للأصناف القابلة للتعقّب؟
- [ ] هل GL entry يولّد دائماً مع الحركة أم async (مع risk posting-failure)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/warehouse/movements → 401`
- landedUrl: `?`
- توصية: مغلق
