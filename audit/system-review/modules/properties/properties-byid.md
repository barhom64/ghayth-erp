# /properties/:id — `artifacts/ghayth-erp/src/pages/details/unit-detail.tsx`

## 1. الميتاداتا
- المسار: `/properties/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/unit-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:62`
- المجموعة: `properties`
- الكومبوننت: `UnitDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 682
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L126: "تغيير الحالة"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل عقار واحد — وحدة سكنية/تجارية/مكتبية.

| الفئة | الوصف |
|------|------|
| Residential (سكني) | شقة، فيلا، استوديو |
| Commercial (تجاري) | محل، معرض |
| Office (مكتبي) | مكتب، طابق |
| Industrial (صناعي) | مستودع، مصنع |
| Land (أرض) | sale/lease |
| Mixed-use | متعدد الاستخدام |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View property details | GET `/properties/:id` | `properties` | ✅ |
| Current status | available/occupied/under-maintenance/sold | راجع `properties-byid-status.md` ✅ |
| Linked building | FK | راجع `properties-buildings-byid.md` | ✅ |
| Active contract | linked lease | راجع `properties-contracts-byid.md` | ✅ |
| Contract history | all leases | timeline | ✅ |
| Maintenance history | راجع `properties-maintenance.md` | ✅ |
| Photos/floor plan | راجع `documents.md` | ✅ |
| Specifications | size, rooms, amenities | metadata | ✅ |
| Rent (current) | per month | from active contract | ✅ |
| Occupancy rate (yearly) | KPI | aggregate | راجع `bi-kpis.md` ✅ |
| Revenue (yearly) | aggregate | from `gl_entries` | ✅ |
| Expenses (yearly) | maintenance + utilities + management | ✅ |
| ROI calculation | revenue - expenses / value | KPI | ✅ |
| Set status (occupied/vacant/maintenance) | manual | راجع `properties-byid-status.md` | ✅ |
| Mark for sale | flag | with valuation | ⚠ |
| Update valuation | periodic | for fixed asset register | راجع `finance-fixed-assets-byid.md` ✅ |
| Tax (property tax) | per Saudi rules | راجع `finance-tax.md` | ⚠ |
| Insurance | per property | راجع `documents.md` | ✅ |
| Ejar registration (Saudi MoH) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `properties-contracts.md` | active lease | ✅ |
| تكامل مع `finance-fixed-assets-byid.md` | على balance sheet | ✅ critical |
| تكامل مع `finance-invoices.md` (rent invoicing) | monthly | راجع `properties-rent-invoicing.md` | ✅ |
| تكامل مع `properties-maintenance.md` (work orders) | ✅ |
| تكامل مع `governance-compliance.md` (Ejar) | ✅ critical |
| Audit log إجباري | كل تعديل status/valuation | `audit_logs` | ✅ critical |
| RBAC | property manager + finance | ✅ |

تحقق يدوي:
- [ ] هل status changes (occupied↔vacant) مرتبطة دائماً بعقد فعلي؟
- [ ] هل Ejar registration mandatory قبل تفعيل عقد إيجار جديد؟
- [ ] هل valuation update يحدث balance sheet impact (revaluation per IFRS)?
- [ ] هل ROI calculation accurate (يأخذ depreciation + property tax + insurance)?
- [ ] هل maintenance scheduled تلقائي per property type (annual inspections)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/units → 401`
- landedUrl: `?`
- توصية: مغلق
