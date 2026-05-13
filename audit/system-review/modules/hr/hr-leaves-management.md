# /hr/leaves/management — `artifacts/ghayth-erp/src/pages/hr/leave-management.tsx`

## 1. الميتاداتا
- المسار: `/hr/leaves/management`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/leave-management.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:100`
- المجموعة: `hr`
- الكومبوننت: `LeaveManagement`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `management`
- سطور الملف: 176
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/leave-requests?status=pending`
- GET `/hr/leave-balance`
- GET `/hr/leave-types`
- GET `/hr/leave-stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
لوحة إدارة الإجازات (admin view) — تجميع لكل الإجازات في القسم/الشركة.

| البيانات | المصدر | الغرض |
|---------|--------|-------|
| Active leaves now | `leave_requests WHERE status='approved' AND now BETWEEN start/end` | مشاهدة من على إجازة الآن |
| Pending approvals | `leave_requests WHERE status='pending'` | للموافقات السريعة |
| Balance per employee | `hr_leave_balances` | المستحق المتبقي |
| Leave history | aggregate per employee/period | تحليل الأنماط |
| Public holidays | `public_holidays` | اعتبارها في الحسابات |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| عرض الإجازات | GET `/hr/leaves` + filters | aggregation | ✅ |
| موافقة جماعية (bulk approve) | POST `/hr/leaves/bulk-approve` | atomic | ⚠ تحقق |
| تعديل رصيد إجازة (HR admin) | PATCH `/hr/leave-balances/:id` | `hr_leave_balances` | ✅ |
| ترحيل رصيد (carry-over) | cron نهاية السنة | يحدّث `year+1` | ⚠ |
| تقرير ageing الإجازات المعلّقة | bi | aggregation | ✅ |
| تأثير على Calendar الموحّد | misc/calendar | راجع `misc/calendar.md` | ✅ |
| تأثير على Payroll (lo unpaid) | hr/payroll | راجع `hr-payroll.md` | ✅ |
| سياسة بلوكات (peak season block) | hr | `business_rules.leave_blackout_dates` | ⚠ |
| إشعارات للمديرين | comms | event=`leave_balance_low\|carryover_due` | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/leaves`) | `audit_logs` (entity=`leave_request`) | ✅ |

تحقق يدوي:
- [ ] هل bulk approve يحترم الـ approval_chain لكل طلب أم يتجاوزه؟
- [ ] هل تعديل رصيد إجازة من HR يتطلب موافقة + audit log إجباري؟
- [ ] هل carry-over policy مرنة (cap, expiry, cashout)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `management` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/leaves/management`
- لقطة: `audit/screenshots/hr_leaves_management.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
