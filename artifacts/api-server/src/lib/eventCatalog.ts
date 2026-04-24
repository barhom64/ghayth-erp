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
  | "system"
  | "umrah"
  | "auth"
  | "admin"
  | "training"
  | "governance"
  | "marketing"
  | "documents"
  | "communications"
  | "intelligence"
  | "recruitment"
  | "tasks"
  | "notifications";

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

  // ─── UMRAH ────────────────────────────────────────────────────────────
  {
    name: "umrah.pilgrim.created",
    label: "تسجيل معتمر",
    domain: "umrah",
    description: "تُصدر عند تسجيل معتمر جديد في النظام",
    payload: { pilgrimId: "number", packageId: "number", passportNo: "string" },
    consumers: ["transportAssigner", "invoiceGenerator", "obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "umrah.invoice.generated",
    label: "إنشاء فاتورة عمرة",
    domain: "umrah",
    description: "تُصدر عند توليد فاتورة من محرك الفوترة",
    payload: { invoiceId: "number", pilgrimId: "number", total: "number" },
    consumers: ["financeEngine", "commissionEngine"],
    sideEffects: ["gl_post", "audit"],
    critical: true,
  },
  {
    name: "umrah.payment.received",
    label: "استلام دفعة عمرة",
    domain: "umrah",
    description: "تُصدر عند تسجيل سداد من معتمر أو وكيل فرعي",
    payload: { paymentId: "number", invoiceId: "number", amount: "number", method: "string" },
    consumers: ["financeEngine", "cashFlowTracker"],
    sideEffects: ["gl_post", "audit"],
    critical: true,
  },
  {
    name: "umrah.commission.calculated",
    label: "احتساب عمولة",
    domain: "umrah",
    description: "تُصدر عند احتساب عمولة وكيل أو موظف",
    payload: { commissionId: "number", agentId: "number", amount: "number", period: "string" },
    consumers: ["payrollEngine", "financeEngine"],
    sideEffects: ["gl_post", "notification", "audit"],
    critical: true,
  },
  {
    name: "umrah.package.created",
    label: "إنشاء باقة عمرة",
    domain: "umrah",
    description: "تُصدر عند تسجيل باقة جديدة مع التسعير",
    payload: { packageId: "number", name: "string", basePrice: "number" },
    consumers: ["pricingEngine"],
    sideEffects: ["audit"],
  },
  {
    name: "umrah.transport.created",
    label: "إنشاء رحلة نقل",
    domain: "umrah",
    description: "تُصدر عند تخصيص نقل لمجموعة معتمرين",
    payload: { transportId: "number", vehicleType: "string", pilgrimCount: "number" },
    consumers: ["fleetEngine", "financeEngine"],
    sideEffects: ["gl_post", "audit"],
  },
  {
    name: "umrah.agent.created",
    label: "تسجيل وكيل عمرة",
    domain: "umrah",
    description: "تُصدر عند إضافة وكيل فرعي أو رئيسي",
    payload: { agentId: "number", name: "string", agentType: "string" },
    consumers: ["commissionEngine"],
    sideEffects: ["audit"],
  },
  {
    name: "umrah.season.opened",
    label: "افتتاح موسم عمرة",
    domain: "umrah",
    description: "تُصدر عند فتح موسم جديد",
    payload: { seasonId: "number", startDate: "string", endDate: "string" },
    consumers: ["pricingEngine", "execDashboard"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "umrah.violation.created",
    label: "تسجيل مخالفة عمرة",
    domain: "umrah",
    description: "تُصدر عند تسجيل مخالفة تنظيمية",
    payload: { violationId: "number", type: "string", severity: "string" },
    consumers: ["legalEngine", "execDashboard"],
    sideEffects: ["notification", "audit"],
  },

  // ─── AUTH ─────────────────────────────────────────────────────────────
  {
    name: "auth.register",
    label: "تسجيل مستخدم جديد",
    domain: "auth",
    description: "تُصدر عند إنشاء حساب مستخدم جديد",
    payload: { userId: "number", email: "string" },
    consumers: ["onboardingEngine", "notificationService"],
    sideEffects: ["audit", "notification"],
  },
  {
    name: "auth.login.success",
    label: "تسجيل دخول ناجح",
    domain: "auth",
    description: "تُصدر عند نجاح عملية تسجيل الدخول",
    payload: { userId: "number", ip: "string" },
    consumers: ["securityMonitor"],
    sideEffects: ["audit"],
  },
  {
    name: "auth.switch_assignment",
    label: "تبديل التعيين",
    domain: "auth",
    description: "تُصدر عند تبديل المستخدم بين التعيينات",
    payload: { userId: "number", fromAssignment: "number", toAssignment: "number" },
    consumers: ["sessionTracker"],
    sideEffects: ["audit"],
  },

  // ─── ADMIN ────────────────────────────────────────────────────────────
  {
    name: "admin.user.created",
    label: "إنشاء مستخدم إداري",
    domain: "admin",
    description: "تُصدر عند إنشاء مستخدم من لوحة الإدارة",
    payload: { userId: "number", role: "string" },
    consumers: ["notificationService"],
    sideEffects: ["audit", "notification"],
  },
  {
    name: "admin.role.created",
    label: "إنشاء دور",
    domain: "admin",
    description: "تُصدر عند إنشاء دور جديد في النظام",
    payload: { roleId: "number", name: "string" },
    consumers: ["rbacEngine"],
    sideEffects: ["audit"],
  },
  {
    name: "admin.role_permissions.bulk_updated",
    label: "تحديث صلاحيات دور",
    domain: "admin",
    description: "تُصدر عند تعديل صلاحيات دور بالجملة",
    payload: { roleId: "number", permissionCount: "number" },
    consumers: ["rbacEngine", "sessionInvalidator"],
    sideEffects: ["audit"],
    critical: true,
  },
  {
    name: "admin.integration.created",
    label: "إنشاء تكامل خارجي",
    domain: "admin",
    description: "تُصدر عند ربط نظام خارجي",
    payload: { integrationId: "number", provider: "string" },
    consumers: ["webhookDispatcher"],
    sideEffects: ["audit"],
  },

  // ─── TRAINING ─────────────────────────────────────────────────────────
  {
    name: "training.program.created",
    label: "إنشاء برنامج تدريبي",
    domain: "training",
    description: "تُصدر عند إنشاء برنامج تدريبي جديد",
    payload: { programId: "number", title: "string", startDate: "string" },
    consumers: ["enrollmentEngine", "obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "training.program.approved",
    label: "اعتماد برنامج تدريبي",
    domain: "training",
    description: "تُصدر عند اعتماد البرنامج من الإدارة",
    payload: { programId: "number", approvedBy: "number" },
    consumers: ["enrollmentEngine", "budgetValidator"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "training.enrollment.created",
    label: "تسجيل متدرب",
    domain: "training",
    description: "تُصدر عند تسجيل موظف في برنامج تدريبي",
    payload: { enrollmentId: "number", employeeId: "number", programId: "number" },
    consumers: ["obligationsEngine"],
    sideEffects: ["notification", "audit"],
  },

  // ─── GOVERNANCE ───────────────────────────────────────────────────────
  {
    name: "governance.risk.created",
    label: "تسجيل خطر",
    domain: "governance",
    description: "تُصدر عند تسجيل خطر جديد في سجل المخاطر",
    payload: { riskId: "number", severity: "string", likelihood: "string" },
    consumers: ["riskDashboard", "obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "governance.compliance.created",
    label: "تسجيل التزام تنظيمي",
    domain: "governance",
    description: "تُصدر عند تسجيل بند امتثال جديد",
    payload: { complianceId: "number", framework: "string", dueDate: "string" },
    consumers: ["obligationsEngine", "execDashboard"],
    sideEffects: ["obligation_register", "notification", "audit"],
    critical: true,
  },
  {
    name: "governance.audit.created",
    label: "إنشاء تدقيق",
    domain: "governance",
    description: "تُصدر عند إنشاء مهمة تدقيق داخلي",
    payload: { auditId: "number", scope: "string", auditor: "number" },
    consumers: ["obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "governance.policy.created",
    label: "إنشاء سياسة",
    domain: "governance",
    description: "تُصدر عند نشر سياسة أو لائحة جديدة",
    payload: { policyId: "number", title: "string", version: "number" },
    consumers: ["documentsEngine", "notificationService"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "governance.capa.created",
    label: "إجراء تصحيحي",
    domain: "governance",
    description: "تُصدر عند إنشاء إجراء تصحيحي/وقائي (CAPA)",
    payload: { capaId: "number", type: "string", targetDate: "string" },
    consumers: ["obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },

  // ─── MARKETING ────────────────────────────────────────────────────────
  {
    name: "marketing.campaign.created",
    label: "إنشاء حملة تسويقية",
    domain: "marketing",
    description: "تُصدر عند إنشاء حملة تسويقية جديدة",
    payload: { campaignId: "number", name: "string", budget: "number" },
    consumers: ["budgetValidator", "execDashboard"],
    sideEffects: ["audit"],
  },
  {
    name: "marketing.campaign.revenue_updated",
    label: "تحديث إيرادات حملة",
    domain: "marketing",
    description: "تُصدر عند ربط إيرادات بحملة تسويقية",
    payload: { campaignId: "number", revenue: "number", roi: "number" },
    consumers: ["execDashboard"],
    sideEffects: ["audit"],
  },

  // ─── DOCUMENTS ────────────────────────────────────────────────────────
  {
    name: "documents.document.created",
    label: "إنشاء مستند",
    domain: "documents",
    description: "تُصدر عند رفع أو إنشاء مستند جديد",
    payload: { documentId: "number", type: "string", entityType: "string", entityId: "number" },
    consumers: ["searchIndexer", "versionControl"],
    sideEffects: ["audit"],
  },
  {
    name: "documents.document.status_changed",
    label: "تغيير حالة مستند",
    domain: "documents",
    description: "تُصدر عند تغيير حالة المستند (active/archived/expired)",
    payload: { documentId: "number", oldStatus: "string", newStatus: "string" },
    consumers: ["obligationsEngine"],
    sideEffects: ["audit", "notification"],
  },
  {
    name: "documents.template.created",
    label: "إنشاء قالب مستند",
    domain: "documents",
    description: "تُصدر عند إنشاء قالب مستند جديد",
    payload: { templateId: "number", name: "string" },
    consumers: ["templateEngine"],
    sideEffects: ["audit"],
  },

  // ─── COMMUNICATIONS ───────────────────────────────────────────────────
  {
    name: "communications.message.sent",
    label: "إرسال رسالة",
    domain: "communications",
    description: "تُصدر عند إرسال رسالة عبر أي قناة (SMS/WhatsApp/Email)",
    payload: { messageId: "number", channel: "string", recipient: "string" },
    consumers: ["communicationsTracker"],
    sideEffects: ["audit"],
  },
  {
    name: "communications.log.created",
    label: "تسجيل اتصال",
    domain: "communications",
    description: "تُصدر عند تسجيل سجل اتصال يدوي",
    payload: { logId: "number", direction: "string", channel: "string" },
    consumers: ["crmEngine"],
    sideEffects: ["audit"],
  },

  // ─── RECRUITMENT ──────────────────────────────────────────────────────
  {
    name: "recruitment.posting.created",
    label: "نشر وظيفة شاغرة",
    domain: "recruitment",
    description: "تُصدر عند نشر إعلان وظيفي",
    payload: { postingId: "number", title: "string", department: "string" },
    consumers: ["careersPortal", "execDashboard"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "recruitment.application.created",
    label: "تقديم طلب توظيف",
    domain: "recruitment",
    description: "تُصدر عند تقديم مرشح لطلب توظيف",
    payload: { applicationId: "number", postingId: "number", applicantName: "string" },
    consumers: ["recruitmentWorkflow", "hrNotifier"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "recruitment.job.closed",
    label: "إغلاق وظيفة شاغرة",
    domain: "recruitment",
    description: "تُصدر عند إغلاق إعلان وظيفي",
    payload: { postingId: "number", reason: "string", applicantCount: "number" },
    consumers: ["execDashboard"],
    sideEffects: ["audit"],
  },

  // ─── TASKS ────────────────────────────────────────────────────────────
  {
    name: "tasks.task.created",
    label: "إنشاء مهمة",
    domain: "tasks",
    description: "تُصدر عند إنشاء مهمة جديدة",
    payload: { taskId: "number", title: "string", type: "string", assignedTo: "number" },
    consumers: ["notificationService", "obligationsEngine"],
    sideEffects: ["obligation_register", "notification", "audit"],
  },
  {
    name: "tasks.task.completed",
    label: "إتمام مهمة",
    domain: "tasks",
    description: "تُصدر عند تغيير حالة المهمة إلى مكتملة",
    payload: { taskId: "number", completedBy: "number" },
    consumers: ["obligationsEngine", "performanceTracker"],
    sideEffects: ["audit"],
  },
  {
    name: "tasks.task.deleted",
    label: "حذف مهمة",
    domain: "tasks",
    description: "تُصدر عند حذف مهمة (soft delete)",
    payload: { taskId: "number", title: "string" },
    consumers: ["obligationsEngine"],
    sideEffects: ["audit"],
  },

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────
  {
    name: "notifications.template.created",
    label: "إنشاء قالب إشعار",
    domain: "notifications",
    description: "تُصدر عند إنشاء قالب إشعار جديد",
    payload: { templateId: "number", channel: "string", name: "string" },
    consumers: ["notificationEngine"],
    sideEffects: ["audit"],
  },
  {
    name: "notifications.webhook.created",
    label: "إنشاء webhook",
    domain: "notifications",
    description: "تُصدر عند تسجيل webhook جديد",
    payload: { webhookId: "number", url: "string", events: "string[]" },
    consumers: ["webhookDispatcher"],
    sideEffects: ["audit"],
  },

  // ─── INTELLIGENCE ─────────────────────────────────────────────────────
  {
    name: "intelligence.ai.categorized",
    label: "تصنيف ذكي",
    domain: "intelligence",
    description: "تُصدر عند تصنيف كيان بواسطة الذكاء الاصطناعي",
    payload: { entityType: "string", entityId: "number", category: "string", confidence: "number" },
    consumers: ["automationEngine"],
    sideEffects: ["audit"],
  },
  {
    name: "intelligence.smart_assign.created",
    label: "توزيع ذكي",
    domain: "intelligence",
    description: "تُصدر عند توزيع مهمة عبر خوارزمية التوازن",
    payload: { taskId: "number", assignedTo: "number", algorithm: "string" },
    consumers: ["performanceTracker"],
    sideEffects: ["audit"],
  },

  // ─── PROJECT ──────────────────────────────────────────────────────────
  {
    name: "project.created",
    label: "إنشاء مشروع",
    domain: "project",
    description: "تُصدر عند إنشاء مشروع جديد",
    payload: { projectId: "number", name: "string", budget: "number" },
    consumers: ["budgetValidator", "obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "project.milestone.created",
    label: "إنشاء مرحلة مشروع",
    domain: "project",
    description: "تُصدر عند إضافة milestone لمشروع",
    payload: { milestoneId: "number", projectId: "number", dueDate: "string" },
    consumers: ["obligationsEngine"],
    sideEffects: ["obligation_register", "audit"],
  },
  {
    name: "project.phase.completed",
    label: "إتمام مرحلة",
    domain: "project",
    description: "تُصدر عند إتمام مرحلة من المشروع",
    payload: { phaseId: "number", projectId: "number" },
    consumers: ["execDashboard"],
    sideEffects: ["notification", "audit"],
  },
  {
    name: "project.risk.created",
    label: "تسجيل خطر مشروع",
    domain: "project",
    description: "تُصدر عند تسجيل خطر في مشروع",
    payload: { riskId: "number", projectId: "number", severity: "string" },
    consumers: ["riskDashboard"],
    sideEffects: ["notification", "audit"],
  },

  // ─── STORE ────────────────────────────────────────────────────────────
  {
    name: "store.order.created",
    label: "إنشاء طلب متجر",
    domain: "store",
    description: "تُصدر عند إنشاء طلب من المتجر الإلكتروني",
    payload: { orderId: "number", total: "number", itemCount: "number" },
    consumers: ["inventoryEngine", "financeEngine"],
    sideEffects: ["gl_post", "audit", "notification"],
  },
  {
    name: "store.product.created",
    label: "إضافة منتج متجر",
    domain: "store",
    description: "تُصدر عند إضافة منتج جديد في المتجر",
    payload: { productId: "number", name: "string", price: "number" },
    consumers: ["searchIndexer"],
    sideEffects: ["audit"],
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

export interface EventValidationResult {
  valid: boolean;
  cataloged: boolean;
  warnings: string[];
}

export function validateEventPayload(
  action: string,
  payload: Record<string, any>
): EventValidationResult {
  const def = _eventIndex.get(action);
  if (!def) {
    return { valid: true, cataloged: false, warnings: [`Event "${action}" not in catalog`] };
  }

  const warnings: string[] = [];
  for (const [field, expectedType] of Object.entries(def.payload)) {
    const val = payload[field] ?? payload.after?.[field];
    if (val === undefined || val === null) {
      warnings.push(`Missing required field "${field}" (expected ${expectedType})`);
    } else if (expectedType === "number" && typeof val !== "number" && isNaN(Number(val))) {
      warnings.push(`Field "${field}" should be ${expectedType}, got ${typeof val}`);
    }
  }

  return { valid: warnings.length === 0, cataloged: true, warnings };
}
