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
import QRCode from "qrcode";
import { logger } from "../logger.js";
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
  /** When non-null, the user is restricted to these branches. Loaders that
   *  span multiple branches (customer/vendor statements, GL movements,
   *  warehouse moves) must filter by this list. `null` = unrestricted
   *  (company-owner / general manager / privileged role). */
  allowedBranches?: number[] | null;
  /** Caller's primary branch — used by single-entity loaders that want to
   *  show "this branch's view" of a global entity (e.g., customer card
   *  → AR balance for this branch only). */
  branchId?: number | null;
  /** Defensive: when `true` the user has owner-level access and branch
   *  filters are bypassed even if `allowedBranches` is set. */
  isOwner?: boolean;
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

/** Compute the branch filter that report/statement loaders should apply.
 *  Returns null = no restriction (the user is an owner or hasn't been
 *  scoped to specific branches). Otherwise returns the explicit list
 *  of branchIds the user can see. */
function branchFilter(args: LoaderArgs): number[] | null {
  if (args.isOwner) return null;
  if (!args.allowedBranches || args.allowedBranches.length === 0) return null;
  return args.allowedBranches;
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
    case "voucher":
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
    case "leave":
    case "request":
      return await loadLeaveRequest(companyId, entityId);
    case "loan_request":
    case "loan":
      return await loadLoanRequest(companyId, entityId);
    case "excuse_request":
    case "excuse":
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
    case "policy":
      return await loadInsurancePolicy(companyId, entityId);
    case "maintenance_request":
    case "maintenance":
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
    case "exit_settlement":
      return await loadExitSettlement(companyId, entityId);
    case "overtime_request":
    case "overtime":
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
    case "trip":
      return await loadFleetTrip(companyId, entityId);
    case "transport_booking_confirmation":
      return await loadTransportBookingConfirmation(companyId, entityId);
    case "cargo_manifest":
    case "manifest":
      return await loadCargoManifest(companyId, entityId);
    // #2079 TA-T18-11 (TPL-02) — fleet rental delivery/return docket.
    // One loader, one preset; the template renders the handover or
    // return block conditionally based on whether the row has the
    // corresponding timestamp filled. entityType is
    // `fleet_rental_contract` (not `rental_contract`, which is the
    // pre-existing property rental contract — different schema).
    case "fleet_rental_contract":
    case "fleet_rental_handover":
    case "fleet_rental_return":
      return await loadRentalContract(companyId, entityId);
    case "fuel_log":
      return await loadFuelLog(companyId, entityId);
    case "traffic_violation":
    case "violation":
      return await loadTrafficViolation(companyId, entityId);
    // ─── Master cards + niche transactions (Batches 5-7 presets) ───────
    case "vendor":
    case "supplier":
      return await loadVendorCard(companyId, entityId);
    case "building":
    case "property":
      return await loadBuildingCard(companyId, entityId);
    case "project":
      return await loadProjectCard(companyId, entityId);
    case "project_statement":
      return await loadProjectStatement(companyId, entityId);
    case "store_order":
      return await loadStoreOrder(companyId, entityId);
    case "crm_opportunity":
    case "opportunity":
      return await loadCrmOpportunity(companyId, entityId);
    case "support_ticket":
    case "ticket":
      return await loadSupportTicket(companyId, entityId);
    case "umrah_pilgrim":
    case "pilgrim":
    case "mutamer":
      return await loadUmrahPilgrim(companyId, entityId);
    case "umrah_group":
      return await loadUmrahGroup(companyId, entityId);
    case "umrah_invoice":
    case "umrah_sales_invoice":
      return await loadUmrahSalesInvoice(companyId, entityId);
    case "umrah_agent_invoice":
      return await loadUmrahAgentInvoice(companyId, entityId);
    case "umrah_nusk_invoice":
      return await loadUmrahNuskInvoice(companyId, entityId);
    case "umrah_commission_plan":
      return await loadUmrahCommissionPlan(companyId, entityId);
    case "umrah_commission_calculation":
      return await loadUmrahCommissionCalculation(companyId, entityId);
    case "umrah_penalty":
      return await loadUmrahPenalty(companyId, entityId);
    case "umrah_violation":
      return await loadUmrahViolation(companyId, entityId);
    case "umrah_transport":
      return await loadUmrahTransportTrip(companyId, entityId);
    case "umrah_package":
      return await loadUmrahPackage(companyId, entityId);
    case "salary_advance":
      return await loadSalaryAdvance(companyId, entityId);
    case "training_program":
      return await loadTrainingProgram(companyId, entityId);
    case "custody":
      return await loadCustody(companyId, entityId);
    case "warehouse_product":
    case "store_product":
    case "product":
      return await loadWarehouseProductCard(companyId, entityId);
    case "governance_policy":
      return await loadGovernancePolicy(companyId, entityId);
    case "budget":
      return await loadBudgetCard(companyId, entityId);
    case "shift":
      return await loadShiftCard(companyId, entityId);
    case "umrah_season":
    case "season":
      return await loadUmrahSeason(companyId, entityId);
    case "chart_of_account":
    case "account":
      return await loadChartOfAccount(companyId, entityId);
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
      return await loadCustomerStatement(companyId, entityId, branchFilter(args));
    case "vendor_statement":
      return await loadVendorStatement(companyId, entityId, branchFilter(args));
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
  transport_booking_confirmation: "transport_bookings",
  fuel: "fleet_fuel_logs",
  // The fleet driver master is in `fleet_drivers` — there's no `drivers` table.
  // Earlier wave (#1286) misnamed this; left a 404 when SPA hit the print
  // button on a driver detail page. Resolves to a real card now.
  driver: "fleet_drivers",
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
  // Short-name aliases for entityTypes the SPA detail pages actually use
  // (issue #1286). Each one was returning an empty stub before because the
  // SPA passes the short name (e.g. "expense") but the registry lists the
  // long form (e.g. "expense_claim"). Aliasing here makes the bespoke
  // preset render real data — see the audit in #1286 follow-up.
  expense: "expense_claims",
  leave: "hr_leave_requests",
  excuse: "hr_excuse_requests",
  maintenance: "maintenance_requests",
  // `voucher` (no dedicated switch case) used to point at the non-existent
  // `payment_vouchers` table — the real table is `vouchers`. Printing a
  // voucher card via the short alias returned an empty stub before.
  voucher: "vouchers",
  season: "umrah_seasons",
  agent: "umrah_agents",
  transport: "umrah_transport",
  // Traffic violations live in `fleet_traffic_violations`, not the
  // never-created `traffic_violations` the original alias pointed at. The
  // dedicated case route also covers this — fixing the fallback for safety.
  violation: "fleet_traffic_violations",
  opportunity: "crm_opportunities",
  task: "tasks",
  ticket: "support_tickets",
  unit: "property_units",
  contract: "rental_contracts",
  // Same issue as `voucher` — `policy` had no switch case AND pointed at the
  // non-existent `insurance_policies`. The real table for fleet vehicle
  // insurance is `fleet_insurance`. (Building insurance / hr exit-policy
  // are different domains and have their own canonical loaders.)
  policy: "fleet_insurance",
  // `property` has a switch case (loadBuildingCard hits property_buildings),
  // so this entry is only a safety net — but it used to point at the
  // non-existent `buildings`. Fixed to the canonical name.
  property: "property_buildings",
  sub_agent: "umrah_sub_agents",
  umrah_package: "umrah_packages",
  performance: "evaluation_cycles",
  performance_review: "evaluation_cycles",
  account: "chart_of_accounts",
  audit: "audit_logs",
  audit_record: "audit_logs",
  correspondence: "correspondence",
  request: "hr_leave_requests",
  compliance: "governance_compliance",
  owner: "property_owners",
  risk: "governance_risks",
  // Wave 7 — short aliases for entityTypes still passed by detail pages but
  // not yet covered. Each maps to the real table; presets that need
  // related-entity joins get a bespoke switch case below. Fallback is fine
  // when the preset only reads {{entity.*}}.
  customer: "clients",
  product: "warehouse_products",
  trip: "fleet_trips",
  overtime: "hr_overtime_requests",
  mutamer: "umrah_pilgrims",
  pilgrim: "umrah_pilgrims",
  application: "job_applications",
  campaign: "marketing_campaigns",
  umrah_runsheet: "umrah_pilgrims",
  // Wave 8 — `umrah_agent` was the last short alias the SPA passed without a
  // table mapping. Everything else closing-sweep needs was already routed by
  // an earlier wave; the matching BESPOKE_PRESETS keys now turn those rows
  // into real layouts instead of the empty fallback grid.
  umrah_agent: "umrah_agents",
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
  // ZATCA QR — invoice rows carry the base64 TLV string in `zatcaQrCode`
  // (populated by finance-zatca's `generateZatcaQrCode`). Render it as a
  // QR image data URL here so the print template can just `<img>` it via
  // `{{entity.zatcaQrImage}}`. Falls back to empty string if no TLV string,
  // or if QR generation fails (decorative — never blocks the print).
  const tlv = (invoice.zatcaQrCode ?? invoice.zatca_qr_code) as string | null | undefined;
  let zatcaQrImage = "";
  if (tlv && typeof tlv === "string" && tlv.length > 0) {
    try {
      zatcaQrImage = await QRCode.toDataURL(tlv, { width: 140, margin: 1 });
    } catch (err) {
      logger.warn({ err }, "[print/loadInvoice] ZATCA QR generation failed");
    }
  }
  return {
    entity: { ...invoice, zatcaQrImage },
    items,
    client,
  };
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
  // The line table renamed from purchase_order_lines → purchase_order_items
  // around migration 202 (#1418 GAP_MATRIX item #4). The loader was still
  // SELECTing from the old name, so PO prints rendered with an empty items
  // array and the universal template showed "بلا بنود".
  const items = await rawQuery(`SELECT * FROM purchase_order_items WHERE "orderId" = $1`, [id]).catch(() => []);
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
  // Last 100 posted movements on this account, newest first. Bounded so the
  // print doesn't paginate forever on a heavily-used account — operators who
  // need the full history go through the dedicated GL ledger report.
  const movements = await rawQuery<Record<string, unknown>>(
    `SELECT je.date AS "التاريخ",
            je.ref  AS "المرجع",
            je.description AS "البيان",
            COALESCE(jl.debit,  0)::numeric AS "مدين",
            COALESCE(jl.credit, 0)::numeric AS "دائن"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
      WHERE jl."accountId" = $1
        AND je."companyId" = $2
        AND je.status = 'posted'
      ORDER BY je.date DESC, je.id DESC
      LIMIT 100`,
    [id, companyId],
  ).catch(() => []);
  return { entity: { ...account, accountName: account.name }, movements };
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
     LEFT JOIN fleet_drivers d ON d.id = v."assignedDriverId"
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
  // payroll_run roster — header + per-employee lines. Computes aggregated
  // allowances + deductions so the preset can show them as single columns.
  const [run] = await rawQuery<Record<string, unknown>>(
    `SELECT pr.*, u.name AS "approvedByName", pr.period
     FROM payroll_runs pr
     LEFT JOIN users u ON u.id = pr."approvedBy"
     WHERE pr.id = $1 AND pr."companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!run) return { entity: { id } };
  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT pl.id, pl.basic AS "baseSalary",
            (COALESCE(pl."housingAllowance",0) + COALESCE(pl."transportAllowance",0)
              + COALESCE(pl.overtime,0) + COALESCE(pl.commission,0))::numeric AS "totalAllowances",
            (COALESCE(pl.gosi,0) + COALESCE(pl."lateDeduction",0)
              + COALESCE(pl."absenceDeduction",0) + COALESCE(pl."violationDeduction",0)
              + COALESCE(pl."loanDeduction",0))::numeric AS "totalDeductions",
            pl."netSalary", pl."grossSalary",
            e.name AS "employeeName", e."empNumber"
       FROM payroll_lines pl
       LEFT JOIN employees e ON e.id = pl."employeeId"
      WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL
      ORDER BY e."empNumber" NULLS LAST, pl.id`,
    [id]
  );
  // Aggregate header-level totals so the preset's footer table can render
  // grand totals without needing a separate query.
  const totalBaseSalary = lines.reduce((s, l) => s + Number(l.baseSalary ?? 0), 0);
  const totalAllowances = lines.reduce((s, l) => s + Number(l.totalAllowances ?? 0), 0);
  const totalDeductions = lines.reduce((s, l) => s + Number(l.totalDeductions ?? 0), 0);
  const totalNet        = lines.reduce((s, l) => s + Number(l.netSalary ?? 0), 0);
  return {
    entity: {
      ...run,
      ref: run.reference ?? `PR-${run.id}`,
      employeeCount: lines.length,
      totalBaseSalary, totalAllowances, totalDeductions, totalNet,
    },
    items: lines,
  };
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

// Note: removed my earlier loadDisciplineMemo (queried hr_inquiry_memos).
// Main's loadDisciplineMemo (above) queries discipline_memos — a
// denormalized print-friendly summary table designed for the existing
// memo templates. Both tables exist in schema_pre.sql; the templates
// follow main's field shape (penaltyLabel / totalDeductionAmount /
// memoNumber).

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

// #1812 — booking confirmation document (user's gap #10). Loads the
// booking header + lines + dispatch (with vehicle/driver) and emits a
// QR data-URL for the customer's scan-to-verify use case. The print
// preset (templateResolver.ts) renders the corresponding template.
async function loadTransportBookingConfirmation(companyId: number, id: string) {
  const [booking] = await rawQuery<Record<string, unknown>>(
    `SELECT b.*, c.name AS "linkedCustomerName"
       FROM transport_bookings b
       LEFT JOIN clients c ON c.id = b."customerId" AND c."companyId" = b."companyId" AND c."deletedAt" IS NULL
      WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId],
  ).catch(() => [null]);
  if (!booking) return { entity: { id } };
  // #TA-T18 — the printed confirmation shows the LINKED customer (master
  // data), not the free-text snapshot, matching the on-screen confirmation.
  if (booking.linkedCustomerName) booking.customerName = booking.linkedCustomerName;
  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM transport_booking_lines
       WHERE "bookingId" = $1 AND "deletedAt" IS NULL ORDER BY "lineNumber"`,
    [id],
  ).catch(() => []);
  const dispatchOrders = await rawQuery<Record<string, unknown>>(
    `SELECT d.*, v."plateNumber" AS "vehiclePlate",
            dr.name AS "driverName", dr.phone AS "driverPhone"
       FROM transport_dispatch_orders d
       LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."companyId" = d."companyId"
       LEFT JOIN fleet_drivers dr ON dr.id = d."driverId" AND dr."companyId" = d."companyId"
      WHERE d."bookingId" = $1
      ORDER BY d."scheduledStartAt" ASC`,
    [id],
  ).catch(() => []);
  const qrPayload = `GHAYTH|TRANSPORT_BOOKING|${booking.bookingNumber}|${id}|${companyId}`;
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1 });
  } catch (err) {
    logger.warn({ err }, "[print/loadTransportBookingConfirmation] QR generation failed");
  }
  // Render an HTML-string per-leg block + per-dispatch block so the
  // preset can `{{{entity.legsHtml}}}` it. Avoids needing per-row
  // Handlebars iteration in the preset template.
  const legsHtml = lines.length === 0
    ? '<div style="color:#64748b">— لا توجد مقاطع تفصيلية —</div>'
    : `<table style="width:100%;border-collapse:collapse">
         <thead><tr style="background:#f8fafc">
           <th style="border:1px solid #e2e8f0;padding:4px">#</th>
           <th style="border:1px solid #e2e8f0;padding:4px">من</th>
           <th style="border:1px solid #e2e8f0;padding:4px">إلى</th>
           <th style="border:1px solid #e2e8f0;padding:4px">الانطلاق</th>
           <th style="border:1px solid #e2e8f0;padding:4px">الوصول</th>
         </tr></thead>
         <tbody>
           ${lines.map((l) => `
             <tr>
               <td style="border:1px solid #e2e8f0;padding:4px;font-family:monospace">${l.lineNumber ?? ""}</td>
               <td style="border:1px solid #e2e8f0;padding:4px">${l.fromLocationText ?? "—"}</td>
               <td style="border:1px solid #e2e8f0;padding:4px">${l.toLocationText ?? "—"}</td>
               <td style="border:1px solid #e2e8f0;padding:4px;font-size:11px">${l.scheduledPickupAt ?? "—"}</td>
               <td style="border:1px solid #e2e8f0;padding:4px;font-size:11px">${l.scheduledDeliveryAt ?? "—"}</td>
             </tr>`).join("")}
         </tbody>
       </table>`;
  const dispatchHtml = dispatchOrders.length === 0
    ? '<div style="color:#64748b">— لم يُسنَد بعد —</div>'
    : `<table style="width:100%;border-collapse:collapse">
         <thead><tr style="background:#f8fafc">
           <th style="border:1px solid #e2e8f0;padding:4px">المركبة</th>
           <th style="border:1px solid #e2e8f0;padding:4px">السائق</th>
           <th style="border:1px solid #e2e8f0;padding:4px">هاتف السائق</th>
           <th style="border:1px solid #e2e8f0;padding:4px">البداية</th>
         </tr></thead>
         <tbody>
           ${dispatchOrders.map((d) => `
             <tr>
               <td style="border:1px solid #e2e8f0;padding:4px;font-family:monospace">${d.vehiclePlate ?? "—"}</td>
               <td style="border:1px solid #e2e8f0;padding:4px">${d.driverName ?? "—"}</td>
               <td style="border:1px solid #e2e8f0;padding:4px;font-family:monospace">${d.driverPhone ?? "—"}</td>
               <td style="border:1px solid #e2e8f0;padding:4px;font-size:11px">${d.scheduledStartAt ?? ""}</td>
             </tr>`).join("")}
         </tbody>
       </table>`;
  return {
    entity: {
      ...booking,
      legsHtml,
      dispatchHtml,
      qrDataUrl,
      qrPayload,
    },
  };
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

// Cargo manifest — bill of lading for a single freight job. JOINs the
// customer + vehicle + driver names so the printed بوليصة matches the
// detail-page sub-header. Items array drives the {{#each items}} block.
async function loadCargoManifest(companyId: number, id: string) {
  const [m] = await rawQuery<Record<string, unknown>>(
    `SELECT cm.*,
            v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel",
            d.name AS "driverName", d.phone AS "driverPhone",
            d."licenseNumber" AS "driverLicense",
            c.name AS "linkedCustomerName", c.phone AS "linkedCustomerPhone"
       FROM cargo_manifests cm
       LEFT JOIN fleet_vehicles v ON v.id = cm."vehicleId" AND v."companyId" = $2
       LEFT JOIN fleet_drivers d ON d.id = cm."driverId" AND d."companyId" = $2
       LEFT JOIN clients c ON c.id = cm."customerId" AND c."companyId" = $2
      WHERE cm.id = $1 AND cm."companyId" = $2 AND cm."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!m) return { entity: { id } };
  const items = await rawQuery<Record<string, unknown>>(
    `SELECT description, quantity, "unitOfMeasure" AS unit, weight, "declaredValue",
            "isHazmat", "hazmatClass", notes
       FROM cargo_items
      WHERE "manifestId" = $1 AND "deletedAt" IS NULL
      ORDER BY id`,
    [id]
  ).catch(() => []);
  return { entity: m, items };
}

// Note: removed my earlier loadFleetMaintenance — main's version above
// has the print-template-friendly aliases (serviceType, totalCost,
// workshopName, odometer) that the maintenance templates depend on.

// #2079 TA-T18-11 — rental contract for the handover/return docket.
// The fields from migration 293 (handoverOdometer / handoverFuelLevel /
// handoverNotes / handoverAt + the return-side counterparts) are
// pulled here so the print template stays declarative — no inline
// conditional SQL inside the preset.
async function loadRentalContract(companyId: number, id: string) {
  const [contract] = await rawQuery<Record<string, unknown>>(
    `SELECT rc.*,
            v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel",
            v.year AS "vehicleYear", v.color AS "vehicleColor",
            v."vinNumber",
            c.name AS "clientName", c.phone AS "clientPhone",
            d.name AS "driverName", d.phone AS "driverPhone",
            d."licenseNumber" AS "driverLicense"
       FROM fleet_rental_contracts rc
       LEFT JOIN fleet_vehicles v ON v.id = rc."vehicleId" AND v."companyId" = $2
       LEFT JOIN clients c ON c.id = rc."clientId" AND c."companyId" = $2
       LEFT JOIN fleet_drivers d ON d.id = rc."driverId" AND d."companyId" = $2
      WHERE rc.id = $1 AND rc."companyId" = $2 AND rc."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!contract) return { entity: { id } };
  // Pre-render simple flags the template needs for its conditional
  // blocks (Mustache-style `{{#if}}` over a bool is more reliable
  // than templating against a SQL timestamp directly).
  return {
    entity: {
      ...contract,
      hasHandover: !!contract.handoverAt,
      hasReturn: !!contract.returnedAt,
      fuelLevelPct: contract.handoverFuelLevel != null
        ? Math.round(Number(contract.handoverFuelLevel) * 100)
        : null,
      returnFuelLevelPct: contract.returnFuelLevel != null
        ? Math.round(Number(contract.returnFuelLevel) * 100)
        : null,
    },
  };
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

// ─── Umrah loaders ──────────────────────────────────────────────────────────
// Umrah templates print pilgrim cards, group manifests, sales invoices
// (often for both the sub-agent who paid and the agent who serviced),
// agent reconciliation invoices, and penalty letters. Each loader brings
// the JOIN'd context the bespoke presets reference so the operator
// doesn't get a blank pilgrim name on a printed visa request.

async function loadUmrahPilgrim(companyId: number, id: string) {
  const [pilgrim] = await rawQuery<Record<string, unknown>>(
    `SELECT p.*,
            s.name AS "seasonName", s."startDate" AS "seasonStart", s."endDate" AS "seasonEnd",
            a.name AS "agentName", a.country AS "agentCountry",
            pk.name AS "packageName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_seasons s ON s.id = p."seasonId" AND s."companyId" = $2
       LEFT JOIN umrah_agents a ON a.id = p."agentId" AND a."companyId" = $2
       LEFT JOIN umrah_packages pk ON pk.id = p."packageId" AND pk."companyId" = $2
      WHERE p.id = $1 AND p."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: pilgrim ?? { id } };
}

async function loadUmrahGroup(companyId: number, id: string) {
  const [group] = await rawQuery<Record<string, unknown>>(
    `SELECT g.*,
            a.name AS "agentName", a.country AS "agentCountry",
            sa.name AS "subAgentName", sa."paymentTerms",
            s.name AS "seasonName"
       FROM umrah_groups g
       LEFT JOIN umrah_agents a ON a.id = g."agentId" AND a."companyId" = $2
       LEFT JOIN umrah_sub_agents sa ON sa.id = g."subAgentId" AND sa."companyId" = $2
       LEFT JOIN umrah_seasons s ON s.id = g."seasonId" AND s."companyId" = $2
      WHERE g.id = $1 AND g."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!group) return { entity: { id } };
  // Pilgrim manifest for the group — the template's "list of names" page.
  const pilgrims = await rawQuery<Record<string, unknown>>(
    `SELECT id, "fullName", "passportNumber", "visaNumber", nationality, gender,
            "arrivalDate", "departureDate", status, "hotelName", "roomNumber"
       FROM umrah_pilgrims
      WHERE "companyId" = $1
        AND ("agentId" = $2 OR "seasonId" = $3)
      ORDER BY "fullName"
      LIMIT 500`,
    // group `id` unreferenced here → not bound (was a $1 42P18 the .catch
    // swallowed, so printed group manifests had an empty pilgrim list).
    [companyId, group.agentId, group.seasonId],
  ).catch(() => []);
  return { entity: group, pilgrims };
}

async function loadUmrahSalesInvoice(companyId: number, id: string) {
  const [invoice] = await rawQuery<Record<string, unknown>>(
    `SELECT si.*,
            sa.name AS "subAgentName", sa."nuskCode" AS "subAgentNuskCode",
            sa.phone AS "subAgentPhone", sa.email AS "subAgentEmail",
            cl.name AS "clientName", cl."taxNumber" AS "clientVat",
            s.name AS "seasonName"
       FROM umrah_sales_invoices si
       LEFT JOIN umrah_sub_agents sa ON sa.id = si."subAgentId" AND sa."companyId" = $2
       LEFT JOIN clients cl ON cl.id = si."clientId"
       LEFT JOIN umrah_seasons s ON s.id = si."seasonId" AND s."companyId" = $2
      WHERE si.id = $1 AND si."companyId" = $2 AND si."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!invoice) return { entity: { id } };
  const items = await rawQuery<Record<string, unknown>>(
    `SELECT id, "itemType", "groupId", "violationId", description,
            quantity, "unitPrice", "lineTotal"
       FROM umrah_sales_invoice_items
      WHERE "invoiceId" = $1
      ORDER BY id`,
    [id]
  ).catch(() => []);
  return { entity: invoice, items };
}

async function loadUmrahAgentInvoice(companyId: number, id: string) {
  const [invoice] = await rawQuery<Record<string, unknown>>(
    `SELECT ai.*,
            a.name AS "agentName", a.country AS "agentCountry",
            a."contactPerson" AS "agentContactPerson",
            a.phone AS "agentPhone", a.email AS "agentEmail",
            a.currency AS "agentCurrency",
            s.name AS "seasonName"
       FROM umrah_agent_invoices ai
       LEFT JOIN umrah_agents a ON a.id = ai."agentId" AND a."companyId" = $2
       LEFT JOIN umrah_seasons s ON s.id = ai."seasonId" AND s."companyId" = $2
      WHERE ai.id = $1 AND ai."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: invoice ?? { id } };
}

// U-14-P3 — Nusk invoice loader. The Nusk invoice is the
// PURCHASE-side document (what the Nusk system charges the agency
// for one group's services) — distinct from sales invoice (charged
// to the sub-agent) and agent invoice (charged to the main agent).
// Joins agent / sub-agent / group / season for the meta block.
async function loadUmrahNuskInvoice(companyId: number, id: string) {
  const [invoice] = await rawQuery<Record<string, unknown>>(
    `SELECT ni.*,
            a.name AS "agentName",
            sa.name AS "subAgentName",
            g.name AS "groupName",
            s.name AS "seasonName"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_agents a
         ON a.id = ni."agentId" AND a."companyId" = $2 AND a."deletedAt" IS NULL
       LEFT JOIN umrah_sub_agents sa
         ON sa.id = ni."subAgentId" AND sa."companyId" = $2 AND sa."deletedAt" IS NULL
       LEFT JOIN umrah_groups g
         ON g.id = ni."groupId" AND g."companyId" = $2 AND g."deletedAt" IS NULL
       LEFT JOIN umrah_seasons s
         ON s.id = g."seasonId" AND s."companyId" = $2 AND s."deletedAt" IS NULL
      WHERE ni.id = $1 AND ni."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: invoice ?? { id } };
}

// U-14-P3 — umrah commission plan loader. Reads the plan + its
// tiers list + joined employee + season for the printed contract /
// signature copy. Pure SELECT; tenant-scoped.
async function loadUmrahCommissionPlan(companyId: number, id: string) {
  const [plan] = await rawQuery<Record<string, unknown>>(
    `SELECT cp.*,
            e.name AS "employeeName",
            s.name AS "seasonName"
       FROM employee_commission_plans cp
       LEFT JOIN employees e
         ON e.id = cp."employeeId" AND e."companyId" = $2 AND e."deletedAt" IS NULL
       LEFT JOIN umrah_seasons s
         ON s.id = cp."seasonId" AND s."companyId" = $2 AND s."deletedAt" IS NULL
      WHERE cp.id = $1 AND cp."companyId" = $2 AND cp."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!plan) return { entity: { id } };
  const tiers = await rawQuery<Record<string, unknown>>(
    `SELECT "tierOrder", "fromCount", "toCount", "bonusPerUnit", "isCumulative"
       FROM employee_commission_tiers
      WHERE "planId" = $1 AND "deletedAt" IS NULL
      ORDER BY "tierOrder" ASC`,
    [id],
  ).catch(() => []);
  return { entity: plan, tiers };
}

// U-14-P3 — umrah commission calculation (monthly slip).
// Joins the plan + employee + season so the receipt carries the
// human-readable context for one month's calculation result. Pure
// SELECT; tenant-scoped.
async function loadUmrahCommissionCalculation(companyId: number, id: string) {
  const [calc] = await rawQuery<Record<string, unknown>>(
    `SELECT cc.*,
            cp."planName",
            cp."commissionType",
            cp."percentageRate",
            cp."fixedAmount",
            cp."baseSalary",
            e.name AS "employeeName",
            s.name AS "seasonName"
       FROM employee_commission_calculations cc
       LEFT JOIN employee_commission_plans cp
         ON cp.id = cc."planId" AND cp."companyId" = $2 AND cp."deletedAt" IS NULL
       LEFT JOIN employees e
         ON e.id = cc."employeeId" AND e."companyId" = $2 AND e."deletedAt" IS NULL
       LEFT JOIN umrah_seasons s
         ON s.id = cp."seasonId" AND s."companyId" = $2 AND s."deletedAt" IS NULL
      WHERE cc.id = $1 AND cc."companyId" = $2 AND cc."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: calc ?? { id } };
}

async function loadUmrahPenalty(companyId: number, id: string) {
  const [penalty] = await rawQuery<Record<string, unknown>>(
    `SELECT pn.*,
            p."fullName" AS "pilgrimName", p."passportNumber",
            p.nationality, p."nuskNumber",
            a.name AS "agentName", a.country AS "agentCountry",
            s.name AS "seasonName"
       FROM umrah_penalties pn
       LEFT JOIN umrah_pilgrims p ON p.id = pn."pilgrimId" AND p."companyId" = $2
       LEFT JOIN umrah_agents a ON a.id = pn."agentId" AND a."companyId" = $2
       LEFT JOIN umrah_seasons s ON s.id = pn."seasonId" AND s."companyId" = $2
      WHERE pn.id = $1 AND pn."companyId" = $2
      LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  return { entity: penalty ?? { id } };
}

// Like loadUmrahPenalty above, but for the umrah_violations table — the
// closing-sweep preset references FK columns (mutamerId, agentId, etc.)
// and without these joins the printed doc shows bare numeric IDs. Joining
// pilgrim/sub-agent/agent/group/invoice surfaces the human-readable names.
async function loadUmrahViolation(companyId: number, id: string) {
  const [violation] = await rawQuery<Record<string, unknown>>(
    `SELECT v.*,
            p."fullName" AS "pilgrimName", p."passportNumber" AS "pilgrimPassport",
            p."nuskNumber" AS "pilgrimNuskNumber",
            sa.name AS "subAgentName", sa."nuskCode" AS "subAgentNuskCode",
            a.name AS "agentName", a."nuskAgentNumber" AS "agentNuskNumber",
            g.name AS "groupName",
            inv.ref AS "linkedInvoiceRef"
       FROM umrah_violations v
       LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId" AND p."companyId" = $2
       LEFT JOIN umrah_sub_agents sa ON sa.id = v."subAgentId" AND sa."companyId" = $2
       LEFT JOIN umrah_agents a ON a.id = v."agentId" AND a."companyId" = $2
       LEFT JOIN umrah_groups g ON g.id = v."groupId" AND g."companyId" = $2
       LEFT JOIN umrah_sales_invoices inv ON inv.id = v."linkedInvoiceId" AND inv."companyId" = $2
      WHERE v.id = $1 AND v."companyId" = $2 AND v."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId],
  ).catch(() => [null]);
  return { entity: violation ?? { id } };
}

// Joins season + vehicle + driver so the umrah_transport preset renders
// readable names instead of "#42 / #7". Same pattern as loadFleetTrip.
async function loadUmrahTransportTrip(companyId: number, id: string) {
  const [trip] = await rawQuery<Record<string, unknown>>(
    `SELECT t.*,
            s.name AS "seasonName",
            v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel",
            d.name AS "driverName", d."licenseNumber" AS "driverLicense"
       FROM umrah_transport t
       LEFT JOIN umrah_seasons s ON s.id = t."seasonId" AND s."companyId" = $2
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."companyId" = $2
       LEFT JOIN fleet_drivers d ON d.id = t."driverId" AND d."companyId" = $2
      WHERE t.id = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId],
  ).catch(() => [null]);
  return { entity: trip ?? { id } };
}

// Surface season name on the package card — the preset uses #{{entity.seasonId}}
// as fallback, but seeing the season's Arabic name is far more useful for the
// operator printing the brochure.
async function loadUmrahPackage(companyId: number, id: string) {
  const [pkg] = await rawQuery<Record<string, unknown>>(
    `SELECT p.*, s.name AS "seasonName"
       FROM umrah_packages p
       LEFT JOIN umrah_seasons s ON s.id = p."seasonId" AND s."companyId" = $2
      WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId],
  ).catch(() => [null]);
  return { entity: pkg ?? { id } };
}

// ─── Master cards + transactions with JOINs (from main) ─────────────────
// Each loader fetches the canonical row and JOINs the related lookups the
// preset references (clientName, branchName, etc.) so {{entity.xxx}}
// tokens render real values instead of empty placeholders.

async function loadVendorCard(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT s.*, COALESCE(s."paymentTerms"::text, '-') AS "paymentTerms"
     FROM suppliers s
     WHERE s.id = $1 AND s."companyId" = $2 AND s."deletedAt" IS NULL LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadBuildingCard(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT b.*, e.name AS "managerName",
            b.address AS "fullAddress",
            b."totalUnits" AS "unitsCount"
     FROM property_buildings b
     LEFT JOIN employees e ON e.id = b."managerId"
     WHERE b.id = $1 AND b."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadProjectCard(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT p.*, c.name AS "clientName", e.name AS "managerName",
            br.name AS "branchName"
     FROM projects p
     LEFT JOIN clients c ON c.id = p."clientId"
     LEFT JOIN employees e ON e.id = p."managerId"
     LEFT JOIN branches br ON br.id = p."branchId"
     WHERE p.id = $1 AND p."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

/** Project statement / مستخلص المشروع — the project header plus its financial
 *  position (budget vs. actual cost vs. billed-to-client vs. remaining) and a
 *  line-by-line cost breakdown. Read-only over existing projects tables — no
 *  finance writes; this is a print view of what the project routes already
 *  recorded (project_costs, project_boq_items). Powers the `project_statement`
 *  bespoke print preset (templateResolver.ts). */
async function loadProjectStatement(companyId: number, id: string) {
  const [project] = await rawQuery<Record<string, unknown>>(
    `SELECT p.*, c.name AS "clientName", e.name AS "managerName",
            br.name AS "branchName"
     FROM projects p
     LEFT JOIN clients c ON c.id = p."clientId"
     LEFT JOIN employees e ON e.id = p."managerId"
     LEFT JOIN branches br ON br.id = p."branchId"
     WHERE p.id = $1 AND p."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  if (!project) return { entity: { id } };

  const costs = await rawQuery<Record<string, unknown>>(
    `SELECT "costDate", category, description, amount
       FROM project_costs
      WHERE "projectId" = $1 AND "companyId" = $2
      ORDER BY "costDate" ASC, id ASC`,
    [id, companyId],
  );
  const [agg] = await rawQuery<Record<string, unknown>>(
    `SELECT
        COALESCE((SELECT SUM(amount) FROM project_costs
                   WHERE "projectId" = $1 AND "companyId" = $2), 0)  AS "totalCosts",
        COALESCE((SELECT SUM("lineTotal") FROM project_boq_items
                   WHERE "projectId" = $1 AND "companyId" = $2
                     AND status = 'billed'), 0)                      AS "totalBilled"`,
    [id, companyId],
  );
  const budget = Number(project.budget || 0);
  const totalCosts = Number(agg?.totalCosts || 0);
  const totalBilled = Number(agg?.totalBilled || 0);
  const remaining = Math.round((budget - totalCosts) * 100) / 100;

  return {
    entity: { ...project, budget, totalCosts, totalBilled, remaining },
    costs,
  };
}

async function loadStoreOrder(companyId: number, id: string) {
  const [header] = await rawQuery<Record<string, unknown>>(
    `SELECT so.*,
            c.name AS "customerName",
            c.phone AS "customerPhone",
            c.email AS "customerEmail"
     FROM store_orders so
     LEFT JOIN clients c ON c.id = so."clientId"
     WHERE so.id = $1 AND so."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  if (!header) return { entity: { id } };
  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT sol.*, wp.name AS "productName", wp.sku
     FROM store_order_lines sol
     LEFT JOIN warehouse_products wp ON wp.id = sol."productId"
     WHERE sol."orderId" = $1 ORDER BY sol.id`,
    [id],
  ).catch((err) => {
    if ((err as { code?: string })?.code === "42P01") return [];
    throw err;
  });
  return { entity: header, items: lines };
}

async function loadCrmOpportunity(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT co.*, c.name AS "clientName", e.name AS "assigneeName",
            co.value AS "expectedValue",
            co."expectedCloseDate" AS "closeDate"
     FROM crm_opportunities co
     LEFT JOIN clients c ON c.id = co."clientId"
     LEFT JOIN employees e ON e.id = co."assignedTo"
     WHERE co.id = $1 AND co."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadSupportTicket(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT st.*,
            st.id::text AS "ticketNumber",
            er.name AS "reporterName",
            ag.name AS "assigneeName"
     FROM support_tickets st
     LEFT JOIN users er ON er.id = st."reporterId"
     LEFT JOIN users ag ON ag.id = st."assigneeId"
     WHERE st.id = $1 AND st."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

// Note: removed main's loadUmrahPilgrim — superseded by the richer
// version above (adds packageName + safer companyId scoping on JOINs).
// Removed main's loadUmrahInvoice — referenced umrah_sales_invoices.pilgrimId
// (column does not exist in schema_pre.sql) and umrah_pilgrims.name (the
// column is fullName). The local loadUmrahSalesInvoice above replaces it
// and the dispatchLoad switch routes both umrah_invoice and
// umrah_sales_invoice to the working implementation.

async function loadSalaryAdvance(companyId: number, id: string) {
  // salary_advance reuses hr_employee_loans (type='advance' typically).
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT l.*,
            l."installmentAmount" AS "monthlyInstallment",
            l."installmentCount", l.amount,
            e.name AS "employeeName", e."empNumber",
            e.salary AS "baseSalary"
     FROM hr_employee_loans l
     LEFT JOIN employees e ON e.id = l."employeeId"
     WHERE l.id = $1 AND l."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  if (!row) return { entity: { id } };
  const employee = {
    name: row.employeeName,
    empNumber: row.empNumber,
    baseSalary: row.baseSalary,
  };
  return { entity: row, employee };
}

async function loadTrainingProgram(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT tp.*,
            tp."totalHours", tp."startDate", tp."endDate"
     FROM training_programs tp
     WHERE tp.id = $1 AND tp."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadWarehouseProductCard(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT wp.*,
            wc.name AS "categoryName",
            wp."costPrice", wp."sellPrice" AS price,
            wp.sku AS barcode,
            b.name AS "warehouseName",
            wp.status
     FROM warehouse_products wp
     LEFT JOIN warehouse_categories wc ON wc.id = wp."categoryId"
     LEFT JOIN branches b ON b.id = wp."branchId"
     WHERE wp.id = $1 AND wp."companyId" = $2 AND wp."deletedAt" IS NULL LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadGovernancePolicy(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT gp.*, u1.name AS "ownerName", u2.name AS "approvedByName"
     FROM governance_policies gp
     LEFT JOIN users u1 ON u1.id = gp."ownerId"
     LEFT JOIN users u2 ON u2.id = gp."approvedBy"
     WHERE gp.id = $1 AND gp."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadBudgetCard(companyId: number, id: string) {
  const [header] = await rawQuery<Record<string, unknown>>(
    `SELECT b.*, cc.name AS "costCenterName",
            u1.name AS "ownerName",
            b.amount AS "totalBudget"
     FROM budgets b
     LEFT JOIN cost_centers cc ON cc.id = b."costCenterId"
     LEFT JOIN users u1 ON u1.id = b."ownerId"
     WHERE b.id = $1 AND b."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  if (!header) return { entity: { id } };
  const totalBudget = Number(header.totalBudget ?? 0);
  // Lookup consumed from journal_lines if a cost center is set.
  let consumed = 0;
  if (header.costCenterId) {
    const [r] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::float8 AS spent
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL
       WHERE jl."costCenterId" = $2`,
      [companyId, header.costCenterId],
    ).catch(() => [{ spent: 0 }]);
    consumed = Number(r?.spent ?? 0);
  }
  return {
    entity: { ...header, consumed, remaining: totalBudget - consumed },
  };
}

async function loadShiftCard(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT s.*,
            s."totalHours",
            s."lateGraceMinutes",
            br.name AS "branchName"
     FROM shifts s
     LEFT JOIN branches br ON br.id = s."branchId"
     WHERE s.id = $1 AND s."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

// Custody is modeled as journal_entries with ref starting "CUSTODY" (the
// custody assignment) and "CUSTODY-SETTLE" (the partial/full settlement).
// The custody preset needs the originating JE plus the running total of
// settlements plus the holder's employee record. The route handler
// /api/finance/custodies/:id (finance-custodies.ts) does the same joins;
// we mirror its query here so prints stay in sync with the detail page.
async function loadCustody(companyId: number, id: string) {
  const [c] = await rawQuery<Record<string, unknown>>(
    `SELECT je.id, je.ref, je.description,
            je.notes AS purpose,
            je."createdAt",
            je.status,
            COALESCE(SUM(jl.debit), 0)::float8 AS amount,
            je."dueDate" AS "expectedReturnDate",
            ea."employeeId" AS "employeeId"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
      WHERE je.id = $1
        AND je."companyId" = $2
        AND je."deletedAt" IS NULL
        AND je.ref LIKE 'CUSTODY%'
        AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
      GROUP BY je.id, je.ref, je.description, je.notes, je."createdAt", je.status, je."dueDate", ea."employeeId"
      LIMIT 1`,
    [id, companyId],
  ).catch(() => [null]);
  if (!c) return { entity: { id } };

  const [settle] = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM(jl.credit), 0)::float8 AS amt
       FROM journal_entries je2
       JOIN journal_lines jl ON jl."journalId" = je2.id AND jl.credit > 0
      WHERE je2."companyId" = $1
        AND je2."deletedAt" IS NULL
        AND je2.ref LIKE 'CUSTODY-SETTLE%'
        AND je2.description = $2`,
    [companyId, c.ref],
  ).catch(() => [{ amt: 0 }]);

  const settledAmount = Number(settle?.amt ?? 0);
  const remainingAmount = Math.max(0, Number(c.amount) - settledAmount);

  const employee = c.employeeId
    ? (await rawQuery<Record<string, unknown>>(
        `SELECT id, name, "empNumber" FROM employees WHERE id = $1`,
        [c.employeeId],
      ))[0]
    : null;

  return {
    entity: {
      ...c,
      settledAmount,
      remainingAmount,
    },
    employee,
  };
}

async function loadUmrahSeason(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT s.*,
            (SELECT COUNT(*) FROM umrah_agents WHERE "seasonId" = s.id) AS "agentCount",
            (SELECT COUNT(*) FROM umrah_pilgrims WHERE "seasonId" = s.id) AS "expectedPilgrims"
     FROM umrah_seasons s
     WHERE s.id = $1 AND s."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}

async function loadChartOfAccount(companyId: number, id: string) {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT coa.*,
            (SELECT name FROM chart_of_accounts WHERE code = coa."parentCode" AND "companyId" = $2 LIMIT 1) AS "parentName",
            coa."currentBalance"
     FROM chart_of_accounts coa
     WHERE coa.id = $1 AND coa."companyId" = $2 LIMIT 1`,
    [id, companyId],
  );
  return { entity: row ?? { id } };
}
