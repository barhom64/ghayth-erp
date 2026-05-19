# Issue #664 Triage — Direct UPDATE Bypass Classification

Generated: 2026-05-19

> **Read-only.** Regenerate with
> `node audit/system-review/tooling/bypass-triage.mjs`. Classifies
> the **111 direct UPDATE bypasses** found by
> workflow-audit into the three buckets the owner specified.

## Classification rules

| Bucket | Signal | Fix path |
|---|---|---|
| **intentional** | bulk operation OR system-signal table (`pbx_calls`, `bank_statements`, etc.) | keep SQL + add `// bypass-ok` comment with rationale |
| **legacy** | single-row status flip on a non-lifecycle entity | migrate to applyTransition when touching the file for another reason |
| **dangerous** | entity IS in `STATE_MACHINES` AND the flip skips engine/audit/event | candidate for cluster-by-cluster fix PR |

## Headline

| Bucket | Count | % |
|---|---:|---:|
| intentional | **76** | 68% |
| legacy | **17** | 15% |
| dangerous | **18** | 16% |
| TOTAL | 111 | 100% |

## Per-file breakdown

| File | Total | 🔴 dangerous | 🟡 legacy | 🟢 intentional |
|---|---:|---:|---:|---:|
| `finance-invoices.ts` | 8 | **7** | 0 | 1 |
| `finance-journal.ts` | 5 | **5** | 0 | 0 |
| `hr.ts` | 25 | **1** | 1 | 23 |
| `employees.ts` | 11 | **1** | 0 | 10 |
| `properties.ts` | 3 | **1** | 1 | 1 |
| `umrah.ts` | 2 | **1** | 0 | 1 |
| `finance-custodies.ts` | 1 | **1** | 0 | 0 |
| `governance.ts` | 1 | **1** | 0 | 0 |
| `fleet.ts` | 12 | **0** | 11 | 1 |
| `hr-contracts.ts` | 5 | **0** | 0 | 5 |
| `hr-discipline.ts` | 5 | **0** | 0 | 5 |
| `finance-zatca.ts` | 3 | **0** | 0 | 3 |
| `hr-loans.ts` | 3 | **0** | 0 | 3 |
| `hr-overtime.ts` | 3 | **0** | 0 | 3 |
| `rbacV2.ts` | 3 | **0** | 0 | 3 |
| `communications.ts` | 2 | **0** | 0 | 2 |
| `finance-algorithms.ts` | 2 | **0** | 0 | 2 |
| `gov-integrations.ts` | 2 | **0** | 2 | 0 |
| `hr-exit.ts` | 2 | **0** | 0 | 2 |
| `obligations.ts` | 2 | **0** | 0 | 2 |
| `print.ts` | 2 | **0** | 0 | 2 |
| `projects.ts` | 2 | **0** | 1 | 1 |
| `admin.ts` | 1 | **0** | 0 | 1 |
| `correspondence.ts` | 1 | **0** | 0 | 1 |
| `documents.ts` | 1 | **0** | 0 | 1 |
| `finance-cost-centers.ts` | 1 | **0** | 0 | 1 |
| `recruitment.ts` | 1 | **0** | 0 | 1 |
| `settings.ts` | 1 | **0** | 1 | 0 |
| `umrah-entities.ts` | 1 | **0** | 0 | 1 |

## Per-table breakdown (status column)

| Table | In `STATE_MACHINES`? | Total | dangerous | legacy | intentional |
|---|---|---:|---:|---:|---:|
| `journal_entries` | ✅ YES | 8 | **7** | 0 | 1 |
| `invoices` | ✅ YES | 6 | **5** | 0 | 1 |
| `hr_leave_requests` | ✅ YES | 2 | **2** | 0 | 0 |
| `financial_periods` | ✅ YES | 1 | **1** | 0 | 0 |
| `governance_policies` | ✅ YES | 1 | **1** | 0 | 0 |
| `property_units` | ✅ YES | 1 | **1** | 0 | 0 |
| `umrah_penalties` | ✅ YES | 1 | **1** | 0 | 0 |
| `fleet_vehicles` | — | 8 | **0** | 7 | 1 |
| `employee_contracts` | — | 6 | **0** | 0 | 6 |
| `leave_approval_stages` | — | 6 | **0** | 0 | 6 |
| `employee_assignments` | — | 5 | **0** | 0 | 5 |
| `hr_employee_loans` | — | 5 | **0** | 0 | 5 |
| `employee_violations` | — | 5 | **0** | 0 | 5 |
| `hr_overtime_requests` | — | 5 | **0** | 0 | 5 |
| `fleet_drivers` | — | 4 | **0** | 4 | 0 |
| `official_letters` | — | 4 | **0** | 0 | 4 |
| `payroll_runs` | — | 3 | **0** | 1 | 2 |
| `rbac_jit_requests` | — | 3 | **0** | 0 | 3 |
| `pbx_calls` | — | 2 | **0** | 0 | 2 |
| `approval_requests` | — | 2 | **0** | 0 | 2 |
| `bank_statements` | — | 2 | **0** | 0 | 2 |
| `gov_integrations` | — | 2 | **0** | 2 | 0 |
| `attendance_deductions` | — | 2 | **0** | 0 | 2 |
| `hr_loan_installments` | — | 2 | **0** | 0 | 2 |
| `email_queue` | — | 2 | **0** | 0 | 2 |
| `whatsapp_queue` | — | 2 | **0** | 0 | 2 |
| `obligations` | — | 2 | **0** | 0 | 2 |
| `print_reprint_requests` | — | 2 | **0** | 0 | 2 |
| `project_tasks` | — | 2 | **0** | 1 | 1 |
| `contract_payment_schedule` | — | 2 | **0** | 1 | 1 |
| `audit_violations` | — | 1 | **0** | 0 | 1 |
| `correspondence` | — | 1 | **0** | 0 | 1 |
| `documents` | — | 1 | **0** | 0 | 1 |
| `onboarding_tasks` | — | 1 | **0** | 0 | 1 |
| `employees` | — | 1 | **0** | 0 | 1 |
| `tasks` | — | 1 | **0** | 0 | 1 |
| `cost_centers` | — | 1 | **0** | 0 | 1 |
| `customer_advances` | — | 1 | **0** | 0 | 1 |
| `zatca_settings` | — | 1 | **0** | 0 | 1 |
| `hr_exit_clearance` | — | 1 | **0** | 0 | 1 |
| `job_applications` | — | 1 | **0** | 0 | 1 |
| `branches` | — | 1 | **0** | 1 | 0 |
| `umrah_import_logs` | — | 1 | **0** | 0 | 1 |

## Dangerous hits (priority queue for cluster-by-cluster fixes)

Each one is a candidate fix: migrate to `applyTransition` (same pattern as #672 / #677 / #679). Cluster suggestion: group by file.

| File | Line | Table | Snippet (truncated) |
|---|---:|---|---|
| `employees.ts` | 1288 | `hr_leave_requests` | ``UPDATE hr_leave_requests` |
| `finance-custodies.ts` | 609 | `journal_entries` | ``UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND statu…` |
| `finance-invoices.ts` | 752 | `invoices` | ``UPDATE invoices SET "paidAmount" = $1, status = $2, "paidAt" = $3 WHERE id = $4 AND "companyId" = $…` |
| `finance-invoices.ts` | 757 | `invoices` | ``UPDATE invoices SET "paidAmount" = $1, status = $2 WHERE id = $3 AND "companyId" = $4 AND "deletedA…` |
| `finance-invoices.ts` | 963 | `journal_entries` | ``UPDATE journal_entries SET "deletedAt" = NOW(), status = 'cancelled' WHERE id = $1 AND "companyId" …` |
| `finance-invoices.ts` | 968 | `invoices` | ``UPDATE invoices SET "deletedAt" = NOW(), status = 'cancelled' WHERE id = $1 AND "companyId" = $2 AN…` |
| `finance-invoices.ts` | 1034 | `journal_entries` | ``UPDATE journal_entries SET status = 'cancelled' WHERE id = $1 AND "companyId" = $2 AND status IN ('…` |
| `finance-invoices.ts` | 1197 | `invoices` | ``UPDATE invoices SET "paidAmount" = COALESCE("paidAmount",0) + $1,` |
| `finance-invoices.ts` | 1739 | `invoices` | ``UPDATE invoices SET "paidAmount" = COALESCE("paidAmount",0) + $1,` |
| `finance-journal.ts` | 528 | `journal_entries` | `if (approvalResult.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pendin…` |
| `finance-journal.ts` | 570 | `journal_entries` | `const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET "deletedAt" = NOW(…` |
| `finance-journal.ts` | 855 | `journal_entries` | `const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET "deletedAt" = NOW(…` |
| `finance-journal.ts` | 939 | `journal_entries` | `if (approvalResult.requiresApproval) { const { affectedRows } = await rawExecute(`UPDATE journal_ent…` |
| `finance-journal.ts` | 1405 | `financial_periods` | ``UPDATE financial_periods SET status='closed', "closedAt"=NOW(), "closedBy"=$1, "updatedAt"=NOW() WH…` |
| `governance.ts` | 331 | `governance_policies` | ``UPDATE governance_policies SET status='archived', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 …` |
| `hr.ts` | 4151 | `hr_leave_requests` | ``UPDATE hr_leave_requests SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'p…` |
| `properties.ts` | 1591 | `property_units` | ``UPDATE property_units SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND …` |
| `umrah.ts` | 1393 | `umrah_penalties` | ``UPDATE umrah_penalties SET status='invoiced', "invoiceId"=$1 WHERE "agentId"=$2 AND "seasonId"=$3 A…` |

## Intentional hits (require a `// bypass-ok` comment per the engineering rule)

**76** intentional bypasses. Recommended action: in a low-priority PR, prepend each with a one-line comment so future audits skip it without re-classifying.

Sample (top 10):

| File | Line | Table | Rationale |
|---|---:|---|---|
| `admin.ts` | 1010 | `audit_violations` | audit_violations is a system-signal table (not a workflow entity); status is a flag, not a state |
| `communications.ts` | 362 | `pbx_calls` | pbx_calls is a system-signal table (not a workflow entity); status is a flag, not a state |
| `communications.ts` | 412 | `pbx_calls` | pbx_calls is a system-signal table (not a workflow entity); status is a flag, not a state |
| `correspondence.ts` | 269 | `correspondence` | correspondence is a system-signal table (not a workflow entity); status is a flag, not a state |
| `documents.ts` | 488 | `documents` | documents is a system-signal table (not a workflow entity); status is a flag, not a state |
| `employees.ts` | 757 | `onboarding_tasks` | bulk update without single-row predicate; treat as documented batch operation |
| `employees.ts` | 1101 | `employee_assignments` | bulk update without single-row predicate; treat as documented batch operation |
| `employees.ts` | 1106 | `employee_assignments` | bulk update without single-row predicate; treat as documented batch operation |
| `employees.ts` | 1268 | `employee_assignments` | bulk update without single-row predicate; treat as documented batch operation |
| `employees.ts` | 1272 | `employees` | bulk update without single-row predicate; treat as documented batch operation |
| _…66 more in JSON sidecar_ |  |  |  |

## Legacy hits (migrate at convenience)

**17** legacy bypasses. These work today; migrate to `applyTransition` only when you're already editing the file for another reason — don't open dedicated PRs.

| File | Line | Table |
|---|---:|---|
| `fleet.ts` | 1077 | `fleet_vehicles` |
| `fleet.ts` | 1081 | `fleet_drivers` |
| `fleet.ts` | 1177 | `fleet_drivers` |
| `fleet.ts` | 1256 | `fleet_vehicles` |
| `fleet.ts` | 1262 | `fleet_drivers` |
| `fleet.ts` | 1413 | `fleet_vehicles` |
| `fleet.ts` | 1514 | `fleet_vehicles` |
| `fleet.ts` | 1601 | `fleet_vehicles` |
| `fleet.ts` | 2115 | `fleet_vehicles` |
| `fleet.ts` | 2121 | `fleet_drivers` |
| `fleet.ts` | 2267 | `fleet_vehicles` |
| `gov-integrations.ts` | 282 | `gov_integrations` |
| `gov-integrations.ts` | 337 | `gov_integrations` |
| `hr.ts` | 2827 | `payroll_runs` |
| `projects.ts` | 942 | `project_tasks` |
| `properties.ts` | 3525 | `contract_payment_schedule` |
| `settings.ts` | 510 | `branches` |

## Reproducing this triage

```bash
node audit/system-review/tooling/workflow-audit.mjs  # refresh the source data
node audit/system-review/tooling/bypass-triage.mjs   # classify
```

Heuristic limitations: this is **best-effort static classification**. The 
per-table and per-file lists are deterministic; the per-hit bucket may
be wrong for edge cases (e.g. a bulk operation in a non-cron file).
Each "dangerous" hit should still be reviewed before opening a fix PR.
