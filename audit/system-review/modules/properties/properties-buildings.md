# /properties/buildings — `artifacts/ghayth-erp/src/pages/properties-buildings.tsx`

## 1. الميتاداتا
- المسار: `/properties/buildings`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-buildings.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:37`
- المجموعة: `properties`
- الكومبوننت: `PropertiesBuildings`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `buildings`
- سطور الملف: 233
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L178: "عرض"
- L184: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
المباني + الوحدات. الجذر الهرمي للعقارات.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء مبنى + ربط مالك | properties | `properties.ts` POST `/buildings` | `property_buildings`, `property_owners` | ✅ |
| توليد وحدات (units) | properties | POST `/buildings/:id/units/batch` (أو يدوي) | `property_units` | ✅ |
| ربط بأصل ثابت | finance/fixed-assets | `property_buildings.assetId` → `fixed_assets` | يولّد سجل إهلاك سنوي/شهري | ⚠ تحقق |
| إشغال (occupancy) | properties | `property_units.status` = `vacant\|occupied\|maintenance` | aggregation | ✅ |
| طلب صيانة | properties | POST `/maintenance-requests` يربط بـ unit/building | `maintenance_requests` | ✅ |
| قيد محاسبي للصيانة | finance/GL | عند إغلاق طلب الصيانة → `expenses` + قيد | `gl_entries` | ✅ |
| فحص دوري (inspection) | properties | جدول دوري ينشأ لكل وحدة | `property_inspections` | ✅ |
| إشعار للمالك (إيرادات) | comms | عند تحديث `occupancy_rate` | `notifications` | ⚠ |
| تكامل مع ZATCA (للوحدات التجارية) | finance-zatca | اختياري | `invoices.commercial=true` | ⚠ |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` (entity=`property`) | ✅ |

تحقق يدوي:
- [ ] هل وحدة "غير صالحة" (under_maintenance) تُستبعد من حساب نسبة الإشغال؟
- [ ] هل تقسيم وحدة كبيرة لوحدتين يُحدّث جميع العقود الموجودة؟
- [ ] هل المبنى المباع يولّد قيد disposal لأصل ثابت؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `buildings` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/buildings`
- لقطة: `audit/screenshots/properties_buildings.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
