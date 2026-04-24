# مصفوفة الطلبات والاعتمادات
# Request–Approval Matrix

> آخر تحديث: 2026-04-24
> مرجع: [system-master-registry.md](./system-master-registry.md)

---

## 1. أنواع الطلبات (Request Types)

| # | نوع الطلب | الجدول | النطاق | المُنشئ | الحالات | سلسلة الاعتماد |
|---|-----------|--------|--------|---------|---------|---------------|
| 1 | طلب إجازة | hr_leave_requests | HR | موظف | pending→approved→rejected→cancelled→completed | متعدد المراحل (leave_approval_stages) |
| 2 | طلب عمل إضافي | hr_overtime_requests | HR | موظف | pending→approved→rejected | مستوى واحد |
| 3 | طلب قرض | hr_employee_loans | HR | موظف | pending→approved→rejected | مستوى واحد |
| 4 | طلب استئذان | hr_excuse_requests | HR | موظف | pending→approved→rejected | مستوى واحد |
| 5 | طلب مغادرة نهائية | hr_exit_requests | HR | مدير HR | pending→approved→clearance→rejected→completed | مستوى واحد + إخلاء طرف |
| 6 | طلب نقل | employee_transfers | HR | مدير HR | pending→approved→received→rejected | مستويان (اعتماد + استلام) |
| 7 | طلب شراء | purchase_requests | Finance | مستخدم | draft→pending→approved→rejected→converted | مستوى واحد (يتحول لأمر شراء) |
| 8 | أمر شراء | purchase_orders | Finance | مالية | draft→pending_approval→approved→received→paid→cancelled | متعدد المراحل |
| 9 | اعتماد ميزانية | budgets | Finance | مالية | draft→pending_approval→approved→rejected→closed | مستوى واحد |
| 10 | اعتماد فاتورة | invoices | Finance | مالية | draft→approved→posted→paid→closed | مستوى واحد |
| 11 | اعتماد قيد يومية | journal_entries | Finance | محاسب | draft→pending_approval→posted→rejected→reversed | مستوى واحد |
| 12 | طلب دعم فني | support_tickets | Support | أي مستخدم | open→in_progress→escalated→resolved→closed | تصعيد تلقائي (SLA) |
| 13 | طلب عام | requests | System | أي مستخدم | pending→approved→rejected→returned | عبر workflow_instances |
| 14 | سير عمل | workflow_instances | System | أي مستخدم | pending→escalated→approved→rejected | سلسلة اعتماد ديناميكية |
| 15 | مذكرة تأديبية | hr_inquiry_memos | HR | مدير مباشر | draft→issued→acknowledged→appealed→gm_review→closed | متعدد المراحل (5 مراحل) |
| 16 | مخالفة موظف | employee_violations | HR | مدير HR | pending→approved→rejected→returned | مستوى واحد |

---

## 2. تفاصيل سلاسل الاعتماد

### 2.1 طلب الإجازة (الأكثر تعقيداً)

```
المرحلة 1: المدير المباشر
  ├─ اعتماد → المرحلة 2 (إن وُجدت) أو approved
  ├─ رفض → rejected + إشعار الموظف
  └─ تأخر > 12 ساعة → إشعار تذكير
      └─ تأخر > 20 ساعة → إشعار تحذير
          └─ تأخر > 24 ساعة → تصعيد تلقائي
              └─ تأخر > 28 ساعة → اعتماد تلقائي

المرحلة 2: مدير القسم (اختياري)
  ├─ اعتماد → approved
  └─ رفض → rejected

المرحلة 3: مدير الموارد البشرية (اختياري)
  ├─ اعتماد → approved
  └─ رفض → rejected
```

**الجداول المستخدمة:**
- `hr_leave_requests` — الطلب الأساسي
- `leave_approval_stages` — مراحل الاعتماد لكل نوع إجازة
- `hr_leave_types` — أنواع الإجازات وأرصدتها
- `hr_leave_balances` — أرصدة الموظفين

**الـ Endpoints:**
| المسار | الوصف |
|--------|-------|
| POST /hr/leave-requests | إنشاء الطلب |
| PATCH /hr/leave-requests/:id/approve | اعتماد |
| PATCH /hr/leave-requests/:id/reject | رفض |
| PATCH /hr/leave-requests/:id/escalate | تصعيد يدوي |

**الإشعارات:**
- `leave_approved` → الموظف
- `leave_rejected` → الموظف
- `leave_returned` → الموظف
- `leave_reminder` → المعتمد (بعد 12 ساعة)
- `leave_warning` → المعتمد (بعد 20 ساعة)
- `leave_escalated` → المعتمد الأعلى (بعد 24 ساعة)

---

### 2.2 المذكرة التأديبية (5 مراحل)

```
draft ─────→ issued (إصدار المذكرة)
                ├─ acknowledged (اعتراف الموظف)
                │    └─ closed
                ├─ appealed (استئناف الموظف)
                │    ├─ gm_review (مراجعة المدير العام)
                │    │    ├─ justified (مبرر)
                │    │    │    └─ closed
                │    │    └─ closed (قرار نهائي)
                │    ├─ justified
                │    └─ closed
                └─ escalated (تصعيد)
                     └─ gm_review
```

**الـ Endpoints:**
| المسار | الوصف | الصلاحية |
|--------|-------|----------|
| POST /hr/discipline/memos | إنشاء | hr:discipline:create |
| PATCH /:id/justify | تبرير الموظف | hr:discipline:update |
| PATCH /:id/recommendation | توصية المدير | hr:discipline:approve |
| PATCH /:id/gm-decision | قرار المدير العام | hr:discipline:approve |
| POST /:id/appeal | استئناف | hr:self |
| PATCH /:id/appeal-decision | قرار الاستئناف | hr:discipline:approve |
| PATCH /:id/cancel | إلغاء | hr:discipline:update |
| PATCH /:id/close | إغلاق | hr:discipline:approve |

---

### 2.3 سير العمل العام (Workflow Engine)

```
تقديم الطلب → workflow_instances (pending)
  ├─ المعتمد 1 يوافق → المعتمد 2 (إن وُجد)
  │    ├─ المعتمد 2 يوافق → approved
  │    └─ المعتمد 2 يرفض → rejected
  ├─ المعتمد 1 يرفض → rejected
  └─ تأخر → escalated → المعتمد الأعلى
```

**الجداول:**
- `workflow_definitions` — تعريف أنواع سير العمل
- `workflow_steps` — خطوات كل سير عمل
- `workflow_instances` — طلبات قيد التنفيذ
- `workflow_step_actions` — إجراءات على كل خطوة
- `approval_chains` — سلاسل اعتماد مُعرّفة
- `approval_chain_steps` — خطوات السلسلة
- `approval_requests` — طلبات الاعتماد الفردية
- `approval_actions` — إجراءات الاعتماد (approve/reject)

**الإشعارات:**
- `workflow_pending` → المعتمد التالي
- `workflow_approved` → مقدم الطلب
- `workflow_rejected` → مقدم الطلب
- `workflow_returned` → مقدم الطلب
- `workflow_escalated` → المعتمد الأعلى
- `workflow_sla_warning` → المعتمد (قبل انتهاء المهلة)
- `workflow_sla_exceeded` → المدير + مقدم الطلب
- `approval_reminder` → المعتمد (بعد 24 ساعة)

---

### 2.4 أمر الشراء

```
draft → pending_approval
  ├─ approved → partially_received / received → paid
  └─ rejected → draft (إعادة تعديل)
```

**ملاحظة:** طلب الشراء (purchase_request) يتحول تلقائياً لأمر شراء عند الاعتماد.

---

### 2.5 الفاتورة

```
draft → approved → posted → sent
  ├─ partial → paid → closed
  ├─ overdue (تلقائي بعد تاريخ الاستحقاق)
  └─ cancelled
```

**الأثر المالي:** كل انتقال لـ posted يُنشئ قيد محاسبي تلقائياً عبر `createGuardedJournalEntry`.

---

### 2.6 تذكرة الدعم الفني (SLA-driven)

```
open → in_progress → resolved → closed
  │         │
  │         └─ escalated (تلقائي عند تجاوز SLA)
  │              └─ in_progress (بعد التعيين)
  └─ closed (مباشر)
```

**التصعيد التلقائي:**
- يعمل عبر Cron job
- يفحص `sla_definitions` لكل أولوية
- عند التجاوز: `support.sla.breached` event + إشعار `ticket_escalated`

---

## 3. نقاط اعتماد الـ API (31 endpoint)

| # | المسار | الكيان | الإجراء | الصلاحية |
|---|--------|--------|---------|----------|
| 1 | PATCH /hr/leave-requests/:id/approve | hr_leave_requests | approve | hr:approve |
| 2 | PATCH /hr/leave-requests/:id/reject | hr_leave_requests | reject | hr:approve |
| 3 | PATCH /hr/leave-requests/:id/escalate | hr_leave_requests | escalate | hr:approve |
| 4 | PATCH /hr/violations/:id/approve | employee_violations | approve | hr:approve |
| 5 | PATCH /hr/violations/:id/reject | employee_violations | reject | hr:approve |
| 6 | PATCH /hr/violations/:id/return | employee_violations | return | hr:approve |
| 7 | PATCH /hr/loans/:id/approve | hr_employee_loans | approve | hr:approve |
| 8 | PATCH /hr/overtime/:id/approve | hr_overtime_requests | approve | hr:approve |
| 9 | PATCH /hr/exit/:id/approve | hr_exit_requests | approve | hr:approve |
| 10 | PATCH /hr/exit/:id/reject | hr_exit_requests | reject | hr:approve |
| 11 | PATCH /hr/transfers/:id/approve | employee_transfers | approve | hr:approve |
| 12 | PATCH /hr/transfers/:id/receive | employee_transfers | receive | hr:update |
| 13 | PATCH /hr/official-letters/:id/approve | official_letters | approve | hr:approve |
| 14 | PATCH /hr/discipline/memos/:id/recommendation | hr_inquiry_memos | recommendation | hr:discipline:approve |
| 15 | PATCH /hr/discipline/memos/:id/gm-decision | hr_inquiry_memos | gm-decision | hr:discipline:approve |
| 16 | PATCH /hr/discipline/memos/:id/appeal-decision | hr_inquiry_memos | appeal-decision | hr:discipline:approve |
| 17 | PATCH /hr/discipline/memos/:id/close | hr_inquiry_memos | close | hr:discipline:approve |
| 18 | PATCH /finance/invoices/:id/approve | invoices | approve | finance:approve |
| 19 | PATCH /finance/journals/:id/post | journal_entries | post/approve | finance:approve |
| 20 | PATCH /finance/purchase-orders/:id/approve | purchase_orders | approve | finance:approve |
| 21 | PATCH /finance/purchase-requests/:id/approve | purchase_requests | approve | finance:approve |
| 22 | PATCH /finance/purchase-requests/:id/reject | purchase_requests | reject | finance:approve |
| 23 | PATCH /finance/budgets/:id/approve | budgets | approve | finance:approve |
| 24 | PATCH /support/tickets/:id/resolve | support_tickets | resolve | support:update |
| 25 | PATCH /warehouse/inventory-counts/:id/approve | inventory_counts | approve | warehouse:update |
| 26 | PATCH /governance/policies/:id/archive | governance_policies | archive | governance:write |
| 27 | PATCH /legal/cases/:id (status transition) | legal_cases | transition | legal:update |
| 28 | PATCH /legal/contracts/:id (status transition) | legal_contracts | transition | legal:update |
| 29 | POST /requests/:id/approve | requests | approve | requests:write |
| 30 | POST /requests/:id/reject | requests | reject | requests:write |
| 31 | POST /requests/:id/return | requests | return | requests:write |

---

## 4. التصعيد التلقائي (Auto-Escalation)

| الكيان | المهلة | الإجراء |
|--------|--------|---------|
| hr_leave_requests | 12h تذكير، 20h تحذير، 24h تصعيد، 28h اعتماد تلقائي | Cron: كل ساعة |
| hr_inquiry_memos | 72h مهلة الاستئناف | Cron: كل ساعة |
| workflow_instances | حسب SLA المعرّف | Cron: كل ساعة |
| support_tickets | حسب sla_definitions | Cron: كل 15 دقيقة |
| obligations | حسب dueDate | Cron: كل ساعة |

---

## 5. ملخص

| المقياس | القيمة |
|---------|--------|
| أنواع الطلبات | 16 |
| نقاط اعتماد (API) | 31 |
| سلاسل اعتماد متعددة المراحل | 4 (إجازات، مذكرات تأديبية، أوامر شراء، سير عمل) |
| تصعيد تلقائي | 5 كيانات |
| إشعارات الاعتماد | 15+ نوع |
