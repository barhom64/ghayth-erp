import { rawQuery } from "./rawdb.js";

export interface EmployeeAssignmentSummary {
  id: number;
  title: string | null;
  role: string | null;
  branchId: number | null;
  status: string;
}

export async function listActiveEmployeeAssignments(
  employeeId: number,
  companyId: number,
  limit = 50,
): Promise<EmployeeAssignmentSummary[]> {
  return rawQuery<EmployeeAssignmentSummary>(
    `SELECT ea.id, ea."jobTitle" AS title, ea.role, ea."branchId", ea.status
     FROM employee_assignments ea
     WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active'
     ORDER BY ea.id DESC LIMIT $3`,
    [employeeId, companyId, limit],
  );
}
