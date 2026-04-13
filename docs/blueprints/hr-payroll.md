# Blueprint — HR · Payroll

Payroll is the most transactionally sensitive module in the system.
A single run writes dozens of rows per employee and must roll back
atomically if any line fails — partial runs would corrupt the GL
posting that happens in the same transaction.

## 1. Permissions

| Permission     | Used by                                                       |
| -------------- | ------------------------------------------------------------- |
| `hr:read`      | `GET /hr/payroll`, `/hr/payroll/:id/lines`, summaries         |
| `hr:create`    | `POST /hr/payroll` — initiate a run for a given period         |
| `hr:update`    | `PATCH /hr/payroll/:id` — change run status (pending→approved) |
| `hr:delete`    | `DELETE /hr/payroll/:id` — soft-delete an unposted run         |
| `finance:post` | (cross-cutting) required for the auto-post to the GL to succeed; the payroll run itself does not require it, but the post step does. |

## 2. Tables written to

Everything inside `POST /hr/payroll` runs through a single
`withTransaction(async (client) => { ... })` block:

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `payroll_runs`                     | Header: `companyId`, `period`, `status`, `totalNet`, `runBy`             |
| `payroll_lines`                    | One per assignment: basic / housing / transport / GOSI (both sides) / overtime / deductions / net |
| `journal_entries`, `journal_lines` | The GL posting side — basics debit, net credit to payable, GOSI split   |
| `employee_loans`                   | Loan installments decremented where applicable                          |
| `audit_logs`                       | Two rows: `payroll.completed` (event) + `payroll.run` (action)          |

Failure inside any `INSERT INTO payroll_lines` aborts the whole
transaction, so you either get all lines or none — the smoke test
in Phase 7 exercises this explicitly.

## 3. Events emitted

| Event                       | Emitted at                   | Subscribers                         |
| --------------------------- | ---------------------------- | ----------------------------------- |
| `hr.payroll.run_started`    | `POST /hr/payroll`           | Finance dashboard widget            |
| `hr.payroll.run_completed`  | End of the same handler       | Notifications (CFO + HR), BI rollup |
| `hr.payroll.line_rejected`  | Line-level validation failure | System controls watcher (blocks approval) |

## 4. Scheduled jobs

- **`payrollReminderCron`** (25th of every month, 09:00) — sends a
  reminder to HR + Finance managers that the period is closing. It
  does **not** run payroll automatically; that is always a manual
  `POST /hr/payroll` call to preserve auditability.

Payroll does not listen to cron for computation. All computation
happens inside the handler.

## 5. Frontend entry points

- `/hr/payroll` — `src/pages/hr/payroll.tsx`
- `/hr/payroll/salary-components` — `src/pages/hr/salary-components.tsx`
- `/finance/payroll-journal` — view the GL side of the run (reads from `journal_entries` where `refType = 'payroll_run'`)

## 6. Known open issues

- **Phase 7 smoke test:** "Payroll run: atomic transaction rollback on
  failure of any line" is the target flow. Vitest should set up two
  assignments where one has a bad salary component and assert the run
  aborts cleanly.
- **Deeper gap #8 (decision engine):** payroll run approval is hand-
  rolled — the `pending → approved` transition should eventually go
  through the generic decision engine once it lands.
- **Deeper gap #9 (stop-system):** when the company-wide "red button"
  arrives, payroll is the first mutation that must honour it (an
  open audit must block a run).
