# /fleet/drivers — `artifacts/ghayth-erp/src/pages/fleet/drivers.tsx`

## 1. الميتاداتا
- المسار: `/fleet/drivers`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/drivers.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:33`
- المجموعة: `fleet`
- الكومبوننت: `Drivers`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `drivers`
- سطور الملف: 154
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L73: "(بلا تسمية)" → `() => setPreviewDriver(d)`

### القراءات (GET)
- GET `/fleet/drivers`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
السائقون — موظفون مع dimension إضافي (رخصة، نقاط، حوادث).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل سائق | fleet | POST `/fleet/drivers` | `drivers` | ✅ |
| ربط بـ employee | hr/employees | `drivers.employeeId` → `employees.id` | ✅ |
| رخصة القيادة (License) | fleet | `drivers.licenseNumber`, `licenseExpiry` | تذكير قبل الانتهاء | ✅ |
| تذكير قبل انتهاء الرخصة | comms | cron (90/30/7) | `notifications` | ✅ |
| نقاط الرخصة (سعودية: 24 max) | fleet | `drivers.points` | ⚠ |
| المخالفات المرورية | fleet/traffic-violations | `traffic_violations.driverId` | راجع `fleet.md` | ✅ |
| الحوادث | fleet/insurance | `driver_accidents` → claims | راجع `fleet-insurance.md` | ⚠ |
| ربط بالرحلات | fleet/trips | `trips.driverId` | راجع `fleet-trips.md` | ✅ |
| تعطيل (suspended) | fleet | يمنع trips جديدة | guard | ⚠ |
| تأثير على الراتب (bonus/خصم) | hr/payroll | `payroll_lines` | ⚠ |
| تكامل أبشر/قوى | gov-integrations | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` لو مضاف | ⚠ |

تحقق يدوي:
- [ ] هل رخصة منتهية تمنع بدء رحلة آلياً؟
- [ ] هل تجاوز نقاط الرخصة يعلّق السائق آلياً؟
- [ ] هل المتعاقدين (غير موظفين) مدعومون؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `drivers` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/drivers`
- لقطة: `audit/screenshots/fleet_drivers.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
