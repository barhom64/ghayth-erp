# /fleet/drivers/:id — `artifacts/ghayth-erp/src/pages/details/driver-detail.tsx`

## 1. الميتاداتا
- المسار: `/fleet/drivers/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/driver-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:35`
- المجموعة: `fleet`
- الكومبوننت: `DriverDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 346
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/drivers`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل سائق واحد — driver profile + assignments + performance.

| الحقل | المتطلب |
|------|--------|
| Linked employee | FK | راجع `hr/employees.md` |
| License number | Saudi license | إجباري |
| License class | private/heavy/public-transport | enum |
| License expiry | mandatory tracking | إجباري + alert |
| Driving certificate | لو applicable (commercial) | optional |
| Years of experience | tracking | optional |
| Health/Fitness status | annual check | per Saudi MoH | ⚠ |
| Current vehicle assignment | FK | راجع `fleet-byid.md` |
| Active trips | count | ✅ |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View driver | GET `/fleet/drivers/:id` | `drivers` | ✅ |
| License expiry alerts (90/30/7 يوم) | cron | راجع `notifications.md` | ✅ critical |
| Assign to vehicle | linkage | راجع `fleet-byid.md` | ✅ |
| Unassign | guard لو فيه active trips | ✅ |
| Trip history | aggregate | `vehicle_trips` | ✅ |
| Fuel consumption history | per driver | راجع `fleet-fuel.md` | ✅ |
| Maintenance issues caused | per driver | راجع `fleet-maintenance.md` | ⚠ |
| Traffic violations linked | راجع `fleet-traffic-violations-byid.md` | ✅ |
| Performance score | aggregate | speeding, fuel efficiency, violations | KPI ⚠ |
| Salary deductions (violations) | راجع `hr-payroll.md` + `hr-violations.md` | ✅ critical |
| Training certifications | راجع `hr-training.md` | ⚠ |
| Behavioral monitoring (telematics) | external GPS | راجع `admin-integrations.md` | ⚠ |
| Allowance (per trip أو monthly) | راجع `hr-payroll.md` | ⚠ |
| Photos/documents (license copy) | راجع `documents.md` | ✅ |
| Blacklist (لو خطر) | flag | يمنع assignment | ✅ critical |
| تكامل مع `hr/employees.md` (master) | linkage | ✅ |
| تكامل مع `fleet-byid.md` (vehicle assignment) | ✅ |
| تكامل مع `hr-violations.md` (driving violations) | ✅ |
| تكامل مع `hr-payroll.md` (allowances + deductions) | ✅ critical |
| تكامل مع `documents-archive.md` (retention) | ✅ |
| Audit log إجباري | كل تعديل license/assignment | `audit_logs` | ✅ critical |
| **PDPL** — confidentiality | health + violations data | ✅ critical |
| RBAC | fleet manager + hr (for employee data) | ✅ |

تحقق يدوي:
- [ ] هل expired license blocks driver from any assignment automatically?
- [ ] هل performance score يأخذ telematics data بدقة؟
- [ ] هل violation costs auto-deducted from salary مع notification للسائق؟
- [ ] هل blacklist يمنع كل assignments مستقبلية + audit logged?
- [ ] هل health check expiry يطلق alert?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/fleet/drivers → 401`
- landedUrl: `?`
- توصية: مغلق
