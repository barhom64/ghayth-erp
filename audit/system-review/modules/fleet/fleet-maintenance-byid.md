# /fleet/maintenance/:id — `artifacts/ghayth-erp/src/pages/details/maintenance-detail.tsx`

## 1. الميتاداتا
- المسار: `/fleet/maintenance/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/maintenance-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:41`
- المجموعة: `fleet`
- الكومبوننت: `MaintenanceDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 305
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل صيانة مركبة — workshop order.

| نوع الصيانة | الوصف |
|------------|------|
| Preventive (دورية) | per km/months | راجع `fleet-preventive-plans.md` |
| Corrective (عند العطل) | reactive | break-down |
| Emergency | road-side assistance | urgent |
| Inspection | فحص دوري | annual MVPI |
| Tire/Battery | per use cycle | scheduled |
| Bodywork | accident-related | claims |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View maintenance | GET `/fleet/maintenance/:id` | `vehicle_maintenance` | ✅ |
| Approve (cost threshold) | راجع `governance/approvals.md` | ✅ |
| Assign workshop (internal/external) | with capacity | راجع `warehouse-suppliers.md` لو external | ✅ |
| Parts requisition | from inventory | راجع `warehouse-movements.md` | ✅ critical |
| Labor hours | per mechanic | ⚠ |
| Pre/post photos | mandatory | راجع `documents.md` | ✅ |
| Verify completion | manager sign-off | ✅ critical |
| GL entry — maintenance expense | Dr Maintenance Expense / Cr AP أو Inventory | ✅ critical |
| GL entry — capital improvement (لو major) | راجع `finance-fixed-assets-byid.md` | ⚠ |
| Charge to project (لو vehicle attached) | راجع `projects.md` | ⚠ |
| Insurance claim (لو accident) | راجع `fleet-insurance.md` | ⚠ |
| Warranty check (لو لسه covered) | per part/service | ⚠ |
| Vehicle status update (in-maintenance) | راجع `fleet-byid-status.md` | ✅ |
| Next service due | calculated | راجع `fleet-preventive-plans.md` | ✅ |
| تكامل مع `warehouse-movements.md` (parts) | inventory deduction | ✅ critical |
| تكامل مع `finance-vendor-bills.md` (external workshop) | ✅ |
| تكامل مع `bi-kpis.md` (maintenance cost per km) | ✅ |
| تكامل مع `documents.md` (work orders + invoices) | retention | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | fleet manager + workshop staff | ✅ |

تحقق يدوي:
- [ ] هل parts deduction من inventory تلقائي + GL?
- [ ] هل capital improvement vs operational expense classification صحيح?
- [ ] هل warranty check يمنع double-billing?
- [ ] هل photos before/after إجبارية للأعمال > X SAR?
- [ ] هل vehicle out-of-service يُعكس تلقائياً على dispatch planning?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/fleet/maintenance → 401`
- landedUrl: `?`
- توصية: مغلق
