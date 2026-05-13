# /warehouse/inventory-count — `artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/inventory-count`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:107`
- المجموعة: `warehouse`
- الكومبوننت: `InventoryCount`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inventory-count`
- سطور الملف: 462
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L218: "(بلا تسمية)"
- L391: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/warehouse/inventory-counts`
- GET `/warehouse/products?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

الجرد الفعلي (Physical Count / Cycle Count) — أهم عملية للـ inventory accuracy.

| الخطوة | الإجراء |
|--------|---------|
| 1. Plan count | per warehouse / per category / full | `inventory_counts` |
| 2. Freeze movements | guard | يمنع الحركات على المخزون قيد العد |
| 3. توليد count sheets | print | راجع `print-templates` |
| 4. Physical count (scan/manual) | input | `inventory_count_lines` |
| 5. Variance review | calculate | `expected vs actual` |
| 6. Approve variance | RBAC: warehouse manager + finance | راجع `governance/approvals.md` |
| 7. Post adjustment | GL entry | راجع `finance-cogs.md` |
| 8. Unfreeze movements | release lock | حركات تعود طبيعية |
| 9. Audit log + report | إجباري | `audit_logs` + `inventory_count_reports` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Initiate count | POST `/warehouse/inventory-count` | `inventory_counts` | ✅ |
| Freeze | لـ items in count | `inventory_freeze` (lock rows) | ✅ critical |
| Submit count lines | POST `/inventory-count/:id/lines` | bulk | ✅ |
| Calculate variance | server-side | `quantityExpected vs quantityActual` | ✅ |
| Approve | POST `/inventory-count/:id/approve` | lifecycle `pending→approved` | راجع `governance.md` |
| Post adjustment to GL | dr/cr inventory + COGS | راجع `finance-cogs.md` | ✅ |
| Unfreeze | auto بعد الـ approve | ✅ |
| Reject + recount | POST `/inventory-count/:id/recount` | ✅ |
| Notify on large variance | event=`inventory_variance_high` | راجع `notifications.md` | ✅ critical |
| Audit log | كل خطوة | `audit_logs` | ✅ |
| تقرير الجرد السنوي | annual | راجع `bi-reports.md` | ✅ |

تحقق يدوي:
- [ ] هل freeze فعلاً يمنع كل الحركات (sales/transfers/usage)؟
- [ ] هل approve يتطلب رأي finance + warehouse معاً للـ variance الكبير؟
- [ ] هل GL adjustment تلقائي بعد approve أم يدوي؟
- [ ] هل العد الجزئي (cycle count) يدعم scan via mobile barcode؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inventory-count` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/inventory-count`
- لقطة: `audit/screenshots/warehouse_inventory_count.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
