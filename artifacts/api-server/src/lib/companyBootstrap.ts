import { pool } from "./rawdb.js";
import type pg from "pg";

async function exec(client: pg.PoolClient, sql: string, params: any[] = []) {
  return client.query(sql, params);
}

export async function bootstrapCompany(companyId: number, companyName: string) {
  const client = await pool.connect();
  await client.query("BEGIN");

  try {
    const branchId = await createDefaultBranch(client, companyId, companyName);
    await createDefaultLeaveTypes(client, companyId);
    await createDefaultViolationTypes(client, companyId);
    await createDefaultShifts(client, companyId, branchId);
    await createDefaultApprovalChains(client, companyId);
    await createDefaultSalaryComponents(client, companyId);
    await createDefaultChartOfAccounts(client, companyId);
    await createDefaultRoles(client, companyId);
    await createDefaultNumberingPrefixes(client, companyId);
    await createDefaultPenaltyLadder(client, companyId);
    await createDefaultSettings(client, companyId, companyName);

    await client.query("COMMIT");
    console.log(`[CompanyBootstrap] Company ${companyId} bootstrapped with all defaults`);
    return { branchId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[CompanyBootstrap] Failed to bootstrap company ${companyId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function createDefaultBranch(client: pg.PoolClient, companyId: number, companyName: string): Promise<number> {
  const res = await exec(
    client,
    `INSERT INTO branches (name, "nameEn", "companyId", city) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`الفرع الرئيسي - ${companyName}`, "Main Branch", companyId, "الرياض"]
  );
  return res.rows[0].id;
}

async function createDefaultLeaveTypes(client: pg.PoolClient, companyId: number) {
  const types = [
    { name: "إجازة سنوية", nameEn: "Annual Leave", days: 30, isPaid: true, code: "ANNUAL" },
    { name: "إجازة مرضية", nameEn: "Sick Leave", days: 30, isPaid: true, code: "SICK" },
    { name: "إجازة زواج", nameEn: "Marriage Leave", days: 5, isPaid: true, code: "MARRIAGE" },
    { name: "إجازة أمومة", nameEn: "Maternity Leave", days: 70, isPaid: true, code: "MATERNITY" },
    { name: "إجازة أبوة", nameEn: "Paternity Leave", days: 3, isPaid: true, code: "PATERNITY" },
    { name: "إجازة وفاة", nameEn: "Bereavement Leave", days: 5, isPaid: true, code: "BEREAVEMENT" },
    { name: "إجازة حج", nameEn: "Hajj Leave", days: 15, isPaid: true, code: "HAJJ" },
    { name: "إجازة امتحانات", nameEn: "Exam Leave", days: 10, isPaid: true, code: "EXAM" },
    { name: "إجازة بدون راتب", nameEn: "Unpaid Leave", days: 30, isPaid: false, code: "UNPAID" },
    { name: "إجازة طارئة", nameEn: "Emergency Leave", days: 5, isPaid: true, code: "EMERGENCY" },
  ];
  for (const t of types) {
    await exec(
      client,
      `INSERT INTO hr_leave_types (name, "nameEn", "defaultDays", "isPaid", "companyId", code)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [t.name, t.nameEn, t.days, t.isPaid, companyId, t.code]
    );
  }
}

async function createDefaultViolationTypes(client: pg.PoolClient, companyId: number) {
  const types = [
    { type: "late_arrival", name: "تأخر عن الدوام", severity: "low", deduction: 50 },
    { type: "early_departure", name: "مغادرة مبكرة", severity: "low", deduction: 50 },
    { type: "absence", name: "غياب بدون عذر", severity: "medium", deduction: 200 },
    { type: "policy_violation", name: "مخالفة سياسة العمل", severity: "high", deduction: 500 },
    { type: "safety_violation", name: "مخالفة السلامة", severity: "high", deduction: 500 },
    { type: "gps_out_of_range", name: "خارج نطاق الموقع", severity: "low", deduction: 0 },
  ];
  for (const v of types) {
    await exec(
      client,
      `INSERT INTO system_settings (key, value, "companyId")
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [`violation_type_${v.type}`, JSON.stringify(v), companyId]
    );
  }
}

async function createDefaultShifts(client: pg.PoolClient, companyId: number, branchId: number) {
  const shifts = [
    { name: "الوردية الصباحية", nameEn: "Morning Shift", startTime: "08:00", endTime: "16:00" },
    { name: "الوردية المسائية", nameEn: "Evening Shift", startTime: "16:00", endTime: "00:00" },
    { name: "الوردية الليلية", nameEn: "Night Shift", startTime: "00:00", endTime: "08:00" },
  ];
  for (const s of shifts) {
    await exec(
      client,
      `INSERT INTO shifts (name, "nameEn", "startTime", "endTime", "companyId", "branchId")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [s.name, s.nameEn, s.startTime, s.endTime, companyId, branchId]
    );
  }
}

async function createDefaultApprovalChains(client: pg.PoolClient, companyId: number) {
  const chains = [
    { name: "سلسلة موافقة الإجازات", type: "leave", steps: ["manager", "hr"] },
    { name: "سلسلة موافقة المشتريات", type: "purchase", steps: ["manager", "finance_manager", "general_manager"] },
    { name: "سلسلة موافقة المصروفات", type: "expense", steps: ["manager", "finance_manager"] },
    { name: "سلسلة موافقة التوظيف", type: "recruitment", steps: ["hr", "general_manager"] },
    { name: "سلسلة موافقة العقود", type: "contract", steps: ["legal_manager", "general_manager"] },
  ];
  for (const chain of chains) {
    await exec(
      client,
      `INSERT INTO system_settings (key, value, "companyId")
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [`approval_chain_${chain.type}`, JSON.stringify(chain), companyId]
    );
  }
}

async function createDefaultSalaryComponents(client: pg.PoolClient, companyId: number) {
  const components = [
    { name: "الراتب الأساسي", nameEn: "Basic Salary", type: "earning", isFixed: true, percentage: 60 },
    { name: "بدل سكن", nameEn: "Housing Allowance", type: "earning", isFixed: true, percentage: 25 },
    { name: "بدل نقل", nameEn: "Transportation Allowance", type: "earning", isFixed: true, percentage: 10 },
    { name: "بدل طعام", nameEn: "Food Allowance", type: "earning", isFixed: false, percentage: 0 },
    { name: "تأمينات اجتماعية", nameEn: "GOSI", type: "deduction", isFixed: true, percentage: 9.75 },
    { name: "ضريبة الدخل", nameEn: "Income Tax", type: "deduction", isFixed: false, percentage: 0 },
  ];
  for (const c of components) {
    await exec(
      client,
      `INSERT INTO salary_components (name, "nameEn", type, "isFixed", percentage, "companyId")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [c.name, c.nameEn, c.type, c.isFixed, c.percentage, companyId]
    );
  }
}

async function createDefaultChartOfAccounts(client: pg.PoolClient, companyId: number) {
  const accounts = [
    { code: "1000", name: "الأصول", nameEn: "Assets", type: "asset", level: 1 },
    { code: "1100", name: "النقد والبنوك", nameEn: "Cash & Banks", type: "asset", level: 2, parentCode: "1000" },
    { code: "1110", name: "الصندوق", nameEn: "Cash", type: "asset", level: 3, parentCode: "1100" },
    { code: "1120", name: "البنك", nameEn: "Bank", type: "asset", level: 3, parentCode: "1100" },
    { code: "1200", name: "الذمم المدينة", nameEn: "Accounts Receivable", type: "asset", level: 2, parentCode: "1000" },
    { code: "1300", name: "المخزون", nameEn: "Inventory", type: "asset", level: 2, parentCode: "1000" },
    { code: "1400", name: "الأصول الثابتة", nameEn: "Fixed Assets", type: "asset", level: 2, parentCode: "1000" },
    { code: "2000", name: "الالتزامات", nameEn: "Liabilities", type: "liability", level: 1 },
    { code: "2100", name: "الذمم الدائنة", nameEn: "Accounts Payable", type: "liability", level: 2, parentCode: "2000" },
    { code: "2200", name: "القروض", nameEn: "Loans", type: "liability", level: 2, parentCode: "2000" },
    { code: "2300", name: "المستحقات", nameEn: "Accrued Liabilities", type: "liability", level: 2, parentCode: "2000" },
    { code: "3000", name: "حقوق الملكية", nameEn: "Equity", type: "equity", level: 1 },
    { code: "3100", name: "رأس المال", nameEn: "Capital", type: "equity", level: 2, parentCode: "3000" },
    { code: "3200", name: "الأرباح المحتجزة", nameEn: "Retained Earnings", type: "equity", level: 2, parentCode: "3000" },
    { code: "4000", name: "الإيرادات", nameEn: "Revenue", type: "revenue", level: 1 },
    { code: "4100", name: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue", level: 2, parentCode: "4000" },
    { code: "4200", name: "إيرادات الخدمات", nameEn: "Service Revenue", type: "revenue", level: 2, parentCode: "4000" },
    { code: "4300", name: "إيرادات أخرى", nameEn: "Other Revenue", type: "revenue", level: 2, parentCode: "4000" },
    { code: "5000", name: "المصروفات", nameEn: "Expenses", type: "expense", level: 1 },
    { code: "5100", name: "الرواتب والأجور", nameEn: "Salaries & Wages", type: "expense", level: 2, parentCode: "5000" },
    { code: "5200", name: "الإيجارات", nameEn: "Rent", type: "expense", level: 2, parentCode: "5000" },
    { code: "5300", name: "المرافق", nameEn: "Utilities", type: "expense", level: 2, parentCode: "5000" },
    { code: "5400", name: "مصروفات إدارية", nameEn: "Administrative Expenses", type: "expense", level: 2, parentCode: "5000" },
    { code: "5500", name: "مصروفات تسويق", nameEn: "Marketing Expenses", type: "expense", level: 2, parentCode: "5000" },
    { code: "5600", name: "استهلاك الأصول", nameEn: "Depreciation", type: "expense", level: 2, parentCode: "5000" },
    { code: "5700", name: "مصروفات أخرى", nameEn: "Other Expenses", type: "expense", level: 2, parentCode: "5000" },
    { code: "9999", name: "فروقات التقريب", nameEn: "Rounding Differences", type: "expense", level: 2 },
  ];

  const codeToId: Record<string, number> = {};
  for (const acc of accounts) {
    const parentId = acc.parentCode ? (codeToId[acc.parentCode] ?? null) : null;
    const res = await exec(
      client,
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "parentId", level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("companyId", code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [companyId, acc.code, acc.name, acc.nameEn, acc.type, parentId, acc.level]
    );
    codeToId[acc.code] = res.rows[0].id;
  }
}

async function createDefaultRoles(client: pg.PoolClient, companyId: number) {
  const roles = [
    { role: "owner", permissions: ["*"] },
    { role: "general_manager", permissions: ["dashboard:read", "employees:*", "finance:*", "hr:*", "fleet:*", "property:*", "warehouse:*", "store:*", "operations:*", "bi:*", "reports:*", "governance:*", "legal:*", "crm:*", "marketing:*", "support:*", "documents:*", "requests:*", "comms:*", "settings:read"] },
    { role: "hr_manager", permissions: ["dashboard:read", "employees:*", "hr:*", "attendance:*", "leaves:*", "payroll:*", "documents:read", "requests:*", "comms:read"] },
    { role: "finance_manager", permissions: ["dashboard:read", "finance:*", "invoices:*", "expenses:*", "reports:read", "documents:read", "requests:*", "comms:read"] },
    { role: "fleet_manager", permissions: ["dashboard:read", "fleet:*", "documents:read", "requests:*", "comms:read"] },
    { role: "property_manager", permissions: ["dashboard:read", "property:*", "documents:read", "requests:*", "comms:read"] },
    { role: "projects_manager", permissions: ["dashboard:read", "operations:*", "documents:read", "requests:*", "comms:read"] },
    { role: "warehouse_manager", permissions: ["dashboard:read", "warehouse:*", "store:*", "documents:read", "requests:*", "comms:read"] },
    { role: "legal_manager", permissions: ["dashboard:read", "legal:*", "governance:*", "documents:read", "requests:*", "comms:read"] },
    { role: "support_manager", permissions: ["dashboard:read", "support:*", "documents:read", "requests:*", "comms:read"] },
    { role: "crm_manager", permissions: ["dashboard:read", "crm:*", "marketing:*", "documents:read", "requests:*", "comms:read"] },
    { role: "bi_manager", permissions: ["dashboard:read", "bi:*", "reports:*", "documents:read", "requests:*", "comms:read"] },
    { role: "branch_manager", permissions: ["dashboard:read", "employees:read", "attendance:*", "leaves:approve", "reports:read", "documents:read", "requests:*", "comms:read", "support:read"] },
    { role: "employee", permissions: ["dashboard:read", "attendance:self", "leaves:self", "profile:self", "requests:self", "documents:read", "comms:read"] },
  ];
  for (const r of roles) {
    for (const perm of r.permissions) {
      await exec(
        client,
        `INSERT INTO role_permissions (role, permission, "companyId")
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [r.role, perm, companyId]
      );
    }
  }
}

async function createDefaultNumberingPrefixes(client: pg.PoolClient, companyId: number) {
  const prefixes = [
    { key: "invoice_prefix", value: "INV" },
    { key: "employee_prefix", value: "EMP" },
    { key: "purchase_prefix", value: "PO" },
    { key: "voucher_prefix", value: "VCH" },
    { key: "contract_prefix", value: "CTR" },
    { key: "ticket_prefix", value: "TKT" },
    { key: "task_prefix", value: "TSK" },
    { key: "project_prefix", value: "PRJ" },
  ];
  for (const p of prefixes) {
    await exec(
      client,
      `INSERT INTO system_settings (key, value, "companyId")
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [p.key, p.value, companyId]
    );
  }
}

async function createDefaultPenaltyLadder(client: pg.PoolClient, companyId: number) {
  const ladder = [
    { level: 1, name: "إنذار شفهي", nameEn: "Verbal Warning", action: "verbal_warning", deductionPct: 0 },
    { level: 2, name: "إنذار كتابي أول", nameEn: "First Written Warning", action: "written_warning_1", deductionPct: 0 },
    { level: 3, name: "إنذار كتابي ثاني", nameEn: "Second Written Warning", action: "written_warning_2", deductionPct: 0 },
    { level: 4, name: "خصم يوم واحد", nameEn: "1-Day Deduction", action: "deduction", deductionPct: 3.33 },
    { level: 5, name: "خصم ثلاثة أيام", nameEn: "3-Day Deduction", action: "deduction", deductionPct: 10 },
    { level: 6, name: "خصم خمسة أيام", nameEn: "5-Day Deduction", action: "deduction", deductionPct: 16.67 },
    { level: 7, name: "إيقاف مؤقت مع خصم", nameEn: "Suspension with Deduction", action: "suspension", deductionPct: 25 },
    { level: 8, name: "فصل مع مكافأة", nameEn: "Termination with Benefits", action: "termination_with_benefits", deductionPct: 0 },
    { level: 9, name: "فصل بدون مكافأة", nameEn: "Termination without Benefits", action: "termination_no_benefits", deductionPct: 0 },
  ];
  await exec(
    client,
    `INSERT INTO system_settings (key, value, "companyId") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    ["penalty_ladder", JSON.stringify(ladder), companyId]
  );
  for (const step of ladder) {
    await exec(
      client,
      `INSERT INTO system_settings (key, value, "companyId") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [`penalty_level_${step.level}`, JSON.stringify(step), companyId]
    );
  }
}

async function createDefaultSettings(client: pg.PoolClient, companyId: number, companyName: string) {
  const settings: Record<string, string> = {
    companyName: companyName,
    currency: "SAR",
    currencySymbol: "ر.س",
    timezone: "Asia/Riyadh",
    language: "ar",
    secondaryLanguage: "en",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    fiscalYearStart: "01-01",
    fiscalYearEnd: "12-31",
    workingDays: "sun,mon,tue,wed,thu",
    weekStart: "sun",
    weekendDays: "fri,sat",
    workingHoursPerDay: "8",
    workingHoursPerWeek: "40",

    attendanceMethod: "gps",
    gpsRadius: "500",
    lateThreshold: "15",
    earlyDepartureThreshold: "15",
    absentThreshold: "240",
    overtimeRate: "1.5",
    overtimeWeekendRate: "2.0",
    overtimeHolidayRate: "2.5",
    maxOvertimePerDay: "4",
    maxOvertimePerMonth: "40",
    attendanceRequiresApproval: "false",
    autoCheckoutTime: "23:59",
    graceMinutes: "5",
    breakDurationMinutes: "60",
    fingerPrintEnabled: "false",
    faceRecognitionEnabled: "false",

    leaveApprovalRequired: "true",
    autoDeductLeave: "true",
    leaveCarryForward: "true",
    maxCarryForwardDays: "5",
    minLeaveDays: "1",
    maxConsecutiveLeaveDays: "30",
    leaveStartFromHireDate: "true",
    leaveAccrualMethod: "monthly",
    probationLeavesAllowed: "false",
    probationPeriodDays: "90",

    gosiEmployeeRate: "9.75",
    gosiEmployerRate: "11.75",
    gosiSaudiEmployeeRate: "9.75",
    gosiSaudiEmployerRate: "11.75",
    gosiNonSaudiEmployeeRate: "0",
    gosiNonSaudiEmployerRate: "2",
    payrollCutoffDay: "25",
    payrollPayDay: "28",
    payrollAutoProcess: "false",
    payrollRoundingMethod: "nearest",
    endOfServiceRate: "15",
    endOfServiceAfter5Years: "30",
    salaryAdvanceMaxPct: "50",
    salaryAdvanceMaxInstallments: "6",

    vatRate: "15",
    vatRegistered: "true",
    invoicePaymentTerms: "30",
    invoiceDefaultCurrency: "SAR",
    invoiceAutoNumber: "true",
    invoicePrefix: "INV",
    creditNotePrefix: "CN",
    debitNotePrefix: "DN",
    invoiceReminderDays: "7,14,30",
    invoiceLateFeeEnabled: "false",
    invoiceLateFeePercent: "2",
    invoiceLogoEnabled: "true",
    invoiceStampEnabled: "true",
    invoiceSignatureEnabled: "true",
    invoiceTaxInclusive: "false",
    receiptVoucherPrefix: "RV",
    paymentVoucherPrefix: "PV",
    journalEntryPrefix: "JE",
    expenseClaimPrefix: "EXP",
    bankReconciliationEnabled: "true",
    multiCurrencyEnabled: "false",
    budgetTrackingEnabled: "true",
    costCenterEnabled: "false",

    allowNegativeStock: "false",
    defaultWarehouse: "main",
    stockAutoReorder: "true",
    stockReorderMethod: "min_level",
    warehouseTransferApproval: "true",
    barcodeEnabled: "true",
    serialNumberTracking: "false",
    batchTracking: "false",
    stockValuationMethod: "weighted_average",
    stockCountFrequency: "quarterly",

    slaDefault: "24",
    slaHighPriority: "4",
    slaCriticalPriority: "2",
    ticketAutoAssign: "true",
    ticketEscalationEnabled: "true",
    ticketEscalationHours: "8",
    ticketCustomerNotification: "true",

    projectBudgetTracking: "true",
    projectTimesheetRequired: "true",
    taskDefaultPriority: "medium",
    taskReminderEnabled: "true",
    milestoneTrackingEnabled: "true",
    projectStatusReportFrequency: "weekly",

    contractRenewalReminderDays: "30",
    contractAutoRenew: "false",
    documentRetentionYears: "10",
    complianceCheckFrequency: "quarterly",
    riskAssessmentFrequency: "annual",

    crmFollowUpReminderDays: "3",
    crmOpportunityStages: "lead,qualified,proposal,negotiation,won,lost",
    crmDefaultPipeline: "sales",
    crmAutoAssignLeads: "true",
    crmLeadScoringEnabled: "false",
    customerSatisfactionSurvey: "true",

    fleetMaintenanceReminderKm: "5000",
    fleetMaintenanceReminderDays: "90",
    fleetFuelTrackingEnabled: "true",
    fleetInsuranceReminderDays: "30",
    fleetLicenseReminderDays: "30",
    fleetGpsTrackingEnabled: "false",
    tripApprovalRequired: "true",

    maxLoginAttempts: "5",
    sessionTimeout: "480",
    passwordMinLength: "8",
    passwordRequireUppercase: "true",
    passwordRequireNumbers: "true",
    passwordRequireSpecialChars: "false",
    passwordExpiryDays: "0",
    twoFactorEnabled: "false",
    ipWhitelistEnabled: "false",

    emailNotifications: "true",
    smsNotifications: "false",
    pushNotifications: "true",
    whatsappNotifications: "false",
    notificationDigestFrequency: "realtime",
    dailyReportEnabled: "true",
    weeklyReportEnabled: "true",
    monthlyReportEnabled: "true",

    auditLogRetention: "365",
    backupFrequency: "daily",
    dataExportEnabled: "true",
    apiAccessEnabled: "true",
    maintenanceMode: "false",
    systemTheme: "default",
    logoUrl: "",
    favIconUrl: "",
    primaryColor: "#3b82f6",
  };
  for (const [key, value] of Object.entries(settings)) {
    await exec(
      client,
      `INSERT INTO system_settings (key, value, "companyId")
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [key, value, companyId]
    );
  }
}
