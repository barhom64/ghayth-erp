# /finance/recurring-journals — `artifacts/ghayth-erp/src/pages/finance/recurring-journals.tsx`

## 1. الميتاداتا
- المسار: `/finance/recurring-journals`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/recurring-journals.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:142`
- المجموعة: `finance`
- الكومبوننت: `RecurringJournals`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `recurring-journals`
- سطور الملف: 272
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
القيود المتكررة (Recurring Journals). الإيجارات، الإهلاكات، Accruals...

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء قالب قيد متكرر | finance/recurring | POST `/recurring-journals` | `recurring_journals` | ✅ |
| التكرار (شهري/ربعي/سنوي/يومي) | finance | `frequency`, `nextRunDate` | ✅ |
| تنفيذ تلقائي عبر cron | finance | scheduled-reports/cron-jobs cron يُشغّل الـ recurring | ينشئ `gl_entries` جديد كل دورة | ✅ |
| تنفيذ يدوي ("تنفيذ الآن") | finance | POST `/recurring-journals/:id/run` | راجع `finance/recurring-journals.tsx:158` | ✅ |
| تعطيل/تفعيل | finance | PATCH `/recurring-journals/:id/toggle` | `active` boolean | ✅ |
| **التأثير المحاسبي** | finance/GL | كل تشغيل ينشئ `journal_entries` + `gl_lines` كاملاً | ✅ |
| ربط بـ fiscal period check | finance | لو الفترة مغلقة، يُولّد `posting_failure` بدلاً من القيد | ✅ |
| سير موافقة (للمبالغ الكبيرة) | governance/workflows | اختياري | ⚠ |
| تقرير الـ recurring المعطّلة | finance/reports | aggregation | view | ✅ |
| إشعارات (الـ Finance Manager) | comms | event=`recurring_journal_executed\|failed\|expiring` | `notifications` | ⚠ |
| Audit log | core | كل تشغيل يُسجَّل عبر `auditMiddleware` (لو path مُضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل قيد متكرر في فترة مغلقة يُؤجَّل تلقائياً للفترة التالية أم يفشل نهائياً؟
- [ ] هل تغيير القالب بعد عدة تنفيذات يحافظ على history التنفيذات السابقة؟
- [ ] هل توجد حماية ضد التشغيل المزدوج (idempotency) في نفس اليوم؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `recurring-journals` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/recurring-journals`
- لقطة: `audit/screenshots/finance_recurring_journals.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
