# /finance/receivables — `artifacts/ghayth-erp/src/pages/finance/receivables.tsx`

## 1. الميتاداتا
- المسار: `/finance/receivables`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/receivables.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:107`
- المجموعة: `finance`
- الكومبوننت: `Receivables`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `receivables`
- سطور الملف: 153
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L81: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الذمم المدينة (AR). كشف الفواتير المستحقة + aging.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| عرض كشف العميل | finance/collection | GET `/receivables` | aggregation من `invoices` | ✅ |
| AR Aging buckets (0-30/31-60/61-90/90+) | finance | محسوب من `invoices.dueDate` | view محسوب | ✅ |
| إرسال تذكير دفع | comms | POST `/collection/reminders/:invoiceId` | `notifications` (للعميل) | ✅ |
| تصاعد التذكير (escalation) | comms | cron يقرأ aging + يطلق متسلسل | `collection_reminders_log` | ✅ |
| تسجيل دفعة → سند قبض | finance | POST `/collection/payments` (راجع `finance-payments.md`) | `vouchers`, `voucher_allocations` | ✅ |
| تحصيل ديون متعثرة (write-off) | finance/GL | POST `/receivables/:id/write-off` | DR Bad Debt Expense / CR AR | ⚠ تحقق |
| إحالة قانونية (legal escalation) | legal | عند aging > 180 يوم → ينشئ `legal_cases` row | ✅ |
| تقييم الائتمان (credit score) | crm | يُحدّث `clients.creditRating` بناءً على سلوك الدفع | ⚠ يدوي عادةً |
| تجميد العميل (credit hold) | crm | عند aging > حد → `clients.creditHold=true` يمنع أوامر بيع جديدة | ⚠ تحقق |
| إشعار للمالية اليومي (collection sheet) | comms | cron daily | `notifications` | ✅ |
| Audit log | core | يقرأ من `invoices` (middleware) | ✅ |

تحقق يدوي:
- [ ] هل aging يحسب من `dueDate` أم `issueDate`؟ (الفرق مهم لـ tax)
- [ ] هل write-off يحتاج موافقة CFO؟ (workflow)
- [ ] هل عميل multi-currency له aging موحّد أم منفصل لكل عملة؟
- [ ] هل المرتجعات تنعكس آلياً على AR (تخفض المستحقات)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `receivables` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/receivables`
- لقطة: `audit/screenshots/finance_receivables.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
