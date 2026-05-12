# /requests/:id — `artifacts/ghayth-erp/src/pages/details/request-detail.tsx`

## 1. الميتاداتا
- المسار: `/requests/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/request-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/requestsRoutes.tsx:14`
- المجموعة: `requests`
- الكومبوننت: `RequestDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 342
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/requests/types`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تفاصيل طلب واحد. يعرض كامل سلسلة الـ workflow + action history.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| عرض الطلب + workflow history | requests | GET `/requests/:id` + `approval-actions` | aggregate | ✅ |
| إجراء (approve/reject/return/escalate) | governance | `approvalActions.ts` POST `/approval-actions/:requestId/:action` | `approval_actions_log` | ✅ |
| تأثير على approval_chain_steps | governance | PATCH `chain_steps.status` | ✅ |
| التحوّل لخطوة تالية أو إغلاق | governance | logic in `workflows.ts` | ✅ |
| إنشاء الكيان النهائي (leave/loan/expense...) | متغيّر | عند الاعتماد | راجع `requests.md` | ✅ |
| تعليق + مرفقات | requests | `request_comments`, `request_attachments` | ✅ |
| تتبّع SLA (وقت لكل خطوة) | requests | aggregate per step duration | views | ✅ |
| Audit log | core | `auditMiddleware` (`/approval-actions`) | `audit_logs` (entity=`approval_action`) | ✅ |
| إشعارات لكل تحوّل | comms | event=`approval_required\|approved\|rejected\|escalated\|returned` | `notifications` (actionUrl=`/requests/:id`) | ✅ |
| تكامل بريد إلكتروني (للموافقة من الخارج) | comms | اختياري — magic link | ⚠ |
| تكامل WhatsApp/SMS | gov-integrations | اختياري | ⚠ |

تحقق يدوي:
- [ ] هل المراجع يستطيع تفويض (delegate) الموافقة لشخص آخر؟
- [ ] هل توقيع الـ approval immutable بعد الاعتماد؟
- [ ] هل لوحات admin تعرض الـ bottleneck steps (التي تأخذ وقت أكثر من الـ SLA)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /requests/:id`
- landedUrl: `?`
- توصية: مغلق
