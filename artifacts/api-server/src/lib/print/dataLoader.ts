/**
 * dataLoader — fetches the raw entity payload for the Print Engine. Returns a
 * normalised object that variableSubstitution can flatten into {{path}} tokens.
 *
 * Each entityType has a focused loader that hits the canonical table. When an
 * entity isn't wired we fall back to a generic `SELECT *` against
 * entityRegistry.table, so the engine still produces *something* legible.
 */

import { rawQuery } from "../rawdb.js";
import { getEntity } from "../entityRegistry.js";
import {
  loadTrialBalance,
  loadIncomeStatement,
  loadInvoicesReport,
  loadPayrollReport,
  loadAttendanceReport,
  loadFleetReport,
  loadFleetTripsReport,
  loadBalanceSheet,
  loadCashFlow,
  loadCashBankStatement,
  loadBudgetVariance,
  loadGeneralLedger,
  loadWhtSummary,
  loadChartOfAccounts,
  loadCustodyAdvances,
  loadExpensesAnalysis,
  loadRevenueAnalysis,
  loadRevenueByActivity,
  loadExpensesByCostCenter,
  loadCustomerStatement,
  loadVendorStatement,
} from "./reportLoaders.js";

interface LoaderArgs {
  companyId: number;
  entityType: string;
  entityId: string;
}

async function loadByTable(table: string, id: string, companyId: number) {
  // We restrict by companyId where the table has one — most do.
  try {
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
      [id, companyId]
    );
    if (rows[0]) return rows[0];
    // First query ran but found no row — return null instead of trying the
    // unscoped fallback. Otherwise an entity that simply isn't in this
    // tenant could leak data from another tenant.
    return null;
  } catch (err) {
    // Only fall back to the unscoped query when the failure is "column
    // companyId doesn't exist" (PG SQLSTATE 42703). For any other error
    // — bad id syntax, table missing, permission denied — return null so
    // we don't accidentally serve cross-tenant rows.
    const e = err as { code?: string };
    if (e?.code !== "42703") {
      return null;
    }
  }
  try {
    // Tables without a companyId column are by definition global/shared
    // (e.g., reference data, presets). Reaching this branch is rare and
    // expected to be safe — but we still cap at LIMIT 1 and don't expose
    // sensitive transactional tables here (the registry doesn't list any
    // such tables for print).
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  } catch {
    // Table missing entirely (migration not applied) or id type mismatch.
    // Return null and let the engine synthesise a stub document.
    return null;
  }
}

export async function loadEntityData(args: LoaderArgs): Promise<Record<string, unknown>> {
  return safeLoad(args, () => dispatchLoad(args));
}

/** Wraps any loader so a DB error (bad ID syntax, missing table, …) becomes
 *  a stub `{ entity: { id } }` payload instead of bubbling a 500 to the
 *  user. The Print Engine prefers to render a near-empty document over
 *  failing the click — universal fallback + auto-tokens will still produce
 *  the branch letterhead, a title, and an empty "لا توجد بنود" message. */
async function safeLoad(
  args: LoaderArgs,
  fn: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  try {
    return await fn();
  } catch (err) {
    // Re-emit at warn so support can diagnose without it counting as an
    // unhandled exception in alerting dashboards.
    // eslint-disable-next-line no-console
    console.warn("[print/dataLoader] load failed, returning stub", {
      entityType: args.entityType,
      entityId: args.entityId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { entity: { id: args.entityId } };
  }
}

async function dispatchLoad(args: LoaderArgs): Promise<Record<string, unknown>> {
  const { companyId, entityType, entityId } = args;
  const profile = getEntity(entityType);

  // For each entity, build a tailored payload. Falls through to generic loader.
  switch (entityType) {
    case "invoice":
    case "sales_invoice":
      return await loadInvoice(companyId, entityId);
    case "quotation":
      return await loadQuotation(companyId, entityId);
    case "sales_order":
      return await loadSalesOrder(companyId, entityId);
    case "delivery_note":
      return await loadDeliveryNote(companyId, entityId);
    case "credit_note":
      return await loadCreditNote(companyId, entityId);
    case "pos_receipt":
      return await loadPosReceipt(companyId, entityId);
    case "receipt_voucher":
    case "payment_voucher":
      return await loadVoucher(companyId, entityId);
    case "purchase_order":
      return await loadPurchaseOrder(companyId, entityId);
    case "purchase_request":
      return await loadPurchaseRequest(companyId, entityId);
    case "goods_receipt":
      return await loadGoodsReceipt(companyId, entityId);
    case "journal_entry":
      return await loadJournalEntry(companyId, entityId);
    case "account_statement":
      return await loadAccountStatement(companyId, entityId);
    case "stock_transfer":
      return await loadStockTransfer(companyId, entityId);
    case "stock_adjustment":
      return await loadStockAdjustment(companyId, entityId);
    case "inventory_count":
      return await loadInventoryCount(companyId, entityId);
    case "item_barcode_label":
      return await loadItemBarcode(companyId, entityId);
    case "job":
    case "job_posting":
      return await loadJobPosting(companyId, entityId);
    case "leave_request":
      return await loadLeaveRequest(companyId, entityId);
    case "loan_request":
    case "loan":
      return await loadLoanRequest(companyId, entityId);
    case "excuse_request":
      return await loadExcuseRequest(companyId, entityId);
    case "transfer":
      return await loadEmployeeTransfer(companyId, entityId);
    case "attendance":
      return await loadAttendance(companyId, entityId);
    case "discipline_memo":
      return await loadDisciplineMemo(companyId, entityId);
    case "fleet_maintenance":
      return await loadFleetMaintenance(companyId, entityId);
    case "insurance_policy":
    case "insurance":
      return await loadInsurancePolicy(companyId, entityId);
    case "maintenance_request":
      return await loadMaintenanceRequest(companyId, entityId);
    case "payroll":
    case "payroll_run":
      return await loadPayrollRun(companyId, entityId);
    case "payslip":
      return await loadPayslip(companyId, entityId);
    case "official_letter":
      return await loadOfficialLetter(companyId, entityId);
    case "employee_contract":
      return await loadEmployeeContract(companyId, entityId);
    // ─── Batch reports (no single row — synthetic entityId encodes filters) ──
    case "report_trial_balance":
      return await loadTrialBalance(companyId, entityId);
    case "report_income_statement":
      return await loadIncomeStatement(companyId, entityId);
    case "report_invoices":
      return await loadInvoicesReport(companyId, entityId);
    case "report_payroll":
      return await loadPayrollReport(companyId, entityId);
    case "report_attendance":
      return await loadAttendanceReport(companyId, entityId);
    case "report_fleet":
      return await loadFleetReport(companyId, entityId);
    case "report_fleet_trips":
      return await loadFleetTripsReport(companyId, entityId);
    case "report_balance_sheet":
      return await loadBalanceSheet(companyId, entityId);
    case "report_cash_flow":
      return await loadCashFlow(companyId, entityId);
    case "report_cash_bank":
      return await loadCashBankStatement(companyId, entityId);
    case "report_budget_variance":
      return await loadBudgetVariance(companyId, entityId);
    case "report_general_ledger":
      return await loadGeneralLedger(companyId, entityId);
    case "report_wht_summary":
      return await loadWhtSummary(companyId, entityId);
    case "report_chart_of_accounts":
      return await loadChartOfAccounts(companyId, entityId);
    case "report_custody_advances":
      return await loadCustodyAdvances(companyId, entityId);
    case "report_expenses_analysis":
      return await loadExpensesAnalysis(companyId, entityId);
    case "report_revenue_analysis":
      return await loadRevenueAnalysis(companyId, entityId);
    case "report_revenue_by_activity":
      return await loadRevenueByActivity(companyId, entityId);
    case "report_expenses_by_cost_center":
      return await loadExpensesByCostCenter(companyId, entityId);
    case "customer_statement":
      return await loadCustomerStatement(companyId, entityId);
    case "vendor_statement":
      return await loadVendorStatement(companyId, entityId);
    default:
      // 1. Entity is in entityRegistry → use its declared table.
      // 2. Otherwise fall back to the static map below for entities the
      //    registry doesn't cover yet (added when wiring the 73-page
      //    universal print coverage). Returning just `{ entity: { id } }`
      //    leaves the printed doc almost empty, which the user sees as
      //    "the print button doesn't work" even though it does.
      const table = profile?.table ?? FALLBACK_TABLE_MAP[entityType];
      if (table) {
        const raw = await loadByTable(table, entityId, companyId);
        return raw ? { entity: raw } : { entity: { id: entityId } };
      }
      return { entity: { id: entityId } };
  }
}

/** Static entityType → table map used by the default case when the
 *  registry doesn't list the entity. Keep entries pointing at tables
 *  that exist in db/schema_pre.sql.
 */
const FALLBACK_TABLE_MAP: Record<string, string> = {
  // HR
  evaluation_360: "evaluation_cycles",
  training: "training_courses",
  job: "job_postings",
  employee: "employees",
  employee_profile: "employees",
  overtime_request: "hr_overtime_requests",
  exit_request: "hr_exit_requests",
  // Finance
  project_costing: "project_costs",
  fixed_asset: "fixed_assets",
  vendor: "suppliers",
  // account_statement was already moved off gl_accounts in #1084 (its
  // dedicated loader uses chart_of_accounts directly). This fallback entry
  // points to the canonical name so any code path that hits the default
  // branch still finds a real table.
  account_statement: "chart_of_accounts",
  // Property / CRM
  tenant: "tenants",
  property_unit: "property_units",
  rental_contract: "rental_contracts",
  client: "clients",
  crm_lead: "crm_opportunities",
  // Fleet
  vehicle: "fleet_vehicles",
  fleet_trip: "fleet_trips",
  fuel: "fleet_fuel_logs",
  driver: "drivers",
  // Legal
  legal_contract: "legal_contracts",
  legal_judgment: "legal_cases",
  legal_session: "legal_sessions",
  // Inventory / Store
  warehouse_category: "warehouse_categories",
  store_product: "warehouse_products",
  // Umrah
  umrah_sub_agent: "umrah_sub_agents",
  umrah_transport: "umrah_transport",
  umrah_violation: "umrah_violations",
};

// ─── Focused loaders ────────────────────────────────────────────────────────
// Each loader returns the shape consumed by the seeded preset templates.

async function loadInvoice(companyId: number, id: string) {
  const [invoice] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM invoices WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!invoice) return { entity: { id } };
  // Select with stable aliases so the invoice template's {{this.totalPrice}}
  // works regardless of which schema the underlying table uses. invoice_lines
  // (the canonical table) stores the per-line total as "lineTotal" but the
  // ZATCA / legacy templates reference "totalPrice" — alias here so we don't
  // have to fork the preset per table.
  const items = await rawQuery<Record<string, unknown>>(
    `SELECT
       id,
       "invoiceId",
       description,
       quantity,
       "unitPrice",
       "lineTotal"  AS "totalPrice",
       "vatAmount",
       "lineGross"
     FROM invoice_lines WHERE "invoiceId" = $1`,
    [id]
  );
  const client = invoice.clientId
    ? (await rawQuery(`SELECT id, name, "taxNumber" FROM clients WHERE id = $1`, [invoice.clientId]))[0]
    : null;
  return { entity: invoice, items, client };
}

async function loadQuotation(companyId: number, id: string) {
  // Tables for quotation/sales_order/delivery_note/credit_note are not yet in
  // schema_pre.sql — fall back to the generic loader. Once the dedicated
  // tables land, replace with direct SELECTs.
  return await loadGeneric("quotations", id, companyId);
}

async function loadSalesOrder(companyId: number, id: string) {
  return await loadGeneric("sales_orders", id, companyId);
}

async function loadDeliveryNote(companyId: number, id: string) {
  return await loadGeneric("delivery_notes", id, companyId);
}

async function loadCreditNote(companyId: number, id: string) {
  // The canonical table is `credit_memos` — `credit_notes` was used in an
  // older migration sketch and never created. Without this alias every
  // credit-note print resolved to the empty stub.
  return await loadGeneric("credit_memos", id, companyId);
}

async function loadGeneric(table: string, id: string, companyId: number) {
  const row = await loadByTable(table, id, companyId);
  return row ? { entity: row } : { entity: { id } };
}

async function loadPosReceipt(companyId: number, id: string) {
  // pos_receipts isn't yet in schema_pre.sql — treat POS receipts as invoices
  // until the dedicated table lands. The thermal template only needs the
  // entity payload plus its line items, which the invoice loader provides.
  return await loadInvoice(companyId, id);
}

async function loadVoucher(companyId: number, id: string) {
  const [voucher] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM vouchers WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!voucher) return { entity: { id } };
  // Fetch the party (client for receipts, supplier for payments).
  // Some installations have neither, so each lookup is independent + null-safe.
  const client = voucher.clientId
    ? (await rawQuery<Record<string, unknown>>(`SELECT id, name, "taxNumber" FROM clients WHERE id = $1`, [voucher.clientId]))[0] ?? null
    : null;
  const supplier = voucher.supplierId
    ? (await rawQuery<Record<string, unknown>>(`SELECT id, name FROM suppliers WHERE id = $1`, [voucher.supplierId]))[0] ?? null
    : null;
  return { entity: voucher, client, supplier };
}

async function loadPurchaseOrder(companyId: number, id: string) {
  const [po] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!po) return { entity: { id } };
  const items = await rawQuery(`SELECT * FROM purchase_order_lines WHERE "purchaseOrderId" = $1`, [id]).catch(() => []);
  // The column on purchase_orders is "supplierId" (it was renamed from
  // "vendorId" before #1084 but the loader never caught up). Reading
  // `po.vendorId` returned undefined so the supplier name never loaded.
  const vendor = po.supplierId
    ? (await rawQuery(`SELECT id, name FROM suppliers WHERE id = $1`, [po.supplierId]))[0]
    : null;
  return { entity: po, items, vendor };
}

async function loadPurchaseRequest(companyId: number, id: string) {
  const [pr] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!pr) return { entity: { id } };
  const items = await rawQuery(`SELECT * FROM purchase_request_items WHERE "requestId" = $1`, [id]).catch(() => []);
  return { entity: pr, items };
}

async function loadGoodsReceipt(companyId: number, id: string) {
  const [gr] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM goods_receipts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!gr) return { entity: { id } };
  const items = await rawQuery(`SELECT * FROM goods_receipt_items WHERE "grnId" = $1`, [id]).catch(() => []);
  return { entity: gr, items };
}

async function loadJournalEntry(companyId: number, id: string) {
  const [je] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!je) return { entity: { id } };
  // journal_lines is the canonical name (was `journal_entry_lines` in older
  // sketches that never landed). Each row carries debit/credit + an
  // accountCode used by the printed entry sheet.
  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT id, "accountCode", description, debit, credit
       FROM journal_lines
      WHERE "journalId" = $1
      ORDER BY id`,
    [id]
  ).catch(() => []);
  return { entity: je, lines, items: lines };
}

async function loadAccountStatement(companyId: number, id: string) {
  const [account] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!account) return { entity: { id } };
  return { entity: { ...account, accountName: account.name }, movements: [] };
}

async function loadStockTransfer(companyId: number, id: string) {
  // The "stock transfer" entityType is virtual: the DB stores per-line moves
  // in warehouse_movements with type='transfer'. There's no per-document
  // table. We treat one warehouse_movements row as the printable transfer,
  // and JOIN the product so {{entity.productName}}/sku resolve correctly.
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT m.id, m.reference AS ref, m."createdAt", m.status,
            m."fromLocation" AS "fromWarehouseName",
            m."toLocation"   AS "toWarehouseName",
            m.notes AS reason,
            wp.name AS "productName",
            wp.sku  AS sku,
            wp.unit AS unit,
            m.quantity::numeric AS quantity,
            u.name AS "createdByName"
     FROM warehouse_movements m
     LEFT JOIN warehouse_products wp ON wp.id = m."productId"
     LEFT JOIN users u ON u.id = m."createdBy"
     WHERE m.id = $1 AND m."companyId" = $2 AND m.type = 'transfer'
     LIMIT 1`,
    [id, companyId]
  );
  if (!row) return { entity: { id } };
  // Wrap the single product as a one-row items[] so the preset's #each items
  // loop renders a real table row (preset can also use {{entity.productName}}).
  return {
    entity: row,
    items: [{
      productName: row.productName,
      sku: row.sku,
      quantity: row.quantity,
      unit: row.unit,
    }],
  };
}

async function loadStockAdjustment(companyId: number, id: string) {
  // Mirrors loadStockTransfer — same table, type='adjustment'. Stores old/new
  // qty in unitCost (legacy)/quantity; presets render the variance.
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT m.id, m.reference AS ref, m."createdAt", m.status,
            m."toLocation" AS "warehouseName",
            m.type AS "adjustmentType",
            m.notes AS reason,
            wp.name AS "productName",
            wp.sku  AS sku,
            wp.unit AS unit,
            m.quantity::numeric AS quantity,
            COALESCE(m."remainingQty", 0)::numeric AS "newQuantity",
            (COALESCE(m."remainingQty", 0) - m.quantity)::numeric AS variance,
            u.name AS "createdByName"
     FROM warehouse_movements m
     LEFT JOIN warehouse_products wp ON wp.id = m."productId"
     LEFT JOIN users u ON u.id = m."createdBy"
     WHERE m.id = $1 AND m."companyId" = $2 AND m.type IN ('adjustment', 'in', 'out', 'damage')
     LIMIT 1`,
    [id, companyId]
  );
  if (!row) return { entity: { id } };
  return {
    entity: row,
    items: [{
      productName: row.productName,
      oldQuantity: row.quantity,
      newQuantity: row.newQuantity,
      variance: row.variance,
    }],
  };
}

async function loadInventoryCount(companyId: number, id: string) {
  // Inventory count header + line items joined to warehouse_products so the
  // preset shows real names + skus + variance per item.
  const [header] = await rawQuery<Record<string, unknown>>(
    `SELECT ic.id, ic."countDate", ic.status, ic.notes,
            ic."warehouseLocation" AS "warehouseName",
            u1.name AS "assigneeName",
            u2.name AS "approvedByName",
            ic."approvedAt"
     FROM inventory_counts ic
     LEFT JOIN users u1 ON u1.id = ic."conductedBy"
     LEFT JOIN users u2 ON u2.id = ic."approvedBy"
     WHERE ic.id = $1 AND ic."companyId" = $2
     LIMIT 1`,
    [id, companyId]
  );
  if (!header) return { entity: { id } };
  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT ici.id, wp.name AS "productName", wp.sku, wp.unit,
            ici."systemStock"::numeric AS "expectedQty",
            ici."physicalCount"::numeric AS "actualQty",
            ici.variance::numeric AS variance,
            ici.notes
     FROM inventory_count_items ici
     LEFT JOIN warehouse_products wp ON wp.id = ici."productId"
     WHERE ici."countId" = $1
     ORDER BY ici.id`,
    [id]
  );
  return {
    entity: {
      ...header,
      ref: `IC-${header.id}`,
      lineCount: lines.length,
    },
    items: lines,
  };
}

async function loadItemBarcode(companyId: number, id: string) {
  // warehouse_products has no `barcode` column — labels print the sku
  // as the scannable code. `sellPrice` is the right column (not `price`).
  const [item] = await rawQuery<Record<string, unknown>>(
    `SELECT id, name, sku, "sellPrice" AS price FROM warehouse_products WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  return {
    entity: item
      ? { ...item, barcode: item.sku ?? String(id) }
      : { id, name: "—", sku: "—", barcode: String(id), price: 0 },
  };
}

async function loadJobPosting(companyId: number, id: string) {
  const [posting] = await rawQuery<Record<string, unknown>>(
    `SELECT id, title, department, location, type, description, requirements,
            "salaryMin", "salaryMax", status, "closingDate", "createdAt",
            "experienceLevel", education, vacancies, benefits, skills
     FROM job_postings WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: posting ?? { id } };
}

async function loadLeaveRequest(companyId: number, id: string) {
  const [lr] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!lr) return { entity: { id } };
  const employee = lr.employeeId
    ? (await rawQuery(`SELECT id, name, "empNumber" FROM employees WHERE id = $1`, [lr.employeeId]))[0]
    : null;
  return { entity: lr, employee };
}

async function loadExcuseRequest(companyId: number, id: string) {
  const [er] = await rawQuery<Record<string, unknown>>(
    `SELECT er.*, EXTRACT(EPOCH FROM (er."endTime" - er."startTime"))/3600 AS hours
     FROM hr_excuse_requests er
     WHERE er.id = $1 AND er."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!er) return { entity: { id } };
  const employee = er.employeeId
    ? (await rawQuery(`SELECT id, name, "empNumber" FROM employees WHERE id = $1`, [er.employeeId]))[0]
    : null;
  return { entity: er, employee };
}

async function loadEmployeeTransfer(companyId: number, id: string) {
  const [t] = await rawQuery<Record<string, unknown>>(
    `SELECT et.*,
            fb.name AS "fromBranch", tb.name AS "toBranch",
            fd.name AS "fromDepartment", td.name AS "toDepartment",
            fjt.name AS "currentJobTitle", tjt.name AS "newJobTitle"
     FROM employee_transfers et
     LEFT JOIN branches fb ON fb.id = et."fromBranchId"
     LEFT JOIN branches tb ON tb.id = et."toBranchId"
     LEFT JOIN departments fd ON fd.id = et."fromDepartmentId"
     LEFT JOIN departments td ON td.id = et."toDepartmentId"
     LEFT JOIN job_titles fjt ON fjt.id = et."fromJobTitleId"
     LEFT JOIN job_titles tjt ON tjt.id = et."toJobTitleId"
     WHERE et.id = $1 AND et."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!t) return { entity: { id } };
  const employee = t.employeeId
    ? (await rawQuery(`SELECT id, name, "empNumber" FROM employees WHERE id = $1`, [t.employeeId]))[0]
    : null;
  return { entity: t, employee };
}

async function loadAttendance(companyId: number, id: string) {
  const [att] = await rawQuery<Record<string, unknown>>(
    `SELECT a.id, a.date AS "attendanceDate",
            to_char(a.date, 'Day') AS "dayName",
            a."checkIn"  AS "checkInTime",
            a."checkOut" AS "checkOutTime",
            CONCAT(a."checkInLat",  ',', a."checkInLon")  AS "checkInLocation",
            CONCAT(a."checkOutLat", ',', a."checkOutLon") AS "checkOutLocation",
            a."lateMinutes", a."earlyMinutes",
            EXTRACT(EPOCH FROM (a."checkOut" - a."checkIn"))/3600 AS "workedHours",
            a.status, a.notes,
            ea.id AS "assignmentId",
            s.name AS "shiftName",
            e.id AS "employeeId", e.name AS "employeeName", e."empNumber"
     FROM attendance a
     LEFT JOIN employee_assignments ea ON ea.id = a."assignmentId"
     LEFT JOIN employees e ON e.id = ea."employeeId"
     LEFT JOIN shifts s ON s.id = ea."shiftId"
     WHERE a.id = $1 AND a."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!att) return { entity: { id } };
  const employee = att.employeeId
    ? { id: att.employeeId, name: att.employeeName, empNumber: att.empNumber }
    : null;
  return { entity: att, employee };
}

async function loadDisciplineMemo(companyId: number, id: string) {
  const [m] = await rawQuery<Record<string, unknown>>(
    `SELECT dm.id, dm."memoNumber" AS ref, dm.status, dm.notes AS description,
            dm."penaltyLabel" AS action, dm."totalDeductionAmount",
            dm."createdAt", v.severity, v."violationType",
            e.id AS "employeeId", e.name AS "employeeName", e."empNumber",
            d.name AS "departmentName",
            (SELECT COUNT(*) FROM hr_violations v2
              WHERE v2."employeeId" = v."employeeId" AND v2.id <> v.id) AS "priorCount"
     FROM discipline_memos dm
     LEFT JOIN hr_violations v ON v.id = dm."violationId"
     LEFT JOIN employees e ON e.id = v."employeeId"
     LEFT JOIN departments d ON d.id = e."departmentId"
     WHERE dm.id = $1 AND dm."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!m) return { entity: { id } };
  const employee = m.employeeId
    ? { id: m.employeeId, name: m.employeeName, empNumber: m.empNumber, departmentName: m.departmentName }
    : null;
  return { entity: m, employee };
}

async function loadFleetMaintenance(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT fm.id, fm.id AS ref, fm.type AS "serviceType",
            fm.description, fm.cost AS "totalCost",
            fm."serviceDate", fm."nextServiceDate", fm."nextServiceKm",
            fm."performedBy" AS "workshopName",
            fm."mileageAtService" AS odometer, fm.status,
            v."plateNumber", d.name AS "driverName"
     FROM fleet_maintenance fm
     LEFT JOIN fleet_vehicles v ON v.id = fm."vehicleId"
     LEFT JOIN fleet_drivers d ON d.id = v."currentDriverId"
     WHERE fm.id = $1 AND fm."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  return { entity: row ?? { id } };
}

async function loadInsurancePolicy(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT fi.id, fi."policyNumber", fi.type AS "policyType",
            fi.provider AS "insurerName",
            fi."startDate", fi."endDate" AS "expiryDate",
            fi."coverageAmount", fi.premium AS "premiumAmount",
            fi.status, v."plateNumber" AS "insuredEntity"
     FROM fleet_insurance fi
     LEFT JOIN fleet_vehicles v ON v.id = fi."vehicleId"
     WHERE fi.id = $1 AND fi."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  return { entity: row ?? { id } };
}

async function loadLoanRequest(companyId: number, id: string) {
  const [loan] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM hr_employee_loans WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!loan) return { entity: { id } };
  const employee = loan.employeeId
    ? (await rawQuery(`SELECT id, name, "empNumber" FROM employees WHERE id = $1`, [loan.employeeId]))[0]
    : null;
  return { entity: loan, employee };
}

async function loadMaintenanceRequest(companyId: number, id: string) {
  const [mr] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM maintenance_requests WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: mr ?? { id } };
}

async function loadPayslip(companyId: number, id: string) {
  // entityType "payslip" → single payroll_lines row (one employee, one period).
  // payroll_lines is keyed by id; the join to payroll_runs gives the period
  // and the company scope (lines themselves don't carry companyId).
  const [ps] = await rawQuery<Record<string, unknown>>(
    `SELECT pl.*, pr."period", pr."status" AS "runStatus", pr."companyId" AS "_runCompanyId"
       FROM payroll_lines pl
       JOIN payroll_runs pr ON pr.id = pl."runId"
      WHERE pl.id = $1 AND pr."companyId" = $2 AND pl."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!ps) return { entity: { id } };
  const employee = ps.employeeId
    ? (await rawQuery(`SELECT id, name, "empNumber" FROM employees WHERE id = $1`, [ps.employeeId]))[0]
    : null;
  return { entity: ps, employee };
}

async function loadPayrollRun(companyId: number, id: string) {
  // entityType "payroll" → the payroll_runs row + all its payroll_lines.
  // The frontend opens /finance/payroll/:id where id is a payroll_runs.id.
  // Before this loader existed, the old loadPayslip queried payroll_slips
  // (a table that was never created) so every payroll print rendered as
  // an empty stub.
  const [run] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM payroll_runs WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!run) return { entity: { id } };
  const items = await rawQuery<Record<string, unknown>>(
    `SELECT pl.*, e.name AS "employeeName", e."empNumber"
       FROM payroll_lines pl
       LEFT JOIN employees e ON e.id = pl."employeeId"
      WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL
      ORDER BY e."empNumber" NULLS LAST, pl.id`,
    [id]
  ).catch(() => []);
  return { entity: run, items };
}

async function loadOfficialLetter(companyId: number, id: string) {
  const [letter] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM official_letters WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: letter ?? { id } };
}

async function loadEmployeeContract(companyId: number, id: string) {
  const [contract] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!contract) return { entity: { id } };
  const employee = contract.employeeId
    ? (await rawQuery(`SELECT * FROM employees WHERE id = $1`, [contract.employeeId]))[0]
    : null;
  return { entity: contract, employee };
}
