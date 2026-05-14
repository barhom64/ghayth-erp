# /hr/payroll/:id — `artifacts/ghayth-erp/src/pages/details/payroll-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/payroll/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/payroll-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:105`
- المجموعة: `hr`
- الكومبوننت: `PayrollDetail`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 368
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل مسير راتب واحد — Monthly payroll run detail.

| الحالة | الوصف |
|--------|------|
| Draft | قيد الإعداد |
| Calculated | الحساب تم |
| Pending review | بانتظار المراجعة (HR) |
| Pending approval | بانتظار CFO/director |
| Approved | معتمد جاهز للدفع |
| Paid (WPS submitted) | تم إرسال WPS |
| Closed | الشهر مقفل |
| Reversed | معكوس (rare) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View payroll run | GET `/hr/payroll/:id` | `payroll_runs` + `payroll_lines` | ✅ |
| Recalculate | POST `/hr/payroll/:id/recalc` | with reason | ✅ critical |
| Add adjustment (one-off) | with audit | ✅ critical |
| Remove employee | with reason + approval | ⚠ critical |
| Approve (multi-level) | manager → HR → CFO | راجع `governance/approvals.md` | ✅ critical |
| Reject | with reason | ✅ |
| Generate GL entries | Dr Salary Expense / Cr Bank / Cr GOSI Payable / Cr Loan Receivable | راجع `finance-payroll-posting.md` | ✅ critical |
| Generate WPS file (Mudad) | external | راجع `admin-integrations.md` | ✅ critical |
| Generate GOSI submission | external | راجع `admin-integrations.md` | ✅ critical |
| Submit WPS to bank | external | ✅ critical |
| Generate payslips (per employee) | راجع `my-payslip.md` | ✅ critical |
| Mark as paid (post-bank confirmation) | with timestamp | ✅ critical |
| Reverse (لو error post-payment) | extreme rare | with CFO approval | ⚠ critical |
| Audit log إجباري — extra detailed | every action | `audit_logs` | ✅ critical |
| تكامل مع `hr-attendance-reports.md` (input data) | ✅ critical |
| تكامل مع `hr-payroll-salary-components.md` (components) | ✅ critical |
| تكامل مع `hr-loans-byid.md` (deductions) | ✅ critical |
| تكامل مع `finance-payments.md` (bank disbursement) | ✅ critical |
| تكامل مع GOSI + Mudad/WPS | external | ✅ critical |
| تكامل مع `finance-gl-posting-queue.md` (GL posting) | ✅ critical |
| تكامل مع `governance-compliance.md` (regulatory) | ✅ critical |
| **PDPL** — extra sensitive data | masked + access logged | ✅ critical |
| RBAC | hr-manager + finance + CFO | ✅ critical |
| Lock once paid (immutable) | ✅ critical |

تحقق يدوي:
- [ ] هل calculation accurate per Saudi Labor Law (GOSI rates, OT multipliers)?
- [ ] هل multi-level approval enforced before WPS submission?
- [ ] هل WPS file format matches latest Mudad spec?
- [ ] هل reverse mechanism preserves audit trail (لا hide history)?
- [ ] هل locked runs truly immutable (except via documented reverse process)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/payroll → 401`
- landedUrl: `?`
- توصية: مغلق
