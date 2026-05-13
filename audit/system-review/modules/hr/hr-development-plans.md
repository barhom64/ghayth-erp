# /hr/development-plans — `artifacts/ghayth-erp/src/pages/hr/development-plans.tsx`

## 1. الميتاداتا
- المسار: `/hr/development-plans`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/development-plans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:156`
- المجموعة: `hr`
- الكومبوننت: `DevelopmentPlans`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `development-plans`
- سطور الملف: 2
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
خطط التطوير الجماعية (Development Plans) — على مستوى القسم/الشركة، أوسع من IDP الفردي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء خطة تطوير (department-wide) | hr | POST `/hr/development-plans` | `development_plans` | ✅ |
| ربط بـ org chart | hr/organization | `plan.scope` (department/branch/company) | راجع `hr-organization.md` | ✅ |
| تجميع IDPs فردية | hr | aggregate `hr_idp_plans` for the department | راجع `hr-idp.md` | ✅ |
| ميزانية التطوير | finance/budget | `plan.budgetAllocated` | راجع `finance-budget.md` | ⚠ تحقق |
| ربط ببرامج التدريب | hr/training | `plan_trainings` per quarter | راجع `hr-training.md` | ✅ |
| ربط بـ succession planning | hr | high-potential employees | `succession_plans` | ⚠ |
| ربط بـ HRDF (HR Development Fund) | gov-integrations | تمويل التدريب | اختياري | ⚠ |
| Quarterly reviews | hr | progress tracking | ✅ |
| KPIs (training hours, completion rate) | bi | aggregation | views | ✅ |
| تأثير على engagement scores | hr/performance | يقاس via 360 + surveys | ⚠ |
| إشعارات (HR Director + Managers) | comms | event=`development_plan_milestone\|overdue` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` لو مضاف | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل خطة تتجاوز الميزانية تطلب موافقة CFO قبل الاعتماد؟
- [ ] هل صدور IDP فردي ينعكس على إحصاءات الخطة الجماعية تلقائياً؟
- [ ] هل HRDF claims تُستخرَج تلقائياً عند إكمال training مؤهَّل؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `development-plans` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/development-plans; consoleErr=2`
- لقطة: `audit/screenshots/hr_development_plans.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
