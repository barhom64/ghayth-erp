# /hr/payroll — `artifacts/ghayth-erp/src/pages/hr/payroll.tsx`

## 1. الميتاداتا
- المسار: `/hr/payroll`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/payroll.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:102`
- المجموعة: `hr`
- الكومبوننت: `Payroll`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `payroll`
- سطور الملف: 173
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L101: "(بلا تسمية)" → `(e) => { e.stopPropagation(); setSelectedRun(p.id);`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تشغيل مسير رواتب — هي العملية الأكثر تشعّباً في النظام. المرجع: `docs/blueprints/hr-payroll.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تجميع الحضور للفترة | hr/attendance | يقرأ `attendance` لكل موظف في الفترة | aggregation فقط | ✅ |
| تجميع OT / تأخير / غياب | hr | `hr-overtime.ts` + `attendance.lateMinutes` | يُحسب في `payroll_lines` | ✅ |
| تطبيق `salary_components` | hr | قراءة `salary_components` (basic, allowances, deductions) | `payroll_lines.components` | ✅ |
| خصم سلف موظفين | hr/loans | `hr-loans.ts` يخصم القسط الشهري | `hr_loan_installments.paidAt` يُحدّث | ✅ |
| استقطاع GOSI (التأمينات) | hr | حساب نسبة من `basicSalary` | `payroll_lines` (deduction GOSI) | ⚠ تحقق من النسب |
| استقطاع ضريبة (إن ينطبق) | hr | حسب الجنسية والعقد | `payroll_lines` (tax) | ⚠ |
| **قيد محاسبي شامل** | finance/GL | DR Salaries Expense / CR Cash / CR GOSI Payable / CR Loan Receivable | `gl_entries`, `gl_lines` (ذرّي) | ✅ متوقع — تحقق من `accounting-engine` |
| تصدير WPS (نظام حماية الأجور) | saudi-compliance/wps | `saudi-compliance/wps/formats` → ينشئ ملف SIF/CSV | `wps_submissions` | ✅ موجود في `lib/saudi-compliance/wps` |
| إرسال Mudad (إن مفعّل) | gov-integrations | `lib/saudi-compliance/mudad` | `mudad_submissions` | ⚠ اختياري |
| إشعار للموظفين بصدور الراتب | comms | event=`payroll_issued` | `notifications` (actionUrl=`/my-payslip`) | ✅ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`payroll_runs`) | ✅ |

تحقق يدوي حرج:
- [ ] هل تشغيل المسير ذرّي بالكامل؟ في حالة فشل GL، هل يُلغى المسير أم يبقى في حالة `pending_posting`؟
- [ ] هل تشغيل مسير ثانٍ على نفس الفترة يكشف الازدواجية ويُمنع؟
- [ ] هل تعديل/إلغاء مسير مدفوع يولّد قيد عكسي + إشعار للموظفين؟
- [ ] هل WPS export يتزامن مع تاريخ القيد المحاسبي أم يصدر منفصلاً؟
- [ ] هل المسير يقفل تلقائياً عند نهاية الفترة (cron) أم يبقى مفتوحاً يدوياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `payroll` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/payroll`
- لقطة: `audit/screenshots/hr_payroll.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
