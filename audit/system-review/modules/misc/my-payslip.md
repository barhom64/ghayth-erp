# /my-payslip — `artifacts/ghayth-erp/src/pages/my-payslip.tsx`

## 1. الميتاداتا
- المسار: `/my-payslip`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-payslip.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:68`
- المجموعة: `misc`
- الكومبوننت: `MyPayslip`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-payslip`
- سطور الملف: 124
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L33: "(بلا تسمية)" → `() => window.print()`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

كشف راتبي — Self-service payslip view.

| المعروض | التفصيل |
|---------|--------|
| Earnings | basic + allowances + overtime + bonuses |
| Deductions | GOSI + loans + violations + custodies |
| Gross | total earnings |
| Net | gross - deductions |
| Bank info (last 4 digits) | masked |
| Payment status | paid/pending |
| Payment date | from `hr-payroll.md` |
| YTD totals | cumulative |
| Tax filing assistance (if applicable) | annual statement |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View current month | GET `/my-space/payslip/current` | from `payroll_lines` | ✅ |
| Historical payslips | GET `/my-space/payslip/history` | last 12-24 months | ✅ |
| Download PDF | per month | راجع `print-templates` | ✅ |
| Annual summary | YTD | راجع `bi-reports.md` | ✅ |
| Dispute (لو error suspected) | POST `/my-space/payslip/dispute` | راجع `hr-grievance.md` | ⚠ |
| Notification on payslip available | event=`payslip_available` | راجع `notifications.md` | ✅ |
| تكامل مع `hr-payroll.md` (source) | ✅ critical |
| تكامل مع `hr-loans-byid.md` (deductions reflected) | ✅ |
| تكامل مع `hr-violations.md` (deductions) | ✅ |
| **PDPL** — own data only | ✅ critical |
| **PDPL** — strong access audit | every view logged | `access_logs` | ✅ critical |
| RBAC | self only | ✅ critical |
| Encrypted PDF (option) | with password | for secure email | ⚠ |

تحقق يدوي:
- [ ] هل employee يستطيع رؤية حسابه فقط (لا cross-access)?
- [ ] هل YTD calculations accurate?
- [ ] هل dispute window واضح (e.g., 30 يوم من Payment date)?
- [ ] هل access log captures كل view + download?
- [ ] هل bank info partially masked في عرض الـ payslip?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-payslip` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/my-payslip`
- لقطة: `audit/screenshots/my_payslip.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
