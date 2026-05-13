# /hr/loans/:id — `artifacts/ghayth-erp/src/pages/hr/loan-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/loans/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/loan-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:124`
- المجموعة: `hr`
- الكومبوننت: `LoanDetail`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 212
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل سلفة موظف واحدة — Loan detail + repayment schedule.

| الحالة | الوصف |
|--------|------|
| Pending | بانتظار الموافقة |
| Approved | موافق — قبل الصرف |
| Disbursed | صرفت — بدأ السداد |
| Active | يجري السداد |
| Paid in full | منتهي |
| Defaulted | لم تُسدد بعد الخروج |
| Cancelled | ملغية قبل الصرف |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View loan | GET `/hr/loans/:id` | `employee_loans` | ✅ |
| Repayment schedule | calculated | per installment | ✅ critical |
| Outstanding balance | live | المبلغ المتبقي | ✅ critical |
| Monthly deduction (via payroll) | راجع `hr-payroll.md` | recurring | ✅ critical |
| Early repayment (full or partial) | POST `/hr/loans/:id/repay` | راجع `finance-receipts.md` | ✅ |
| Skip month (مرضي/طارئ) | with approval | extend repayment | ⚠ |
| Restructure (change schedule) | with re-approval | راجع `governance/approvals.md` | ⚠ critical |
| GL entry — disbursement | Dr Loans Receivable / Cr Cash/Bank | ✅ critical |
| GL entry — monthly repayment | Dr Cash / Cr Loans Receivable | ✅ critical |
| Default handling on exit | deduct from gratuity | راجع `hr-exit.md` | ✅ critical |
| Statement export | راجع `print-templates` | ✅ |
| تكامل مع `hr-payroll.md` (monthly deduction) | ✅ critical |
| تكامل مع `hr-exit.md` (clearance) | ✅ critical |
| تكامل مع `finance-payments.md` (disbursement) | ✅ critical |
| تكامل مع `finance-receipts.md` (early repayment) | ✅ |
| تكامل مع `notifications.md` (deductions confirm) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| **PDPL** — confidential | financial data | ✅ |
| RBAC | hr + finance + employee (own only) | ✅ critical |

تحقق يدوي:
- [ ] هل outstanding balance دائماً sync مع GL?
- [ ] هل skip-month feature audited بدقة؟
- [ ] هل default على exit auto-deducts من gratuity بدون manual step?
- [ ] هل employee يستطيع رؤية own statement فقط (لا cross-access)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/loans → 401`
- landedUrl: `?`
- توصية: مغلق
