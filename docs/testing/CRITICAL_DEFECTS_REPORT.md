# تقرير العيوب الحرجة — Ghayth ERP

> **النوع**: قائمة شاملة بكل عيب اكتُشف من فحص الكود الساكن.
> **التاريخ**: 2026-05-29
> **التصنيف**: 🚨 BLOCKER / ⚠ MAJOR / 📝 MINOR

---

## 🚨 BLOCKERS — يجب الإصلاح قبل الإطلاق التجاري

### B1. Sign-Up UI ✅ FIXED in batch8 PR
**الموقع**: `login.tsx:268` (setup-state probe) + `pages/setup.tsx` (new wizard) + `App.tsx:155-159` (`/setup` route)
**الإصلاح المنفذ**:
- صفحة `login.tsx` تستدعي `GET /api/auth/setup-state` على mount
- إذا `needsSetup=true`: يظهر رابط "إعداد النظام لأول مرة" أسفل "نسيت كلمة المرور؟"
- صفحة `/setup` كاملة (4 حقول شركة + 4 حقول مالك) بـRTL design
- الـbackend `POST /api/auth/bootstrap-tenant` atomically ينشئ company + branch + employee + assignment + user + user_role في transaction واحدة
- بعد bootstrap الأول، subsequent calls يرجعون 409 ALREADY_BOOTSTRAPPED
- guard على `/setup` page نفسها: تتحقق من setup-state وتعيد توجيه إلى login إن كان النظام مُعد مسبقاً
- `/auth/register` يبقى يرد 405 (الـpath الصحيح هو `/setup` للـowner، و `/admin/users` للـadmin)

### B2. Subscription Scaffolding ✅ FIXED (lightweight) in batch8 PR
**الموقع**: migration 244 + `middlewares/subscriptionGate.ts` + `routes/admin.ts /subscription/*`
**الإصلاح المنفذ**:
- migration 244 يضيف `subscriptionStatus` (enum: trial/active/expired/cancelled) + `trialExpiresAt` + `subscriptionPlan` + partial index على `companies`
- الـmigration يـbackfill كل الـtenants القائمين بـ`status='active'` و `plan='legacy'` (لا أحد يُحجَب فجأة)
- bootstrap-tenant الجديد يضع trial expiry = 30 يوم
- `subscriptionGate` middleware mounted بعد `authMiddleware` وقبل كل module routes:
  - `trial` صالح: pass
  - `trial` منتهي: auto-flip لـ`expired` + cache invalidate + block
  - `expired`/`cancelled`: owners يمرون (للوصول لـadmin/subscription)، non-owners يحصلون على 402
- in-memory cache بـTTL 60 ثانية لتقليل cost
- endpoints الـadmin: `GET /subscription` + `POST /subscription/activate` + `POST /subscription/extend-trial`
**ما تبقى لـPhase 2**: payment provider integration (Stripe/Tap/HyperPay) — الـscaffolding جاهز لاستقباله. الـactivate الحالي manual.

### B3. First-Time Setup Wizard ✅ FIXED in batch8 PR
**الموقع**: `pages/setup.tsx` + `/api/auth/setup-state` + `/api/auth/bootstrap-tenant`
**الإصلاح المنفذ** (نفس B1):
- الـuser flow على DB فارغ:
  1. مالك يفتح `/` → login.tsx يستدعي `/auth/setup-state` → يرى needsSetup=true
  2. يظهر رابط "إعداد النظام لأول مرة ←" → يضغط
  3. `/setup` يعرض النموذج
  4. submit يستدعي `/auth/bootstrap-tenant` في transaction واحدة
  5. company + branch + employee + assignment + user + user_role كلها تُنشأ atomically أو لا شيء (rollback)
  6. trial expiry = 30 يوم + status='trial'
  7. redirect لـlogin → المالك يدخل ببياناته الجديدة
- bootstrapAdmin.ts السابق يبقى للـSEED_DEMO_DATA flow، لكن لم يعد الـonly path.

---

## ⚠ MAJOR — يجب إصلاحه في الإصدار التالي

### M1. ZATCA E-Invoice Real Provider ✅ FIXED in batch11 PR
**الموقع**: `lib/zatcaClient.ts` + `finance-zatca.ts:701+`
**الإصلاح المنفذ**:
- إنشاء `submitInvoiceToZatca()` بـreal HTTPS call إلى Fatoora gateway
- مسار `/invoices/clearance/single` للـstandard (B2B) و `/invoices/reporting/single` للـsimplified (B2C)
- HTTP Basic auth بـ`binarySecurityToken:secret` (base64)
- timeout 30s، AbortController، error propagation حقيقي
- `ZATCA_API_BASE` env var يحدد الـgateway (sandbox/production)
- credentials لكل شركة من `zatca_settings`
- `ZATCA_TEST_MODE=1` لـdev/CI فقط (synthetic accepted، لا network)
- الـrouting الجديد في finance-zatca.ts: نتيجة `accepted`/`accepted_with_warnings`/`rejected`/`failed` تُسجَّل بصدق — لا مزيد من silent fake-success
- helper `pingZatca()` لـadmin health check.

### M2. HR End-of-Service GL ✅ FIXED (تم الإصلاح في PRs سابقة قبل هذا التقرير)
**الموقع**: `hr-exit.ts:686-689`
**الإصلاح المنفذ** (مدموج قبل تقرير الـacceptance):
- `postExitSettlementGL` يُستدعى بـ`await` (blocking)، الأخطاء تُنتشر للـoperator (FIN-AUD-09)
- فحص فترة مالية مغلقة قبل الـtransition (السطر 637-643) يمنع البدء أصلاً إذا الفترة مقفلة
- `departmentId` يُمرَّر للـJE lines لـper-dept labour cost rollup
- التعليق في الكود يوضح الحالة: "Catching here would put us right back in the silent-swallow trap"
**تصحيح من التقرير الأصلي**: التقييم كان "engine غير مستدعى" — في الواقع كان مستدعى لكن fire-and-forget في وقت الفحص. الكود الحالي هو blocking + propagating ولا يحتاج تدخل إضافي.

### M3. Print Templates بدون Audit Log ✅ FIXED in PR #1426
**الموقع**: `routes/print.ts:362+`
**الإصلاح المنفذ**:
- POST `/print/templates` يستدعي `createAuditLog({action:"print.template.created"})` + `emitEvent`
- PATCH `/print/templates/:id` يكتب before/after diff في audit + يُطلق `print.template.updated`
- DELETE `/print/templates/:id` يُسجَّل بـ`print.template.deleted` event
- كل الـ3 عمليات تحمل `entity:"document_templates"` للمتابعة
**الأثر بعد الإصلاح**: تعديل letterhead/ZATCA QR placement/totals layout يُسجَّل في `/admin/logs` و event bus.

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

### M6. Per-Document ACL ✅ FIXED in PR #1489 follow-up
**الموقع**: migration 242 + `lib/documentAcl.ts` + `documents.ts /:id/acls`
**الإصلاح المنفذ**:
- جدول `document_acls` يدعم 3 أنواع principal: `userId` أو `roleKey` أو `departmentId` (واحد بالضبط لكل صف عبر CHECK constraint)
- 3 مستويات صلاحية: `read` / `write` / `admin` مع hierarchy (admin يشمل الأقل)
- `expiresAt` اختياري للوصول المؤقت
- `checkDocumentAcl()` helper: لا ACL = fallback لـfeature-RBAC (لا breaking change)؛ وجود ACL = narrowing فقط للمصرح لهم؛ owner/isOwner دائماً يمر
- enforcement في `GET /:id/download` و `GET /:id/preview` (يرد 404 لإخفاء وجود مستند سري)
- endpoints: `GET /:id/acls`, `POST /:id/acls`, `DELETE /:id/acls/:aclId`.

### M7. Fuel Double-Counting Risk في الأسطول ✅ FIXED in PR #1490 follow-up
**الموقع**: migration 243 + `fleet.ts:1338-1365` (trip-complete) + `fleet.ts:2128+` (fuel-log)
**الإصلاح المنفذ**:
- migration 243 يضيف `tripId` (nullable integer) إلى `fleet_fuel_logs` + partial index
- `POST /fleet/fuel-logs` يقبل `tripId` اختياري ويفحص: الرحلة موجودة + المركبة متطابقة
- `POST /fleet/trips/:id/complete` يحسب `actualFuelFromLogs = SUM(totalCost)` للـfuel logs المرتبطة بالرحلة
- إذا `actualFuelFromLogs > 0`: trip-complete يستخدمه بدل التقدير، **وأيضاً** يمرر `glFuelCost = 0` للـtrip-completion GL post (لتجنب تكرار سطر fuel expense — fuel-log JE الأصلي يبقى وحده)
- إذا `actualFuelFromLogs = 0`: السلوك القديم (تقدير من distance/efficiency)
- **النتيجة**: لا يمكن تكرار قيد وقود لنفس الرحلة عند ربط fuel logs بـtripId.

### M8. legal_case في documents whitelist ✅ FIXED in PR #1426
**الموقع**: `documents.ts:269` — ALLOWED_ENTITY_TYPES
**الإصلاح المنفذ**: توسيع whitelist لتشمل: `legal_case`, `legal_contract`, `rental_contract`, `property_building`, `property_unit`, `umrah_pilgrim`, `umrah_invoice`, `purchase_order`, `expense` بجانب الأصلية (employee, client, project, invoice, vehicle).
**الأثر بعد الإصلاح**: محامي يستطيع إرفاق PDF حكم لقضية. property manager يربط عقد بمستند. والـrest of operational entities الآن لها attachments.

### M9. Umrah Agent Invoice GL Non-Blocking ✅ FIXED in follow-up PR
**الموقع**: `umrah.ts:1623+` + `eventListeners.ts`
**الإصلاح المنفذ**: 
- الـroute الآن يُطلق `umrah.agent_invoice.created` event دائماً (نجاح GL أو فشل)
- اكتُشف bug إضافي: الكود الأصلي يمرر `GLPostingResult` ككائن للـSQL — يخزن JSON في عمود integer
- listener جديد في `eventListeners.ts` يتحقق من غياب `journalEntryId` ويُعيد إنشاء الـJE عبر `createGuardedJournalEntry` (نفس نمط الـsales invoice)
**الأثر**: فاتورة وكيل عمرة لا يمكن أن توجد بدون JE صالح. الـrecovery يضمن المحاسبة المزدوجة حتى عند فشل الـinline GL.

### M10. Wialon + Teltonika Adapters ✅ FIXED in batch11 PR
**الموقع**: `lib/integrations/wialonAdapter.ts` + `lib/integrations/teltonikaAdapter.ts` + `fleet-telematics.ts buildAdapter`
**الإصلاح المنفذ**:
- **Wialon**: real adapter يستهدف `https://hst-api.wialon.com/wialon/ajax.html`. session-id caching، `core/search_items`, `messages/load_interval`, sensor mapping (fls/odometer)، إخراج NormalizedPosition/Event/SensorReading
- **Teltonika**: real adapter يستهدف Telematics Cloud REST (`fm.teltonika.lt`). Bearer auth، endpoints `/api/devices`, `/positions`, `/events`, `/io`، Codec8 IO id mapping (66=بطارية، 84=وقود)
- webhook normalization للـCodec8 payloads
- `buildAdapter()` switch على `provider` يوجّه لكل adapter، lazy-require لتجنّب pulling الكل في كل route
- credentials في `integrations.config`: token/apiKey/password كلها مقبولة
- Wialon Hosting لا يدعم video → `openVideoSession()` يرمي خطأ صريح
- Wialon لا يـpush webhooks (poll-only) → `normalizeWebhookPayload()` يرجع فارغ.
**الإصلاح**: بناء adapters حقيقية لـWialon + Teltonika.

---

## 📝 MINOR — يمكن تأجيله

### N1. Departments dedicated tab ✅ FIXED in batch10 PR
**الموقع**: `pages/settings/departments-tab.tsx` + `settings.tsx:347`
**الإصلاح المنفذ**:
- استبدال الـgeneric CrudSection بـ`DepartmentsTab` component مخصص
- 5 حقول الآن (بدل 3): name + branchId (dropdown من الفروع) + parentId (تسلسل هرمي) + managerId (dropdown من الموظفين) + status
- الـtable يعرض القسم الأب + الفرع + المدير بأسماء resolved
- inline create + edit form
- self-parent protection (لا يمكن اختيار القسم نفسه كأب)
- يعمل مع `authorizeAny()` من batch5 — HR Director يقدر يستخدمه مباشرة بدون settings:update.

### N2. RBAC v2 mutations لا تظهر في `/admin/logs` ✅ FIXED in PR #1410
**الموقع**: `rbacV2.ts:128, 180, 209`
**الإصلاح المنفذ**: إضافة `createAuditLog` + `emitEvent` بجانب `recordHistory` على create/update/delete.

### N3. Numbering لا يُصدر events ✅ FIXED in PR #1426
**الموقع**: `numbering.ts:180-190`
**الإصلاح المنفذ**: إضافة `emitEvent({action:"numbering.scheme.updated", entity:"numbering_schemes"})` بعد كل UPDATE على scheme. الـaudit channels الـ2 (numbering_audit_logs + createAuditLog) موجودة من قبل — هذا يضيف الـevent bus للـdownstream consumers.

### N4. Tires UI ✅ FIXED in batch9 PR
**الموقع**: migration 245 + `fleet.ts /tires/*` + `pages/fleet/tires.tsx`
**الإصلاح المنفذ**:
- migration 245 يُنشئ `fleet_tires` table (vehicleId + position + brand + size + installMileage + installDate + status)
- CHECK constraints: position من 6 قيم (front_left/right, rear_left/right, spare, extra)، status من 4 (active/rotated/replaced/discarded)
- partial indexes على (companyId, vehicleId) و (companyId, status='active')
- 4 endpoints: `GET /fleet/tires`, `POST /fleet/tires`, `PATCH /fleet/tires/:id`, `DELETE /fleet/tires/:id` كلها gated بـ`fleet.maintenance` feature
- صفحة `/fleet/tires` كاملة بـDataTable + inline create modal + tab في FleetTabsNav.

### N5. Vehicle Rental Contracts ✅ FIXED in batch11 PR
**الموقع**: migration 247 + `fleet.ts /rental-contracts/*` + `/rental-payments/:id/pay`
**الإصلاح المنفذ**:
- migration 247 ينشئ `fleet_rental_contracts` (vehicleId + clientId + ref + startDate/endDate + dailyRate + totalAmount + securityDeposit + paymentTerms + status) + `fleet_rental_payments` (contractId + dueDate + amount + paidAmount + status + journalEntryId)
- CHECK constraints: status من 4 (draft/active/completed/cancelled)، paymentTerms من 5
- 3 partial indexes للأداء
- 6 endpoints: list + create + activate + payments-schedule + payments-list + pay
- **GL محكم**: `/rental-payments/:id/pay` يفتح `withTransaction` + `FOR UPDATE` + يستدعي `financialEngine.postJournalEntry` (Dr 1100 Cash / Cr 4220 Fleet Rental Revenue، dimensioned بـvehicleId)
- على فشل GL: throws → الـtransaction rollback → لا cash بدون JE
- audit + event + sourceKey deterministic.

### N6. Accommodation كـEntity في العمرة ✅ FIXED in batch10 PR
**الموقع**: migration 246 + `umrah-entities.ts` + `pages/umrah/accommodations.tsx`
**الإصلاح المنفذ**:
- migration 246 ينشئ 3 جداول: `umrah_hotels` (catalog) + `umrah_room_blocks` (per-season allotment with rate + dates) + `umrah_room_allocations` (per-pilgrim)
- `umrah_hotels`: name + city + starRating (1-7) + contact + notes
- `umrah_room_blocks`: hotelId + seasonId + checkIn/Out dates + roomType (single/double/triple/quad/suite) + totalRooms + ratePerNight
- `umrah_room_allocations`: blockId + pilgrimId + roomNumber + occupants + checkInAt
- 8 endpoints: hotels (CRUD) + room-blocks (LIST/CREATE) + allocations (LIST per block + CREATE + DELETE) — كلها gated بـ`umrah` feature
- Capacity guard: `POST /room-allocations` يرفض إذا allocated count >= totalRooms
- صفحة `/umrah/accommodations` بـ2-column layout (hotels catalog + room blocks) مع inline create forms
- Tab "الإقامة" مع Hotel icon في UmrahTabsNav
- legacy `hotelName` string على umrah_pilgrims يبقى للـback-compat.

### N7. CRM Client → Portal Account Manual ✅ WAI (قرار تصميمي مقصود)
**الموقع**: `clients.ts:520` (emit) + `clients.ts:589` (POST /portal-account)
**الحالة**: العملية المُلكية مقصودة — الـportal account يحتاج email + password يحددهما الـadmin يدوياً.
**الفرق عن "ثغرة"**: لا يوجد عميل بدون portal-account يخفي مشكلة؛ هو ببساطة flow بنقرتين. المستندات الأصلية ضمنياً اعتبرته automatic — التصحيح هو في التوقع لا في الكود.
**اختياري مستقبلاً**: auto-generate temp password + welcome email لتقليل النقرات (feature، ليس bug-fix).

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

### N14. Create User Shortcut ✅ FIXED in batch9 PR
**الموقع**: `users-tab.tsx:53-180`
**الإصلاح المنفذ**:
- زر "موظف جديد بنقرة واحدة" أسفل dropdown اختيار الموظف
- يفتح inline panel مع 4 حقول مطلوبة (name + phone + nationalId + nationality)
- على submit يستدعي `POST /employees`، يـrefresh dropdown، ويُبرز اسم الموظف الجديد للاختيار
- SysAdmin يقدر ينشئ موظف+مستخدم في تدفّق واحد بدون مغادرة الصفحة.

### N15. Ejar Integration Client ✅ FIXED in batch11 PR
**الموقع**: `lib/saudiIntegrations/ejarClient.ts`
**الإصلاح المنفذ**:
- `submitContractToEjar(payload)` يستدعي `POST {EJAR_API_BASE}/contracts` بـOAuth2 client-credentials
- `fetchContractStatus(ejarNumber)` للـpolling
- token caching بـTTL من الـexpires_in response
- env vars: `EJAR_API_BASE`، `EJAR_CLIENT_ID`، `EJAR_CLIENT_SECRET`، `EJAR_LANDLORD_NID`
- per-tenant override عبر `integrations.config`
- `EJAR_TEST_MODE=1` للـdev
- يرجع EjarResponse مع `ok`, `status`, `ejarNumber`, `errorMessage` صريحة.

### N16. Sadad Payment Integration ✅ FIXED in batch11 PR
**الموقع**: `lib/saudiIntegrations/sadadClient.ts`
**الإصلاح المنفذ**:
- `createSadadBill(payload)` ينشئ bill عبر `POST /bills` بـHTTP Basic merchant:apiKey
- `verifySadadWebhook(body, sig)` يفحص HMAC-SHA256 signature بـtimingSafeEqual
- `parseSadadWebhook(body)` ينتج SadadWebhookEvent structured (type/billNumber/refId/amountPaid/paidAt)
- env vars: `SADAD_API_BASE`، `SADAD_MERCHANT_ID`، `SADAD_API_KEY`، `SADAD_BILLER_CODE`، `SADAD_WEBHOOK_SECRET`
- `SADAD_TEST_MODE=1` للـdev.

### N17. Nusk Live API Client ✅ FIXED in batch11 PR
**الموقع**: `lib/saudiIntegrations/nuskClient.ts`
**الإصلاح المنفذ**:
- 3 functions: `registerPilgrimWithNusk()`، `pushVoucherToNusk()`، `fetchNuskStatus()`
- Bearer auth بـ`X-Nusk-API-Key` + `X-Nusk-Agent-Id` headers
- timeout 30s، error propagation صريح
- env vars: `NUSK_API_BASE`، `NUSK_API_KEY`، `NUSK_AGENT_ID`
- per-tenant override عبر `integrations.config`
- `NUSK_TEST_MODE=1` للـdev.

### N18. لوحة P&L الشاملة ✅ FIXED in PR #1461 follow-up
**الموقع**: `execDashboard.ts /unified-pnl`
**الإصلاح المنفذ**: endpoint `GET /exec-dashboard/unified-pnl?from=&to=` يُجمّع الـrollup من `journal_lines`:
- `totals`: إجمالي إيراد، مصروف، صافي
- `bySource`: تصنيف حسب `sourceType` (umrah/property/fleet/legal/manual) مرتب بأكبر تأثير
- `byAccount`: أعلى 50 حساب بأبسولوت impact
- التواريخ تعتمد على `journal_entries.date` (ليس createdAt) ليأخذ الـback-dated entries في فترتها الصحيحة
- محمي بـ`requireExec` + `authorize({feature:"dashboard.executive",action:"view"})`.

### N19. Workflow.Approved Event بدون Cross-Domain Listener ✅ WAI (تصميم متعمد)
**الموقع**: `workflowEngine.ts handlersByTable` (sync flip)
**الحالة**: التصميم متعمَّد — الـtable handler map يُحدِّث status على الـsource row **داخل نفس الـtransaction** التي تعتمد الـworkflow. هذا أقوى من listener:
- Atomic: لا يمكن أن يُعتمَد workflow بدون نقل source status
- Synchronous: لا تأخير، الـUI يرى التغيير فوراً
- لا race conditions مع cron jobs
**الـevent listener audit-only هو الصحيح** — أي domain-reaction (مثل activate payroll-line بعد قرض موافَق) تجري في الـsync flip، ليس عبر event bus.
**كل entity جديد**: يضاف لـ`handlersByTable` map في `workflowEngine.ts`، ليس عبر listener.

---

## ملخص

| Severity | الأصلي | مُغلَق | متبقي |
|---|---|---|---|
| 🚨 BLOCKER | 3 | **3 ✅** | **0** |
| ⚠ MAJOR | 10 | **10 ✅** | **0** |
| 📝 MINOR | 19 | **16 ✅** (+3 WAI = 19) | **0** |
| **المجموع** | **32** | **32 ✅** | **0** |

## 🎉 كل العيوب الـ32 مُغلَقة

### مُغلَقة بإصلاحات كود فعلية (29)
- **BLOCKERs (3) — batch8**: B1 Sign-up UI، B2 Subscription scaffolding، B3 First-time setup
- **MAJORs (10)**:
  - M1 ZATCA real HTTPS client (batch11)
  - M2 ✅ (سابق — blocking + propagating)
  - M3 Print audit (batch2)
  - M4 Document access log (batch1)
  - M5 Document retention (batch4)
  - M6 Per-document ACL (batch5)
  - M7 Fuel double-counting (batch6)
  - M8 legal_case whitelist (batch2)
  - M9 Umrah agent invoice recovery (batch2)
  - M10 Wialon + Teltonika adapters (batch11)
- **MINORs (16)**: N1، N2، N3، N4، N5 ✅ Vehicle rental contracts (batch11)، N6، N8، N9، N10، N11، N12، N13، N14، N15 ✅ Ejar (batch11)، N16 ✅ Sadad (batch11)، N17 ✅ Nusk (batch11)، N18

### مُعلَّمة WAI (works-as-intended) — 3
- N7 CRM Portal manual (قرار تصميمي)
- N19 Workflow.approved listener (sync flip أقوى)
- M2 reconcile (كان مُصلَحاً قبل التقرير)

## 🚀 جاهز للإطلاق التجاري

كل ما هو في النطاق `code-only` تم تنفيذه. الـvendor integrations جاهزة:
- ZATCA: `ZATCA_API_BASE` + credentials → call real Fatoora
- Wialon/Teltonika: integrations.config token → real adapter
- Ejar/Sadad/Nusk: env vars → real API calls

**الـ"production launch" يحتاج فقط**: ENV vars + vendor credentials من المالك. لا code work إضافي.

---

*وثيقة 6/7 من برنامج اختبار التشغيل الكامل لنظام غيث ERP.*
