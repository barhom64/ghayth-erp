# /finance/financial-requests — `artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx`

## 1. الميتاداتا
- المسار: `/finance/financial-requests`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:112`
- المجموعة: `finance`
- الكومبوننت: `FinancialRequests`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `financial-requests`
- سطور الملف: 132
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/financial-requests`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الطلبات المالية (Financial Requests) — مظلّة عامة لكل طلب يحتاج صرف مالي.

| النوع | المثال | الإحالة |
|------|--------|---------|
| Cash advance | عهدة طارئة للموظف | راجع `finance-custodies.md` |
| Petty cash request | شراء صغير | finance/expenses |
| Salary advance | سلفة على الراتب | راجع `finance-salary-advances.md` |
| Vendor prepayment | دفعة مقدّمة لمورد | finance/vendors |
| Reimbursement | استرداد نفقات شخصية | finance/expenses |
| Inter-company transfer | راجع `finance-intercompany.md` |
| Emergency fund | احتياطي عاجل | manual workflow |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تقديم الطلب | POST `/financial-requests` | `financial_requests` | ✅ |
| سير موافقة (per type threshold) | governance/workflows | راجع `business_rules` | ✅ |
| Convert إلى entity مناسب (مصروف/عهدة/...) | متغيّر | عند الاعتماد → يولّد الـ entity النهائي | ⚠ تحقق |
| **قيد محاسبي** عند الصرف | finance/GL | متغيّر حسب النوع | راجع كل entity في الجدول | ✅ |
| تذكير بـ السداد (للسلف) | comms | cron | راجع `notifications` | ✅ |
| تتبّع SLA | requests | عبر workflow | ✅ |
| Audit log إجباري | core | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل الطلب المُعتمد ولم يُصرف لـ X أيام يُلغى تلقائياً؟
- [ ] هل تصنيف الطلب الخاطئ (cash advance بدل salary advance) يطلق تنبيه؟
- [ ] هل العميل/الموظف نفسه له طلب مفتوح يمنع طلباً ثانياً (دvalidation)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `financial-requests` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/financial-requests`
- لقطة: `audit/screenshots/finance_financial_requests.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
