# /action-center — `artifacts/ghayth-erp/src/pages/action-center.tsx`

## 1. الميتاداتا
- المسار: `/action-center`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/action-center.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:73`
- المجموعة: `misc`
- الكومبوننت: `ActionCenter`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `action-center`
- سطور الملف: 699
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L360: "مساحتي"
- L415: "(بلا تسمية)"
- L520: "عرض الكل في الصفحة المخصصة"
- L595: "عرض الكل"
- L643: "عرض الكل"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Action Center — مركز قرارات المستخدم. كل ما يحتاج فعلاً مني الآن.

| الفئة | المصدر | الأولوية |
|------|--------|----------|
| Approvals awaiting me | `approval_chain_steps WHERE approver_id=me AND status='pending'` | high |
| Tasks due today/overdue | `tasks WHERE assignee_id=me AND due ≤ today` | high |
| Notifications unread | `notifications WHERE recipient=me AND read_at IS NULL` | medium |
| Documents to sign | `digital_signatures WHERE signer=me AND signed_at IS NULL` | high |
| Reviews/evaluations pending | `performance_reviews WHERE reviewer=me AND status='pending'` | medium |
| Birthdays/anniversaries today | `employees` for awareness | low |
| Recent activity (مرّ بـ entityIds I own) | للوعي | low |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تجميع personal items | `actionCenter.ts` GET `/` | aggregations per user | ✅ |
| فلترة per scope | يطبق `userId` ضمنياً | RBAC | ✅ |
| Bulk actions (approve all my) | aggregate POST | ⚠ تحقق |
| Mark-as-read | PATCH `/notifications/:id/read` | ✅ |
| Quick-link to "my-space" | راجع `my-space` | ✅ |
| تأثير على الـ Dashboard badge | unread count | راجع `misc/dashboard.md` | ✅ |
| Push notification | event=`action_required` | mobile push (إن مفعّل) | ⚠ |
| Audit log | على read-only لا تُسجَّل | ✅ |

تحقق يدوي:
- [ ] هل وقت تأخر الـ approval > N يوم يلوّن الـ row حمراء؟
- [ ] هل تفويض (delegate) موافقاتي عند الإجازة ممكن؟
- [ ] هل bulk actions تحترم approval_chain لكل entity (لا تتجاوزه)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `action-center` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/action-center`
- لقطة: `audit/screenshots/action_center.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
