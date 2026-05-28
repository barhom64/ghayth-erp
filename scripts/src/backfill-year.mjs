#!/usr/bin/env node
/**
 * Backfill 1 year of realistic Arabic ERP data across 10 modules.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/src/backfill-year.mjs
 *
 * Env:
 *   BFY_COMPANY_ID  (default 1)
 *   BFY_BRANCH_ID   (auto-pick first branch in company)
 *   BFY_DAYS        (default 365)
 *   BFY_SCALE       light|medium|heavy (default heavy)
 *   BFY_TAG         marker stored in notes/ref for idempotency (default BFY-2026)
 *   BFY_MODULES     comma-separated subset, default = all
 *   BFY_DRY         1 = print plan, do not insert
 *
 * Idempotent: each module skips if a row tagged BFY_TAG already exists.
 */
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

// ---------- Config ----------
const COMPANY_ID = Number(process.env.BFY_COMPANY_ID || 1);
const DAYS = Number(process.env.BFY_DAYS || 365);
const TAG = process.env.BFY_TAG || 'BFY-2026';
const SCALE = (process.env.BFY_SCALE || 'heavy').toLowerCase();
const DRY = process.env.BFY_DRY === '1';
const MODULES = (process.env.BFY_MODULES || 'hr,finance,fleet,properties,warehouse,support,projects,legal,crm,umrah')
  .split(',').map(s => s.trim()).filter(Boolean);

const SIZES = {
  light:  { emp:50,  clients:50,  vendors:15, invoices:200,  trips:300,  units:30,  warehouses:3, tickets:100,  projects:10, leads:50,  pilgrims:100, vehicles:10, buildings:3, rentals:20, products:50 },
  medium: { emp:200, clients:100, vendors:30, invoices:1000, trips:1500, units:100, warehouses:4, tickets:400,  projects:25, leads:150, pilgrims:600, vehicles:20, buildings:6, rentals:80, products:150 },
  heavy:  { emp:500, clients:200, vendors:50, invoices:5000, trips:3000, units:200, warehouses:5, tickets:1000, projects:50, leads:300, pilgrims:1500, vehicles:30, buildings:10, rentals:150, products:300 },
}[SCALE] || {};

// ---------- Helpers ----------
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const today = new Date();
const dayOffset = n => new Date(today.getTime() - n * 86400000);
const isoDate = d => d.toISOString().slice(0, 10);
const isoTs = d => d.toISOString();
const pad = (n, w = 4) => String(n).padStart(w, '0');

const ARABIC_NAMES = ['محمد','أحمد','عبدالله','عبدالرحمن','خالد','سعد','فهد','عمر','يوسف','إبراهيم','عبدالعزيز','بندر','تركي','ماجد','نواف','سلطان','مشعل','وليد','فيصل','بدر','هاني','حسن','حسين','رياض','صالح','عادل','جابر','ثامر','زياد','طلال'];
const ARABIC_FAMILIES = ['العتيبي','القحطاني','الشمري','الدوسري','الغامدي','الزهراني','المالكي','الحربي','الشهري','العنزي','المطيري','السبيعي','الرشيد','الدوسر','اليوسف','الفهد','السعد','الجابر','العمري','الزيد'];
const arName = () => `${pick(ARABIC_NAMES)} ${pick(ARABIC_NAMES)} ${pick(ARABIC_FAMILIES)}`;
const arCompanyName = () => `${pick(['مؤسسة','شركة','مجموعة','مكتب'])} ${pick(ARABIC_FAMILIES)} ${pick(['للتجارة','للمقاولات','للخدمات','الصناعية','العقارية','للنقل','للاستثمار'])}`;
const phone = () => `05${rand(0, 9)}${pad(rand(0, 9999999), 7)}`;
const NATIONALITIES = ['سعودي','مصري','يمني','هندي','باكستاني','بنغلاديشي','فلبيني','سوداني','سوري','أردني'];
const DEPTS_NAMES = ['الموارد البشرية','المالية','العمليات','المبيعات','المشاريع'];
const JOBS = ['مدير','محاسب','مهندس','فني','سائق','مشرف','منسق','أخصائي','مندوب مبيعات','مساعد إداري'];

// Bulk INSERT in chunks respecting pg's 65k param limit.
async function bulkInsert(client, table, cols, rows, opts = {}) {
  if (!rows.length) return 0;
  const returning = opts.returning ? ` RETURNING ${opts.returning}` : '';
  const onConflict = opts.onConflict ? ` ON CONFLICT ${opts.onConflict}` : '';
  const colList = cols.map(c => `"${c}"`).join(',');
  const maxParams = 60000;
  const chunkSize = Math.max(1, Math.floor(maxParams / cols.length));
  let inserted = 0;
  const out = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const placeholders = slice.map((_, ri) =>
      '(' + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',') + ')'
    ).join(',');
    const values = slice.flat();
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${placeholders}${onConflict}${returning}`;
    const r = await client.query(sql, values);
    inserted += r.rowCount;
    if (opts.returning) out.push(...r.rows);
  }
  return opts.returning ? out : inserted;
}

async function alreadySeeded(client, sql, params = []) {
  const r = await client.query(sql, params);
  return Number(r.rows[0]?.c || 0) > 0;
}

function log(...a) { console.log('[BFY]', ...a); }

// ---------- Modules ----------
let BRANCH_ID;
let DEPT_IDS = [];
let JOB_IDS = [];
let ADMIN_USER_ID;

async function setup(client) {
  if (process.env.BFY_BRANCH_ID) {
    BRANCH_ID = Number(process.env.BFY_BRANCH_ID);
  } else {
    const r = await client.query(`SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`, [COMPANY_ID]);
    if (!r.rows.length) throw new Error(`No branch for company ${COMPANY_ID}`);
    BRANCH_ID = r.rows[0].id;
  }
  const u = await client.query(`SELECT id FROM users WHERE email='admin@ghayth.com' LIMIT 1`);
  ADMIN_USER_ID = u.rows[0]?.id || null;

  // Departments
  const dr = await client.query(`SELECT id, name FROM departments WHERE "companyId"=$1`, [COMPANY_ID]);
  const existingDept = new Set(dr.rows.map(r => r.name));
  const toAdd = DEPTS_NAMES.filter(n => !existingDept.has(n));
  if (toAdd.length) {
    const rows = toAdd.map(n => [COMPANY_ID, BRANCH_ID, n, 'active']);
    const inserted = await bulkInsert(client, 'departments',
      ['companyId', 'branchId', 'name', 'status'], rows, { returning: 'id' });
    inserted.forEach(r => DEPT_IDS.push(r.id));
  }
  DEPT_IDS.push(...dr.rows.map(r => r.id));
  DEPT_IDS = [...new Set(DEPT_IDS)];

  // Job titles
  const jr = await client.query(`SELECT id, name FROM job_titles WHERE "companyId"=$1`, [COMPANY_ID]);
  const existingJob = new Set(jr.rows.map(r => r.name));
  const toAddJob = JOBS.filter(n => !existingJob.has(n));
  if (toAddJob.length) {
    const rows = toAddJob.map(n => [COMPANY_ID, n, 'عام', true]);
    const inserted = await bulkInsert(client, 'job_titles',
      ['companyId', 'name', 'category', 'isActive'], rows, { returning: 'id' });
    inserted.forEach(r => JOB_IDS.push(r.id));
  }
  JOB_IDS.push(...jr.rows.map(r => r.id));
  JOB_IDS = [...new Set(JOB_IDS)];

  log(`Anchors: company=${COMPANY_ID} branch=${BRANCH_ID} admin=${ADMIN_USER_ID} depts=${DEPT_IDS.length} jobs=${JOB_IDS.length}`);
}

// ----- HR -----
async function seedHR(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM employees WHERE "companyId"=$1 AND "empNumber" LIKE $2`, [COMPANY_ID, `BFY%`])) {
    log('HR: already seeded, skip'); return;
  }
  const N = SIZES.emp;
  log(`HR: creating ${N} employees + contracts + leave types...`);

  // Leave types
  const ltRows = [
    [COMPANY_ID, 'سنوية', 30, true, 'active'],
    [COMPANY_ID, 'مرضية', 30, true, 'active'],
    [COMPANY_ID, 'بدون راتب', 60, false, 'active'],
    [COMPANY_ID, 'أمومة', 70, true, 'active'],
    [COMPANY_ID, 'حج', 10, true, 'active'],
  ];
  const ltInserted = await bulkInsert(client, 'hr_leave_types',
    ['companyId', 'name', 'annualDays', 'isPaid', 'status'], ltRows,
    { returning: 'id', onConflict: 'DO NOTHING' }).catch(() => []);
  const lt = await client.query(`SELECT id FROM hr_leave_types WHERE "companyId"=$1 LIMIT 5`, [COMPANY_ID]);
  const leaveTypeIds = lt.rows.map(r => r.id);

  // Employees
  const empRows = [];
  for (let i = 1; i <= N; i++) {
    empRows.push([
      `BFY${pad(i, 5)}`,                       // empNumber
      arName(),                                 // name
      phone(),                                  // phone
      `bfy.emp${i}@ghayth.local`,               // email
      pick(['ذكر', 'أنثى']),                    // gender
      pick(NATIONALITIES),                      // nationality
      'active',                                 // status
      COMPANY_ID, BRANCH_ID,
      `10${pad(rand(0, 99999999), 8)}`,         // nationalId
      `23${pad(rand(0, 99999999), 8)}`,         // iqamaNumber
      isoDate(dayOffset(-rand(180, 720))),      // iqamaExpiry
    ]);
  }
  const empIds = (await bulkInsert(client, 'employees',
    ['empNumber', 'name', 'phone', 'email', 'gender', 'nationality', 'status', 'companyId', 'branchId', 'nationalId', 'iqamaNumber', 'iqamaExpiry'],
    empRows, { returning: 'id' })).map(r => r.id);
  log(`HR: ${empIds.length} employees inserted`);

  // Assignments
  const asnRows = empIds.map(eid => {
    const hire = dayOffset(rand(30, DAYS));
    return [
      eid, COMPANY_ID, BRANCH_ID,
      pick(DEPT_IDS), pick(JOBS), pick(['employee', 'manager', 'supervisor']),
      rand(4000, 25000), true, isoDate(hire), 'active',
      pick(JOB_IDS),
    ];
  });
  const asnIds = (await bulkInsert(client, 'employee_assignments',
    ['employeeId', 'companyId', 'branchId', 'departmentId', 'jobTitle', 'role', 'salary', 'isPrimary', 'hireDate', 'status', 'jobTitleId'],
    asnRows, { returning: 'id' })).map(r => r.id);

  // Contracts
  const ctrRows = empIds.map((eid, i) => {
    const start = dayOffset(rand(30, DAYS));
    return [
      COMPANY_ID, eid, asnIds[i], 'محدد المدة',
      isoDate(start), isoDate(new Date(start.getTime() + 365 * 86400000 * 2)),
      'active', `CT-BFY-${pad(i + 1, 6)}`, 'approved',
      rand(4000, 25000), rand(500, 2000), rand(300, 1500),
      BRANCH_ID,
    ];
  });
  await bulkInsert(client, 'employee_contracts',
    ['companyId', 'employeeId', 'assignmentId', 'contractType', 'startDate', 'endDate',
      'status', 'ref', 'approvalStatus', 'salary', 'housingAllowance', 'transportAllowance', 'branchId'],
    ctrRows);
  log(`HR: ${ctrRows.length} contracts inserted`);

  // Attendance for first 200 employees, last 90 working days
  const attRows = [];
  const attEmpCount = Math.min(200, empIds.length);
  for (let i = 0; i < attEmpCount; i++) {
    for (let d = 0; d < 90; d++) {
      const day = dayOffset(d);
      if (day.getDay() === 5 || day.getDay() === 6) continue; // Fri/Sat off
      const ci = new Date(day); ci.setHours(8, rand(0, 59), 0, 0);
      const co = new Date(day); co.setHours(17, rand(0, 59), 0, 0);
      const late = ci.getMinutes() > 15 ? ci.getMinutes() - 15 : 0;
      attRows.push([
        COMPANY_ID, BRANCH_ID, asnIds[i], isoDate(day),
        isoTs(ci), isoTs(co), late, 0,
        pick(['present', 'present', 'present', 'late']),
        'biometric',
      ]);
    }
  }
  await bulkInsert(client, 'attendance',
    ['companyId', 'branchId', 'assignmentId', 'date', 'checkIn', 'checkOut', 'lateMinutes', 'earlyLeaveMinutes', 'status', 'method'],
    attRows);
  log(`HR: ${attRows.length} attendance rows inserted`);

  // Leave requests
  if (leaveTypeIds.length) {
    const lrRows = [];
    for (let i = 0; i < Math.min(N * 2, 1000); i++) {
      const eid = pick(empIds);
      const start = dayOffset(rand(0, DAYS));
      const days = rand(1, 10);
      const end = new Date(start.getTime() + days * 86400000);
      lrRows.push([
        COMPANY_ID, eid, pick(leaveTypeIds),
        isoDate(start), isoDate(end), days,
        pick(['إجازة عائلية', 'سفر', 'مراجعة طبية', 'ظروف خاصة']),
        pick(['approved', 'approved', 'pending', 'rejected']),
      ]);
    }
    await bulkInsert(client, 'hr_leave_requests',
      ['companyId', 'employeeId', 'leaveTypeId', 'startDate', 'endDate', 'days', 'reason', 'status'],
      lrRows);
    log(`HR: ${lrRows.length} leave requests`);
  }

  // Payroll runs (12 monthly)
  const runRows = [];
  for (let m = 0; m < 12; m++) {
    const period = isoDate(dayOffset(m * 30)).slice(0, 7);
    runRows.push([COMPANY_ID, BRANCH_ID, period, 'paid', 0, ADMIN_USER_ID, `PR-BFY-${period}`, `[${TAG}] auto`]);
  }
  const runIds = (await bulkInsert(client, 'payroll_runs',
    ['companyId', 'branchId', 'period', 'status', 'totalNet', 'runBy', 'reference', 'notes'],
    runRows, { returning: 'id' })).map(r => r.id);

  // Payroll lines
  const plRows = [];
  for (const runId of runIds) {
    for (let i = 0; i < asnIds.length; i++) {
      const basic = rand(4000, 25000);
      const housing = rand(500, 2000);
      const transport = rand(300, 1500);
      const gross = basic + housing + transport;
      const gosi = Math.round(basic * 0.1);
      const net = gross - gosi;
      plRows.push([runId, asnIds[i], basic, gross, gosi, 0, net, housing, transport, 0, 0, 0, 0, 0, Math.round(basic * 0.12), empIds[i]]);
    }
  }
  await bulkInsert(client, 'payroll_lines',
    ['runId', 'assignmentId', 'basic', 'grossSalary', 'gosi', 'lateDeduction', 'netSalary',
      'housingAllowance', 'transportAllowance', 'absenceDeduction', 'violationDeduction',
      'loanDeduction', 'overtime', 'overtimeHours', 'gosiEmployer', 'employeeId'],
    plRows);
  log(`HR: ${runIds.length} payroll runs + ${plRows.length} lines`);
}

// ----- Finance -----
async function seedFinance(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM clients WHERE "companyId"=$1 AND code LIKE $2`, [COMPANY_ID, 'BFY%'])) {
    log('Finance: already seeded, skip'); return;
  }
  log(`Finance: creating ${SIZES.clients} clients + ${SIZES.vendors} suppliers + ${SIZES.invoices} invoices...`);

  // Clients
  const cliRows = [];
  for (let i = 1; i <= SIZES.clients; i++) {
    cliRows.push([COMPANY_ID, `BFY-C${pad(i, 5)}`, pick(['company', 'individual']),
      arCompanyName(), phone(), `client${i}@bfy.local`, 'سعودي', 'ar', 'active', `30${pad(rand(0, 99999999), 8)}`]);
  }
  const cliIds = (await bulkInsert(client, 'clients',
    ['companyId', 'code', 'type', 'name', 'phone', 'email', 'nationality', 'language', 'classification', 'taxNumber'],
    cliRows, { returning: 'id' })).map(r => r.id);

  // Suppliers
  const supRows = [];
  for (let i = 1; i <= SIZES.vendors; i++) {
    supRows.push([COMPANY_ID, arCompanyName(), arName(), phone(), `sup${i}@bfy.local`,
      `الرياض، حي ${pick(['الملز', 'العليا', 'النخيل', 'الورود'])}`, `30${pad(rand(0, 99999999), 8)}`, 30, 'active']);
  }
  const supIds = (await bulkInsert(client, 'suppliers',
    ['companyId', 'name', 'contactPerson', 'phone', 'email', 'address', 'taxNumber', 'paymentTerms', 'status'],
    supRows, { returning: 'id' })).map(r => r.id);

  // Products
  const prodRows = [];
  const cats = ['خدمات', 'مواد', 'معدات', 'استشارات'];
  for (let i = 1; i <= SIZES.products; i++) {
    prodRows.push([COMPANY_ID, `منتج/خدمة ${i}`, `SKU-BFY-${pad(i, 5)}`, pick(cats),
      rand(50, 5000), pick(['قطعة', 'ساعة', 'يوم', 'كجم']), true, pick(['service', 'product'])]);
  }
  const prodIds = (await bulkInsert(client, 'products',
    ['companyId', 'name', 'sku', 'category', 'unitPrice', 'unit', 'isActive', 'itemType'],
    prodRows, { returning: 'id' })).map(r => r.id);

  // Invoices
  const invRows = [];
  for (let i = 1; i <= SIZES.invoices; i++) {
    const sub = rand(500, 50000);
    const vat = Math.round(sub * 0.15);
    const total = sub + vat;
    const paid = Math.random() < 0.7 ? total : Math.random() < 0.5 ? Math.round(total * 0.5) : 0;
    const status = paid === total ? 'paid' : paid > 0 ? 'partially_paid' : pick(['draft', 'sent', 'overdue', 'approved']);
    const created = dayOffset(rand(0, DAYS));
    invRows.push([
      COMPANY_ID, BRANCH_ID, pick(cliIds),
      `INV-BFY-${pad(i, 6)}`, `فاتورة خدمات ${i}`,
      sub, 0.15, vat, total, paid, status,
      isoDate(new Date(created.getTime() + 30 * 86400000)),
      ADMIN_USER_ID, isoTs(created), 'SAR',
      paid > 0 ? isoTs(created) : null,
    ]);
  }
  const invIds = (await bulkInsert(client, 'invoices',
    ['companyId', 'branchId', 'clientId', 'ref', 'description',
      'subtotal', 'vatRate', 'vatAmount', 'total', 'paidAmount', 'status',
      'dueDate', 'createdBy', 'createdAt', 'currency', 'paidAt'],
    invRows, { returning: 'id' })).map(r => r.id);
  log(`Finance: ${invIds.length} invoices`);

  // Invoice lines (1-3 per invoice)
  const lineRows = [];
  for (const id of invIds) {
    const lines = rand(1, 3);
    for (let l = 0; l < lines; l++) {
      const qty = rand(1, 10);
      const up = rand(50, 2000);
      const lt = qty * up;
      lineRows.push([id, `بند ${l + 1}`, qty, up, lt, Math.round(lt * 0.15), Math.round(lt * 1.15), pick(prodIds)]);
    }
  }
  await bulkInsert(client, 'invoice_lines',
    ['invoiceId', 'description', 'quantity', 'unitPrice', 'lineTotal', 'vatAmount', 'lineGross', 'productId'],
    lineRows);
  log(`Finance: ${lineRows.length} invoice lines`);

  // Payments for paid/partial invoices
  const payRows = [];
  for (let i = 0; i < invIds.length; i++) {
    const [, , clientId, , , , , , total, paid] = invRows[i];
    if (paid > 0) {
      payRows.push([invIds[i], COMPANY_ID, clientId, paid,
        pick(['cash', 'bank', 'card', 'cheque']),
        `TRX-${pad(i + 1, 8)}`, isoTs(dayOffset(rand(0, DAYS))), 'seed']);
    }
  }
  await bulkInsert(client, 'invoice_payments',
    ['invoiceId', 'companyId', 'clientId', 'amount', 'method', 'transactionRef', 'paidAt', 'source'],
    payRows);
  log(`Finance: ${payRows.length} payments`);

  // Journal entries (one per invoice)
  const jeRows = invIds.map((id, i) => {
    const created = invRows[i][13];
    return [COMPANY_ID, BRANCH_ID, `JE-BFY-${pad(i + 1, 6)}`,
      `قيد فاتورة ${invRows[i][3]}`, ADMIN_USER_ID, created.slice(0, 10),
      'sales', 'posted', 'invoice', id, ADMIN_USER_ID, created];
  });
  const jeIds = (await bulkInsert(client, 'journal_entries',
    ['companyId', 'branchId', 'ref', 'description', 'createdBy', 'date',
      'type', 'status', 'sourceType', 'sourceId', 'postedBy', 'postedAt'],
    jeRows, { returning: 'id' })).map(r => r.id);

  // Journal lines (debit AR, credit Revenue + VAT)
  const jlRows = [];
  for (let i = 0; i < jeIds.length; i++) {
    const total = invRows[i][8];
    const vat = invRows[i][7];
    const sub = invRows[i][5];
    jlRows.push([jeIds[i], '1101', total, 0, 'مدين العميل', invRows[i][2]]);
    jlRows.push([jeIds[i], '4001', 0, sub, 'إيراد', invRows[i][2]]);
    if (vat > 0) jlRows.push([jeIds[i], '2301', 0, vat, 'ضريبة القيمة المضافة', invRows[i][2]]);
  }
  await bulkInsert(client, 'journal_lines',
    ['journalId', 'accountCode', 'debit', 'credit', 'description', 'clientId'],
    jlRows);
  log(`Finance: ${jeIds.length} JEs + ${jlRows.length} JE lines`);

  // Bank guarantees
  const bgRows = [];
  for (let i = 1; i <= 30; i++) {
    const issue = dayOffset(rand(0, DAYS));
    bgRows.push([COMPANY_ID, BRANCH_ID, `BG-BFY-${pad(i, 5)}`,
      pick(['البنك الأهلي', 'الراجحي', 'الرياض', 'سامبا', 'البلاد']),
      arCompanyName(), rand(10000, 500000), 'SAR',
      isoDate(issue), isoDate(new Date(issue.getTime() + 365 * 86400000)),
      pick(['ابتدائي', 'نهائي', 'دفعة مقدمة', 'صيانة']),
      pick(['active', 'expired', 'released']),
      `[${TAG}]`]);
  }
  await bulkInsert(client, 'bank_guarantees',
    ['companyId', 'branchId', 'ref', 'bank', 'beneficiary', 'amount', 'currency',
      'issueDate', 'expiryDate', 'guaranteeType', 'status', 'notes'],
    bgRows);
  log(`Finance: ${bgRows.length} bank guarantees`);
}

// ----- Fleet -----
async function seedFleet(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM fleet_vehicles WHERE "companyId"=$1 AND "plateNumber" LIKE $2`, [COMPANY_ID, 'BFY%'])) {
    log('Fleet: already seeded, skip'); return;
  }
  log(`Fleet: creating ${SIZES.vehicles} vehicles + ${SIZES.trips} trips...`);
  const makes = ['تويوتا', 'هيونداي', 'نيسان', 'فورد', 'مرسيدس', 'إيسوزو'];
  const models = ['كامري', 'هايلكس', 'النترا', 'صني', 'F150', 'أكتروس', 'NPR'];

  const vRows = [];
  for (let i = 1; i <= SIZES.vehicles; i++) {
    vRows.push([COMPANY_ID, BRANCH_ID, `BFY${pad(i, 4)}`, pick(makes), pick(models),
      rand(2018, 2025), pick(['أبيض', 'فضي', 'أسود', 'أحمر']),
      `VIN${pad(i, 14)}`, pick(['بنزين', 'ديزل']),
      rand(10000, 200000), 'active',
      isoDate(dayOffset(-rand(30, 365))), isoDate(dayOffset(-rand(30, 365)))]);
  }
  const vIds = (await bulkInsert(client, 'fleet_vehicles',
    ['companyId', 'branchId', 'plateNumber', 'make', 'model', 'year', 'color',
      'vinNumber', 'fuelType', 'currentMileage', 'status', 'insuranceExpiry', 'registrationExpiry'],
    vRows, { returning: 'id' })).map(r => r.id);

  // Trips
  const tripRows = [];
  const locs = ['الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة', 'الطائف', 'تبوك', 'أبها', 'حائل', 'بريدة'];
  for (let i = 1; i <= SIZES.trips; i++) {
    const start = dayOffset(rand(0, DAYS));
    const end = new Date(start.getTime() + rand(1, 8) * 3600000);
    tripRows.push([COMPANY_ID, pick(vIds), pick(locs), pick(locs),
      rand(10, 800), isoTs(start), isoTs(end), 'completed', rand(50, 2000),
      `TRIP-BFY-${pad(i, 6)}`]);
  }
  await bulkInsert(client, 'fleet_trips',
    ['companyId', 'vehicleId', 'fromLocation', 'toLocation', 'distance',
      'startTime', 'endTime', 'status', 'cost', 'ref'], tripRows);
  log(`Fleet: ${tripRows.length} trips`);

  // Fuel logs
  const flRows = [];
  for (let i = 0; i < 2000; i++) {
    const liters = rand(20, 80);
    const cpl = (Math.random() * 0.5 + 2.0).toFixed(2);
    flRows.push([COMPANY_ID, pick(vIds), isoDate(dayOffset(rand(0, DAYS))),
      liters, cpl, (liters * cpl).toFixed(2), rand(10000, 200000),
      pick(['أرامكو', 'النهدي', 'ساسكو', 'الدريس'])]);
  }
  await bulkInsert(client, 'fleet_fuel_logs',
    ['companyId', 'vehicleId', 'fuelDate', 'liters', 'costPerLiter', 'totalCost', 'mileageAtFuel', 'stationName'],
    flRows);
  log(`Fleet: ${flRows.length} fuel logs`);

  // Maintenance
  const mRows = [];
  for (let i = 0; i < 200; i++) {
    mRows.push([COMPANY_ID, pick(vIds), pick(['دورية', 'إصلاح', 'طوارئ']),
      pick(['تغيير زيت', 'فحص فرامل', 'تبديل إطارات', 'إصلاح محرك']),
      rand(200, 5000), rand(10000, 200000), isoDate(dayOffset(rand(0, DAYS))),
      pick(['ورشة الجزيرة', 'الصافي', 'النخبة']), 'completed']);
  }
  await bulkInsert(client, 'fleet_maintenance',
    ['companyId', 'vehicleId', 'type', 'description', 'cost', 'mileageAtService',
      'serviceDate', 'performedBy', 'status'], mRows);
  log(`Fleet: ${mRows.length} maintenance records`);
}

// ----- Properties -----
async function seedProperties(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM property_buildings WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY_ID, 'BFY%'])) {
    log('Properties: already seeded, skip'); return;
  }
  log(`Properties: ${SIZES.buildings} buildings + ${SIZES.units} units + ${SIZES.rentals} rentals...`);

  const bRows = [];
  for (let i = 1; i <= SIZES.buildings; i++) {
    bRows.push([COMPANY_ID, `BFY-عمارة ${i}`, `حي ${pick(['الملز', 'العليا', 'الورود', 'النخيل'])}`,
      'الرياض', pick(['سكني', 'تجاري', 'مختلط']),
      rand(10, 40), 0, rand(1000, 5000), rand(2010, 2024), 'active']);
  }
  const bIds = (await bulkInsert(client, 'property_buildings',
    ['companyId', 'name', 'address', 'city', 'type', 'totalUnits', 'occupiedUnits', 'totalArea', 'yearBuilt', 'status'],
    bRows, { returning: 'id' })).map(r => r.id);

  // Units
  const uRows = [];
  for (let i = 1; i <= SIZES.units; i++) {
    uRows.push([COMPANY_ID, `BFY-${pad(i, 4)}`, `عمارة ${rand(1, SIZES.buildings)}`,
      pick(['شقة', 'مكتب', 'محل', 'مستودع']),
      rand(60, 250), rand(1, 4), rand(1, 3), rand(0, 10),
      rand(2000, 15000), pick(['occupied', 'vacant', 'maintenance']),
      BRANCH_ID, pick(bIds)]);
  }
  const uIds = (await bulkInsert(client, 'property_units',
    ['companyId', 'unitNumber', 'buildingName', 'type', 'area', 'bedrooms',
      'bathrooms', 'floor', 'monthlyRent', 'status', 'branchId', 'buildingId'],
    uRows, { returning: 'id' })).map(r => r.id);
  log(`Properties: ${uIds.length} units`);

  // Rentals
  const rcRows = [];
  for (let i = 1; i <= SIZES.rentals; i++) {
    const start = dayOffset(rand(0, DAYS));
    const monthly = rand(2000, 15000);
    rcRows.push([COMPANY_ID, pick(uIds), arName(), phone(),
      `tenant${i}@bfy.local`, `10${pad(rand(0, 99999999), 8)}`,
      isoDate(start), isoDate(new Date(start.getTime() + 365 * 86400000)),
      monthly, monthly, 1, 'active', `RC-BFY-${pad(i, 5)}`, monthly * 12]);
  }
  await bulkInsert(client, 'rental_contracts',
    ['companyId', 'unitId', 'tenantName', 'tenantPhone', 'tenantEmail', 'tenantIdNumber',
      'startDate', 'endDate', 'monthlyRent', 'depositAmount', 'paymentDay',
      'status', 'contractNumber', 'yearlyRent'], rcRows);
  log(`Properties: ${rcRows.length} rentals`);

  // Maintenance requests
  const mrRows = [];
  for (let i = 0; i < 300; i++) {
    mrRows.push([COMPANY_ID, pick(uIds), arName(),
      pick(['سباكة', 'كهرباء', 'تكييف', 'دهانات', 'نظافة']),
      pick(['تسرب ماء', 'انقطاع كهرباء', 'تعطل مكيف', 'صيانة عامة']),
      pick(['low', 'medium', 'high']),
      pick(['pending', 'in_progress', 'completed']),
      isoTs(dayOffset(rand(0, DAYS)))]);
  }
  await bulkInsert(client, 'maintenance_requests',
    ['companyId', 'unitId', 'tenantName', 'category', 'description', 'priority', 'status', 'createdAt'],
    mrRows);
  log(`Properties: ${mrRows.length} maintenance requests`);
}

// ----- Warehouse -----
async function seedWarehouse(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM warehouses WHERE "companyId"=$1 AND code LIKE $2`, [COMPANY_ID, 'BFY%'])) {
    log('Warehouse: already seeded, skip'); return;
  }
  log(`Warehouse: ${SIZES.warehouses} warehouses + ${SIZES.products} products...`);

  const wRows = [];
  for (let i = 1; i <= SIZES.warehouses; i++) {
    wRows.push([COMPANY_ID, BRANCH_ID, `مستودع ${pick(['الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة'])} ${i}`,
      `BFY-W${pad(i, 3)}`, 'الرياض', 'active']);
  }
  const wIds = (await bulkInsert(client, 'warehouses',
    ['companyId', 'branchId', 'name', 'code', 'location', 'status'],
    wRows, { returning: 'id' })).map(r => r.id);

  // Warehouse products
  const wpRows = [];
  for (let i = 1; i <= SIZES.products; i++) {
    wpRows.push([COMPANY_ID, `BFY-WP-${pad(i, 5)}`, `صنف ${i}`,
      pick(['أدوات', 'مواد بناء', 'قطع غيار', 'مستلزمات']),
      pick(['قطعة', 'علبة', 'كرتون', 'متر']),
      10, 1000, rand(5, 500), rand(20, 1000), rand(40, 2500),
      BRANCH_ID, 'active']);
  }
  const wpIds = (await bulkInsert(client, 'warehouse_products',
    ['companyId', 'sku', 'name', 'categoryId', 'unit', 'minStock', 'maxStock',
      'currentStock', 'costPrice', 'sellPrice', 'branchId', 'status'],
    wpRows, { returning: 'id' }).catch(async (e) => {
      // categoryId is integer FK; retry without it
      log('Warehouse: retry without categoryId →', e.message?.slice(0, 80));
      const slim = wpRows.map(r => [r[0], r[1], r[2], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11]]);
      return await bulkInsert(client, 'warehouse_products',
        ['companyId', 'sku', 'name', 'unit', 'minStock', 'maxStock',
          'currentStock', 'costPrice', 'sellPrice', 'branchId', 'status'],
        slim, { returning: 'id' });
    })).map(r => r.id);
  log(`Warehouse: ${wpIds.length} products`);

  // Stock lots
  const lotRows = [];
  for (let i = 0; i < 1000; i++) {
    const recv = dayOffset(rand(0, DAYS));
    lotRows.push([COMPANY_ID, pick(wpIds), pick(wIds),
      `LOT-BFY-${pad(i + 1, 6)}`, rand(10, 500), rand(10, 500),
      rand(10, 500), 'SAR', isoDate(recv),
      isoDate(new Date(recv.getTime() + 365 * 86400000)),
      'active']);
  }
  await bulkInsert(client, 'warehouse_stock_lots',
    ['companyId', 'productId', 'warehouseId', 'lotNumber', 'quantity', 'originalQuantity',
      'unitCost', 'currency', 'receivedDate', 'expiryDate', 'status'], lotRows);
  log(`Warehouse: ${lotRows.length} stock lots`);
}

// ----- Support -----
async function seedSupport(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM support_tickets WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY_ID, 'TK-BFY%'])) {
    log('Support: already seeded, skip'); return;
  }
  const cli = await client.query(`SELECT id FROM clients WHERE "companyId"=$1 ORDER BY id LIMIT 500`, [COMPANY_ID]);
  const cliIds = cli.rows.map(r => r.id);
  if (!cliIds.length) { log('Support: no clients available, skip'); return; }

  log(`Support: ${SIZES.tickets} tickets...`);
  const tRows = [];
  for (let i = 1; i <= SIZES.tickets; i++) {
    const created = dayOffset(rand(0, DAYS));
    const status = pick(['open', 'in_progress', 'resolved', 'closed', 'resolved']);
    const resolved = ['resolved', 'closed'].includes(status);
    tRows.push([COMPANY_ID, BRANCH_ID, `TK-BFY-${pad(i, 6)}`,
      pick(['مشكلة في الفاتورة', 'استفسار خدمة', 'طلب إصلاح', 'شكوى', 'استشارة']),
      `وصف تذكرة الدعم رقم ${i}`,
      pick(['billing', 'technical', 'service', 'complaint']),
      pick(['low', 'medium', 'high', 'urgent']),
      status, pick(cliIds), isoTs(created),
      resolved ? isoTs(new Date(created.getTime() + rand(1, 5) * 86400000)) : null]);
  }
  const tIds = (await bulkInsert(client, 'support_tickets',
    ['companyId', 'branchId', 'ref', 'title', 'description', 'category',
      'priority', 'status', 'clientId', 'createdAt', 'resolvedAt'],
    tRows, { returning: 'id' })).map(r => r.id);

  // Replies
  const rRows = [];
  for (const id of tIds) {
    const n = rand(1, 4);
    for (let i = 0; i < n; i++) {
      rRows.push([id, ADMIN_USER_ID, 'فريق الدعم',
        pick(['تم استلام الطلب', 'جاري المعالجة', 'يرجى تزويدنا بتفاصيل إضافية', 'تم الحل بنجاح']),
        false, isoTs(dayOffset(rand(0, DAYS)))]);
    }
  }
  await bulkInsert(client, 'ticket_replies',
    ['ticketId', 'authorId', 'authorName', 'message', 'isInternal', 'createdAt'], rRows);
  log(`Support: ${tIds.length} tickets + ${rRows.length} replies`);
}

// ----- Projects -----
async function seedProjects(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM projects WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY_ID, 'PRJ-BFY%'])) {
    log('Projects: already seeded, skip'); return;
  }
  const cli = await client.query(`SELECT id FROM clients WHERE "companyId"=$1 ORDER BY id LIMIT 200`, [COMPANY_ID]);
  const cliIds = cli.rows.map(r => r.id);

  log(`Projects: ${SIZES.projects} projects...`);
  const pRows = [];
  for (let i = 1; i <= SIZES.projects; i++) {
    const start = dayOffset(rand(60, DAYS));
    const budget = rand(50000, 2000000);
    pRows.push([COMPANY_ID, `مشروع ${pick(['تطوير', 'تأهيل', 'صيانة', 'بناء', 'استشارة'])} ${i}`,
      `وصف المشروع ${i}`, cliIds.length ? pick(cliIds) : null,
      isoDate(start), isoDate(new Date(start.getTime() + rand(60, 540) * 86400000)),
      budget, Math.round(budget * Math.random() * 0.7),
      pick(['planning', 'in_progress', 'on_hold', 'completed']),
      rand(0, 100), `PRJ-BFY-${pad(i, 5)}`]);
  }
  const pIds = (await bulkInsert(client, 'projects',
    ['companyId', 'name', 'description', 'clientId', 'startDate', 'endDate',
      'budget', 'spentAmount', 'status', 'progress', 'ref'],
    pRows, { returning: 'id' })).map(r => r.id);

  // Milestones
  const msRows = [];
  for (const id of pIds) {
    const n = rand(2, 5);
    for (let i = 0; i < n; i++) {
      msRows.push([COMPANY_ID, id, `مرحلة ${i + 1}`, `تسليم المرحلة ${i + 1}`,
        isoDate(dayOffset(rand(0, DAYS))), pick(['pending', 'in_progress', 'completed'])]);
    }
  }
  await bulkInsert(client, 'project_milestones',
    ['companyId', 'projectId', 'name', 'description', 'dueDate', 'status'], msRows);
  log(`Projects: ${pIds.length} projects + ${msRows.length} milestones`);

  // Tasks
  const tkRows = [];
  for (let i = 1; i <= 500; i++) {
    tkRows.push([COMPANY_ID, BRANCH_ID, 'general',
      `مهمة ${i}: ${pick(['مراجعة عقد', 'جدولة اجتماع', 'إعداد تقرير', 'متابعة عميل'])}`,
      pick(['low', 'medium', 'high']),
      pick(['pending', 'in_progress', 'completed']),
      isoTs(dayOffset(rand(0, DAYS)))]);
  }
  await bulkInsert(client, 'tasks',
    ['companyId', 'branchId', 'type', 'title', 'priority', 'status', 'createdAt'], tkRows);
  log(`Projects: ${tkRows.length} tasks`);
}

// ----- Legal -----
async function seedLegal(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM legal_cases WHERE "companyId"=$1 AND "caseNumber" LIKE $2`, [COMPANY_ID, 'LC-BFY%'])) {
    log('Legal: already seeded, skip'); return;
  }
  log(`Legal: 50 cases + 100 contracts + 200 sessions...`);

  const lcRows = [];
  for (let i = 1; i <= 50; i++) {
    lcRows.push([COMPANY_ID, `LC-BFY-${pad(i, 5)}`, `قضية ${pick(['تجارية', 'عمالية', 'مدنية'])} ${i}`,
      pick(['تجارية', 'عمالية', 'مدنية']),
      pick(['المحكمة التجارية', 'محكمة العمل', 'المحكمة العامة']),
      isoDate(dayOffset(rand(0, DAYS))),
      arCompanyName(), `أ. ${arName()}`,
      pick(['open', 'pending', 'closed', 'won', 'lost']),
      pick(['low', 'medium', 'high']),
      `وصف القضية ${i}`, rand(10000, 500000),
      pick(['low', 'medium', 'high'])]);
  }
  const lcIds = (await bulkInsert(client, 'legal_cases',
    ['companyId', 'caseNumber', 'title', 'caseType', 'court', 'filingDate',
      'opposingParty', 'lawyerName', 'status', 'priority', 'description',
      'financialRisk', 'riskLevel'], lcRows, { returning: 'id' })).map(r => r.id);

  const lcoRows = [];
  for (let i = 1; i <= 100; i++) {
    const start = dayOffset(rand(0, DAYS));
    lcoRows.push([COMPANY_ID, `LCO-BFY-${pad(i, 5)}`,
      `عقد ${pick(['توريد', 'خدمات', 'صيانة', 'استشارات'])} ${i}`,
      pick(['supply', 'service', 'maintenance', 'consulting']),
      arCompanyName(), phone(),
      isoDate(start), isoDate(new Date(start.getTime() + 365 * 86400000)),
      rand(10000, 1000000), 'active', true, 60, ADMIN_USER_ID]);
  }
  await bulkInsert(client, 'legal_contracts',
    ['companyId', 'ref', 'title', 'contractType', 'partyName', 'partyContact',
      'startDate', 'endDate', 'value', 'status', 'renewalAlert', 'alertDaysBefore', 'createdBy'],
    lcoRows);

  // Sessions
  const lsRows = [];
  for (let i = 0; i < 200; i++) {
    lsRows.push([pick(lcIds), isoTs(dayOffset(rand(0, DAYS))),
      pick(['غرفة 1', 'غرفة 2', 'قاعة كبرى']),
      `القاضي ${arName()}`,
      pick(['تأجيل', 'سماع شهود', 'مرافعة', 'حكم'])]);
  }
  await bulkInsert(client, 'legal_sessions',
    ['caseId', 'sessionDate', 'location', 'judge', 'result'], lsRows);
  log(`Legal: ${lcIds.length} cases + ${lcoRows.length} contracts + ${lsRows.length} sessions`);
}

// ----- CRM -----
async function seedCRM(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM crm_opportunities WHERE "companyId"=$1 AND title LIKE $2`, [COMPANY_ID, '[BFY]%'])) {
    log('CRM: already seeded, skip'); return;
  }
  const cli = await client.query(`SELECT id FROM clients WHERE "companyId"=$1 ORDER BY id LIMIT 200`, [COMPANY_ID]);
  const cliIds = cli.rows.map(r => r.id);

  log(`CRM: ${SIZES.leads} opportunities + 20 campaigns...`);
  const oRows = [];
  for (let i = 1; i <= SIZES.leads; i++) {
    oRows.push([COMPANY_ID,
      `[BFY] فرصة ${pick(['تطوير', 'بيع', 'تجديد'])} ${i}`,
      cliIds.length ? pick(cliIds) : null,
      arName(), phone(), `lead${i}@bfy.local`,
      pick(['موقع', 'إعلان', 'إحالة', 'حدث']),
      pick(['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
      rand(5000, 500000), rand(10, 90),
      isoDate(dayOffset(-rand(0, 180))),
      pick(['active', 'inactive'])]);
  }
  await bulkInsert(client, 'crm_opportunities',
    ['companyId', 'title', 'clientId', 'contactName', 'contactPhone', 'contactEmail',
      'source', 'stage', 'value', 'probability', 'expectedCloseDate', 'status'], oRows);

  const cmRows = [];
  for (let i = 1; i <= 20; i++) {
    const start = dayOffset(rand(0, DAYS));
    cmRows.push([`[BFY] حملة ${i}`, `حملة تسويقية رقم ${i}`,
      pick(['email', 'sms', 'social', 'event']),
      pick(['facebook', 'twitter', 'whatsapp', 'snapchat']),
      pick(['active', 'paused', 'completed']),
      rand(5000, 100000), rand(0, 50000),
      isoDate(start), isoDate(new Date(start.getTime() + 30 * 86400000)),
      'العملاء المحتملون في الرياض', COMPANY_ID, ADMIN_USER_ID]);
  }
  await bulkInsert(client, 'marketing_campaigns',
    ['name', 'description', 'type', 'channel', 'status', 'budget', 'spent',
      'startDate', 'endDate', 'targetAudience', 'companyId', 'createdBy'], cmRows);
  log(`CRM: ${oRows.length} opportunities + ${cmRows.length} campaigns`);
}

// ----- Umrah -----
async function seedUmrah(client) {
  if (await alreadySeeded(client, `SELECT COUNT(*) c FROM umrah_groups WHERE "companyId"=$1 AND "internalRef" LIKE $2`, [COMPANY_ID, 'BFY%'])) {
    log('Umrah: already seeded, skip'); return;
  }
  log(`Umrah: 40 groups + ${SIZES.pilgrims} pilgrims...`);

  const gRows = [];
  for (let i = 1; i <= 40; i++) {
    gRows.push([COMPANY_ID, BRANCH_ID, `NUSK-BFY-${pad(i, 6)}`,
      `مجموعة عمرة ${i}`, rand(20, 80), pick([7, 10, 14, 21]),
      pick(['active', 'in_progress', 'completed', 'closed']),
      ADMIN_USER_ID, ADMIN_USER_ID,
      `BFY-G${pad(i, 5)}`]);
  }
  const gIds = (await bulkInsert(client, 'umrah_groups',
    ['companyId', 'branchId', 'nuskGroupNumber', 'name', 'mutamerCount',
      'programDuration', 'status', 'createdBy', 'updatedBy', 'internalRef'],
    gRows, { returning: 'id' })).map(r => r.id);

  const pRows = [];
  for (let i = 1; i <= SIZES.pilgrims; i++) {
    const arr = dayOffset(rand(0, DAYS));
    const stay = pick([7, 10, 14]);
    pRows.push([COMPANY_ID, BRANCH_ID, pick(gIds), arName(),
      `P${pad(rand(10000000, 99999999), 8)}`,
      `V${pad(rand(10000000, 99999999), 8)}`,
      pick(NATIONALITIES), pick(['ذكر', 'أنثى']),
      isoDate(dayOffset(-365 * rand(20, 60))),
      phone(), isoDate(arr),
      isoDate(new Date(arr.getTime() + stay * 86400000)),
      pick(['arrived', 'departed', 'overstayed', 'departed', 'departed']),
      `فندق ${pick(['أنوار المدينة', 'دار الإيمان', 'الصفوة', 'الكسوة'])}`,
      pick(['KAIA', 'MED', 'KAEC']),
      stay, false, true]);
  }
  await bulkInsert(client, 'umrah_pilgrims',
    ['companyId', 'branchId', 'groupId', 'fullName', 'passportNumber', 'visaNumber',
      'nationality', 'gender', 'dateOfBirth', 'phone', 'arrivalDate', 'departureDate',
      'status', 'hotelName', 'entryPort', 'programDuration', 'isInsideKingdom', 'hasUmrahPermit'],
    pRows);
  log(`Umrah: ${gIds.length} groups + ${pRows.length} pilgrims`);
}

// ---------- Driver ----------
async function main() {
  log(`Start. scale=${SCALE} company=${COMPANY_ID} days=${DAYS} tag=${TAG} modules=[${MODULES.join(',')}] dry=${DRY}`);
  if (DRY) { log('DRY mode — exiting'); await pool.end(); return; }

  const client = await pool.connect();
  try {
    await setup(client);
    const map = {
      hr: seedHR, finance: seedFinance, fleet: seedFleet, properties: seedProperties,
      warehouse: seedWarehouse, support: seedSupport, projects: seedProjects,
      legal: seedLegal, crm: seedCRM, umrah: seedUmrah,
    };
    for (const m of MODULES) {
      const fn = map[m];
      if (!fn) { log(`Unknown module: ${m}, skip`); continue; }
      const t0 = Date.now();
      try {
        await fn(client);
        log(`✓ ${m} done in ${Math.round((Date.now() - t0) / 1000)}s`);
      } catch (e) {
        log(`✗ ${m} failed: ${e.message}`);
        console.error(e.stack);
      }
    }
    log('All done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
