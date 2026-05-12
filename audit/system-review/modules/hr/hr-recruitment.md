# /hr/recruitment — `artifacts/ghayth-erp/src/pages/hr/recruitment.tsx`

## 1. الميتاداتا
- المسار: `/hr/recruitment`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/recruitment.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:116`
- المجموعة: `hr`
- الكومبوننت: `Recruitment`
- subKey: `recruitment` | minRoleLevel: —
- الكيان المستنبط: `recruitment`
- سطور الملف: 296
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/recruitment/postings`
- GET `/hr/recruitment/applications`
- GET `/hr/recruitment/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
التوظيف. من الإعلان إلى التعيين.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| نشر إعلان وظيفي | hr/recruitment | `recruitment.ts` POST `/postings` | `recruitment_postings` | ✅ |
| نشر على بوابة Careers الخارجية | careers-portal | `careersPortal.ts` يعرضها (read-only) | بوابة منفصلة | ✅ |
| استلام طلبات (applications) | hr/recruitment | POST `/applications` (من البوابة أو يدوي) | `recruitment_applications` | ✅ |
| فرز/تقييم | hr/recruitment | PATCH `/applications/:id/stage` | `application_stages` | ✅ |
| جدولة مقابلات | hr/recruitment | `application_interviews` | calendar integration | ⚠ |
| **تعيين (hire)** → موظف جديد | hr | عند `stage='hired'` → ينشئ `employees` + `employee_assignments` | ✅ موجود |
| توليد عقد عمل | documents | من template → `documents.entityType='employment_contract'` | ✅ |
| تأشير بدء دورة Onboarding | hr | ينشئ `hr_onboarding` row + tasks | ✅ |
| إشعارات (للمتقدم + HR) | comms | event=`application_received\|interview_scheduled\|hired\|rejected` | `notifications` | ✅ |
| تكامل قوى/مساند (Saudi labor portal) | gov-integrations | اختياري | `gov_submissions` | ⚠ |
| Audit log | core | `auditMiddleware` لـ `/hr/recruitment` (لو مضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل المتقدم المرفوض يحتفظ بسجله للمراجع المستقبلية أم يُحذف بعد فترة (PDPL)؟
- [ ] هل التعيين يتطلب موافقة من مدير القسم + HR قبل توليد العقد؟
- [ ] هل التحقق الأمني (background check) عقدة في الـ workflow أم اختيارية؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `recruitment` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/recruitment`
- لقطة: `audit/screenshots/hr_recruitment.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
