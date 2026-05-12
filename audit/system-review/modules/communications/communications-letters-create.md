# /communications/letters/create — `artifacts/ghayth-erp/src/pages/create/communications/letters-create.tsx`

## 1. الميتاداتا
- المسار: `/communications/letters/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/communications/letters-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:13`
- المجموعة: `communications`
- الكومبوننت: `LettersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 133
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L65: "مسح المسودة" → `clearDraft`
- L126: "(بلا تسمية)" → `() => setLocation("/communications")` 🔒
- L127: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إنشاء خطاب رسمي جديد (للموظفين/الحكومة/جهات خارجية).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء خطاب من قالب | documents | POST `/documents/from-template/:id` | `documents.entityType='letter'` | ✅ |
| ترقيم تلقائي (registry) | communications | `letters_sequence` per company per year | ✅ |
| سير موافقة (3 طبقات للرسمي) | governance/workflows | `business_rules.letter_approval` | `approval_chains` | ✅ |
| توقيع رقمي | digital-signature | `digital_signatures.letterId` | ✅ |
| ربط بـ entity (موظف/شركة/مشروع) | متغيّر | `letters.entityType + entityId` polymorphic | ✅ |
| إرسال (email/print/registered mail) | comms | POST `/letters/:id/send` | `letter_deliveries` (with delivery method + recipient) | ⚠ |
| تتبّع التسليم | comms | للبريد المسجّل: tracking number | `letter_tracking_log` | ⚠ |
| ربط بـ correspondence | communications | راجع `correspondence.md` | ✅ |
| ربط بقضية قانونية | legal | `legal_cases.lettersIds` | ✅ |
| أرشفة بعد التسليم | documents | تلقائي post-send | ✅ |
| إشعارات (المُرسِل + المستلم + الجهة) | comms | event=`letter_drafted\|sent\|delivered\|acknowledged` | `notifications` | ✅ |
| تكامل بريد رسمي/ESS | gov-integrations | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/letters` لو مضاف) | `audit_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل خطاب رفض/توبيخ يخفي محتواه عن غير المعنيين تلقائياً؟
- [ ] هل سحب الخطاب بعد التوقيع يتطلب موافقة + يولّد retraction record؟
- [ ] هل التزام خط زمني (deadline) للرد على خطابات معيّنة محسوب آلياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/communications/letters/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/communications_letters_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
