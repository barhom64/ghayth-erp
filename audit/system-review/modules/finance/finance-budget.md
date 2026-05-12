# /finance/budget — `artifacts/ghayth-erp/src/pages/finance/budget.tsx`

## 1. الميتاداتا
- المسار: `/finance/budget`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/budget.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:96`
- المجموعة: `finance`
- الكومبوننت: `Budget`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `budget`
- سطور الملف: 152
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L103: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الميزانية المخططة + التتبّع الفعلي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء ميزانية سنوية | finance/budget | `finance-budget.ts` POST `/budget` | `budgets` (per accountCode × period) | ✅ |
| سير موافقة (للمبالغ الكبيرة) | governance/workflows | يحتاج CFO + MD | `approval_chains` | ✅ |
| commitment عند POs | finance/purchase | `budgets.committed += po.total` | atomic update | ✅ |
| **استهلاك فعلي** عند صرف فاتورة/مصروف | finance | `budgets.spent += expense.amount` | trigger من `gl_lines` post | ✅ |
| **تنبيه عند تجاوز 80%** | comms | event=`finance.budget.exceeded` (موجود في eventCatalog) | `notifications` | ✅ critical |
| منع/تحذير على تجاوز 100% | governance/policy | حسب `business_rules.budget_hard_limit` | يُرفض أو يحتاج موافقة | ⚠ تحقق |
| إعادة توزيع (reallocation) | finance/budget | PATCH `/budget/:id/reallocate` | `budget_reallocations` log | ✅ |
| تقرير variance (مخطط vs فعلي) | finance/reports | aggregation | views | ✅ |
| تكامل مع payroll + recurring | hr/payroll + finance/recurring | كل النفقات تُخصم تلقائياً | aggregate | ✅ |
| Audit log | core | `auditMiddleware` (`/finance/budget` لو مضاف) | `audit_logs` | ⚠ تحقق |
| إغلاق ميزانية الفترة + توليد report | finance/period-close | `finance.period.closed` event | `event_logs` | ✅ |

تحقق يدوي:
- [ ] هل ترحيل المتبقي من سنة لأخرى مدعوم (rollover)؟
- [ ] هل ميزانية القسم تنتقل تلقائياً عند نقل موظف من قسم لآخر؟
- [ ] هل توجد لوحة لمدير القسم تعرض ميزانيته الحية فقط (ليس كل النظام)؟

## 4. النمذجة
- الجدول: `budgets` (export: `budgets`, 8 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: — | lifecycle col: —
- FKs: companies.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/budget`
- لقطة: `audit/screenshots/finance_budget.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
