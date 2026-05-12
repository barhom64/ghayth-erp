# /correspondence — `artifacts/ghayth-erp/src/pages/comms/correspondence.tsx`

## 1. الميتاداتا
- المسار: `/correspondence`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/comms/correspondence.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:14`
- المجموعة: `communications`
- الكومبوننت: `Correspondence`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `correspondence`
- سطور الملف: 229
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L163: "(بلا تسمية)"

### القراءات (GET)
- GET `/correspondence/stats/summary`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
المراسلات الرسمية (incoming/outgoing letters).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل مراسلة واردة | communications | `correspondence.ts` POST `/correspondence` | `correspondence`, `correspondence_attachments` | ✅ |
| إصدار مراسلة صادرة | communications | POST `/correspondence` مع `direction='outgoing'` | يولّد رقم تسجيل (registry number) | ✅ |
| ربط بـ entity (موظف/قضية/عقد) | متغيّر | `correspondence.entityType/Id` polymorphic | ✅ |
| توليد من قالب (template) | documents | POST `/documents/from-template/:id` ينشئ correspondence row | `documents.linkedEntityType='correspondence'` | ✅ |
| توقيع رقمي (إن مطلوب) | digital-signature | `digital-signature.ts` | `digital_signatures` | ✅ |
| إسناد للمراجعين | hr/employees | `correspondence.assignedReviewers` | لمساعدة workflow | ✅ |
| سير موافقة قبل الإرسال | governance/workflows | للمراسلات الرسمية الصادرة | `approval_chains` | ✅ |
| توزيع داخلي (routing) | comms | `correspondence_routes` (سلسلة مكاتب) | ✅ |
| أرشفة | documents | عند الإغلاق → `documents.entityType='correspondence_archive'` | ✅ |
| ربط قانوني (للقضايا) | legal | `legal_cases.correspondenceIds` | ✅ |
| إشعارات (للمستلم + المرسل) | comms | event=`letter_received\|forwarded\|replied\|approved` | `notifications` | ✅ |
| تكامل بريد رسمي (إن مفعّل) | gov-integrations | SMTP أو portal حكومي | `gov_submissions` | ⚠ |
| Audit log | core | `auditMiddleware` (`/communications`) | `audit_logs` (entity=`communication`) | ✅ |

تحقق يدوي:
- [ ] هل رقم تسجيل المراسلة فريد على مستوى الشركة + السنة (sequence)؟
- [ ] هل المراسلة المسحوبة بعد الإرسال تنشئ entry جديدة "retraction" بدلاً من تعديل القديمة؟
- [ ] هل المراسلات المنتهية صلاحيتها (>X سنة) تنتقل لأرشيف cold storage؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `correspondence` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/correspondence`
- لقطة: `audit/screenshots/correspondence.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
