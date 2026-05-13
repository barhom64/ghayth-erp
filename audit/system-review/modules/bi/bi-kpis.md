# /bi/kpis — `artifacts/ghayth-erp/src/pages/bi.tsx`

## 1. الميتاداتا
- المسار: `/bi/kpis`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:14`
- المجموعة: `bi`
- الكومبوننت: `BI`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `kpis`
- سطور الملف: 48
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

KPIs Management — إدارة المؤشرات الرئيسية. read-only aggregations.

| Category | Examples |
|----------|----------|
| Financial | Revenue YTD, Gross Margin, OPEX ratio, ROA, ROE |
| Operational | Order fulfillment time, Inventory turnover |
| Sales | Pipeline value, Conversion rate, Avg deal size |
| HR | Headcount, Turnover rate, Time-to-hire, Training hours |
| Customer | NPS, CSAT, Churn rate, Lifetime value |
| Compliance | Audit pass rate, CAPA closure rate, ZATCA submission |
| Sustainability (optional) | Energy use, Waste reduction |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تعريف KPI | POST `/bi/kpis` | `bi_kpis` (formula + threshold) | ✅ |
| Calculation method | aggregate functions | views أو scheduled materialized | ✅ |
| Target setting | per period | `bi_kpi_targets` | ✅ |
| Real-time vs scheduled | متغيّر | high-frequency = scheduled snapshot | ⚠ |
| Drill-down | navigate to source data | ✅ |
| Trend analysis | comparative period over period | ✅ |
| Alerts (breach threshold) | event=`bi_kpi_alert` | راجع `notifications` | ⚠ |
| Linked to dashboards | راجع `bi-dashboards.md` | ✅ |
| Export | CSV/PDF | ✅ |
| RBAC per KPI sensitivity | financial KPIs = CFO level | ✅ |
| Audit log | read-only لا تُسجَّل | ✅ |

تحقق يدوي:
- [ ] هل KPIs مؤرشفة per period للـ comparison historical?
- [ ] هل breach threshold يطلق إشعار حقيقي (push/email)?
- [ ] هل multi-currency KPIs محسوبة بـ closing FX؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `kpis` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/kpis`
- لقطة: `audit/screenshots/bi_kpis.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
