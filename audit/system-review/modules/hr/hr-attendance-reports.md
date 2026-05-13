# /hr/attendance/reports — `artifacts/ghayth-erp/src/pages/hr/attendance-reports.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance/reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/attendance-reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:94`
- المجموعة: `hr`
- الكومبوننت: `AttendanceReports`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `reports`
- سطور الملف: 118
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تقارير الحضور والانصراف — analytical view لـ HR + payroll input.

| التقرير | الفترة | الاستخدام |
|---------|--------|----------|
| Daily attendance | يومي | تتبع check-in/out |
| Late arrivals | شهري | violations + warnings |
| Early departures | شهري | violations |
| Overtime hours | شهري | input للـ payroll |
| Absence report | شهري | unauthorized absences → violations |
| Shift compliance | per shift | راجع `hr-shifts.md` |
| Productivity (hours worked) | per employee | KPI |
| Geo-location violations | لو check-in خارج المنطقة | راجع `hr-geofencing.md` |
| Department aggregates | per department | for manager |
| Branch aggregates | per branch | for branch manager |
| Monthly summary (for payroll) | شهري | input إجباري | راجع `hr-payroll.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Generate report | GET `/hr/attendance/reports?type=...&period=...` | aggregations | ✅ |
| Export CSV/Excel | راجع `bi-reports.md` | ✅ |
| Export PDF | راجع `print-templates` | ✅ |
| Schedule recurring | راجع `reports-scheduled.md` | ✅ |
| Approve monthly summary (for payroll lock) | manager | يقفل الشهر | ✅ critical |
| Re-open if changes needed | with audit + approval | requires HR manager | ✅ |
| تكامل مع `hr-payroll.md` | input لـ overtime + absences | ✅ critical |
| تكامل مع `hr-violations.md` | unauthorized absences | auto-generate violation | ⚠ |
| تكامل مع `hr-evaluations.md` | attendance score | راجع `hr-evaluation-cycles.md` | ⚠ |
| تكامل مع `bi-kpis.md` | productivity KPI | ✅ |
| **PDPL** — masking لتقارير غير اللازمة لطول البيانات | ✅ |
| Audit log on generate | للأرشيف | `audit_logs` | ✅ |
| RBAC scope | manager يرى team، hr-manager يرى الكل | ✅ |

تحقق يدوي:
- [ ] هل lock الشهر يمنع التعديل على attendance أم warning فقط؟
- [ ] هل violations تتولد تلقائياً من unauthorized absence أم تحتاج HR action؟
- [ ] هل overtime calculation يأخذ shift rules بشكل دقيق؟
- [ ] هل تقرير الإدارة يأخذ scope الـ branch تلقائياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/attendance/reports`
- لقطة: `audit/screenshots/hr_attendance_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
