# كتالوج عقود الخدمة — SERVICE_CONTRACT_CATALOG

> هذا الملف يضبط التكامل بين مسارات غيث.
> لا يجوز لمسار أن يكتب في نطاق مسار آخر إلا عبر عقد خدمة موثق.

---

## 1) القاعدة العامة

- المسار القائد يطلب الخدمة.
- المسار المساند ينفذ الخدمة ولا يقرر سياسة القائد.
- أي كتابة عابرة للمسارات تحتاج عقد خدمة.
- كل عقد خدمة يلتزم بـ `scope`: لا `companyId` ولا `branchId` من body.
- كل عقد يكتب أثراً يسجل Audit وEvent.
- أي أثر مالي يمر عبر محرك المالية فقط.

---

## 2) قالب العقد

كل عقد يجب أن يحدد:

```text
Contract Name
Leader Path
Supporting Path
Purpose
Input
Output
Validation
Permission
Audit
Events
Failure Modes
Idempotency Key
```

---

## 3) العقود الأساسية

### 3.1 Finance.PostPayrollJournal

- القائد: HR.
- المساند: Finance.
- الغرض: ترحيل مسير راتب معتمد إلى قيد محاسبي.
- المدخلات: `payrollRunId`, `periodId`, `linesSummary`, `costBearers`.
- المخرجات: `journalEntryId`, `postingStatus`.
- التحقق: المسير معتمد، الفترة مفتوحة، mapping موجود، لا حساب أب.
- الأحداث: `hr.payroll.posted`, `finance.journal.posted`.
- مفتاح منع التكرار: `payrollRunId`.

### 3.2 Finance.PostFleetTripCost

- القائد: Fleet.
- المساند: Finance.
- الغرض: ترحيل تكلفة رحلة مكتملة.
- المدخلات: `tripId`, `vehicleId`, `driverAssignmentId`, `costBearer`, `amounts`.
- المخرجات: `journalEntryId`, `postingStatus`.
- التحقق: الرحلة مكتملة، الأبعاد صحيحة، الفترة مفتوحة.
- الأحداث: `fleet.trip.completed`, `finance.journal.posted`.
- مفتاح منع التكرار: `tripId`.

### 3.3 Finance.PostUmrahInvoice

- القائد: Umrah.
- المساند: Finance.
- الغرض: ترحيل فاتورة عمرة إلى المالية.
- المدخلات: `invoiceId`, `agentId`, `seasonId`, `total`, `taxCode`, `lines`.
- المخرجات: `journalEntryId`, `postingStatus`.
- التحقق: الفاتورة قابلة للترحيل، الضريبة صحيحة، mapping موجود.
- الأحداث: `umrah.invoice.posted`, `finance.journal.posted`.
- مفتاح منع التكرار: `invoiceId`.

### 3.4 Documents.AttachToEntity

- القائد: أي مسار مالك.
- المساند: Documents.
- الغرض: حفظ وثيقة وربطها بكيان.
- المدخلات: `entityType`, `entityId`, `documentType`, `fileRef`, `visibilityScope`.
- المخرجات: `documentId`, `versionId`.
- التحقق: الكيان موجود، المستخدم يملك نطاق الوصول، الملف صالح.
- الأحداث: `documents.document.attached`.

### 3.5 Notifications.Send

- القائد: أي مسار مالك.
- المساند: Notifications.
- الغرض: إرسال إشعار وفق السياسة.
- المدخلات: `recipientId`, `channel`, `templateKey`, `payload`, `priority`.
- المخرجات: `notificationId`, `deliveryStatus`.
- التحقق: القناة مفعلة، القالب موجود، سياسة الإرسال تسمح.
- الأحداث: `notifications.notification.queued`, `notifications.notification.sent`, `notifications.notification.failed`.

### 3.6 Workflows.SubmitRequest

- القائد: المسار المنشئ للطلب.
- المساند: Workflows.
- الغرض: إنشاء طلب اعتماد.
- المدخلات: `requestType`, `entityType`, `entityId`, `workflowKey`, `submittedBy`.
- المخرجات: `workflowRequestId`, `currentStep`.
- التحقق: التعريف مفعل، حالة الكيان تسمح بالتقديم.
- الأحداث: `workflow.request.submitted`.

### 3.7 Workflows.DecideStep

- القائد: المسار المنشئ للطلب.
- المساند: Workflows.
- الغرض: اعتماد أو رفض أو إرجاع أو إحالة خطوة.
- المدخلات: `workflowRequestId`, `stepId`, `decision`, `reason`.
- المخرجات: `newStatus`, `nextStep`.
- التحقق: المستخدم مخول للخطوة، الخطوة معلقة، السبب موجود عند الرفض/الإرجاع.
- الأحداث: `workflow.request.approved`, `workflow.request.rejected`, `workflow.request.returned`, `workflow.request.referred`.

### 3.8 CRM.ResolveClient

- القائد: CRM.
- المستفيد: أي مسار يحتاج عميلاً.
- الغرض: حل عميل قائم أو إنشاء عميل بطلب صريح.
- المدخلات: `searchKey`, `candidateData`, `explicitCreateRequested`.
- المخرجات: `clientId`, `resolutionStatus`.
- التحقق: لا إنشاء عميل من أثر جانبي صامت.
- الأحداث: `crm.client.created` عند الإنشاء الصريح فقط.

---

## 4) عقود تحتاج تفصيل قبل الإنتاج

- `Finance.PostPropertyContractSchedule`
- `Finance.PostWarehouseMovement`
- `Legal.RecordJudgmentFinancialImpact`
- `Communications.RegisterIncoming`
- `AdministrativeComms.RouteCorrespondence`
- `Procurement.ApprovePurchaseRequest`
- `Assets.CapitalizeAsset`

لا تستخدم هذه العقود لكتابة عابرة حتى تستكمل مدخلاتها ومخرجاتها واختباراتها.

---

## 5) عند إضافة عقد جديد

يجب تحديث:

1. هذا الملف.
2. Blueprint المسار القائد.
3. Blueprint المسار المساند عند تغير خدمته.
4. Event Catalog.
5. RBAC Permission Catalog عند إضافة صلاحية.
6. اختبار يمنع الكتابة العابرة خارج العقد.
