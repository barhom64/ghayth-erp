/**
 * selfApprovalCreators — resolves "who created this request" for the
 * self-approval (maker-checker) guard in the HR approval-decision endpoint.
 *
 * Background: the previous inline map named non-existent tables/columns for
 * 5 of 6 request types (e.g. `salary_advances`, `custodies`, and
 * `*.createdByAssignmentId` on tables that store a plain `employeeId` or
 * `createdBy`). Every lookup threw 42703/42P01, the error was swallowed,
 * and `requesterId` came back undefined — so the "you cannot approve your
 * own request" check was silently skipped for those types.
 *
 * The canonical notion of "your own request" is the *same employee*. The
 * `refId` carried by an approval differs per type (it is whatever id the
 * chain was started with), so each resolver below maps that id to the
 * creator's employee id (and, where available, their assignment id):
 *
 *   refType         refId points at            creator column
 *   ──────────────  ─────────────────────────  ─────────────────────────
 *   leave_request   hr_leave_requests.id       "employeeId" (employee id)
 *   purchase_order  purchase_orders.id         "createdBy"  (assignment id)
 *   expense         journal_entries.id         "createdBy"  (assignment id)
 *   salary_advance  journal_entries.id         "createdBy"  (assignment id)
 *   custody         journal_entries.id         "createdBy"  (assignment id)
 *   official_letter official_letters.id        "createdByAssignmentId"
 *
 * All queries are tenant-scoped (companyId) for defence in depth.
 */

import { rawQuery } from "../rawdb.js";
import { ForbiddenError } from "../errorHandler.js";

export interface RequesterIdentity {
  /** Creator's employee id — the canonical "same person" key. */
  employeeId: number | null;
  /** Creator's employee_assignment id, when the source stores one. */
  assignmentId: number | null;
}

// Each SQL takes [refId, companyId] and returns at most one row with
// "employeeId" and "assignmentId". Assignment-backed sources join
// employee_assignments to also surface the creator's employee id.
export const SELF_APPROVAL_CREATOR_SQL: Record<string, string> = {
  leave_request:
    `SELECT "employeeId" AS "employeeId", NULL::int AS "assignmentId"
       FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
  purchase_order:
    `SELECT ea."employeeId" AS "employeeId", ea.id AS "assignmentId"
       FROM purchase_orders t JOIN employee_assignments ea ON ea.id = t."createdBy"
      WHERE t.id = $1 AND t."companyId" = $2 LIMIT 1`,
  expense:
    `SELECT ea."employeeId" AS "employeeId", ea.id AS "assignmentId"
       FROM journal_entries t JOIN employee_assignments ea ON ea.id = t."createdBy"
      WHERE t.id = $1 AND t."companyId" = $2 LIMIT 1`,
  salary_advance:
    `SELECT ea."employeeId" AS "employeeId", ea.id AS "assignmentId"
       FROM journal_entries t JOIN employee_assignments ea ON ea.id = t."createdBy"
      WHERE t.id = $1 AND t."companyId" = $2 LIMIT 1`,
  custody:
    `SELECT ea."employeeId" AS "employeeId", ea.id AS "assignmentId"
       FROM journal_entries t JOIN employee_assignments ea ON ea.id = t."createdBy"
      WHERE t.id = $1 AND t."companyId" = $2 LIMIT 1`,
  official_letter:
    `SELECT ea."employeeId" AS "employeeId", ea.id AS "assignmentId"
       FROM official_letters t JOIN employee_assignments ea ON ea.id = t."createdByAssignmentId"
      WHERE t.id = $1 AND t."companyId" = $2 LIMIT 1`,
};

/**
 * Resolve the creator of an approval request. Returns null when the refType
 * isn't mapped or the record isn't found. Lookups that error (should not
 * happen now the SQL is correct) surface as null so the caller can decide —
 * but unlike before, a mapped-yet-missing creator no longer masks a typo.
 */
export async function resolveRequester(
  refType: string,
  refId: number,
  companyId: number,
): Promise<RequesterIdentity | null> {
  const sql = SELF_APPROVAL_CREATOR_SQL[refType];
  if (!sql) return null;
  const [row] = await rawQuery<{ employeeId: number | null; assignmentId: number | null }>(sql, [refId, companyId]);
  if (!row) return null;
  return {
    employeeId: row.employeeId ?? null,
    assignmentId: row.assignmentId ?? null,
  };
}

/**
 * Maker-checker guard: throws `ForbiddenError` if the approver is the same
 * employee who created the request. This is the SAME segregation-of-duties
 * rule the unified approval-chain endpoint enforces (routes/hr.ts) — lifted
 * into a shared helper so the finance-direct approval endpoints (custody /
 * expense / salary-advance) enforce it too, instead of letting a creator
 * self-approve their own already-posted entry via the direct path.
 *
 * Owners / non-employee approvers (null `approverEmployeeId`) are exempt,
 * matching the chain's `scope.employeeId != null` guard. A creator that can't
 * be resolved (null) does NOT block — fail-open here mirrors the chain, where
 * the unresolved case already falls through; the resolver map is pinned by
 * selfApprovalCreators.test.ts so a silent-skip regression is caught there.
 */
export async function assertNotSelfApproval(
  refType: string,
  refId: number,
  companyId: number,
  approverEmployeeId: number | null | undefined,
): Promise<void> {
  if (approverEmployeeId == null) return;
  const creator = await resolveRequester(refType, refId, companyId);
  if (creator?.employeeId != null && creator.employeeId === approverEmployeeId) {
    throw new ForbiddenError("لا يمكنك الموافقة على طلبك الخاص");
  }
}
