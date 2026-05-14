# /governance/compliance/:id — `artifacts/ghayth-erp/src/pages/details/compliance-detail.tsx`

## 1. الميتاداتا
- المسار: `/governance/compliance/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/compliance-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:26`
- المجموعة: `governance`
- الكومبوننت: `ComplianceDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 310
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل سجل امتثال واحد — Single compliance control detail.

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View control | GET `/governance/compliance/:id` | `compliance_controls` | ✅ |
| Update status | PATCH | with audit | ✅ critical |
| Upload evidence | راجع `documents.md` | ✅ critical |
| Mark compliance achieved | with sign-off | راجع `governance/approvals.md` | ✅ critical |
| Mark missed (non-compliance) | with reason + risk assessment | راجع `notifications.md` (critical alert) | ✅ critical |
| Open finding (CAPA) | راجع `governance-capa.md` | ✅ |
| Link to audit | راجع `governance-audits.md` | ✅ |
| External submission status | sync from regulator | راجع `admin-integrations.md` | ✅ critical |
| Provision impact (لو high-risk missed) | راجع `finance-provisions.md` | ✅ critical |
| Compliance score impact | aggregate KPI | راجع `bi-kpis.md` | ✅ |
| Historical compliance trend | per control | ✅ |
| تكامل مع `governance-compliance.md` (parent list) | ✅ |
| تكامل مع `governance-audits.md` (findings) | ✅ critical |
| تكامل مع `governance-capa.md` (corrective actions) | ✅ critical |
| تكامل مع `finance-provisions.md` (financial impact) | ✅ critical |
| تكامل مع `bi-kpis.md` (compliance KPI) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | governance officer + module owner + CFO for financial impact | ✅ critical |

تحقق يدوي:
- [ ] هل non-compliance auto-creates CAPA + escalates per risk level?
- [ ] هل compliance score per control + aggregate visible?
- [ ] هل high-risk missed compliance auto-triggers financial provision?
- [ ] هل historical trend helps identify chronic non-compliance areas?
- [ ] هل external submission status sync real-time مع regulators?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/governance/compliance → 401`
- landedUrl: `?`
- توصية: مغلق
