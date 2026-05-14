# /reports/scheduled — `artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx`

## 1. الميتاداتا
- المسار: `/reports/scheduled`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:124`
- المجموعة: `bi`
- الكومبوننت: `ScheduledReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `scheduled`
- سطور الملف: 290
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L125: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/scheduled-reports`
- GET `/scheduled-reports/history`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

التقارير المجدولة — Scheduled report distribution.

| التكرار | المثال |
|---------|--------|
| Daily | daily-close summary | راجع `daily-close.md` |
| Weekly | sales report | every Sunday |
| Monthly | financial statements | end of month |
| Quarterly | board reports | راجع `bi-admin-reports.md` |
| Annual | year-end | comprehensive |
| Ad-hoc | event-triggered | rare |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List scheduled reports | GET `/bi/reports-scheduled` | `scheduled_reports` | ✅ |
| Create schedule | POST | with report + recipients + cron | ✅ |
| Validate cron expression | server-side | ✅ |
| Pause / Resume | toggle | ✅ |
| Run history | per schedule | `scheduled_report_runs` | ✅ |
| View output of past runs | retention per policy | راجع `documents-archive.md` | ✅ |
| Retry failed run | manual | ⚠ |
| Auto-retry on failure | configurable | ✅ |
| Distribution channels | email / S3 / SFTP / webhook | enum |
| Recipients list | + dynamic (role-based) | راجع `admin-roles.md` |
| Audit log on run | success/failure | `audit_logs` | ✅ |
| Compliance — regulatory submission (e.g., ZATCA monthly VAT) | راجع `governance-compliance.md` | ✅ critical |
| Auto-generate per finance period close | راجع `finance-period-close.md` | ⚠ |
| تكامل مع `bi-reports.md` (report definitions) | ✅ |
| تكامل مع `notifications.md` (delivery alerts) | ✅ |
| تكامل مع `automation.md` (cron engine) | ✅ |
| تكامل مع `documents-archive.md` (output retention) | ✅ critical |
| تكامل مع `finance-period-close.md` (period reports) | ✅ |
| RBAC | report owner + admin | ✅ |

تحقق يدوي:
- [ ] هل cron expressions validated + tested?
- [ ] هل auto-retry policy reasonable (exponential backoff)?
- [ ] هل failed runs alert the owner immediately?
- [ ] هل sensitive recipients respect their preferences (e.g., encrypted email)?
- [ ] هل regulatory reports (ZATCA VAT) auto-submitted vs manual?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `scheduled` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/reports/scheduled`
- لقطة: `audit/screenshots/reports_scheduled.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
