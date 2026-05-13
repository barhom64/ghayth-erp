# /finance/ap-aging — `artifacts/ghayth-erp/src/pages/finance/ap-aging.tsx`

## 1. الميتاداتا
- المسار: `/finance/ap-aging`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/ap-aging.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:122`
- المجموعة: `finance`
- الكومبوننت: `ApAging`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `ap-aging`
- سطور الملف: 165
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
AP Aging Report — الفواتير غير المدفوعة للموردين، حسب أيام التأخر.

| Bucket | المدى | الأولوية |
|--------|-------|---------|
| Current | 0-30 days | دفع طبيعي |
| 30-60 | due — pay this week | متوسطة |
| 60-90 | overdue — pay now | عالية |
| 90+ | متأخر جداً — risk to vendor | حرجة (قد يقطع التوريد) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate per vendor/branch/period | GET `/ap-aging` | من `vendors.balance` + invoices | ✅ |
| Drill-down per vendor | راجع `finance-vendors.md` | ✅ |
| Payment plan (للمبالغ الكبيرة) | finance | scheduled payments | ⚠ |
| Bulk payment (نهاية اليوم) | finance | aggregate `vouchers` per vendor | ✅ |
| Cash flow impact | راجع `finance-cash-flow-forecast.md` | upcoming outflow | ✅ |
| Vendor relationship risk | crm-like | كثرة التأخر تخفض rating | ⚠ |
| Early payment discount (2/10 net 30) | finance | اقتراح | ⚠ |
| Late fees من المورد | finance/expenses | لو المورد يفرضها | ⚠ |
| تقرير شهري للـ CFO | bi/exec-dashboard | DPO calculation | ✅ |
| Audit log | read-only | ✅ |

تحقق يدوي:
- [ ] هل تأخّر مستمر مع مورد واحد يطلق تنبيه supply-risk؟
- [ ] هل توصيات الـ early payment discount محسوبة آلياً؟
- [ ] هل WHT يُخصم تلقائياً قبل aggregate الدفع؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `ap-aging` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/ap-aging`
- لقطة: `audit/screenshots/finance_ap_aging.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
