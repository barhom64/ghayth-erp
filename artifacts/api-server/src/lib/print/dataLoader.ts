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
  } catch {
    // table may not have companyId, retry without
  }
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function loadEntityData(args: LoaderArgs): Promise<Record<string, unknown>> {
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
    case "payslip":
      return await loadPayslip(companyId, entityId);
    case "official_letter":
      return await loadOfficialLetter(companyId, entityId);
    case "employee_contract":
      return await loadEmployeeContract(companyId, entityId);
    default:
      if (profile?.table) {
        const raw = await loadByTable(profile.table, entityId, companyId);
        return raw ? { entity: raw } : { entity: { id: entityId } };
      }
      return { entity: { id: entityId } };
  }
}

// ─── Focused loaders ────────────────────────────────────────────────────────
// Each loader returns the shape consumed by the seeded preset templates.

async function loadInvoice(companyId: number, id: string) {
  const [invoice] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM invoices WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  );
  if (!invoice) return { entity: { id } };
  const items = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM invoice_items WHERE "invoiceId" = $1`,
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
  return await loadGeneric("credit_notes", id, companyId);
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
  const items = await rawQuery(`SELECT * FROM purchase_order_items WHERE "poId" = $1`, [id]).catch(() => []);
  const vendor = po.vendorId
    ? (await rawQuery(`SELECT id, name FROM vendors WHERE id = $1`, [po.vendorId]))[0]
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
    `SELECT * FROM gl_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
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
    `SELECT * FROM hr_loans WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
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
  const [ps] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM payroll_slips WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [id, companyId]
  ).catch(() => [null]);
  if (!ps) return { entity: { id } };
  const employee = ps.employeeId
    ? (await rawQuery(`SELECT id, name, "empNumber" FROM employees WHERE id = $1`, [ps.employeeId]))[0]
    : null;
  return { entity: ps, employee };
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
