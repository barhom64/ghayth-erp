// ─────────────────────────────────────────────────────────────────────────────
// EVENT CATALOG — الفهرس الرسمي للأحداث في النظام
// ─────────────────────────────────────────────────────────────────────────────
// Every business event that crosses module boundaries MUST be declared here.
// This is the single source of truth for:
//   • event naming convention (<domain>.<aggregate>.<verb>)
//   • payload shape (documented)
//   • consumers (who listens)
//   • side-effects (GL, notifications, obligations, automation)
//
// Runtime consumers use eventBus.on(name, ...). This file doesn't enforce the
// contract — it documents it so that developers and auditors have one place
// to look instead of scanning 30 files.

export type EventDomain =
  | "finance"
  | "hr"
  | "fleet"
  | "property"
  | "legal"
  | "crm"
  | "support"
  | "store"
  | "warehouse"
  | "project"
  | "workflow"
  | "system";

export interface EventDefinition {
  /** Canonical event name, e.g. "finance.invoice.created" */
  name: string;
  /** Arabic label shown in UIs / audit trail */
  label: string;
  /** Business domain the event belongs to */
  domain: EventDomain;
  /** Short description of WHEN this fires */
  description: string;
  /** Required payload fields (documentation only — not validated) */
  payload: Record<string, string>;
  /** Downstream consumers by name (for documentation & dependency mapping) */
  consumers: string[];
  /** Side-effects the event triggers */
  sideEffects: Array<"gl_post" | "notification" | "obligation_register" | "automation" | "audit" | "webhook">;
  /** If true, event is critical and must not be dropped silently */
  critical?: boolean;
}

export const EVENT_CATALOG: EventDefinition[] = [
  // ─── FINANCE ─────────────────────────────────────────────────────────────
  {
    name: "finance.invoice.created",
    label: "إنشاء فاتورة مبيعات",
    domain: "finance",
    description: "تُصدر عند حفظ فاتورة مبيعات جديدة (حالة draft أو posted)",
    payload: { invoiceId: "number", clientId: "number", total: "number", status: "string" },
    consumers: ["notificationService", "obligationsEngine", "budgetValidator"],
    sideEffects: ["gl_post", "audit", "obligation_register"],
    critical: true,
  },
  {
    name: "finance.invoice.paid",
    label: "سداد فاتورة",
    domain: "finance",
    description: "تُصدر عند اكتمال سداد فاتورة (paidAmount >= total)",
    payload: { invoiceId: "number", clientId: "number", amount: "number", paymentRef: "string" },
    consumers: ["obligationsEngine", "dunningCanceller", "cashFlowTracker"],
    sideEffects: ["gl_post", "audit", "notification"],
    critical: true,
  },
  {
    name: "finance.invoice.overdue",
    label: "فاتورة متأخرة",
    domain: "finance",
    description: "تُصدر يومياً من cron عند تجاوز dueDate",
    payload: { invoiceId: "number", clientId: "number", daysPastDue: "number", outstanding: "number" },
    consumers: ["dunningEngine", "obligationsEngine", "execDashboard"],
    sideEffects: ["notification", "automation"],
  },
  {
    name: "finance.payment.received",
    label: "استلام دفعة",
    domain: "finance",
    description: "تُصدر عند تسجيل سند قبض",
    payload: { voucherId: "number", clientId: "number", amount: "number" },
    consumers: ["cashFlowTracker", "arAgingEngine"],
    sideEffects: ["gl_post", "audit"],
    critical: true,
  },
  {
    name: "finance.payment.sent",
    label: "صرف دفعة",
    domain: "finance",
    description: "تُصدر عند تسجيل سند صرف أو payment run",
    payload: { voucherId: "number", supplierId: "number", amount: "number" },
    consumers: ["cashFlowTracker", "apAgingEngine"],
    sideEffects: ["gl_post", "audit"],
    critical: true,
  },
  {
    name: "finance.purchase_order.created",
    label: "إنشاء أمر شراء",
    domain: "finance",
    description: "تُصدر عند اعتماد أمر شراء",
    payload: { poId: "number", supplierId: "number", total: "number" },
    consumers: ["budgetValidator", "obligationsEngine"],
    sideEffects: ["audit", "obligation_register"],
  },
  {
    name: "finance.grn.received",
    label: "استلام بضاعة",
    domain: "finance",
    description: "تُصدر عند تسجيل GRN — three-way match step",
    payload: { grnId: "number", poId: "number", receivedQty: "number" },
    consumers: ["inventoryTracker", "threeWayMatch"],
    sideEffects: ["gl_post", "audit"],
    critical: true,
  },
  {
    name: "finance.period.closed",
    label: "إقفال فترة مالية",
    domain: "finance",
    description: "تُصدر عند إقفال فترة شهرية أو سنوية",
    payload: { period: "string", closedBy: "number" },
    consumers: ["journalLocker", "reportFreezer"],
    sideEffects: ["audit", "notification"],
    critical: true,
  },
  {
    name: "finance.budget.exceeded",
    label: "تجاوز ميزانية",
    domain: "finance",
    description: "تُصدر عندما ترتفع نسبة الاستهلاك فوق 80%",
    payload: { accountCode: "string", period: "string", utilizationPct: "number" },
    consumers: ["budgetApprovalEngine", "execDashboard"],
    sideEffects: ["notification", "automation"],
    critical: true,
  },
  {
    name: "finance.fx.revalued",
    label: "إعادة تقييم العملات",
    domain: "finance",
    description: "تُصدر بعد ترحيل قيد إعادة تقييم العملات الأجنبية لفترة",
    payload: { period: "string", totalGain: "number", totalLoss: "number" },
    consumers: ["execDashboard", "fxReporter"],
    sideEffects: ["gl_post", "audit"],
  },

  // ─── HR ──────────────────────────────────────────────────────────────────
  {
    name: "hr.employee.hired",
    label: "توظيف موظف",
    domain: "hr",
    description: "تُصدر عند إنشاء سجل موظف جديد",
    payload: { employeeId: "number", joiningDate: "string", department: "string" },
    consumers: ["payrollEngine", "documentsEngine", "obligationsEngine"],
    sideEffects: ["obligation_register", "notification", "audit"],
    critical: true,
  },
  {
    name: "hr.employee.terminated",
    label: "إنهاء خدمة موظف",
    domain: "hr",
    description: "تُصدر عند إنهاء خدمة موظف (EOS calculation يُحسب بعدها)",
    payload: { employeeId: "number", lastWorkingDay: "string", reason: "string" },
    consumers: ["payrollEngine", "financeEngine", "obligationsEngine"],
    sideEffects: ["gl_post", "notification", "audit"],
    critical: true,
  },
  {
    name: "hr.leave.requested",
    label: "طلب إجازة",
    domain: "hr",
    description: "تُصدر عند تقديم طلب إجازة",
    payload: { requestId: "number", employeeId: "number", days: "number", leaveType: "string" },
    consumers: ["workflowEngine", "leaveBalanceValidator"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "hr.attendance.anomaly",
    label: "انحراف حضور",
    domain: "hr",
    description: "تُصدر عند اكتشاف تأخر/غياب/تسجيل خارج النطاق الجغرافي",
    payload: { employeeId: "number", date: "string", type: "string" },
    consumers: ["payrollDeductionEngine", "hrManagerNotifier"],
    sideEffects: ["notification"],
  },
  {
    name: "hr.payroll.processed",
    label: "معالجة راتب شهري",
    domain: "hr",
    description: "تُصدر عند توليد كشف رواتب شهري كامل",
    payload: { period: "string", totalNet: "number", employeeCount: "number" },
    consumers: ["financeEngine", "execDashboard"],
    sideEffects: ["gl_post", "audit", "notification"],
    critical: true,
  },

  // ─── FLEET ───────────────────────────────────────────────────────────────
  {
    name: "fleet.trip.started",
    label: "بدء رحلة",
    domain: "fleet",
    description: "تُصدر عند انطلاق رحلة وتسجيل العداد",
    payload: { tripId: "number", vehicleId: "number", driverId: "number", startOdometer: "number" },
    consumers: ["fuelTracker", "obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "fleet.trip.completed",
    label: "إغلاق رحلة",
    domain: "fleet",
    description: "تُصدر عند إغلاق رحلة وتسجيل العداد النهائي",
    payload: { tripId: "number", vehicleId: "number", distanceKm: "number", fuelConsumed: "number" },
    consumers: ["fuelTracker", "maintenanceScheduler", "financeEngine"],
    sideEffects: ["gl_post", "audit"],
  },
  {
    name: "fleet.vehicle.maintenance_due",
    label: "استحقاق صيانة مركبة",
    domain: "fleet",
    description: "تُصدر من cron يومياً عند اقتراب موعد الصيانة",
    payload: { vehicleId: "number", maintenanceType: "string", dueDate: "string" },
    consumers: ["maintenanceWorkflow", "execDashboard"],
    sideEffects: ["notification", "obligation_register"],
  },

  // ─── PROPERTY ────────────────────────────────────────────────────────────
  {
    name: "property.contract.created",
    label: "إنشاء عقد عقاري",
    domain: "property",
    description: "تُصدر عند تسجيل عقد إيجار/بيع",
    payload: { contractId: "number", propertyId: "number", tenantId: "number", startDate: "string", endDate: "string" },
    consumers: ["obligationsEngine", "renewalReminder", "financeEngine"],
    sideEffects: ["obligation_register", "gl_post", "audit"],
    critical: true,
  },
  {
    name: "property.contract.expiring",
    label: "اقتراب انتهاء عقد",
    domain: "property",
    description: "تُصدر من cron عند اقتراب endDate (60/30/7 يوم)",
    payload: { contractId: "number", daysToExpiry: "number" },
    consumers: ["renewalWorkflow", "execDashboard"],
    sideEffects: ["notification"],
  },
  {
    name: "property.contract.terminated",
    label: "إنهاء عقد",
    domain: "property",
    description: "تُصدر عند إنهاء عقد (سواء بالتجديد أو الإلغاء)",
    payload: { contractId: "number", reason: "string", settlementAmount: "number" },
    consumers: ["financeEngine", "documentsEngine"],
    sideEffects: ["gl_post", "audit", "notification"],
    critical: true,
  },

  // ─── LEGAL ───────────────────────────────────────────────────────────────
  {
    name: "legal.case.created",
    label: "فتح قضية قانونية",
    domain: "legal",
    description: "تُصدر عند تسجيل قضية جديدة",
    payload: { caseId: "number", caseType: "string", hearingDate: "string" },
    consumers: ["obligationsEngine", "documentsEngine"],
    sideEffects: ["obligation_register", "notification", "audit"],
    critical: true,
  },
  {
    name: "legal.hearing.upcoming",
    label: "اقتراب جلسة",
    domain: "legal",
    description: "تُصدر من cron قبل 7/3/1 يوم من الجلسة",
    payload: { caseId: "number", hearingDate: "string", daysRemaining: "number" },
    consumers: ["legalCalendar", "execDashboard"],
    sideEffects: ["notification"],
  },

  // ─── CRM ─────────────────────────────────────────────────────────────────
  {
    name: "crm.lead.created",
    label: "إنشاء عميل محتمل",
    domain: "crm",
    description: "تُصدر عند إضافة lead جديد",
    payload: { leadId: "number", source: "string" },
    consumers: ["leadScoreEngine", "followUpScheduler"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "crm.opportunity.won",
    label: "فوز بصفقة",
    domain: "crm",
    description: "تُصدر عند إغلاق فرصة بنجاح",
    payload: { opportunityId: "number", amount: "number" },
    consumers: ["invoiceGenerator", "execDashboard"],
    sideEffects: ["audit", "notification"],
    critical: true,
  },

  // ─── SUPPORT ─────────────────────────────────────────────────────────────
  {
    name: "support.ticket.created",
    label: "إنشاء تذكرة دعم",
    domain: "support",
    description: "تُصدر عند فتح تذكرة دعم فني",
    payload: { ticketId: "number", priority: "string", slaDeadline: "string" },
    consumers: ["obligationsEngine", "notificationEngine"],
    sideEffects: ["obligation_register", "notification", "audit"],
  },
  {
    name: "support.sla.breached",
    label: "تجاوز SLA",
    domain: "support",
    description: "تُصدر من cron عند تجاوز الموعد النهائي دون حل",
    payload: { ticketId: "number", breachMinutes: "number" },
    consumers: ["escalationEngine", "execDashboard"],
    sideEffects: ["notification", "automation"],
    critical: true,
  },

  // ─── WAREHOUSE ───────────────────────────────────────────────────────────
  {
    name: "warehouse.stock.low",
    label: "انخفاض المخزون",
    domain: "warehouse",
    description: "تُصدر من cron عند نزول الكمية تحت الحد الأدنى",
    payload: { productId: "number", currentQty: "number", reorderPoint: "number" },
    consumers: ["autoPurchaseRequest", "execDashboard"],
    sideEffects: ["automation", "notification"],
  },
  {
    name: "warehouse.movement.created",
    label: "حركة مخزنية",
    domain: "warehouse",
    description: "تُصدر عند أي حركة إدخال/إخراج/تحويل",
    payload: { movementId: "number", type: "string", productId: "number", qty: "number" },
    consumers: ["inventoryCostEngine", "financeEngine"],
    sideEffects: ["gl_post", "audit"],
  },

  // ─── WORKFLOW ────────────────────────────────────────────────────────────
  {
    name: "workflow.submitted",
    label: "تقديم طلب اعتماد",
    domain: "workflow",
    description: "تُصدر عند تقديم طلب عبر workflow engine",
    payload: { instanceId: "number", requestType: "string", submittedBy: "number" },
    consumers: ["approverNotifier", "obligationsEngine"],
    sideEffects: ["obligation_register", "notification"],
  },
  {
    name: "workflow.approved",
    label: "اعتماد طلب",
    domain: "workflow",
    description: "تُصدر عند اعتماد نهائي لطلب",
    payload: { instanceId: "number", requestType: "string", approvedBy: "number" },
    consumers: ["sideEffectDispatcher"],
    sideEffects: ["audit", "notification"],
  },
  {
    name: "workflow.rejected",
    label: "رفض طلب",
    domain: "workflow",
    description: "تُصدر عند رفض طلب",
    payload: { instanceId: "number", reason: "string" },
    consumers: ["submitterNotifier"],
    sideEffects: ["audit", "notification"],
  },
  {
    name: "workflow.escalated",
    label: "تصعيد طلب",
    domain: "workflow",
    description: "تُصدر عند تصعيد طلب بسبب تجاوز SLA",
    payload: { instanceId: "number", escalatedTo: "number" },
    consumers: ["higherApprover", "execDashboard"],
    sideEffects: ["notification", "audit"],
    critical: true,
  },

  // ─── SYSTEM ──────────────────────────────────────────────────────────────
  {
    name: "system.obligation.breached",
    label: "التزام متأخر",
    domain: "system",
    description: "تُصدر من obligations scanner عند تجاوز موعد أي التزام مسجل",
    payload: { obligationId: "number", entityType: "string", entityId: "number", daysLate: "number" },
    consumers: ["escalationEngine", "execDashboard"],
    sideEffects: ["notification", "automation"],
    critical: true,
  },
  {
    name: "system.period.reminder",
    label: "تذكير نهاية فترة",
    domain: "system",
    description: "تُصدر قبل نهاية الشهر لتذكير المالية بالإقفال",
    payload: { period: "string", daysRemaining: "number" },
    consumers: ["financeNotifier"],
    sideEffects: ["notification"],
  },
];

/** Fast lookup by event name */
const _eventIndex = new Map<string, EventDefinition>(
  EVENT_CATALOG.map((e) => [e.name, e])
);

export function getEventDefinition(name: string): EventDefinition | undefined {
  return _eventIndex.get(name);
}

export function listEventsByDomain(domain: EventDomain): EventDefinition[] {
  return EVENT_CATALOG.filter((e) => e.domain === domain);
}

export function listCriticalEvents(): EventDefinition[] {
  return EVENT_CATALOG.filter((e) => e.critical === true);
}

export function countEventsByDomain(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of EVENT_CATALOG) {
    out[e.domain] = (out[e.domain] ?? 0) + 1;
  }
  return out;
}
