# جرد المسار — العقارات (Properties)

جرد ثابت (static inventory) لمسار إدارة الأملاك في نظام غيث: يغطّي 28 صفحة/مسار واجهة، و55 نقطة API في `properties.ts`، ومحرّك `lifecycleEngine`، ومخطّط قاعدة البيانات. كل بند موسوم بدليل `file:line`. الفحص قراءة فقط — لم يُشغّل النظام.

المرجع الخلفي: `artifacts/api-server/src/routes/properties.ts` (3972 سطرًا) — مُركّب على `/properties` بحارسي `requireModule(property)` + `requireGuards(financial)`.
المرجع الأمامي: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx` (28 مسارًا).

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| PG-01 | `/properties` | `pages/properties.tsx` | شغّال | `GET /properties/stats`، `GET /properties/units` | — |
| PG-02 | `/properties/dashboard` | `pages/properties-dashboard.tsx` | شغّال | `GET /properties/stats` | — |
| PG-03 | `/properties/buildings` | `pages/properties-buildings.tsx` | شغّال | `GET /properties/buildings` | — |
| PG-04 | `/properties/buildings/create` | `pages/create/properties/buildings-create.tsx` | شغّال | `GET /properties/owners`، `POST /properties/buildings` | — |
| PG-05 | `/properties/buildings/:id` | `pages/details/building-detail.tsx` | مكسور | `GET /properties/buildings/:id`، `GET /properties/units?buildingId=`، `PATCH/DELETE /properties/buildings/:id` | حقل `floors` في نموذج التعديل غير موجود في الجدول (PROP-002) |
| PG-05b | `/properties/buildings/:id/edit` | (لا يوجد مكوّن) | ناقص | — | رابط واجهة لمسار غير مُسجّل (PROP-009) |
| PG-06 | `/properties/tenants` | `pages/properties-tenants.tsx` | شغّال | `GET /properties/tenants/list` | — |
| PG-07 | `/properties/tenants/create` | `pages/create/properties/tenants-create.tsx` | شغّال | `POST /properties/tenants` | — |
| PG-08 | `/properties/tenants/:id` | `pages/details/tenant-detail.tsx` | شغّال | `GET /properties/tenants/:id`، `GET /properties/tenants/:id/letters`، `PATCH/DELETE /properties/tenants/:id` | — |
| PG-09 | `/properties/owners` | `pages/properties-owners.tsx` | شغّال | `GET /properties/owners`، `DELETE /properties/owners/:id` | — |
| PG-10 | `/properties/owners/create` | `pages/create/properties/owners-create.tsx` | شغّال | `POST /properties/owners` | — |
| PG-11 | `/properties/owners/:id/edit` | `pages/create/properties/owners-edit.tsx` | شغّال | `GET /properties/owners/:id`، `PATCH /properties/owners/:id` | — |
| PG-12 | `/properties/owners/:id` | `pages/details/owner-detail.tsx` | شغّال | `GET /properties/owners/:id`، `PATCH/DELETE /properties/owners/:id` | — |
| PG-13 | `/properties/contracts` | `pages/properties-contracts.tsx` | شغّال | `GET /properties/contracts`، `GET /properties/contracts/:id/schedule` | — |
| PG-14 | `/properties/contracts/create` | `pages/create/properties/contracts-create.tsx` | شغّال | `GET /properties/units`، `GET /properties/tenants`، `GET /properties/owners`، `POST /properties/contracts/impact-preview`، `POST /properties/contracts` | — |
| PG-15 | `/properties/contracts/:id` | `pages/properties/contract-detail.tsx` | مكسور | `GET /properties/contracts/:id`، `.../schedule`، `GET /properties/maintenance?contractId=`، `GET /properties/inspections?contractId=`، `POST /properties/contracts`، `PATCH /properties/contracts/:id` | زر «إنهاء العقد» يُرسل `PATCH status=terminated` المرفوض من الخادم (PROP-001) |
| PG-16 | `/properties/contracts/:contractId/pay/:installmentId` | `pages/create/properties/payment-record.tsx` | شغّال | `GET /properties/contracts/:id`، `POST /properties/contracts/:id/schedule/:installmentId/pay` | — |
| PG-17 | `/properties/payments` | `pages/properties-payments.tsx` | شغّال | `GET /properties/payments` | زر «تسجيل دفعة» يُوجّه إلى `/payments/new/pay` (PROP-008) |
| PG-18 | `/properties/payments/:paymentId/pay` | `pages/create/properties/payment-register.tsx` | مكسور | `GET /properties/payments`، `POST /properties/payments/:id/pay` | الـ endpoint الخلفي يُخفق بسبب عمود مفقود (PROP-003) |
| PG-19 | `/properties/payments/:id` | `pages/details/property-payment-detail.tsx` | شغّال جزئيًا | `GET /properties/payments/:id` | زر «تعديل» يُوجّه إلى `/payments/:id/edit` غير المُسجّل (PROP-010) |
| PG-20 | `/properties/maintenance` | `pages/properties-maintenance.tsx` | شغّال | `GET /properties/maintenance-requests`، `PATCH .../approve` | — |
| PG-21 | `/properties/maintenance/create` | `pages/create/properties/maintenance-create.tsx` | شغّال | `GET /properties/units`، `POST /properties/maintenance-requests` | — |
| PG-22 | `/properties/maintenance/:id` | `pages/details/property-maintenance-detail.tsx` | شغّال جزئيًا | `GET /properties/maintenance/:id` | زر «تعديل» يكتفي بالتوجيه إلى قائمة الصيانة دون أي إجراء (PROP-011) |
| PG-23 | `/properties/create` | `pages/create/properties-create.tsx` | شغّال جزئيًا | `GET /properties/buildings`، `GET /properties/owners`، `POST /properties/units` | يُرسل `notes` لكن `createUnitSchema` يُسقطه (PROP-007) |
| PG-24 | `/properties/:id` | `pages/details/unit-detail.tsx` | شغّال | `GET /properties/units/:id` | — |
| PG-25 | `/properties/:id/status` | `pages/create/properties/unit-status-change.tsx` | شغّال | `GET /properties/units/:id`، `GET /properties/units/:id/impact-preview`، `PATCH /properties/units/:id` | — |
| PG-26 | `/properties/inspections` | `pages/properties/inspections.tsx` | شغّال | `GET /properties/inspections`، `GET /properties/units`، `POST /properties/inspections`، `PATCH /properties/inspections/:id` | — |
| PG-27 | `/properties/deposits` | `pages/properties/deposits.tsx` | شغّال | `GET /properties/deposits`، `GET /properties/contracts?status=active`، `POST /properties/deposits`، `PATCH /properties/deposits/:id/refund` | — |
| PG-28 | `/properties/occupancy-report` | `pages/properties/occupancy-report.tsx` | شغّال | `GET /properties/occupancy-report` | — |
| PG-29 | `/guide/properties` و `/properties/guide` | `pages/properties-guide.tsx` | شغّال | (محتوى ثابت) | — |

ملاحظة: `contract-detail.tsx` يستدعي `GET /properties/inspections?contractId=` و`GET /properties/maintenance?contractId=`، لكن أيًّا من الـ handler لا يدعم فلتر `contractId` (الفحص يدعم `unitId`/`status` فقط، والصيانة `status` فقط) — الفلتر يُتجاهَل بصمت (تفصيل في الجدول 4).

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| contract-detail | إنهاء العقد | إنهاء العقد وتحرير الوحدة | `PATCH /properties/contracts/:id` body `status:"terminated"` | مكسور | conflict |
| contract-detail | تجديد العقد | تمديد العقد للسنة القادمة | `POST /properties/contracts` (إنشاء عقد جديد) | شغّال جزئيًا | duplicate |
| properties-payments | تسجيل دفعة (الترويسة) | فتح شاشة تسجيل دفعة جديدة | `Link → /properties/payments/new/pay` | مكسور | dead |
| properties-payments | تسجيل (لكل صف) | تسجيل دفعة إيجار | `POST /properties/payments/:id/pay` | مكسور | mismatch |
| payment-register | تأكيد التسجيل | حفظ سداد القسط | `POST /properties/payments/:id/pay` | مكسور | mismatch |
| payment-record | تأكيد التسجيل | سداد قسط من جدول العقد | `POST /properties/contracts/:id/schedule/:installmentId/pay` | شغّال | — |
| property-payment-detail | تعديل | فتح شاشة تعديل الدفعة | `setLocation /properties/payments/:id/edit` | مكسور | dead |
| property-maintenance-detail | تعديل | تعديل طلب الصيانة | `setLocation /properties/maintenance` (قائمة فقط) | مكسور | dead |
| building-detail | تعديل (inline) | تحديث المبنى | `PATCH /properties/buildings/:id` مع `floors` | مكسور | mismatch |
| building-detail | حذف | حذف المبنى | `DELETE /properties/buildings/:id` | شغّال | — |
| properties-maintenance | اعتماد/رفض/إرجاع | تغيير حالة طلب الصيانة | `PATCH /properties/maintenance-requests/:id/approve` | شغّال | — |
| unit-status-change | تطبيق التغيير | نقل حالة الوحدة | `PATCH /properties/units/:id` body `status` | شغّال | — |
| properties-create | حفظ الوحدة | إنشاء وحدة عقارية | `POST /properties/units` | شغّال جزئيًا | mismatch |
| contracts-create | معاينة الأثر | عرض أثر إنشاء العقد | `POST /properties/contracts/impact-preview` | شغّال | — |
| contracts-create | إنشاء العقد | إنشاء عقد إيجار + جدول أقساط | `POST /properties/contracts` | شغّال | — |
| deposits | إرجاع الوديعة | استرداد الوديعة وقيد محاسبي | `PATCH /properties/deposits/:id/refund` | شغّال | — |
| inspections | إنشاء/تحديث الفحص | جدولة وتحديث فحص الوحدة | `POST /properties/inspections`، `PATCH /properties/inspections/:id` | شغّال | — |
| owners-create | حفظ المالك | إنشاء مالك | `POST /properties/owners` | شغّال | — |
| owners-edit / owner-detail | تعديل | تحديث المالك | `PATCH /properties/owners/:id` | شغّال | — |
| tenant-detail | تعديل/حذف | تحديث/حذف المستأجر | `PATCH/DELETE /properties/tenants/:id` | شغّال | — |

---

## جدول 3 — APIs (55 endpoint)

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/units` | GET | properties.ts:503 | query (status/search/buildingId/page/limit) | properties.tsx, contracts-create, maintenance-create, properties-create, inspections | property_units | شغّال | — |
| `/units` | POST | properties.ts:536 | createUnitSchema | properties-create.tsx | property_units | شغّال جزئيًا | يُقبل `notes` ولا يُخزَّن (PROP-007) |
| `/units/:id` | GET | properties.ts:616 | parseId | unit-detail, unit-status-change | property_units | شغّال | — |
| `/units/:id/impact-preview` | GET | properties.ts:649 | query status | unit-status-change | property_units | شغّال | — |
| `/units/:id` | PATCH | properties.ts:662 | updateUnitSchema | unit-status-change | property_units | شغّال جزئيًا | `name`/`notes` في الـ schema بلا أعمدة (PROP-006) |
| `/units/:id` | DELETE | properties.ts:800 | parseId | (لا واجهة) | property_units | شغّال | dead — لا زر حذف وحدة في الواجهة (PROP-012) |
| `/contracts/impact-preview` | POST | properties.ts:856 | contractImpactPreviewSchema | contracts-create | rental_contracts | شغّال | — |
| `/contracts` | GET | properties.ts:986 | query status | properties-contracts, deposits, contract-detail | rental_contracts | شغّال | — |
| `/contracts/:id` | GET | properties.ts:1002 | parseId | contract-detail, payment-record | rental_contracts | شغّال | — |
| `/contracts` | POST | properties.ts:1019 | createContractSchema | contracts-create, contract-detail (تجديد) | rental_contracts | شغّال | — |
| `/contracts/:id` | PATCH | properties.ts:1231 | updateContractSchema | contract-detail | rental_contracts | شغّال | يرفض `terminated` عمدًا — الواجهة تعتمد عليه (PROP-001) |
| `/contracts/:id` | DELETE | properties.ts:1380 | parseId | (لا واجهة) | rental_contracts | شغّال | dead — لا زر حذف عقد (PROP-013) |
| `/contracts/:id/renew` | POST | properties.ts:1425 | renewContractSchema | (لا واجهة) | rental_contracts | شغّال | dead — لا زر يستدعي `/renew` (PROP-005) |
| `/contracts/:id/terminate` | POST | properties.ts:1546 | terminateContractSchema | (لا واجهة) | rental_contracts | شغّال | dead — لا زر يستدعي `/terminate` (PROP-001) |
| `/tenants/list` | GET | properties.ts:1638 | query search | properties-tenants | tenants + rental_contracts | شغّال | — |
| `/tenants/:id` | PATCH | properties.ts:1710 | updateTenantSchema | tenant-detail | tenants | شغّال | — |
| `/tenants/:id` | DELETE | properties.ts:1802 | parseId | tenant-detail | tenants | شغّال | — |
| `/payments` | GET | properties.ts:1849 | query status/contractId | properties-payments, payment-register | rent_payments | شغّال | — |
| `/payments/:id` | GET | properties.ts:1865 | parseId | property-payment-detail | rent_payments | شغّال | — |
| `/payments/:id/pay` | POST | properties.ts:1882 | payRentPaymentSchema | payment-register, properties-payments | rent_payments | مكسور | `UPDATE … WHERE "deletedAt" IS NULL` وعمود مفقود (PROP-003) |
| `/late-rent/escalate` | POST | properties.ts:1979 | (لا body) | (لا واجهة — cron فقط) | rent_payments, late_rent_actions | مكسور | عمود `companyId`/`deletedAt` مفقود + نوع `phase` خاطئ (PROP-003، PROP-004) |
| `/maintenance-requests` | GET | properties.ts:2117 | query status | properties-maintenance | maintenance_requests | شغّال | — |
| `/maintenance/:id` | GET | properties.ts:2132 | parseId | property-maintenance-detail | maintenance_requests | شغّال | — |
| `/maintenance-requests` | POST | properties.ts:2151 | createMaintenanceRequestSchema | maintenance-create | maintenance_requests | شغّال | — |
| `/maintenance-requests/:id/approve` | PATCH | properties.ts:2325 | approveMaintenanceSchema | properties-maintenance | maintenance_requests | شغّال جزئيًا | يقرأ `mr.createdBy`/`mr.title` غير الموجودَين (PROP-014) |
| `/maintenance-requests/:id/complete` | POST | properties.ts:2392 | completeMaintenanceSchema | (لا واجهة) | maintenance_requests | شغّال | dead — لا زر «إكمال» في الواجهة (PROP-015) |
| `/technicians` | GET | properties.ts:2564 | (لا body) | (لا واجهة مباشرة) | technicians | شغّال | dead — لا صفحة فنّيين |
| `/tenants` | GET | properties.ts:2572 | query search | contracts-create | tenants | شغّال | — |
| `/tenants` | POST | properties.ts:2588 | createTenantSchema | tenants-create | tenants | شغّال | — |
| `/tenants/:id` | GET | properties.ts:2635 | parseId/name | tenant-detail | tenants + rental_contracts | شغّال | — |
| `/buildings` | GET | properties.ts:2703 | query search | properties-buildings, buildings-create, properties-create, building-detail | property_buildings | شغّال | — |
| `/buildings/:id` | GET | properties.ts:2731 | parseId | building-detail | property_buildings | شغّال | — |
| `/buildings` | POST | properties.ts:2751 | createBuildingSchema | buildings-create | property_buildings | شغّال | — |
| `/buildings/:id` | PATCH | properties.ts:2829 | updateBuildingSchema | building-detail | property_buildings | شغّال جزئيًا | `floors`/`description` في الـ schema بلا أعمدة (PROP-002) |
| `/buildings/:id` | DELETE | properties.ts:2909 | parseId | building-detail | property_buildings | شغّال | — |
| `/maintenance` | GET | properties.ts:2954 | query status | contract-detail | maintenance_requests | شغّال جزئيًا | يتجاهل فلتر `contractId` المرسَل (PROP-016) |
| `/maintenance` | POST | properties.ts:2969 | createMaintenanceSimpleSchema | (لا واجهة) | maintenance_requests | شغّال | duplicate لـ `POST /maintenance-requests` (PROP-017) |
| `/stats` | GET | properties.ts:3013 | (لا body) | properties.tsx, properties-dashboard | عدة جداول | شغّال | — |
| `/maintenance-requests/:id` | PATCH | properties.ts:3091 | updateMaintenanceRequestSchema | (لا واجهة) | maintenance_requests | شغّال | dead جزئيًا — لا واجهة تعدّل الصيانة (PROP-011) |
| `/operations-dashboard` | GET | properties.ts:3230 | (لا body) | (لا واجهة) | عدة جداول | شغّال | dead — لا صفحة تستهلكه |
| `/owners` | GET | properties.ts:3287 | query search | properties-owners, buildings-create, contracts-create, properties-create | property_owners | شغّال | — |
| `/owners/:id` | GET | properties.ts:3306 | parseId | owner-detail, owners-edit | property_owners | شغّال | — |
| `/owners` | POST | properties.ts:3321 | createOwnerSchema | owners-create | property_owners | شغّال | — |
| `/owners/:id` | PATCH | properties.ts:3380 | updateOwnerSchema | owners-edit, owner-detail | property_owners | شغّال جزئيًا | `createAuditLog` بلا `before/after` (PROP-018) |
| `/owners/:id` | DELETE | properties.ts:3432 | parseId | properties-owners, owner-detail | property_owners | شغّال | — |
| `/contracts/:id/schedule` | GET | properties.ts:3487 | parseId | properties-contracts, contract-detail | contract_payment_schedule | شغّال | — |
| `/contracts/:id/schedule/:installmentId/pay` | POST | properties.ts:3501 | payInstallmentSchema | payment-record | contract_payment_schedule | شغّال جزئيًا | UPDATE حالة القسط بلا `applyTransition` (PROP-019) |
| `/inspections` | GET | properties.ts:3567 | query unitId/status | inspections, contract-detail | property_inspections | شغّال جزئيًا | يتجاهل فلتر `contractId` المرسَل (PROP-016) |
| `/inspections` | POST | properties.ts:3588 | createInspectionSchema | inspections | property_inspections | شغّال | — |
| `/inspections/:id` | PATCH | properties.ts:3638 | updateInspectionSchema | inspections | property_inspections | شغّال | — |
| `/deposits` | GET | properties.ts:3738 | query status/contractId | deposits | property_security_deposits | شغّال | — |
| `/deposits` | POST | properties.ts:3760 | createDepositSchema | deposits | property_security_deposits | شغّال | — |
| `/deposits/:id/refund` | PATCH | properties.ts:3829 | refundDepositSchema | deposits | property_security_deposits | شغّال | — |
| `/occupancy-report` | GET | properties.ts:3902 | query buildingId | occupancy-report | property_units | شغّال | — |
| `/tenants/:id/letters` | GET | properties.ts:3952 | parseId | tenant-detail | correspondence | شغّال | — |

إجمالي 55 endpoint. RBAC: كل الـ handlers مغلّفة بـ `authorize({feature, action})` — تأكيد PROPERTIES_CERTIFICATION صحيح في بُعد RBAC.

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| contract-detail.tsx:140-148 (handleTerminate) | `PATCH /contracts/:id` body `{status:"terminated", terminationDate}` | `PATCH /contracts/:id` يرفض `terminated` صراحةً (properties.ts:1268) ويعيد 409 | الزر يُخفق دائمًا؛ كما أن `updateContractSchema` لا يضمّ `terminationDate` فيُسقَط | استبدال نداء الزر بـ `POST /properties/contracts/:id/terminate` مع body `{reason}` المطلوب من `terminateContractSchema` |
| properties-payments.tsx:64 + payment-register.tsx | رابط `/properties/payments/new/pay` ثم `POST /properties/payments/new/pay` | المسار `/payments/:paymentId/pay` يطابق `paymentId="new"` فيستدعي `parseId("new")` ويرمي ValidationError | لا توجد دفعة بمعرّف `new`؛ زر الترويسة لا يفتح أي شاشة عمل صحيحة | حذف زر «تسجيل دفعة» من ترويسة properties-payments، أو توجيهه لشاشة اختيار قسط من جدول العقد |
| payment-register.tsx:54 → properties.ts:1947-1956 | `POST /payments/:id/pay` | الـ handler ينفّذ `UPDATE rent_payments … WHERE id=$5 AND "deletedAt" IS NULL` | جدول `rent_payments` بلا عمود `deletedAt` — SQL error 42703، الـ endpoint يُخفق كليًّا | حذف شرط `AND "deletedAt" IS NULL` من UPDATE في السطر 1954 (الجدول بلا soft-delete) |
| properties.ts:2060، 2067 (late-rent escalate) | `SELECT/UPDATE rent_payments … WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL` | جدول `rent_payments` بلا عمودَي `companyId` و`deletedAt` | مرحلة `penalty_applied` (تأخّر ≥60 يومًا) تُخفق بـ SQL error 42703 | إزالة شرطَي `companyId`/`deletedAt`؛ التحقّق من ملكية الشركة عبر `JOIN rental_contracts c` كما في بقية الاستعلامات |
| properties.ts:2006، 2087 (late-rent escalate) | `INSERT/SELECT late_rent_actions(phase=...)` بقيمة نصّية مثل `'penalty_applied'` | عمود `late_rent_actions.phase` نوعه `integer` (DEFAULT 1) | SQL error 22P02 «invalid input syntax for integer» عند كل تصعيد | تغيير نوع العمود إلى `varchar`، أو تخزين المرحلة في عمود نصّي منفصل وإبقاء `phase` رقميًا |
| building-detail.tsx:55-60 (نموذج التعديل) | `PATCH /buildings/:id` مع `floors` | `trackedBldg` يضمّ `"floors"` لكن `property_buildings` بلا عمود `floors` | عند تعديل عدد الطوابق: `UPDATE … SET floors=$N` → SQL error 42703 | إزالة حقل `floors` من نموذج التعديل ومن `trackedBldg`، أو إضافة العمود في migration |
| properties.ts:2854 (updateBuilding) | الـ schema يقبل `description` و`floors` | `property_buildings` بلا عمودَي `floors`/`description` | أي PATCH يضمّ `description`/`floors` يُخفق SQL 42703 (POST آمن لأنه يربط `description→notes`) | توحيد PATCH على ربط `description→notes` وإسقاط `floors`، أو إضافة الأعمدة |
| properties-create.tsx:112 → POST /units | يُرسل `notes` في payload إنشاء الوحدة | `createUnitSchema` لا يضمّ `notes` (موجود في `updateUnitSchema` فقط) — zod يُسقطه بصمت | الملاحظة المُدخَلة لا تُحفظ أبدًا؛ كما أن `property_units` أصلًا بلا عمود `notes` | إزالة حقل «ملاحظات» من شاشة الإنشاء، أو إضافة العمود `notes` للجدول وضمّه للـ schema والـ INSERT |
| contract-detail.tsx:56-66 | `GET /maintenance?contractId=` و`GET /inspections?contractId=` | handler `/maintenance` يدعم `status` فقط، و`/inspections` يدعم `unitId`/`status` فقط | الفلتر يُتجاهَل؛ الصفحة تعرض كل صيانة/فحوص الشركة لا الخاصة بالعقد | إضافة دعم `contractId` في الـ handlers، أو الفلترة عبر `unitId` للعقد |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| إنهاء العقد | `PATCH /contracts/:id` (يرفض `terminated`) — contract-detail.tsx:140 يعتمده | `POST /contracts/:id/terminate` (properties.ts:1546) — المسار الصحيح بلا واجهة | conflict — مساران لتغيير حالة العقد بقواعد متضاربة؛ الواجهة تستخدم المرفوض | حصر إنهاء العقد في `/terminate` وربط زر الواجهة به |
| تجديد العقد | contract-detail.tsx:110 «handleRenew» يُنشئ عقدًا جديدًا عبر `POST /contracts` | `POST /contracts/:id/renew` (properties.ts:1425) — يجدّد ويُنشئ أقساطًا ويُعيد ضبط الالتزامات | duplicate — منطق تجديد بطريقتين؛ نسخة الواجهة لا تُلغي التزامات العقد القديم ولا تُعلّمه `renewed` | استبدال handleRenew بنداء `/contracts/:id/renew` |
| إنشاء طلب صيانة | `POST /maintenance-requests` (properties.ts:2151) — مع توزيع فنّي تلقائي وSLA | `POST /maintenance` (properties.ts:2969) — إدراج مبسّط بلا توزيع، بلا مهمة، بلا حدث `requested` | duplicate — نقطتا إنشاء على نفس جدول `maintenance_requests` بمنطقين | إلغاء `POST /maintenance` (بلا مستهلك واجهة) والاحتفاظ بـ `/maintenance-requests` |
| إكمال طلب الصيانة | `POST /maintenance-requests/:id/complete` (properties.ts:2392) — يمرّ عبر `applyTransition` | `PATCH /maintenance-requests/:id` (properties.ts:3119) — يقبل `status:"completed"` ويكرّر تحقّق الإغلاق والفوترة GL يدويًا | duplicate — مساران للإكمال؛ PATCH يستخدم UPDATE خام بدل `applyTransition` | توجيه أي تحوّل إلى `completed` عبر مسار `/complete` فقط |
| سداد دفعة إيجار | `POST /payments/:id/pay` على `rent_payments` (GL عبر `postRentRevenueGL`) | `POST /contracts/:id/schedule/:installmentId/pay` على `contract_payment_schedule` (GL عبر `postInstallmentPaymentGL`) | conflict — جدولان متوازيان للأقساط (يُنشآن معًا في `POST /contracts` السطر 1151-1158) يُحدَّثان من مسارين منفصلين | توحيد مصدر الحقيقة للأقساط في جدول واحد، أو ربط تحديثَي الجدولين في معاملة واحدة |
| فلتر النطاق (scope) | properties.ts بأكمله: فلاتر `"companyId"=$1` يدوية في 55 endpoint | بقية الوحدات الأحدث: `parseScopeFilters`/`buildScopedWhere`/`scopedQuery` | duplicate منهجي — كل استعلام يعيد كتابة فلتر الشركة يدويًا (تأكيد F2) | اعتماد `scopedQuery` تدريجيًا — تابع لمسار #685 |

---

## يحتاج Runtime Verification

- نجاح `postRentRevenueGL`/`postInstallmentPaymentGL`/`postMaintenanceExpenseGL`/`postSecurityDepositGL`/`postEarlyTerminationGL`/`postBuildingAssetGL` فعليًا — كلها تُستورَد من `propertiesEngine` ولا يمكن تأكيد توليد القيد ثابتًا.
- سلوك معاملة `POST /payments/:id/pay` تحت التزامن — `FOR UPDATE OF rp` موجود، لكن إخفاق العمود المفقود (PROP-003) يمنع التحقّق الفعلي حتى إصلاحه.
- هل يطابق ناتج `applyTransition` فعلًا حالة `event_logs`/`audit_logs` بعد commit للعقود وطلبات الصيانة والفحوص والودائع.
- سلوك `cron` لـ `/late-rent/escalate` — لا واجهة تستدعيه؛ يحتاج تأكيد ما إذا كان مجدوَلًا فعليًا وأنه يُخفق صامتًا بسبب PROP-003/PROP-004.
- تأثير `requireGuards(financial)` على وصول أدوار العقارات (property_manager) لمسارات `/properties`.
- صحّة احتساب `/stats` و`/occupancy-report` على بيانات حقيقية كبيرة (الـ JOIN على `OR u."buildingId"=b.id OR u."buildingName"=b.name`).

---

## العيوب المُرقّمة (Defect Register)

- **PROP-001** · conflict · blocking · structural · زر «إنهاء العقد» يُرسل `PATCH /contracts/:id status=terminated` المرفوض صراحةً من الخادم؛ المسار الصحيح `/contracts/:id/terminate` بلا واجهة · الدليل: `contract-detail.tsx:140-148` ↔ `properties.ts:1268`، `properties.ts:1546` · التبعية: لا شيء — إصلاح مستقل في الواجهة.
- **PROP-002** · mismatch · blocking · narrow · نموذج تعديل المبنى يرسل `floors`، و`updateBuildingSchema` يقبل `floors`/`description` بينما `property_buildings` بلا هذه الأعمدة → SQL 42703 عند التعديل · الدليل: `building-detail.tsx:55-60`، `properties.ts:2854`، `db/schema_pre.sql:10891` · التبعية: قرار schema (إضافة عمود أم إزالة حقل).
- **PROP-003** · mismatch · blocking · narrow · `POST /payments/:id/pay` و`POST /late-rent/escalate` يستعلمان `rent_payments` بشرطَي `companyId`/`deletedAt` غير الموجودَين → SQL 42703، الـ endpoint يُخفق كليًّا · الدليل: `properties.ts:1954`، `properties.ts:2060`، `properties.ts:2067`، `db/schema_pre.sql:11961` · التبعية: لا شيء — إزالة الشروط.
- **PROP-004** · mismatch · blocking · narrow · `INSERT/SELECT late_rent_actions` يكتب `phase` كنصّ بينما العمود `integer` → SQL 22P02 عند كل تصعيد إيجار متأخّر · الدليل: `properties.ts:2006`، `properties.ts:2087`، `db/schema_pre.sql:8875` · التبعية: قرار schema (تغيير نوع العمود).
- **PROP-005** · dead · impairing · narrow · `POST /contracts/:id/renew` كامل المنطق (أقساط + التزامات) لكن لا زر واجهة يستدعيه؛ الواجهة تجدّد بـ `POST /contracts` بدلًا منه · الدليل: `properties.ts:1425`، `contract-detail.tsx:110-130` · التبعية: PROP-001 (نفس صفحة الإصلاح).
- **PROP-006** · mismatch · impairing · narrow · `updateUnitSchema` يقبل `name`/`notes` و`PATCH /units/:id` يضمّهما في `trackedFields` بينما `property_units` بلا هذين العمودين → SQL 42703 لو أُرسلا · الدليل: `properties.ts:741-746`، `db/schema_pre.sql:11114` · التبعية: قرار schema.
- **PROP-007** · dead · cosmetic · narrow · شاشة إنشاء الوحدة ترسل `notes` لكن `createUnitSchema` يُسقطه (والجدول بلا عمود) — الملاحظة تُفقد بصمت · الدليل: `properties-create.tsx:112`، `properties.ts:23-50` · التبعية: PROP-006 (نفس قرار العمود).
- **PROP-008** · dead · impairing · narrow · زر «تسجيل دفعة» في ترويسة properties-payments يُوجّه إلى `/payments/new/pay` فيستدعي `parseId("new")` ويرمي خطأ · الدليل: `properties-payments.tsx:64` · التبعية: لا شيء.
- **PROP-009** · dead · cosmetic · narrow · رابط `/properties/buildings/:id/edit` في الواجهة لمسار غير مُسجّل في `propertyRoutes.tsx` (التعديل فعليًا inline في building-detail) · الدليل: `properties-buildings.tsx:183`، `propertyRoutes.tsx` · التبعية: لا شيء.
- **PROP-010** · dead · impairing · narrow · زر «تعديل» في تفاصيل الدفعة يُوجّه إلى `/properties/payments/:id/edit` غير المُسجّل — صفحة بيضاء · الدليل: `property-payment-detail.tsx:181-182, 382` · التبعية: لا شيء.
- **PROP-011** · dead · impairing · narrow · زر «تعديل» في تفاصيل الصيانة يكتفي بالتوجيه إلى قائمة الصيانة دون فتح شاشة تعديل؛ و`PATCH /maintenance-requests/:id` بلا واجهة تستهلكه · الدليل: `property-maintenance-detail.tsx:240-249`، `properties.ts:3091` · التبعية: لا شيء.
- **PROP-012** · dead · cosmetic · narrow · `DELETE /units/:id` بلا أي زر حذف وحدة في الواجهة · الدليل: `properties.ts:800` · التبعية: لا شيء.
- **PROP-013** · dead · cosmetic · narrow · `DELETE /contracts/:id` بلا زر حذف عقد في الواجهة · الدليل: `properties.ts:1380` · التبعية: لا شيء.
- **PROP-014** · mismatch · impairing · narrow · `PATCH /maintenance-requests/:id/approve` يقرأ `mr.createdBy` و`mr.title` غير الموجودَين في `maintenance_requests` → إشعار صاحب الطلب لا يُرسَل أبدًا · الدليل: `properties.ts:2372-2376`، `db/schema_pre.sql:9260` · التبعية: لا شيء (لا خطأ SQL — قراءة undefined فقط).
- **PROP-015** · dead · impairing · narrow · `POST /maintenance-requests/:id/complete` (إغلاق + فوترة + GL) بلا زر واجهة؛ لا مسار لإكمال طلب صيانة من الواجهة · الدليل: `properties.ts:2392`، `property-maintenance-detail.tsx` · التبعية: لا شيء.
- **PROP-016** · dead · cosmetic · narrow · `contract-detail` يمرّر `?contractId=` إلى `/maintenance` و`/inspections` اللذين لا يدعمان هذا الفلتر — يُتجاهَل بصمت ويُعرَض كل صيانة/فحوص الشركة · الدليل: `contract-detail.tsx:56-66`، `properties.ts:2957`، `properties.ts:3570` · التبعية: لا شيء.
- **PROP-017** · duplicate · cosmetic · narrow · `POST /maintenance` تكرار لـ `POST /maintenance-requests` على نفس الجدول بمنطق مبسّط بلا توزيع/مهمة/حدث؛ بلا مستهلك واجهة · الدليل: `properties.ts:2969` ↔ `properties.ts:2151` · التبعية: لا شيء.
- **PROP-018** · mismatch · cosmetic · narrow · `PATCH /owners/:id` يستدعي `createAuditLog` بلا `before/after` — سجلّ التدقيق لا يحفظ ما تغيّر فعليًا (بقية الـ handlers تمرّر `before/after`) · الدليل: `properties.ts:3410-3417` · التبعية: لا شيء.
- **PROP-019** · scaling · impairing · structural · `POST /contracts/:id/schedule/:installmentId/pay` يحدّث حالة القسط بـ `UPDATE` خام (السطر 3525) بلا `applyTransition` وبلا قفل صف؛ سداد متزامن لنفس القسط يسمح بازدواج قيد GL · الدليل: `properties.ts:3525-3540` · التبعية: تابع لمسار توحيد lifecycle (F4).
- **PROP-020** · scaling · impairing · structural · داخل `onApply` لإنهاء العقد، تحرير الوحدة `rented→available` يُنفَّذ بـ `UPDATE property_units` خام (السطر 1591) لا عبر `applyTransition` — لا يُسجَّل تحوّل حالة الوحدة في `event_logs` ولا audit مستقل للوحدة · الدليل: `properties.ts:1589-1594` · التبعية: تابع لمسار توحيد lifecycle (F4).
- **PROP-021** · scaling · cosmetic · narrow · `GET /contracts` و`/payments` بحدّ `LIMIT 500` ثابت بلا ترقيم صفحات؛ شركة بأكثر من 500 عقد/دفعة تفقد البقية من الواجهة · الدليل: `properties.ts:995`، `properties.ts:1858` · التبعية: لا شيء.
- **PROP-022** · mismatch · cosmetic · narrow · توزيع الفنّي يقرأ `tech.specialty` بينما عمود الجدول `speciality` — مطابقة التخصّص في خوارزمية الإسناد لا تُفعَّل أبدًا · الدليل: `properties.ts:2229`، `db/schema_pre.sql:13224` · التبعية: لا شيء.

---

## خلاف مع تقارير سابقة

1. **خلاف مع PROPERTIES_CERTIFICATION** — يصنّف الشهادة بُعد Audit على أنه `✅ PASS` لكل الـ 55 endpoint. هذا غير دقيق: `PATCH /owners/:id` (properties.ts:3410) يستدعي `createAuditLog` **بلا `before/after`** فلا يُسجَّل أي تغيير فعلي (PROP-018) — بينما كل نظائره (units/contracts/buildings/tenants) تمرّر `before/after`. الشهادة فحصت «وجود استدعاء `createAuditLog`» فقط لا محتواه. التصنيف الصحيح لهذا البند: 🟡 PARTIAL.

2. **خلاف مع PROPERTIES_CERTIFICATION** — تُدرج الشهادة كل الـ 55 endpoint كـ RBAC `✅ PASS` وتطرحها ضمنيًا كوحدة «شغّالة». لكن الفحص الثابت لمخطّط قاعدة البيانات يكشف أن **`POST /payments/:id/pay` و`POST /late-rent/escalate` مكسوران كليًّا** بسبب استعلام أعمدة غير موجودة في `rent_payments` و`late_rent_actions` (PROP-003، PROP-004). الشهادة لا تفحص مطابقة الأعمدة مقابل الـ schema إطلاقًا، فبندان «معتمدان» في الشهادة هما فعليًا blocking. هذا يتجاوز تحفّظ الشهادة المعلَن (التزامن/الأداء) — العيب بنيوي لا تشغيلي.

3. **خلاف مع UNVERIFIED_PATHS (الخلاصة «لا APIs معطوبة في عيّنة الواجهة»)** — تُعلن الوثيقة في §1 و§5 أنه «لا APIs معطوبة في عيّنة الواجهة» بناءً على فحص 12 صفحة. هذا الجرد الكامل يثبت العكس داخل مسار العقارات: زر «إنهاء العقد» (PROP-001) يستدعي مسارًا يرفض الطلب صراحةً بـ 409، وزر «تسجيل دفعة» (PROP-008) ومسار `payment-register` كلاهما يصل إلى endpoint مكسور (PROP-003). «عيّنة 12 صفحة» لم تشمل هذه التدفّقات؛ الخلاصة العامة غير قابلة للتعميم على العقارات.

4. **تأكيد جزئي لـ F4 مع تصحيح** — F4 يذكر «lifecycle بلا audit» عند `properties.ts:1583/1591/3525`. الفحص المباشر يؤكد: السطر 3525 (`UPDATE contract_payment_schedule` في schedule-pay) والسطر 1591 (`UPDATE property_units` لتحرير الوحدة داخل terminate) فعلًا تحوّلات حالة خام خارج `applyTransition` (PROP-019، PROP-020). لكن السطر 1583 (`UPDATE contract_payment_schedule SET status='cancelled'`) يقع **داخل** `onApply` لـ `applyTransition` المسؤول عن إنهاء العقد، ويُسجَّل ضمن `event_logs` للعقد — فهو تأثير جانبي مُدار جزئيًا لا «تحوّل حالة معزول بلا audit». التوصيف الأدق: إلغاء الأقساط ليس له audit **مستقل على مستوى القسط**، لكنه ليس خارج المعاملة المُدقَّقة.

5. **تأكيد F2** — `properties.ts` لا يستخدم `scopedQuery`/`parseScopeFilters`/`buildScopedWhere` في أي من الـ 55 endpoint؛ كلها تعتمد `req.scope!` وفلاتر `"companyId"=$N` يدوية (55 ورود لـ `req.scope`). يطابق F2 تمامًا.
