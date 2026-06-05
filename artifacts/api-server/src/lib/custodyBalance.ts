// Custody outstanding-balance computation, extracted from the
// identical WITH advanced/settled CTE that previously lived in 5
// places (finance-custodies.ts ×3, employees.ts ×1, fleet.ts ×1).
// Each copy was the same logic; consolidating here keeps the
// CUSTODY-ref convention as a single source of truth and prevents
// future drift when (say) the settlement ref format changes.
//
// The math: an open custody is a journal entry whose ref starts with
// "CUSTODY" but NOT "CUSTODY-SETTLE". Its debit total is the amount
// advanced. Settlements (ref "CUSTODY-SETTLE-…") put the original
// custody's ref into their `description` and credit it back. The
// outstanding amount per custody is GREATEST(advanced − settled, 0)
// — clamped to zero so a partial over-settlement doesn't go
// negative on the rollup.

import { rawQuery } from "./rawdb.js";

export interface CustodyBalance {
  outstanding: number;
  openCount: number;
}

interface BalanceRow {
  outstanding: string;
  openCount: string;
}

const ZERO: CustodyBalance = { outstanding: 0, openCount: 0 };

function toBalance(row: BalanceRow | undefined): CustodyBalance {
  if (!row) return ZERO;
  return {
    outstanding: Number(row.outstanding ?? 0),
    openCount: Number(row.openCount ?? 0),
  };
}

// Outstanding custody for a single employee. Uses journal_lines.employeeId
// as the dimension — matches the canonical posting in finance-custodies.
export async function getEmployeeCustodyBalance(
  companyId: number,
  employeeId: number,
): Promise<CustodyBalance> {
  const [row] = await rawQuery<BalanceRow>(
    `WITH advanced AS (
       SELECT je.id, je.ref, COALESCE(SUM(jl.debit), 0) AS amount
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
          AND jl."employeeId" = $2
        GROUP BY je.id, je.ref
     ),
     settled AS (
       SELECT je2.description AS "originalRef", COALESCE(SUM(jl2.credit), 0) AS settled_amount
         FROM journal_entries je2
         JOIN journal_lines jl2 ON jl2."journalId" = je2.id AND jl2.credit > 0
        WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL
          AND je2."balancesApplied" = true
          AND je2.ref LIKE 'CUSTODY-SETTLE%'
        GROUP BY je2.description
     )
     SELECT COALESCE(SUM(GREATEST(a.amount - COALESCE(s.settled_amount, 0), 0)), 0)::text AS outstanding,
            COUNT(*) FILTER (WHERE a.amount > COALESCE(s.settled_amount, 0))::text AS "openCount"
       FROM advanced a
       LEFT JOIN settled s ON s."originalRef" = a.ref`,
    [companyId, employeeId]
  ).catch(() => [] as BalanceRow[]);
  return toBalance(row);
}

// Outstanding custody for a driver. Folds in both the driver
// dimension (jl.driverId) AND the linked employee's custody so a
// custody given against either side rolls up correctly. linkedEmployeeId
// may be null when the driver isn't bound to an HR employee yet.
export async function getDriverCustodyBalance(
  companyId: number,
  driverId: number,
  linkedEmployeeId: number | null,
): Promise<CustodyBalance> {
  const [row] = await rawQuery<BalanceRow>(
    `WITH advanced AS (
       SELECT je.id, je.ref, COALESCE(SUM(jl.debit), 0) AS amount
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
          AND (jl."driverId" = $2 OR ($3::int IS NOT NULL AND jl."employeeId" = $3))
        GROUP BY je.id, je.ref
     ),
     settled AS (
       SELECT je2.description AS "originalRef", COALESCE(SUM(jl2.credit), 0) AS settled_amount
         FROM journal_entries je2
         JOIN journal_lines jl2 ON jl2."journalId" = je2.id AND jl2.credit > 0
        WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL
          AND je2."balancesApplied" = true
          AND je2.ref LIKE 'CUSTODY-SETTLE%'
        GROUP BY je2.description
     )
     SELECT COALESCE(SUM(GREATEST(a.amount - COALESCE(s.settled_amount, 0), 0)), 0)::text AS outstanding,
            COUNT(*) FILTER (WHERE a.amount > COALESCE(s.settled_amount, 0))::text AS "openCount"
       FROM advanced a
       LEFT JOIN settled s ON s."originalRef" = a.ref`,
    [companyId, driverId, linkedEmployeeId]
  ).catch(() => [] as BalanceRow[]);
  return toBalance(row);
}
