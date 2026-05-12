# /bi/dashboards — `artifacts/ghayth-erp/src/pages/bi.tsx`

## 1. الميتاداتا
- المسار: `/bi/dashboards`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:12`
- المجموعة: `bi`
- الكومبوننت: `BI`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `dashboards`
- سطور الملف: 48
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
لوحات BI المخصّصة. read-only — تجميع من كل الوحدات.

| المصدر | البيانات المعروضة |
|---------|--------------------|
| finance/GL | Revenue, Expenses, Profit Margin, Cash Flow |
| finance/AR | Aging buckets, DSO, Top debtors |
| finance/AP | Vendor balance, DPO, Top creditors |
| finance/budget | Variance (planned vs actual), 80% alerts |
| hr/attendance | Lateness rate, Overtime hours, Absence trend |
| hr/payroll | Total payroll cost, GOSI contributions |
| hr/turnover | Hiring/exit rates per department |
| fleet | TCO per vehicle, fuel cost trend |
| properties | Occupancy rate, Rental income, Maintenance cost |
| crm | Pipeline value, Win rate, Sales per rep |
| support | Ticket volume, CSAT, SLA breach rate |
| governance | Open risks, CAPA closure rate |
| umrah | Pilgrims per season, Revenue by package |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء dashboard | `bi.ts` POST `/bi/dashboards` | `bi_dashboards` | ✅ |
| إضافة widget | POST `/widgets` | `bi_dashboard_widgets` | ✅ |
| تحديد مصدر بيانات | `widget.query` SQL أو aggregate function | ✅ |
| فلترة per scope (branch/dept) | يطبق `scopeQueryString` تلقائياً | ✅ |
| تصدير CSV/PDF | `export.ts` | ✅ |
| إشعار عند threshold breach | event=`bi_alert_triggered` | `notifications` | ⚠ |
| RBAC على widgets | تخفي الحساسة عن غير المخوّل | ✅ |
| Audit log | اختياري — read-only operations | عادة لا تُسجَّل | ✅ |

تحقق يدوي:
- [ ] هل widget يقرأ من view آلياً يعكس آخر بيانات أم cached؟
- [ ] هل drill-down (نقر widget للتفاصيل) محترم لـ RBAC العميق؟
- [ ] هل تصدير dashboard للـ PDF يحفظ السرّيّة في الـ password-protected؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `dashboards` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/dashboards`
- لقطة: `audit/screenshots/bi_dashboards.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
