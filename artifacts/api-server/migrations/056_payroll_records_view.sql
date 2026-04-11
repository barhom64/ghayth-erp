-- Create payroll_records view combining payroll_runs + payroll_lines
-- Used by subsidiary ledger, finance reports, PDF/Excel exports
CREATE OR REPLACE VIEW payroll_records AS
SELECT
  pl.id,
  pl."runId",
  pl."assignmentId" AS "employeeAssignmentId",
  pr."companyId",
  pr."branchId",
  pr.period,
  pr.status,
  pl."basic",
  pl."grossSalary",
  pl."gosi",
  pl."lateDeduction",
  pl."netSalary",
  (COALESCE(pl."gosi", 0) + COALESCE(pl."lateDeduction", 0) + COALESCE(pl."absenceDeduction", 0) + COALESCE(pl."violationDeduction", 0) + COALESCE(pl."loanDeduction", 0)) AS "totalDeductions",
  pl."housingAllowance",
  pl."transportAllowance",
  pl."absenceDeduction",
  pl."violationDeduction",
  pl."loanDeduction",
  pl."overtime",
  pl."overtimeHours",
  pl."gosiEmployer",
  pl."employeeId",
  pr."createdAt",
  pl."deletedAt"
FROM payroll_lines pl
JOIN payroll_runs pr ON pr.id = pl."runId"
WHERE pl."deletedAt" IS NULL AND pr."deletedAt" IS NULL;
