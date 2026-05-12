# /governance/policies — `artifacts/ghayth-erp/src/pages/governance.tsx`

## 1. الميتاداتا
- المسار: `/governance/policies`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/governance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:18`
- المجموعة: `governance`
- الكومبوننت: `Governance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `policies`
- سطور الملف: 51
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/governance/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
السياسات الحوكمية (Policies) — توثيق رسمي يختلف عن `business_rules` (policy-as-doc vs policy-as-rule).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء سياسة | governance | POST `/governance/policies` | `governance_policies` | ✅ |
| الإصدار + التاريخ | governance | `policy.version`, `effectiveDate`, `reviewDate` | ✅ |
| ربط بـ regulatory framework | gov-integrations | ISO/SAMA/PDPL/Saudi Labor Law | `policy_frameworks` | ⚠ |
| Approval workflow (CEO/Legal/CFO) | governance/workflows | required for activation | `approval_chains` | ✅ |
| توقيع رقمي + إقرار الموظفين | digital-signature + hr | acknowledgments per employee | `policy_acknowledgments` | ✅ |
| ربط بـ training (لو إلزامي) | hr/training | policy تتطلب training enrollment | راجع `hr-training.md` | ⚠ |
| ربط بـ violations (مخالفة سياسة) | hr/discipline | violation reason references policy | راجع `hr-discipline-memos.md` | ✅ |
| Review periodic (سنوي عادةً) | governance | cron يفحص `nextReviewDate` | escalation | ✅ |
| Versioning (snapshot) | governance | كل تعديل ينشئ version جديد | `policy_versions` (للـ rollback) | ✅ |
| Audit log + emit event | core | إجباري | `audit_logs`, `event_logs` | ✅ critical |
| إشعار لكل الموظفين عند تعديل | comms | event=`policy_updated` | `notifications` | ✅ |
| تقارير compliance | bi | acknowledgment rate, violation rate per policy | views | ✅ |

تحقق يدوي:
- [ ] هل موظف جديد يجب أن يوقّع على policies الإلزامية قبل اكتمال onboarding؟
- [ ] هل تعديل policy ينشئ موجة إقرارات جديدة من كل الموظفين أم opt-in؟
- [ ] هل العقوبات لمخالفة policy مدوّنة فيها مباشرةً أم في `business_rules`؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `policies` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/policies`
- لقطة: `audit/screenshots/governance_policies.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
