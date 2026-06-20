import { pool } from "./rawdb.js";
import { logger } from "./logger.js";
import type pg from "pg";
import { seedRolesAndGrantsV2, bindUsersFromAssignments, DEFAULT_ROLE_DEFS } from "./rbac/autoMigrate.js";

async function exec(client: pg.PoolClient, sql: string, params: unknown[] = []) {
  return client.query(sql, params);
}

export async function bootstrapCompany(
  companyId: number,
  companyName: string,
  creatorEmployeeId?: number | null,
) {
  const client = await pool.connect();
  await client.query("BEGIN");

  try {
    const branchId = await createDefaultBranch(client, companyId, companyName);
    // Link the creating user to the company they just made. Company access
    // is derived in authMiddleware from active employee_assignments rows, so
    // without an owner assignment here the creator cannot see, switch into,
    // or operate the new company at all (user-reported: "عند فتح شركة جديدة
    // لا تُربط تلقائيًا بالمنشئ"). role='owner' makes authMiddleware's
    // owner-expansion add this company to allowedCompanies. isPrimary stays
    // false so the creator's primary assignment in their original company is
    // untouched. Skipped only when the user has no employee record (rare —
    // e.g. a bare super-admin), in which case there is nothing to link.
    if (creatorEmployeeId) {
      await createCreatorOwnerAssignment(client, companyId, branchId, creatorEmployeeId);
    }
    await createDefaultLeaveTypes(client, companyId);
    await createDefaultViolationTypes(client, companyId);
    await createDefaultShifts(client, companyId, branchId);
    await createDefaultApprovalChains(client, companyId);
    await createDefaultSalaryComponents(client, companyId);
    await createDefaultChartOfAccounts(client, companyId);
    await createDefaultRoles(client, companyId);
    await createDefaultNumberingPrefixes(client, companyId);
    // 2026-06-16 — every new tenant needs the per-module numbering_schemes
    // rows + the canonical default department, or the first invoice /
    // employee / ticket POST 404s. The migrations seed these only for
    // companies that existed AT migration time; companies created later
    // (incl. via this bootstrap) used to miss them. Clone from a known
    // template tenant (the lowest-id company that already has schemes)
    // and stamp the canonical default department.
    await createDefaultNumberingSchemes(client, companyId);
    await createDefaultDepartment(client, companyId, branchId);
    await createDefaultPenaltyLadder(client, companyId);
    await createDefaultSettings(client, companyId, companyName);

    await client.query("COMMIT");
    logger.info({ companyId }, "Company bootstrapped with all defaults");
    return { branchId };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(err, `[CompanyBootstrap] Failed to bootstrap company ${companyId}:`);
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

// Grant the user who created the company an owner assignment so it shows up
// in their allowedCompanies (see authMiddleware owner-expansion). Mirrors the
// owner assignment minted by bootstrapAdmin for the very first company.
async function createCreatorOwnerAssignment(
  client: pg.PoolClient,
  companyId: number,
  branchId: number,
  employeeId: number,
) {
  await exec(
    client,
    `INSERT INTO employee_assignments
       ("employeeId", "companyId", "branchId", "jobTitle", role, salary, "isPrimary", status)
     VALUES ($1, $2, $3, 'مالك', 'owner', 0, false, 'active')`,
    [employeeId, companyId, branchId]
  );
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
      `INSERT INTO hr_leave_types (name, "annualDays", "isPaid", "companyId")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [t.name, t.days, t.isPaid, companyId]
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
      `INSERT INTO shifts (name, "startTime", "endTime", "companyId", "branchId")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [s.name, s.startTime, s.endTime, companyId, branchId]
    );
  }
}

// Canonical approval-chain definitions — the chain types the application
// passes to initiateApprovalChain() (see ApprovalChainType in businessHelpers).
// Kept in sync with migration 250 (which backfills existing companies) and
// guarded by approvalChainCoverage.test.ts so a caller can never pass a
// chainType that isn't seeded here.
export const DEFAULT_APPROVAL_CHAINS: Array<{ type: string; name: string; roles: string[] }> = [
  { type: "leaves",                name: "سلسلة موافقة الإجازات",         roles: ["hr_manager", "general_manager"] },
  { type: "expenses",              name: "سلسلة موافقة المصروفات",        roles: ["branch_manager", "finance_manager"] },
  { type: "advances",              name: "سلسلة موافقة السلف والعهد",     roles: ["finance_manager", "general_manager"] },
  { type: "purchases",             name: "سلسلة موافقة أوامر الشراء",     roles: ["finance_manager", "general_manager"] },
  { type: "procurement",           name: "سلسلة موافقة طلبات الشراء",     roles: ["finance_manager", "general_manager"] },
  { type: "letters",               name: "سلسلة موافقة الخطابات الرسمية", roles: ["hr_manager", "general_manager"] },
  { type: "loans",                 name: "سلسلة موافقة القروض",           roles: ["hr_manager", "finance_manager"] },
  { type: "overtime",              name: "سلسلة موافقة العمل الإضافي",    roles: ["branch_manager", "hr_manager"] },
  { type: "exit",                  name: "سلسلة موافقة إنهاء الخدمة",     roles: ["hr_manager", "general_manager"] },
  { type: "umrah_commission_plan", name: "سلسلة موافقة خطط العمولات",     roles: ["finance_manager", "general_manager"] },
];

async function createDefaultApprovalChains(client: pg.PoolClient, companyId: number) {
  // Seed the REAL tables the engine reads (approval_chains + steps). A prior
  // version wrote system_settings JSON, which initiateApprovalChain() never
  // reads — so freshly-bootstrapped companies had no chains and every flow
  // auto-approved. Idempotent per (company, chainType).
  for (const chain of DEFAULT_APPROVAL_CHAINS) {
    const existing = await client.query(
      `SELECT id FROM approval_chains WHERE "companyId" = $1 AND "chainType" = $2 LIMIT 1`,
      [companyId, chain.type],
    );
    if ((existing.rowCount ?? 0) > 0) continue;
    const inserted = await client.query(
      `INSERT INTO approval_chains ("companyId", name, "chainType", "minAmount", "maxAmount", "isActive")
       VALUES ($1, $2, $3, 0, 999999999, true) RETURNING id`,
      [companyId, chain.name, chain.type],
    );
    const chainId = inserted.rows[0].id as number;
    for (let i = 0; i < chain.roles.length; i++) {
      await exec(
        client,
        `INSERT INTO approval_chain_steps ("chainId", "stepOrder", "requiredRole", "timeoutHours", "autoApproveOnTimeout")
         VALUES ($1, $2, $3, 48, false)`,
        [chainId, i + 1, chain.roles[i]],
      );
    }
  }
}

async function createDefaultSalaryComponents(client: pg.PoolClient, companyId: number) {
  const components = [
    { name: "الراتب الأساسي", nameEn: "Basic Salary", type: "earning", calculationType: "fixed", value: 60 },
    { name: "بدل سكن", nameEn: "Housing Allowance", type: "earning", calculationType: "fixed", value: 25 },
    { name: "بدل نقل", nameEn: "Transportation Allowance", type: "earning", calculationType: "fixed", value: 10 },
    { name: "بدل طعام", nameEn: "Food Allowance", type: "earning", calculationType: "percentage", value: 0 },
    { name: "تأمينات اجتماعية", nameEn: "GOSI", type: "deduction", calculationType: "percentage", value: 9.75 },
    { name: "ضريبة الدخل", nameEn: "Income Tax", type: "deduction", calculationType: "percentage", value: 0 },
  ];
  for (const c of components) {
    await exec(
      client,
      `INSERT INTO salary_components (name, "nameEn", type, "calculationType", value, "companyId")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [c.name, c.nameEn, c.type, c.calculationType, c.value, companyId]
    );
  }
}

export const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  nameEn: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  level: number;
  parentCode?: string;
  allowPosting?: boolean;
}> = [
  // ============ 1xxx الأصول (Assets) ============
  { code: "1000", name: "الأصول", nameEn: "Assets", type: "asset", level: 1, allowPosting: false },

  // 11xx الأصول المتداولة
  { code: "1100", name: "الأصول المتداولة", nameEn: "Current Assets", type: "asset", level: 2, parentCode: "1000", allowPosting: false },
  { code: "1110", name: "النقدية في الصندوق", nameEn: "Cash on Hand", type: "asset", level: 3, parentCode: "1100", allowPosting: false },
  { code: "1111", name: "الصندوق الرئيسي", nameEn: "Main Cash", type: "asset", level: 4, parentCode: "1110" },
  { code: "1112", name: "صناديق فرعية", nameEn: "Petty Cash", type: "asset", level: 4, parentCode: "1110" },
  { code: "1113", name: "العهد النقدية", nameEn: "Cash Custody", type: "asset", level: 4, parentCode: "1110" },

  { code: "1120", name: "البنوك", nameEn: "Banks", type: "asset", level: 3, parentCode: "1100", allowPosting: false },
  { code: "1124", name: "بنوك أخرى", nameEn: "Other Banks", type: "asset", level: 4, parentCode: "1120" },

  { code: "1130", name: "العملاء (الذمم المدينة)", nameEn: "Accounts Receivable", type: "asset", level: 3, parentCode: "1100", allowPosting: false },
  { code: "1131", name: "عملاء محليون", nameEn: "Local Customers", type: "asset", level: 4, parentCode: "1130" },
  { code: "1132", name: "عملاء العقارات (إيجارات)", nameEn: "Tenants Receivable", type: "asset", level: 4, parentCode: "1130" },
  { code: "1133", name: "عملاء المشاريع", nameEn: "Project Customers", type: "asset", level: 4, parentCode: "1130" },
  { code: "1134", name: "شيكات تحت التحصيل", nameEn: "Cheques Under Collection", type: "asset", level: 4, parentCode: "1130" },
  { code: "1135", name: "مخصص الديون المشكوك في تحصيلها", nameEn: "Allowance for Doubtful Debts", type: "asset", level: 4, parentCode: "1130" },

  { code: "1140", name: "الموظفون والسلف", nameEn: "Staff & Advances", type: "asset", level: 3, parentCode: "1100", allowPosting: false },
  { code: "1141", name: "سلف الموظفين", nameEn: "Employee Advances", type: "asset", level: 4, parentCode: "1140" },
  { code: "1142", name: "عهد مالية للموظفين", nameEn: "Employee Custody", type: "asset", level: 4, parentCode: "1140" },
  { code: "1143", name: "قروض موظفين", nameEn: "Employee Loans", type: "asset", level: 4, parentCode: "1140" },

  { code: "1150", name: "المخزون", nameEn: "Inventory", type: "asset", level: 3, parentCode: "1100", allowPosting: false },
  { code: "1151", name: "مخزون البضائع", nameEn: "Merchandise Inventory", type: "asset", level: 4, parentCode: "1150" },
  { code: "1152", name: "مخزون قطع الغيار", nameEn: "Spare Parts Inventory", type: "asset", level: 4, parentCode: "1150" },
  { code: "1153", name: "مخزون مواد التشغيل", nameEn: "Operating Supplies", type: "asset", level: 4, parentCode: "1150" },

  { code: "1160", name: "إيرادات مستحقة", nameEn: "Accrued Revenue", type: "asset", level: 3, parentCode: "1100" },
  { code: "1170", name: "مصروفات مدفوعة مقدماً", nameEn: "Prepaid Expenses", type: "asset", level: 3, parentCode: "1100", allowPosting: false },
  { code: "1171", name: "إيجارات مدفوعة مقدماً", nameEn: "Prepaid Rent", type: "asset", level: 4, parentCode: "1170" },
  { code: "1172", name: "تأمينات مدفوعة مقدماً", nameEn: "Prepaid Insurance", type: "asset", level: 4, parentCode: "1170" },
  { code: "1173", name: "اشتراكات ورخص مدفوعة مقدماً", nameEn: "Prepaid Subscriptions", type: "asset", level: 4, parentCode: "1170" },
  { code: "1180", name: "ضريبة قيمة مضافة مدفوعة (مدخلات)", nameEn: "Input VAT", type: "asset", level: 3, parentCode: "1100" },
  // دفعات مقدمة للموردين — أصل متداول قابل للترحيل (سلفة لمورد مقابل أمر شراء/فاتورة
  // لاحقة). مرآة AP لـ"customer_advance_liability". موضوع L3 مباشرة تحت 1100 على
  // نمط 1160 "إيرادات مستحقة" (أقرب سابقة لحساب فرعي قابل للترحيل تحت مجموعة الأصول
  // المتداولة)، والرقم 1190 هو التالي بعد 1180 فلا يكسر تسلسل القالب. #2140 شريحة 2-أ.
  { code: "1190", name: "دفعات مقدمة للموردين", nameEn: "Advances to Suppliers", type: "asset", level: 3, parentCode: "1100" },

  // 12xx الأصول غير المتداولة
  { code: "1200", name: "الأصول غير المتداولة", nameEn: "Non-Current Assets", type: "asset", level: 2, parentCode: "1000", allowPosting: false },
  { code: "1210", name: "المركبات وأسطول النقل", nameEn: "Vehicles & Fleet", type: "asset", level: 3, parentCode: "1200" },
  { code: "1211", name: "مجمع إهلاك المركبات", nameEn: "Accum. Depr. – Vehicles", type: "asset", level: 3, parentCode: "1200" },
  { code: "1220", name: "الأثاث والتجهيزات المكتبية", nameEn: "Furniture & Fixtures", type: "asset", level: 3, parentCode: "1200" },
  { code: "1221", name: "مجمع إهلاك الأثاث", nameEn: "Accum. Depr. – Furniture", type: "asset", level: 3, parentCode: "1200" },
  { code: "1230", name: "أجهزة الحاسب الآلي", nameEn: "Computers & IT Equipment", type: "asset", level: 3, parentCode: "1200" },
  { code: "1231", name: "مجمع إهلاك الحاسبات", nameEn: "Accum. Depr. – Computers", type: "asset", level: 3, parentCode: "1200" },
  { code: "1240", name: "المباني والعقارات", nameEn: "Buildings & Real Estate", type: "asset", level: 3, parentCode: "1200" },
  { code: "1241", name: "مجمع إهلاك المباني", nameEn: "Accum. Depr. – Buildings", type: "asset", level: 3, parentCode: "1200" },
  { code: "1250", name: "تحسينات على مأجور", nameEn: "Leasehold Improvements", type: "asset", level: 3, parentCode: "1200" },
  { code: "1260", name: "الأصول غير الملموسة (برامج وتراخيص)", nameEn: "Intangible Assets", type: "asset", level: 3, parentCode: "1200" },
  { code: "1270", name: "أعمال تحت التنفيذ", nameEn: "Capital Work In Progress", type: "asset", level: 3, parentCode: "1200" },

  // 1291 مجمع انخفاض قيمة الأصول الثابتة — IAS 36 contra-asset مستقل عن مجمعات
  // الإهلاك (1211/1221/…) لضمان فصل مخصص الهبوط عن مخصص الإهلاك في الميزانية.
  // الترحيل: DR 5850 خسارة هبوط / CR 1291 مجمع هبوط. #2140-5a.
  { code: "1291", name: "مجمع انخفاض قيمة الأصول الثابتة", nameEn: "Accum. Impairment – Fixed Assets", type: "asset", level: 3, parentCode: "1200" },

  // ============ 2xxx الالتزامات (Liabilities) ============
  { code: "2000", name: "الالتزامات", nameEn: "Liabilities", type: "liability", level: 1, allowPosting: false },

  // 21xx الالتزامات المتداولة
  { code: "2100", name: "الالتزامات المتداولة", nameEn: "Current Liabilities", type: "liability", level: 2, parentCode: "2000", allowPosting: false },
  { code: "2110", name: "الموردون (الذمم الدائنة)", nameEn: "Accounts Payable", type: "liability", level: 3, parentCode: "2100", allowPosting: false },
  { code: "2111", name: "موردون محليون", nameEn: "Local Suppliers", type: "liability", level: 4, parentCode: "2110" },
  { code: "2112", name: "مقاولون من الباطن", nameEn: "Subcontractors Payable", type: "liability", level: 4, parentCode: "2110" },
  { code: "2113", name: "شيكات صادرة آجلة", nameEn: "Post-dated Cheques Issued", type: "liability", level: 4, parentCode: "2110" },

  { code: "2120", name: "مستحقات الرواتب والأجور", nameEn: "Payroll Payable", type: "liability", level: 3, parentCode: "2100" },
  { code: "2130", name: "ضرائب ورسوم مستحقة", nameEn: "Taxes Payable", type: "liability", level: 3, parentCode: "2100", allowPosting: false },
  { code: "2131", name: "ضريبة القيمة المضافة المستحقة (مخرجات)", nameEn: "Output VAT Payable", type: "liability", level: 4, parentCode: "2130" },
  { code: "2132", name: "ضريبة الاستقطاع", nameEn: "Withholding Tax", type: "liability", level: 4, parentCode: "2130" },
  { code: "2133", name: "الزكاة المستحقة", nameEn: "Zakat Payable", type: "liability", level: 4, parentCode: "2130" },

  { code: "2140", name: "التأمينات الاجتماعية المستحقة", nameEn: "GOSI Payable", type: "liability", level: 3, parentCode: "2100" },
  { code: "2150", name: "مصروفات مستحقة الدفع", nameEn: "Accrued Expenses", type: "liability", level: 3, parentCode: "2100" },
  { code: "2160", name: "إيرادات مقبوضة مقدماً", nameEn: "Unearned Revenue", type: "liability", level: 3, parentCode: "2100" },
  { code: "2161", name: "إيجارات مقبوضة مقدماً", nameEn: "Unearned Rent", type: "liability", level: 4, parentCode: "2160" },
  { code: "2170", name: "تأمينات وضمانات من العملاء", nameEn: "Customer Deposits", type: "liability", level: 3, parentCode: "2100" },
  { code: "2155", name: "عمولات مستحقة", nameEn: "Commissions Payable", type: "liability", level: 3, parentCode: "2100" },
  { code: "2156", name: "ذمم مُلّاك العقارات", nameEn: "Property Owners Payable", type: "liability", level: 3, parentCode: "2100" },
  { code: "2157", name: "غرامات مرورية مستحقة", nameEn: "Traffic Fines Payable", type: "liability", level: 3, parentCode: "2100" },

  // 22xx الالتزامات طويلة الأجل
  { code: "2200", name: "الالتزامات طويلة الأجل", nameEn: "Long-Term Liabilities", type: "liability", level: 2, parentCode: "2000", allowPosting: false },
  { code: "2210", name: "قروض بنكية طويلة الأجل", nameEn: "Long-Term Bank Loans", type: "liability", level: 3, parentCode: "2200" },
  { code: "2220", name: "مكافأة نهاية الخدمة", nameEn: "End of Service Benefits (EOSB)", type: "liability", level: 3, parentCode: "2200" },

  // ============ 3xxx حقوق الملكية ============
  { code: "3000", name: "حقوق الملكية", nameEn: "Equity", type: "equity", level: 1, allowPosting: false },
  { code: "3100", name: "رأس المال", nameEn: "Capital", type: "equity", level: 2, parentCode: "3000" },
  { code: "3200", name: "الاحتياطي النظامي", nameEn: "Statutory Reserve", type: "equity", level: 2, parentCode: "3000" },
  { code: "3300", name: "الأرباح المحتجزة", nameEn: "Retained Earnings", type: "equity", level: 2, parentCode: "3000" },
  { code: "3400", name: "أرباح/خسائر العام الحالي", nameEn: "Current Year P/L", type: "equity", level: 2, parentCode: "3000" },
  { code: "3500", name: "السحوبات والتوزيعات", nameEn: "Drawings & Distributions", type: "equity", level: 2, parentCode: "3000" },
  // 3600 فائض إعادة التقييم — IAS 16 Revaluation Model. حساب مستقل عن الأرباح
  // المحتجزة (3300) لأن فائض إعادة التقييم لا يُوزَّع إلا عند التصرف في الأصل.
  // الترحيل: DR أصل ثابت / CR 3600 (زيادة)؛ DR 5860 / CR أصل ثابت (نقص). #2140-5a.
  { code: "3600", name: "فائض إعادة التقييم", nameEn: "Revaluation Surplus", type: "equity", level: 2, parentCode: "3000" },

  // ============ 4xxx الإيرادات ============
  { code: "4000", name: "الإيرادات", nameEn: "Revenue", type: "revenue", level: 1, allowPosting: false },

  { code: "4100", name: "الإيرادات التشغيلية", nameEn: "Operating Revenue", type: "revenue", level: 2, parentCode: "4000", allowPosting: false },
  { code: "4110", name: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue", level: 3, parentCode: "4100", allowPosting: false },
  { code: "4111", name: "مبيعات نقدية", nameEn: "Cash Sales", type: "revenue", level: 4, parentCode: "4110" },
  { code: "4112", name: "مبيعات آجلة", nameEn: "Credit Sales", type: "revenue", level: 4, parentCode: "4110" },
  { code: "4113", name: "مردودات ومسموحات المبيعات", nameEn: "Sales Returns & Allowances", type: "revenue", level: 4, parentCode: "4110" },

  { code: "4120", name: "إيرادات الإيجارات", nameEn: "Rental Revenue", type: "revenue", level: 3, parentCode: "4100", allowPosting: false },
  { code: "4121", name: "إيجارات سكنية", nameEn: "Residential Rent", type: "revenue", level: 4, parentCode: "4120" },
  { code: "4122", name: "إيجارات تجارية", nameEn: "Commercial Rent", type: "revenue", level: 4, parentCode: "4120" },

  { code: "4130", name: "إيرادات الخدمات", nameEn: "Service Revenue", type: "revenue", level: 3, parentCode: "4100" },
  { code: "4140", name: "إيرادات المشاريع والمقاولات", nameEn: "Project Revenue", type: "revenue", level: 3, parentCode: "4100" },
  { code: "4150", name: "إيرادات النقل والأسطول", nameEn: "Fleet/Transport Revenue", type: "revenue", level: 3, parentCode: "4100" },
  // Per-service-type transport revenue leaves (Phase-1). 4150 stays POSTABLE:
  // cargo now posts to 4153 (Step-2 repoint in fleetEngine) and
  // early_termination_revenue to 4130 (propertiesEngine), but
  // fleet_rental_revenue (routes/fleet.ts) still falls back to 4150, so it
  // cannot become a non-postable parent yet. See
  // lib/transportRevenueAccounts.ts + migration 387.
  { code: "4151", name: "إيراد نقل المعتمرين", nameEn: "Umrah Transport Revenue", type: "revenue", level: 4, parentCode: "4150" },
  { code: "4152", name: "إيراد نقل الركاب", nameEn: "Passenger Transport Revenue", type: "revenue", level: 4, parentCode: "4150" },
  { code: "4153", name: "إيراد نقل البضائع", nameEn: "Freight Revenue", type: "revenue", level: 4, parentCode: "4150" },

  { code: "4900", name: "إيرادات أخرى", nameEn: "Other Income", type: "revenue", level: 2, parentCode: "4000", allowPosting: false },
  { code: "4910", name: "فوائد ومرابحات بنكية", nameEn: "Bank Interest", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4920", name: "أرباح بيع أصول ثابتة", nameEn: "Gain on Sale of Assets", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4930", name: "إيرادات متنوعة", nameEn: "Miscellaneous Income", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4940", name: "تخفيضات وخصومات مكتسبة", nameEn: "Discounts Earned", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4950", name: "أرباح فروق عملة", nameEn: "FX Revaluation Gain", type: "revenue", level: 3, parentCode: "4900" },

  // ============ 5xxx المصروفات ============
  { code: "5000", name: "المصروفات", nameEn: "Expenses", type: "expense", level: 1, allowPosting: false },

  // 51xx تكلفة الإيرادات
  { code: "5100", name: "تكلفة الإيرادات", nameEn: "Cost of Revenue", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5110", name: "تكلفة البضاعة المباعة", nameEn: "COGS", type: "expense", level: 3, parentCode: "5100" },
  { code: "5120", name: "تكلفة الخدمات", nameEn: "Cost of Services", type: "expense", level: 3, parentCode: "5100" },
  { code: "5130", name: "تكلفة المشاريع والمقاولات", nameEn: "Project Costs", type: "expense", level: 3, parentCode: "5100" },
  { code: "5140", name: "تكاليف نقل وشحن", nameEn: "Freight & Shipping", type: "expense", level: 3, parentCode: "5100" },

  // 52xx مصروفات الموظفين
  { code: "5200", name: "مصروفات الموظفين", nameEn: "Employee Expenses", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5210", name: "الرواتب الأساسية", nameEn: "Basic Salaries", type: "expense", level: 3, parentCode: "5200" },
  { code: "5220", name: "البدلات (سكن/نقل/طعام)", nameEn: "Allowances", type: "expense", level: 3, parentCode: "5200" },
  { code: "5230", name: "العمل الإضافي", nameEn: "Overtime", type: "expense", level: 3, parentCode: "5200" },
  { code: "5240", name: "المكافآت والحوافز", nameEn: "Bonuses & Incentives", type: "expense", level: 3, parentCode: "5200" },
  { code: "5250", name: "حصة المنشأة في التأمينات (GOSI)", nameEn: "GOSI – Employer Share", type: "expense", level: 3, parentCode: "5200" },
  { code: "5260", name: "مكافأة نهاية الخدمة (مصروف)", nameEn: "EOSB Expense", type: "expense", level: 3, parentCode: "5200" },
  { code: "5270", name: "الإجازات وتذاكر السفر", nameEn: "Leave & Air Tickets", type: "expense", level: 3, parentCode: "5200" },
  { code: "5280", name: "التدريب والتطوير", nameEn: "Training & Development", type: "expense", level: 3, parentCode: "5200" },
  { code: "5290", name: "مصروفات توظيف ورسوم عمالة", nameEn: "Recruitment & Labor Fees", type: "expense", level: 3, parentCode: "5200" },
  // #2303 — payroll deduction contra-expense leaves. Late / absence /
  // violation amounts withheld from salary are CREDITED here (reducing net
  // employee cost) instead of bundling into the generic deductions-payable
  // clearing (2150). Late/absence = salary not earned; violations = penalty.
  { code: "5215", name: "استقطاعات التأخير", nameEn: "Late Deductions", type: "expense", level: 3, parentCode: "5200" },
  { code: "5216", name: "استقطاعات الغياب", nameEn: "Absence Deductions", type: "expense", level: 3, parentCode: "5200" },
  { code: "5217", name: "استقطاعات المخالفات", nameEn: "Violation Deductions", type: "expense", level: 3, parentCode: "5200" },

  // 53xx مصروفات إدارية وعمومية
  { code: "5300", name: "المصروفات الإدارية والعمومية", nameEn: "G&A Expenses", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5310", name: "إيجارات المكاتب والمستودعات", nameEn: "Office & Warehouse Rent", type: "expense", level: 3, parentCode: "5300" },
  { code: "5320", name: "الكهرباء والمياه", nameEn: "Utilities", type: "expense", level: 3, parentCode: "5300" },
  { code: "5330", name: "الاتصالات والإنترنت", nameEn: "Telecom & Internet", type: "expense", level: 3, parentCode: "5300" },
  { code: "5340", name: "القرطاسية والمطبوعات", nameEn: "Stationery & Printing", type: "expense", level: 3, parentCode: "5300" },
  { code: "5350", name: "الصيانة والإصلاحات", nameEn: "Repairs & Maintenance", type: "expense", level: 3, parentCode: "5300" },
  { code: "5360", name: "الضيافة والمأكولات", nameEn: "Hospitality", type: "expense", level: 3, parentCode: "5300" },
  { code: "5370", name: "رسوم حكومية وتراخيص", nameEn: "Government Fees & Licenses", type: "expense", level: 3, parentCode: "5300" },
  { code: "5380", name: "أتعاب مهنية واستشارية", nameEn: "Professional Fees", type: "expense", level: 3, parentCode: "5300" },
  { code: "5390", name: "مصروفات وعمولات بنكية", nameEn: "Bank Charges", type: "expense", level: 3, parentCode: "5300" },
  { code: "5395", name: "اشتراكات وعضويات", nameEn: "Subscriptions & Memberships", type: "expense", level: 3, parentCode: "5300" },

  // 54xx مصروفات تسويقية
  { code: "5400", name: "مصروفات التسويق والمبيعات", nameEn: "Marketing & Sales", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5410", name: "الإعلانات والترويج", nameEn: "Advertising & Promotion", type: "expense", level: 3, parentCode: "5400" },
  { code: "5420", name: "العروض والمعارض", nameEn: "Exhibitions & Events", type: "expense", level: 3, parentCode: "5400" },
  { code: "5430", name: "العمولات والوساطة", nameEn: "Commissions & Brokerage", type: "expense", level: 3, parentCode: "5400" },

  // 55xx مصروفات الأسطول
  { code: "5500", name: "مصروفات الأسطول والمركبات", nameEn: "Fleet Expenses", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5510", name: "الوقود", nameEn: "Fuel", type: "expense", level: 3, parentCode: "5500" },
  { code: "5520", name: "صيانة وإصلاح المركبات", nameEn: "Vehicle Maintenance", type: "expense", level: 3, parentCode: "5500" },
  { code: "5530", name: "تأمين المركبات", nameEn: "Vehicle Insurance", type: "expense", level: 3, parentCode: "5500" },
  { code: "5540", name: "رسوم استمارات وتجديدات", nameEn: "Vehicle Registration & Renewals", type: "expense", level: 3, parentCode: "5500" },
  { code: "5550", name: "إيجار مركبات", nameEn: "Vehicle Rental", type: "expense", level: 3, parentCode: "5500" },
  { code: "5560", name: "مخالفات مرورية", nameEn: "Traffic Violations", type: "expense", level: 3, parentCode: "5500" },

  // 56xx مصروفات العقارات
  { code: "5600", name: "مصروفات العقارات والمباني", nameEn: "Property Expenses", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5610", name: "صيانة المباني والوحدات", nameEn: "Building Maintenance", type: "expense", level: 3, parentCode: "5600" },
  { code: "5620", name: "خدمات الأمن والنظافة", nameEn: "Security & Cleaning", type: "expense", level: 3, parentCode: "5600" },
  { code: "5630", name: "أتعاب إدارة عقارات", nameEn: "Property Management Fees", type: "expense", level: 3, parentCode: "5600" },
  { code: "5640", name: "رسوم بلدية ومنافع", nameEn: "Municipal & Utility Fees", type: "expense", level: 3, parentCode: "5600" },

  // 57xx الإهلاك والاستهلاك
  { code: "5700", name: "مصروفات الإهلاك والاستهلاك", nameEn: "Depreciation & Amortization", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5710", name: "إهلاك المركبات", nameEn: "Vehicle Depreciation", type: "expense", level: 3, parentCode: "5700" },
  { code: "5720", name: "إهلاك الأثاث والتجهيزات", nameEn: "Furniture Depreciation", type: "expense", level: 3, parentCode: "5700" },
  { code: "5730", name: "إهلاك الحاسبات والمعدات", nameEn: "Computer Depreciation", type: "expense", level: 3, parentCode: "5700" },
  { code: "5740", name: "إهلاك المباني", nameEn: "Building Depreciation", type: "expense", level: 3, parentCode: "5700" },
  { code: "5750", name: "إطفاء الأصول غير الملموسة", nameEn: "Intangibles Amortization", type: "expense", level: 3, parentCode: "5700" },

  // 58xx مصروفات أخرى ومخصصات
  { code: "5800", name: "مصروفات أخرى ومخصصات", nameEn: "Other Expenses & Provisions", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5810", name: "خسائر بيع أصول ثابتة", nameEn: "Loss on Sale of Assets", type: "expense", level: 3, parentCode: "5800" },
  // 5850 / 5860: مصروفات IAS 36 (هبوط القيمة) و IAS 16 (إعادة التقييم النازلة).
  // مستقلة عن 5810 (خسائر البيع) لأن طبيعتها وتوقيت الاعتراف بها مختلفان.
  // #2140-5a مرتكزات الأصول الثابتة.
  { code: "5850", name: "خسارة انخفاض قيمة الأصول الثابتة", nameEn: "Impairment Loss – Fixed Assets", type: "expense", level: 3, parentCode: "5800" },
  { code: "5860", name: "خسارة إعادة تقييم الأصول الثابتة", nameEn: "Revaluation Loss – Fixed Assets", type: "expense", level: 3, parentCode: "5800" },
  { code: "5820", name: "ديون معدومة", nameEn: "Bad Debts", type: "expense", level: 3, parentCode: "5800" },
  { code: "5830", name: "مخصصات (ضمانات/التزامات)", nameEn: "Provisions", type: "expense", level: 3, parentCode: "5800" },
  { code: "5840", name: "زكاة وضرائب الدخل", nameEn: "Zakat & Income Tax", type: "expense", level: 3, parentCode: "5800" },

  // 59xx مصروفات قانونية وتأمينية
  { code: "5900", name: "مصروفات قانونية وتأمينية", nameEn: "Legal & Insurance", type: "expense", level: 2, parentCode: "5000", allowPosting: false },
  { code: "5910", name: "رسوم محاكم وتقاضي", nameEn: "Court & Litigation Fees", type: "expense", level: 3, parentCode: "5900" },
  { code: "5920", name: "أتعاب محاماة", nameEn: "Legal Fees", type: "expense", level: 3, parentCode: "5900" },
  { code: "5930", name: "تأمين عام (مباني/مسؤولية)", nameEn: "General Insurance", type: "expense", level: 3, parentCode: "5900" },

  // ============ 9xxx حسابات تسوية ============
  { code: "9999", name: "فروقات التقريب", nameEn: "Rounding Differences", type: "expense", level: 1 },
];

async function createDefaultChartOfAccounts(client: pg.PoolClient, companyId: number) {
  const codeToId: Record<string, number> = {};
  for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
    const parentId = acc.parentCode ? (codeToId[acc.parentCode] ?? null) : null;
    const allowPosting = acc.allowPosting !== false;
    const res = await exec(
      client,
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'active')
       ON CONFLICT ("companyId", code) DO UPDATE SET
         name = EXCLUDED.name,
         "nameEn" = EXCLUDED."nameEn",
         type = EXCLUDED.type,
         "parentId" = EXCLUDED."parentId",
         "parentCode" = EXCLUDED."parentCode",
         level = EXCLUDED.level,
         "allowPosting" = EXCLUDED."allowPosting"
       RETURNING id`,
      [companyId, acc.code, acc.name, acc.nameEn, acc.type, parentId, acc.parentCode || null, acc.level, allowPosting]
    );
    codeToId[acc.code] = res.rows[0].id;
  }
}

async function createDefaultRoles(client: pg.PoolClient, companyId: number) {
  // #1791 — seed RBAC v2 directly (rbac_roles + rbac_role_grants) from the
  // shared default role definitions, then bind the company's active
  // employee_assignments (including the creator's owner assignment minted just
  // above) to their v2 role so login's role-switcher is populated immediately.
  // No more legacy role_permissions writes.
  const { roleIdByKey } = await seedRolesAndGrantsV2(client, companyId, DEFAULT_ROLE_DEFS);
  await bindUsersFromAssignments(client, companyId, roleIdByKey);
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

/**
 * Clone every numbering_schemes row that exists for the template
 * tenant (the lowest-id company that has rows) into the new company.
 * The migrations under `SEED_REPLAY_ALLOWLIST` seed schemes for
 * companies that existed at migration time; companies created via
 * this bootstrap need their own copy or every numbered write
 * (sales_invoice, journal_entry, support_ticket, umrah_group, ...)
 * returns 404 "لا توجد سياسة ترقيم لـ <module>.<entity> في الشركة #N".
 *
 * Idempotent: ON CONFLICT DO NOTHING on (companyId, moduleKey, entityKey).
 */
async function createDefaultNumberingSchemes(client: pg.PoolClient, companyId: number) {
  // Pick the lowest-id company that actually has schemes as the
  // template. We avoid hard-coding company 1 because in test setups
  // the seeded tenant may live at a different id.
  const tplResult = await client.query<{ companyId: number }>(
    `SELECT MIN("companyId") AS "companyId"
       FROM numbering_schemes
      WHERE "companyId" <> $1`,
    [companyId],
  );
  const templateCompanyId = tplResult.rows[0]?.companyId;
  if (!templateCompanyId) {
    // No template at all (very fresh DB). Skip — the migration replay
    // will fill schemes for the seeded companies; this bootstrap is
    // for SUBSEQUENT companies that need an existing template.
    return;
  }
  await client.query(
    `INSERT INTO numbering_schemes
       ("companyId", "moduleKey", "entityKey", "displayNameAr", "displayNameEn",
        prefix, pattern, "padLength", "resetPolicy", "scopePolicy",
        "issueTiming", "manualEditPolicy", "requiresReasonOnManualEdit",
        "lockAfterStatuses")
     SELECT $1, "moduleKey", "entityKey", "displayNameAr", "displayNameEn",
            prefix, pattern, "padLength", "resetPolicy", "scopePolicy",
            "issueTiming", "manualEditPolicy", "requiresReasonOnManualEdit",
            "lockAfterStatuses"
       FROM numbering_schemes
      WHERE "companyId" = $2
     ON CONFLICT ("companyId", "moduleKey", "entityKey") DO NOTHING`,
    [companyId, templateCompanyId],
  );
}

/**
 * Stamp the canonical default department on a fresh tenant. The
 * employee creation flow accepts a `department` string and resolves
 * it against this table; without the default row, every first POST
 * 422s with "القسم 'الإدارة العامة' غير موجود".
 */
async function createDefaultDepartment(client: pg.PoolClient, companyId: number, branchId: number) {
  await exec(
    client,
    `INSERT INTO departments ("companyId", "branchId", name, slug, status)
     VALUES ($1, $2, 'الإدارة العامة', 'general-management', 'active')
     ON CONFLICT DO NOTHING`,
    [companyId, branchId],
  );
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
    gosiCeiling: "45000",
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
