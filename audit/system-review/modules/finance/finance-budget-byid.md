# /finance/budget/:id — `artifacts/ghayth-erp/src/pages/details/budget-detail.tsx`

## 1. الميتاداتا
- المسار: `/finance/budget/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/budget-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:98`
- المجموعة: `finance`
- الكومبوننت: `BudgetDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 329
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/budget`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل ميزانية واحدة — annual/quarterly budget with monthly breakdown.

| الحالة | الوصف |
|--------|------|
| Draft | قيد الإعداد | editable |
| Submitted | للـ approval | locked from edit |
| Approved | active | comparisons enabled |
| Revised | تعديل بعد approval | new version |
| Closed | end of period | snapshot |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View budget details | GET `/finance/budget/:id` | `budgets` + `budget_lines` | ✅ |
| Lines per account per period | per month per cost center | ✅ |
| Approval workflow | راجع `governance/approvals.md` | multi-level | ✅ |
| Approve | POST `/budget/:id/approve` | lifecycle | ✅ |
| Revise (إنشاء نسخة جديدة) | POST `/budget/:id/revise` | with audit + reason | ✅ critical |
| Allocate per branch/department | breakdown | per `cost_centers` | ✅ |
| Actual vs Budget comparison | real-time | aggregate `gl_entries` | ✅ critical |
| Variance analysis | with explanation per line | requires manager | ⚠ |
| Encumbrance (commitments) | حجز من POs المعتمدة | راجع `finance-purchase-orders.md` | ⚠ |
| Block over-budget transactions | configurable | hard block أو warning | ✅ critical |
| Carry forward unused | end-of-year | per policy | ⚠ |
| Budget transfer (بين أقسام) | with approval | inter-department | ⚠ |
| تكامل مع `finance-expenses.md` | check before posting | ✅ |
| تكامل مع `finance-purchase-orders.md` | encumbrance | ✅ |
| تكامل مع `bi-kpis.md` (budget vs actual KPI) | ✅ |
| تكامل مع `finance-reports.md` (variance report) | ✅ |
| Notification on threshold (80%, 90%, 100% usage) | event=`budget_threshold_reached` | راجع `notifications.md` | ✅ critical |
| Audit log إجباري | كل تعديل/revise/transfer | `audit_logs` | ✅ critical |
| RBAC | finance manager + department head | per scope | ✅ |

تحقق يدوي:
- [ ] هل over-budget hard block أم warning + override (مع audit)؟
- [ ] هل actuals تأخذ posted GL entries فقط (لا drafts)؟
- [ ] هل revise يحافظ على original budget version؟
- [ ] هل threshold notifications مرسلة لـ department head + finance؟
- [ ] هل budget transfer بين أقسام يتطلب dual approval (sender + receiver department heads)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no row in /api/finance/budget`
- landedUrl: `?`
- توصية: مغلق
