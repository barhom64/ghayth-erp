# /legal/cases — `artifacts/ghayth-erp/src/pages/legal.tsx`

## 1. الميتاداتا
- المسار: `/legal/cases`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:24`
- المجموعة: `legal`
- الكومبوننت: `Legal`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `cases`
- سطور الملف: 396
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L104: "نسخ العقد"
- L150: "عقد جديد"
- L270: "قضية جديدة"

### القراءات (GET)
- GET `/legal/stats`
- GET `/legal/stats`
- GET `/legal/cases`
- GET `/legal/financial-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إدارة قضية قانونية. المرجع: `docs/blueprints/legal.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء قضية + ربط بالخصم | legal | `legal.ts` POST `/cases` | `legal_cases` | ✅ |
| توليد ملف قضية (مستندات) | documents | ربط بـ `documents.entityId='legal_case'` | `documents`, `documents_folders` | ✅ |
| تسجيل جلسات + تنبيهات | legal | `legal-sessions` + cron alerts | `court_sessions`, `notifications` | ✅ |
| تسجيل أتعاب محاماة → مصروف | finance/GL | POST `/cases/:id/fees` → `expenses` + قيد | `gl_entries` (DR Legal Fees / CR Cash) | ⚠ تحقق |
| تسجيل حكم/تسوية | legal | POST `/judgments` | `judgments`, `case_status='closed'` | ✅ |
| تأثير مالي للحكم (مطلوبات/مديونيات) | finance | إن حكم لصالح الشركة: AR; ضدها: liability | `gl_entries` (يدوي عادةً) | ⚠ غير آلي |
| سير موافقة (للتسويات الكبيرة) | governance/workflows | `business_rules.legal_settlement_approval` | `approval_chains` | ⚠ |
| تكامل ناجز/المحكمة (إن مفعّل) | gov-integrations | اختياري | `gov_submissions` | ⚠ غير افتراضي |
| إشعارات للمحامي/مدير العقود | comms | event=`hearing_upcoming\|judgment_issued` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`legal_cases`) | ✅ |

تحقق يدوي:
- [ ] هل تواريخ الجلسات في `court_sessions` تتزامن مع `calendar` العام؟
- [ ] هل المراسلات (`legal-correspondence`) مرتبطة بـ `correspondence` العام أم منفصلة؟
- [ ] هل القضايا المغلقة تُحفظ في أرشيف منفصل أم بنفس الجدول مع `status='closed'`؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `cases` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/cases`
- لقطة: `audit/screenshots/legal_cases.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
