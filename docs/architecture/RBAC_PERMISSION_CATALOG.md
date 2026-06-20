# كتالوج الصلاحيات — RBAC_PERMISSION_CATALOG

> الدور في غيث يتبع التعيين لا الشخص.
> كل صلاحية يجب أن تعمل ضمن نطاق واضح: self / assignment / department / branch / company / global.

---

## 1) صيغة الصلاحية

```text
<path>.<resource>.<action>
```

أمثلة:

```text
hr.employee.read
finance.invoice.approve
fleet.trip.close
properties.contract.activate
```

---

## 2) الأفعال القياسية

| Action | المعنى |
|---|---|
| `list` | عرض قائمة. |
| `read` | عرض تفاصيل. |
| `create` | إنشاء. |
| `update` | تعديل. |
| `archive` | أرشفة أو تعطيل. |
| `submit` | تقديم للاعتماد. |
| `approve` | اعتماد. |
| `reject` | رفض. |
| `post` | ترحيل أو تثبيت أثر. |
| `reverse` | عكس أثر. |
| `print` | طباعة. |
| `export` | تصدير. |
| `admin` | إدارة إعدادات المسار. |

---

## 3) النطاقات القياسية

| Scope | المعنى |
|---|---|
| `self` | المستخدم نفسه. |
| `assignment` | التعيين النشط. |
| `department` | القسم. |
| `branch` | الفرع. |
| `company` | الشركة. |
| `global` | كل الشركات والفروع ويقتصر على المالك/مدير النظام. |

قواعد إلزامية:

- لا صلاحية بلا نطاق.
- لا دور تشغيلي بلا `assignmentId` نشط.
- الصلاحية لا تكفي وحدها؛ حالة السجل يجب أن تسمح بالفعل.
- الأزرار والصفحات تستهلك نفس الصلاحيات ولا تنشئ منطقاً موازياً.

---

## 4) صلاحيات تأسيسية حسب المسارات

### HR

```text
hr.employee.list
hr.employee.read
hr.employee.create
hr.employee.update
hr.assignment.create
hr.leave.submit
hr.leave.approve
hr.payroll.prepare
hr.payroll.approve
hr.payroll.post
```

### Finance

```text
finance.invoice.list
finance.invoice.read
finance.invoice.create
finance.invoice.approve
finance.invoice.issue
finance.invoice.amend
finance.journal.read
finance.journal.post
finance.journal.reverse
finance.accounts.admin
finance.mappings.admin
```

### CRM

```text
crm.client.list
crm.client.read
crm.client.create
crm.client.update
crm.client.archive
crm.opportunity.manage
```

### Fleet

```text
fleet.vehicle.list
fleet.vehicle.read
fleet.vehicle.create
fleet.vehicle.update
fleet.trip.create
fleet.trip.close
fleet.maintenance.manage
```

### Properties

```text
properties.property.list
properties.property.create
properties.unit.manage
properties.contract.create
properties.contract.activate
properties.payment.record
```

### Umrah

```text
umrah.season.manage
umrah.group.manage
umrah.agent.manage
umrah.invoice.create
umrah.invoice.post
umrah.refund.manage
```

### Legal

```text
legal.case.list
legal.case.read
legal.case.create
legal.case.update
legal.session.manage
legal.judgment.record
```

### Shared Services

```text
documents.attach
documents.read
notifications.send
workflows.request.submit
workflows.request.decide
governance.policy.manage
governance.audit.manage
rules.automation.manage
```

---

## 5) عند إضافة صلاحية جديدة

يجب تحديد:

1. المسار المالك.
2. المورد.
3. الفعل.
4. النطاق.
5. هل تعتمد على حالة سجل؟
6. هل لها أثر مالي؟
7. هل تظهر صفحة أو زر؟
8. هل تحتاج تحديث `VISIBILITY_GOVERNANCE_MATRIX` أو `featureCatalog`؟

أي صلاحية واسعة بلا نطاق واضح ترفض.
