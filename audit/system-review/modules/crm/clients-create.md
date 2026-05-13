# /clients/create — `artifacts/ghayth-erp/src/pages/create/clients-create.tsx`

## 1. الميتاداتا
- المسار: `/clients/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/clients-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:81`
- المجموعة: `crm`
- الكومبوننت: `ClientsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 180
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L81: "مسح المسودة" → `clearDraft`
- L172: "(بلا تسمية)" → `() => setLocation("/clients")` 🔒
- L173: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إنشاء عميل جديد (Create Client).

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| التحقق من duplicate (CR/tax_id/email/phone) | crm | unique constraints + soft check | ✅ |
| إنشاء العميل | `clients.ts` POST `/clients` | `clients` | ✅ |
| **ZATCA buyer info validation** | finance-zatca | tax_id format check, vat_number check | required لـ B2B invoicing | ⚠ تحقق |
| تخصيص portfolio (للـ sales rep) | hr | `clients.salespersonId` → `employees` | ✅ |
| Initial credit limit | finance | default per category أو manual | ⚠ |
| ربط بـ chart of accounts (AR sub-ledger) | finance | تلقائي per new client | ⚠ تحقق |
| إضافة لـ marketing audience | marketing | بناءً على opt-in | ⚠ |
| ربط بـ lead (لو من lead) | crm | `clients.linkedLeadId` → `crm_leads` | ✅ راجع `crm-leads-byid.md` |
| الترحيب welcome notification | comms | event=`client_created` | `notifications` | ⚠ |
| Audit log | core | `auditMiddleware` (`/clients`) | ✅ |
| RBAC: المسؤول عن خلق العملاء | RBAC level 30+ | ✅ |

تحقق يدوي:
- [ ] هل CR number unique على مستوى الـ tenant أم system-wide؟
- [ ] هل العميل المُنشَأ بدون اعتماد VAT صالح للفوترة فوراً أم يحتاج verification؟
- [ ] هل dedupe service يبحث عبر الـ phone numbers بمختلف الصياغات؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/clients/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/clients_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
