# كتالوج أحداث غيث — EVENT_CATALOG

> هذا الملف يوثق أحداث النطاق `Domain Events` المعتمدة.
> أي عملية تشغيلية معتبرة تنتج حدثاً، وأي حدث جديد يجب أن يضاف هنا قبل أو مع PR.

---

## 1) معيار تسمية الأحداث

الصيغة القياسية:

```text
<path>.<entity>.<verb>
```

أمثلة:

```text
hr.employee.created
hr.leave.approved
finance.invoice.issued
finance.journal.posted
fleet.trip.completed
properties.contract.activated
umrah.invoice.posted
legal.case.closed
workflow.request.approved
```

---

## 2) الحقول الإلزامية لكل Event

كل حدث يجب أن يحتوي على الأقل:

```ts
{
  eventId: string;
  eventName: string;
  eventVersion: number;
  companyId: string;
  branchId?: string;
  actorId: string;
  actorAssignmentId?: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  correlationId?: string;
  causationId?: string;
  payload: Record<string, unknown>;
}
```

قواعد إلزامية:

- `companyId` من `req.scope` لا من body.
- `actorId` من session/scope.
- `eventVersion` يبدأ من 1 ولا يكسر المستهلكين عند تغييره.
- لا يحتوي payload على أسرار أو حقول حساسة بلا سياسة.
- الحدث لا يكون بديلاً عن Audit؛ كلاهما مطلوب عند الكتابة.

---

## 3) كتالوج الأحداث الأساسية

| Event | Version | Owner Path | Producer | Consumers | Required Payload | Notes |
|---|---:|---|---|---|---|---|
| `hr.employee.created` | 1 | HR | hrEngine/employees route | Documents, Notifications, Audit, Workspace | `employeeId`, `assignmentIds[]` | لا ينشئ مستخدم دخول إلا بعقد خدمة مستقل. |
| `hr.employee.assignment.created` | 1 | HR | hrEngine | RBAC, Workspace | `employeeId`, `assignmentId`, `companyId`, `branchId`, `roleKey` | الدور يتبع التعيين. |
| `hr.leave.submitted` | 1 | HR | leave route/workflow | Workflows, Notifications | `leaveRequestId`, `employeeId`, `assignmentId`, `dates` | يبدأ مسار اعتماد. |
| `hr.leave.approved` | 1 | HR | workflowEngine/hrEngine | Attendance, Notifications, Workspace | `leaveRequestId`, `approvedBy`, `days` | لا يكتب مالية مباشرة. |
| `hr.payroll.posted` | 1 | HR | payroll engine | Finance, Notifications, Reports | `payrollRunId`, `period`, `totalAmount` | المالية مساند للترحيل فقط. |
| `finance.journal.posted` | 1 | Finance | financialEngine | Reports, Audit, Source Path | `journalEntryId`, `sourceType`, `sourceId`, `amount` | لا ينتج إلا من financial engine. |
| `finance.invoice.issued` | 1 | Finance | invoice engine | CRM, Notifications, Reports | `invoiceId`, `customerId`, `total`, `taxTotal` | بعد الإصدار لا تعديل مباشر. |
| `finance.invoice.amended` | 1 | Finance | amendment engine | CRM, Reports | `invoiceId`, `amendmentId`, `reason` | المسار الوحيد لتعديل الصادرة. |
| `crm.client.created` | 1 | CRM | crmEngine | Finance, Workspace | `clientId`, `source` | إنشاء العميل لا يكون side-effect صامت. |
| `fleet.vehicle.created` | 1 | Fleet | fleetEngine | Documents, Maintenance, Reports | `vehicleId`, `plateNumber` | المركبة root entity. |
| `fleet.trip.completed` | 1 | Fleet | fleetEngine | Finance, Reports, Notifications | `tripId`, `vehicleId`, `driverAssignmentId`, `costBearer` | قد ينتج أثر مالي عبر عقد Finance. |
| `properties.contract.activated` | 1 | Properties | property contract engine | Finance, Documents, Notifications | `contractId`, `propertyId`, `unitId`, `tenantId` | يمنع عقدين نشطين على نفس الوحدة. |
| `umrah.invoice.posted` | 1 | Umrah | umrah invoice engine | Finance, Reports | `invoiceId`, `agentId`, `seasonId`, `total` | الأثر المالي عبر Finance. |
| `legal.case.closed` | 1 | Legal | legalEngine | CRM, Finance, Documents | `caseId`, `outcome`, `judgmentAmount?` | أي أثر مالي يمر عبر Finance. |
| `warehouse.movement.posted` | 1 | Warehouse | warehouseEngine | Finance, Reports | `movementId`, `warehouseId`, `items[]` | المخزون ذو أثر مالي عند التقييم. |
| `workflow.request.submitted` | 1 | Workflows | workflowEngine | Originating Path, Notifications | `requestId`, `requestType`, `entityType`, `entityId` | بداية الاعتماد. |
| `workflow.request.approved` | 1 | Workflows | workflowEngine | Originating Path, Notifications | `requestId`, `stepId`, `approvedBy` | لا يقرر خارج سلسلة الاعتماد. |
| `workflow.request.rejected` | 1 | Workflows | workflowEngine | Originating Path, Notifications | `requestId`, `reason` | السبب إلزامي. |
| `governance.compliance_action.created` | 1 | Governance | governance route/jobs | Workspace, Notifications | `actionId`, `severity`, `source` | الحوكمة لا تكون صامتة عند writes. |
| `rules.automation.fired` | 1 | Rules | rules engine | Audit, Reports | `ruleId`, `triggerEvent`, `result` | يسجل firing قابل للتتبع. |

---

## 4) قواعد الإصدار والتوافق

- إضافة حقل اختياري في payload لا ترفع major ولا تكسر المستهلكين.
- حذف حقل أو تغيير معناه يحتاج eventVersion جديد.
- المستهلك يجب أن يتحمل أحداثاً مستقبلية فيها حقول إضافية.
- لا يسمح بإعادة استخدام اسم حدث لمعنى مختلف.

---

## 5) Idempotency وRetry

- كل consumer يجب أن يتعامل مع تكرار الحدث عبر `eventId`.
- أي فشل معالجة يسجل في failure/outbox log.
- لا يسمح بأن يسبب retry قيداً مالياً مكرراً أو إشعاراً مكرراً بلا idempotency key.

---

## 6) عند إضافة حدث جديد

يجب في PR:

1. إضافة الحدث هنا.
2. تحديد المنتج والمستهلكين.
3. تحديد payload.
4. تحديد أثره التلقائي.
5. إضافة اختبار أو smoke يثبت الإرسال/الاستهلاك عند اللزوم.
