# تقرير العيوب الحرجة — Ghayth ERP

> **النوع**: قائمة شاملة بكل عيب اكتُشف من فحص الكود الساكن.
> **التاريخ**: 2026-05-29
> **التصنيف**: 🚨 BLOCKER / ⚠ MAJOR / 📝 MINOR

---

## 🚨 BLOCKERS — يجب الإصلاح قبل الإطلاق التجاري

### B1. لا يوجد Sign-Up UI
**الموقع**: `artifacts/ghayth-erp/src/pages/login.tsx:316`
**الوصف**: صفحة الدخول لا تحتوي أي زر "إنشاء حساب" أو "اشتراك جديد".
**الـbackend**: `auth.ts:228` (`/auth/register`) يرد **HTTP 405** ثابت: `"إنشاء الحسابات يتم بواسطة المسؤول فقط"`.
**الأثر**: مالك جديد **لا يستطيع** تأسيس شركته بدون مطور.
**الإصلاح**: بناء صفحة sign-up + backend handler للـself-registration.
**المُلَّاك المتأثرون**: 100% من العملاء الجدد.

### B2. لا توجد وحدة Subscription / Activation
**الموقع**: ولا في أي مكان من `artifacts/`
**الوصف**: لا UI page، لا API route، لا DB schema لـsubscription/billing/plan.
**الأثر**: النظام يفترض ضمنياً أن كل tenant مفعَّل دائماً. لا "trial expired"، لا حدود، لا upgrade path.
**الإصلاح**: بناء وحدة كاملة (subscription_plans + customer_subscriptions + activation flow).
**خيار قصير المدى**: ربط بـStripe/Tap/HyperPay كـMVP.

### B3. لا يوجد First-Time Setup Wizard
**الموقع**: `bootstrapAdmin.ts:151-159`
**الوصف**: عند DB فارغة، `bootstrapAdminUser()` يخرج بدون إنشاء owner. لا UI لكسر الـloop.
**الأثر**: deployment جديد على PostgreSQL فارغة → لا أحد يقدر يدخل، لا أحد يقدر ينشئ شركة → دورة معطلة.
**الإصلاح**: 
- Option A: واجهة setup wizard تظهر عند الـDB فارغة
- Option B: provisioning script يُنشئ owner + company واحد كـbootstrap

---

## ⚠ MAJOR — يجب إصلاحه في الإصدار التالي

### M1. ZATCA E-Invoice Mock في الإنتاج
**الموقع**: `finance-zatca.ts:701` + `umrahInvoicingEngine.ts:347`
**الوصف**: 
```typescript
const simulatedSuccess = settings.environment === "sandbox"; // mock
```
- **sandbox**: يرد `"accepted"` syntheti بدون شبكة
- **production**: لا يحتوي HTTPS call حقيقي لـZATCA Fatoora
**الأثر**: UI يقول "تم إرسال الفاتورة لـZATCA" لكن **لا شيء وصل**. شركة سعودية في مأزق ضريبي.
**الإصلاح**: provider حقيقي لـFatoora API (Phase 2 invoicing).
**Severity**: 🚨 BLOCKER إن كان المالك يصدر فواتير B2B.

### M2. HR End-of-Service GL — Non-Blocking خارج الـTransaction
**الموقع**: `hr-exit.ts:650-656`
**الوصف**: 
- `postExitSettlementGL` **مستدعى فعلاً** في الـroute (السطر 652)
- لكن مع `.catch(...)` non-blocking، **خارج** الـtransaction، **بعد** نقل lifecycle
- إذا فشل GL post: lifecycle جرى، assignment تم terminated، لكن لا JE
**الأثر**: نافذة سباق (race window) — إنهاء خدمة بدون JE المكافأة. ثغرة dual-entry في حال GL crash.
**الإصلاح**: نقل `postExitSettlementGL` داخل الـ`withTransaction` block + جعله blocking مع rollback عند الفشل.
**تصحيح**: التقييم الأصلي كان "engine غير مستدعى". الواقع: مستدعى لكن fire-and-forget.

### M3. Print Templates بدون Audit Log
**الموقع**: `routes/print.ts:328+` — كامل الملف
**الوصف**: 
- POST `/print/templates`, PATCH, DELETE كلها يحفظون بدون `createAuditLog` أو `emitEvent`
- 0 hits لـ audit في الـ1100+ سطر من print.ts
**الأثر**: تعديل letterhead = ZATCA QR placement = totals layout كل ذلك صامت. **ثغرة compliance**.
**الإصلاح**: إضافة `createAuditLog({entity:"document_templates", ...})` + `emitEvent({action:"print.template.updated"})` على كل mutation.

### M4. Document Access Log غير موجود ✅ FIXED in PR #1410
**الموقع**: `routes/documents.ts` — endpoints الـdownload/preview
**الإصلاح المنفذ**: 
- migration 234 أنشأ `document_access_log` table مع indexes
- `/documents/:id/download` يكتب row بـaccessType='download'
- `/documents/:id/preview` يكتب row بـaccessType='preview'
- endpoint جديد `GET /documents/:id/access-log` للمراجعة
**الأثر بعد الإصلاح**: كل وصول لمستند يُسجَّل (compliance-ready).

### M5. Document Retention Policy ✅ FIXED in PR #1461 follow-up
**الموقع**: migration 241 + `documents.ts /retention/backfill` + `/retention/due`
**الإصلاح المنفذ**: 
- جدولان جديدان: `retentionUntil` (date) + `retentionPolicy` (varchar) على `documents`
- `RETENTION_HORIZONS_YEARS` map: finance/contracts=10y، hr/legal/compliance=7y، operations/fleet/properties/umrah/marketing=5y، general=3y (مطابق لمتطلبات السوق السعودي)
- `POST /documents/retention/backfill` لإسناد retentionUntil على الصفوف الموجودة بناء على category
- `GET /documents/retention/due` يعرض المستندات المنتهية الفترة (للـcron أو الـadmin)
- الـhard delete يبقى عملية يدوية مراجعة (لا تلقائية صامتة).

### M6. Per-Document ACL غير موجود
**الموقع**: `documents.ts` — صلاحية على مستوى feature فقط
**الوصف**: لا `document_acls` table، لا per-document permissions.
**الأثر**: مستند سري يمكن وصول إليه من كل من له `documents:list`.
**الإصلاح**: implement document-level grant table.

### M7. Fuel Double-Counting Risk في الأسطول ✅ FIXED in PR #1490 follow-up
**الموقع**: migration 243 + `fleet.ts:1338-1365` (trip-complete) + `fleet.ts:2128+` (fuel-log)
**الإصلاح المنفذ**:
- migration 243 يضيف `tripId` (nullable integer) إلى `fleet_fuel_logs` + partial index
- `POST /fleet/fuel-logs` يقبل `tripId` اختياري ويفحص: الرحلة موجودة + المركبة متطابقة
- `POST /fleet/trips/:id/complete` يحسب `actualFuelFromLogs = SUM(totalCost)` للـfuel logs المرتبطة بالرحلة
- إذا `actualFuelFromLogs > 0`: trip-complete يستخدمه بدل التقدير، **وأيضاً** يمرر `glFuelCost = 0` للـtrip-completion GL post (لتجنب تكرار سطر fuel expense — fuel-log JE الأصلي يبقى وحده)
- إذا `actualFuelFromLogs = 0`: السلوك القديم (تقدير من distance/efficiency)
- **النتيجة**: لا يمكن تكرار قيد وقود لنفس الرحلة عند ربط fuel logs بـtripId.

### M8. legal_case لا يمكن إرفاق مستندات له
**الموقع**: `documents.ts:269` — allowed-type whitelist لا يشمل `legal_case`
**الوصف**: محامي يحاول رفع PDF حكم لقضية → الـvalidator يرفض.
**الأثر**: عملية أساسية مكسورة لـLegal Manager.
**الإصلاح**: إضافة `'legal_case'` للـwhitelist في `documents.ts:269`.

### M9. Umrah Agent Invoice GL Non-Blocking ✅ FIXED in follow-up PR
**الموقع**: `umrah.ts:1623+` + `eventListeners.ts`
**الإصلاح المنفذ**: 
- الـroute الآن يُطلق `umrah.agent_invoice.created` event دائماً (نجاح GL أو فشل)
- اكتُشف bug إضافي: الكود الأصلي يمرر `GLPostingResult` ككائن للـSQL — يخزن JSON في عمود integer
- listener جديد في `eventListeners.ts` يتحقق من غياب `journalEntryId` ويُعيد إنشاء الـJE عبر `createGuardedJournalEntry` (نفس نمط الـsales invoice)
**الأثر**: فاتورة وكيل عمرة لا يمكن أن توجد بدون JE صالح. الـrecovery يضمن المحاسبة المزدوجة حتى عند فشل الـinline GL.

### M10. CMSV6 Wialon/Teltonika Stubs
**الموقع**: `lib/integrations/cmsv6Adapter.ts:35` (enum) + `fleet-telematics.ts:251` (`buildAdapter` returns null)
**الوصف**: protocol enum يدعم 4 providers، فقط CMSV6 له adapter حقيقي. Wialon + Teltonika يرجعون null → fallback لـ`manual` mode.
**الأثر**: عميل عنده أجهزة Wialon → integration معطل، يحتاج إدخال يدوي.
**الإصلاح**: بناء adapters حقيقية لـWialon + Teltonika.

---

## 📝 MINOR — يمكن تأجيله

### N1. Departments tab يستخدم Generic CrudSection
**الموقع**: `settings.tsx:348`
**الوصف**: 3 حقول فقط (name، nameEn، manager). لا parent-department، لا cost-center binding.
**الإصلاح**: tab dedicated بنمط BranchesTab.

### N2. RBAC v2 mutations لا تظهر في `/admin/logs` ✅ FIXED in PR #1410
**الموقع**: `rbacV2.ts:128, 180, 209`
**الإصلاح المنفذ**: إضافة `createAuditLog` + `emitEvent` بجانب `recordHistory` على create/update/delete.

### N3. Numbering لا يُصدر events
**الموقع**: `numbering.ts:170-184`
**الوصف**: audit ✅ event ❌
**الإصلاح**: `emitEvent({action:"numbering.scheme.updated"})` بعد UPDATE.

### N4. Tires UI مفقود
**الموقع**: لا توجد `pages/fleet/tires.tsx`
**الوصف**: تظهر فقط كـpreventive task type
**الإصلاح**: بناء صفحة + entity.

### N5. Vehicle Rental Contracts غير موجودة
**الموقع**: لا UI، لا handler
**الوصف**: لا يمكن لـFleet Manager أن يؤجر مركبة لعميل.
**الإصلاح**: entity + UI + GL.

### N6. Accommodation كـEntity في العمرة مفقود
**الموقع**: `umrah_pilgrims.hotelName` (نص فقط)
**الوصف**: لا allotment، لا room-block management، لا per-night cost.
**الإصلاح**: hotels/rooms entities + allocation.

### N7. CRM Client → Portal Account Manual فقط
**الموقع**: `clients.ts:520` (emit) — لا listener
**الوصف**: قرار تصميمي (يحتاج password).
**الإصلاح اختياري**: auto-generate temp password + email.

### N8. Property Rent Payment لا يحدث CRM Client Ledger ✅ FIXED in PR #1426 follow-up
**الموقع**: `eventListeners.ts rent_payment.received listener`
**الإصلاح المنفذ**: الـlistener يحدث `clients.lastPaymentAt` و `lastActivityAt` على رحلة rent_payments → rental_contracts.tenantId → tenants.clientId → clients.id.

### N9. Legal Session → Tasks (لا task row) ✅ FIXED in PR #1410
**الموقع**: `routes/legal.ts:1079`
**الإصلاح المنفذ**: `INSERT INTO tasks` للجلسات المستقبلية مع linkedEntityType='legal_sessions'، priority حسب priority القضية.

### N10. Inbox Auto-Classify → Task ✅ FIXED in PR #1461 follow-up
**الموقع**: `mailboxSync.ts` (emit) + `eventListeners.ts` (classify)
**الإصلاح المنفذ**: 
- `mailboxSync.ts` يُطلق `inbox.message.received` event بعد كل INSERT في `message_log`
- listener جديد في `eventListeners.ts` يطبق rule table بكلمات مفتاحية عربية+إنجليزية (شكوى/complaint، عاجل/urgent، فاتورة/invoice، طلب/request، استفسار/inquiry)
- التصنيف ينشئ task مع `linkedEntityType='message_log'` و priority حسب النوع
- 5 قواعد افتراضية، قابلة للتوسع لاحقاً بـNLP حقيقي.

### N11. Comms Referral Chain ✅ FIXED in PR #1461 follow-up
**الموقع**: migration 240 + `communications.ts /log/:id/convert` + `/log/:id/referral-chain`
**الإصلاح المنفذ**:
- جدول `message_referrals` يحفظ كل hop مع `hopNumber` تصاعدي
- كل convert يضيف صف بـreason اختياري
- endpoint قراءة يعرض السلسلة كاملة مع أسماء المُحوِّل والمُستلِم.

### N12. Documents Classification Free-String
**الموقع**: `documents.ts:99-107`, `documents.ts:139-147` ✅ FIXED in PR #1426 follow-up
**الإصلاح المنفذ**: `DOCUMENT_CATEGORIES` enum ثابت (11 تصنيف: hr, finance, legal, contracts, compliance, operations, fleet, properties, umrah, marketing, general). Zod validators على createDocumentSchema + uploadDocumentSchema يرفضون أي قيمة خارج القائمة.

### N13. HR Org Structure RBAC Misalignment ✅ FIXED in follow-up PR
**الموقع**: `settings.ts:525,542,560` + `authorize.ts`
**الإصلاح المنفذ**: 
- helper جديد `authorizeAny()` يقبل عدة specs ويسمح إذا أي منها يمنح الصلاحية
- `/settings/departments` POST/PUT/DELETE الآن مفتوحة لـ`settings:update` OR `hr.organization:create|update|delete`
**الأثر**: HR Director يقدر إدارة الهيكل التنظيمي من صفحته دون الحاجة لـSysAdmin.

### N14. Create User بدون "إنشاء موظف" Shortcut
**الموقع**: `users-tab.tsx:46`
**الوصف**: يطلب employeeId موجود — لا inline modal لإنشاء موظف.
**الإصلاح**: button "+ موظف جديد" في الـdropdown.

### N15. Ejar Integration Fields-Only
**الموقع**: `properties.ts:1155-1378` (يخزن `ejarNumber` وغيره)
**الوصف**: لا API client حقيقي لإرسال للـEjar platform.
**الإصلاح**: بناء integration client.

### N16. Sadad Payment Integration غير موجودة
**الوصف**: `payment.method='sadad'` حر فقط، لا callback ولا verification.
**الإصلاح**: integration كاملة.

### N17. Nusk Integration Import-Only
**الوصف**: لا API client حي لـNusk. operator يحمّل من Nusk ويرفع للنظام.
**الإصلاح**: live integration.

### N18. لوحة P&L الشاملة ✅ FIXED in PR #1461 follow-up
**الموقع**: `execDashboard.ts /unified-pnl`
**الإصلاح المنفذ**: endpoint `GET /exec-dashboard/unified-pnl?from=&to=` يُجمّع الـrollup من `journal_lines`:
- `totals`: إجمالي إيراد، مصروف، صافي
- `bySource`: تصنيف حسب `sourceType` (umrah/property/fleet/legal/manual) مرتب بأكبر تأثير
- `byAccount`: أعلى 50 حساب بأبسولوت impact
- التواريخ تعتمد على `journal_entries.date` (ليس createdAt) ليأخذ الـback-dated entries في فترتها الصحيحة
- محمي بـ`requireExec` + `authorize({feature:"dashboard.executive",action:"view"})`.

### N19. Workflow.Approved Event بدون Cross-Domain Listener
**الموقع**: `workflowEngine.ts handlersByTable` (sync) vs event listener
**الوصف**: `workflow.approved` event موجود لكن listener فقط audit.
**الإصلاح**: التأكد ما يُعتمَد عليه (الـsync flip كاف).

---

## ملخص

| Severity | العدد |
|---|---|
| 🚨 BLOCKER | 3 |
| ⚠ MAJOR | 10 |
| 📝 MINOR | 19 |
| **المجموع** | **32** |

### قبل الإطلاق التجاري
يجب إصلاح: B1, B2, B3 (Onboarding + Subscription)
ينبغي إصلاح: M1 (ZATCA)، M2 (Exit GL)، M3 (Print Audit)، M7 (Fuel)، M8 (Legal Docs)

### بعد الإطلاق
كل الـMAJOR + الـMINOR ضمن backlog مرتب حسب الأولوية.

---

*وثيقة 6/7 من برنامج اختبار التشغيل الكامل لنظام غيث ERP.*
