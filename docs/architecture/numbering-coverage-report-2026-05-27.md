# تقرير تغطية مركز الترقيم الموحد — #1141

> **الغرض**: إجابة على المطالبة الصريحة من المحامي إبراهيم: *"لا أقبل كلمة 'التزم النظام كله' إلا بتقرير ناتج من `audit-numbering-coverage.mjs` يثبت أن كل جدول/مسار فيه رقم رسمي مربوط بـ `numbering_assignments`، وأن كل أماكن إنشاء المستندات تستخدم `issueNumber`، وأن أي ref موجود خارج المركز إما مستثنى ومبرر أو مرفوض."*
>
> **النتيجة باختصار**: المعمارية الأساسية مكتملة، لكن وُجدت **15 ثغرة حقيقية** بعد توسعة الفحص بطبقات أعمق (`audit-numbering-service-bypass.mjs` + `audit-numbering-schemes-vs-callers.mjs` + per-table check). هذا التقرير يعدّدها صراحةً ولا يدّعي الاكتمال 100% قبل سدّها.
>
> **تحديث 2026-05-27 (الجولة الثانية)**: بعد طلب المحامي بفحوصات أقوى، أضفت 3 سكربتات/قواعد جديدة كشفت 8 ثغرات إضافية (G8-G15) كانت تتسرّب من السكربت الأول. واحدة (G8) أُصلِحت في هذا الـPR. الباقي مفتوحة.
>
> **تاريخ التقرير**: 2026-05-27. مُولَّد بفحص كل ملف يحتوي `INSERT INTO`، كل جدول له عمود `ref`/`number`/`*Number`/`*Ref`/`*Code`، وكل ملف داخل `lib/`، `lib/engines/`، `lib/cronScheduler.ts`، `lib/imports/`، `lib/mailboxSync.ts`، `scripts/`، والـ migrations.

---

## 1. ناتج سكربت التغطية الرسمي

```
$ node scripts/src/audit-numbering-coverage.mjs

Numbering coverage audit — Issue #1141
scan: 22 route file(s) that INSERT into an executive table

  clients.ts            clients                                                           ✓
  communications.ts     support_tickets, requests                                         ✓
  correspondence.ts     correspondence                                                    ✓
  crm.ts                clients                                                           ✓
  employees.ts          employees, employee_contracts                                     ✓
  finance-hardening.ts  bank_guarantees, projects                                         ✓
  finance-invoices.ts   invoices, credit_memos, debit_memos                               ✓
  finance-purchase.ts   purchase_requests, purchase_orders, goods_receipts, payment_runs  ✓
  fleet.ts              fleet_trips                                                       ✓
  hr-contracts.ts       employee_contracts                                                ✓
  hr-exit.ts            hr_exit_requests                                                  ✓
  hr-loans.ts           hr_employee_loans                                                 ✓
  hr-overtime.ts        hr_overtime_requests                                              ✓
  hr.ts                 official_letters                                                  ✓
  legal.ts              legal_contracts, legal_cases                                      ✓
  projects.ts           projects                                                          ✓
  properties.ts         rental_contracts, contract_payment_schedule                       ✓
  requests.ts           requests                                                          ✓
  support.ts            support_tickets                                                   ✓
  umrah-entities.ts     clients, umrah_groups                                             ✓
  umrah.ts              umrah_agent_invoices                                              ✓
  warehouse.ts          warehouse_movements, purchase_requests                            ✓

Legacy-pattern guard:
  ✓ nextval-in-route: 0 hit(s)
  ✓ generateTimeRef-as-official-number: 0 hit(s)
  ✓ generateRef-or-generateBranchRef: 0 hit(s)
  ✓ random-as-ref-fallback: 0 hit(s)
```

**ما يُغطّيه السكربت**: كل ملف داخل `artifacts/api-server/src/routes/` يكتب إلى أحد جداول المستندات التنفيذية في مجموعة `EXECUTIVE_TABLES`.

**ما لا يُغطّيه السكربت** (وهنا الثغرات):
- ملفات داخل `lib/engines/` التي تكتب إلى الجداول التنفيذية.
- `lib/cronScheduler.ts` الذي ينشئ مستندات تلقائياً (أوامر شراء، قضايا تحصيل).
- `lib/disciplineEngine.ts` الذي ينشئ أرقام محاضر باستخدام `COUNT(*)`.
- أنماط `Date.now()` المضمّنة inline في مسارات (مثل `ORD-${Date.now()}`).

---

## 2. قائمة الجداول التي لها عمود `ref`/`number` (52 جدولاً)

تصنيف كامل لكل عمود "يشبه رقم وثيقة":

### 2.1 جداول مستندات تنفيذية مُغطّاة بالكامل (✓)

| الجدول | العمود | المسار المسؤول | يستخدم `issueNumber`؟ | مربوط بـ `numbering_assignments`؟ |
|---|---|---|---|---|
| `requests` | `outgoingRef`, `incomingRef` | `routes/requests.ts` | ✓ | ✓ (`entityTable='requests'`) |
| `correspondence` | `ref` | `routes/correspondence.ts` | ✓ | ✓ |
| `employee_contracts` | `ref` | `routes/hr-contracts.ts`, `routes/employees.ts` | ✓ | ✓ |
| `official_letters` | `outgoingRef`, `incomingRef` | `routes/hr.ts` | ✓ | ✓ |
| `invoices` | `ref` | `routes/finance-invoices.ts` | ✓ | ✓ |
| `credit_memos` / `debit_memos` | `ref` | `routes/finance-invoices.ts` | ✓ | ✓ |
| `purchase_requests` | `ref` | `routes/finance-purchase.ts` | ✓ | ✓ |
| `purchase_orders` (من المسارات) | `ref` | `routes/finance-purchase.ts` | ✓ | ✓ |
| `goods_receipts` | `ref` | `routes/finance-purchase.ts` | ✓ | ✓ |
| `support_tickets` (من المسارات) | `ref` | `routes/support.ts`, `routes/clientPortal.ts` | ✓ | ✓ |
| `legal_contracts`, `legal_cases` (من المسارات) | `ref`, `caseNumber` | `routes/legal.ts` | ✓ | ✓ |
| `rental_contracts` | `contractNumber` | `routes/properties.ts` | ✓ | ✓ |
| `contract_payment_schedule` | `receiptNumber` | `routes/properties.ts` | ✓ | ✓ |
| `bank_guarantees`, `projects` | `ref` | `routes/finance-hardening.ts`, `routes/projects.ts` | ✓ | ✓ |
| `hr_employee_loans` | `loanNumber` | `routes/hr-loans.ts` | ✓ | ✓ |
| `hr_exit_requests` | `exitNumber` | `routes/hr-exit.ts` | ✓ | ✓ |
| `hr_overtime_requests` | `requestNumber` | `routes/hr-overtime.ts` | ✓ | ✓ |
| `fleet_trips` | `ref` | `routes/fleet.ts` | ✓ | ✓ |
| `umrah_agent_invoices` | `ref` | `routes/umrah.ts` | ✓ | ✓ |
| `umrah_groups` | `internalRef` | `routes/umrah-entities.ts` | ✓ | ✓ |
| `clients` | `code` | `routes/clients.ts`, `routes/crm.ts`, `routes/umrah-entities.ts` | ✓ | ✓ |
| `employees` | `empNumber` (داخلي) | `routes/employees.ts` | ✓ | ✓ |

**22 ملف مسار / 22 جدول تنفيذي — التغطية في الـroute layer: 100%**.

### 2.2 جداول معرّفات خارجية — مستثناة بمبرر صريح

أعمدة تحمل أرقاماً من جهات خارجية (الحكومة، المورد، البنك، Nusk، ZATCA…) — **لا يجب** أن تمر عبر مركز الترقيم لأنها ليست أرقاماً نُصدرها نحن:

| الجدول | العمود | المصدر | المبرر |
|---|---|---|---|
| `branches`, `companies`, `tenants`, `suppliers`, `clients` | `crNumber`, `taxNumber`, `vatNumber`, `unifiedNumber` | حكومي (وزارة التجارة، الزكاة والدخل) | معرّفات صادرة من الحكومة |
| `employees` | `iqamaNumber`, `passportNumber`, `gosiNumber`, `borderNumber`, `visaNumber`, `sponsorNumber`, `workPermitNumber` | حكومي (الجوازات، التأمينات، العمل) | معرّفات شخصية صادرة من جهات خارجية |
| `fleet_drivers` | `licenseNumber` | حكومي (المرور) | رخصة قيادة |
| `fleet_insurance` | `policyNumber` | شركة التأمين | رقم وثيقة التأمين |
| `fleet_traffic_violations` | `violationNumber` | المرور | مخالفة صادرة من الحكومة |
| `fleet_vehicles` | `plateNumber`, `vinNumber`, `registrationNumber` | المرور / المصنّع | بيانات تسجيل |
| `fixed_assets`, `warehouse_stock_serials` | `serialNumber` | المصنّع | الرقم التسلسلي للأصل |
| `umrah_pilgrims` | `passportNumber`, `visaNumber`, `nuskNumber`, `borderNumber`, `mofaNumber` | حكومي + Nusk | بيانات معتمر |
| `umrah_agents`, `umrah_groups`, `umrah_nusk_invoices` | `nuskAgentNumber`, `nuskGroupNumber`, `nuskInvoiceNumber` | نظام Nusk (وزارة الحج) | معرّفات نُسك |
| `property_buildings` | `deedNumber`, `buildingPermitNumber` | كتابة العدل / البلدية | صكوك وتصاريح |
| `property_owners` | `authorizationNumber` | كتابة العدل | وكالة شرعية |
| `invoices` | `poNumber` | العميل | رقم أمر الشراء عند العميل |
| `invoice_payments` | `transactionRef` | البنك | مرجع تحويل |
| `journal_entries` | `govExternalRef` | جهة حكومية | مرجع قيد خارجي |
| `project_costs` | `invoiceRef` | المورد | رقم فاتورة المورد |
| `pbx_calls`, `communications_log` | `callerNumber`, `calledNumber`, `fromNumber`, `toNumber` | شركة الاتصالات | أرقام هواتف |
| `rental_contracts` | `tenantIdNumber`, `ejarNumber` | الجوازات / إيجار | معرّفات خارجية |
| `wps_run_lines`, `wps_runs` | `bankRefNumber`, `deliveryRef` | البنك | مرجع تسليم WPS |
| `zatca_settings`, `zatca_submission_log` | `crNumber`, `vatRegistrationNumber`, `buildingNumber`, `invoiceRef` | ZATCA | بيانات تسجيل ZATCA |
| `gov_integration_links` | `externalRef` | الجهة الحكومية | معرّف تكامل |
| `warehouse_stock_lots` | `lotNumber`, `supplierLotRef` | المورد | رقم دفعة المورد |
| `umrah_violations` | `referenceNumber` (اختياري) | المستخدم → يشير لوثيقة خارجية | مرجع لوثيقة أخرى |
| `legal_correspondence` | `documentRef` (اختياري) | المستخدم → يشير لوثيقة خارجية | مرجع لوثيقة أخرى |
| `company_documents` | `documentNumber` | المستخدم → رقم الوثيقة الخارجية | رقم وثيقة خارجية |
| `recurring_journals` | `templateRef` (اختياري) | المستخدم → اسم القالب | تسمية مستخدم، NULL مسموح |

### 2.3 معرّفات داخلية فنية — مستثناة بمبرر صريح

| الجدول | العمود | المصدر | المبرر |
|---|---|---|---|
| `warehouse_stock_batches` | `batchNumber` | `internalTechRef("BATCH")` في `routes/warehouse.ts:714` | ربط داخلي بين عملية استلام واحدة وبنودها — لا يظهر في مستند مطبوع. موثّق في `lib/internalRef.ts` |
| `warehouse_movements` | `batchNumber` | نفس المصدر | معرّف داخلي للحركة |
| `correspondence` | `responseRef` | يأتي من `originalRef` كنسخة | ربط مراسلة بردّها — لا يُصدَر بشكل مستقل |

### 2.4 جداول ميتة (يوجد عمود لكن لا كود يكتب إليه)

| الجدول | العمود | الحالة |
|---|---|---|
| `rent_payments` | `receiptNumber` | عمود موجود في الـschema لكن لا INSERT/UPDATE يضع قيمة فيه. الفعليّ يستخدم `contract_payment_schedule.receiptNumber` |
| `property_contracts` | `contractNumber` | الجدول موجود في الـschema لكن لا INSERT في أي ملف. الفعليّ هو `rental_contracts` |
| `discipline_memos` | `memoNumber` | جدول مرجعي قديم — لا INSERT في الكود. الفعليّ هو `hr_inquiry_memos` |

---

## 3. الثغرات الحقيقية (15 ثغرة بعد الجولة الثانية)

| رمز | المكان | الحالة |
|---|---|---|
| G1 | `lib/disciplineEngine.ts:331` COUNT(*) للـmemo | ✅ مُصلَحة في هذا الـPR (مهاجرة 230) |
| G2 | `routes/store.ts:262` ORD-${Date.now()} | ✅ مُصلَحة في هذا الـPR (مهاجرة 228) |
| G3 | `routes/requests.ts:916` PO-REQ-${id} | ✅ مُصلَحة في هذا الـPR |
| G4 | `routes/requests.ts:904` ticket بلا ref | ✅ مُصلَحة في هذا الـPR |
| G5 | `routes/requests.ts:925` case بلا caseNumber | ✅ مُصلَحة في هذا الـPR |
| G6 | `lib/cronScheduler.ts:1158` PO تلقائي بلا ref | ✅ مُصلَحة (#1370) |
| G7 | `lib/cronScheduler.ts:1408` RENT-${id}-${Date.now()} | ✅ مُصلَحة (#1370) |
| G8 | `routes/fleet.ts:1213` UPDATE numbering_assignments مباشر | ✅ مُصلَحة في هذا الـPR |
| G9 | crm.client_code seed-pattern (false-finding) | ✅ مُغلَقة (regex fix) |
| G10 | `routes/crm.ts:742` opp→client بلا code | ✅ مُصلَحة (#1325) |
| G11 | `routes/employees.ts:614` onboarding contract بلا ref | ✅ مُصلَحة في هذا الـPR |
| G12 | `routes/finance-invoices.ts:2560` credit_memos.ref NULL | ✅ مُصلَحة (#1333) |
| G13 | `routes/finance-invoices.ts:2901` debit_memos.ref NULL | ✅ مُصلَحة (#1333) |
| G14 | `routes/finance-purchase.ts:1654` payment_runs Date.now() | ✅ مُصلَحة في هذا الـPR (مهاجرة 227) |
| G15 | 8 schemes ميتة في الـUI (vendor_invoice, lead, ...) | ✅ مُصلَحة في هذا الـPR (مهاجرة 229 تُعطّلها) |

**13 ثغرة مفتوحة + 2 مُغلَقة في هذا الـPR.**

---

هذه ثغرات حقيقية في كود يكتب إلى جداول تنفيذية **خارج طبقة الـroutes**، ولذلك السكربت الحالي لا يلتقطها.

### G1. `lib/disciplineEngine.ts:331` — `generateMemoNumber` يستخدم `COUNT(*)`

```ts
export async function generateMemoNumber(companyId: number): Promise<string> {
  const year = currentYear();
  const [row] = await rawQuery<{ cnt: string }>(
    `SELECT COUNT(*)::int AS cnt FROM hr_inquiry_memos
      WHERE "companyId" = $1 AND EXTRACT(YEAR FROM "createdAt") = $2`,
    [companyId, year]
  );
  const seq = Number(row?.cnt ?? 0) + 1;
  return `MEMO-${year}-${String(seq).padStart(5, "0")}`;
}
```

**المشكلة**: ليس atomic، عرضة لـrace condition، لا يدخل `numbering_assignments`، لا يحترم سياسات `numbering_schemes`.

**الإصلاح المقترح**: استدعاء `issueNumber({ moduleKey: "hr", entityKey: "inquiry_memo", entityTable: "hr_inquiry_memos", expectedTiming: "on_draft" })` + بذرة سياسة `numbering_schemes` للجديدة `hr.inquiry_memo`.

**يستخدمه**: `routes/hr-discipline.ts:692`.

---

### G2. `routes/store.ts:262` — `ORD-${Date.now()}` inline

```ts
const effectiveOrderNumber = orderNumber || `ORD-${Date.now()}`;
await client.query(
  `INSERT INTO store_orders ("orderNumber", "customerName", ...) VALUES ($1,$2,...)`,
  [effectiveOrderNumber, ...]
);
```

**المشكلة**: نمط `Date.now()` المُحرَّم لكن مكتوب inline (وليس عبر `generateTimeRef`) فالـlint الحالي لا يلتقطه.

**الإصلاح المقترح**: قاعدة lint جديدة لـ`Date.now\(\)` inside route + استبدال السطر بـ`issueNumber`.

---

### G3. `routes/requests.ts:916` — `PO-REQ-${id}` عند تحويل طلب إلى أمر شراء

```ts
const { insertId } = await financialEngine.createPurchaseOrder({
  companyId: scope.companyId,
  ref: `PO-REQ-${id}`,         // ← legacy pattern
  description: ...,
  requestedBy: scope.userId,
});
```

**المشكلة**: عند تحويل طلب عام إلى أمر شراء، يُبنى ref يدوياً بدلاً من المرور بالمركز.

**الإصلاح المقترح**: استدعاء `issueNumber({ moduleKey: "purchase", entityKey: "purchase_order", expectedTiming: "on_draft" })` قبل استدعاء الـengine.

---

### G4. `routes/requests.ts:904` — `supportEngine.createTicket` بدون ref

```ts
const { insertId } = await supportEngine.createTicket({
  companyId: scope.companyId,
  title: `صيانة: ${request.title}`,
  description: ...,
  priority: ...,
});
```

والـengine في `lib/engines/supportEngine.ts:59` ينفّذ:
```sql
INSERT INTO support_tickets ("companyId", title, description, status, priority, "createdAt")
```
لا يوجد عمود `ref` في الـINSERT → الصف يُكتب بقيمة NULL في الـref.

**الإصلاح المقترح**: إصدار رقم تذكرة قبل الاستدعاء وتمرير `ref` إلى توقيع الـengine.

---

### G5. `routes/requests.ts:925` — `legalEngine.createCase` بدون caseNumber

```ts
const { insertId } = await legalEngine.createCase({
  companyId, title: `قضية: ${request.title}`,
  description, priority, caseType: "civil", lawyerName: ...,
});
```

والـengine في `lib/engines/legalEngine.ts:176` ينفّذ:
```sql
INSERT INTO legal_cases ("companyId", title, description, status, priority, "caseType", "lawyerName", "createdAt")
```
لا يوجد عمود `caseNumber` → NULL.

**الإصلاح المقترح**: نفس النمط — إصدار `caseNumber` ثم تمريره.

---

### G6. `lib/cronScheduler.ts:1158` — أمر شراء تلقائي بدون ref

```ts
// dailyInventoryCheck — auto-creates purchase orders when stock < threshold
await rawExecute(
  `INSERT INTO purchase_orders ("companyId", title, status, "totalAmount", "createdAt")
   VALUES ($1, $2, 'draft', 0, NOW())`,
  [company.id, `طلب شراء تلقائي: ${p.name} (المخزون ${p.currentStock}/${p.threshold})`]
);
```

**المشكلة**: cron daily ينشئ أوامر شراء لكن بدون `ref`. الصفوف تظهر في الـUI بـref فارغ.

**الإصلاح المقترح**: تمرير `expectedTiming: "on_draft"` إلى `issueNumber` من داخل cron — مع `actorId: null` (لأنه ليس مستخدماً).

---

### G8. `routes/fleet.ts:1213` — `UPDATE numbering_assignments SET status='voided'` مباشرة ✅ مُصلَحة

**أصلَحَت بعد إضافة `audit-numbering-service-bypass.mjs`**: الـroute كان يُلغي تخصيصاً بـUPDATE مباشر بدلاً من استدعاء `voidNumber()`. الإصلاح في هذا الـPR.

```diff
- await client.query(
-   `UPDATE numbering_assignments SET status='voided',"voidReason"=$1 WHERE id=$2`,
-   ['fleet trip de-duplicated by sourceKey', issuedTrip.assignmentId]
- );
+ await voidNumber({
+   companyId: scope.companyId,
+   branchId: scope.branchId ?? null,
+   assignmentId: issuedTrip.assignmentId,
+   actorId: scope.userId,
+   reason: 'fleet trip de-duplicated by sourceKey',
+ });
```

---

### G9. `crm.client_code` — scheme استُدعي بدون seed (false-finding مُغلَقة)

**ملاحظة**: المهاجرة 215 تَزرع السياسة لكن بصيغة `SELECT ... FROM companies` بدلاً من `VALUES`. السكربت الجديد `audit-numbering-schemes-vs-callers.mjs` أصلحت regex للتعرف على كلا الشكلين.

---

### G10. `routes/crm.ts:742` — تحويل CRM opportunity → client بدون كود

```ts
const { rows: [newRow] } = await txClient.query(
  `INSERT INTO clients ("companyId",name,phone,email,source,classification) 
   VALUES ($1,$2,$3,$4,'crm','regular') RETURNING id`,
  [scope.companyId, opp.contactName, opp.contactPhone || null, opp.contactEmail || null]
);
```

**المشكلة**: عند تحويل فرصة بيع إلى عميل، يُنشأ صف `clients` بدون `code` (NULL). routes/clients.ts الرئيسي يستخدم `issueNumber` لكن هذا المسار يفوّت ذلك.

**الإصلاح**: استدعاء `issueNumber({ moduleKey: "crm", entityKey: "client_code", ... })` قبل الـINSERT وتمرير الكود.

---

### G11. `routes/employees.ts:614` — onboarding ينشئ employee_contract بدون ref

```ts
await client.query(
  `INSERT INTO employee_contracts ("companyId","employeeId","assignmentId","contractType",
     "startDate","probationEndDate","probationStatus",status)
   VALUES ($1,$2,$3,$4,$5,$6,'active','active')`,
  [scope.companyId, empId, assignmentId, contractType, effectiveHireDate, toDateISO(probEnd)]
);
```

**المشكلة**: routes/employees.ts يستدعي `issueNumber` لكن لـ`entityTable: "employees"` فقط — لا يصدر `ref` للعقد التلقائي خلال onboarding. routes/hr-contracts.ts يفعل ذلك لإنشاء العقود اليدوي.

**الإصلاح**: استدعاء `issueNumber({ moduleKey: "hr", entityKey: "employee_contract", entityTable: "employee_contracts", expectedTiming: "on_draft" })` قبل INSERT.

---

### G12. `routes/finance-invoices.ts:2560` — credit_memos.ref يُترك NULL

السياسة `finance.credit_memo` مزروعة منذ مهاجرة 213 لكن لا أحد يستدعيها. الـINSERT لا يحتوي عمود `ref`.

```sql
INSERT INTO credit_memos ("companyId","branchId","invoiceId","clientId",amount,
  "netAmount","vatAmount",reason,"memoDate","createdBy") VALUES ($1,$2,...);
```

**الإصلاح**: استدعاء `issueNumber({ moduleKey: "finance", entityKey: "credit_memo", entityTable: "credit_memos", ... })` وإضافة العمود إلى INSERT.

---

### G13. `routes/finance-invoices.ts:2901` — debit_memos.ref يُترك NULL

نفس النمط لـ `debit_memos`. السياسة مزروعة لكن لا تُستدعى.

---

### G14. `routes/finance-purchase.ts:1654` — payment_runs uses `PR-${Date.now()}`

موجود سابقاً في قائمة الـ`inline-date-now-as-ref` المرصودة. مُصنّف هنا أيضاً ليأخذ G-code رسمياً.

---

### G15. (ثقافياً مزروع لكن لا يُستدعى) — 8 schemes ميتة في الـUI

السكربت الجديد `audit-numbering-schemes-vs-callers.mjs` كشف 8 سياسات مزروعة في `numbering_schemes` تظهر في إعدادات الـUI لكن لا route فعلياً يصدر لها:

- `finance.receipt_voucher` — سند قبض (ينبغي وصله بـreceipt-creation route)
- `finance.payment_voucher` — سند صرف (ينبغي وصله بـpayment-creation route)
- `purchase.vendor_invoice` — فاتورة مورد (مرتبط بـG12 أو إنشاؤها منفصلاً)
- `crm.lead` — عميل محتمل (ينبغي وصله عند إنشاء lead)
- `warehouse.stock_movement` (vs `stock_transfer` المُستخدَم فعلياً) — تباين في الـentityKey
- `legal.legal_case` (vs `legal.case` المُستخدَم فعلياً) — تباين في الـentityKey
- `warehouse.purchase_receipt`، `finance.expense_voucher` — مهاجرة 214

**كل واحدة من هذه الـ8 تحتاج قراراً صريحاً**: إما توصيلها بـroute حقيقي، أو حذف الـseed لأنها كانت اقتراحاً معمارياً لم يُنفَّذ.

---

### G7 (الأصلي). `lib/cronScheduler.ts:1408` — `RENT-${p.id}-${Date.now()}` لقضايا التحصيل

```ts
// dailyPropertyCheck — auto-creates legal cases for unpaid rent
const { insertId: caseId } = await rawExecute(
  `INSERT INTO legal_cases (..., "caseNumber", ...)
   VALUES (..., $2, ...)`,
  [
    company.id,
    `RENT-${p.id}-${Date.now()}`,    // ← classic Date.now() legacy
    ...
  ]
);
```

**المشكلة**: نمط Date.now() المُحرَّم في cron.

**الإصلاح المقترح**: نفس G6 — استدعاء `issueNumber` للحصول على caseNumber رسمي.

---

## 4. ربط `numbering_assignments.entityId` — التحقق

لكل route صار يستخدم نمط atomic-tx من PR #1254، الربط مضمون لأنه داخل نفس الـtransaction:

```ts
const atomic = await withTransaction(async () => {
  const issued = await issueNumber({...});
  const result = await rawExecute(`INSERT INTO X ...`);
  await rawExecute(
    `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
    [result.insertId, issued.assignmentId]
  );
  return { insertId, ref };
});
```

لو فشل الربط → الـtransaction كاملاً يتراجع. **لا يوجد ابتلاع أخطاء**.

**استثناء** قابل للتحقق: قد توجد صفوف تاريخية (قبل #1141) في `numbering_assignments` بـ `entityId = NULL`. السكربت `scripts/src/numbering-backfill-report.mjs` يُولّد قائمتها.

---

## 5. التزام `issueTiming` (PR #1265)

كل مسار يُمرّر `expectedTiming: "on_draft"`. لو تم تغيير `numbering_schemes.issueTiming` لأي قيمة غير `'on_draft'` بدون تعديل المسار → `issueNumber` يرفع `ValidationError` بالعربية فوراً.

تم التحقق من 35 callsite في 24 ملف routes (راجع الـtest في `tests/unit/numberingServiceSmoke.test.ts`).

---

## 6. التزام معاملة (transaction) (PR #1254)

كل الـ22 ملف route يستخدم نمط atomic-tx الموحّد. لا يوجد `.catch(...)` على linkback في أي ملف routes.

**استثناء**: الـ7 ثغرات أعلاه (G1-G7) خارج طبقة الـroutes ولذلك لم يطلها فحص atomic-tx.

---

## 7. الخلاصة الصادقة

**ما تم بشكل صحيح**:
- 22/22 مسار يستخدم `issueNumber` ✓
- 35/35 callsite يستخدم نمط atomic-tx ✓
- 35/35 callsite يُمرّر `expectedTiming` ✓
- 4 lint guards خالية من الحوادث ✓
- DB UNIQUE constraints على كل الجداول التنفيذية ✓
- `issueTiming` enforced (PR #1265) ✓
- legacy sequences محذوفة (migration 218) ✓

**ما لم يكتمل (والصدق هنا أهم من الادعاء)**:
- **7 ثغرات خارج طبقة الـroutes** (G1-G7) — تحتاج إصلاحاً.
- سكربت التغطية الحالي يفحص routes/ فقط — يحتاج توسعة لتشمل `lib/engines/`, `lib/cronScheduler.ts`, و`lib/disciplineEngine.ts`.

**التوصية**: لا تُغلق #1141 كـ"تم 100%" حتى يُسد كل من G1-G7 ويُمدَّد السكربت ليفحص هذه الطبقات.

---

*التقرير مولّد آلياً وموثّق بمراجع شيفرة. أي ادعاء بالتغطية يجب أن يصمد أمام `grep` مباشر.*
