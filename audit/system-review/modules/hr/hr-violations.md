# /hr/violations — `artifacts/ghayth-erp/src/pages/hr/violations.tsx`

## 1. الميتاداتا
- المسار: `/hr/violations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/violations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:131`
- المجموعة: `hr`
- الكومبوننت: `Violations`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `violations`
- سطور الملف: 503
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L135: "تشغيل الرصد"
- L232: "عرض الكل"
- L474: "فتح صفحة الرصد التلقائي"
- L494: "فتح لائحة الانضباط"

### القراءات (GET)
- GET `/hr/discipline/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
مخالفات الموظفين. المرجع: `docs/blueprints/hr-discipline.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل مخالفة (يدوي أو تلقائي) | hr | `hr.ts` POST `/violations` | `employee_violations` | ✅ |
| كشف تلقائي للمخالفات | hr | `lib/autoViolationEngine.ts` — يعمل عبر cron | يدخل `employee_violations` آلياً | ✅ موجود |
| إصدار خطاب تأديبي | hr/discipline | `hr-discipline.ts` POST `/discipline/memos` | `discipline_memos` | ✅ |
| سير موافقة الخطاب | governance/workflows | `approval_chains` | ✅ |
| خصم من الراتب | hr/payroll | `payroll_lines.violationDeduction` يقرأ `employee_violations` للفترة | ✅ |
| إشعار للموظف + المدير | comms | event=`violation_created`, `memo_issued` | `notifications` | ✅ |
| تصاعد العقوبة (escalation) | hr | `penalty-escalation` rules على تكرار النوع نفسه | `penalty_escalations` | ✅ |
| ربط بمخالفة مرورية (إن سائق) | fleet | `fleet_traffic_violations.employeeId` → `employee_violations` | ⚠ تحقق |
| Audit log | core | `auditMiddleware` (`/hr/violations`) | `audit_logs` (entity=`violation`) | ✅ |

تحقق يدوي:
- [ ] هل المخالفة المُلغاة (cancelled) تُعاد للراتب تلقائياً؟
- [ ] هل cron الـ auto-detection يعمل يومياً ومن أي مصدر يقرأ (attendance/leave_requests)؟
- [ ] هل توجد سياسة تقادم — مخالفات سنة قديمة لا تظهر في الـ escalation؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `violations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L183 _(inline-data-array)_: `const byStage = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/violations`
- لقطة: `audit/screenshots/hr_violations.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
