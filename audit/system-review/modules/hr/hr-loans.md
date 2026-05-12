# /hr/loans — `artifacts/ghayth-erp/src/pages/hr/loans.tsx`

## 1. الميتاداتا
- المسار: `/hr/loans`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/loans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:122`
- المجموعة: `hr`
- الكومبوننت: `Loans`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `loans`
- سطور الملف: 333
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
سلف موظفين. المرجع: `docs/blueprints/hr-payroll.md` §"Loans".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| طلب سلفة | hr/loans | `hr-loans.ts` POST `/hr/loans` | `hr_loans` | ✅ |
| سير موافقة | governance/workflows | `business_rules.loan_approval_chain` | `approval_chains` | ✅ |
| توليد جدول الأقساط | hr/loans | تلقائي عند الاعتماد | `hr_loan_installments` (N صف بمبلغ ثابت) | ✅ |
| صرف السلفة → قيد محاسبي | finance/GL | DR Employee Loans Receivable / CR Cash | `gl_entries`, `gl_lines` | ✅ متوقع |
| خصم القسط الشهري في مسير الراتب | hr/payroll | `payroll_lines.loanDeduction` = الأقساط المستحقة | تحديث `hr_loan_installments.paidAt` | ✅ موجود |
| إقفال السلفة (paid in full) | hr/loans | تلقائي عند آخر قسط | `hr_loans.status='closed'` | ✅ |
| إعادة جدولة (reschedule) | hr/loans | PATCH `/hr/loans/:id/reschedule` | `hr_loan_installments` تُعاد بناءً | ⚠ تحقق |
| سداد مبكر | hr/loans | POST `/hr/loans/:id/early-payment` | يطفئ كل الأقساط المتبقية + قيد | ⚠ |
| إشعارات للموظف + HR | comms | event=`loan_approved\|installment_due\|loan_closed` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` لـ `/hr/loans` (إن مضافة) | `audit_logs` | ⚠ تحقق من ENTITY_MAP |

تحقق يدوي:
- [ ] هل المبلغ المتبقي على الموظف يُخصم من مستحقات نهاية الخدمة عند الاستقالة؟
- [ ] هل سلفة جديدة تُمنع إذا كانت سلفة سابقة لم تُسدّد؟
- [ ] هل توجد قيود على نسبة الخصم الشهري (مثلاً ≤ 33% من الراتب)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `loans` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/loans`
- لقطة: `audit/screenshots/hr_loans.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
