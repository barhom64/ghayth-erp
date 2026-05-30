# عقد خدمة التقارير — REPORTING_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#9) + `REPORTING_PURPOSE_MATRIX`.

| البند | القيمة |
|---|---|
| **المسؤولية** | لوحات ومؤشّرات وتقارير عبر كل المسارات من محرّك BI واحد |
| **الملف/الجدول** | `routes/bi.ts`، `lib/kpiEngine.ts`، `routes/moduleDashboards.ts`، `routes/execDashboard.ts`، `routes/finance-reports.ts`، جداول `bi_dashboards/kpis/reports` |
| **الواجهة الأمامية** | لوحات الوحدات + التنفيذية + تقارير المسار (نفس الجداول مفلترة) |
| **المدخلات** | `{ module?, kpi/report, filters, scope }` |
| **المخرجات/الأثر** | لوحة/تقرير يُظهر الأثر (مالي/حالة) — مبدأ "الأثر يظهر" |
| **النطاق** | مفلتر بنطاق المستخدم (فرع/شركة) |

**القاعدة:** محرّك واحد — **ممنوع** صومعة تقارير لكل مسار؛ التقارير المسارية لوحات فوق نفس الجداول. عرض-فقط للمشاهد.

**القرار:** تُستخدم. كل تقرير يربط بمصدر أثره (`REPORTING_PURPOSE_MATRIX`).
</content>
