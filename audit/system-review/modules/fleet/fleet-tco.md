# /fleet/tco — `artifacts/ghayth-erp/src/pages/fleet/tco.tsx`

## 1. الميتاداتا
- المسار: `/fleet/tco`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/tco.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:54`
- المجموعة: `fleet`
- الكومبوننت: `TCO`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tco`
- سطور الملف: 168
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/vehicles?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
TCO — Total Cost of Ownership per vehicle. KPI استراتيجي لإدارة الأسطول.

| مكوّن التكلفة | المصدر | الحساب |
|--------------|--------|--------|
| Acquisition | `vehicles.purchasePrice` + رسوم تسجيل | one-time |
| Depreciation (شهري) | `fixed_assets` linked → `depreciation_schedules` | راجع `fixed-assets.md` |
| Fuel | aggregate `fleet_fuel_logs.cost` | per period |
| Maintenance | aggregate `fleet_maintenance.cost` | preventive + corrective |
| Insurance | amortized monthly | راجع `fleet-insurance.md` |
| Tolls + traffic violations | aggregate `traffic_violations.amount` | per period |
| Driver salary allocation | `payroll_lines.basic` × allocation% | per vehicle/driver |
| Idle time cost | hours × hourly_rate | opportunity cost |
| Resale value | current estimate | for ROI calc |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate TCO | `fleet.ts` GET `/fleet/tco` | aggregations | ✅ |
| Per vehicle / portfolio | drill-down | views | ✅ |
| Comparative analysis (vehicles) | rank by cost/km | ✅ |
| Trigger maintenance review لو TCO > threshold | rules | ⚠ |
| Recommend retirement (لو cost > depreciation rate) | analysis | ⚠ يدوي |
| تكامل مع finance (للـ budget) | `budgets.committed` للأسطول | ⚠ |
| تنبيهات للـ Fleet Manager | event=`vehicle_tco_anomaly` | `notifications` | ⚠ |
| تقرير ربع سنوي للـ executive | راجع `misc/exec-dashboard.md` | ✅ |
| Audit log | read-only | ✅ |

تحقق يدوي:
- [ ] هل allocation % للسائق صحيح لو السائق يقود عدة مركبات؟
- [ ] هل التكلفة per km محسوبة من actual km (odometer) أم planned؟
- [ ] هل توصية retirement تأخذ في الاعتبار resale value الحالية؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tco` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/tco`
- لقطة: `audit/screenshots/fleet_tco.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
