# /governance/compliance — `artifacts/ghayth-erp/src/pages/governance.tsx`

## 1. الميتاداتا
- المسار: `/governance/compliance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/governance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:27`
- المجموعة: `governance`
- الكومبوننت: `Governance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `compliance`
- سطور الملف: 51
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/governance/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Compliance Center — تتبّع الالتزام بالمعايير + الجهات التنظيمية.

| المعيار | الوحدة المتأثرة | المتطلب |
|---------|------------------|---------|
| ZATCA Phase 2 | finance | E-invoice مع QR + UUID + signing | راجع `finance-tax.md` |
| GOSI | hr | شهري — submission من payroll | راجع `hr-payroll.md` |
| WPS | hr | شهري — bank file | راجع `lib/saudi-compliance/wps` |
| Mudad | hr | اختياري | راجع `lib/saudi-compliance/mudad` |
| PDPL (Saudi Personal Data Protection Law) | core | retention + masking | راجع `documents-archive.md` |
| Ejar (Real Estate) | properties | تسجيل عقود الإيجار | راجع `properties-contracts.md` |
| Saudi Labor Law | hr | gratuity, leaves, overtime | متعدد |
| IFRS | finance/reports | accounting standards | متعدد |
| ISO 27001 (إن مطبق) | admin/security | controls + audits | راجع `governance-audits.md` |
| Najz (المحاكم) | legal | session updates | راجع `legal-sessions.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Compliance dashboard | `governance.ts` GET `/governance/compliance` | aggregations | ✅ |
| متطلب per standard | each standard linked to controls | `compliance_controls` | ✅ |
| Compliance score per standard | aggregate | views | ✅ |
| Auto-checks (للـ tech standards) | داخل validations | ✅ |
| Manual review (للـ procedural) | governance/audits | راجع `governance-audits.md` | ✅ |
| Findings → CAPA | راجع `governance-capa.md` | ✅ |
| تقرير دوري للـ regulators | gov-integrations | متى متطلب | ⚠ |
| Critical alert عند non-compliance | comms | event=`compliance_breach` | `notifications` | ✅ critical |
| Audit log إجباري | core | كل تغيير في الـ control state | ✅ |

تحقق يدوي:
- [ ] هل non-compliance يطلق notification فوري (critical)؟
- [ ] هل compliance score يأخذ weights لكل standard؟
- [ ] هل التقارير الدورية (شهري/سنوي) لـ ZATCA/GOSI تُصدر تلقائياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `compliance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/compliance`
- لقطة: `audit/screenshots/governance_compliance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
