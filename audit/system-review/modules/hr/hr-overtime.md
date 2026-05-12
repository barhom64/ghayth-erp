# /hr/overtime — `artifacts/ghayth-erp/src/pages/hr/overtime.tsx`

## 1. الميتاداتا
- المسار: `/hr/overtime`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/overtime.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:125`
- المجموعة: `hr`
- الكومبوننت: `Overtime`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `overtime`
- سطور الملف: 309
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ساعات إضافية. من الكشف التلقائي إلى الراتب.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| كشف تلقائي من attendance | hr/attendance | عند `checkOut > workEnd + threshold` → `overtimeMinutes` | `attendance.overtimeMinutes` | ✅ |
| طلب overtime مسبق (يدوي) | hr/overtime | `hr-overtime.ts` POST `/hr/overtime` | `hr_overtime` | ✅ |
| سير موافقة | governance/workflows | `business_rules.overtime_approval` (≥X ساعات → موافقة) | `approval_chains` | ✅ |
| **حساب القيمة** | hr | basic_hourly × 1.5 (عادي) أو ×2 (عطلة) | logic في `payroll` | ✅ |
| إضافة لمسير الراتب | hr/payroll | `payroll_lines.overtime` = aggregate من فترة | ✅ موجود |
| قيد محاسبي | finance/GL | جزء من قيد الراتب الكلي (DR Salary Expense) | `gl_entries` | ✅ |
| تأثير على ميزانية القسم | finance/budget | يُخصم من `budgets.spent` للقسم | ⚠ تحقق |
| إشعار للموظف + المدير | comms | event=`overtime_approved\|overtime_rejected` | `notifications` | ✅ |
| تقارير departmental | bi | aggregation per department/month | views | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/overtime` لو مضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل overtime > N ساعات/شهر يولّد تنبيه HR (عبء عمل)؟
- [ ] هل ساعات الجمعة/السبت تُحسب ×2 تلقائياً؟
- [ ] هل التداخل مع leave_requests يُمنع (لا يمكن overtime أثناء إجازة)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `overtime` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/overtime`
- لقطة: `audit/screenshots/hr_overtime.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
