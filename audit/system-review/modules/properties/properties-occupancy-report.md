# /properties/occupancy-report — `artifacts/ghayth-erp/src/pages/properties/occupancy-report.tsx`

## 1. الميتاداتا
- المسار: `/properties/occupancy-report`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/occupancy-report.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:58`
- المجموعة: `properties`
- الكومبوننت: `OccupancyReport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `occupancy-report`
- سطور الملف: 184
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/properties/occupancy-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تقرير الإشغال (Occupancy Report) — read-only، KPI رئيسي للملاك.

| البيانات | المصدر | الحساب |
|---------|--------|--------|
| Total units | `property_units` count | per building/owner/portfolio |
| Occupied | `units WHERE status='occupied'` | with active contract |
| Vacant | `units WHERE status='vacant'` | available for rent |
| Maintenance | `units WHERE status='maintenance'` | excluded from supply |
| Reserved | `units WHERE status='reserved'` | pending contract |
| Occupancy rate | (occupied / total) × 100 | KPI |
| Average rent | sum(active contracts.monthlyRent) / count | per type/area |
| Revenue projection | rent × 12 × occupancy_rate | annual estimate |
| Aging vacancy | days since last contract ended | per unit |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| توليد التقرير | `properties.ts` GET `/occupancy-report` | aggregation | ✅ |
| Filter per scope | يطبق branchId/buildingId | ✅ |
| تجميع per type (residential/commercial) | aggregation per category | ✅ |
| تصدير PDF/Excel | `export.ts` | ✅ |
| ربط بـ bi-dashboards | exec dashboard | KPIs | ✅ |
| إشعار عند انخفاض occupancy | comms | event=`occupancy_below_threshold` | `notifications` | ⚠ |
| ربط بـ tco/profitability | finance | per building NOI calc | ⚠ |

تحقق يدوي:
- [ ] هل وحدة under_maintenance تُحتسب في إجمالي units (denominator) أم تُستبعد؟
- [ ] هل التقرير الشهري يحفظ snapshot للأرشيف أم محسوب لحظياً فقط؟
- [ ] هل المتوسط (avg rent) يستثني الوحدات الكبيرة شاذة الـ outliers؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `occupancy-report` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/occupancy-report`
- لقطة: `audit/screenshots/properties_occupancy_report.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
