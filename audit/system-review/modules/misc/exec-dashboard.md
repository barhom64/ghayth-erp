# /exec-dashboard — `artifacts/ghayth-erp/src/pages/exec-dashboard.tsx`

## 1. الميتاداتا
- المسار: `/exec-dashboard`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/exec-dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:76`
- المجموعة: `misc`
- الكومبوننت: `ExecDashboard`
- subKey: — | minRoleLevel: 60
- الكيان المستنبط: `exec-dashboard`
- سطور الملف: 263
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/exec-dashboard/overview`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
لوحة التنفيذي (Exec Dashboard) — KPIs على مستوى المؤسسة (CEO/CFO/MD).

| Pillar | KPIs | المصدر |
|--------|------|--------|
| **Financial Health** | Revenue YTD, Net Income, EBITDA, Cash Position | finance/GL, fiscal-periods |
| **Liquidity** | Quick Ratio, AR/AP Aging, Days Cash Outstanding | finance/AR, AP |
| **Profitability** | Gross Margin, Net Margin per segment | finance/reports |
| **Compliance** | ZATCA submission, GOSI, WPS, audit findings | gov-integrations + governance |
| **HR Headcount** | Total, hiring rate, exit rate, turnover | hr |
| **Operations** | Active projects, properties occupancy, fleet utilization | operations |
| **Risk** | Top risks by score, open CAPAs | governance |
| **Sales** | Pipeline value, win rate, top clients | crm |
| **Customer** | NPS, support ticket volume, churn | support |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تجميع KPIs بدون filter scope | aggregate across all branches | unrestricted view | ✅ |
| فلترة per company (multi-tenant) | scopeQueryString | ✅ |
| Drill-down حسب الـ pillar | navigate to source module | ✅ |
| Comparative analytics (YoY, QoQ) | aggregate per period | views | ✅ |
| Forecasting (cash flow + revenue) | finance/cash-flow-forecast | ⚠ تحقق |
| تنبيهات حرجة (RED alerts) | event=`exec_alert` | `notifications` | ✅ |
| تصدير PDF | branded report | ⚠ |
| RBAC level 90+ only | يفعّل في route minRoleLevel | ✅ |

تحقق يدوي:
- [ ] هل MD يرى كل الشركات الفرعية في نفس الـ holding أم فقط شركته؟
- [ ] هل CFO له view مالي معمّق + CEO له strategic بدون التفاصيل المحاسبية؟
- [ ] هل تنبيهات RED تطلق إيميل/SMS فوري بدلاً من in-app فقط؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `exec-dashboard` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/exec-dashboard`
- لقطة: `audit/screenshots/exec_dashboard.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
