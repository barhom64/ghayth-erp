# /governance/risks — `artifacts/ghayth-erp/src/pages/governance.tsx`

## 1. الميتاداتا
- المسار: `/governance/risks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/governance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:21`
- المجموعة: `governance`
- الكومبوننت: `Governance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `risks`
- سطور الملف: 51
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/governance/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
سجل المخاطر (Risk Register). يُغذّي audits + CAPA + exec dashboard.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل risk | governance | POST `/governance/risks` | `governance_risks` | ✅ |
| تصنيف (financial/operational/compliance/strategic) | governance | `risks.category` | ✅ |
| تقدير impact + probability → score | governance | calculated field | ✅ |
| ربط بـ owner (موظف مسؤول) | hr | `risks.ownerId` → `employees` | ✅ |
| تخطيط mitigation | governance | `risk_mitigations` per risk | ✅ |
| ربط بـ audits + findings | governance | `audit_risk_links` two-way | ✅ |
| ربط بـ CAPA (لو raised من finding) | governance | `governance_capa.linkedRiskId` | ✅ |
| ميزانية للـ mitigation | finance/budget | `risks.mitigationBudget` → `budgets.committed` | ⚠ تحقق |
| review دوري | governance | cron يفحص `risks.lastReviewDate` | escalation | ✅ |
| heat map للـ exec | bi | aggregation per category × probability × impact | view | ✅ |
| إشعارات للـ owner + manager | comms | event=`risk_assigned\|review_due\|mitigated` | `notifications` | ✅ |
| تكامل ISO 31000 reporting | gov-integrations | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/governance/risks` لو مضاف) | `audit_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل risk بـ score > حد معيّن (مثلاً 15/25) يفتح CAPA تلقائياً؟
- [ ] هل تجاهل review متكرر (3 dates fail) يطلق escalation لمدير الـ governance؟
- [ ] هل ربط risk بـ project يحدّث `projects.riskExposure` aggregate؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `risks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/risks`
- لقطة: `audit/screenshots/governance_risks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
