# /fleet — `artifacts/ghayth-erp/src/pages/fleet.tsx`

## 1. الميتاداتا
- المسار: `/fleet`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:31`
- المجموعة: `fleet`
- الكومبوننت: `Fleet`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `fleet`
- سطور الملف: 520
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L141: "(بلا تسمية)" → `() => setPreviewItem(v)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إدارة الأسطول. المرجع: `docs/blueprints/fleet.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل مركبة جديدة | fleet | `fleet.ts` POST `/vehicles` | `vehicles` | ✅ |
| ربط بأصل ثابت | finance/fixed-assets | `vehicles.assetId` → `fixed_assets` | يولّد سجل إهلاك شهري | ⚠ تحقق |
| تسجيل وقود → قيد مصروف | finance/GL | عند POST `/fuel-logs` → `gl_entries` (DR Fuel Expense / CR Cash) | `fuel_logs`, `gl_entries` | ✅ متوقع |
| تسجيل صيانة → قيد مصروف | finance/GL | POST `/maintenance` → ينشئ `expenses` + `gl_entries` | `maintenance_records`, `expenses` | ✅ |
| تأمين سنوي → قيد prepaid + إهلاك | finance/GL | POST `/insurance` → `prepaid_insurance` + jobs cron amortization | `vehicle_insurance` | ⚠ تحقق |
| رحلة + احتساب التكلفة | fleet/TCO | trip.distance × cost/km → tracked | `trips`, `vehicle_tco` | ✅ |
| ربط السائق بـ HR | hr/employees | `drivers.employeeId` → `employees.id` | `drivers` | ✅ |
| إشعار عند انتهاء وثيقة (تأمين/استمارة) | comms | cron job يقرأ `expiringDate` | `notifications` | ✅ موجود |
| مخالفة مرورية → خصم من الراتب (إن مسؤول السائق) | hr/payroll | `traffic_violations` → `payroll_lines.deduction` | ⚠ تحقق من السياسة |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`vehicles`) | ✅ |

تحقق يدوي:
- [ ] هل cron jobs الـ preventive-maintenance يولّد تذاكر صيانة تلقائياً؟
- [ ] هل تكلفة المركبة الإجمالية (TCO) محسوبة فعلياً أم مجرد عرض؟
- [ ] هل بيع مركبة يولّد قيد تخلّص أصل (asset disposal)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fleet` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet`
- لقطة: `audit/screenshots/fleet.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
