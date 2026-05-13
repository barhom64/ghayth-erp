# /finance/cash-flow-forecast — `artifacts/ghayth-erp/src/pages/finance/cash-flow-forecast.tsx`

## 1. الميتاداتا
- المسار: `/finance/cash-flow-forecast`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/cash-flow-forecast.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:136`
- المجموعة: `finance`
- الكومبوننت: `CashFlowForecast`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `cash-flow-forecast`
- سطور الملف: 159
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/cash-flow-forecast${scopeSuffix}`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Cash Flow Forecast — تنبؤ بالـ inflows/outflows لـ 30/60/90 يوم قادمة.

| المصدر | Inflows متوقعة | Outflows متوقعة |
|--------|----------------|------------------|
| finance/AR | فواتير عملاء مستحقة (paid_amount < total) | — |
| finance/AP | — | فواتير موردين مستحقة |
| hr/payroll | — | الراتب الشهري (`payroll_runs`) |
| properties/contracts | إيجارات شهرية (rent_schedule) | — |
| properties/maintenance | — | صيانة مجدولة |
| finance/recurring | — | recurring expenses (إيجار مكتب، ...) |
| finance/loans (إن مفعّل) | — | أقساط بنكية |
| store/sales orders | عقود مستقبلية | — |
| umrah | — | تكلفة المواسم القادمة |
| fleet/insurance | — | الأقساط القادمة |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate forecast | `finance-reports.ts` GET `/cash-flow-forecast` | aggregation per period | ✅ |
| Drill-down per category | filter | ✅ |
| Confidence level | high (confirmed) / medium (pattern-based) / low (speculative) | ⚠ |
| Net position warning | inflow < outflow → red flag | event=`cash_shortage_predicted` | ⚠ |
| What-if scenarios | toggle on/off categories | للـ planning | ⚠ |
| تكامل مع `exec-dashboard` | راجع `misc/exec-dashboard.md` | ✅ |
| Multi-currency conversion | latest FX rates | راجع `finance/fx` | ✅ |
| تقرير أسبوعي للـ CFO | comms | event=`cashflow_forecast_ready` | ⚠ |
| Audit log | read-only | ✅ |

تحقق يدوي:
- [ ] هل forecast يحدّث real-time أم يعاد بناؤه دورياً (cron)؟
- [ ] هل scenario "what if عميل X لم يدفع" مدعوم؟
- [ ] هل seasonal patterns (مثل موسم العمرة) محسوبة آلياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `cash-flow-forecast` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/cash-flow-forecast`
- لقطة: `audit/screenshots/finance_cash_flow_forecast.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
