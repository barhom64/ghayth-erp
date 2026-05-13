# /finance/commitments — `artifacts/ghayth-erp/src/pages/finance/commitments.tsx`

## 1. الميتاداتا
- المسار: `/finance/commitments`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/commitments.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:110`
- المجموعة: `finance`
- الكومبوننت: `Commitments`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `commitments`
- سطور الملف: 125
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/commitments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الالتزامات المالية (Commitments) — حجز ميزانية قبل الصرف الفعلي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل التزام عند PO | finance/purchase | تلقائي مع `POST /purchase-orders` | `commitments` row | ✅ |
| نوع الالتزام (PO/contract/lease) | finance | `commitments.type`, `referenceType+referenceId` | ✅ |
| **خصم من ميزانية القسم** | finance/budget | `budgets.committed += commitment.amount` | atomic | ✅ |
| تفريغ commitment عند الفاتورة الفعلية | finance | عند POST فاتورة شراء مرتبطة → `commitments.status='realized'` | يُخفض `committed`، يرفع `spent` | ⚠ تحقق |
| إلغاء التزام (إلغاء PO) | finance | PATCH `/commitments/:id/release` | `commitments.status='cancelled'` + يعكس `budgets.committed` | ✅ |
| سير موافقة (للالتزامات الكبيرة) | governance/workflows | `business_rules.commitment_approval_threshold` | `approval_chains` | ⚠ |
| تحذير عند تجاوز المتاح | comms | event=`commitment_exceeds_budget` | `notifications` | ⚠ |
| تقرير aging للالتزامات المفتوحة | finance/reports | aggregation per period | view | ✅ |
| ربط بـ cash flow forecast | finance/cashflow | commitments المستقبلية = expected outflow | راجع `finance-cashflow.md` | ✅ |
| Audit log | core | يقرأ من commitments وPOs (middleware عبر `/finance/purchase-orders`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل التزام مع PO ملغى يفرّغ آلياً بدون تدخّل يدوي؟
- [ ] هل تجاوز الميزانية بـ commitment لا realized بعد يطلق تنبيه قبل الـ realized؟
- [ ] هل aging > 90 يوم على commitment مفتوح يطلق مراجعة (هل لا يزال صالحاً)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `commitments` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/commitments`
- لقطة: `audit/screenshots/finance_commitments.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
