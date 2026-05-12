# /fleet/fuel — `artifacts/ghayth-erp/src/pages/fleet/fuel.tsx`

## 1. الميتاداتا
- المسار: `/fleet/fuel`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/fuel.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:42`
- المجموعة: `fleet`
- الكومبوننت: `Fuel`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `fuel`
- سطور الملف: 66
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
استهلاك الوقود (per vehicle, per trip).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل تعبئة وقود | fleet | `fleet.ts` POST `/fuel-logs` | `fleet_fuel_logs` | ✅ |
| ربط بمركبة + سائق | fleet | `fuel.vehicleId`, `fuel.driverId` | ✅ |
| تحديث odometer | fleet | `vehicles.lastOdometerReading` يُحدّث | ✅ |
| كشف شذوذ (انحراف عن المعدل) | fleet | حساب km/L → مقارنة بـ baseline | ⚠ تحقق |
| **قيد محاسبي** | finance/GL | DR Fuel Expense / CR Cash أو AP | `gl_entries` | ✅ |
| ربط بكوبون/بطاقة وقود | fleet | `fuel.cardNumber` للتتبع | ⚠ |
| ربط بمحطة (vendor) | finance/vendors | اختياري — `fuel.vendorId` | ⚠ |
| تأثير على TCO + cost/km | fleet | aggregation في `vehicle_tco` | view | ✅ |
| إشعار عند استهلاك مرتفع | comms | event=`fuel_consumption_anomaly` | `notifications` | ⚠ غير افتراضي |
| تقرير شهري | bi | aggregation per department/vehicle | views | ✅ |
| Audit log | core | `auditMiddleware` (`/fleet/fuel-logs`) | `audit_logs` (entity=`fuel_log`) | ✅ |

تحقق يدوي:
- [ ] هل تعبئة بنفس اليوم أكثر من مرة على نفس المركبة تطلق تنبيه؟
- [ ] هل الفرق بين odometer الجديد والقديم منطقي قبل القبول؟
- [ ] هل وقود شخصي (نهاية الأسبوع للسائق) ممكن فصله محاسبياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fuel` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/fuel`
- لقطة: `audit/screenshots/fleet_fuel.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
