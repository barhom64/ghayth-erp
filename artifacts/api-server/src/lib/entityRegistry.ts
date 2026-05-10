// ─── Entity Operational Registry — المرجعية التشغيلية لكيانات النظام ────────
// Single source of truth for every business entity in Ghayth ERP.
// Used by:
//   • /admin/system-registry/coverage  — gap detection
//   • ManagerBoard                     — dynamic approval types
//   • Detail pages                     — tab discovery
//   • Self-audit                       — compliance checks
//
// Every entity MUST be declared here. If it exists in the DB or UI but not in
// this registry, the Missing Coverage page flags it.

// ─── Types ──────────────────────────────────────────────────────────────────

export type EntityType =
  | "master"        // core reference (employee, client, vehicle)
  | "transaction"   // financial/operational record (invoice, journal)
  | "request"       // needs approval (leave, loan, purchase request)
  | "document"      // contract, letter, memo
  | "config";       // settings entity (shift, approval chain)

export interface EntityRoutes {
  list?: string;
  create?: string;
  detail?: string;
  edit?: string;
}

export interface EntityLifecycle {
  statusColumn: string;
  states: string[];
  initialState: string;
  terminalStates: string[];
}

export interface EntityApproval {
  required: boolean;
  type?: "simple" | "chain" | "multi_step" | "signature";
  approverRoles?: string[];
  endpoints: string[];
}

export interface EntityAttachments {
  supported: boolean;
  required?: boolean;
}

export interface EntityFinancialImpact {
  hasGLImpact: boolean;
  journalType?: string;
  sourceKey?: string;
}

export interface EntityPrint {
  hasTemplate: boolean;
  templateKey?: string;
}

export interface EntityOperationalProfile {
  id: string;
  label: string;
  domain: string;
  table: string;
  type: EntityType;
  owner: string;
  origin: string[];
  parentEntity?: string;
  relatedEntities: string[];
  routes: EntityRoutes;
  lifecycle?: EntityLifecycle;
  approval?: EntityApproval;
  attachments: EntityAttachments;
  financialImpact?: EntityFinancialImpact;
  events: string[];
  permissions: string[];
  notifications: string[];
  reports: string[];
  print?: EntityPrint;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const ENTITY_REGISTRY: EntityOperationalProfile[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // HR — الموارد البشرية
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "employee",
    label: "موظف",
    domain: "hr",
    table: "employees",
    type: "master",
    owner: "hr",
    origin: ["/employees/create"],
    relatedEntities: ["employee_contract", "leave_request", "attendance", "overtime_request", "loan", "discipline_memo", "exit_request", "transfer"],
    routes: { list: "/employees", create: "/employees/create", detail: "/employees/:id" },
    attachments: { supported: true },
    events: ["hr.employee.created", "hr.employee.updated", "hr.employee.activated", "hr.employee.terminated"],
    permissions: ["hr:create", "hr:read", "hr:update", "hr:delete"],
    notifications: ["employee_created", "employee_activated", "employee_terminated"],
    reports: ["employee_list", "employee_turnover", "headcount"],
    print: { hasTemplate: true, templateKey: "employee_profile" },
  },
  {
    id: "employee_contract",
    label: "عقد موظف",
    domain: "hr",
    table: "employee_contracts",
    type: "document",
    owner: "hr",
    origin: ["/hr/contracts/create", "/employees/:id"],
    parentEntity: "employee",
    relatedEntities: ["employee", "payroll_run"],
    routes: { list: "/hr/contracts", create: "/hr/contracts/create", detail: "/hr/contracts/:id" },
    lifecycle: {
      statusColumn: "approvalStatus",
      states: ["draft", "pending_approval", "approved", "rejected", "signed", "active", "terminated"],
      initialState: "draft",
      terminalStates: ["terminated"],
    },
    approval: {
      required: true,
      type: "multi_step",
      approverRoles: ["hr_manager", "general_manager"],
      endpoints: ["/hr/contracts/:id/submit", "/hr/contracts/:id/approve", "/hr/contracts/:id/reject", "/hr/contracts/:id/sign-company", "/hr/contracts/:id/sign-employee", "/hr/contracts/:id/activate", "/hr/contracts/:id/terminate"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "payroll", sourceKey: "contract" },
    events: ["contract_created", "contract_submitted", "contract_approved", "contract_rejected", "contract_signed_company", "contract_signed_employee", "contract_activated", "contract_terminated"],
    permissions: ["hr:create", "hr:read", "hr:update", "hr:approve"],
    notifications: ["contract_approved", "contract_rejected", "contract_expiry_reminder"],
    reports: ["active_contracts", "expiring_contracts"],
    print: { hasTemplate: true, templateKey: "employee_contract" },
  },
  {
    id: "leave_request",
    label: "طلب إجازة",
    domain: "hr",
    table: "hr_leave_requests",
    type: "request",
    owner: "hr",
    origin: ["/hr/leaves/create", "/my-leave-request"],
    parentEntity: "employee",
    relatedEntities: ["employee"],
    routes: { list: "/hr/leaves", create: "/hr/leaves/create", detail: "/hr/leaves/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["pending", "approved", "rejected", "cancelled", "completed"],
      initialState: "pending",
      terminalStates: ["rejected", "cancelled", "completed"],
    },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["direct_manager", "hr_manager"],
      endpoints: ["/hr/leave-requests/:id/approve", "/hr/leave-requests/:id/reject"],
    },
    attachments: { supported: true },
    events: ["hr.leave.created", "hr.leave.approved", "hr.leave.rejected", "hr.leave.cancelled"],
    permissions: ["hr:create", "hr:read", "hr:approve", "hr:self"],
    notifications: ["leave_submitted", "leave_approved", "leave_rejected"],
    reports: ["leave_balance", "leave_summary"],
  },
  {
    id: "attendance",
    label: "سجل حضور",
    domain: "hr",
    table: "hr_attendance_records",
    type: "transaction",
    owner: "hr",
    origin: ["/hr/attendance/create", "/my-attendance"],
    parentEntity: "employee",
    relatedEntities: ["employee", "shift"],
    routes: { list: "/hr/attendance", create: "/hr/attendance/create", detail: "/hr/attendance/:id" },
    attachments: { supported: false },
    events: ["hr.attendance.check_in", "hr.attendance.check_out"],
    permissions: ["hr:create", "hr:read", "hr:self"],
    notifications: ["late_arrival", "early_departure", "absence"],
    reports: ["attendance_daily", "attendance_monthly", "attendance_anomalies"],
  },
  {
    id: "overtime_request",
    label: "طلب عمل إضافي",
    domain: "hr",
    table: "hr_overtime_requests",
    type: "request",
    owner: "hr",
    origin: ["/hr/overtime/create", "/my-overtime"],
    parentEntity: "employee",
    relatedEntities: ["employee"],
    routes: { list: "/hr/overtime", create: "/hr/overtime/create", detail: "/hr/overtime/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["pending", "approved", "rejected"],
      initialState: "pending",
      terminalStates: ["rejected"],
    },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["direct_manager"],
      endpoints: ["/hr/overtime/:id/approve", "/hr/overtime/:id/reject"],
    },
    attachments: { supported: false },
    financialImpact: { hasGLImpact: true, journalType: "payroll", sourceKey: "overtime" },
    events: ["hr.overtime.created", "hr.overtime.approved", "hr.overtime.rejected"],
    permissions: ["hr:create", "hr:read", "hr:approve", "hr:self"],
    notifications: ["overtime_submitted", "overtime_approved", "overtime_rejected"],
    reports: ["overtime_summary"],
  },
  {
    id: "official_letter",
    label: "خطاب رسمي",
    domain: "hr",
    table: "hr_official_letters",
    type: "request",
    owner: "hr",
    origin: ["/hr/official-letters/create"],
    parentEntity: "employee",
    relatedEntities: ["employee"],
    routes: { list: "/hr/official-letters", create: "/hr/official-letters/create" },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["hr_manager"],
      endpoints: ["/hr/letters/:id/approve"],
    },
    attachments: { supported: true },
    events: ["hr.letter.created", "hr.letter.approved"],
    permissions: ["hr:create", "hr:read", "hr:approve", "hr:self"],
    notifications: ["letter_approved"],
    reports: [],
    print: { hasTemplate: true, templateKey: "official_letter" },
  },
  {
    id: "loan",
    label: "سلفة / قرض",
    domain: "hr",
    table: "hr_loans",
    type: "request",
    owner: "hr",
    origin: ["/hr/loans/create", "/my-loans"],
    parentEntity: "employee",
    relatedEntities: ["employee", "payroll_run"],
    routes: { list: "/hr/loans", create: "/hr/loans/create", detail: "/hr/loans/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["pending", "approved", "rejected", "active", "completed"],
      initialState: "pending",
      terminalStates: ["rejected", "completed"],
    },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["hr_manager", "finance_manager"],
      endpoints: ["/hr/loans/:id/approve", "/hr/loans/:id/reject"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "payroll", sourceKey: "loan" },
    events: ["hr.loan.created", "hr.loan.approved", "hr.loan.rejected"],
    permissions: ["hr:create", "hr:read", "hr:approve", "hr:self"],
    notifications: ["loan_submitted", "loan_approved", "loan_rejected"],
    reports: ["active_loans", "loan_deductions"],
  },
  {
    id: "exit_request",
    label: "طلب إنهاء خدمة",
    domain: "hr",
    table: "hr_exit_requests",
    type: "request",
    owner: "hr",
    origin: ["/hr/exit/create"],
    parentEntity: "employee",
    relatedEntities: ["employee", "employee_contract"],
    routes: { list: "/hr/exit", create: "/hr/exit/create", detail: "/hr/exit/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["pending", "approved", "rejected", "clearance", "completed"],
      initialState: "pending",
      terminalStates: ["rejected", "completed"],
    },
    approval: {
      required: true,
      type: "multi_step",
      approverRoles: ["hr_manager", "general_manager"],
      endpoints: ["/hr/exit/:id/approve", "/hr/exit/:id/clearance", "/hr/exit/:id/complete"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "settlement", sourceKey: "exit" },
    events: ["hr.exit.created", "hr.exit.approved", "hr.exit.clearance", "hr.exit.completed"],
    permissions: ["hr:create", "hr:read", "hr:approve"],
    notifications: ["exit_submitted", "exit_approved", "exit_completed"],
    reports: ["exit_summary", "turnover_report"],
  },
  {
    id: "transfer",
    label: "طلب نقل",
    domain: "hr",
    table: "hr_transfers",
    type: "request",
    owner: "hr",
    origin: ["/hr/transfers/create"],
    parentEntity: "employee",
    relatedEntities: ["employee"],
    routes: { list: "/hr/transfers", create: "/hr/transfers/create" },
    lifecycle: {
      statusColumn: "status",
      states: ["pending", "approved", "rejected", "completed"],
      initialState: "pending",
      terminalStates: ["rejected", "completed"],
    },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["hr_manager"],
      endpoints: ["/hr/transfers/:id/approve"],
    },
    attachments: { supported: false },
    events: ["hr.transfer.created", "hr.transfer.approved"],
    permissions: ["hr:create", "hr:read", "hr:approve"],
    notifications: ["transfer_approved"],
    reports: [],
  },
  {
    id: "excuse_request",
    label: "طلب استئذان",
    domain: "hr",
    table: "hr_excuse_requests",
    type: "request",
    owner: "hr",
    origin: ["/hr/excuse/create"],
    parentEntity: "employee",
    relatedEntities: ["employee", "attendance"],
    routes: { list: "/hr/excuse", create: "/hr/excuse/create" },
    lifecycle: {
      statusColumn: "status",
      states: ["pending", "approved", "rejected"],
      initialState: "pending",
      terminalStates: ["rejected"],
    },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["direct_manager"],
      endpoints: ["/hr/excuse-requests/:id/approve"],
    },
    attachments: { supported: false },
    events: ["hr.excuse.created", "hr.excuse.approved", "hr.excuse.rejected"],
    permissions: ["hr:create", "hr:read", "hr:approve", "hr:self"],
    notifications: ["excuse_submitted", "excuse_approved", "excuse_rejected"],
    reports: [],
  },
  {
    id: "discipline_memo",
    label: "مذكرة تأديبية",
    domain: "hr",
    table: "hr_discipline_memos",
    type: "document",
    owner: "hr",
    origin: ["/hr/violations/create"],
    parentEntity: "employee",
    relatedEntities: ["employee", "violation"],
    routes: { list: "/hr/discipline/memos", create: "/hr/violations/create", detail: "/hr/discipline/memos/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "issued", "acknowledged", "appealed", "escalated", "gm_review", "justified", "closed"],
      initialState: "draft",
      terminalStates: ["closed"],
    },
    approval: {
      required: true,
      type: "multi_step",
      approverRoles: ["hr_manager", "general_manager"],
      endpoints: ["/hr/discipline/memos/:id/justify", "/hr/discipline/memos/:id/manager-recommendation", "/hr/discipline/memos/:id/gm-decision", "/hr/discipline/memos/:id/appeal", "/hr/discipline/memos/:id/appeal-decision"],
    },
    attachments: { supported: true, required: true },
    financialImpact: { hasGLImpact: true, journalType: "payroll_deduction", sourceKey: "discipline" },
    events: ["hr.discipline.memo_created", "hr.discipline.memo_issued", "hr.discipline.memo_acknowledged", "hr.discipline.memo_appealed", "hr.discipline.memo_closed"],
    permissions: ["hr:discipline:create", "hr:discipline:read", "hr:discipline:update", "hr:discipline:approve"],
    notifications: ["discipline_memo_issued", "discipline_appeal_submitted", "discipline_gm_decision"],
    reports: ["discipline_summary", "violations_by_type"],
    print: { hasTemplate: true, templateKey: "discipline_memo" },
  },
  {
    id: "payroll_run",
    label: "مسير رواتب",
    domain: "hr",
    table: "payroll_runs",
    type: "transaction",
    owner: "hr",
    origin: ["/hr/payroll/create"],
    relatedEntities: ["employee", "employee_contract", "loan", "overtime_request"],
    routes: { list: "/hr/payroll", create: "/hr/payroll/create", detail: "/hr/payroll/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "calculated", "approved", "posted", "paid"],
      initialState: "draft",
      terminalStates: ["paid"],
    },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["hr_manager", "finance_manager", "general_manager"],
      endpoints: [],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "payroll", sourceKey: "payroll" },
    events: ["hr.payroll.created", "hr.payroll.calculated", "hr.payroll.approved", "hr.payroll.posted"],
    permissions: ["hr:create", "hr:read", "hr:approve"],
    notifications: ["payroll_ready", "payslip_available"],
    reports: ["payroll_summary", "payroll_comparison"],
    print: { hasTemplate: true, templateKey: "payslip" },
  },
  {
    id: "shift",
    label: "وردية",
    domain: "hr",
    table: "hr_shifts",
    type: "config",
    owner: "hr",
    origin: ["/hr/shifts/create"],
    relatedEntities: ["attendance"],
    routes: { list: "/hr/shifts", create: "/hr/shifts/create" },
    attachments: { supported: false },
    events: ["hr.shift.created", "hr.shift.updated"],
    permissions: ["hr:create", "hr:read", "hr:update"],
    notifications: [],
    reports: [],
  },
  {
    id: "evaluation_cycle",
    label: "دورة تقييم أداء",
    domain: "hr",
    table: "hr_evaluation_cycles",
    type: "transaction",
    owner: "hr",
    origin: ["/hr/performance/create"],
    relatedEntities: ["employee"],
    routes: { list: "/hr/performance", create: "/hr/performance/create", detail: "/hr/performance/:id" },
    attachments: { supported: false },
    events: ["hr.evaluation.created", "hr.evaluation.completed"],
    permissions: ["hr:create", "hr:read", "hr:update"],
    notifications: ["evaluation_due", "evaluation_completed"],
    reports: ["performance_summary"],
  },
  {
    id: "training_program",
    label: "برنامج تدريبي",
    domain: "training",
    table: "training_programs",
    type: "transaction",
    owner: "hr",
    origin: ["/hr/training/create"],
    relatedEntities: ["employee"],
    routes: { list: "/hr/training", create: "/hr/training/create", detail: "/hr/training/:id" },
    attachments: { supported: true },
    events: ["training.program.created", "training.enrollment.created"],
    permissions: ["hr:create", "hr:read"],
    notifications: ["training_enrollment", "training_reminder"],
    reports: ["training_summary"],
  },
  {
    id: "job_posting",
    label: "إعلان وظيفي",
    domain: "recruitment",
    table: "job_postings",
    type: "master",
    owner: "hr",
    origin: ["/hr/recruitment/create"],
    relatedEntities: ["job_application"],
    routes: { list: "/hr/recruitment", create: "/hr/recruitment/create", detail: "/hr/recruitment/jobs/:id" },
    attachments: { supported: true },
    events: ["recruitment.posting.created", "recruitment.posting.closed"],
    permissions: ["hr:create", "hr:read"],
    notifications: [],
    reports: ["recruitment_pipeline"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCE — المالية والمحاسبة
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "invoice",
    label: "فاتورة",
    domain: "finance",
    table: "invoices",
    type: "transaction",
    owner: "finance",
    origin: ["/finance/invoices/create"],
    relatedEntities: ["client", "journal_entry", "payment_voucher"],
    routes: { list: "/finance/invoices", create: "/finance/invoices/create", detail: "/finance/invoices/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "approved", "rejected", "returned", "sent", "partial", "paid", "overdue", "cancelled", "closed", "posted"],
      initialState: "draft",
      terminalStates: ["cancelled", "closed"],
    },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["finance_manager"],
      endpoints: ["/finance/invoices/:id/approve", "/finance/invoices/:id/reject", "/finance/invoices/:id/return", "/finance/invoices/:id/post"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "sales", sourceKey: "invoice" },
    events: ["finance.invoice.created", "finance.invoice.approved", "finance.invoice.posted", "finance.invoice.paid", "finance.invoice.overdue"],
    permissions: ["finance:create", "finance:read", "finance:update", "finance:approve"],
    notifications: ["invoice_approved", "invoice_overdue", "payment_received"],
    reports: ["invoice_aging", "revenue_summary", "tax_declarations"],
    print: { hasTemplate: true, templateKey: "invoice" },
  },
  {
    id: "journal_entry",
    label: "قيد يومية",
    domain: "finance",
    table: "journal_entries",
    type: "transaction",
    owner: "finance",
    origin: ["/finance/journal/create", "/finance/journal-manual/create"],
    relatedEntities: ["chart_of_account", "cost_center"],
    routes: { list: "/finance/journal", create: "/finance/journal/create" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "pending_approval", "posted", "rejected", "reversed"],
      initialState: "draft",
      terminalStates: ["reversed"],
    },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["finance_manager"],
      endpoints: [],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "manual", sourceKey: "journal" },
    events: ["finance.journal.created", "finance.journal.posted", "finance.journal.reversed"],
    permissions: ["finance:create", "finance:read", "finance:approve"],
    notifications: [],
    reports: ["trial_balance", "general_ledger"],
  },
  {
    id: "purchase_request",
    label: "طلب شراء",
    domain: "finance",
    table: "purchase_requests",
    type: "request",
    owner: "finance",
    origin: ["/finance/purchase-orders/create"],
    relatedEntities: ["purchase_order"],
    routes: { list: "/finance/purchase-orders" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "pending", "approved", "rejected", "converted"],
      initialState: "draft",
      terminalStates: ["rejected", "converted"],
    },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["department_manager", "finance_manager"],
      endpoints: ["/finance/purchase-requests/:id/approve", "/finance/purchase-requests/:id/convert"],
    },
    attachments: { supported: true },
    events: ["finance.purchase_request.created", "finance.purchase_request.approved", "finance.purchase_request.converted"],
    permissions: ["finance:create", "finance:read", "finance:approve"],
    notifications: ["purchase_request_approved"],
    reports: [],
  },
  {
    id: "purchase_order",
    label: "أمر شراء",
    domain: "finance",
    table: "purchase_orders",
    type: "transaction",
    owner: "finance",
    origin: ["/finance/purchase-orders/create"],
    relatedEntities: ["vendor", "invoice", "journal_entry"],
    routes: { list: "/finance/purchase-orders", create: "/finance/purchase-orders/create", detail: "/finance/purchase-orders/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "pending_approval", "approved", "rejected", "partially_received", "received", "paid", "cancelled"],
      initialState: "draft",
      terminalStates: ["paid", "cancelled"],
    },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["finance_manager"],
      endpoints: ["/finance/purchase-orders/:id/approve", "/finance/purchase-orders/:id/reject", "/finance/purchase-orders/:id/receive"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "purchase", sourceKey: "purchase_order" },
    events: ["finance.po.created", "finance.po.approved", "finance.po.received", "finance.po.paid"],
    permissions: ["finance:create", "finance:read", "finance:update", "finance:approve"],
    notifications: ["po_approved", "po_received"],
    reports: ["po_summary", "vendor_performance"],
    print: { hasTemplate: true, templateKey: "purchase_order" },
  },
  {
    id: "expense_claim",
    label: "مطالبة مصروفات",
    domain: "finance",
    table: "expense_claims",
    type: "request",
    owner: "finance",
    origin: ["/finance/expenses/create"],
    parentEntity: "employee",
    relatedEntities: ["employee", "journal_entry"],
    routes: { list: "/finance/expenses", create: "/finance/expenses/create", detail: "/finance/expenses/:id" },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["direct_manager", "finance_manager"],
      endpoints: [],
    },
    attachments: { supported: true, required: true },
    financialImpact: { hasGLImpact: true, journalType: "expense", sourceKey: "expense" },
    events: ["finance.expense.created", "finance.expense.approved"],
    permissions: ["finance:create", "finance:read", "finance:approve"],
    notifications: ["expense_approved", "expense_rejected"],
    reports: ["expense_by_category", "expense_by_department"],
  },
  {
    id: "budget",
    label: "ميزانية",
    domain: "finance",
    table: "budgets",
    type: "transaction",
    owner: "finance",
    origin: ["/finance/budget/create"],
    relatedEntities: ["cost_center"],
    routes: { list: "/finance/budget", create: "/finance/budget/create", detail: "/finance/budget/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "pending_approval", "approved", "rejected", "closed"],
      initialState: "draft",
      terminalStates: ["closed"],
    },
    approval: {
      required: true,
      type: "chain",
      approverRoles: ["finance_manager", "general_manager"],
      endpoints: [],
    },
    attachments: { supported: true },
    events: ["finance.budget.created", "finance.budget.approved"],
    permissions: ["finance:create", "finance:read", "finance:approve"],
    notifications: ["budget_approved", "budget_overrun"],
    reports: ["budget_vs_actual", "budget_utilization"],
  },
  {
    id: "custody",
    label: "عهدة مالية",
    domain: "finance",
    table: "custodies",
    type: "transaction",
    owner: "finance",
    origin: ["/finance/custodies"],
    parentEntity: "employee",
    relatedEntities: ["employee", "journal_entry"],
    routes: { list: "/finance/custodies", detail: "/finance/custodies/:id" },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["finance_manager"],
      endpoints: ["/finance/custodies/:id/approve"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "custody", sourceKey: "custody" },
    events: ["finance.custody.created", "finance.custody.approved", "finance.custody.settled"],
    permissions: ["finance:create", "finance:read", "finance:approve"],
    notifications: ["custody_approved", "custody_aging"],
    reports: ["custody_aging_report"],
  },
  {
    id: "salary_advance",
    label: "سلفة راتب",
    domain: "finance",
    table: "salary_advances",
    type: "request",
    owner: "finance",
    origin: ["/finance/salary-advances"],
    parentEntity: "employee",
    relatedEntities: ["employee", "payroll_run"],
    routes: { list: "/finance/salary-advances", detail: "/finance/salary-advances/:id" },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["hr_manager", "finance_manager"],
      endpoints: ["/finance/salary-advances/:id/approve"],
    },
    attachments: { supported: false },
    financialImpact: { hasGLImpact: true, journalType: "payroll", sourceKey: "advance" },
    events: ["finance.advance.created", "finance.advance.approved"],
    permissions: ["finance:create", "finance:read", "finance:approve", "hr:self"],
    notifications: ["advance_approved", "advance_rejected"],
    reports: [],
  },
  {
    id: "payment_voucher",
    label: "سند صرف",
    domain: "finance",
    table: "payment_vouchers",
    type: "transaction",
    owner: "finance",
    origin: ["/finance/vouchers/create"],
    relatedEntities: ["journal_entry", "vendor", "invoice"],
    routes: { list: "/finance/vouchers", create: "/finance/vouchers/create", detail: "/finance/vouchers/:id" },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "payment", sourceKey: "voucher" },
    events: ["finance.voucher.created", "finance.voucher.posted"],
    permissions: ["finance:create", "finance:read", "finance:approve"],
    notifications: [],
    reports: [],
    print: { hasTemplate: true, templateKey: "payment_voucher" },
  },
  {
    id: "vendor",
    label: "مورد",
    domain: "finance",
    table: "vendors",
    type: "master",
    owner: "finance",
    origin: ["/finance/vendors/create"],
    relatedEntities: ["purchase_order", "invoice"],
    routes: { list: "/finance/vendors", create: "/finance/vendors/create", detail: "/finance/vendors/:id" },
    attachments: { supported: true },
    events: ["finance.vendor.created", "finance.vendor.updated"],
    permissions: ["finance:create", "finance:read", "finance:update"],
    notifications: [],
    reports: ["vendor_list", "vendor_payments"],
  },
  {
    id: "chart_of_account",
    label: "دليل حسابات",
    domain: "finance",
    table: "chart_of_accounts",
    type: "config",
    owner: "finance",
    origin: ["/finance/accounts/create"],
    relatedEntities: ["journal_entry"],
    routes: { list: "/finance/accounts", create: "/finance/accounts/create", edit: "/finance/accounts/:id/edit" },
    attachments: { supported: false },
    events: ["finance.account.created", "finance.account.updated"],
    permissions: ["finance:create", "finance:read", "finance:update"],
    notifications: [],
    reports: ["chart_of_accounts"],
  },
  {
    id: "recurring_journal",
    label: "قيد متكرر",
    domain: "finance",
    table: "recurring_journals",
    type: "config",
    owner: "finance",
    origin: ["/finance/recurring-journals/create"],
    relatedEntities: ["journal_entry"],
    routes: { list: "/finance/recurring-journals", create: "/finance/recurring-journals/create", detail: "/finance/recurring-journals/:id" },
    attachments: { supported: false },
    events: ["finance.recurring.created", "finance.recurring.executed"],
    permissions: ["finance:create", "finance:read"],
    notifications: ["recurring_journal_failed"],
    reports: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FLEET — إدارة الأسطول
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "vehicle",
    label: "مركبة",
    domain: "fleet",
    table: "fleet_vehicles",
    type: "master",
    owner: "fleet",
    origin: ["/fleet/vehicles/create"],
    relatedEntities: ["fleet_trip", "fleet_maintenance", "fuel_log", "insurance_policy"],
    routes: { list: "/fleet", create: "/fleet/vehicles/create", detail: "/fleet/:id" },
    attachments: { supported: true },
    events: ["fleet.vehicle.created", "fleet.vehicle.status_changed"],
    permissions: ["fleet:create", "fleet:read", "fleet:update"],
    notifications: ["vehicle_maintenance_due", "insurance_expiry", "license_expiry"],
    reports: ["vehicle_list", "vehicle_utilization"],
  },
  {
    id: "fleet_trip",
    label: "رحلة",
    domain: "fleet",
    table: "fleet_trips",
    type: "transaction",
    owner: "fleet",
    origin: ["/fleet/trips/create"],
    parentEntity: "vehicle",
    relatedEntities: ["vehicle"],
    routes: { list: "/fleet/trips", create: "/fleet/trips/create", detail: "/fleet/trips/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["scheduled", "in_progress", "completed", "cancelled"],
      initialState: "scheduled",
      terminalStates: ["completed", "cancelled"],
    },
    attachments: { supported: false },
    events: ["fleet.trip.created", "fleet.trip.started", "fleet.trip.completed"],
    permissions: ["fleet:create", "fleet:read", "fleet:update"],
    notifications: ["trip_started", "trip_completed"],
    reports: ["trip_summary"],
  },
  {
    id: "fleet_maintenance",
    label: "صيانة مركبة",
    domain: "fleet",
    table: "fleet_maintenance",
    type: "transaction",
    owner: "fleet",
    origin: ["/fleet/maintenance/create"],
    parentEntity: "vehicle",
    relatedEntities: ["vehicle"],
    routes: { list: "/fleet/maintenance", create: "/fleet/maintenance/create", detail: "/fleet/maintenance/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["scheduled", "in_progress", "completed", "cancelled"],
      initialState: "scheduled",
      terminalStates: ["completed", "cancelled"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "expense", sourceKey: "fleet_maintenance" },
    events: ["fleet.maintenance.created", "fleet.maintenance.completed"],
    permissions: ["fleet:create", "fleet:read", "fleet:update"],
    notifications: ["maintenance_due", "maintenance_completed"],
    reports: ["maintenance_history", "maintenance_costs"],
  },
  {
    id: "fuel_log",
    label: "سجل وقود",
    domain: "fleet",
    table: "fleet_fuel_logs",
    type: "transaction",
    owner: "fleet",
    origin: ["/fleet/fuel/create"],
    parentEntity: "vehicle",
    relatedEntities: ["vehicle"],
    routes: { list: "/fleet/fuel", create: "/fleet/fuel/create", detail: "/fleet/fuel/:id" },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "expense", sourceKey: "fuel" },
    events: ["fleet.fuel.logged"],
    permissions: ["fleet:create", "fleet:read"],
    notifications: [],
    reports: ["fuel_consumption"],
  },
  {
    id: "insurance_policy",
    label: "وثيقة تأمين",
    domain: "fleet",
    table: "fleet_insurance_policies",
    type: "document",
    owner: "fleet",
    origin: ["/fleet/insurance/create"],
    parentEntity: "vehicle",
    relatedEntities: ["vehicle"],
    routes: { list: "/fleet/insurance", create: "/fleet/insurance/create", detail: "/fleet/insurance/:id" },
    attachments: { supported: true, required: true },
    financialImpact: { hasGLImpact: true, journalType: "expense", sourceKey: "insurance" },
    events: ["fleet.insurance.created", "fleet.insurance.renewed"],
    permissions: ["fleet:create", "fleet:read", "fleet:update"],
    notifications: ["insurance_expiry_reminder"],
    reports: ["insurance_coverage"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPERTY — إدارة العقارات
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "building",
    label: "مبنى",
    domain: "property",
    table: "property_buildings",
    type: "master",
    owner: "property",
    origin: ["/properties/buildings/create"],
    relatedEntities: ["property_unit", "rental_contract"],
    routes: { list: "/properties/buildings", create: "/properties/buildings/create", detail: "/properties/buildings/:id" },
    attachments: { supported: true },
    events: ["property.building.created"],
    permissions: ["property:create", "property:read", "property:update"],
    notifications: [],
    reports: ["property_portfolio"],
  },
  {
    id: "property_unit",
    label: "وحدة عقارية",
    domain: "property",
    table: "property_units",
    type: "master",
    owner: "property",
    origin: ["/properties/create"],
    parentEntity: "building",
    relatedEntities: ["building", "rental_contract"],
    routes: { list: "/properties/dashboard", create: "/properties/create", detail: "/properties/:id" },
    attachments: { supported: true },
    events: ["property.unit.created", "property.unit.status_changed"],
    permissions: ["property:create", "property:read", "property:update"],
    notifications: [],
    reports: ["unit_occupancy"],
  },
  {
    id: "rental_contract",
    label: "عقد إيجار",
    domain: "property",
    table: "rental_contracts",
    type: "document",
    owner: "property",
    origin: ["/properties/contracts/create"],
    relatedEntities: ["property_unit", "tenant", "rent_payment"],
    routes: { list: "/properties/contracts", create: "/properties/contracts/create", detail: "/properties/contracts/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "active", "terminated", "expired", "renewed", "cancelled"],
      initialState: "draft",
      terminalStates: ["terminated", "cancelled"],
    },
    attachments: { supported: true, required: true },
    financialImpact: { hasGLImpact: true, journalType: "rent_revenue", sourceKey: "rental_contract" },
    events: ["property.contract.created", "property.contract.activated", "property.contract.terminated"],
    permissions: ["property:create", "property:read", "property:update"],
    notifications: ["rent_due", "contract_expiry_reminder"],
    reports: ["active_contracts", "rent_collection"],
    print: { hasTemplate: true, templateKey: "rental_contract" },
  },
  {
    id: "maintenance_request",
    label: "طلب صيانة عقارية",
    domain: "property",
    table: "maintenance_requests",
    type: "request",
    owner: "property",
    origin: ["/properties/maintenance/create"],
    relatedEntities: ["property_unit", "tenant"],
    routes: { list: "/properties/maintenance", create: "/properties/maintenance/create", detail: "/properties/maintenance/:id" },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["property_manager"],
      endpoints: [],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "expense", sourceKey: "property_maintenance" },
    events: ["property.maintenance.created", "property.maintenance.completed"],
    permissions: ["property:create", "property:read", "property:update"],
    notifications: ["maintenance_assigned", "maintenance_completed"],
    reports: ["maintenance_summary"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGAL — الشؤون القانونية
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "legal_case",
    label: "قضية قانونية",
    domain: "legal",
    table: "legal_cases",
    type: "master",
    owner: "legal",
    origin: ["/legal/cases/create"],
    relatedEntities: ["legal_session", "legal_judgment"],
    routes: { list: "/legal/cases", create: "/legal/cases/create", detail: "/legal/cases/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["open", "in_progress", "on_hold", "closed"],
      initialState: "open",
      terminalStates: ["closed"],
    },
    attachments: { supported: true, required: true },
    financialImpact: { hasGLImpact: true, journalType: "legal_provision", sourceKey: "legal_case" },
    events: ["legal.case.created", "legal.case.status_changed", "legal.case.closed"],
    permissions: ["legal:create", "legal:read", "legal:update"],
    notifications: ["hearing_reminder", "case_update"],
    reports: ["case_summary", "case_status"],
  },
  {
    id: "legal_contract",
    label: "عقد قانوني",
    domain: "legal",
    table: "legal_contracts",
    type: "document",
    owner: "legal",
    origin: ["/legal/create"],
    relatedEntities: ["client", "vendor"],
    routes: { list: "/legal/contracts", create: "/legal/create", detail: "/legal/contracts/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "active", "terminated", "expired", "renewed", "cancelled"],
      initialState: "draft",
      terminalStates: ["terminated", "cancelled"],
    },
    attachments: { supported: true, required: true },
    events: ["legal.contract.created", "legal.contract.activated", "legal.contract.terminated"],
    permissions: ["legal:create", "legal:read", "legal:update"],
    notifications: ["contract_expiry_reminder"],
    reports: ["contract_register"],
    print: { hasTemplate: true, templateKey: "legal_contract" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM — إدارة العملاء
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "client",
    label: "عميل",
    domain: "crm",
    table: "clients",
    type: "master",
    owner: "crm",
    origin: ["/clients/create"],
    relatedEntities: ["invoice", "crm_opportunity", "legal_contract"],
    routes: { list: "/clients", create: "/clients/create", detail: "/clients/:id" },
    attachments: { supported: true },
    events: ["crm.client.created", "crm.client.updated"],
    permissions: ["crm:create", "crm:read", "crm:update", "crm:delete"],
    notifications: [],
    reports: ["client_list", "client_revenue"],
  },
  {
    id: "crm_opportunity",
    label: "فرصة بيع",
    domain: "crm",
    table: "crm_opportunities",
    type: "transaction",
    owner: "crm",
    origin: ["/crm/opportunities/create"],
    parentEntity: "client",
    relatedEntities: ["client"],
    routes: { list: "/crm/opportunities" },
    lifecycle: {
      statusColumn: "status",
      states: ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"],
      initialState: "prospecting",
      terminalStates: ["won", "lost"],
    },
    attachments: { supported: true },
    events: ["crm.opportunity.created", "crm.opportunity.won", "crm.opportunity.lost"],
    permissions: ["crm:create", "crm:read", "crm:update"],
    notifications: ["deal_stale", "deal_won"],
    reports: ["sales_pipeline", "conversion_rate"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPORT — الدعم الفني
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "support_ticket",
    label: "تذكرة دعم",
    domain: "support",
    table: "support_tickets",
    type: "transaction",
    owner: "support",
    origin: ["/support/create"],
    relatedEntities: [],
    routes: { list: "/support", detail: "/support/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["open", "in_progress", "escalated", "resolved", "closed"],
      initialState: "open",
      terminalStates: ["closed"],
    },
    attachments: { supported: true },
    events: ["support.ticket.created", "support.ticket.resolved", "support.ticket.escalated"],
    permissions: ["support:create", "support:read", "support:update"],
    notifications: ["ticket_assigned", "ticket_resolved", "sla_breach"],
    reports: ["ticket_summary", "sla_compliance"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WAREHOUSE — المستودعات
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "warehouse_product",
    label: "منتج مستودع",
    domain: "warehouse",
    table: "warehouse_products",
    type: "master",
    owner: "warehouse",
    origin: ["/warehouse/products/create"],
    relatedEntities: [],
    routes: { list: "/warehouse", detail: "/warehouse/:id" },
    attachments: { supported: true },
    events: ["warehouse.product.created", "warehouse.stock.adjusted"],
    permissions: ["warehouse:create", "warehouse:read", "warehouse:update"],
    notifications: ["low_stock_alert", "expiry_alert"],
    reports: ["stock_levels", "stock_movement"],
  },
  {
    id: "inventory_count",
    label: "جرد مخزون",
    domain: "warehouse",
    table: "inventory_counts",
    type: "transaction",
    owner: "warehouse",
    origin: ["/warehouse/inventory-counts/create"],
    relatedEntities: ["warehouse_product"],
    routes: { list: "/warehouse/inventory-counts", create: "/warehouse/inventory-counts/create", detail: "/warehouse/inventory-counts/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "in_progress", "pending_approval", "approved", "cancelled"],
      initialState: "draft",
      terminalStates: ["approved", "cancelled"],
    },
    approval: {
      required: true,
      type: "simple",
      approverRoles: ["warehouse_manager"],
      endpoints: ["/warehouse/inventory-counts/:id/approve"],
    },
    attachments: { supported: true },
    events: ["warehouse.inventory_count.created", "warehouse.inventory_count.approved"],
    permissions: ["warehouse:create", "warehouse:read", "warehouse:approve"],
    notifications: ["inventory_count_ready", "inventory_count_approved"],
    reports: ["inventory_count_report"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STORE — المتجر الإلكتروني
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "store_order",
    label: "طلب متجر",
    domain: "store",
    table: "store_orders",
    type: "transaction",
    owner: "store",
    origin: ["/store/orders/create"],
    relatedEntities: ["store_product"],
    routes: { list: "/store/orders", create: "/store/orders/create", detail: "/store/orders/:id" },
    attachments: { supported: false },
    financialImpact: { hasGLImpact: true, journalType: "sales", sourceKey: "store_order" },
    events: ["store.order.created", "store.order.fulfilled"],
    permissions: ["store:read", "store:write"],
    notifications: ["order_placed", "order_fulfilled"],
    reports: ["order_summary"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECTS — إدارة المشاريع
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "project",
    label: "مشروع",
    domain: "projects",
    table: "projects",
    type: "master",
    owner: "projects",
    origin: ["/projects/create"],
    relatedEntities: ["project_phase", "project_cost"],
    routes: { list: "/projects", create: "/projects/create", detail: "/projects/:id" },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "project_cost", sourceKey: "project" },
    events: ["project.created", "project.completed", "project.milestone_reached"],
    permissions: ["projects:create", "projects:read", "projects:update"],
    notifications: ["milestone_reminder", "budget_overrun"],
    reports: ["project_status", "project_costing"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UMRAH — إدارة العمرة
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "umrah_pilgrim",
    label: "معتمر",
    domain: "umrah",
    table: "umrah_pilgrims",
    type: "master",
    owner: "umrah",
    origin: ["/umrah/pilgrims/create"],
    relatedEntities: ["umrah_sales_invoice"],
    routes: { list: "/umrah/pilgrims", create: "/umrah/pilgrims/create", detail: "/umrah/pilgrims/:id" },
    attachments: { supported: true },
    events: ["umrah.pilgrim.created"],
    permissions: ["umrah:read", "umrah:write"],
    notifications: [],
    reports: ["pilgrim_list"],
  },
  {
    id: "umrah_sales_invoice",
    label: "فاتورة عمرة",
    domain: "umrah",
    table: "umrah_sales_invoices",
    type: "transaction",
    owner: "umrah",
    origin: ["/umrah/invoices"],
    relatedEntities: ["umrah_pilgrim", "umrah_agent"],
    routes: { list: "/umrah/invoices", detail: "/umrah/invoices/:id" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "confirmed", "partial", "paid", "cancelled"],
      initialState: "draft",
      terminalStates: ["paid", "cancelled"],
    },
    attachments: { supported: true },
    financialImpact: { hasGLImpact: true, journalType: "umrah_sales", sourceKey: "umrah_invoice" },
    events: ["umrah.invoice.created", "umrah.invoice.confirmed", "umrah.invoice.paid"],
    permissions: ["umrah:read", "umrah:write"],
    notifications: ["umrah_invoice_paid"],
    reports: ["umrah_revenue"],
  },
  {
    id: "umrah_season",
    label: "موسم عمرة",
    domain: "umrah",
    table: "umrah_seasons",
    type: "config",
    owner: "umrah",
    origin: ["/umrah/seasons"],
    relatedEntities: ["umrah_package"],
    routes: { list: "/umrah/seasons", detail: "/umrah/seasons/:id" },
    attachments: { supported: false },
    events: ["umrah.season.created", "umrah.season.closed"],
    permissions: ["umrah:read", "umrah:write"],
    notifications: [],
    reports: ["season_summary"],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNANCE — الحوكمة والامتثال
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "governance_policy",
    label: "سياسة حوكمة",
    domain: "governance",
    table: "governance_policies",
    type: "document",
    owner: "governance",
    origin: ["/governance/policies/create"],
    relatedEntities: [],
    routes: { list: "/governance/policies" },
    lifecycle: {
      statusColumn: "status",
      states: ["draft", "active", "archived"],
      initialState: "draft",
      terminalStates: ["archived"],
    },
    attachments: { supported: true },
    events: ["governance.policy.created", "governance.policy.activated"],
    permissions: ["governance:read", "governance:write"],
    notifications: ["policy_review_due"],
    reports: ["policy_register"],
  },
];

// ─── Index & Helpers ────────────────────────────────────────────────────────

const _entityIndex = new Map<string, EntityOperationalProfile>(
  ENTITY_REGISTRY.map((e) => [e.id, e])
);

const _tableIndex = new Map<string, EntityOperationalProfile>(
  ENTITY_REGISTRY.map((e) => [e.table, e])
);

export function getEntity(id: string): EntityOperationalProfile | undefined {
  return _entityIndex.get(id);
}

export function getEntityByTable(table: string): EntityOperationalProfile | undefined {
  return _tableIndex.get(table);
}

export function getEntitiesByDomain(domain: string): EntityOperationalProfile[] {
  return ENTITY_REGISTRY.filter((e) => e.domain === domain);
}

export function getEntitiesByType(type: EntityType): EntityOperationalProfile[] {
  return ENTITY_REGISTRY.filter((e) => e.type === type);
}

export function getEntitiesWithApproval(): EntityOperationalProfile[] {
  return ENTITY_REGISTRY.filter((e) => e.approval?.required);
}

export function getEntitiesWithLifecycle(): EntityOperationalProfile[] {
  return ENTITY_REGISTRY.filter((e) => !!e.lifecycle);
}

export function getEntitiesWithFinancialImpact(): EntityOperationalProfile[] {
  return ENTITY_REGISTRY.filter((e) => e.financialImpact?.hasGLImpact);
}

// ─── Coverage Analysis ──────────────────────────────────────────────────────

export interface CoverageGap {
  entityId: string;
  entityLabel: string;
  domain: string;
  category: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
}

export function getMissingCoverage(): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  for (const entity of ENTITY_REGISTRY) {
    // 1. Entities without detail page
    if (!entity.routes.detail && entity.type !== "config") {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "missing_detail_page",
        description: `كيان "${entity.label}" ليس لديه صفحة تفاصيل`,
        severity: entity.type === "request" ? "critical" : "high",
      });
    }

    // 2. Request entities without approval
    if (entity.type === "request" && !entity.approval?.required) {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "missing_approval",
        description: `طلب "${entity.label}" ليس لديه سلسلة اعتماد`,
        severity: "critical",
      });
    }

    // 3. Document/transaction entities without lifecycle
    if ((entity.type === "document" || entity.type === "transaction") && !entity.lifecycle) {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "missing_lifecycle",
        description: `"${entity.label}" ليس لديه دورة حياة محددة`,
        severity: "medium",
      });
    }

    // 4. Financial entities without GL impact
    if (entity.financialImpact?.hasGLImpact === false && (entity.type === "transaction" || entity.type === "request")) {
      // Not a gap if it genuinely has no financial impact
    }

    // 5. Entities that need attachments but don't support them
    if ((entity.type === "document" || entity.type === "request") && !entity.attachments.supported) {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "missing_attachments",
        description: `"${entity.label}" لا يدعم المرفقات رغم أنه ${entity.type === "document" ? "مستند" : "طلب"}`,
        severity: "medium",
      });
    }

    // 6. Entities without any events
    if (entity.events.length === 0) {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "missing_events",
        description: `"${entity.label}" ليس لديه أحداث مسجلة`,
        severity: "high",
      });
    }

    // 7. Entities with approval but no lifecycle
    if (entity.approval?.required && !entity.lifecycle) {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "approval_without_lifecycle",
        description: `"${entity.label}" لديه اعتماد لكن بلا دورة حياة واضحة`,
        severity: "high",
      });
    }

    // 8. Entities without create page
    if (!entity.routes.create && entity.type !== "config") {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "missing_create_page",
        description: `"${entity.label}" ليس لديه صفحة إنشاء`,
        severity: "medium",
      });
    }

    // 9. Entities with print template but no detail page
    if (entity.print?.hasTemplate && !entity.routes.detail) {
      gaps.push({
        entityId: entity.id,
        entityLabel: entity.label,
        domain: entity.domain,
        category: "print_without_detail",
        description: `"${entity.label}" لديه قالب طباعة لكن بلا صفحة تفاصيل`,
        severity: "low",
      });
    }
  }

  return gaps;
}

export function getCoverageSummary() {
  const total = ENTITY_REGISTRY.length;
  const withDetail = ENTITY_REGISTRY.filter((e) => e.routes.detail).length;
  const withCreate = ENTITY_REGISTRY.filter((e) => e.routes.create).length;
  const withLifecycle = ENTITY_REGISTRY.filter((e) => e.lifecycle).length;
  const withApproval = ENTITY_REGISTRY.filter((e) => e.approval?.required).length;
  const withAttachments = ENTITY_REGISTRY.filter((e) => e.attachments.supported).length;
  const withFinancial = ENTITY_REGISTRY.filter((e) => e.financialImpact?.hasGLImpact).length;
  const withPrint = ENTITY_REGISTRY.filter((e) => e.print?.hasTemplate).length;
  const gaps = getMissingCoverage();

  return {
    total,
    withDetail,
    withCreate,
    withLifecycle,
    withApproval,
    withAttachments,
    withFinancial,
    withPrint,
    gaps: {
      total: gaps.length,
      critical: gaps.filter((g) => g.severity === "critical").length,
      high: gaps.filter((g) => g.severity === "high").length,
      medium: gaps.filter((g) => g.severity === "medium").length,
      low: gaps.filter((g) => g.severity === "low").length,
    },
    byDomain: Object.fromEntries(
      [...new Set(ENTITY_REGISTRY.map((e) => e.domain))].map((d) => [
        d,
        {
          entities: ENTITY_REGISTRY.filter((e) => e.domain === d).length,
          gaps: gaps.filter((g) => g.domain === d).length,
        },
      ])
    ),
  };
}
