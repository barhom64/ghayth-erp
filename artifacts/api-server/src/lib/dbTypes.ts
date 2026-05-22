// dbTypes.ts
// ---------------------------------------------------------------------------
// Typed Row aliases for `rawQuery<Row>` calls.
//
// Rationale: the api-server uses raw SQL via the pg pool (see rawdb.ts) for
// performance and explicit query control. Drizzle is used for the shared
// schema definitions only — we don't run the ORM at request time. That
// means rawQuery<T> needs explicit T arguments. Until 2026-05 most route
// files passed `<any>` because typing each row by hand was cheaper.
//
// This file uses Drizzle's `InferSelectModel<Table>` to derive Row types
// directly from the schema declarations in @workspace/db. As a result:
//
//   1. Row shapes stay in sync with migrations automatically — when a
//      column is added to the schema, every query that selects `*` is
//      already typed correctly.
//   2. Per-query projections (specific columns) get the obvious narrowing
//      via `Pick<ClientRow, "id" | "name" | "phone">`.
//   3. JOIN results that mix columns from multiple tables get a small
//      manual interface OR a `ClientRow & EmployeeRow` intersection.
//
// Migration pattern in routes/*.ts:
//
//   // before
//   const rows = await rawQuery<Record<string, unknown>>(`SELECT id, name, phone FROM clients ...`, [...]);
//
//   // after
//   import type { ClientRow } from "../lib/dbTypes.js";
//   type ClientListRow = Pick<ClientRow, "id" | "name" | "phone">;
//   const rows = await rawQuery<ClientListRow>(`SELECT id, name, phone FROM clients ...`, [...]);
//
// New tables: add a `pgTable(...)` to lib/db/src/schema/index.ts, then
// export an alias here. Don't redefine columns by hand — keep one source
// of truth.

import type { InferSelectModel } from "drizzle-orm";
import type {
  companies,
  branches,
  employees,
  employeeAssignments,
  attendance,
  hrLeaveTypes,
  hrLeaveRequests,
  hrLeaveBalances,
  journalEntries,
  journalLines,
  chartOfAccounts,
  budgets,
  purchaseRequests,
  purchaseOrders,
  suppliers,
  clients,
  invoices,
  payrollRuns,
  payrollLines,
  employeeViolations,
  approvalChains,
  approvalChainSteps,
  eventDlq,
} from "@workspace/db/schema";

// ---- Core multi-tenant ------------------------------------------------------
export type CompanyRow = InferSelectModel<typeof companies>;
export type BranchRow = InferSelectModel<typeof branches>;

// ---- HR ---------------------------------------------------------------------
export type EmployeeRow = InferSelectModel<typeof employees>;
export type EmployeeAssignmentRow = InferSelectModel<typeof employeeAssignments>;
export type AttendanceRow = InferSelectModel<typeof attendance>;
export type HrLeaveTypeRow = InferSelectModel<typeof hrLeaveTypes>;
export type HrLeaveRequestRow = InferSelectModel<typeof hrLeaveRequests>;
export type HrLeaveBalanceRow = InferSelectModel<typeof hrLeaveBalances>;
export type PayrollRunRow = InferSelectModel<typeof payrollRuns>;
export type PayrollLineRow = InferSelectModel<typeof payrollLines>;
export type EmployeeViolationRow = InferSelectModel<typeof employeeViolations>;

// ---- Finance ----------------------------------------------------------------
export type JournalEntryRow = InferSelectModel<typeof journalEntries>;
export type JournalLineRow = InferSelectModel<typeof journalLines>;
export type ChartOfAccountRow = InferSelectModel<typeof chartOfAccounts>;
export type BudgetRow = InferSelectModel<typeof budgets>;
export type PurchaseRequestRow = InferSelectModel<typeof purchaseRequests>;
export type PurchaseOrderRow = InferSelectModel<typeof purchaseOrders>;
export type SupplierRow = InferSelectModel<typeof suppliers>;
export type InvoiceRow = InferSelectModel<typeof invoices>;

// ---- CRM --------------------------------------------------------------------
// The Drizzle definition for `clients` was authored early and only covers
// the ORM-driven columns. The live DB has many more columns added through
// migrations (classification, source, language, nationality, isBlacklisted,
// totalRevenue, attachments, ...). Until the Drizzle schema is reconciled
// with the migration history, we extend `InferSelectModel` with the extra
// fields by hand. Source of truth: db/schema.sql `CREATE TABLE clients`.
export type ClientRow = InferSelectModel<typeof clients> & {
  code?: string | null;
  type?: "individual" | "company" | "government" | string | null;
  classification?: string | null;
  source?: string | null;
  notes?: string | null;
  nationality?: string | null;
  language?: string | null;
  branchId?: number | null;
  assignedTo?: number | null;
  isBlacklisted?: boolean | null;
  totalRevenue?: number | string | null;
  expectedRevenue?: number | string | null;
  avgRating?: number | string | null;
  tags?: unknown;
  lat?: number | string | null;
  lon?: number | string | null;
  lastActivityAt?: string | null;
  lastPaymentAt?: string | null;
  attachments?: unknown;
};

// ---- Workflow / approvals ---------------------------------------------------
export type ApprovalChainRow = InferSelectModel<typeof approvalChains>;
export type ApprovalChainStepRow = InferSelectModel<typeof approvalChainSteps>;

// ---- Event bus --------------------------------------------------------------
export type EventDlqRow = InferSelectModel<typeof eventDlq>;

// ---- Shared shapes ----------------------------------------------------------

/**
 * Result shape for `INSERT ... RETURNING id` style write-then-read patterns.
 * Use when the only thing you need from the response is the new id.
 */
export interface InsertedIdRow {
  id: number;
}

/**
 * Result shape for `SELECT COUNT(*) ...` queries. Postgres returns count as
 * a string (BIGINT) when not cast — `::int` casts it to a number.
 */
export interface CountRow {
  count: number;
}

/**
 * Aggregated `{ total: ... }` shape used by paginated list endpoints.
 */
export interface TotalRow {
  total: number;
}

/**
 * "Resolves to truthy" probe — used after `SELECT 1 FROM ... WHERE ...`.
 * The value of the column doesn't matter, only its presence.
 */
export interface ExistsRow {
  exists?: 1 | true;
}
