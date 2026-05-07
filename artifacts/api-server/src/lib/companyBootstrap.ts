import { pool } from "./rawdb.js";
import { logger } from "./logger.js";
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
  { code: "1121", name: "بنك الراجحي", nameEn: "Al-Rajhi Bank", type: "asset", level: 4, parentCode: "1120" },
  { code: "1122", name: "البنك الأهلي السعودي", nameEn: "SNB", type: "asset", level: 4, parentCode: "1120" },
  { code: "1123", name: "بنك الرياض", nameEn: "Riyad Bank", type: "asset", level: 4, parentCode: "1120" },
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

  { code: "4900", name: "إيرادات أخرى", nameEn: "Other Income", type: "revenue", level: 2, parentCode: "4000", allowPosting: false },
  { code: "4910", name: "فوائد ومرابحات بنكية", nameEn: "Bank Interest", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4920", name: "أرباح بيع أصول ثابتة", nameEn: "Gain on Sale of Assets", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4930", name: "إيرادات متنوعة", nameEn: "Miscellaneous Income", type: "revenue", level: 3, parentCode: "4900" },
  { code: "4940", name: "تخفيضات وخصومات مكتسبة", nameEn: "Discounts Earned", type: "revenue", level: 3, parentCode: "4900" },

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
