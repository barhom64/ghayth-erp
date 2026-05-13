# /crm/activities — `artifacts/ghayth-erp/src/pages/crm/activities.tsx`

## 1. الميتاداتا
- المسار: `/crm/activities`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/crm/activities.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:86`
- المجموعة: `crm`
- الكومبوننت: `CrmActivities`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `activities`
- سطور الملف: 132
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/crm/opportunities`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

نشاطات الـ CRM — log كل تفاعل مع العميل (مكالمة، اجتماع، إيميل، مهمة).

| نوع النشاط | الوصف |
|------------|------|
| Call | مكالمة هاتف | duration + outcome |
| Meeting | اجتماع | location + attendees |
| Email | بريد | subject + body (or link to message) |
| Task | مهمة متابعة | due date + priority |
| Note | ملاحظة | text only |
| Visit | زيارة ميدانية | location + photos |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List activities | GET `/crm/activities` | `crm_activities` | ✅ |
| List per client/opportunity | filter | by clientId / opportunityId | ✅ |
| إنشاء نشاط | POST `/crm/activities` | + audit | ✅ |
| تعديل/إكمال | PATCH `/crm/activities/:id` | with outcome | ✅ |
| Schedule future activity | future date | يولّد reminder | راجع `calendar.md` |
| Reminder قبل الموعد | event=`activity_reminder` | راجع `notifications.md` | ✅ |
| Mark complete | PATCH `/crm/activities/:id/complete` | ✅ |
| Cancel | with reason | ✅ |
| Attach documents | راجع `documents.md` | ✅ |
| تكامل مع `crm-pipeline.md` | يعد آخر نشاط لكشف stuck opportunities | ✅ |
| تكامل مع `tasks.md` | لو activity=Task ينعكس على tasks | ⚠ تحقق |
| تكامل مع `calendar.md` | لو فيه scheduled time | ✅ |
| تكامل مع `comms-templates.md` (إيميل) | rendering | ✅ |
| Audit log | كل نشاط | `audit_logs` | ✅ |
| RBAC scope | حسب صاحب النشاط أو team | ✅ |

تحقق يدوي:
- [ ] هل reminder للـ scheduled activity يأخذ بعين الاعتبار timezone صاحبه؟
- [ ] هل إلغاء النشاط يلغي reminders المرتبطة؟
- [ ] هل visit يدعم GPS location verification؟
- [ ] هل النشاطات المكتملة تحتاج outcome إجباري؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `activities` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/crm/activities`
- لقطة: `audit/screenshots/crm_activities.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
