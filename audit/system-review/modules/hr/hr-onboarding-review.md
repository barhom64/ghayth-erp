# /hr/onboarding-review — `artifacts/ghayth-erp/src/pages/hr/onboarding-review.tsx`

## 1. الميتاداتا
- المسار: `/hr/onboarding-review`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/onboarding-review.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:146`
- المجموعة: `hr`
- الكومبوننت: `OnboardingReview`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `onboarding-review`
- سطور الملف: 178
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/employees?limit=200`
- GET `/hr/onboarding-steps`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
مراجعة Onboarding للموظف الجديد — تأكيد إنهاء كل المهام قبل التفعيل.

| المرحلة | الوحدة الهدف | المهام المتوقعة |
|---------|--------------|------------------|
| Pre-arrival | hr | عقد عمل موقّع، تأشيرة، تذكرة سفر (للأجانب) |
| Day 1 | hr | بطاقة دخول، sim card، laptop، email account |
| Setup | auth | إنشاء `users.employeeId`، تخصيص role |
| Training | hr/training | برامج توجيه (orientation) إلزامية |
| Documentation | documents | صور الهوية، شهادات الخبرة، شهادات صحية |
| GOSI | gov-integrations | تسجيل في التأمينات الاجتماعية |
| Banking | finance | حساب بنكي + IBAN في `employee_assignments.iban` |
| Probation review | hr/performance | تقييم بعد 3 شهور |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| فتح checklist | تلقائي عند `employees.status='hired'` | `hr_onboarding_checklists` | ✅ |
| تمييز مهمة منتهية | PATCH `/hr/onboarding/:id/items/:item` | `checklist_items.completed=true` | ✅ |
| **تفعيل الموظف** (employee activation) | عند 100% checklist → ينقل `status='active'` | راجع `hr/employee-activation.md` | ✅ |
| نقطة تكامل مع payroll | عند التفعيل → يظهر في `payroll_runs` | ✅ |
| إشعارات لكل خطوة | comms | event=`onboarding_step_completed\|stalled` | `notifications` | ✅ |
| تذكير IT للمعدات | comms | اختياري | ⚠ |
| تأثير على GOSI/قوى registration | gov-integrations | إلزامي للموظف السعودي/المقيم | ⚠ |
| Audit log | core | `auditMiddleware` لـ `/hr/onboarding` لو مضاف | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل تأخّر بند في checklist > N يوم يطلق escalation لمسؤول HR؟
- [ ] هل الموظف يستطيع check-in قبل اكتمال onboarding أم محظور؟
- [ ] هل تقييم نهاية فترة التجربة (3 months) يفتح في `evaluation_cycles` آلياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `onboarding-review` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/onboarding-review`
- لقطة: `audit/screenshots/hr_onboarding_review.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
