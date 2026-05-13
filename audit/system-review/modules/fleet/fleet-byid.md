# /fleet/:id — `artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx`

## 1. الميتاداتا
- المسار: `/fleet/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:56`
- المجموعة: `fleet`
- الكومبوننت: `VehicleDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 826
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L159: "تغيير الحالة"
- L163: "تعديل" → `startEdit`
- L166: "تأكيد الحذف" → `handleDelete`
- L167: "(بلا تسمية)" → `() => setDeleting(false)`
- L170: "(بلا تسمية)" → `() => setDeleting(true)`
- L248: "حفظ" → `saveEdit`
- L249: "(بلا تسمية)" → `() => setEditing(false)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل مركبة واحدة — full vehicle profile.

| الفئة | الأمثلة |
|------|---------|
| Sedan | سيدان | passenger |
| SUV | دفع رباعي |
| Truck | شاحنة | commercial |
| Van | فان | transport |
| Heavy equipment | معدات ثقيلة | construction |
| Motorcycle | دراجة |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View vehicle | GET `/fleet/:id` | `vehicles` | ✅ |
| Status (active/maintenance/idle/sold) | راجع `fleet-byid-status.md` | ✅ |
| Current driver | linked | راجع `fleet-drivers-byid.md` | ✅ |
| Fuel history | راجع `fleet-fuel.md` | ✅ |
| Maintenance history | راجع `fleet-maintenance-byid.md` | ✅ |
| Insurance status | راجع `fleet-insurance.md` | ✅ critical |
| Traffic violations | راجع `fleet-traffic-violations-byid.md` | ✅ |
| Mileage (odometer) | tracking | per check-in | ✅ |
| Registration (Istimara) | mandatory expiry | Saudi MoI | ✅ critical |
| MVPI (فحص دوري) | mandatory expiry | Saudi MoI | ✅ critical |
| Salik/Tarweed (toll) | charges | راجع `finance-expenses.md` | ⚠ |
| Fuel cost per km KPI | aggregate | راجع `bi-kpis.md` ✅ |
| Utilization rate (km driven vs idle) | KPI | ✅ |
| Total cost of ownership | aggregate | ✅ |
| Linked fixed asset | راجع `finance-fixed-assets-byid.md` | ✅ critical |
| Depreciation schedule | per vehicle | ✅ critical |
| GPS/telematics integration | external | راجع `admin-integrations.md` | ⚠ |
| Geofencing alerts | event=`vehicle_out_of_zone` | راجع `notifications.md` | ⚠ |
| Speeding alerts | event=`speed_violation` | راجع `notifications.md` | ⚠ |
| Mark for sale/disposal | with valuation | راجع `finance-fixed-assets-byid.md` | ✅ |
| Expiry alerts (insurance/registration/MVPI 90/30/7 يوم) | cron | راجع `notifications.md` | ✅ critical |
| تكامل مع `hr/employees.md` (driver assignment) | ✅ |
| تكامل مع `finance-expenses.md` (fuel + maintenance + traffic) | ✅ |
| تكامل مع `finance-fixed-assets-byid.md` (asset register) | ✅ critical |
| تكامل مع Najz (لو traffic dispute) | راجع `admin-integrations.md` | ⚠ |
| Audit log إجباري | كل تعديل status/driver | `audit_logs` | ✅ |
| RBAC | fleet manager + above | ✅ |

تحقق يدوي:
- [ ] هل registration/insurance/MVPI expiry alerts بـ 90/30/7/1 يوم متعددة؟
- [ ] هل GPS data retention تحترم PDPL؟
- [ ] هل depreciation schedule auto-aligned مع fixed assets module؟
- [ ] هل traffic violations تربط بالـ driver + خصم من salary لو مذنب؟
- [ ] هل GPS unauthorized usage detected (after-hours)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=SKIP
- ملاحظة: `landed=/dashboard expected=/fleet/7`
- لقطة: `audit/screenshots/fleet_id.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
