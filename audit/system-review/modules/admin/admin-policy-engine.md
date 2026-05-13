# /admin/policy-engine — `artifacts/ghayth-erp/src/pages/admin-policy-engine.tsx`

## 1. الميتاداتا
- المسار: `/admin/policy-engine`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-policy-engine.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:29`
- المجموعة: `admin`
- الكومبوننت: `AdminPolicyEngine`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `policy-engine`
- سطور الملف: 200
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L71: "(بلا تسمية)" → `() => refetchAudit()`

### القراءات (GET)
- GET `/admin/governance/policy-audit`
- GET `/admin/governance/role-strategies`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
محرّك السياسات (Policy Engine) — `business_rules` القابلة للتعديل بدون إعادة نشر.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تعريف قاعدة عمل | admin/policy | POST `/rules` | `business_rules` | ✅ |
| نوع (threshold/workflow/calculation/validation) | admin | `rule.type`, `scope`, `appliesTo` | ✅ |
| تأثير على approvals | governance/workflows | rules تحدّد thresholds + chains | راجع `governance-workflows-rules.md` | ✅ |
| تأثير على calculations | متعدد | gratuity rule, overtime rate, late deduction | يُقرأ في `payroll`, `hr`, `finance` | ✅ |
| تأثير على validations | core | منع إجراءات تحت شروط معيّنة | guard in routes | ✅ |
| تأثير real-time | core | invalidate cache `businessRulesCache` | ✅ |
| versioning | admin | `rule_versions` — تتبّع التغييرات | للـ rollback | ✅ |
| دvalid before/after | admin | `rule.effectiveDate`, `expiringDate` | يدعم الجدولة المسبقة | ✅ |
| Approval workflow (للقواعد المالية) | governance | يحتاج CFO + admin | ✅ |
| Audit log + emit event | core | إجباري | `audit_logs`, `event_logs` | ✅ critical |
| إشعار للمعنيين | comms | event=`business_rule_changed` | `notifications` | ⚠ |
| تصدير policy report | admin | شامل كل rules النشطة | للـ governance review | ✅ |

تحقق يدوي:
- [ ] هل تعديل rule مالي حساس (مثل threshold الموافقة) يحتاج 2-of-N admin؟
- [ ] هل rollback لإصدار قديم يحفظ سبب التراجع في الـ audit؟
- [ ] هل الأحداث الجارية (طلبات مفتوحة) تتأثر بـ rule جديد أم تعمل بقاعدة وقت الإنشاء؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `policy-engine` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/policy-engine`
- لقطة: `audit/screenshots/admin_policy_engine.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
