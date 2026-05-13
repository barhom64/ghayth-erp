# /bi/operations — `artifacts/ghayth-erp/src/pages/bi-operations.tsx`

## 1. الميتاداتا
- المسار: `/bi/operations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi-operations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:18`
- المجموعة: `bi`
- الكومبوننت: `BiOperations`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `operations`
- سطور الملف: 520
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L493: "(بلا تسمية)" → `() => { setFrom(""); setTo(""); setDepartmentId("");`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

BI Operations Dashboard — تركيز على الـ operational metrics.

| Pillar | KPIs |
|--------|------|
| Sales Operations | Pipeline value, Win rate, Avg sales cycle, Top deals |
| Fleet Operations | Vehicle utilization, Fuel cost/km, Maintenance ratio |
| Property Operations | Occupancy rate, Avg rent, Maintenance per unit |
| Warehouse Operations | Inventory turnover, Stockout rate, Cycle count variance |
| Service Operations | Ticket volume, SLA compliance, CSAT, MTTR |
| Project Operations | Schedule variance, Budget variance, Risk count |
| Umrah Operations | Pilgrim count per season, Revenue per package |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate operational data | `bi.ts` GET `/bi/operations` | aggregations | ✅ |
| Filter per branch/department | scope-aware | ✅ |
| Comparative (this month vs last) | aggregate per period | ✅ |
| Drill-down per pillar | navigate to source | ✅ |
| Real-time refresh | client polls every 1 min | ✅ |
| Alerts on KPI breach | راجع `bi-kpis.md` | ⚠ |
| تصدير | CSV/PDF | راجع `bi-reports.md` | ✅ |
| تكامل مع `operations-center.md` (COO view) | ✅ |
| RBAC: operations managers + above | ✅ |
| Audit log | read-only | ✅ |

تحقق يدوي:
- [ ] هل scope للـ branch manager محصور تلقائياً؟
- [ ] هل ‏حدد العمليات لكل وحدة (warehouse/fleet/etc.) في مكان واحد أم متعدد؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `operations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/operations`
- لقطة: `audit/screenshots/bi_operations.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
