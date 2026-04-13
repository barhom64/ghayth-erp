# Blueprint — HR · Attendance

Attendance is the entry point for payroll deductions: every check-in
and check-out can produce late / early-leave / overtime records, and
those records flow directly into the period's payroll run. It is also
the upstream producer for the discipline module — repeated lateness
creates inquiry memos automatically.

## 1. Permissions

| Permission     | Used by                                                         |
| -------------- | --------------------------------------------------------------- |
| `hr:create`    | `POST /hr/check-in`, `POST /hr/check-out`                       |
| `hr:read`      | `GET /hr/attendance`, `/hr/attendance/reports`, field tracking  |
| `hr:update`    | Admin correction of an attendance row (shift assignment, GPS)   |
| `hr:approve`   | Approve an attendance correction request (from `my-space`)      |

All check-in / check-out calls resolve the employee from the JWT
subject, so `hr:create` on your own attendance row is implicit; HR
staff need the same permission only when creating a row on behalf of
another employee (field operations).

## 2. Tables written to

| Table                              | Rows written by                                                        |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `attendance`                       | One row per (assignment, date). Updated on check-out with `checkOut`, `overtimeMinutes`, GPS coordinates. |
| `attendance_deductions`            | Late / early-leave / overtime deductions, pending until the payroll run picks them up. |
| `employee_violations`              | Discipline-tier tracking when late minutes cross a configured tier.     |
| `employee_monthly_attendance`      | Upserted on every check-in / check-out. Payroll reads from this summary table. |
| `shifts`                           | Default shift auto-created on first check-in if the company has none.   |
| `attendance_corrections`           | Employee-submitted corrections (from `my-space`) pending HR approval.   |

Late-penalty tiers are resolved from `hr_discipline_regulation` using
the same helper the discipline module uses, so the thresholds can be
configured per company without touching attendance code.

## 3. Events emitted

| Event                              | Emitted at                                     | Subscribers                       |
| ---------------------------------- | ---------------------------------------------- | --------------------------------- |
| `hr.attendance.checked_in`         | `POST /hr/check-in`                            | Field-tracking dashboard, audit   |
| `hr.attendance.checked_out`        | `POST /hr/check-out`                           | Field-tracking dashboard, audit   |
| `hr.attendance.deduction_created`  | Any path that writes `attendance_deductions`  | Payroll pre-run watcher           |
| `hr.attendance.violation_created`  | Late tier crossed                              | `disciplineEngine.ensureInquiryMemoForViolation` |

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`autoAbsent`** (19:00 Asia/Riyadh) — closes the day: every
  assignment without an `attendance` row for today gets one with
  `status = 'absent'` (unless covered by an approved leave). Same job
  writes the `absent` deduction row.
- **`dailyDeductionCheck`** (08:00 next day) — scans yesterday's
  absent / late rows and hands them to `disciplineEngine` for memo
  creation. See the HR Discipline blueprint for the handoff contract.
- **`monthlyAttendanceRollup`** (first of month, 01:00) — materialises
  the prior month into `employee_monthly_attendance` for reports that
  don't want to re-aggregate.

## 5. Frontend entry points

- `/hr/attendance` — `src/pages/hr/attendance.tsx`
- `/hr/attendance/reports` — `src/pages/hr/attendance-reports.tsx`
- `/hr/attendance/field-tracking` — `src/pages/hr/field-tracking.tsx` (live GPS map)
- `/hr/attendance/qr-scanner` — `src/pages/hr/qr-scanner.tsx`
- `/my-space` → `my-attendance` section (self-service, correction requests)

## 6. Known open issues

- **Phase 7 smoke test:** "HR check-in with GPS → late-penalty tier
  calculation → inquiry memo auto-creation" is the canonical flow the
  vitest suite will cover.
- **Deeper gap #3 (obligations engine):** `autoAbsent` today walks
  `company_id IN (...)` blindly; it should be driven by the
  obligations engine once it lands so the work shards correctly past
  ~100 companies.
- **Deeper gap #12 (expansion):** the rollup cron also iterates
  companies one-at-a-time and will need sharding.
