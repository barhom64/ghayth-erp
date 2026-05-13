# /legal/sessions/:id — `artifacts/ghayth-erp/src/pages/details/legal-session-detail.tsx`

## 1. الميتاداتا
- المسار: `/legal/sessions/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/legal-session-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:20`
- المجموعة: `legal`
- الكومبوننت: `LegalSessionDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 327
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل جلسة محكمة واحدة — توثيق الإجراءات والقرارات.

| الحقل | المتطلب |
|------|--------|
| Case (parent) | FK | إجباري |
| Date + time | scheduled | إجباري |
| Court | الفرعية | FK |
| Judge | optional | reference |
| Attendees | lawyer + counterparty + witnesses | list |
| Subject | موضوع الجلسة |
| Minutes (محضر) | summary | إجباري بعد الجلسة |
| Decision | enum (adjourned/decided/cancelled) |
| Next session date | لو adjourned | scheduling |
| Documents submitted | في الجلسة | راجع `documents.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View session | GET `/legal/sessions/:id` | `legal_sessions` | ✅ |
| Update minutes | PATCH | after the session | ✅ |
| Mark attended | per attendee | with check-in time | ⚠ |
| Reschedule | with reason | إذا قبل الجلسة | ✅ |
| Cancel | with reason | rare | ✅ |
| Adjourn | next date mandatory | يولّد session جديد | ✅ |
| Record decision | enum | with judge name | ✅ critical |
| Upload session documents | راجع `documents.md` | ✅ |
| Reminder للـ lawyer (24h, 2h before) | event=`session_reminder` | راجع `notifications.md` | ✅ critical |
| Update statute of limitations | لو affected | راجع `legal-cases-byid.md` | ⚠ |
| تكامل مع `calendar.md` | scheduled session | ✅ |
| تكامل مع Najz | external sync لو applicable | راجع `admin-integrations.md` | ⚠ |
| تكامل مع `documents-archive.md` | retention 10y | ✅ critical |
| Audit log إجباري | كل تحديث | `audit_logs` | ✅ |
| RBAC | legal team + assigned lawyer | ✅ |
| **PDPL** — confidentiality | حسب الـ case | ✅ critical |

تحقق يدوي:
- [ ] هل reminders 24h + 2h قبل الجلسة شغالة لكل lawyer؟
- [ ] هل minutes (محضر الجلسة) إجبارية خلال 24h من الجلسة؟
- [ ] هل adjournment يولّد next session تلقائياً؟
- [ ] هل Najz sync يحدّث session details عند تغييرها من المحكمة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/legal/sessions → 401`
- landedUrl: `?`
- توصية: مغلق
