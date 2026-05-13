# /bi — `artifacts/ghayth-erp/src/pages/bi.tsx`

## 1. الميتاداتا
- المسار: `/bi`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:11`
- المجموعة: `bi`
- الكومبوننت: `BI`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `bi`
- سطور الملف: 48
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

وحدة الـ Business Intelligence الرئيسية — entry point للتحليلات والتقارير.

| القسم الفرعي | الوصف | المرجع |
|--------------|------|--------|
| KPIs | مؤشرات الأداء | راجع `bi-kpis.md` |
| Reports | التقارير | راجع `bi-reports.md` |
| Dashboards | لوحات تفاعلية | راجع `bi-dashboards.md` |
| Operations Dashboard | عرض تشغيلي | راجع `bi-operations.md` |
| Insights / AI | تحليلات ذكية | راجع `insights.md` |
| Admin Reports | تقارير إدارية | راجع `bi-admin-reports.md` |
| Module Dashboards | لوحات لكل وحدة | راجع `module-dashboards.md` |
| Scheduled Reports | تقارير مجدولة | راجع `reports-scheduled.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Landing summary | GET `/bi` | aggregations | ✅ |
| Top metrics widget | recent KPI values | راجع `bi-kpis.md` | ✅ |
| Read-only data warehouse | replicate من OLTP | نسخة منفصلة للأداء | ⚠ تحقق |
| Cross-module aggregations | finance + hr + sales + ops | views | ✅ |
| Drill-down per metric | navigate to source | راجع `bi-operations.md` | ✅ |
| Export (CSV/PDF/Excel) | راجع `bi-reports.md` | ✅ |
| **PDPL** — masking لمستويات أدنى | RBAC scope | راجع `admin-scopes.md` | ✅ critical |
| Audit log on report run | `access_logs.report_id` | ✅ |
| RBAC | حسب الـ scope | manager/exec يرى team data | ✅ |

تحقق يدوي:
- [ ] هل aggregations محدّثة real-time أم delayed (لـ data warehouse)؟
- [ ] هل scope per role صحيح (manager يرى team فقط)؟
- [ ] هل export PII يتطلب تأكيد إضافي + audit؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `bi` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi`
- لقطة: `audit/screenshots/bi.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
