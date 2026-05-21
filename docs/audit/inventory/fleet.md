# جرد المسار — الأسطول (Fleet)

هذا التقرير جردٌ ثابت (static audit) لمسار «الأسطول» في نظام Ghayth ERP، يغطي ملف المسار الخلفي `artifacts/api-server/src/routes/fleet.ts` (3032 سطراً، 46 endpoint)، وتسجيل المسارات الأمامية `fleetRoutes.tsx`، وصفحات الواجهة وصفحات الإنشاء وصفحات التفاصيل. تمّ التحقق من كل عنصر بقراءة الكود وبنية قاعدة البيانات مباشرةً (`db/schema_pre.sql`) دون تشغيل النظام.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-01 | `/fleet` | `pages/fleet.tsx` | شغّال | `GET /fleet/stats`، `GET /fleet/vehicles`، `GET /fleet/drivers`، `GET /fleet/trips`، `GET /fleet/maintenance`، `GET /fleet/fuel-logs` | تبويب «الوقود» يستدعي `/fleet/fuel-logs` فعلياً رغم أن route الواجهة `/fleet/fuel` |
| P-02 | `/fleet/vehicles/create` | `pages/create/fleet/vehicles-create.tsx` | شغّال | `POST /fleet/vehicles` | حقل `status` يُرسَل لكنه يُتجاهَل في الخادم (يُدرَج `available` دائماً) — FLT-005 |
| P-03 | `/fleet/drivers` | `pages/fleet/drivers.tsx` | شغّال | `GET /fleet/drivers`، `PATCH/DELETE /fleet/drivers/:id` | لا يوجد |
| P-04 | `/fleet/drivers/create` | `pages/create/fleet/drivers-create.tsx` | شغّال | `POST /fleet/drivers`، `GET /employees` | لا يوجد |
| P-05 | `/fleet/drivers/:id` | `pages/details/driver-detail.tsx` | شغّال | `GET /fleet/drivers/:id`، `GET /fleet/drivers`، `GET /fleet/vehicles`، `PATCH/DELETE /fleet/drivers/:id` | يجلب كامل قائمة المركبات للبحث عن المركبة المسندة — مشكلة تحجيم FLT-012 |
| P-06 | `/fleet/trips` | `pages/fleet/trips.tsx` | شغّال | `GET /fleet/trips` | لا يوجد |
| P-07 | `/fleet/trips/create` | `pages/create/fleet/trips-create.tsx` | ناقص | `POST /fleet/trips` | حقلا `status` و`endTime` يُرسَلان لكن الخادم يتجاهلهما (يُدرَج `in_progress` دائماً) — FLT-004 |
| P-08 | `/fleet/trips/:id` | `pages/fleet/trip-detail.tsx` | مكسور | `GET /fleet/trips/:id`، `GET /fleet/fuel-logs?tripId=`، `GET /fleet/maintenance?vehicleId=`، `PATCH /fleet/trips/:id` | زرّا «إكمال» و«إلغاء» يستدعيان `PATCH` بحالة نهائية يرفضها الخادم بـ409 — FLT-001 |
| P-09 | `/fleet/maintenance` | `pages/fleet/maintenance.tsx` | شغّال | `GET /fleet/maintenance` | لا يوجد |
| P-10 | `/fleet/maintenance/create` | `pages/create/fleet/maintenance-create.tsx` | شغّال | `POST /fleet/maintenance` | حقل `attachments` يُرسَل ولا يُخزَّن (لا عمود ولا معالجة) — FLT-009 |
| P-11 | `/fleet/maintenance/:id` | `pages/details/maintenance-detail.tsx` | ناقص | `GET /fleet/maintenance/:id`، `PATCH/DELETE /fleet/maintenance/:id` | حقلا التعديل `odometer` و`notes` لا يطابقان schema/الجدول — FLT-002 |
| P-12 | `/fleet/fuel` | `pages/fleet/fuel.tsx` | شغّال | `GET /fleet/fuel-logs` | route الواجهة `/fleet/fuel` لكن endpoint الخادم `/fleet/fuel-logs` (مفارقة المسار المعروفة) |
| P-13 | `/fleet/fuel/create` | `pages/create/fleet/fuel-create.tsx` | شغّال | `POST /fleet/fuel-logs` | لا يوجد |
| P-14 | `/fleet/fuel/:id` | `pages/details/fuel-detail.tsx` | شغّال | `GET /fleet/fuel-logs/:id`، `PATCH/DELETE /fleet/fuel-logs/:id` | لا يوجد |
| P-15 | `/fleet/insurance` | `pages/fleet/insurance.tsx` | شغّال | `GET /fleet/insurance` | لا يوجد |
| P-16 | `/fleet/insurance/create` | `pages/create/fleet/insurance-create.tsx` | شغّال | `POST /fleet/insurance` | حقل `attachments` يُرسَل ولا يُخزَّن — FLT-009 |
| P-17 | `/fleet/insurance/:id` | `pages/details/insurance-detail.tsx` | شغّال | `GET /fleet/insurance/:id`، `PATCH/DELETE /fleet/insurance/:id` | لا يوجد |
| P-18 | `/fleet/alerts` | `pages/fleet/alerts.tsx` | شغّال | `GET /fleet/alerts` | التنبيهات محسوبة لحظياً بلا جدول؛ زر «إضافة تنبيه» يفتح إنشاء صيانة (لا تنبيهات حقيقية) — FLT-006 |
| P-19 | `/fleet/alerts/create` | `pages/create/fleet/alerts-create.tsx` | ناقص | `POST /fleet/maintenance` | الصفحة «إنشاء تنبيه» تنشئ سجل صيانة فعلياً — FLT-006 |
| P-20 | `/fleet/reports` | `pages/fleet/reports.tsx` | شغّال | `GET /fleet/stats`، `/export/excel/fleet`، `/export/pdf/fleet-trips` | endpoints التصدير خارج نطاق `fleet.ts` — يحتاج تحقق |
| P-21 | `/fleet/preventive-plans` | `pages/fleet/preventive-plans.tsx` | ناقص | `GET /fleet/preventive-plans`، `POST /fleet/preventive-plans`، `GET /fleet/vehicles` | endpoint `PATCH /preventive-plans/:id` موجود لكن الصفحة لا تعرض تعديلاً أو حذفاً — FLT-007 |
| P-22 | `/fleet/traffic-violations` | `pages/fleet/traffic-violations.tsx` | شغّال | `GET /fleet/traffic-violations`، `POST /fleet/traffic-violations`، `PATCH /fleet/traffic-violations/:id/pay`، `GET /fleet/vehicles`، `GET /fleet/drivers` | لا تُرسِل `liability` (الخادم يفترض «على الشركة») |
| P-23 | `/fleet/traffic-violations/:id` | `pages/details/traffic-violation-detail.tsx` | ناقص | `GET /fleet/traffic-violations/:id` | عرض فقط — لا تعديل ولا حذف ولا زر سداد (لا endpoint حذف أصلاً) — FLT-008 |
| P-24 | `/fleet/tco` | `pages/fleet/tco.tsx` | شغّال | `GET /fleet/vehicles`، `GET /fleet/vehicles/:id/tco` | TCO يعتمد على `purchasePrice`/`purchaseDate` غير الموجودين بالجدول — FLT-003 |
| P-25 | `/fleet/:id/status` | `pages/create/fleet/vehicle-status-change.tsx` | شغّال | `GET /fleet/vehicles/:id`، `GET /fleet/vehicles/:id/impact-preview`، `PATCH /fleet/vehicles/:id` | لا يوجد |
| P-26 | `/fleet/:id` | `pages/details/vehicle-detail.tsx` | شغّال | `GET /fleet/vehicles/:id`، `GET /fleet/vehicles/:id/tco`، `PATCH/DELETE /fleet/vehicles/:id` | لا يوجد |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| trip-detail | إكمال | إقفال الرحلة مع التكلفة والقيد | `POST /fleet/trips/:id/complete` | مكسور — يستدعي `PATCH` بحالة `completed` يرفضها الخادم 409 | dead |
| trip-detail | إلغاء | إلغاء الرحلة وتحرير الموارد | `POST /fleet/trips/:id/cancel` | مكسور — يستدعي `PATCH` بحالة `cancelled` يرفضها الخادم 409 | dead |
| fleet (vehicles tab) | إضافة مركبة | فتح صفحة الإنشاء | `POST /fleet/vehicles` | شغّال | — |
| fleet (vehicles tab) | تعديل سطري | تعديل المركبة | `PATCH /fleet/vehicles/:id` | شغّال | — |
| fleet (vehicles tab) | حذف سطري | حذف ناعم للمركبة | `DELETE /fleet/vehicles/:id` | شغّال | — |
| fleet (drivers tab) | تعديل/حذف سطري | تعديل/حذف السائق | `PATCH/DELETE /fleet/drivers/:id` | شغّال | — |
| vehicle-detail | تغيير الحالة | الانتقال لصفحة الحالة | `PATCH /fleet/vehicles/:id` | شغّال | — |
| vehicle-detail | حذف | حذف ناعم للمركبة | `DELETE /fleet/vehicles/:id` | شغّال | — |
| traffic-violations | دفع | تسجيل سداد المخالفة + قيد | `PATCH /fleet/traffic-violations/:id/pay` | شغّال | — |
| traffic-violations | تسجيل مخالفة | إنشاء مخالفة | `POST /fleet/traffic-violations` | شغّال | — |
| traffic-violation-detail | (لا أزرار فعّالة) | تعديل/حذف المخالفة | — | مكسور — لا يوجد endpoint تعديل/حذف للمخالفة | dead |
| alerts | إضافة تنبيه | إنشاء تنبيه | `POST /fleet/maintenance` | مضلِّل — ينشئ صيانة لا تنبيهاً | conflict |
| preventive-plans | إضافة خطة | إنشاء خطة وقائية | `POST /fleet/preventive-plans` | شغّال | — |
| preventive-plans | (لا تعديل/حذف) | تعديل الخطة | `PATCH /fleet/preventive-plans/:id` | ناقص — endpoint موجود بلا واجهة | dead |
| maintenance-detail | تعديل (العداد/ملاحظات) | تحديث سجل الصيانة | `PATCH /fleet/maintenance/:id` | جزئي — حقلا `odometer`/`notes` يُسقَطان بصمت | mismatch |
| maintenance-detail | حذف | حذف ناعم للصيانة | `DELETE /fleet/maintenance/:id` | شغّال | — |
| vehicle-status-change | معاينة الأثر | جلب أثر تغيير الحالة | `GET /fleet/vehicles/:id/impact-preview` | شغّال | — |
| tco | اختيار مركبة | جلب تحليل TCO | `GET /fleet/vehicles/:id/tco` | شغّال جزئياً — قيم الشراء صفرية دائماً | mismatch |
| reports | تصدير إكسل/PDF | تنزيل تقرير | `/export/excel/fleet`، `/export/pdf/fleet-trips` | غير قابل للتحقق — خارج `fleet.ts` | — |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/fleet/vehicles` | GET | fleet.ts:285 | parseScopeFilters | fleet.tsx, tco.tsx, traffic-violations.tsx, preventive-plans.tsx | fleet_vehicles | شغّال | — |
| `/fleet/vehicles` | POST | fleet.ts:302 | createVehicleSchema | vehicles-create.tsx | fleet_vehicles | شغّال | `status` يُتجاهَل؛ يقرأ `purchasePrice` غير المعرَّف بالschema |
| `/fleet/drivers` | GET | fleet.ts:392 | parseScopeFilters | fleet.tsx, traffic-violations.tsx, driver-detail.tsx | fleet_drivers | شغّال | JOIN مباشر على `employees`/`employee_assignments` |
| `/fleet/drivers` | POST | fleet.ts:416 | createDriverSchema | drivers-create.tsx | fleet_drivers | شغّال | قراءة مباشرة لجدول `employees` (cross-domain) |
| `/fleet/vehicles/:id` | GET | fleet.ts:484 | parseId | vehicle-detail.tsx, vehicle-status-change.tsx | fleet_vehicles | شغّال | — |
| `/fleet/vehicles/:id/impact-preview` | GET | fleet.ts:517 | query.status | vehicle-status-change.tsx | fleet_vehicles | شغّال | — |
| `/fleet/vehicles/:id` | PATCH | fleet.ts:530 | updateVehicleSchema | vehicle-detail.tsx, fleet.tsx, vehicle-status-change.tsx | fleet_vehicles | شغّال | — |
| `/fleet/vehicles/:id` | DELETE | fleet.ts:669 | parseId | vehicle-detail.tsx, fleet.tsx | fleet_vehicles | شغّال | — |
| `/fleet/drivers/:id` | GET | fleet.ts:721 | parseId | driver-detail.tsx | fleet_drivers | شغّال | — |
| `/fleet/drivers/:id` | PATCH | fleet.ts:731 | updateDriverSchema | driver-detail.tsx, fleet.tsx | fleet_drivers | شغّال | — |
| `/fleet/drivers/:id` | DELETE | fleet.ts:825 | parseId | driver-detail.tsx, fleet.tsx | fleet_drivers | شغّال | — |
| `/fleet/trips` | GET | fleet.ts:867 | parseScopeFilters | trips.tsx, fleet.tsx | fleet_trips | شغّال | — |
| `/fleet/trips/:id` | GET | fleet.ts:892 | parseId | trip-detail.tsx | fleet_trips | شغّال | — |
| `/fleet/trips` | POST | fleet.ts:910 | createTripSchema | trips-create.tsx | fleet_trips | شغّال | يتجاهل `status`/`endTime`؛ تحديث حالة المركبة/السائق بلا audit؛ يقرأ `v.latitude/longitude` غير الموجودين |
| `/fleet/trips/:id/complete` | POST | fleet.ts:1132 | completeTripSchema | (لا UI) | fleet_trips | شغّال backend | لا تستدعيه أي واجهة — trip-detail يستخدم PATCH بدلاً منه |
| `/fleet/trips/:id/cancel` | POST | fleet.ts:1226 | cancelTripSchema | (لا UI) | fleet_trips | شغّال backend | لا تستدعيه أي واجهة |
| `/fleet/trips/:id/waypoints` | POST | fleet.ts:1288 | createWaypointSchema | (لا UI) | fleet_gps_tracking | مكسور | INSERT يكتب عمود `companyId` غير الموجود بالجدول — FLT-010 |
| `/fleet/maintenance` | GET | fleet.ts:1328 | parseScopeFilters | maintenance.tsx, fleet.tsx, trip-detail.tsx | fleet_maintenance | شغّال | — |
| `/fleet/maintenance/:id` | GET | fleet.ts:1356 | parseId | maintenance-detail.tsx | fleet_maintenance | شغّال | — |
| `/fleet/maintenance` | POST | fleet.ts:1378 | createMaintenanceSchema | maintenance-create.tsx, alerts-create.tsx | fleet_maintenance | شغّال | تحديث حالة المركبة `maintenance` بلا audit؛ يُسقِط `attachments` |
| `/fleet/maintenance/:id/complete` | POST | fleet.ts:1484 | completeMaintenanceSchema | (لا UI) | fleet_maintenance | شغّال backend | لا تستدعيه أي واجهة |
| `/fleet/maintenance/:id/cancel` | POST | fleet.ts:1570 | cancelMaintenanceSchema | (لا UI) | fleet_maintenance | شغّال backend | لا تستدعيه أي واجهة — FLT-011 |
| `/fleet/alerts` | GET | fleet.ts:1618 | — | alerts.tsx | (محسوب لحظياً) | شغّال | تنبيهات بلا تخزين؛ استعلام GPS يقرأ `g."companyId"` غير الموجود — FLT-010 |
| `/fleet/fuel-logs` | GET | fleet.ts:1752 | parseScopeFilters | fuel.tsx, fleet.tsx, trip-detail.tsx | fleet_fuel_logs | شغّال | المرشّح `tripId` من trip-detail لا يدعمه الخادم — يُتجاهَل |
| `/fleet/fuel-logs/:id` | GET | fleet.ts:1774 | parseId | fuel-detail.tsx | fleet_fuel_logs | شغّال | — |
| `/fleet/fuel-logs` | POST | fleet.ts:1794 | createFuelLogSchema | fuel-create.tsx | fleet_fuel_logs | شغّال | — |
| `/fleet/insurance` | GET | fleet.ts:1892 | parseScopeFilters | insurance.tsx | fleet_insurance | شغّال | — |
| `/fleet/insurance/:id` | GET | fleet.ts:1909 | parseId | insurance-detail.tsx | fleet_insurance | شغّال | — |
| `/fleet/insurance` | POST | fleet.ts:1925 | createInsuranceSchema | insurance-create.tsx | fleet_insurance | شغّال | يُسقِط `attachments` |
| `/fleet/trips/:id` | PATCH | fleet.ts:1987 | updateTripSchema | trip-detail.tsx | fleet_trips | شغّال | يرفض `completed`/`cancelled` بـ409 — مصدر كسر trip-detail |
| `/fleet/trips/:id` | DELETE | fleet.ts:2097 | parseId | (لا UI) | fleet_trips | شغّال backend | لا واجهة تستدعيه |
| `/fleet/maintenance/:id` | PATCH | fleet.ts:2149 | updateMaintenanceSchema | maintenance-detail.tsx | fleet_maintenance | شغّال | لا يقبل `odometer`/`notes` المرسَلين من الواجهة |
| `/fleet/maintenance/:id` | DELETE | fleet.ts:2250 | parseId | maintenance-detail.tsx | fleet_maintenance | شغّال | — |
| `/fleet/fuel-logs/:id` | PATCH | fleet.ts:2294 | updateFuelLogSchema | fuel-detail.tsx | fleet_fuel_logs | شغّال | — |
| `/fleet/fuel-logs/:id` | DELETE | fleet.ts:2370 | parseId | fuel-detail.tsx | fleet_fuel_logs | شغّال | — |
| `/fleet/insurance/:id` | PATCH | fleet.ts:2402 | updateInsuranceSchema | insurance-detail.tsx | fleet_insurance | شغّال | — |
| `/fleet/insurance/:id` | DELETE | fleet.ts:2481 | parseId | insurance-detail.tsx | fleet_insurance | شغّال | — |
| `/fleet/stats` | GET | fleet.ts:2510 | — | fleet.tsx, reports.tsx | fleet_* | شغّال | 7 استعلامات COUNT بلا فهارس مضمونة — تحجيم |
| `/fleet/preventive-plans` | GET | fleet.ts:2539 | query.vehicleId | preventive-plans.tsx | fleet_preventive_plans | شغّال | — |
| `/fleet/preventive-plans` | POST | fleet.ts:2558 | createPreventivePlanSchema | preventive-plans.tsx | fleet_preventive_plans | شغّال | — |
| `/fleet/preventive-plans/:id` | PATCH | fleet.ts:2632 | updatePreventivePlanSchema | (لا UI) | fleet_preventive_plans | شغّال backend | لا واجهة تستدعيه — FLT-007 |
| `/fleet/traffic-violations` | GET | fleet.ts:2710 | query | traffic-violations.tsx | fleet_traffic_violations | شغّال | — |
| `/fleet/traffic-violations/:id` | GET | fleet.ts:2731 | parseId | traffic-violation-detail.tsx | fleet_traffic_violations | شغّال | — |
| `/fleet/traffic-violations` | POST | fleet.ts:2748 | createTrafficViolationSchema | traffic-violations.tsx | fleet_traffic_violations | شغّال | — |
| `/fleet/traffic-violations/:id/pay` | PATCH | fleet.ts:2887 | — | traffic-violations.tsx | fleet_traffic_violations | شغّال | لا يحدّث عمود `paidBy` رغم وجوده |
| `/fleet/vehicles/:id/tco` | GET | fleet.ts:2958 | parseId | tco.tsx, vehicle-detail.tsx | fleet_vehicles + تجميعات | شغّال جزئياً | يقرأ `purchasePrice`/`purchaseDate` غير الموجودين — FLT-003 |

عدد الـ endpoints المغطّاة: 46.

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| trip-detail.tsx:111,129 | `PATCH /fleet/trips/:id` بـ `{status:"completed"}` أو `{status:"cancelled"}` | `updateTripSchema` يقبل `status` لكن المعالج (fleet.ts:2019) يرفض `completed`/`cancelled` صراحةً بـ409 | الزرّان يفشلان دائماً؛ القيمة المسموحة عبر PATCH هي حالات الانتقال غير النهائية فقط | استبدال النداء بـ `POST /fleet/trips/:id/complete` و`POST /fleet/trips/:id/cancel` (مع `reason` للإلغاء) |
| trips-create.tsx:54,53 | `status` (scheduled/in_progress/...) و`endTime` | `createTripSchema` يقبلهما لكن `INSERT` (fleet.ts:1072) يُثبّت `'in_progress'` ولا يقرأ `endTime` | المستخدم يختار «مجدولة» فتُنشأ «جارية»؛ `endTime` يُفقد | إمّا احترام `status` المرسَل في الـ INSERT، أو إزالة الحقل من النموذج وتثبيت العنوان «بدء رحلة فوري» |
| maintenance-detail.tsx:126-128 | حقول تعديل `odometer` و`notes` | `updateMaintenanceSchema` يقبل `description/status/cost` فقط؛ والعمود الفعلي `mileageAtService` ولا يوجد عمود `notes` في `fleet_maintenance` | تعديل العداد/الملاحظات يُسقَط بصمت (Zod يُجرّد المفاتيح المجهولة) | تسمية الحقل `mileageAtService` وإضافته للـ schema والـ SET؛ إزالة حقل `notes` أو إضافة عمود |
| vehicles-create.tsx:51 | `status` للمركبة الجديدة | `createVehicleSchema` يقبله لكن `INSERT` (fleet.ts:336) يُثبّت `'available'` | اختيار حالة ابتدائية بلا أثر | إزالة حقل الحالة من نموذج الإنشاء (المركبة الجديدة دائماً متاحة) |
| maintenance-create.tsx / insurance-create.tsx | `attachments` (مصفوفة ملفات) | لا تتضمنها أي schema ولا يوجد عمود/معالجة | المرفقات تُرفع للواجهة ثم تُهمل في الخادم | حذف `FileDropZone` أو إضافة مسار تخزين مرفقات حقيقي |
| trip-detail.tsx:45 | `GET /fleet/fuel-logs?tripId=${id}` | معالج `/fuel-logs` (fleet.ts:1752) يدعم `vehicleId` فقط ولا يقرأ `tripId` | المرشّح يُتجاهَل؛ الترشيح يقع في الواجهة فقط | إمّا دعم `tripId` في الخادم أو حذف المعامل وتوضيح أنه فلتر واجهة |
| tco.tsx / vehicle-detail.tsx | يعرض قيمة الشراء والإهلاك من `/tco` | `fleet_vehicles` لا يحوي `purchasePrice`/`purchaseDate` | قيم الشراء والإهلاك صفر دائماً وتكلفة TCO ناقصة | إضافة عمودَي `purchasePrice`/`purchaseDate` وربطهما بنموذج إنشاء المركبة |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| ربط السائق بالموظف وقراءة `employee_assignments` | fleet.ts:407, 446 | fleet.ts:1092, 2832 (وقراءة `employees` في 1396) | duplicate — نفس استعلام HR-assignment مكرّر بأربع صيغ، وقراءات مباشرة لجدول `employees` المملوك لمسار HR | استخراج دالة واحدة `resolveDriverAssignment(driverId)` في `lib`، أو استدعاء HR Engine بدل القراءة المباشرة |
| تغيير حالة المركبة/السائق ضمن دورة حياة الرحلة/الصيانة | applyTransition على `fleet_trips`/`fleet_maintenance` (fleet.ts:1163, 1504) | `UPDATE fleet_vehicles/fleet_drivers SET status=` المباشر داخل onApply/withTransaction (fleet.ts:1077, 1081, 1173, 1177, 1256, 1262, 1413, 1514, 1601, 2115, 2121, 2267) | conflict — حالة المركبة/السائق تتغيّر بمسارين: محرّك دورة الحياة للكيان الأب، وUPDATE خام للكيان التابع بلا audit/event | تمرير تحديث المركبة/السائق عبر `applyTransition` أيضاً، أو على الأقل تسجيل audit للتغيير |
| سجلّ المخالفات المرورية | جدول `fleet_traffic_violations` (المستخدَم فعلياً) | جدول `fleet_violations` (schema_pre.sql:6794، حالات `unpaid/paid/disputed`) | duplicate — جدولان لنفس المفهوم؛ `fleet_violations` لا يُشار إليه من `fleet.ts` إطلاقاً | حذف جدول `fleet_violations` اليتيم أو توثيق سبب بقائه |
| إنشاء «التنبيه» مقابل «الصيانة» | صفحة `alerts-create.tsx` بعنوان «إضافة تنبيه» | تنشئ سجلاً عبر `POST /fleet/maintenance` | conflict — وظيفتان مختلفتان (تنبيه/صيانة) تُقدَّمان كواجهة واحدة، فيظهر سجل الصيانة لاحقاً في تبويبَي «الصيانة» و«التنبيهات» | فصل التنبيهات في كيان مستقل، أو إعادة تسمية الصفحة إلى «جدولة صيانة» |

---

## يحتاج Runtime Verification

- endpoints التصدير `/export/excel/fleet` و`/export/pdf/fleet-trips` المستدعاة من `reports.tsx` — معرَّفة خارج `fleet.ts` ولم تُفحص ضمن هذا المسار.
- هل تطبَّق فعلياً migration رقم 179 (`add_deletedat_to_legal_sessions_and_fleet_preventive`) على بيئة الإنتاج؟ استعلامات `fleet.ts` تفترض وجود `fleet_preventive_plans.deletedAt`.
- سلوك `fleetEngine.postVehicleAssetGL` / `requestFixedAssetRegistration` (fleet.ts:358-377): الكتلة لا تُنفَّذ مطلقاً لأن `purchasePrice` غير وارد في `createVehicleSchema` — يلزم تأكيد أنه لا مسار خفي يمرّره.
- محرّك `applyTransition`: التحقق من أن رفض الانتقالات النهائية عبر PATCH يَصدُر فعلاً كرمز 409 الذي تلتقطه واجهة trip-detail (تعالج الخطأ كرسالة عامة فقط).
- استعلام `GET /fleet/alerts`: تأكيد فشل/نجاح SQL على `fleet_gps_tracking` بعد التحقق من العمود `companyId`.

---

## العيوب المُرقّمة (Defect Register)

- **FLT-001** · dead · blocking · narrow · زرّا «إكمال» و«إلغاء» في صفحة تفاصيل الرحلة يستدعيان `PATCH /fleet/trips/:id` بحالة نهائية يرفضها الخادم بـ409، فلا يمكن إقفال أي رحلة من الواجهة. · الدليل: `pages/fleet/trip-detail.tsx:111,129` مقابل `fleet.ts:2019-2029` · التبعية: endpoints `complete`/`cancel` السليمة موجودة بلا واجهة.
- **FLT-002** · mismatch · impairing · narrow · صفحة تفاصيل الصيانة تُرسِل حقلَي تعديل `odometer` و`notes` لا يقبلهما `updateMaintenanceSchema` ولا يوجد لهما عمود (`mileageAtService` هو الصحيح ولا عمود `notes`)؛ التعديل يُسقَط بصمت. · الدليل: `pages/details/maintenance-detail.tsx:126-128` مقابل `fleet.ts:166-170` و`schema_pre.sql:6559` · التبعية: لا.
- **FLT-003** · mismatch · impairing · structural · تحليل TCO وبطاقة المركبة يعتمدان على `purchasePrice`/`purchaseDate` غير الموجودين في `fleet_vehicles`، فتظهر قيمة الشراء والإهلاك صفراً وتكون التكلفة الكلية ناقصة. · الدليل: `fleet.ts:2996-3001` مقابل `schema_pre.sql:6736-6767` · التبعية: مرتبط بكتلة قيد الأصل المعطّلة (fleet.ts:354).
- **FLT-004** · mismatch · impairing · narrow · `POST /fleet/trips` يتجاهل حقلَي `status` و`endTime` المرسَلين من نموذج الإنشاء ويُثبّت `'in_progress'` دائماً؛ المستخدم يختار «مجدولة» فتُنشأ رحلة جارية. · الدليل: `pages/create/fleet/trips-create.tsx:52-54` مقابل `fleet.ts:1072` · التبعية: لا.
- **FLT-005** · mismatch · cosmetic · narrow · حقل `status` في نموذج إنشاء المركبة يُرسَل لكن `INSERT` يُثبّت `'available'`؛ خيار بلا أثر. · الدليل: `pages/create/fleet/vehicles-create.tsx:51` مقابل `fleet.ts:336` · التبعية: لا.
- **FLT-006** · conflict · impairing · structural · «التنبيهات» (`/fleet/alerts`) محسوبة لحظياً بلا جدول تخزين، وصفحة «إضافة تنبيه» تنشئ سجل صيانة عبر `POST /fleet/maintenance`؛ نفس الإجراء يظهر في تبويبَي الصيانة والتنبيهات بقواعد متضاربة. · الدليل: `pages/create/fleet/alerts-create.tsx:20` و`fleet.ts:1618-1750` · التبعية: لا.
- **FLT-007** · dead · cosmetic · narrow · endpoint `PATCH /fleet/preventive-plans/:id` كامل الوظيفة (إعادة احتساب المواعيد، خصم مخزون) لكن لا واجهة تعرض زرّ تعديل لخطة وقائية. · الدليل: `fleet.ts:2632` مقابل `pages/fleet/preventive-plans.tsx` (لا عمود إجراءات) · التبعية: لا.
- **FLT-008** · dead · impairing · narrow · صفحة تفاصيل المخالفة المرورية للعرض فقط؛ لا تعديل ولا حذف ولا زر سداد، ولا يوجد endpoint حذف للمخالفة أصلاً. · الدليل: `pages/details/traffic-violation-detail.tsx` و`fleet.ts` (لا `DELETE /traffic-violations/:id`) · التبعية: لا.
- **FLT-009** · dead · cosmetic · narrow · نموذجا إنشاء الصيانة والتأمين يرفعان `attachments` عبر `FileDropZone` لكن لا schema تقبلها ولا مسار تخزين؛ الملفات تُهمل. · الدليل: `pages/create/fleet/maintenance-create.tsx:55`، `insurance-create.tsx:56` مقابل `fleet.ts:56-91` · التبعية: لا.
- **FLT-010** · mismatch · blocking · narrow · `POST /fleet/trips/:id/waypoints` يُدرِج عمود `companyId` في `fleet_gps_tracking` (`fleet.ts:1307`) واستعلام `/alerts` يقرأ `g."companyId"` (`fleet.ts:1654`) رغم أن الجدول لا يحوي العمود — خطأ SQL وقت التنفيذ. · الدليل: `fleet.ts:1307,1654` مقابل `schema_pre.sql:6480-6489` · التبعية: يكسر تتبّع GPS وقد يكسر صفحة التنبيهات.
- **FLT-011** · dead · cosmetic · narrow · endpoints دورة حياة الرحلة والصيانة (`complete`/`cancel` لكليهما، و`DELETE /trips/:id`) سليمة لكن لا واجهة تستدعيها (trip-detail يستخدم PATCH خاطئ، ولا أزرار صيانة). · الدليل: `fleet.ts:1132,1226,1484,1570,2097` · التبعية: يرتبط بـ FLT-001.
- **FLT-012** · scaling · impairing · structural · تحديثات حالة المركبة/السائق ضمن إنشاء/إكمال/إلغاء/حذف الرحلة والصيانة تُجرى عبر `UPDATE` خام بلا audit ولا event (12 موضعاً)، بينما الكيان الأب يمرّ بمحرّك دورة الحياة؛ مع تعدّد الفروع والشركات يصعب تتبّع من غيّر حالة مركبة ولماذا. · الدليل: `fleet.ts:1077,1081,1173,1177,1256,1262,1413,1514,1601,2115,2121,2267` · التبعية: F4 في `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md`.
- **FLT-013** · scaling · cosmetic · structural · صفحة تفاصيل السائق تجلب كامل `/fleet/vehicles` (حتى 500 صف) لتحديد المركبة المسندة عبر فلترة في الواجهة، بدل استعلام مُوجَّه؛ ينمو الحمل خطّياً مع عدد المركبات. · الدليل: `pages/details/driver-detail.tsx:78-81` · التبعية: لا.

---

## خلاف مع تقارير سابقة

1. **خلاف مع `docs/audit/UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` (البند F4)**: التقرير السابق حصر «دورة الحياة بلا audit» في ثلاثة أسطر فقط (`fleet.ts:1077, 1173, 1413`). التحقّق المباشر يُظهر أن المشكلة أوسع: تحديثات الحالة الخام بلا audit تقع في **12 موضعاً** على الأقل تشمل تحرير السائق (`1081, 1177, 1262, 2121`)، ومسارَي الإلغاء (`1256, 1601`)، وإكمال الصيانة (`1514`)، وحذف الرحلة/الصيانة (`2115, 2267`). نوّسعها رسمياً في FLT-012.

2. **خلاف مع `docs/verification/fleet.md` (Test 11)**: التحقّق السابق وسم رفض الانتقالات النهائية عبر PATCH كإصلاح ناجح («تمّ إغلاق الثغرة»). لكنه أغفل الأثر الجانبي: واجهة `trip-detail.tsx` لا تزال تستدعي `PATCH` بحالة `completed`/`cancelled`، فالنتيجة العملية أن زرّي «إكمال» و«إلغاء» **مكسوران تماماً** في الإنتاج (FLT-001). الإصلاح الخلفي صحيح لكنه كشف عيباً أمامياً لم يُرصَد.

3. **خلاف مع التصنيف العام «المسار شغّال»**: أيّ تقرير يضع علامة ✅ على مسار الأسطول دون تحفّظ يتعارض مع FLT-010 — وجود خطأ SQL وقت تشغيل بسبب عمود `companyId` المفقود في `fleet_gps_tracking` يجعل تتبّع المواقع وصفحة التنبيهات عرضةً للفشل، وهو ما لا يُكتشف إلا بمطابقة الكود مع بنية الجدول.
