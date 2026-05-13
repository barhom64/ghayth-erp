# /properties/contracts/create — `artifacts/ghayth-erp/src/pages/create/properties/contracts-create.tsx`

## 1. الميتاداتا
- المسار: `/properties/contracts/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/contracts-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:45`
- المجموعة: `properties`
- الكومبوننت: `ContractsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 542
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/properties/contracts` | POST | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L224: "مسح المسودة" → `clearDraft`
- L533: "(بلا تسمية)" → `() => setLocation("/properties/contracts")` 🔒
- L534: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
- GET `/properties/tenants`
- GET `/properties/owners`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء عقد إيجار جديد — Ejar-aware من البداية.

| الحقل | المتطلب |
|------|--------|
| Property | FK | إجباري — must be available |
| Tenant | client | راجع `crm/clients.md` — with national ID/CR |
| Start date / End date | duration | إجباري |
| Monthly rent | amount + currency | إجباري |
| Payment schedule | monthly/quarterly/annual | enum |
| Security deposit | amount | إجباري حسب policy |
| Penalty for late payment | % per period | configurable |
| Penalty for early termination | calculation | per clause |
| Maintenance clause | tenant/landlord/shared | enum |
| Utilities | who pays | enum |
| Subletting allowed | flag |
| Attachments | ID copy, contract draft | راجع `documents.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create draft | POST `/properties/contracts` | `property_contracts` (status=draft) | ✅ |
| Validate property available | check existing contracts | ✅ critical |
| Validate tenant credit | optional check | راجع `crm/clients.md` | ⚠ |
| Validate dates (no overlap) | with other contracts | ✅ critical |
| Approval workflow | property manager + finance | راجع `governance/approvals.md` | ✅ |
| Generate contract PDF | from template | راجع `documents-templates.md` | ✅ |
| E-signature | راجع `documents.md` | external integration | ⚠ |
| **Ejar registration** | external API call | **mandatory by law** | راجع `admin-integrations.md` ✅ critical |
| Activate post-Ejar | with reference | ✅ critical |
| Collect security deposit (initial) | راجع `finance-receipts.md` | with GL | ✅ critical |
| Generate first rent invoice | راجع `finance-invoices.md` | ZATCA-compliant | ✅ critical |
| Schedule recurring rent invoices | راجع `finance-recurring-invoices.md` | per payment schedule | ✅ |
| Update property status (available → occupied) | راجع `properties-byid.md` | ✅ |
| Notification (tenant + finance + property manager) | event=`contract_created` | راجع `notifications.md` | ✅ |
| تكامل مع Ejar | mandatory | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `crm/clients.md` (tenant) | linkage | ✅ |
| تكامل مع `documents-archive.md` (retention 10y) | ✅ critical |
| تكامل مع `governance-compliance.md` (Ejar standard) | ✅ critical |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | property manager + finance | ✅ |

تحقق يدوي:
- [ ] هل النظام يمنع إنشاء عقد على property مشغول (overlap)?
- [ ] هل Ejar registration حقيقاً mandatory قبل activation (لا workaround)?
- [ ] هل security deposit مفصول في حساب منفصل (escrow)?
- [ ] هل recurring rent invoices تتولد بدقة + ZATCA compliant?
- [ ] هل tenant credit check optional أم mandatory للعقود الكبيرة?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/contracts/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/properties_contracts_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
