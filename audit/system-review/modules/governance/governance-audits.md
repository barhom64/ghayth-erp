# /governance/audits — `artifacts/ghayth-erp/src/pages/governance.tsx`

## 1. الميتاداتا
- المسار: `/governance/audits`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/governance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:24`
- المجموعة: `governance`
- الكومبوننت: `Governance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `audits`
- سطور الملف: 51
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/governance/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
عمليات تدقيق داخلي. المرجع: `docs/blueprints/governance-workflows-rules.md` + `docs/RBAC_V2.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء عملية تدقيق | governance | `governance.ts` POST `/audits` | `governance_audits`, `audit_scopes` | ✅ |
| إسناد للمدقّق المختص | hr/employees | `audits.assignedTo` → `employees.id` (تحقق من role) | ✅ |
| جدول زمني + checklist | governance | `audit_checklists` بمراحل | `audit_checklist_items` | ✅ |
| ربط بـ Risks | governance/risks | كل audit يتعلّق بـ risks محتملة | `governance_risks`, `audit_risk_links` | ✅ |
| CAPA (Corrective Actions) | governance | تنشأ من findings → POST `/capa` | `governance_capa` | ✅ |
| إشعارات للمدقّق + المعنيين | comms | event=`audit_started\|finding_raised\|capa_due` | `notifications` | ✅ |
| سير موافقة (للنتائج النهائية) | governance/workflows | عبر `workflows.ts` | `approval_chains` | ✅ |
| تأثير على RBAC (severity high → tighten permissions) | rbac-v2 | يقترح تغييرات يدوية، لا تطبيق تلقائي | `rbac_change_proposals` | ⚠ غير آلي |
| Audit log (meta-audit!) | core | `auditMiddleware` لو مضاف ENTITY_MAP / يدوي | `audit_logs` | ⚠ |
| تقارير لـ exec dashboard | bi | aggregation findings × CAPA closure rate | views | ✅ |

تحقق يدوي:
- [ ] هل CAPA متأخرة تطلق إشعار escalation تلقائي؟
- [ ] هل findings مرتبطة بـ docs templates للأدلة؟
- [ ] هل closure rate ينعكس على مؤشرات HR/تقييم الموظف المسؤول؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `audits` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/audits`
- لقطة: `audit/screenshots/governance_audits.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
