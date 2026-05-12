# /legal/sessions — `artifacts/ghayth-erp/src/pages/legal/sessions.tsx`

## 1. الميتاداتا
- المسار: `/legal/sessions`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal/sessions.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:19`
- المجموعة: `legal`
- الكومبوننت: `LegalSessions`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `sessions`
- سطور الملف: 65
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/legal/sessions/upcoming`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
جلسات المحاكم. تتبّع المواعيد + الحضور + المذكرات.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| جدولة جلسة | legal | POST `/sessions` | `court_sessions` | ✅ |
| ربط بقضية | legal | `session.caseId` → `legal_cases` | ✅ |
| تخصيص محامٍ | hr/employees | `session.lawyerId` → `employees.id` (role=lawyer) | ✅ |
| تذكير قبل الجلسة (24h/2h) | comms | cron + `notifications` | ✅ |
| تكامل calendar | misc/calendar | يظهر في التقويم الموحّد | راجع `misc/calendar.md` | ✅ |
| تسجيل ملاحظات الجلسة | legal | POST `/sessions/:id/notes` | `session_notes` | ✅ |
| رفع مذكرات (motions/briefs) | documents | `session_attachments[]` | object storage | ✅ |
| الحضور (attendance) | legal | record attended parties | `session_attendees` | ⚠ |
| نتيجة الجلسة (postponement/decision/...) | legal | `session.outcome` | يحدّد الجلسة القادمة أو إغلاق | ✅ |
| إذا حكم → ينشئ `judgments` | legal | راجع `legal-judgments.md` | ✅ |
| إذا تأجيل → جلسة جديدة | legal | تلقائي مع `nextSessionDate` | ✅ |
| أتعاب جلسة (لو خارجي) | finance/expenses | POST `/finance/expenses` | راجع `legal-cases.md` | ⚠ |
| إشعارات للأطراف | comms | event=`session_scheduled\|postponed\|completed` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` لـ `/legal` لو مضافة | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل الجلسة المنتهية بدون outcome محدّد تُمنع من الإغلاق؟
- [ ] هل الجلسات المتأخرة (overdue) تطلق تنبيه escalation للمدير القانوني؟
- [ ] هل التذكير قبل الجلسة بـ 24h يرسل عبر WhatsApp/SMS بالإضافة لـ in-app؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `sessions` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/sessions`
- لقطة: `audit/screenshots/legal_sessions.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
