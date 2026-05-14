# /my-leave-request — `artifacts/ghayth-erp/src/pages/my-leave-request.tsx`

## 1. الميتاداتا
- المسار: `/my-leave-request`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-leave-request.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:66`
- المجموعة: `misc`
- الكومبوننت: `MyLeaveRequest`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-leave-request`
- سطور الملف: 11
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

طلب إجازة (Self-service) — Employee submits leave request.

| نوع الإجازة | المدة السنوية (Saudi Labor Law) |
|------------|-------------------------------|
| Annual (سنوية) | 21 days (< 5 years), 30 days (≥ 5 years) |
| Sick (مرضية) | 30 days full + 60 days partial + 30 unpaid |
| Maternity (أمومة) | 10 weeks paid |
| Paternity | 3 days |
| Hajj (حج) | 10-15 days, once per service |
| Marriage | 5 days |
| Death of family | 5 days (close) / 3 days (extended) |
| Educational | per policy |
| Unpaid | extended without pay |
| Compensatory | for overtime/holidays worked |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Check leave balance | GET `/my-space/leave-balance` | راجع `hr-leave-balances.md` | ✅ |
| Create request | POST `/my-space/leave-request` | `leave_requests` (status=pending) | ✅ |
| Validate balance available | server-side | ✅ critical |
| Validate notice period | per type (e.g., annual = 30 day notice) | ⚠ |
| Validate overlapping requests | guard | ✅ |
| Validate dates (no past dates) | server-side | ✅ |
| Attach medical certificate (لو sick > 3 days) | راجع `documents.md` | ✅ |
| Submit for approval | راجع `governance/approvals.md` | ✅ |
| Approve (manager) | راجع `hr-leaves.md` | ✅ |
| Auto-update attendance | راجع `hr-attendance.md` | flag the days | ✅ critical |
| Deduct from balance | راجع `hr-leave-balances.md` | ✅ critical |
| Coverage planning (assign cover) | optional | راجع `hr-coverage.md` | ⚠ |
| Notification chain | event=`leave_request_pending/approved/rejected` | راجع `notifications.md` | ✅ |
| Cancel request (before approval) | by employee | ✅ |
| Cancel approved (with reason) | by employee with approval | ⚠ |
| Out-of-office auto-reply (email) | راجع `comms-notification-engine.md` | ⚠ |
| تكامل مع `hr-leaves.md` (HR side) | ✅ |
| تكامل مع `hr-attendance.md` (no checks-in during leave) | ✅ critical |
| تكامل مع `hr-payroll.md` (paid vs unpaid impact) | ✅ critical |
| تكامل مع `calendar.md` (visibility for team) | ✅ |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ |
| RBAC | employee for own + manager for team approval | ✅ |

تحقق يدوي:
- [ ] هل Saudi Labor Law leave entitlements مطبّقة بدقة (21/30 يوم annual)?
- [ ] هل medical certificate enforced for sick leave > 3 days?
- [ ] هل overlapping requests blocked?
- [ ] هل coverage planning mandatory for key roles?
- [ ] هل payroll impact accurate (paid vs unpaid)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-leave-request` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/my-leave-request`
- لقطة: `audit/screenshots/my_leave_request.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
