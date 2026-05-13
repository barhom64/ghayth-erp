# /finance/ar-aging — `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx`

## 1. الميتاداتا
- المسار: `/finance/ar-aging`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:121`
- المجموعة: `finance`
- الكومبوننت: `ArAging`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `ar-aging`
- سطور الملف: 175
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
AR Aging Report — يصنّف الفواتير غير المدفوعة حسب أيام التأخر.

| Bucket | المدى | الإجراء |
|--------|-------|---------|
| Current | 0-30 days | متابعة عادية |
| 30-60 | تأخر بسيط | reminder ودود |
| 60-90 | تأخر متوسط | reminder حازم + اتصال |
| 90-180 | تأخر طويل | credit hold + escalation |
| 180+ | متعثر | legal collection |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate per client/branch/period | `finance-reports.ts` GET `/ar-aging` | من `invoices` (paidAmount < total) | ✅ |
| Drill-down per client | راجع `finance-receivables.md` | ✅ |
| إرسال reminders (cron) | comms | per bucket | ✅ |
| Credit hold عند 60+ | crm | `clients.creditHold=true` | راجع `clients-byid.md` | ✅ |
| Provision for doubtful debts | finance/GL | aggregate × probability | ⚠ يدوي |
| Write-off | راجع `finance-receivables.md` | ⚠ |
| تأثير على cash flow forecast | راجع `finance-cash-flow-forecast.md` | ✅ |
| تقرير شهري للـ CFO | bi/exec-dashboard | ✅ |
| Audit log | read-only | ✅ |

تحقق يدوي:
- [ ] هل aging يحسب من `dueDate` أم `issueDate`؟
- [ ] هل المرتجعات تنعكس آلياً؟
- [ ] هل multi-currency aging موحّد أم منفصل؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `ar-aging` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/ar-aging`
- لقطة: `audit/screenshots/finance_ar_aging.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
