import { pgTable, serial, integer, text, boolean, timestamp, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("nameEn"),
  taxNumber: text("taxNumber"),
  crNumber: text("crNumber"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  logoUrl: text("logoUrl"),
  currency: text("currency").default("SAR"),
  timezone: text("timezone").default("Asia/Riyadh"),
  status: text("status").default("active"),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  name: text("name").notNull(),
  nameEn: text("nameEn"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lon: numeric("lon", { precision: 10, scale: 7 }),
  taxNumber: text("taxNumber"),
  crNumber: text("crNumber"),
  logoUrl: text("logoUrl"),
  footerText: text("footerText"),
  city: text("city"),
  website: text("website"),
  status: text("status").default("active"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("branches_company_idx").on(t.companyId),
}));

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("nameEn"),
  empNumber: text("empNumber"),
  nationalId: text("nationalId"),
  phone: text("phone"),
  email: text("email"),
  dateOfBirth: timestamp("dateOfBirth"),
  gender: text("gender"),
  nationality: text("nationality"),
  status: text("status").default("active"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt"),
});

export const employeeAssignments = pgTable("employee_assignments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId").references(() => branches.id),
  role: text("role").default("employee"),
  jobTitle: text("jobTitle"),
  departmentId: integer("departmentId"),
  salary: numeric("salary", { precision: 14, scale: 2 }).default("0"),
  status: text("status").default("active"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("ea_company_idx").on(t.companyId),
  branchIdx: index("ea_branch_idx").on(t.branchId),
  employeeIdx: index("ea_employee_idx").on(t.employeeId),
  companyBranchIdx: index("ea_company_branch_idx").on(t.companyId, t.branchId),
}));

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignmentId").notNull().references(() => employeeAssignments.id),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId").references(() => branches.id),
  date: text("date").notNull(),
  checkIn: timestamp("checkIn"),
  checkOut: timestamp("checkOut"),
  lateMinutes: integer("lateMinutes").default(0),
  overtimeMinutes: integer("overtimeMinutes").default(0),
  status: text("status").default("present"),
  notes: text("notes"),
  checkInLat: numeric("checkInLat", { precision: 10, scale: 7 }),
  checkInLon: numeric("checkInLon", { precision: 10, scale: 7 }),
  checkOutLat: numeric("checkOutLat", { precision: 10, scale: 7 }),
  checkOutLon: numeric("checkOutLon", { precision: 10, scale: 7 }),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  assignmentIdx: index("att_assignment_idx").on(t.assignmentId),
  companyIdx: index("att_company_idx").on(t.companyId),
  dateIdx: index("att_date_idx").on(t.date),
  companyDateIdx: index("att_company_date_idx").on(t.companyId, t.date),
}));

export const hrLeaveTypes = pgTable("hr_leave_types", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  name: text("name").notNull(),
  annualDays: integer("annualDays").default(21),
  isPaid: boolean("isPaid").default(true),
  requiresApproval: boolean("requiresApproval").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("leave_types_company_idx").on(t.companyId),
}));

export const hrLeaveRequests = pgTable("hr_leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  companyId: integer("companyId").notNull().references(() => companies.id),
  leaveTypeId: integer("leaveTypeId").notNull().references(() => hrLeaveTypes.id),
  startDate: text("startDate").notNull(),
  endDate: text("endDate").notNull(),
  days: integer("days").notNull(),
  reason: text("reason"),
  status: text("status").default("pending"),
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectedReason: text("rejectedReason"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("lr_company_idx").on(t.companyId),
  statusIdx: index("lr_status_idx").on(t.status),
  employeeIdx: index("lr_employee_idx").on(t.employeeId),
}));

export const hrLeaveBalances = pgTable("hr_leave_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  assignmentId: integer("assignmentId"),
  leaveTypeId: integer("leaveTypeId").notNull().references(() => hrLeaveTypes.id),
  year: integer("year").notNull(),
  entitled: integer("entitled").default(21),
  used: integer("used").default(0),
  reserved: integer("reserved").default(0),
  remaining: integer("remaining").default(21),
});

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId").references(() => branches.id),
  createdBy: integer("createdBy"),
  ref: text("ref").notNull(),
  description: text("description"),
  type: text("type").default("general"),
  status: text("status").default("posted"),
  sourceType: text("sourceType"),
  sourceId: integer("sourceId"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("je_company_idx").on(t.companyId),
  branchIdx: index("je_branch_idx").on(t.branchId),
  statusIdx: index("je_status_idx").on(t.status),
  createdAtIdx: index("je_created_at_idx").on(t.createdAt),
  companyBranchIdx: index("je_company_branch_idx").on(t.companyId, t.branchId),
  refIdx: index("je_ref_idx").on(t.ref),
}));

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalId: integer("journalId").notNull().references(() => journalEntries.id),
  accountCode: text("accountCode").notNull(),
  accountId: integer("accountId"),
  debit: numeric("debit", { precision: 14, scale: 2 }).default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).default("0"),
  description: text("description"),
}, (t) => ({
  journalIdx: index("jl_journal_idx").on(t.journalId),
  accountCodeIdx: index("jl_account_code_idx").on(t.accountCode),
}));

export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").default("asset"),
  parentCode: text("parentCode"),
  status: text("status").default("active"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyCodeIdx: uniqueIndex("coa_company_code_idx").on(t.companyId, t.code),
}));

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId"),
  accountCode: text("accountCode").notNull(),
  period: text("period").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).default("0"),
  used: numeric("used", { precision: 14, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyPeriodIdx: index("budgets_company_period_idx").on(t.companyId, t.period),
}));

export const purchaseRequests = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId"),
  ref: text("ref").notNull(),
  requestedBy: integer("requestedBy"),
  supplierId: integer("supplierId"),
  status: text("status").default("draft"),
  totalAmount: numeric("totalAmount", { precision: 14, scale: 2 }).default("0"),
  notes: text("notes"),
  expectedDelivery: timestamp("expectedDelivery"),
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("pr_company_idx").on(t.companyId),
  statusIdx: index("pr_status_idx").on(t.status),
  companyBranchIdx: index("pr_company_branch_idx").on(t.companyId, t.branchId),
}));

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId"),
  ref: text("ref").notNull(),
  supplierId: integer("supplierId"),
  requestId: integer("requestId"),
  status: text("status").default("pending"),
  totalAmount: numeric("totalAmount", { precision: 14, scale: 2 }).default("0"),
  notes: text("notes"),
  expectedDelivery: timestamp("expectedDelivery"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("po_company_idx").on(t.companyId),
  statusIdx: index("po_status_idx").on(t.status),
  supplierIdx: index("po_supplier_idx").on(t.supplierId),
}));

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  name: text("name").notNull(),
  contactPerson: text("contactPerson"),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("taxNumber"),
  address: text("address"),
  paymentTerms: text("paymentTerms"),
  category: text("category"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("suppliers_company_idx").on(t.companyId),
}));

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("taxNumber"),
  address: text("address"),
  status: text("status").default("active"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("clients_company_idx").on(t.companyId),
}));

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  branchId: integer("branchId"),
  clientId: integer("clientId").references(() => clients.id),
  ref: text("ref").notNull(),
  description: text("description"),
  total: numeric("total", { precision: 14, scale: 2 }).default("0"),
  paidAmount: numeric("paidAmount", { precision: 14, scale: 2 }).default("0"),
  dueDate: timestamp("dueDate"),
  status: text("status").default("draft"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("inv_company_idx").on(t.companyId),
  statusIdx: index("inv_status_idx").on(t.status),
  clientIdx: index("inv_client_idx").on(t.clientId),
  companyBranchIdx: index("inv_company_branch_idx").on(t.companyId, t.branchId),
}));

export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  period: text("period").notNull(),
  status: text("status").default("completed"),
  totalNet: numeric("totalNet", { precision: 14, scale: 2 }).default("0"),
  runBy: integer("runBy"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("pr_run_company_idx").on(t.companyId),
  periodIdx: index("pr_run_period_idx").on(t.period),
}));

export const payrollLines = pgTable("payroll_lines", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull().references(() => payrollRuns.id),
  assignmentId: integer("assignmentId").notNull().references(() => employeeAssignments.id),
  employeeId: integer("employeeId").notNull().references(() => employees.id),
  basic: numeric("basic", { precision: 14, scale: 2 }).default("0"),
  housingAllowance: numeric("housingAllowance", { precision: 14, scale: 2 }).default("0"),
  transportAllowance: numeric("transportAllowance", { precision: 14, scale: 2 }).default("0"),
  grossSalary: numeric("grossSalary", { precision: 14, scale: 2 }).default("0"),
  gosi: numeric("gosi", { precision: 14, scale: 2 }).default("0"),
  gosiEmployer: numeric("gosiEmployer", { precision: 14, scale: 2 }).default("0"),
  lateDeduction: numeric("lateDeduction", { precision: 14, scale: 2 }).default("0"),
  absenceDeduction: numeric("absenceDeduction", { precision: 14, scale: 2 }).default("0"),
  violationDeduction: numeric("violationDeduction", { precision: 14, scale: 2 }).default("0"),
  loanDeduction: numeric("loanDeduction", { precision: 14, scale: 2 }).default("0"),
  overtime: numeric("overtime", { precision: 14, scale: 2 }).default("0"),
  overtimeHours: numeric("overtimeHours", { precision: 6, scale: 2 }).default("0"),
  netSalary: numeric("netSalary", { precision: 14, scale: 2 }).default("0"),
  deletedAt: timestamp("deletedAt"),
}, (t) => ({
  runIdx: index("pl_run_idx").on(t.runId),
  assignmentIdx: index("pl_assignment_idx").on(t.assignmentId),
  employeeIdx: index("pl_employee_idx").on(t.employeeId),
}));

export const employeeViolations = pgTable("employee_violations", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  assignmentId: integer("assignmentId").notNull().references(() => employeeAssignments.id),
  type: text("type").notNull(),
  description: text("description"),
  severity: text("severity").default("medium"),
  deduction: numeric("deduction", { precision: 14, scale: 2 }).default("0"),
  period: text("period"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("viol_company_idx").on(t.companyId),
  assignmentIdx: index("viol_assignment_idx").on(t.assignmentId),
  periodIdx: index("viol_period_idx").on(t.period),
}));

export const approvalChains = pgTable("approval_chains", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull().references(() => companies.id),
  name: text("name").notNull(),
  chainType: text("chainType").notNull(),
  minAmount: numeric("minAmount", { precision: 14, scale: 2 }).default("0"),
  maxAmount: numeric("maxAmount", { precision: 14, scale: 2 }).default("999999999"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  companyIdx: index("ac_company_idx").on(t.companyId),
  typeIdx: index("ac_type_idx").on(t.chainType),
}));

export const approvalChainSteps = pgTable("approval_chain_steps", {
  id: serial("id").primaryKey(),
  chainId: integer("chainId").notNull().references(() => approvalChains.id),
  stepOrder: integer("stepOrder").notNull(),
  requiredRole: text("requiredRole").notNull(),
  timeoutHours: integer("timeoutHours").default(48),
  autoApproveOnTimeout: boolean("autoApproveOnTimeout").default(false),
});

export const eventDlq = pgTable("event_dlq", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  error: text("error").notNull(),
  companyId: integer("companyId"),
  retryCount: integer("retryCount").default(0),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("createdAt").defaultNow(),
  resolvedAt: timestamp("resolvedAt"),
}, (t) => ({
  typeIdx: index("dlq_type_idx").on(t.type),
  resolvedIdx: index("dlq_resolved_idx").on(t.resolved),
}));
