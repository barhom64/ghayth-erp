# /governance/capa — `artifacts/ghayth-erp/src/pages/governance/capa.tsx`

## 1. الميتاداتا
- المسار: `/governance/capa`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/governance/capa.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:28`
- المجموعة: `governance`
- الكومبوننت: `GovernanceCapa`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `capa`
- سطور الملف: 55
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/governance/capa`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
CAPA — Corrective and Preventive Actions. مرتبط بـ audits + risks.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| فتح CAPA (من finding أو risk) | governance | POST `/governance/capa` | `governance_capa` | ✅ |
| نوع (corrective/preventive) | governance | `capa.type` | ✅ |
| الإسناد + الموعد النهائي | hr | `capa.ownerId`, `dueDate` | ✅ |
| ربط بـ audit finding | governance | `capa.findingId` → `audit_findings` | ✅ |
| ربط بـ risk | governance | `capa.riskId` → `governance_risks` | راجع `governance-risks.md` |
| خطة تنفيذ + milestones | governance | `capa_milestones` | ✅ |
| تأثير مالي (تكلفة التنفيذ) | finance/budget | `capa.estimatedCost` → `budgets.committed` | ⚠ |
| Verification + closure | governance | `capa.verifiedBy`, `closedAt` | requires evidence | ✅ |
| تصاعد عند التأخير | comms | cron + escalation rules | `notifications` | ✅ |
| إعادة فتح | governance | لو effectiveness check فشل | versioning | ⚠ |
| تأثير على policy engine | admin/policy | راجع `admin-policy-engine.md` | ⚠ |
| تقارير closure rate | bi | aggregation per dept/period | views | ✅ |
| Audit log | core | إجباري | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل CAPA متأخرة > N أيام تطلق escalation متسلسل؟
- [ ] هل closure تتطلب رفع evidence قبل verified؟
- [ ] هل تكرار نفس finding يفتح CAPA جديد آلياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `capa` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/capa`
- لقطة: `audit/screenshots/governance_capa.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
