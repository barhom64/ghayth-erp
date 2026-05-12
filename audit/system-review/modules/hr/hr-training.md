# /hr/training — `artifacts/ghayth-erp/src/pages/hr/training.tsx`

## 1. الميتاداتا
- المسار: `/hr/training`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/training.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:110`
- المجموعة: `hr`
- الكومبوننت: `Training`
- subKey: `training` | minRoleLevel: —
- الكيان المستنبط: `training`
- سطور الملف: 247
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/training/programs`
- GET `/hr/training/stats`
- GET `/hr/training/enrollments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
برامج التدريب. من التخطيط إلى الشهادة.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء برنامج تدريبي | hr/training | `training.ts` POST `/programs` | `training_programs` | ✅ |
| ميزانية البرنامج | finance/budget | `programs.budgetAllocated` → `budgets.committed` | ⚠ تحقق |
| تسجيل موظفين | hr/training | POST `/programs/:id/enrollments` | `training_enrollments` | ✅ |
| ربط بـ IDP (خطة التطوير) | hr/development-plans | `idp_items.trainingId` → program | ✅ |
| دفع تكلفة (للمدرب الخارجي) | finance/expenses | POST `/finance/expenses` مع ربط برنامج | `expenses`, `gl_entries` | ✅ |
| تتبّع الحضور | hr/training | `training_attendance` (per session) | ✅ |
| تقييم نهائي + شهادة | hr/training | `training_certificates` ينشأ عند `passed=true` | يُربط بـ `employees.certifications` | ✅ |
| تأثير على KPIs الموظف | hr/performance | عدد الشهادات يدخل في تقييم الأداء | ✅ |
| إشعارات | comms | event=`training_enrolled\|completed\|certificate_issued` | `notifications` | ✅ |
| ربط بـ HRDF (صندوق تنمية الموارد) | gov-integrations | اختياري | `gov_submissions` | ⚠ |
| Audit log | core | `auditMiddleware` (`/hr/training` لو مضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل البرنامج تجاوز الميزانية يطلق تنبيه/يمنع تسجيلات جديدة؟
- [ ] هل شهادة الموظف ترتبط تلقائياً بـ `documents.entityType='employee'`?
- [ ] هل الموظف الذي فشل في الـ assessment يُعاد تسجيله تلقائياً أم يدوي؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `training` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/training`
- لقطة: `audit/screenshots/hr_training.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
