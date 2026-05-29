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

### M4. Document Access Log غير موجود
**الموقع**: `routes/documents.ts` — endpoints الـdownload/preview
**الوصف**: 
- لا `document_access_log` table
- downloads/previews لا تُسجَّل في audit
- لا per-document ACL — فقط feature-level RBAC
**الأثر**: شخص بصلاحية `documents:list` يقدر يحمّل كل مستندات الشركة بدون أي أثر. لـbig 4 audit هذا غير مقبول.
**الإصلاح**:
1. migration ينشئ `document_access_log` table
2. كل GET على document content يكتب row
3. retention policy column على documents

### M5. Document Retention Policy غير موجودة
**الموقع**: `documents.ts` 
**الوصف**: لا scheduled task يحذف المستندات بعد فترة retention. لا حقل `retentionUntil` على الـrow.
**الأثر**: تخزين سحابي يكبر باستمرار، خرق PDPL محتمل (الـPDPL يلزم حذف PII بعد فترة).
**الإصلاح**: حقل + cron + workflow.

### M6. Per-Document ACL غير موجود
**الموقع**: `documents.ts` — صلاحية على مستوى feature فقط
**الوصف**: لا `document_acls` table، لا per-document permissions.
**الأثر**: مستند سري يمكن وصول إليه من كل من له `documents:list`.
**الإصلاح**: implement document-level grant table.

### M7. Fuel Double-Counting Risk في الأسطول
**الموقع**: `fleet.ts:2096` (fuel-log) vs `fleet.ts:1283` (trip-complete)
**الوصف**: 
1. السائق يسجل دفعة وقود → `fleet_fuel_logs` + JE fuel expense
2. عند إقفال الرحلة، الـengine يحسب وقود تقديري من المسافة + كفاءة → JE ثاني لـfuel expense على نفس الرحلة
**الأثر**: تضخم مصروف الوقود في الـGL.
**الإصلاح**: ربط `fleet_fuel_logs.tripId` وخصم الـactual من الـtrip-complete estimate.

### M8. legal_case لا يمكن إرفاق مستندات له
**الموقع**: `documents.ts:269` — allowed-type whitelist لا يشمل `legal_case`
**الوصف**: محامي يحاول رفع PDF حكم لقضية → الـvalidator يرفض.
**الأثر**: عملية أساسية مكسورة لـLegal Manager.
**الإصلاح**: إضافة `'legal_case'` للـwhitelist في `documents.ts:269`.

### M9. Umrah Agent Invoice GL Non-Blocking
**الموقع**: `umrah.ts:1508-1510`
**الوصف**: 
- Sales invoice path: blocking GL ✅
- **Agent invoice path**: `.catch(...)` non-blocking — invoice قد يُحفظ بدون JE
**الأثر**: نافذة سباق (race window) حيث فاتورة وكيل عمولة موجودة بدون قيد محاسبي → ميزان مراجعة off.
**الإصلاح**: تحويل لـblocking pattern + reconciliation listener.

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

### N2. RBAC v2 mutations لا تظهر في `/admin/logs`
**الموقع**: `rbacV2.ts:128`
**الوصف**: يكتب فقط لـ`rbac_role_history`، لا `createAuditLog` للـunified feed.
**الإصلاح**: إضافة `createAuditLog` بجانب `recordHistory`.

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

### N8. Property Rent Payment لا يحدث CRM Client Ledger
**الموقع**: `properties.ts:1992-2005`
**الوصف**: `tenantId` على الـJE فقط، لا UPDATE لـ`clients.lastPaymentAt`.
**الإصلاح**: listener `rent_payment.received` يحدث `clients.lastPaymentAt`.

### N9. Legal Session → Tasks (لا task row)
**الموقع**: `routes/legal.ts:961-980`
**الوصف**: يُنشئ notification + obligation لكن لا task.
**الإصلاح**: إضافة `INSERT INTO tasks` بجانب notification.

### N10. Inbox Auto-Classify → Task محدود
**الموقع**: `communications.ts:502`
**الوصف**: يعمل فقط على PBX no-answer، باقي القنوات تحتاج conversion يدوي.
**الإصلاح**: NLP classifier + auto-routing.

### N11. Comms Referral Chain لا يُحفظ
**الموقع**: لا `referral_chain` table
**الوصف**: multi-hop forwarding يفقد intermediate steps.
**الإصلاح**: entity جديد + audit chain.

### N12. Documents Classification Free-String
**الموقع**: `documents.ts`
**الوصف**: classification field نص حر، لا taxonomy enforcement.
**الإصلاح**: enum + dropdown.

### N13. HR Org Structure RBAC Misalignment
**الموقع**: `hr/organization-structure.tsx` → `settings.ts:525`
**الوصف**: HR Director بدون `settings:update` لا يقدر يدير org structure.
**الإصلاح**: تحويل الـpermission إلى `hr.organization` أو منح Director الـdual.

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

### N18. لا يوجد لوحة "P&L الشاملة"
**الموقع**: dashboards منفصلة per-module
**الوصف**: لا يوجد لوحة تجمع Finance + Property + Fleet + Umrah + Legal في rollup واحد.
**الإصلاح**: dashboard جديد يستخدم الـ`vehicleId/tenantId/agentId` dimensions على JE.

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
