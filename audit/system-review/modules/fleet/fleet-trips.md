# /fleet/trips — `artifacts/ghayth-erp/src/pages/fleet/trips.tsx`

## 1. الميتاداتا
- المسار: `/fleet/trips`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/trips.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:36`
- المجموعة: `fleet`
- الكومبوننت: `Trips`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `trips`
- سطور الملف: 120
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/trips`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
رحلات الأسطول. المرجع: `docs/blueprints/fleet.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل رحلة (يدوي أو من GPS) | fleet | `fleet.ts` POST `/trips` | `fleet_trips` | ✅ |
| ربط بسائق + مركبة | fleet | `trips.driverId`, `trips.vehicleId` | ✅ |
| ربط بعميل (إن trip تجاري) | crm | `trips.clientId` → `clients` | لتوليد فاتورة لاحقاً | ⚠ |
| تكلفة الرحلة (cost/km × distance + وقود + سائق) | fleet/TCO | محسوبة في `vehicle_tco` | ✅ |
| **قيد محاسبي** (إن رحلة تجارية) | finance/GL | DR AR / CR Revenue-Fleet | `gl_entries`, `gl_lines` | ⚠ تحقق |
| تحديث odometer للمركبة | fleet | `vehicles.lastOdometerReading` يتحدّث تلقائياً | تنشيط `preventive-maintenance` rules | ✅ |
| توليد طلب صيانة وقائية تلقائياً | fleet | عند تجاوز عتبة كم/شهر | `maintenance_requests` | ✅ |
| اعتماد ساعات إضافية للسائق | hr/overtime | `trips.endTime - startTime` خارج دوام عادي | `hr_overtime` | ⚠ تحقق |
| إشعارات للمشغّل + المدير | comms | event=`trip_started\|trip_completed\|delay` | `notifications` | ⚠ |
| Audit log | core | `auditMiddleware` (`/fleet/trips`) | `audit_logs` (entity=`trip`) | ✅ |

تحقق يدوي:
- [ ] هل اعتماد المسار يتطلب موافقة قبل البدء (لرحلات طويلة)؟
- [ ] هل الانحراف عن المسار المخطط يطلق تنبيه (geofencing)؟
- [ ] هل وقت الانتظار في الموقع يُحسب كـ overtime؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `trips` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/trips`
- لقطة: `audit/screenshots/fleet_trips.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
