# /properties/contracts/:id — `artifacts/ghayth-erp/src/pages/properties/contract-detail.tsx`

## 1. الميتاداتا
- المسار: `/properties/contracts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/contract-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:47`
- المجموعة: `properties`
- الكومبوننت: `ContractDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 327
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل عقد إيجار (Lease Contract) — Ejar-compliant.

| الحالة | الوصف |
|--------|------|
| Draft | قيد الإعداد |
| Pending Ejar | بانتظار التسجيل |
| Active | مفعّل + Ejar registered | ✅ |
| Renewed | جُدّد |
| Expired | انتهى natural | grace period |
| Terminated (early) | إنهاء مبكر | with penalty |
| Cancelled | قبل التفعيل |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View contract | GET `/properties/contracts/:id` | `property_contracts` | ✅ |
| Activate (post-Ejar) | with Ejar reference | راجع `admin-integrations.md` | ✅ critical |
| Ejar registration | external API | mandatory by Saudi law | ✅ critical |
| Renew | POST `/properties/contracts/:id/renew` | يولّد نسخة جديدة + Ejar | ✅ |
| Amend (تعديل) | with re-Ejar | ✅ |
| Terminate (early) | with reason + penalty calculation | راجع `finance-invoices.md` for penalty | ✅ critical |
| Generate rent invoice (recurring) | monthly | راجع `properties-rent-invoicing.md` | ✅ critical |
| Late payment penalty | per contract clause | راجع `finance-late-fees.md` | ⚠ |
| Security deposit handling | held | `gl_entries` AR-deposits | ✅ |
| Return deposit (post-end) | minus deductions | راجع `finance-payments.md` | ✅ |
| Maintenance responsibility (per clause) | tenant/landlord/shared | راجع `properties-maintenance.md` | ✅ |
| Inspection reports (move-in/move-out) | mandatory | راجع `documents.md` | ⚠ |
| Tenant credit check | external service | راجع `crm/clients.md` for credit | ⚠ |
| GL entry — rental revenue | monthly | Dr AR / Cr Revenue | ✅ critical |
| GL entry — security deposit (held) | Dr Cash / Cr AR-deposits | ✅ |
| ZATCA invoice (per rent payment) | راجع `finance-zatca.md` | ✅ critical |
| Expiry alerts (90/60/30 يوم) | reminders | راجع `notifications.md` | ✅ critical |
| Renewal offer auto-send | configurable | راجع `crm-activities.md` | ⚠ |
| تكامل مع `properties-byid.md` (status update) | active → occupied | ✅ |
| تكامل مع Ejar (Saudi MoH platform) | mandatory | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `crm/clients.md` (tenant master) | ✅ |
| تكامل مع `finance-ar-aging.md` (outstanding rent) | ✅ |
| تكامل مع `documents-archive.md` (retention 10y) | ✅ critical |
| تكامل مع `legal-contracts-byid.md` (لو dispute) | escalation | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| **PDPL** — tenant PII | masked في reports | ✅ |
| RBAC | property manager + finance + legal لو dispute | ✅ |

تحقق يدوي:
- [ ] هل Ejar registration mandatory + blocks activation حتى يتم؟
- [ ] هل rent invoicing فعلاً monthly recurring بدون miss?
- [ ] هل ZATCA QR + UUID على كل rent invoice؟
- [ ] هل early termination penalty يحسب per contract clause بدقة?
- [ ] هل security deposit في حساب منفصل (escrow) أم held with company funds؟
- [ ] هل move-in/move-out inspection reports mandatory + documented?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/contracts → 401`
- landedUrl: `?`
- توصية: مغلق
