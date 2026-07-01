/**
 * recordOwnership — one canonical answer to "did this person create this
 * record?", regardless of which identity a table's `createdBy` column stores.
 *
 * Why this exists: `createdBy` is NOT uniform across the schema. Foreign keys
 * pin it to two different parents, and the no-FK columns follow code
 * convention:
 *
 *   • FK → users               → column holds a USER id      (scope.userId)
 *   • FK → employee_assignments→ column holds an ASSIGNMENT id (scope.activeAssignmentId)
 *   • no FK                     → finance/core code writes the ASSIGNMENT id,
 *                                 but a few writers store the user id, so we
 *                                 accept EITHER identity (best-effort).
 *
 * Security layers (SoD self-approval, `self` scope) must not hard-code the
 * assumption that `createdBy === userId`; on the FK→employee_assignments and
 * no-FK finance tables that comparison can never match, silently disabling
 * the check. Route every ownership decision through `isOwnRecord()` instead.
 *
 * The map below is derived from the live FK graph (information_schema /
 * pg_constraint). A table absent from the map defaults to "either", which is
 * the safe behaviour for a block-only check like SoD.
 */

export type CreatedByIdentity = "user" | "assignment" | "either";

// createdBy columns whose FK fixes the identity. Derived from pg_constraint
// (contype='f', conkey → createdBy). Keep in sync if a migration adds/removes
// a createdBy FK — covered by createdByIdentity.test.ts against the schema.
export const CREATED_BY_IDENTITY: Record<string, CreatedByIdentity> = {
  // FK → users (must hold a user id)
  budgets: "user",
  credit_memos: "user",
  customer_advances: "user",
  debit_memos: "user",
  employee_of_month: "user",
  hr_violations: "user",
  maps_usage_thresholds: "user",
  marketing_campaigns: "user",
  payment_runs: "user",
  property_sales: "user",
  public_announcements: "user",
  umrah_agent_invoices: "user",
  umrah_import_batches: "user",
  umrah_import_logs: "user",
  umrah_packages: "user",
  umrah_penalties: "user",
  umrah_transport: "user",
  vrp_optimization_runs: "user",
  whatsapp_templates: "user",
  // FK → employee_assignments (must hold an assignment id)
  bank_guarantees: "assignment",
  intercompany_transactions: "assignment",
};

export interface OwnerIdentity {
  /** scope.userId — the stable person identity. */
  userId: number;
  /** All of the user's employee_assignment ids (scope.allowedAssignments). */
  assignmentIds: number[];
}

/**
 * Resolve how a table's `createdBy` should be interpreted. Unknown tables
 * (including the no-FK finance core) resolve to "either".
 */
export function createdByIdentity(table: string | null | undefined): CreatedByIdentity {
  if (!table) return "either";
  return CREATED_BY_IDENTITY[table] ?? "either";
}

/**
 * Did `identity` create the record, given the table's `createdBy` value?
 * Compares against the correct identity space for the table:
 *   - "user"       → createdBy === userId
 *   - "assignment" → createdBy ∈ the user's assignment ids
 *   - "either"     → match in either space (no-FK tables; best-effort)
 */
export function isOwnRecord(
  table: string | null | undefined,
  createdBy: number | null | undefined,
  identity: OwnerIdentity,
): boolean {
  if (createdBy == null) return false;
  const kind = createdByIdentity(table);
  const byUser = createdBy === identity.userId;
  const byAssignment = identity.assignmentIds.includes(createdBy);
  if (kind === "user") return byUser;
  if (kind === "assignment") return byAssignment;
  return byUser || byAssignment;
}
