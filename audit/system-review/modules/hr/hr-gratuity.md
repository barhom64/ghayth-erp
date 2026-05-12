# /hr/gratuity — `artifacts/ghayth-erp/src/pages/hr/gratuity.tsx`

## 1. الميتاداتا
- المسار: `/hr/gratuity`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/gratuity.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:158`
- المجموعة: `hr`
- الكومبوننت: `Gratuity`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `gratuity`
- سطور الملف: 178
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/employees?status=active&limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
مكافأة نهاية الخدمة (Gratuity / End of Service Benefit).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| حساب مكافأة فردية | hr/gratuity | GET `/hr/gratuity/calc/:employeeId` | محسوب لحظياً (لا يُخزن) | ✅ |
| **القاعدة السعودية** | hr | نظام العمل: نصف شهر/سنة لأول 5، شهر/سنة بعدها | `lib/hr/gratuity-calc.ts` | ✅ موجود |
| الراتب الأساس المعتمد للحساب | hr | آخر `basic + housing + transport` من `salary_components` | ✅ |
| تأثير الاستقالة vs الإنهاء | hr/exit | اختلاف نسبة المكافأة (60% لو استقال قبل 5 سنوات) | logic في `gratuity-calc` | ✅ |
| ربط بـ exit request | hr/exit | عند الاعتماد → يُحجز في مستحقات | راجع `hr-exit.md` | ✅ |
| **قيد accrual شهري** | finance/GL | DR Gratuity Expense / CR Gratuity Liability (provision) | `gl_entries` (cron monthly) | ⚠ تحقق إن مفعّل |
| إفراج المكافأة عند الصرف | finance/GL | DR Gratuity Liability / CR Cash | `gl_entries` | ✅ |
| تقرير IFRS provision | finance/reports | aggregation للـ liability المتراكم | views | ⚠ |
| إشعار سنوي للموظف بقيمة مكافأته المتوقعة | comms | اختياري | `notifications` | ⚠ |
| Audit log | core | عند exit إجباري | `audit_logs` | ✅ (راجع hr-exit) |

تحقق يدوي:
- [ ] هل القاعدة المخصصة للشركة (سياسة أكرم من القانون) تُحترم؟
- [ ] هل فترة التجربة (≥ 3 شهور) تُخصم من حساب المدة؟
- [ ] هل الإجازة بدون راتب تُخصم من المدة المحسوبة؟
- [ ] هل provision الشهري يُعاد حسابه عند رفع الراتب؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gratuity` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/gratuity`
- لقطة: `audit/screenshots/hr_gratuity.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
