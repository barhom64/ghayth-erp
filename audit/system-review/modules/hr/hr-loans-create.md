# /hr/loans/create — `artifacts/ghayth-erp/src/pages/create/hr/loans-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/loans/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/loans-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:123`
- المجموعة: `hr`
- الكومبوننت: `LoansCreate`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 236
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/loans` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L113: "مسح المسودة" → `clearDraft`
- L224: "(بلا تسمية)" 🔒
- L228: "(بلا تسمية)" → `() => setLocation("/hr/loans")`

### القراءات (GET)
- GET `/employees?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء سلفة موظف — interest-free per Saudi/Islamic finance practice typically.

| نوع السلفة | الوصف |
|----------|------|
| Personal | شخصية | up to X months salary |
| Emergency | طوارئ (مرض، وفاة) | with reduced approval |
| Education | تعليمية | for self/family |
| Wedding | زواج | one-time |
| Housing | إسكان | larger amount + longer term |
| Salary advance | على الراتب | repaid same month |

| الحقل | المتطلب |
|------|--------|
| Employee | FK | إجباري |
| Amount | within policy limits | إجباري |
| Purpose | reason | enum |
| Installment plan | monthly | over X months |
| Start month | when deduction begins | إجباري |
| Interest rate | typically 0% | per policy |
| Guarantor (لو required) | another employee | optional |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create loan request | POST `/hr/loans` | `employee_loans` (status=pending) | ✅ |
| Validate eligibility | tenure + previous loans + credit score | per policy | ✅ critical |
| Validate amount within limit | per employee tier | ✅ |
| Auto-calculate installment | amount / months | ✅ |
| Approval workflow | manager → HR → finance | راجع `governance/approvals.md` | ✅ critical |
| Disbursement (pay employee) | راجع `finance-payments.md` | with GL | ✅ critical |
| GL entry — loan to employee | Dr Loans Receivable / Cr Cash/Bank | ✅ critical |
| Schedule monthly deductions | راجع `hr-payroll.md` | recurring | ✅ critical |
| Per month deduction GL | Dr Cash (via payroll) / Cr Loans Receivable | ✅ critical |
| Outstanding loan balance | aggregate | tracking | ✅ |
| Early repayment | optional | راجع `finance-receipts.md` | ⚠ |
| Block on exit (clear loan first) | راجع `hr-exit.md` | ✅ critical |
| Loan default handling (لو exit بدون clearing) | راجع `hr-final-settlement.md` | deduct from gratuity | ✅ critical |
| Loan history per employee | راجع `hr-loans.md` | ✅ |
| Notification | event=`loan_approved/disbursed/deduction` | راجع `notifications.md` | ✅ |
| تكامل مع `hr-payroll.md` (deductions) | ✅ critical |
| تكامل مع `finance-payments.md` (disbursement) | ✅ critical |
| تكامل مع `hr-exit.md` (clearance) | ✅ critical |
| تكامل مع `governance/approvals.md` | multi-level | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | hr + finance approval | ✅ critical |

تحقق يدوي:
- [ ] هل eligibility policy clear (tenure ≥ X سنة، لا outstanding loans)؟
- [ ] هل approval thresholds واضحة per amount?
- [ ] هل النظام يمنع exit قبل clearing the loan?
- [ ] هل default على exit يخصم من gratuity تلقائياً؟
- [ ] هل early repayment allowed بدون penalty؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/loans/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_loans_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
