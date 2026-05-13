# /finance/tax — `artifacts/ghayth-erp/src/pages/finance/tax-system.tsx`

## 1. الميتاداتا
- المسار: `/finance/tax`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/tax-system.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:106`
- المجموعة: `finance`
- الكومبوننت: `TaxSystem`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tax`
- سطور الملف: 320
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L280: "(بلا تسمية)" → `() => refetchSubmissions()`

### القراءات (GET)
- GET `/finance/tax/declarations`
- GET `/finance/zatca/settings`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
نظام الضرائب (Tax System) — VAT (15%) + WHT + ZATCA Phase 2.

| النوع | المعدل (السعودية) | الحركة |
|------|-------------------|--------|
| VAT (output) | 15% على المبيعات | تُحجب في `gl_lines` (Credit VAT Payable) |
| VAT (input) | 15% على المشتريات (deductible) | `gl_lines` (Debit VAT Receivable) |
| WHT (5%) | الخدمات الفنية للأجانب غير المقيمين | يُخصم من الدفع للمورد |
| WHT (15%) | الرويالتي/أرباح | اعتمد على نوع الجهة |
| Customs duty | الاستيراد | يُضاف لتكلفة البضاعة |
| Zakat (2.5%) | للأرباح السنوية (شركات) | تقرير سنوي |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تكوين معدل ضريبي per category | `finance-tax.ts` | `tax_categories`, `tax_rates` | ✅ |
| تطبيق على فاتورة | تلقائي عند POST `/invoices` | راجع `finance-invoices.md` | ✅ |
| **إصدار e-invoice ZATCA Phase 2** | `finance-zatca.ts` + cryptographic signing | `zatca_documents.xml`, `uuid`, `qrCode` | ✅ موجود |
| Net WHT calculation عند vendor payment | تلقائي عند `vouchers` | يخصم WHT قبل الدفع | راجع `finance-vendors.md` | ⚠ تحقق |
| تقرير VAT شهري/ربعي | `finance-reports.ts` GET `/tax-vat-return` | aggregate VAT lines per period | ✅ |
| تقديم لـ ZATCA portal | gov-integrations | XML export | ⚠ يدوي عادةً |
| ZATCA compliance checks | finance-zatca | Phase 1 + Phase 2 requirements | ✅ |
| Zakat annual filing | finance/reports | تقرير سنوي | ⚠ |
| تأثير على الـ pricing | كل المنتجات/الخدمات تشمل VAT في final price | ✅ |
| Audit log إجباري | كل تعديل في معدل ضريبي | `audit_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل تغيير معدل VAT يطبق على الفواتير المفتوحة أم الجديدة فقط؟
- [ ] هل WHT للمقاولين السعوديين 0% vs غير السعوديين 5/15%؟
- [ ] هل ZATCA Phase 2 e-invoice يُصدَر تلقائياً عند POST فاتورة أو يحتاج action ثانٍ؟
- [ ] هل التقرير الشهري للـ VAT يلتقط reverse charges (للاستيراد)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tax` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/tax`
- لقطة: `audit/screenshots/finance_tax.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
