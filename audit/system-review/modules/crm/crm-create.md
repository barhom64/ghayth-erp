# /crm/create — `artifacts/ghayth-erp/src/pages/create/crm-create.tsx`

## 1. الميتاداتا
- المسار: `/crm/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/crm-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:84`
- المجموعة: `crm`
- الكومبوننت: `CrmCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 163
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/crm/opportunities` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L81: "مسح المسودة" → `clearDraft`
- L156: "(بلا تسمية)" → `() => setLocation("/crm")` 🔒
- L157: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء عميل / فرصة / lead جديد — Customer/Lead onboarding.

| النوع | الوصف |
|------|------|
| Lead | اتصال أولي | unqualified |
| Prospect | qualified lead | ready for opportunity |
| Customer | متعامل فعلي | with active business |
| Vendor (لو also supplier) | linked to `warehouse-suppliers.md` |

| الحقل | المتطلب |
|------|--------|
| Name (legal) | إجباري |
| Type (individual/business/government) | enum |
| CR (لو business) | for B2B |
| VAT (لو registered) | per ZATCA | for B2B invoicing |
| Industry | enum | for segmentation |
| Tier (A/B/C/VIP) | enum |
| Contact (phone, email, address) | إجباري |
| Multiple contacts (decision maker, etc.) | optional |
| Lead source | enum (referral, marketing, etc.) |
| Initial credit limit | راجع `crm-credit-management.md` |
| Payment terms | NET 30/60/COD | enum |
| Assigned sales rep | FK |
| Tags / attributes | for segmentation |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create client/lead | POST `/crm/clients` | `clients` | ✅ |
| Validate uniqueness | by CR/VAT/national ID | ✅ critical |
| ZATCA VAT lookup (verify) | external | راجع `admin-integrations.md` | ⚠ |
| Duplicate detection (fuzzy match by name + phone) | server-side | ⚠ |
| Credit check (لو high tier) | external service | راجع `admin-integrations.md` | ⚠ |
| Set credit limit (with approval) | راجع `governance/approvals.md` | ✅ |
| Generate AR sub-ledger account | راجع `finance-accounts.md` | auto | ✅ critical |
| PDPL consent (لو individual) | mandatory | راجع `documents.md` | ✅ critical |
| Welcome notification | event=`client_created` | راجع `notifications.md` | ✅ |
| Assign sales rep | with load balancing | راجع `crm-pipeline.md` | ⚠ |
| تكامل مع `finance-accounts.md` (AR sub-ledger) | ✅ critical |
| تكامل مع `crm-pipeline.md` (auto-create opportunity لو lead) | ⚠ |
| تكامل مع `documents.md` (initial documents) | ✅ |
| Audit log إجباري | `audit_logs` | ✅ critical |
| **PDPL** — encryption + consent | ✅ critical |
| RBAC | sales rep + manager + admin | ✅ |

تحقق يدوي:
- [ ] هل duplicate detection robust (fuzzy match by phone, email, CR)?
- [ ] هل PDPL consent recorded with timestamp + IP?
- [ ] هل credit limit approval workflow enforced per tier?
- [ ] هل assigned sales rep load-balanced (avoid over-concentration)?
- [ ] هل ZATCA VAT verification mandatory للـ B2B Saudi clients?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/crm/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/crm_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
