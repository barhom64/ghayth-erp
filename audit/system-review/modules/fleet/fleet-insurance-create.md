# /fleet/insurance/create — `artifacts/ghayth-erp/src/pages/create/fleet/insurance-create.tsx`

## 1. الميتاداتا
- المسار: `/fleet/insurance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/fleet/insurance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:46`
- المجموعة: `fleet`
- الكومبوننت: `InsuranceCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 118
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/fleet/insurance` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L72: "مسح المسودة" → `clearDraft`
- L110: "(بلا تسمية)" → `() => setLocation("/fleet/insurance")` 🔒
- L111: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء وثيقة تأمين مركبة — mandatory Saudi vehicle insurance.

| نوع التأمين | الوصف |
|-----------|------|
| TPL (مسؤولية تجاه الغير) | mandatory by law | minimum coverage |
| Comprehensive (شامل) | full coverage | optional but recommended |
| Fleet policy | multiple vehicles | bulk discount |

| الحقل | المتطلب |
|------|--------|
| Vehicle | FK | إجباري |
| Insurance company | FK | reference data |
| Policy number | external | إجباري + unique |
| Type | TPL/Comprehensive | enum |
| Start date / End date | typically 1 year | إجباري |
| Premium amount | annual cost | إجباري |
| Coverage limits | per coverage type | optional |
| Deductible | per claim | optional |
| Add-ons | road-side, rental, GAP, etc. | optional |
| Document upload | policy PDF | إجباري |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create policy | POST `/fleet/insurance` | `vehicle_insurances` | ✅ |
| Validate vehicle has no active overlapping policy | guard | ✅ critical |
| Validate Saudi regulator (SAMA/IUMC) | optional | ⚠ |
| Pay premium (one-time or installments) | راجع `finance-payments.md` | ✅ critical |
| GL entry — prepaid insurance | Dr Prepaid Insurance / Cr Cash/AP | ✅ critical |
| Monthly amortization to expense | recurring | راجع `finance-recurring-journals.md` | ✅ |
| Update vehicle insurance status | راجع `fleet-byid.md` | ✅ critical |
| Renewal alert (90/60/30/7 يوم) | cron | راجع `notifications.md` | ✅ critical |
| Claims tracking | linkage | `insurance_claims` | راجع `fleet-insurance-claims.md` | ⚠ |
| Document storage | راجع `documents.md` | ✅ |
| Update fixed asset insurance | راجع `finance-fixed-assets-byid.md` | ✅ |
| تكامل مع `fleet-byid.md` (status reflects valid insurance) | ✅ critical |
| تكامل مع `finance-expenses.md` (amortization) | ✅ |
| تكامل مع `governance-compliance.md` (mandatory by law) | ✅ critical |
| Audit log إجباري | كل create/renewal/claim | `audit_logs` | ✅ critical |
| RBAC | fleet manager + finance | ✅ |

تحقق يدوي:
- [ ] هل النظام يمنع تشغيل vehicle بدون active insurance?
- [ ] هل overlap check صارم (لا تضارب بوليصتين على نفس vehicle)?
- [ ] هل auto-renewal option آمن (notification قبل auto-charge)?
- [ ] هل amortization monthly accurate?
- [ ] هل claims linked بسهولة للـ policy + maintenance + traffic violations؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/insurance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/fleet_insurance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
