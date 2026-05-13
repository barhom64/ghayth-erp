# /tasks — `artifacts/ghayth-erp/src/pages/tasks.tsx`

## 1. الميتاداتا
- المسار: `/tasks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/tasks.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:117`
- المجموعة: `operations`
- الكومبوننت: `Tasks`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tasks`
- سطور الملف: 423
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L187: "(بلا تسمية)"
- L197: "(بلا تسمية)"
- L208: "(بلا تسمية)"
- L219: "نسخ"
- L223: "(بلا تسمية)"
- L232: "(بلا تسمية)"
- L242: "(بلا تسمية)"
- L390: "(بلا تسمية)" → `saveEdit` 🔒
- L394: "إلغاء" → `cancelEdit`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

مهامي — Personal task list (my-tasks view). aggregates من كل المصادر.

| المصدر | المثال |
|--------|--------|
| Project tasks | راجع `projects-tasks.md` | from projects assigned |
| Approval requests | راجع `governance/approvals.md` | pending my action |
| Tickets (assigned) | راجع `support.md` | as agent |
| Correspondence (مطلوب رد) | راجع `correspondence.md` | reply due |
| Legal sessions (lawyer) | راجع `legal-sessions.md` | upcoming |
| Workflows | راجع `governance/workflows.md` | my step |
| Recurring tasks (cron-like) | راجع `automation.md` | scheduled |
| Manual tasks (ad-hoc) | created manually |
| Reminders | from various modules |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List my tasks | GET `/tasks` | aggregate views | ✅ |
| Filter by source/priority/due | UI filter | ✅ |
| Mark task complete | per task type | calls source-specific endpoint | ✅ |
| Snooze / reschedule | with reason | optional | ⚠ |
| Delegate to colleague | with audit | per task type permissions | ⚠ |
| Bulk actions | للـ housekeeping | ⚠ |
| Calendar view | راجع `calendar.md` | with deadlines | ✅ |
| Mobile push (PWA) | راجع `notifications.md` | for upcoming | ✅ |
| Notification on due | event=`task_due_soon` | راجع `notifications.md` | ✅ |
| Overdue alerts (cascading) | manager notified | ✅ critical |
| تكامل مع `my-space/dashboard.md` | landing | ✅ |
| تكامل مع `intelligence.md` (daily schedule) | exec view | ✅ |
| تكامل مع `bi-kpis.md` (productivity KPIs) | aggregate | ⚠ |
| Audit log on completion | `audit_logs` | ✅ |
| RBAC scope | own tasks + delegated | ✅ |

تحقق يدوي:
- [ ] هل completion من الـ aggregator يحدّث الـ source record بدقة؟
- [ ] هل delegated tasks مرئية للـ delegator + delegate?
- [ ] هل overdue tasks تطلق escalation chain (manager → manager's manager)?
- [ ] هل filter by source clear للمستخدم؟
- [ ] هل mobile push يحترم quiet hours per user؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tasks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/tasks`
- لقطة: `audit/screenshots/tasks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
