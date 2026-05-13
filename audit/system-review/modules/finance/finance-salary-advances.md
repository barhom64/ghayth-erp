# /finance/salary-advances — `artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx`

## 1. الميتاداتا
- المسار: `/finance/salary-advances`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:118`
- المجموعة: `finance`
- الكومبوننت: `SalaryAdvances`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `salary-advances`
- سطور الملف: 286
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L256: "إلغاء" → `onDone`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
السلف على الراتب (Salary Advances) — تختلف عن `hr-loans.md`:
- **Salary advance**: دفعة من راتب نفس الشهر، يُخصم بالكامل في payroll القادم
- **Loan**: قرض متعدد الأقساط

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| طلب سلفة راتب | POST `/finance/salary-advances` | `salary_advances` (entity مضاف لـ ENTITY_MAP) | ✅ |
| Limit check (max 50% of basic) | finance | guard في validation | ⚠ تحقق |
| سير موافقة (per amount threshold) | governance/workflows | عادة direct manager + HR | `approval_chains` | ✅ |
| **قيد محاسبي عند الصرف** | finance/GL | DR Salary Advance Receivable / CR Cash | `gl_entries` | ✅ |
| الخصم في مسير الراتب التالي | hr/payroll | `payroll_lines.salaryAdvanceDeduction` | full deduction | راجع `hr-payroll.md` | ✅ |
| **قيد عكسي** عند الخصم | finance/GL | DR Salary Expense / CR Salary Advance Receivable | يحدث ضمن قيد الـ payroll | ⚠ تحقق |
| سلفة بدون استرداد (للحالات الخاصة) | finance | يحتاج موافقة CFO + يُسجَّل كـ bonus | ⚠ |
| تأثير على رصيد الموظف للسلف | finance/custodies-like | aggregate | ⚠ |
| Audit log | core | `auditMiddleware` (`/finance/salary-advances`) | ✅ موجود في ENTITY_MAP |
| إشعار للـ Finance Manager + HR | comms | event=`salary_advance_approved` | `notifications` | ✅ |

تحقق يدوي:
- [ ] هل سلفة جديدة قبل خصم السابقة محظورة؟
- [ ] هل غير المسددة عند الاستقالة تُخصم من gratuity تلقائياً؟
- [ ] هل الفرق بين advance و loan واضح في الـ UX للمستخدم؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `salary-advances` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/salary-advances`
- لقطة: `audit/screenshots/finance_salary_advances.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
