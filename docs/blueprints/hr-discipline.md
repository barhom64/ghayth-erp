# Blueprint — HR · Discipline

The discipline module owns the living discipline regulation (Saudi
labour-law baseline seeded per company), inquiry memos ("مذكرة تحقيق"),
and the 3-step approval chain that converts an infraction into a
payroll-applied penalty. It is the module most tightly coupled to
attendance (late/absent flows create memos automatically) and payroll
(approved decisions write to `attendance_deductions`).

## 1. Permissions

From `lib/rbacCatalog.ts`:

| Permission                  | Used by                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `hr:read`                   | List regulation, memos, penalty preview, stats                          |
| `hr:create`                 | Create / reseed regulation rows, create inquiry memos                   |
| `hr:update`                 | Edit regulation, manager recommendation, cancel memo                    |
| `hr:delete`                 | Soft-delete regulation rows                                             |
| `hr:discipline:approve`     | GM final decision on memo (only role that can write the penalty)        |

The 3-step chain enforces separation of duties: the employee justifies
(`hr:read`), the manager recommends (`hr:update`), and the GM decides
(`hr:discipline:approve`). These three permissions are never granted to
the same role in the default bindings — see the role matrix in
`rbacCatalog.ts`.

## 2. Tables written to

All migrations live under `src/migrations/`; the current shape is
captured by the idempotent DDL in `020_hr_discipline.sql` (regulation
rows), `021_hr_inquiry_memos.sql` (memos + events), and
`067_lifecycle_columns.sql` (shared lifecycle metadata).

| Table                              | Rows written by                                                        |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `hr_discipline_regulation`         | Seed, manual add/edit (inserts + soft-delete via `deletedAt`)          |
| `hr_inquiry_memos`                 | Memo lifecycle (`draft → awaiting_justification → pending_manager → pending_gm → closed_with_penalty / dismissed / cancelled`) |
| `hr_inquiry_memo_events`           | Full audit trail — one row per state transition, note, or fact change  |
| `employee_violations`              | Linked record (created when memo starts; status updates on decision)    |
| `attendance_deductions`            | Written **only** by the GM decision handler when the outcome is a monetary penalty; consumed by the payroll run. |

The only writer of `attendance_deductions` inside the discipline flow
is `routes/hr-discipline.ts:581` — everything else passes through the
same GM decision handler.

## 3. Events emitted

Via `safeEmitEvent` in `lib/eventBus.ts`:

| Event                              | Emitted at                                       | Subscribers                        |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------- |
| `hr.memo.created`                  | `POST /hr/discipline/memos`                      | Notifications (employee + HR)      |
| `hr.memo.justified`                | `POST /hr/discipline/memos/:id/justify`          | Notifications (manager)            |
| `hr.memo.manager_recommendation`   | `POST /hr/discipline/memos/:id/manager-recommendation` | Notifications (GM)           |
| `hr.memo.gm_decision`              | `POST /hr/discipline/memos/:id/gm-decision`      | Notifications (employee + HR), payroll deduction writer |
| `hr.memo.cancelled`                | `POST /hr/discipline/memos/:id/cancel`           | Notifications (employee)           |

Every emission is also mirrored as a row in `hr_inquiry_memo_events`
via the `recordMemoEvent` helper at the top of
`routes/hr-discipline.ts` so that the full history survives even if
the event bus is drained for maintenance.

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`dailyDeductionCheck`** (08:00 Asia/Riyadh) — scans yesterday's
  `attendance` rows for `absent` / `late` without an approved leave
  cover, then calls `disciplineEngine.ensureInquiryMemoForViolation`
  which idempotently creates a draft memo if the employee's rolling
  tier in the regulation says one is required. This is the only
  automated memo creator; all other memos are raised manually.

- **`escalateStaleApprovals`** (hourly) — the generic approval
  escalation job also scans discipline memos stuck in
  `pending_manager` / `pending_gm` for more than the SLA window and
  sends reminder notifications (does **not** auto-approve: the
  discipline flow is intentionally excluded from auto-approval because
  it writes to payroll).

## 5. Frontend entry points

- `/hr/discipline/regulation` — `src/pages/hr/discipline-regulation.tsx`
- `/hr/discipline/memos` — `src/pages/hr/discipline-memos.tsx`
- `/hr/discipline/memos/:id` — `src/pages/hr/discipline-memo-detail.tsx`
- `/hr/discipline/penalty-preview` — embedded in memo create form (calls `POST /hr/discipline/penalty-preview`)
- `/my-space` — employee justification step surfaces here for the
  memo-subject employee (read-write for the `justification` field
  only, all other fields read-only).

## 6. Known open issues

Cross-referenced from `docs/KNOWN_ISSUES.md`:

- **Phase 7 smoke test (pending):** the 3-step flow
  (justification → manager recommendation → GM approval → penalty
  application) is on the target list for the vitest smoke suite but
  not yet covered.
- **Deeper gap #1 (lifecycle enforcement):** memo states are currently
  enforced inside `hr-discipline.ts` rather than through
  `lib/lifecycleEngine.ts`. Migrating them is tracked under the
  lifecycle enforcement deeper gap.
- **Deeper gap #6 (communications gateway):** the three notifications
  sent by the memo flow are direct `createNotification` calls. When
  the `communicationsGateway` lands they should route through it so
  WhatsApp/SMS delivery can be toggled per company.
