# /governance/compliance/create — `artifacts/ghayth-erp/src/pages/create/governance/compliance-create.tsx`

## 1. الميتاداتا
- المسار: `/governance/compliance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/governance/compliance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:25`
- المجموعة: `governance`
- الكومبوننت: `ComplianceCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 84
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L49: "مسح المسودة" → `clearDraft`
- L77: "(بلا تسمية)" → `() => setLocation("/governance/compliance")` 🔒
- L78: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء سجل امتثال — Compliance record creation.

| المعيار | المرجع |
|--------|--------|
| ZATCA Phase 2 | راجع `finance-zatca.md` |
| GOSI | راجع `hr-payroll.md` |
| Mudad (WPS) | راجع `hr-payroll.md` |
| Saudization (Nitaqat) | per labor law |
| PDPL | راجع `documents-archive.md` |
| Ejar (real estate) | راجع `properties-contracts-byid.md` |
| Najz (legal) | راجع `legal-cases.md` |
| Saudi Labor Law | راجع `hr-discipline-regulation.md` |
| IFRS | راجع `finance-reports.md` |
| ISO 27001 (لو applicable) | per security |
| MoHaj (Umrah) | راجع `umrah-agents.md` |

| الحقل | المتطلب |
|------|--------|
| Standard | enum | إجباري |
| Module impacted | finance/hr/etc. | إجباري |
| Compliance requirement | description | إجباري |
| Frequency | one-time / monthly / annual | enum |
| Owner | accountable person | إجباري |
| Evidence required | document types | راجع `documents.md` |
| Deadline | إجباري للـ time-bound |
| Status | enum (planned/in-progress/completed/missed) |
| Risk if non-compliant | enum (low/medium/high/critical) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create compliance record | POST `/governance/compliance` | `compliance_controls` | ✅ |
| Link evidence documents | راجع `documents.md` | ✅ critical |
| Schedule reminders | based on frequency | راجع `automation.md` | ✅ |
| Periodic review trigger | per standard | راجع `governance-audits.md` | ✅ |
| Status update workflow | راجع `governance/workflows.md` | ✅ |
| External submission tracking | راجع `admin-integrations.md` | ✅ critical |
| Risk assessment per control | راجع `projects-risks.md` | ⚠ |
| Provisions in financials (لو high risk) | راجع `finance-provisions.md` | ✅ critical |
| Audit findings link | راجع `governance-audits.md` | ✅ |
| تكامل مع `governance-compliance.md` (parent list) | ✅ |
| تكامل مع `governance-audits.md` (audit findings) | ✅ critical |
| تكامل مع `governance-capa.md` (corrective actions) | ✅ |
| تكامل مع كل الـ modules per impact area | ✅ critical |
| تكامل مع `notifications.md` (deadline alerts) | ✅ critical |
| Audit log إجباري | `audit_logs` | ✅ critical |
| RBAC | governance officer + module owner | ✅ critical |

تحقق يدوي:
- [ ] هل all major regulations (ZATCA, GOSI, Mudad, Nitaqat, PDPL) tracked?
- [ ] هل deadlines auto-trigger reminders + escalation?
- [ ] هل high-risk non-compliance triggers immediate CFO/CEO alert?
- [ ] هل evidence storage encrypted + retention per regulation?
- [ ] هل periodic review schedule per standard configurable?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/compliance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/governance_compliance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
