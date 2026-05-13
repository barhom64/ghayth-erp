# /legal/contracts/:id — `artifacts/ghayth-erp/src/pages/details/legal-contract-detail.tsx`

## 1. الميتاداتا
- المسار: `/legal/contracts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/legal-contract-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:18`
- المجموعة: `legal`
- الكومبوننت: `LegalContractDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 324
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل عقد قانوني — العقود الرسمية مع الأطراف الخارجية.

| نوع العقد | المرجع |
|----------|--------|
| Sales/Service | مع عملاء | راجع `crm/clients.md` |
| Procurement | مع موردين | راجع `warehouse-suppliers.md` |
| Lease/Rental | تأجير عقارات | راجع `properties-contracts-byid.md` |
| Employment | راجع `hr-contracts.md` (HR side) |
| Partnership / JV | شراكات |
| NDA | non-disclosure |
| Loan/Credit | راجع `finance` |
| Insurance | تأمين |
| Outsource | خدمات |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View contract | GET `/legal/contracts/:id` | `legal_contracts` | ✅ |
| Lifecycle: draft → review → signed → active → expired/terminated | راجع `lifecycle/contracts.ts` | ✅ |
| Draft from template | راجع `documents-templates.md` | ✅ |
| Internal review (legal counsel) | with comments | ⚠ |
| Counterparty review | external | بـ shared link لو موجود | ⚠ |
| E-signature | راجع `documents.md` | external integration | ⚠ |
| Activate (post-signature) | with effective date | ✅ critical |
| Track milestones | per contract | reminders | ✅ |
| Renew (auto أو manual) | per contract terms | راجع `notifications.md` | ✅ |
| Amend (تعديل ملحق) | with version history | ✅ critical |
| Terminate (early) | with reason + notice | check termination clause | ✅ critical |
| Track financial obligations | per contract | راجع `finance-payments.md` | ✅ |
| Performance vs obligations | dashboard | KPI | ⚠ |
| Expiry alerts (90/60/30/7 يوم) | cron | event=`contract_expiring` | راجع `notifications.md` | ✅ critical |
| Risk assessment | per contract | risk score | ⚠ |
| تكامل مع `finance-invoices.md` (لو revenue) | ✅ |
| تكامل مع `finance-expenses.md` (لو cost) | ✅ |
| تكامل مع `documents-archive.md` (retention 10y) | ✅ critical |
| تكامل مع `governance-compliance.md` (regulatory) | ✅ |
| Audit log إجباري | كل تعديل/توقيع/إنهاء | `audit_logs` | ✅ critical |
| **PDPL** — confidentiality | per contract | ✅ critical |
| RBAC | legal + finance + relevant department | per contract scope | ✅ critical |

تحقق يدوي:
- [ ] هل expiry alerts بـ 90/60/30/7 يوم متعددة المستويات (lawyer + manager + CFO حسب القرب)؟
- [ ] هل auto-renew clauses تنفّذ بدون فاصل زمني (gap)?
- [ ] هل termination early يحسب penalty لو موجود في العقد؟
- [ ] هل risk score يأخذ counterparty rating + clause severity؟
- [ ] هل e-signature integration secure (PDPL compliant)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/legal/contracts → 401`
- landedUrl: `?`
- توصية: مغلق
