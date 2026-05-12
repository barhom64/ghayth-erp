# /finance/fiscal-periods — `artifacts/ghayth-erp/src/pages/finance/fiscal-periods.tsx`

## 1. الميتاداتا
- المسار: `/finance/fiscal-periods`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/fiscal-periods.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:117`
- المجموعة: `finance`
- الكومبوننت: `FiscalPeriods`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `fiscal-periods`
- سطور الملف: 164
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الفترات المالية. **حارس الإقفال** — يمنع التعديل على الماضي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء فترة مالية (شهرية/ربع سنوية) | finance | POST `/fiscal-periods` | `fiscal_periods` | ✅ |
| فتح فترة | finance | PATCH `/fiscal-periods/:id/open` | `status='open'` | ✅ |
| **إقفال فترة** (critical) | finance | PATCH `/fiscal-periods/:id/close` | `status='closed'` | ✅ |
| guard: منع قيود على فترة مغلقة | finance | `checkFinancialPeriodOpen` يُستدعى قبل كل insert في `gl_lines` | ✅ موجود في `businessHelpers.ts` |
| إعادة فتح (للتصحيحات) | finance | PATCH `/fiscal-periods/:id/reopen` (يحتاج موافقة CFO) | workflow | ✅ |
| ترحيل الأرصدة للفترة الجديدة | finance | `closingJournals` cron عند الإقفال | `gl_entries` (closing entries) | ⚠ تحقق |
| توليد القوائم المالية | finance/reports | يقرأ كل `gl_lines` ضمن الفترة | views | ✅ |
| إقفال FX revaluation | finance/fx | عند الإقفال → قيد `finance.fx.revalued` | راجع eventCatalog | ✅ |
| تأثير على ميزانية (period-based budgets) | finance/budget | aggregation per period | views | ✅ |
| إشعار للمدراء بالإقفال | comms | event=`finance.period.closed` (critical) | `notifications` | ✅ موجود في catalog |
| تكامل ZATCA (تقارير شهرية/ربعية) | finance-zatca | اختياري | ⚠ |
| Audit log + emit event | core | إجباري | `audit_logs`, `event_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل إعادة فتح فترة بعد القوائم المالية المعلنة تطلق تنبيه severe؟
- [ ] هل الـ guard يُفعّل على كل route ينشئ `gl_line` أم بعض فقط؟
- [ ] هل closing entries تُرحَّل تلقائياً للفترة التالية أم يدوي؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fiscal-periods` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/fiscal-periods`
- لقطة: `audit/screenshots/finance_fiscal_periods.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
