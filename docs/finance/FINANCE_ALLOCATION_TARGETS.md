# FINANCE_ALLOCATION_TARGETS.md

أهداف ربط العملية المالية (Allocation Targets) وحقولها الشرطية.

## المبدأ

بدل عرض كل أبعاد التحميل دفعةً واحدة، يُعرض حقل رئيسي واحد:
**«ربط العملية بـ»** / **«ربط المصروف بـ»**. وبحسب الاختيار تظهر الحقول
المناسبة فقط. كل ربط يجب أن يُنتج أثراً (قيد + بُعد على journal_lines +
تذكرة/سجل + Audit log).

## الأهداف والحقول الشرطية

| الهدف (target) | الحقول التي تظهر | الأثر |
|---|---|---|
| `none` (بدون ربط) | — | قيد عام بلا بُعد |
| `vehicle` (مركبة) | المركبة، العداد، السائق | بُعد vehicleId + costCenter المركبة |
| `vehicle_maintenance` (صيانة مركبة) | المركبة، العداد، السائق، نوع الصيانة، المسبّب، تذكرة الصيانة | إنشاء/ربط تذكرة صيانة أسطول + بُعد vehicleId + costCenter |
| `property` (عقار) | العقار | بُعد propertyId + costCenter العقار |
| `property_maintenance` (صيانة عقار) | العقار، الوحدة، المستأجر الحالي، العقد، نوع الصيانة، من يتحمل التكلفة، المسبّب | إنشاء/ربط تذكرة صيانة عقار + بُعد propertyId/unitId/contractId |
| `unit` (وحدة) | العقار، الوحدة | بُعد unitId |
| `contract` (عقد) | العقد، الطرف | بُعد contractId + costCenter العقد |
| `project` (مشروع) | المشروع | بُعد projectId + costCenter المشروع |
| `umrah_season` (موسم عمرة) | الموسم | بُعد umrahSeasonId |
| `umrah_agent` (وكيل عمرة) | الوكيل، الموسم | بُعد umrahAgentId |
| `transport_trip` (رحلة نقل) | الرحلة، المركبة، السائق | بُعد tripId/vehicleId |
| `supplier` (مورد) | المورد | بُعد vendorId |
| `customer` (عميل) | العميل | بُعد clientId |
| `employee` (موظف) | الموظف، القسم | بُعد employeeId + departmentId |
| `fixed_asset` (أصل ثابت) | الأصل | بُعد assetId |

## القاعدة المركزية

`financeAllocationResolver.ts` يحوّل الهدف + معرّفاته إلى:
- `costCenterId` (عبر resolver القائم accountingAllocation)
- مجموعة أبعاد `journal_lines`
- إجراء جانبي (تذكرة صيانة) عند الأهداف ذات الأثر التشغيلي.

كل تجاوز يدوي (manualOverrideReason) يُسجَّل في `allocation_override_log`
ويظهر في تقرير «التجاوزات اليدوية».

## التعميم

نفس قائمة الأهداف تُستهلك من المكوّن الموحّد `FinanceOperationContextPanel`
في كل صفحات الإنشاء المالية، فلا تتكرّر منطقة الحقول الشرطية في كل صفحة.
