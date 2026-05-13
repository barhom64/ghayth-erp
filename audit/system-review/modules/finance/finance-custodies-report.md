# /finance/custodies/report — `artifacts/ghayth-erp/src/pages/finance/custody-aging-report.tsx`

## 1. الميتاداتا
- المسار: `/finance/custodies/report`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/custody-aging-report.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:115`
- المجموعة: `finance`
- الكومبوننت: `CustodyAgingReport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `report`
- سطور الملف: 152
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L33: "العهد"

### القراءات (GET)
- GET `/finance/custodies/report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تقرير عمر العهد (Custody Aging Report) — للموظفين الذين عندهم عهدة لم تُسوَّ.

| Aging Bucket | الإجراء |
|--------------|---------|
| 0-30 يوم | normal | reminder |
| 31-60 يوم | warning | escalate to manager |
| 61-90 يوم | critical | escalate to HR + finance |
| 90+ يوم | escalation | possible salary deduction | راجع `hr-payroll.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Generate report | GET `/finance/custodies/report` | aggregations | ✅ |
| Filter by employee/department/branch | scope-aware | ✅ |
| Aged buckets | calculated | per bucket sum | ✅ |
| Drill-down per employee | navigate to `finance-custodies-byid.md` | ✅ |
| Outstanding amount per employee | balance | `gl_entries` WHERE account=custody-employee | ✅ |
| Trigger settlement reminder | manual or auto | event=`custody_overdue` | راجع `notifications.md` ✅ |
| Auto-escalate after threshold days | cron | راجع `automation.md` | ⚠ |
| Salary deduction trigger | لو لم يُسوّى | راجع `hr-payroll.md` | ✅ critical |
| Email/SMS reminder | per bucket | راجع `notifications.md` | ✅ |
| Export CSV/PDF | راجع `print-templates` | ✅ |
| Schedule monthly | راجع `reports-scheduled.md` | للـ CFO | ✅ |
| تكامل مع `finance-custodies.md` (list) | ✅ |
| تكامل مع `finance-custodies-byid.md` (detail) | ✅ |
| تكامل مع `hr-payroll.md` (deduction) | ✅ critical |
| تكامل مع `bi-kpis.md` (custody aging KPI) | ✅ |
| Audit log on report run + reminder send | `audit_logs` | ✅ |
| RBAC | finance + hr-manager (للـ deduction) | ✅ |

تحقق يدوي:
- [ ] هل auto-escalation يأخذ exceptions (مرضي، سفر) بعين الاعتبار؟
- [ ] هل salary deduction تطبق فقط بعد notification chain كاملة؟
- [ ] هل employee يستطيع تسوية online بدون منت intervention؟
- [ ] هل الـ overdue عمل automated reminder يومي؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `report` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/custodies/report`
- لقطة: `audit/screenshots/finance_custodies_report.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
