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
    case "item_barcode_label":
      return await loadItemBarcode(companyId, entityId);
    case "leave_request":
      return await loadLeaveRequest(companyId, entityId);
    case "loan_request":
    case "loan":
      return await loadLoanRequest(companyId, entityId);
    case "maintenance_request":
      return await loadMaintenanceRequest(companyId, entityId);
    case "payroll":
      return await loadPayrollRun(companyId, entityId);
    case "payslip":
      return await loadPayslip(companyId, entityId);
    case "official_letter":
      return await loadOfficialLetter(companyId, entityId);
    case "employee_contract":
      return await loadEmployeeContract(companyId, entityId);
    case "discipline_memo":
      return await loadDisciplineMemo(companyId, entityId);
    case "exit_settlement":
      return await loadExitSettlement(companyId, entityId);
    case "overtime_request":
      return await loadOvertimeRequest(companyId, entityId);
    case "legal_case":
      return await loadLegalCase(companyId, entityId);
    case "legal_session":
      return await loadLegalSession(companyId, entityId);
    case "legal_judgment":
      return await loadLegalJudgment(companyId, entityId);
    case "legal_correspondence":
      return await loadLegalCorrespondence(companyId, entityId);
    case "vehicle":
      return await loadVehicle(companyId, entityId);
    case "fleet_trip":
      return await loadFleetTrip(companyId, entityId);
    case "fleet_maintenance":
      return await loadFleetMaintenance(companyId, entityId);
    case "fuel_log":
      return await loadFuelLog(companyId, entityId);
    case "traffic_violation":
      return await loadTrafficViolation(companyId, entityId);
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
  // Finance
  project_costing: "project_costs",
  // account_statement was already moved off gl_accounts in #1084 (its
  // dedicated loader uses chart_of_accounts directly). This fallback entry
  // points to the canonical name so any code path that hits the default
  // branch still finds a real table.
  account_statement: "chart_of_accounts",
  // Property / CRM
  tenant: "tenants",
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
  return { entity: voucher ?? { id } };
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
  // journal_entry_lines table not yet committed to schema_pre.sql — defer to
  // generic table fallback when present in live DB.
  return { entity: je, lines: [] };
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
  return await loadGeneric("stock_transfers", id, companyId);
}

async function loadStockAdjustment(companyId: number, id: string) {
  return await loadGeneric("stock_adjustments", id, companyId);
}

async function loadItemBarcode(companyId: number, id: string) {
  const [item] = await rawQuery<Record<string, unknown>>(
    `SELECT id, name, sku, barcode, price FROM warehouse_products WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: item ?? { id, name: "—", sku: "—", barcode: id, price: 0 } };
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

async function loadDisciplineMemo(companyId: number, id: string) {
  const [memo] = await rawQuery<Record<string, unknown>>(
    `SELECT m.*, r.title AS "regulationTitle", r."articleNumber" AS "regulationArticle"
       FROM hr_inquiry_memos m
       LEFT JOIN hr_discipline_regulation r ON r.id = m."regulationId"
      WHERE m.id = $1 AND m."companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!memo) return { entity: { id } };
  const employee = memo.employeeId
    ? (await rawQuery(
        `SELECT id, name, "empNumber", "iqamaNumber", "nationalId" FROM employees WHERE id = $1`,
        [memo.employeeId]
      ))[0]
    : null;
  const manager = memo.managerId
    ? (await rawQuery(
        `SELECT e.id, e.name, ea."jobTitle"
           FROM employee_assignments ea
           JOIN employees e ON e.id = ea."employeeId"
          WHERE ea.id = $1`,
        [memo.managerId]
      ))[0]
    : null;
  return { entity: memo, employee, manager };
}

async function loadExitSettlement(companyId: number, id: string) {
  const [exit] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!exit) return { entity: { id } };
  const employee = exit.employeeId
    ? (await rawQuery(
        `SELECT id, name, "empNumber", "iqamaNumber", "nationalId", iban, "bankName"
           FROM employees WHERE id = $1`,
        [exit.employeeId]
      ))[0]
    : null;
  // Pull the active assignment for job title + hire date (the bits the
  // settlement letter shows alongside the EOSB calculation).
  const assignment = exit.employeeId
    ? (await rawQuery(
        `SELECT "jobTitle", "hireDate", salary, "departmentId"
           FROM employee_assignments
          WHERE "employeeId" = $1 AND "companyId" = $2
          ORDER BY "isPrimary" DESC, id DESC
          LIMIT 1`,
        [exit.employeeId, companyId]
      ))[0]
    : null;
  return { entity: exit, employee, assignment };
}

async function loadOvertimeRequest(companyId: number, id: string) {
  const [ot] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!ot) return { entity: { id } };
  const employee = ot.employeeId
    ? (await rawQuery(
        `SELECT id, name, "empNumber", "iqamaNumber" FROM employees WHERE id = $1`,
        [ot.employeeId]
      ))[0]
    : null;
  return { entity: ot, employee };
}

// ─── Legal loaders ──────────────────────────────────────────────────────────
// Note: legal_sessions has NO companyId column — tenant isolation is
// enforced by joining through legal_cases.companyId. Skipping the JOIN
// would fall back to the unscoped second SELECT in loadByTable and leak
// rows across tenants.

async function loadLegalCase(companyId: number, id: string) {
  const [legalCase] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM legal_cases WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!legalCase) return { entity: { id } };
  // Pull upcoming sessions + recorded judgments so the case summary
  // prints the full picture, not just the header.
  const sessions = await rawQuery<Record<string, unknown>>(
    `SELECT id, "sessionDate", location, judge, result, "nextSessionDate", notes
       FROM legal_sessions
      WHERE "caseId" = $1 AND "deletedAt" IS NULL
      ORDER BY "sessionDate" DESC LIMIT 50`,
    [id]
  ).catch(() => []);
  const judgments = await rawQuery<Record<string, unknown>>(
    `SELECT id, "judgmentDate", "judgmentType", verdict, amount, "paidAmount", "dueDate"
       FROM legal_judgments
      WHERE "caseId" = $1 AND "companyId" = $2
      ORDER BY "judgmentDate" DESC LIMIT 20`,
    [id, companyId]
  ).catch(() => []);
  return { entity: legalCase, sessions, judgments };
}

async function loadLegalSession(companyId: number, id: string) {
  // legal_sessions.companyId doesn't exist — gate via legal_cases.
  const [session] = await rawQuery<Record<string, unknown>>(
    `SELECT s.*, c.title AS "caseTitle", c."caseNumber", c.court, c."lawyerName",
            c."opposingParty", c."caseType"
       FROM legal_sessions s
       JOIN legal_cases c ON c.id = s."caseId"
      WHERE s.id = $1 AND c."companyId" = $2 AND s."deletedAt" IS NULL
              AND c."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: session ?? { id } };
}

async function loadLegalJudgment(companyId: number, id: string) {
  const [judgment] = await rawQuery<Record<string, unknown>>(
    `SELECT j.*, c.title AS "caseTitle", c."caseNumber", c.court, c."lawyerName",
            c."opposingParty"
       FROM legal_judgments j
       LEFT JOIN legal_cases c ON c.id = j."caseId" AND c."companyId" = $2
      WHERE j.id = $1 AND j."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: judgment ?? { id } };
}

async function loadLegalCorrespondence(companyId: number, id: string) {
  const [corr] = await rawQuery<Record<string, unknown>>(
    `SELECT cr.*, c.title AS "caseTitle", c."caseNumber", c.court, c."lawyerName"
       FROM legal_correspondence cr
       LEFT JOIN legal_cases c ON c.id = cr."caseId" AND c."companyId" = $2
      WHERE cr.id = $1 AND cr."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: corr ?? { id } };
}

// ─── Fleet loaders ──────────────────────────────────────────────────────────
// Each loader composes the vehicle plate + driver name + linked employee
// (when present) so the printed document carries the operational context
// the bespoke templates expect — without the template needing to do its
// own lookups via {{#with}} blocks.

async function loadVehicle(companyId: number, id: string) {
  const [vehicle] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM fleet_vehicles
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!vehicle) return { entity: { id } };
  // Most-recent active insurance for the vehicle — useful on a
  // vehicle profile printout. NOTE: the canonical table is
  // `fleet_insurance` (singular), not `fleet_insurance_policies`. The
  // entityRegistry entry above still references the policies name for
  // backwards compatibility; touching that is a separate cleanup.
  const insurance = await rawQuery<Record<string, unknown>>(
    `SELECT id, "policyNumber", provider, type, "startDate", "endDate", premium, status
       FROM fleet_insurance
      WHERE "vehicleId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
      ORDER BY "endDate" DESC NULLS LAST LIMIT 1`,
    [id, companyId]
  ).catch(() => []);
  return { entity: vehicle, insurance: insurance[0] ?? null };
}

async function loadFleetTrip(companyId: number, id: string) {
  const [trip] = await rawQuery<Record<string, unknown>>(
    `SELECT t.*,
            v."plateNumber", v.make, v.model,
            d.name AS "driverName", d."licenseNumber", d.phone AS "driverPhone",
            c.name AS "clientName"
       FROM fleet_trips t
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."companyId" = $2
       LEFT JOIN fleet_drivers d ON d.id = t."driverId" AND d."companyId" = $2
       LEFT JOIN clients c ON c.id = t."clientId"
      WHERE t.id = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: trip ?? { id } };
}

async function loadFleetMaintenance(companyId: number, id: string) {
  const [m] = await rawQuery<Record<string, unknown>>(
    `SELECT m.*,
            v."plateNumber", v.make, v.model, v."currentMileage"
       FROM fleet_maintenance m
       LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = $2
      WHERE m.id = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: m ?? { id } };
}

async function loadFuelLog(companyId: number, id: string) {
  const [f] = await rawQuery<Record<string, unknown>>(
    `SELECT f.*,
            v."plateNumber", v.make, v.model,
            d.name AS "driverName"
       FROM fleet_fuel_logs f
       LEFT JOIN fleet_vehicles v ON v.id = f."vehicleId" AND v."companyId" = $2
       LEFT JOIN fleet_drivers d ON d.id = f."driverId" AND d."companyId" = $2
      WHERE f.id = $1 AND f."companyId" = $2 AND f."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: f ?? { id } };
}

async function loadTrafficViolation(companyId: number, id: string) {
  const [v] = await rawQuery<Record<string, unknown>>(
    `SELECT tv.*,
            veh."plateNumber", veh.make, veh.model,
            d.name AS "driverName", d."licenseNumber",
            d."employeeId" AS "driverEmployeeId"
       FROM fleet_traffic_violations tv
       LEFT JOIN fleet_vehicles veh ON veh.id = tv."vehicleId" AND veh."companyId" = $2
       LEFT JOIN fleet_drivers d ON d.id = tv."driverId" AND d."companyId" = $2
      WHERE tv.id = $1 AND tv."companyId" = $2 AND tv."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: v ?? { id } };
}
