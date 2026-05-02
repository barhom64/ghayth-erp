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
  | "notifications"
  | "bi";

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
    description: "تُصدر عند تخصيص نقل لمجموعة معتمرين — خدمة داخلية تستهلك fleet_vehicles/fleet_drivers",
    payload: { transportId: "number", vehicleId: "number", driverId: "number", pilgrimCount: "number", cost: "number" },
    consumers: ["fleetEngine", "financeEngine"],
    sideEffects: ["gl_post", "audit"],
  },
  {
    name: "umrah.transport.status_changed",
    label: "تغيير حالة رحلة نقل",
    domain: "umrah",
    description: "تُصدر عند تغيير حالة النقل (scheduled→in_progress→completed/cancelled)",
    payload: { transportId: "number", fromStatus: "string", toStatus: "string" },
    consumers: ["fleetEngine", "execDashboard"],
    sideEffects: ["audit"],
  },
  {
    name: "umrah.transport.deleted",
    label: "حذف رحلة نقل",
    domain: "umrah",
    description: "تُصدر عند حذف رحلة نقل (غير قيد التنفيذ فقط)",
    payload: { transportId: "number" },
    consumers: ["fleetEngine"],
    sideEffects: ["audit"],
  },
  {
    name: "umrah.transport.pilgrims_assigned",
    label: "تخصيص معتمرين لرحلة نقل",
    domain: "umrah",
    description: "تُصدر عند ربط معتمرين برحلة نقل",
    payload: { transportId: "number", pilgrimIds: "number[]", count: "number" },
    consumers: ["execDashboard"],
    sideEffects: ["audit"],
  },
  {
    name: "umrah.group.created",
    label: "إنشاء مجموعة عمرة",
    domain: "umrah",
    description: "تُصدر عند إنشاء مجموعة معتمرين جديدة",
    payload: { groupId: "number", nuskGroupNumber: "string", seasonId: "number" },
    consumers: ["invoicingEngine", "execDashboard"],
    sideEffects: ["audit"],
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

  // ─── FINANCE — توسيع (المالية) ───
  { name: "account.created", label: "إنشاء حساب محاسبي", domain: "finance", description: "تُصدر عند إنشاء حساب محاسبي", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "account.deleted", label: "حذف حساب محاسبي", domain: "finance", description: "تُصدر عند حذف حساب محاسبي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "account.updated", label: "تحديث حساب محاسبي", domain: "finance", description: "تُصدر عند تحديث حساب محاسبي", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "accounting.journal_template.created", label: "إنشاء قالب قيد", domain: "finance", description: "تُصدر عند إنشاء قالب قيد", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "accounting.journal_template.deleted", label: "حذف قالب قيد", domain: "finance", description: "تُصدر عند حذف قالب قيد", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "accounting.journal_template.updated", label: "تحديث قالب قيد", domain: "finance", description: "تُصدر عند تحديث قالب قيد", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "accounting.mapping.updated", label: "تحديث ربط محاسبي", domain: "finance", description: "تُصدر عند تحديث ربط محاسبي", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "accounting.mappings.batch_updated", label: "تحديث جماعي ربط محاسبي جماعي", domain: "finance", description: "تُصدر عند تحديث جماعي ربط محاسبي جماعي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "accounting.subsidiary_account.created", label: "إنشاء حساب فرعي", domain: "finance", description: "تُصدر عند إنشاء حساب فرعي", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "accounting.subsidiary_account.deleted", label: "حذف حساب فرعي", domain: "finance", description: "تُصدر عند حذف حساب فرعي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "bad_debt.posted", label: "ترحيل ديون معدومة", domain: "finance", description: "تُصدر عند ترحيل ديون معدومة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "bank_guarantee.created", label: "إنشاء خطاب ضمان", domain: "finance", description: "تُصدر عند إنشاء خطاب ضمان", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "bank_guarantee.deleted", label: "حذف خطاب ضمان", domain: "finance", description: "تُصدر عند حذف خطاب ضمان", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "bank_guarantee.updated", label: "تحديث خطاب ضمان", domain: "finance", description: "تُصدر عند تحديث خطاب ضمان", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "budget.approval_requested", label: "approval_requested ميزانية", domain: "finance", description: "تُصدر عند approval_requested ميزانية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "budget.created", label: "إنشاء ميزانية", domain: "finance", description: "تُصدر عند إنشاء ميزانية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "budget.deleted", label: "حذف ميزانية", domain: "finance", description: "تُصدر عند حذف ميزانية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "budget.updated", label: "تحديث ميزانية", domain: "finance", description: "تُصدر عند تحديث ميزانية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "cost_center.created", label: "إنشاء مركز تكلفة", domain: "finance", description: "تُصدر عند إنشاء مركز تكلفة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "cost_center.deleted", label: "حذف مركز تكلفة", domain: "finance", description: "تُصدر عند حذف مركز تكلفة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "cost_center.updated", label: "تحديث مركز تكلفة", domain: "finance", description: "تُصدر عند تحديث مركز تكلفة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "daily_close.executed", label: "تنفيذ إقفال يومي", domain: "finance", description: "تُصدر عند تنفيذ إقفال يومي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "deposit.received", label: "استلام وديعة", domain: "finance", description: "تُصدر عند استلام وديعة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"] },
  { name: "expense.created", label: "إنشاء مصروف", domain: "finance", description: "تُصدر عند إنشاء مصروف", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "finance_project.created", label: "إنشاء مشروع مالي", domain: "finance", description: "تُصدر عند إنشاء مشروع مالي", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fiscal.year_end_closed", label: "year_end_closed سنة مالية", domain: "finance", description: "تُصدر عند year_end_closed سنة مالية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "fiscal_period.created", label: "إنشاء فترة مالية", domain: "finance", description: "تُصدر عند إنشاء فترة مالية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "fiscal_period.closed", label: "إقفال فترة مالية", domain: "finance", description: "تُصدر عند إقفال فترة مالية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "fiscal_period.reopened", label: "إعادة فتح فترة مالية", domain: "finance", description: "تُصدر عند إعادة فتح فترة مالية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "impact.previewed", label: "معاينة أثر مالي", domain: "finance", description: "تُصدر عند معاينة أثر مالي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intercompany.created", label: "إنشاء عملية بين شركات", domain: "finance", description: "تُصدر عند إنشاء عملية بين شركات", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "invoice.approved", label: "اعتماد فاتورة", domain: "finance", description: "تُصدر عند اعتماد فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "invoice.created", label: "إنشاء فاتورة", domain: "finance", description: "تُصدر عند إنشاء فاتورة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "invoice.credit_memo", label: "credit_memo فاتورة", domain: "finance", description: "تُصدر عند credit_memo فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "invoice.debit_memo", label: "debit_memo فاتورة", domain: "finance", description: "تُصدر عند debit_memo فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "invoice.deleted", label: "حذف فاتورة", domain: "finance", description: "تُصدر عند حذف فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "invoice.paid", label: "دفع فاتورة", domain: "finance", description: "تُصدر عند دفع فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "invoice.posted", label: "ترحيل فاتورة", domain: "finance", description: "تُصدر عند ترحيل فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "journal.created", label: "إنشاء قيد يومية", domain: "finance", description: "تُصدر عند إنشاء قيد يومية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "journal.manual_created", label: "manual_created قيد يومية", domain: "finance", description: "تُصدر عند manual_created قيد يومية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "journal.reversed", label: "reversed قيد يومية", domain: "finance", description: "تُصدر عند reversed قيد يومية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "payment_run.executed", label: "تنفيذ دفعة تشغيل", domain: "finance", description: "تُصدر عند تنفيذ دفعة تشغيل", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "posting_failure.resolved", label: "حل فشل ترحيل", domain: "finance", description: "تُصدر عند حل فشل ترحيل", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "purchase_order.created", label: "إنشاء أمر شراء", domain: "finance", description: "تُصدر عند إنشاء أمر شراء", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "purchase_order.payment_scheduled", label: "payment_scheduled أمر شراء", domain: "finance", description: "تُصدر عند payment_scheduled أمر شراء", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "purchase_order.received", label: "استلام أمر شراء", domain: "finance", description: "تُصدر عند استلام أمر شراء", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"] },
  { name: "purchase_order.vendor_confirmed", label: "vendor_confirmed أمر شراء", domain: "finance", description: "تُصدر عند vendor_confirmed أمر شراء", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "purchase_request.converted", label: "تحويل طلب شراء", domain: "finance", description: "تُصدر عند تحويل طلب شراء", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "purchase_request.created", label: "إنشاء طلب شراء", domain: "finance", description: "تُصدر عند إنشاء طلب شراء", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "recurring_journal.created", label: "إنشاء قيد متكرر", domain: "finance", description: "تُصدر عند إنشاء قيد متكرر", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "recurring_journal.deleted", label: "حذف قيد متكرر", domain: "finance", description: "تُصدر عند حذف قيد متكرر", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "recurring_journal.run_now", label: "run_now قيد متكرر", domain: "finance", description: "تُصدر عند run_now قيد متكرر", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recurring_journal.updated", label: "تحديث قيد متكرر", domain: "finance", description: "تُصدر عند تحديث قيد متكرر", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "rent_payment.received", label: "استلام دفعة إيجار", domain: "finance", description: "تُصدر عند استلام دفعة إيجار", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"] },
  { name: "salary_component.created", label: "إنشاء مكون راتب", domain: "finance", description: "تُصدر عند إنشاء مكون راتب", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "vendor.created", label: "إنشاء مورد", domain: "finance", description: "تُصدر عند إنشاء مورد", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "vendor.deleted", label: "حذف مورد", domain: "finance", description: "تُصدر عند حذف مورد", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "vendor.updated", label: "تحديث مورد", domain: "finance", description: "تُصدر عند تحديث مورد", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── HR — توسيع (الموارد البشرية) ───
  { name: "attendance.checkin", label: "تسجيل حضور حضور", domain: "hr", description: "تُصدر عند تسجيل حضور حضور", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "attendance.checkout", label: "تسجيل انصراف حضور", domain: "hr", description: "تُصدر عند تسجيل انصراف حضور", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "attendance_policy.updated", label: "تحديث سياسة حضور", domain: "hr", description: "تُصدر عند تحديث سياسة حضور", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "custody.created", label: "إنشاء عهدة", domain: "hr", description: "تُصدر عند إنشاء عهدة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "custody.settled", label: "تسوية عهدة", domain: "hr", description: "تُصدر عند تسوية عهدة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "delegation.created", label: "إنشاء تفويض", domain: "hr", description: "تُصدر عند إنشاء تفويض", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "employee.created", label: "إنشاء موظف", domain: "hr", description: "تُصدر عند إنشاء موظف", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "employee.terminated", label: "إنهاء موظف", domain: "hr", description: "تُصدر عند إنهاء موظف", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "employee.updated", label: "تحديث موظف", domain: "hr", description: "تُصدر عند تحديث موظف", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "employee_document.created", label: "إنشاء مستند موظف", domain: "hr", description: "تُصدر عند إنشاء مستند موظف", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "evaluation.created", label: "إنشاء تقييم", domain: "hr", description: "تُصدر عند إنشاء تقييم", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "excuse.approved", label: "اعتماد عذر", domain: "hr", description: "تُصدر عند اعتماد عذر", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "excuse.created", label: "إنشاء عذر", domain: "hr", description: "تُصدر عند إنشاء عذر", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "exit.approved", label: "اعتماد مخالصة", domain: "hr", description: "تُصدر عند اعتماد مخالصة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "exit.clearance_updated", label: "clearance_updated مخالصة", domain: "hr", description: "تُصدر عند clearance_updated مخالصة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "holiday.created", label: "إنشاء إجازة رسمية", domain: "hr", description: "تُصدر عند إنشاء إجازة رسمية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "holiday.deleted", label: "حذف إجازة رسمية", domain: "hr", description: "تُصدر عند حذف إجازة رسمية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "holiday.updated", label: "تحديث إجازة رسمية", domain: "hr", description: "تُصدر عند تحديث إجازة رسمية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.accruals.posted", label: "ترحيل accruals", domain: "hr", description: "تُصدر عند ترحيل accruals", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "hr.discipline.regulation.created", label: "إنشاء discipline", domain: "hr", description: "تُصدر عند إنشاء discipline", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "hr.discipline.regulation.deleted", label: "حذف discipline", domain: "hr", description: "تُصدر عند حذف discipline", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "hr.discipline.regulation.updated", label: "تحديث discipline", domain: "hr", description: "تُصدر عند تحديث discipline", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.exit.completed", label: "إتمام مخالصة", domain: "hr", description: "تُصدر عند إتمام مخالصة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "hr.exit.created", label: "إنشاء مخالصة", domain: "hr", description: "تُصدر عند إنشاء مخالصة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "hr.letter.approved", label: "اعتماد خطاب", domain: "hr", description: "تُصدر عند اعتماد خطاب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "hr.letter.created", label: "إنشاء خطاب", domain: "hr", description: "تُصدر عند إنشاء خطاب", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "hr.loan.approved", label: "اعتماد loan", domain: "hr", description: "تُصدر عند اعتماد loan", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "hr.loan.created", label: "إنشاء loan", domain: "hr", description: "تُصدر عند إنشاء loan", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "hr.loan.rejected", label: "رفض loan", domain: "hr", description: "تُصدر عند رفض loan", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.appeal_decided", label: "appeal_decided memo", domain: "hr", description: "تُصدر عند appeal_decided memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.appealed", label: "appealed memo", domain: "hr", description: "تُصدر عند appealed memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.auto_escalated", label: "auto_escalated memo", domain: "hr", description: "تُصدر عند auto_escalated memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.cancelled", label: "إلغاء memo", domain: "hr", description: "تُصدر عند إلغاء memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.closed", label: "إغلاق memo", domain: "hr", description: "تُصدر عند إغلاق memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.created", label: "إنشاء memo", domain: "hr", description: "تُصدر عند إنشاء memo", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "hr.memo.gm_decided", label: "gm_decided memo", domain: "hr", description: "تُصدر عند gm_decided memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.justified", label: "justified memo", domain: "hr", description: "تُصدر عند justified memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.memo.manager_recommended", label: "manager_recommended memo", domain: "hr", description: "تُصدر عند manager_recommended memo", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.overtime.approved", label: "اعتماد overtime", domain: "hr", description: "تُصدر عند اعتماد overtime", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "hr.overtime.created", label: "إنشاء overtime", domain: "hr", description: "تُصدر عند إنشاء overtime", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "hr.overtime.rejected", label: "رفض overtime", domain: "hr", description: "تُصدر عند رفض overtime", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.transfer.completed", label: "إتمام transfer", domain: "hr", description: "تُصدر عند إتمام transfer", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "hr.transfer.hr_approved", label: "hr_approved transfer", domain: "hr", description: "تُصدر عند hr_approved transfer", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.transfer.rejected", label: "رفض transfer", domain: "hr", description: "تُصدر عند رفض transfer", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.transfer.rejected_by_receiver", label: "rejected_by_receiver transfer", domain: "hr", description: "تُصدر عند rejected_by_receiver transfer", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "hr.transfer.requested", label: "طلب transfer", domain: "hr", description: "تُصدر عند طلب transfer", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "idp.created", label: "إنشاء خطة تطوير", domain: "hr", description: "تُصدر عند إنشاء خطة تطوير", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "idp.deleted", label: "حذف خطة تطوير", domain: "hr", description: "تُصدر عند حذف خطة تطوير", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "idp.updated", label: "تحديث خطة تطوير", domain: "hr", description: "تُصدر عند تحديث خطة تطوير", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "leave.approved", label: "اعتماد إجازة", domain: "hr", description: "تُصدر عند اعتماد إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "leave.cancelled", label: "إلغاء إجازة", domain: "hr", description: "تُصدر عند إلغاء إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "leave.completed", label: "إتمام إجازة", domain: "hr", description: "تُصدر عند إتمام إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "leave.deleted", label: "حذف إجازة", domain: "hr", description: "تُصدر عند حذف إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "leave.escalated", label: "تصعيد إجازة", domain: "hr", description: "تُصدر عند تصعيد إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "leave.rejected", label: "رفض إجازة", domain: "hr", description: "تُصدر عند رفض إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "leave.requested", label: "طلب إجازة", domain: "hr", description: "تُصدر عند طلب إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "leave.returned", label: "إرجاع إجازة", domain: "hr", description: "تُصدر عند إرجاع إجازة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "leave.updated", label: "تحديث إجازة", domain: "hr", description: "تُصدر عند تحديث إجازة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "letter.deleted", label: "حذف خطاب", domain: "hr", description: "تُصدر عند حذف خطاب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "letter.updated", label: "تحديث خطاب", domain: "hr", description: "تُصدر عند تحديث خطاب", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "onboarding.steps_updated", label: "steps_updated تأهيل موظف", domain: "hr", description: "تُصدر عند steps_updated تأهيل موظف", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "payroll.completed", label: "إتمام رواتب", domain: "hr", description: "تُصدر عند إتمام رواتب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "payroll.deleted", label: "حذف رواتب", domain: "hr", description: "تُصدر عند حذف رواتب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "payroll.posted", label: "ترحيل رواتب", domain: "hr", description: "تُصدر عند ترحيل رواتب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"], critical: true },
  { name: "performance.created", label: "إنشاء أداء", domain: "hr", description: "تُصدر عند إنشاء أداء", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "performance.deleted", label: "حذف أداء", domain: "hr", description: "تُصدر عند حذف أداء", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "performance.updated", label: "تحديث أداء", domain: "hr", description: "تُصدر عند تحديث أداء", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "shift.assignment.created", label: "إنشاء assignment", domain: "hr", description: "تُصدر عند إنشاء assignment", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "shift.created", label: "إنشاء وردية", domain: "hr", description: "تُصدر عند إنشاء وردية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "shift.deleted", label: "حذف وردية", domain: "hr", description: "تُصدر عند حذف وردية", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "shift.updated", label: "تحديث وردية", domain: "hr", description: "تُصدر عند تحديث وردية", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "violation.created", label: "إنشاء مخالفة", domain: "hr", description: "تُصدر عند إنشاء مخالفة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "violation.deleted", label: "حذف مخالفة", domain: "hr", description: "تُصدر عند حذف مخالفة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "violation.updated", label: "تحديث مخالفة", domain: "hr", description: "تُصدر عند تحديث مخالفة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── FLEET — توسيع (الأسطول) ───
  { name: "fleet.driver.created", label: "إنشاء driver", domain: "fleet", description: "تُصدر عند إنشاء driver", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.driver.deleted", label: "حذف driver", domain: "fleet", description: "تُصدر عند حذف driver", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.fuel_log.created", label: "إنشاء fuel_log", domain: "fleet", description: "تُصدر عند إنشاء fuel_log", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.fuel_log.deleted", label: "حذف fuel_log", domain: "fleet", description: "تُصدر عند حذف fuel_log", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.fuel_log.updated", label: "تحديث fuel_log", domain: "fleet", description: "تُصدر عند تحديث fuel_log", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.insurance.created", label: "إنشاء insurance", domain: "fleet", description: "تُصدر عند إنشاء insurance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.insurance.deleted", label: "حذف insurance", domain: "fleet", description: "تُصدر عند حذف insurance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.insurance.updated", label: "تحديث insurance", domain: "fleet", description: "تُصدر عند تحديث insurance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.maintenance.cancelled", label: "إلغاء maintenance", domain: "fleet", description: "تُصدر عند إلغاء maintenance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.maintenance.completed", label: "إتمام maintenance", domain: "fleet", description: "تُصدر عند إتمام maintenance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.maintenance.created", label: "إنشاء maintenance", domain: "fleet", description: "تُصدر عند إنشاء maintenance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.maintenance.deleted", label: "حذف maintenance", domain: "fleet", description: "تُصدر عند حذف maintenance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.maintenance.updated", label: "تحديث maintenance", domain: "fleet", description: "تُصدر عند تحديث maintenance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.preventive.created", label: "إنشاء preventive", domain: "fleet", description: "تُصدر عند إنشاء preventive", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.preventive.due", label: "due preventive", domain: "fleet", description: "تُصدر عند due preventive", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.preventive.updated", label: "تحديث preventive", domain: "fleet", description: "تُصدر عند تحديث preventive", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.traffic_violation.created", label: "إنشاء traffic_violation", domain: "fleet", description: "تُصدر عند إنشاء traffic_violation", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.traffic_violation.paid", label: "دفع traffic_violation", domain: "fleet", description: "تُصدر عند دفع traffic_violation", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"] },
  { name: "fleet.trip.cancelled", label: "إلغاء trip", domain: "fleet", description: "تُصدر عند إلغاء trip", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.trip.created", label: "إنشاء trip", domain: "fleet", description: "تُصدر عند إنشاء trip", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.trip.deleted", label: "حذف trip", domain: "fleet", description: "تُصدر عند حذف trip", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.trip.updated", label: "تحديث trip", domain: "fleet", description: "تُصدر عند تحديث trip", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.trip.waypoint_added", label: "waypoint_added trip", domain: "fleet", description: "تُصدر عند waypoint_added trip", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.vehicle.created", label: "إنشاء vehicle", domain: "fleet", description: "تُصدر عند إنشاء vehicle", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "fleet.vehicle.deleted", label: "حذف vehicle", domain: "fleet", description: "تُصدر عند حذف vehicle", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.vehicle.status_changed", label: "status_changed vehicle", domain: "fleet", description: "تُصدر عند status_changed vehicle", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "fleet.vehicle.updated", label: "تحديث vehicle", domain: "fleet", description: "تُصدر عند تحديث vehicle", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── PROPERTY — توسيع (العقارات) ───
  { name: "lease.created", label: "إنشاء عقد إيجار", domain: "property", description: "تُصدر عند إنشاء عقد إيجار", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "lease.expired", label: "انتهاء عقد إيجار", domain: "property", description: "تُصدر عند انتهاء عقد إيجار", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "lease.renewal_notice", label: "renewal_notice عقد إيجار", domain: "property", description: "تُصدر عند renewal_notice عقد إيجار", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.building.created", label: "إنشاء building", domain: "property", description: "تُصدر عند إنشاء building", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.building.deleted", label: "حذف building", domain: "property", description: "تُصدر عند حذف building", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.building.updated", label: "تحديث building", domain: "property", description: "تُصدر عند تحديث building", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.contract.deleted", label: "حذف contract", domain: "property", description: "تُصدر عند حذف contract", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.contract.renewed", label: "تجديد contract", domain: "property", description: "تُصدر عند تجديد contract", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.inspection.created", label: "إنشاء inspection", domain: "property", description: "تُصدر عند إنشاء inspection", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.installment.paid", label: "دفع installment", domain: "property", description: "تُصدر عند دفع installment", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["gl_post","audit","notification"] },
  { name: "property.late_rent.escalated", label: "تصعيد إيجار متأخر", domain: "property", description: "تُصدر عند تشغيل آلية تصعيد الإيجارات المتأخرة", payload: {"processed":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.maintenance.completed", label: "إتمام maintenance", domain: "property", description: "تُصدر عند إتمام maintenance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.maintenance.created", label: "إنشاء maintenance", domain: "property", description: "تُصدر عند إنشاء maintenance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.maintenance.requested", label: "طلب maintenance", domain: "property", description: "تُصدر عند طلب maintenance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.maintenance.updated", label: "تحديث maintenance", domain: "property", description: "تُصدر عند تحديث maintenance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.owner.created", label: "إنشاء owner", domain: "property", description: "تُصدر عند إنشاء owner", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.owner.deleted", label: "حذف owner", domain: "property", description: "تُصدر عند حذف owner", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.owner.updated", label: "تحديث owner", domain: "property", description: "تُصدر عند تحديث owner", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "property.unit.created", label: "إنشاء unit", domain: "property", description: "تُصدر عند إنشاء unit", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "property.unit.deleted", label: "حذف unit", domain: "property", description: "تُصدر عند حذف unit", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── LEGAL — توسيع (القانونية) ───
  { name: "legal.case.closed", label: "إغلاق case", domain: "legal", description: "تُصدر عند إغلاق case", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.case.deleted", label: "حذف case", domain: "legal", description: "تُصدر عند حذف case", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.case.judgment", label: "judgment case", domain: "legal", description: "تُصدر عند judgment case", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.case.risk_updated", label: "risk_updated case", domain: "legal", description: "تُصدر عند risk_updated case", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.contract.created", label: "إنشاء contract", domain: "legal", description: "تُصدر عند إنشاء contract", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "legal.contract.deleted", label: "حذف contract", domain: "legal", description: "تُصدر عند حذف contract", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.contract.renewed", label: "تجديد contract", domain: "legal", description: "تُصدر عند تجديد contract", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.contract.terminated", label: "إنهاء contract", domain: "legal", description: "تُصدر عند إنهاء contract", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.correspondence.created", label: "إنشاء مراسلة", domain: "legal", description: "تُصدر عند إنشاء مراسلة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "legal.judgment.updated", label: "تحديث judgment", domain: "legal", description: "تُصدر عند تحديث judgment", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "legal.session.created", label: "إنشاء session", domain: "legal", description: "تُصدر عند إنشاء session", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },

  // ─── CRM — توسيع (العملاء) ───
  { name: "client.created", label: "إنشاء عميل", domain: "crm", description: "تُصدر عند إنشاء عميل", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "client.deleted", label: "حذف عميل", domain: "crm", description: "تُصدر عند حذف عميل", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "client.updated", label: "تحديث عميل", domain: "crm", description: "تُصدر عند تحديث عميل", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "crm.deal.lost", label: "lost deal", domain: "crm", description: "تُصدر عند lost deal", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "crm.deal.won", label: "won deal", domain: "crm", description: "تُصدر عند won deal", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "crm.opportunity.created", label: "إنشاء opportunity", domain: "crm", description: "تُصدر عند إنشاء opportunity", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "crm.opportunity.deleted", label: "حذف opportunity", domain: "crm", description: "تُصدر عند حذف opportunity", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "crm.opportunity.stage_changed", label: "stage_changed opportunity", domain: "crm", description: "تُصدر عند stage_changed opportunity", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "crm.opportunity.updated", label: "تحديث opportunity", domain: "crm", description: "تُصدر عند تحديث opportunity", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── SUPPORT — توسيع (الدعم) ───
  { name: "support.kb.created", label: "إنشاء kb", domain: "support", description: "تُصدر عند إنشاء kb", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "support.kb.deleted", label: "حذف kb", domain: "support", description: "تُصدر عند حذف kb", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "support.kb.updated", label: "تحديث kb", domain: "support", description: "تُصدر عند تحديث kb", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "support.reply.created", label: "إنشاء reply", domain: "support", description: "تُصدر عند إنشاء reply", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "support.ticket.assigned", label: "تعيين ticket", domain: "support", description: "تُصدر عند تعيين ticket", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "support.ticket.csat_rated", label: "csat_rated ticket", domain: "support", description: "تُصدر عند csat_rated ticket", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "support.ticket.deleted", label: "حذف ticket", domain: "support", description: "تُصدر عند حذف ticket", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "support.ticket.field_visit", label: "field_visit ticket", domain: "support", description: "تُصدر عند field_visit ticket", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── WAREHOUSE — توسيع (المستودعات) ───
  { name: "warehouse.category.created", label: "إنشاء category", domain: "warehouse", description: "تُصدر عند إنشاء category", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "warehouse.category.deleted", label: "حذف category", domain: "warehouse", description: "تُصدر عند حذف category", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "warehouse.category.updated", label: "تحديث category", domain: "warehouse", description: "تُصدر عند تحديث category", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "warehouse.inventory_count.approved", label: "اعتماد inventory_count", domain: "warehouse", description: "تُصدر عند اعتماد inventory_count", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "warehouse.inventory_count.created", label: "إنشاء inventory_count", domain: "warehouse", description: "تُصدر عند إنشاء inventory_count", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "warehouse.inventory_count_item.recorded", label: "recorded inventory_count_item", domain: "warehouse", description: "تُصدر عند recorded inventory_count_item", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "warehouse.product.created", label: "إنشاء product", domain: "warehouse", description: "تُصدر عند إنشاء product", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "warehouse.product.deleted", label: "حذف product", domain: "warehouse", description: "تُصدر عند حذف product", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "warehouse.supplier.created", label: "إنشاء supplier", domain: "warehouse", description: "تُصدر عند إنشاء supplier", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "warehouse.supplier.deleted", label: "حذف supplier", domain: "warehouse", description: "تُصدر عند حذف supplier", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "warehouse.supplier.updated", label: "تحديث supplier", domain: "warehouse", description: "تُصدر عند تحديث supplier", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "warehouse.transfer.created", label: "إنشاء transfer", domain: "warehouse", description: "تُصدر عند إنشاء transfer", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },

  // ─── WORKFLOW — توسيع (سير العمل) ───
  { name: "approval_chain.created", label: "إنشاء سلسلة اعتماد", domain: "workflow", description: "تُصدر عند إنشاء سلسلة اعتماد", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "approval_chain.deleted", label: "حذف سلسلة اعتماد", domain: "workflow", description: "تُصدر عند حذف سلسلة اعتماد", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "request.approved", label: "اعتماد طلب", domain: "workflow", description: "تُصدر عند اعتماد طلب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "request.created", label: "إنشاء طلب", domain: "workflow", description: "تُصدر عند إنشاء طلب", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "request.deleted", label: "حذف طلب", domain: "workflow", description: "تُصدر عند حذف طلب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "request.rejected", label: "رفض طلب", domain: "workflow", description: "تُصدر عند رفض طلب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "request.returned", label: "إرجاع طلب", domain: "workflow", description: "تُصدر عند إرجاع طلب", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "request.updated", label: "تحديث طلب", domain: "workflow", description: "تُصدر عند تحديث طلب", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "request_type.created", label: "إنشاء نوع طلب", domain: "workflow", description: "تُصدر عند إنشاء نوع طلب", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "workflow.created", label: "إنشاء workflow", domain: "workflow", description: "تُصدر عند إنشاء workflow", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "workflow.definition.created", label: "إنشاء definition", domain: "workflow", description: "تُصدر عند إنشاء definition", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "workflow.definition.deleted", label: "حذف definition", domain: "workflow", description: "تُصدر عند حذف definition", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "workflow.definition.updated", label: "تحديث definition", domain: "workflow", description: "تُصدر عند تحديث definition", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "workflow.instance.approved", label: "اعتماد instance", domain: "workflow", description: "تُصدر عند اعتماد instance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "workflow.instance.created", label: "إنشاء instance", domain: "workflow", description: "تُصدر عند إنشاء instance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "workflow.instance.rejected", label: "رفض instance", domain: "workflow", description: "تُصدر عند رفض instance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── SYSTEM — توسيع (النظام) ───
  { name: "automation.cron_job.toggled", label: "تبديل cron_job", domain: "system", description: "تُصدر عند تبديل cron_job", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "automation.cron_job.triggered", label: "تشغيل cron_job", domain: "system", description: "تُصدر عند تشغيل cron_job", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "automation.proactive_rule.toggled", label: "تبديل proactive_rule", domain: "system", description: "تُصدر عند تبديل proactive_rule", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "entity.comment.created", label: "إنشاء comment", domain: "system", description: "تُصدر عند إنشاء comment", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "entity.comment.deleted", label: "حذف comment", domain: "system", description: "تُصدر عند حذف comment", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "entity.tag.created", label: "إنشاء tag", domain: "system", description: "تُصدر عند إنشاء tag", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "entity.tag.deleted", label: "حذف tag", domain: "system", description: "تُصدر عند حذف tag", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "obligation.cancelled", label: "إلغاء التزام", domain: "system", description: "تُصدر عند إلغاء التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "obligation.cancelled_by_entity", label: "cancelled_by_entity التزام", domain: "system", description: "تُصدر عند cancelled_by_entity التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "obligation.created", label: "إنشاء التزام", domain: "system", description: "تُصدر عند إنشاء التزام", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"], critical: true },
  { name: "obligation.met", label: "met التزام", domain: "system", description: "تُصدر عند met التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "obligation.met_by_entity", label: "met_by_entity التزام", domain: "system", description: "تُصدر عند met_by_entity التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "obligation.scan_triggered", label: "scan_triggered التزام", domain: "system", description: "تُصدر عند scan_triggered التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "rules.created", label: "إنشاء قاعدة", domain: "system", description: "تُصدر عند إنشاء قاعدة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "rules.deleted", label: "حذف قاعدة", domain: "system", description: "تُصدر عند حذف قاعدة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "rules.toggled", label: "تبديل قاعدة", domain: "system", description: "تُصدر عند تبديل قاعدة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "rules.updated", label: "تحديث قاعدة", domain: "system", description: "تُصدر عند تحديث قاعدة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "system.obligation.escalated", label: "تصعيد التزام", domain: "system", description: "تُصدر عند تصعيد التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "system.obligation.reminder", label: "reminder التزام", domain: "system", description: "تُصدر عند reminder التزام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"], critical: true },
  { name: "tenant.created", label: "إنشاء مستأجر نظام", domain: "system", description: "تُصدر عند إنشاء مستأجر نظام", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "tenant.deleted", label: "حذف مستأجر نظام", domain: "system", description: "تُصدر عند حذف مستأجر نظام", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "tenant.updated", label: "تحديث مستأجر نظام", domain: "system", description: "تُصدر عند تحديث مستأجر نظام", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── UMRAH — توسيع (العمرة) ───
  { name: "umrah.agent.deleted", label: "حذف agent", domain: "umrah", description: "تُصدر عند حذف agent", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.agent.linked", label: "linked agent", domain: "umrah", description: "تُصدر عند linked agent", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.agent.updated", label: "تحديث agent", domain: "umrah", description: "تُصدر عند تحديث agent", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.commission.simulated", label: "محاكاة commission", domain: "umrah", description: "تُصدر عند محاكاة commission", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.commission_plan.created", label: "إنشاء commission_plan", domain: "umrah", description: "تُصدر عند إنشاء commission_plan", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "umrah.commission_plan.updated", label: "تحديث commission_plan", domain: "umrah", description: "تُصدر عند تحديث commission_plan", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.import.completed", label: "إتمام import", domain: "umrah", description: "تُصدر عند إتمام import", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "umrah.import.previewed", label: "معاينة import", domain: "umrah", description: "تُصدر عند معاينة import", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.invoice.gl_posted", label: "gl_posted فاتورة", domain: "umrah", description: "تُصدر عند gl_posted فاتورة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.invoice.updated", label: "تحديث فاتورة", domain: "umrah", description: "تُصدر عند تحديث فاتورة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.mutamers.imported", label: "استيراد mutamers", domain: "umrah", description: "تُصدر عند استيراد mutamers", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.package.deleted", label: "حذف package", domain: "umrah", description: "تُصدر عند حذف package", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.package.updated", label: "تحديث package", domain: "umrah", description: "تُصدر عند تحديث package", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.pilgrim.deleted", label: "حذف pilgrim", domain: "umrah", description: "تُصدر عند حذف pilgrim", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.pilgrim.updated", label: "تحديث pilgrim", domain: "umrah", description: "تُصدر عند تحديث pilgrim", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.pilgrims.bulk_assigned", label: "تعيين جماعي pilgrims", domain: "umrah", description: "تُصدر عند تعيين جماعي pilgrims", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.pricing.created", label: "إنشاء pricing", domain: "umrah", description: "تُصدر عند إنشاء pricing", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "umrah.pricing.deleted", label: "حذف pricing", domain: "umrah", description: "تُصدر عند حذف pricing", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.pricing.updated", label: "تحديث pricing", domain: "umrah", description: "تُصدر عند تحديث pricing", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.sub_agent.client_linked", label: "client_linked sub_agent", domain: "umrah", description: "تُصدر عند client_linked sub_agent", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.sub_agent.created", label: "إنشاء sub_agent", domain: "umrah", description: "تُصدر عند إنشاء sub_agent", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "umrah.sub_agent.deleted", label: "حذف sub_agent", domain: "umrah", description: "تُصدر عند حذف sub_agent", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.sub_agent.linked_by_nusk", label: "linked_by_nusk sub_agent", domain: "umrah", description: "تُصدر عند linked_by_nusk sub_agent", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.sub_agent.updated", label: "تحديث sub_agent", domain: "umrah", description: "تُصدر عند تحديث sub_agent", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.penalty.created", label: "إنشاء غرامة", domain: "umrah", description: "تُصدر عند إنشاء غرامة يدوياً", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.violation.deleted", label: "حذف مخالفة", domain: "umrah", description: "تُصدر عند حذف مخالفة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.violation.updated", label: "تحديث مخالفة", domain: "umrah", description: "تُصدر عند تحديث مخالفة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "umrah.vouchers.imported", label: "استيراد vouchers", domain: "umrah", description: "تُصدر عند استيراد vouchers", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── AUTH — توسيع (المصادقة) ───
  { name: "auth.password.changed", label: "changed password", domain: "auth", description: "تُصدر عند changed password", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "auth.refresh", label: "refresh auth", domain: "auth", description: "تُصدر عند refresh auth", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "password_reset.requested", label: "طلب إعادة تعيين كلمة مرور", domain: "auth", description: "تُصدر عند طلب إعادة تعيين كلمة مرور", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "portal.login", label: "login بوابة", domain: "auth", description: "تُصدر عند login بوابة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── ADMIN — توسيع (الإدارة) ───
  { name: "admin.integration.deleted", label: "حذف integration", domain: "admin", description: "تُصدر عند حذف integration", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.integration.updated", label: "تحديث integration", domain: "admin", description: "تُصدر عند تحديث integration", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.integration_logs.retried", label: "retried integration_logs", domain: "admin", description: "تُصدر عند retried integration_logs", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.role_permission.created", label: "إنشاء role_permission", domain: "admin", description: "تُصدر عند إنشاء role_permission", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "admin.role_permission.deleted", label: "حذف role_permission", domain: "admin", description: "تُصدر عند حذف role_permission", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.user.deleted", label: "حذف user", domain: "admin", description: "تُصدر عند حذف user", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.user.password_reset", label: "password_reset user", domain: "admin", description: "تُصدر عند password_reset user", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.user.updated", label: "تحديث user", domain: "admin", description: "تُصدر عند تحديث user", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.user_role.assigned", label: "تعيين user_role", domain: "admin", description: "تُصدر عند تعيين user_role", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.user_role.deleted", label: "حذف user_role", domain: "admin", description: "تُصدر عند حذف user_role", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "admin.violation.resolved", label: "حل مخالفة", domain: "admin", description: "تُصدر عند حل مخالفة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "permissions.role_permission.created", label: "إنشاء role_permission", domain: "admin", description: "تُصدر عند إنشاء role_permission", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "permissions.role_permission.deleted", label: "حذف role_permission", domain: "admin", description: "تُصدر عند حذف role_permission", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "permissions.user_permission.created", label: "إنشاء user_permission", domain: "admin", description: "تُصدر عند إنشاء user_permission", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "permissions.user_permission.deleted", label: "حذف user_permission", domain: "admin", description: "تُصدر عند حذف user_permission", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "settings.created", label: "إنشاء إعدادات", domain: "admin", description: "تُصدر عند إنشاء إعدادات", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "settings.deleted", label: "حذف إعدادات", domain: "admin", description: "تُصدر عند حذف إعدادات", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "settings.updated", label: "تحديث إعدادات", domain: "admin", description: "تُصدر عند تحديث إعدادات", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── TRAINING — توسيع (التدريب) ───
  { name: "training.enrollment.deleted", label: "حذف enrollment", domain: "training", description: "تُصدر عند حذف enrollment", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "training.enrollment.updated", label: "تحديث enrollment", domain: "training", description: "تُصدر عند تحديث enrollment", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "training.program.deleted", label: "حذف program", domain: "training", description: "تُصدر عند حذف program", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "training.program.rejected", label: "رفض program", domain: "training", description: "تُصدر عند رفض program", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "training.program.updated", label: "تحديث program", domain: "training", description: "تُصدر عند تحديث program", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── GOVERNANCE — توسيع (الحوكمة) ───
  { name: "gov.integration.tested", label: "tested integration", domain: "governance", description: "تُصدر عند tested integration", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "gov.integration.updated", label: "تحديث integration", domain: "governance", description: "تُصدر عند تحديث integration", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "gov.link.created", label: "إنشاء link", domain: "governance", description: "تُصدر عند إنشاء link", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "gov.link.deleted", label: "حذف link", domain: "governance", description: "تُصدر عند حذف link", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "gov.link.updated", label: "تحديث link", domain: "governance", description: "تُصدر عند تحديث link", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.audit.deleted", label: "حذف audit", domain: "governance", description: "تُصدر عند حذف audit", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.audit.updated", label: "تحديث audit", domain: "governance", description: "تُصدر عند تحديث audit", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.capa.updated", label: "تحديث capa", domain: "governance", description: "تُصدر عند تحديث capa", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.compliance.deleted", label: "حذف compliance", domain: "governance", description: "تُصدر عند حذف compliance", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.compliance.updated", label: "تحديث compliance", domain: "governance", description: "تُصدر عند تحديث compliance", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.compliance_action.created", label: "إنشاء compliance_action", domain: "governance", description: "تُصدر عند إنشاء compliance_action", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "governance.compliance_action.deleted", label: "حذف compliance_action", domain: "governance", description: "تُصدر عند حذف compliance_action", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.compliance_action.updated", label: "تحديث compliance_action", domain: "governance", description: "تُصدر عند تحديث compliance_action", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.policy.deleted", label: "حذف policy", domain: "governance", description: "تُصدر عند حذف policy", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.policy.new_version", label: "new_version policy", domain: "governance", description: "تُصدر عند new_version policy", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.policy.updated", label: "تحديث policy", domain: "governance", description: "تُصدر عند تحديث policy", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.risk.deleted", label: "حذف risk", domain: "governance", description: "تُصدر عند حذف risk", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.risk.treatment_updated", label: "treatment_updated risk", domain: "governance", description: "تُصدر عند treatment_updated risk", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "governance.risk.updated", label: "تحديث risk", domain: "governance", description: "تُصدر عند تحديث risk", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "pdpl.data_request.created", label: "إنشاء data_request", domain: "governance", description: "تُصدر عند إنشاء data_request", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },

  // ─── MARKETING — توسيع (التسويق) ───
  { name: "marketing.campaign.deleted", label: "حذف campaign", domain: "marketing", description: "تُصدر عند حذف campaign", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "marketing.campaign.updated", label: "تحديث campaign", domain: "marketing", description: "تُصدر عند تحديث campaign", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── DOCUMENTS — توسيع (المستندات) ───
  { name: "company_document.created", label: "إنشاء مستند شركة", domain: "documents", description: "تُصدر عند إنشاء مستند شركة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "correspondence.created", label: "إنشاء مراسلة", domain: "documents", description: "تُصدر عند إنشاء مراسلة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "correspondence.responded", label: "رد مراسلة", domain: "documents", description: "تُصدر عند رد مراسلة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "correspondence.sent", label: "إرسال مراسلة", domain: "documents", description: "تُصدر عند إرسال مراسلة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "correspondence.updated", label: "تحديث مراسلة", domain: "documents", description: "تُصدر عند تحديث مراسلة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "digital_signature.otp_requested", label: "otp_requested توقيع إلكتروني", domain: "documents", description: "تُصدر عند otp_requested توقيع إلكتروني", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "digital_signature.verified", label: "تحقق توقيع إلكتروني", domain: "documents", description: "تُصدر عند تحقق توقيع إلكتروني", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "documents.document.deleted", label: "حذف document", domain: "documents", description: "تُصدر عند حذف document", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "documents.document.updated", label: "تحديث document", domain: "documents", description: "تُصدر عند تحديث document", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "documents.document.uploaded", label: "رفع document", domain: "documents", description: "تُصدر عند رفع document", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "documents.entity_link.created", label: "إنشاء entity_link", domain: "documents", description: "تُصدر عند إنشاء entity_link", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "documents.folder.created", label: "إنشاء folder", domain: "documents", description: "تُصدر عند إنشاء folder", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "documents.template.deleted", label: "حذف template", domain: "documents", description: "تُصدر عند حذف template", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "documents.template.updated", label: "تحديث template", domain: "documents", description: "تُصدر عند تحديث template", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "documents.version.created", label: "إنشاء version", domain: "documents", description: "تُصدر عند إنشاء version", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "storage.upload_requested", label: "upload_requested تخزين", domain: "documents", description: "تُصدر عند upload_requested تخزين", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── COMMUNICATIONS — توسيع (الاتصالات) ───
  { name: "communications.log.converted", label: "تحويل log", domain: "communications", description: "تُصدر عند تحويل log", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "communications.log.deleted", label: "حذف log", domain: "communications", description: "تُصدر عند حذف log", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "communications.log.updated", label: "تحديث log", domain: "communications", description: "تُصدر عند تحديث log", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "communications.push.subscribed", label: "اشتراك push", domain: "communications", description: "تُصدر عند اشتراك push", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "communications.push.test", label: "test push", domain: "communications", description: "تُصدر عند test push", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "communications.push.unsubscribed", label: "إلغاء اشتراك push", domain: "communications", description: "تُصدر عند إلغاء اشتراك push", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── INTELLIGENCE — توسيع (الذكاء) ───
  { name: "activity.ingested", label: "استيعاب نشاط", domain: "intelligence", description: "تُصدر عند استيعاب نشاط", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.ai.draft_replied", label: "draft_replied ai", domain: "intelligence", description: "تُصدر عند draft_replied ai", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.ai.forecasted", label: "forecasted ai", domain: "intelligence", description: "تُصدر عند forecasted ai", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.ai.rules_evaluated", label: "rules_evaluated ai", domain: "intelligence", description: "تُصدر عند rules_evaluated ai", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.ai.summarized", label: "summarized ai", domain: "intelligence", description: "تُصدر عند summarized ai", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.ai.translated", label: "translated ai", domain: "intelligence", description: "تُصدر عند translated ai", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.alert.read", label: "قراءة alert", domain: "intelligence", description: "تُصدر عند قراءة alert", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.alert.scanned", label: "scanned alert", domain: "intelligence", description: "تُصدر عند scanned alert", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.algorithm.haversine", label: "haversine algorithm", domain: "intelligence", description: "تُصدر عند haversine algorithm", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.algorithm.load_balanced", label: "load_balanced algorithm", domain: "intelligence", description: "تُصدر عند load_balanced algorithm", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "intelligence.algorithm.moving_average", label: "moving_average algorithm", domain: "intelligence", description: "تُصدر عند moving_average algorithm", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── RECRUITMENT — توسيع (التوظيف) ───
  { name: "careers.account.logged_in", label: "تسجيل دخول حساب محاسبي", domain: "recruitment", description: "تُصدر عند تسجيل دخول حساب محاسبي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "careers.account.registered", label: "تسجيل حساب محاسبي", domain: "recruitment", description: "تُصدر عند تسجيل حساب محاسبي", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "careers.application.submitted", label: "تقديم application", domain: "recruitment", description: "تُصدر عند تقديم application", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "careers.profile.updated", label: "تحديث profile", domain: "recruitment", description: "تُصدر عند تحديث profile", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "careers.resume.updated", label: "تحديث resume", domain: "recruitment", description: "تُصدر عند تحديث resume", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recruitment.application.deleted", label: "حذف application", domain: "recruitment", description: "تُصدر عند حذف application", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recruitment.application.updated", label: "تحديث application", domain: "recruitment", description: "تُصدر عند تحديث application", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recruitment.posting.closed", label: "إغلاق posting", domain: "recruitment", description: "تُصدر عند إغلاق posting", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recruitment.posting.deleted", label: "حذف posting", domain: "recruitment", description: "تُصدر عند حذف posting", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recruitment.posting.reopened", label: "إعادة فتح posting", domain: "recruitment", description: "تُصدر عند إعادة فتح posting", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "recruitment.posting.updated", label: "تحديث posting", domain: "recruitment", description: "تُصدر عند تحديث posting", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── TASKS — توسيع (المهام) ───
  { name: "task.completed", label: "إتمام مهمة", domain: "tasks", description: "تُصدر عند إتمام مهمة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "task.created", label: "إنشاء مهمة", domain: "tasks", description: "تُصدر عند إنشاء مهمة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "task.deleted", label: "حذف مهمة", domain: "tasks", description: "تُصدر عند حذف مهمة", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── NOTIFICATIONS — توسيع (الإشعارات) ───
  { name: "notification.all_read", label: "all_read إشعار", domain: "notifications", description: "تُصدر عند all_read إشعار", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.fallback_chain.created", label: "إنشاء fallback_chain", domain: "notifications", description: "تُصدر عند إنشاء fallback_chain", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "notification.fallback_chain.deleted", label: "حذف fallback_chain", domain: "notifications", description: "تُصدر عند حذف fallback_chain", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.fallback_chain.updated", label: "تحديث fallback_chain", domain: "notifications", description: "تُصدر عند تحديث fallback_chain", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.preference.updated", label: "تحديث preference", domain: "notifications", description: "تُصدر عند تحديث preference", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.preferences.updated", label: "تحديث preferences", domain: "notifications", description: "تُصدر عند تحديث preferences", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.read", label: "قراءة إشعار", domain: "notifications", description: "تُصدر عند قراءة إشعار", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.routing_rule.created", label: "إنشاء routing_rule", domain: "notifications", description: "تُصدر عند إنشاء routing_rule", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "notification.routing_rule.deleted", label: "حذف routing_rule", domain: "notifications", description: "تُصدر عند حذف routing_rule", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.routing_rule.updated", label: "تحديث routing_rule", domain: "notifications", description: "تُصدر عند تحديث routing_rule", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.template.created", label: "إنشاء template", domain: "notifications", description: "تُصدر عند إنشاء template", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "notification.template.deleted", label: "حذف template", domain: "notifications", description: "تُصدر عند حذف template", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.template.updated", label: "تحديث template", domain: "notifications", description: "تُصدر عند تحديث template", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.webhook.created", label: "إنشاء webhook", domain: "notifications", description: "تُصدر عند إنشاء webhook", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "notification.webhook.deleted", label: "حذف webhook", domain: "notifications", description: "تُصدر عند حذف webhook", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "notification.webhook.updated", label: "تحديث webhook", domain: "notifications", description: "تُصدر عند تحديث webhook", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── PROJECT — توسيع (المشاريع) ───
  { name: "project.cost.created", label: "إنشاء cost", domain: "project", description: "تُصدر عند إنشاء cost", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "project.deleted", label: "حذف project", domain: "project", description: "تُصدر عند حذف project", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "project.milestone.updated", label: "تحديث milestone", domain: "project", description: "تُصدر عند تحديث milestone", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "project.phase.created", label: "إنشاء phase", domain: "project", description: "تُصدر عند إنشاء phase", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "project.resource.created", label: "إنشاء resource", domain: "project", description: "تُصدر عند إنشاء resource", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "project.risk.updated", label: "تحديث risk", domain: "project", description: "تُصدر عند تحديث risk", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "project.task.created", label: "إنشاء مهمة", domain: "project", description: "تُصدر عند إنشاء مهمة", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },

  // ─── STORE — توسيع (المتجر) ───
  { name: "store.order.deleted", label: "حذف order", domain: "store", description: "تُصدر عند حذف order", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "store.order.gl_posted", label: "gl_posted order", domain: "store", description: "تُصدر عند gl_posted order", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "store.order.updated", label: "تحديث order", domain: "store", description: "تُصدر عند تحديث order", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "store.product.deleted", label: "حذف product", domain: "store", description: "تُصدر عند حذف product", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "store.product.updated", label: "تحديث product", domain: "store", description: "تُصدر عند تحديث product", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit"] },

  // ─── BI — توسيع (تحليلات الأعمال) ───
  { name: "bi.alert.muted", label: "كتم alert", domain: "bi", description: "تُصدر عند كتم alert", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "bi.alert.unmuted", label: "إلغاء كتم alert", domain: "bi", description: "تُصدر عند إلغاء كتم alert", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "bi.dashboard.created", label: "إنشاء dashboard", domain: "bi", description: "تُصدر عند إنشاء dashboard", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "bi.insight.dismissed", label: "تجاهل insight", domain: "bi", description: "تُصدر عند تجاهل insight", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "bi.insight.read", label: "قراءة insight", domain: "bi", description: "تُصدر عند قراءة insight", payload: {"id":"number"}, consumers: ["auditTrail"], sideEffects: ["audit"] },
  { name: "bi.kpi.created", label: "إنشاء kpi", domain: "bi", description: "تُصدر عند إنشاء kpi", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },
  { name: "bi.report.created", label: "إنشاء report", domain: "bi", description: "تُصدر عند إنشاء report", payload: {"id":"number","name":"string"}, consumers: ["auditTrail"], sideEffects: ["audit","notification"] },

  // ─── DIRECT eventBus.emit() EVENTS ───
  { name: "fleet.vehicle.breakdown", label: "عطل مركبة", domain: "fleet", description: "تُصدر عند اكتشاف عطل في مركبة", payload: { vehicleId: "number", reason: "string" }, consumers: ["maintenanceWorkflow", "execDashboard"], sideEffects: ["notification", "audit"], critical: true },
  { name: "hr.auto_detection.completed", label: "اكتمال كشف تلقائي", domain: "hr", description: "تُصدر بعد انتهاء محرك الكشف التلقائي عن المخالفات", payload: { companyId: "number", detected: "number" }, consumers: ["hrNotifier"], sideEffects: ["notification", "audit"] },
  { name: "company.created", label: "إنشاء شركة", domain: "admin", description: "تُصدر عند إنشاء شركة جديدة في النظام", payload: { companyId: "number", name: "string" }, consumers: ["onboardingEngine"], sideEffects: ["audit", "notification"], critical: true },
  { name: "journal.entry.created", label: "إنشاء قيد محاسبي", domain: "finance", description: "تُصدر بعد ترحيل قيد يومية جديد", payload: { journalId: "number", sourceKey: "string", total: "number" }, consumers: ["glReconciler", "budgetValidator"], sideEffects: ["audit"], critical: true },
];

/** Fast lookup by event name */
const _eventIndex = new Map<string, EventDefinition>(
  EVENT_CATALOG.map((e) => [e.name, e])
);

export function getEventDefinition(name: string): EventDefinition | undefined {
  return _eventIndex.get(name);
}

export function isKnownEvent(name: string): boolean {
  return _eventIndex.has(name);
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
