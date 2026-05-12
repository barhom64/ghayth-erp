# /fleet/maintenance — `artifacts/ghayth-erp/src/pages/fleet/maintenance.tsx`

## 1. الميتاداتا
- المسار: `/fleet/maintenance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/maintenance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:39`
- المجموعة: `fleet`
- الكومبوننت: `FleetMaintenance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `maintenance`
- سطور الملف: 94
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/maintenance`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
صيانة المركبات (preventive + corrective).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل أمر صيانة | fleet | `fleet.ts` POST `/maintenance` | `fleet_maintenance` | ✅ |
| اقتراح صيانة وقائية (تلقائي) | fleet | cron يقرأ odometer + interval | ينشئ row تلقائياً | ✅ |
| ربط بمركبة | fleet | `maintenance.vehicleId` → `vehicles` | ✅ |
| إسناد لورشة (vendor) | finance/vendors | `maintenance.vendorId` → `vendors` | ✅ |
| تقدير + اعتماد التكلفة | governance/workflows | `business_rules.fleet_maintenance_approval` | `approval_chains` | ✅ |
| تنفيذ + رفع تقارير | fleet | `maintenance_attachments` (قبل/بعد + فاتورة) | object storage | ✅ |
| **قيد محاسبي** | finance/GL | DR Vehicle Maintenance Expense / CR AP أو Cash | `gl_entries` | ✅ |
| تحديث vehicle status | fleet | أثناء الصيانة `vehicles.status='in_maintenance'` | ✅ |
| تعطيل الرحلات أثناء الصيانة | fleet/trips | `trips` لا تستطيع البدء على مركبة معطّلة | guard | ⚠ تحقق |
| تأثير على TCO | fleet | aggregation in `vehicle_tco` | view | ✅ |
| إشعارات (السائق + المدير + المالية) | comms | event=`maintenance_scheduled\|completed\|overdue` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/fleet/maintenance`) | `audit_logs` (entity=`maintenance`) | ✅ |

تحقق يدوي:
- [ ] هل تجاوز ميزانية الصيانة السنوية يطلق تنبيه؟
- [ ] هل الصيانة الطارئة تتخطى الـ approval (emergency override)؟
- [ ] هل التكلفة الفعلية > التقدير بـ X% تطلب موافقة إضافية؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `maintenance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/maintenance`
- لقطة: `audit/screenshots/fleet_maintenance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
