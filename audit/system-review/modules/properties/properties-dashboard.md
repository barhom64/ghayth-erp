# /properties/dashboard — `artifacts/ghayth-erp/src/pages/properties-dashboard.tsx`

## 1. الميتاداتا
- المسار: `/properties/dashboard`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:34`
- المجموعة: `properties`
- الكومبوننت: `PropertiesDashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `dashboard`
- سطور الملف: 383
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L240: "عرض العقود"
- L256: "عرض الكل"
- L271: "طلب صيانة جديد"
- L316: "(بلا تسمية)"
- L334: "عرض الكل"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
لوحة العقارات الرئيسية. KPIs + إجراءات سريعة.

| البيانات | المصدر |
|---------|--------|
| Occupancy rate | راجع `properties-occupancy-report.md` |
| Total units / buildings | `property_units`, `property_buildings` |
| Active contracts | `property_contracts WHERE status='active'` |
| Expiring contracts (60 يوم) | cron alert |
| Total rent expected (monthly) | aggregate `contracts.monthlyRent` |
| Total received this month | aggregate `payments.paidAmount` |
| Maintenance requests open | `maintenance_requests WHERE status!='closed'` |
| Overdue payments | aggregate aged `payments.dueDate` |
| Top tenants | by paid_amount desc |
| Top owners | by units count |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تجميع KPIs | `properties.ts` GET `/dashboard` | aggregation | ✅ |
| فلترة per branch/building | scopeQueryString | ✅ |
| Quick actions (مبنى جديد/عقد جديد) | Link to create pages | ✅ |
| Drill-down للوحدات الفارغة | navigate to `properties-units.md` | ✅ |
| إشعارات (occupancy threshold) | comms | event=`occupancy_below_X` | ⚠ |
| RBAC (property module access) | minRoleLevel + subKey | ✅ |
| Audit log | read-only لا تُسجّل | ✅ |

تحقق يدوي:
- [ ] هل الـ KPIs محسوبة لحظياً أم cached كل X دقيقة؟
- [ ] هل لوحة المالك (owner portal) لها view مختلف يعرض فقط ممتلكاته؟
- [ ] هل البيانات الحساسة (رصيد مالك) محصورة على الـ admin + المالك نفسه؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `dashboard` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/dashboard`
- لقطة: `audit/screenshots/properties_dashboard.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
