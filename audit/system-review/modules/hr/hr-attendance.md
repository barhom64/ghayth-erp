# /hr/attendance — `artifacts/ghayth-erp/src/pages/hr/attendance.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/attendance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:91`
- المجموعة: `hr`
- الكومبوننت: `Attendance`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `attendance`
- سطور الملف: 366
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L240: "الاستئذانات"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
دورة Check-in/out. المرجع: `docs/blueprints/hr-attendance.md` + `docs/blueprints/hr-discipline.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| Check-in / Check-out | hr | `hr.ts` POST `/check-in`, `/check-out` | `attendance` (+ geo `checkInLat/Lon`) | ✅ موجودة في api-server |
| كشف Late/Overtime | hr/discipline | تلقائي عبر `lateMinutes`/`overtimeMinutes` | `attendance.lateMinutes`, `employee_violations` (لـ late > threshold) | ⚠ تحقق من `auto-detection` (`hr/auto-detection`) |
| إنذار تأديبي تلقائي | hr/discipline | `hr-discipline.ts` عبر `penalty-escalation` rules | `employee_violations`, `discipline_memos` | ✅ موجود (راجع `docs/blueprints/hr-discipline.md`) |
| تأثير الراتب (ساعات إضافية / خصم) | hr/payroll | `payroll_runs` يقرأ `attendance` لحساب OT/خصم تأخير | `payroll_lines` | ✅ متوقّع |
| إشعار للمدير عند مخالفة | comms | `notification-engine.ts` event=`violation_created` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`attendance`) | ✅ |

تحقق يدوي:
- [ ] هل `check-in/check-out` يُغلق تلقائياً عند آخر النهار (cron)؟
- [ ] هل التحقق من الموقع الجغرافي (`field-tracking`) إلزامي أم اختياري حسب `business_rules`؟
- [ ] هل تتزامن قراءات `attendance` مع `leave_requests` بحيث لا تُحسب الإجازات تأخيراً؟

## 4. النمذجة
- الجدول: `attendance` (export: `attendance`, 16 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: — | lifecycle col: ✅
- FKs: employeeAssignments.id, companies.id, branches.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/attendance`
- لقطة: `audit/screenshots/hr_attendance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
