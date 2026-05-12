# /legal/judgments — `artifacts/ghayth-erp/src/pages/legal/judgments.tsx`

## 1. الميتاداتا
- المسار: `/legal/judgments`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal/judgments.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:21`
- المجموعة: `legal`
- الكومبوننت: `LegalJudgments`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `judgments`
- سطور الملف: 73
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/legal/judgments/financial-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الأحكام القضائية (Judgments). إغلاق رسمي للقضية + تأثير مالي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل حكم | legal | POST `/judgments` | `judgments` (linked to case) | ✅ |
| النتيجة (لصالحنا/ضدنا/تسوية) | legal | `judgment.outcome`, `awardAmount` | يحدد التأثير المالي | ✅ |
| إغلاق القضية تلقائياً | legal | `legal_cases.status='closed'` + `closedAt` | atomic مع insert judgment | ✅ |
| **قيد محاسبي للحكم** | finance/GL | متغير حسب النتيجة | `gl_entries` | ⚠ يدوي عادةً |
| للمكسب: | finance | DR AR (legal recovery) / CR Income | اعتراف بالربح | ✅ |
| للخسارة: | finance | DR Loss-Litigation / CR AP (court judgment) | provision/payable | ✅ |
| لتسوية: | finance | DR Settlement Cost / CR Cash | عند الصرف | ✅ |
| استئناف (appeal) | legal | POST `/judgments/:id/appeal` → ينشئ سجل appeal | يُبقي القضية مفتوحة | ✅ |
| تنفيذ الحكم (execution) | legal | متابعة `enforcement` (لو لم يُسدَّد طوعاً) | `judgment_enforcement` | ⚠ |
| ربط بـ ناجز (الحكومة) | gov-integrations | اختياري — رقم الحكم في النظام الرسمي | `gov_submissions` | ⚠ |
| توليد شهادة الحكم (مستند) | documents | template legal_judgment | ✅ |
| إشعارات (المحامي + الإدارة + finance) | comms | event=`judgment_issued\|appeal_filed\|executed` | `notifications` | ✅ |
| تأثير على الـ AR Aging (إن مدين قضائي) | finance/ar-aging | الحكم يحوّل الفاتورة لـ legal-collection | ⚠ |
| Audit log | core | يجب أن يكون إجبارياً للقرارات القضائية | `audit_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل الحكم النهائي immutable بعد التسجيل (لا يمكن تعديل award amount)؟
- [ ] هل provision للخسائر المحتملة موجود قبل الحكم (محاسبة IFRS)؟
- [ ] هل تسوية ودية تحتاج موافقة CEO قبل التسجيل؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `judgments` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/judgments`
- لقطة: `audit/screenshots/legal_judgments.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
