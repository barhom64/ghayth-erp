# U-06 — Live payroll capture verification audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Live payroll capture verification."

**TL;DR:** A live verification script already exists at
`scripts/verify-umrah-commission-payroll-journey.sh` covering 9
assertions end-to-end against a running server (login → seed →
calculate → approve → payroll-run → assert GL). The "verification"
piece is **substantially done**; the gap is that this script is
**manual + hardcoded to companyId=2** and **never runs in CI**. A
dynamic integration test would close it.

---

## 1. What exists today

### 1.1 The journey under verification
The umrah commission → payroll capture pipeline:

```
umrah commission plan (employee_commission_plans)
    ↓ engine: calculateCommissionForPlan
employee_commission_calculations (status='calculated', finalAmount)
    ↓ workflow approval (status='approved')
    ↓ HR runs payroll for the month
payroll_runs + payroll_lines (commission column populated)
    ↓ engine routes commission to 5240 DR (op `payroll_commission_expense`)
journal_entries / journal_lines (PAYROLL-<month> ref, balanced)
    ↓ calculation flips
employee_commission_calculations.status='paid', payrollLineId stamped
    ↓ idempotency proven
re-running consumption finds nothing (exactly-once).
```

### 1.2 The verification script
`scripts/verify-umrah-commission-payroll-journey.sh` (109 lines)
exercises this against a live server. It runs **9 assertion
groups**:

| # | Assertion | What it pins |
| --- | --- | --- |
| 1 | Login ok | Auth surface |
| 2 | Employee + plan + season + calculation seeded | Setup parity |
| 3 | Calculation approved via DB transition | Workflow state machine |
| 4 | Control row seeded (UNAPPROVED) | Negative case |
| 5 | Attendance backfilled + payroll run created | HR run surface |
| 6 | `payroll_lines.commission = 1500` | The capture itself |
| 7 | `payroll_lines.netSalary > 6000` (salary + commission) | Net includes commission |
| 8 | GL: 5240 DR present + amount = 1500 + entry balanced | Dedicated commission-expense GL |
| 9 | Approved calc → paid + payrollLineId; control row untouched | Exactly-once + isolation |

### 1.3 Engine source self-document
`artifacts/api-server/src/lib/umrahCommissionEngine.ts:176-202`
documents the `commission_via_hr` routing (default `true`):
- `commission_via_hr='true'` → CR `salary_payable` (2120, unified-HR mode)
- `commission_via_hr='false'` → CR `commission_payable` (2150, legacy split)

The verification script covers the **default (unified)** mode. The
legacy split mode (`commission_via_hr='false'`) is NOT covered by
the script.

---

## 2. Gaps

### 2.1 Not in CI (the headline gap)
The script lives under `scripts/` and runs against a manually
provisioned DB + manually started server. **It is never invoked
by the guard**, by `pnpm test`, or by `pnpm test:integration`.
A regression that breaks the journey would only surface when
an operator runs the script by hand.

### 2.2 Hardcoded to companyId=2 (Al-Diyaa)
Lines 34-37, 50, 80-84, 96-101: every PSQL statement and JE-ref
match assumes `companyId=2`. A future tenant-isolated CI run with
a different tenant id would fail.

### 2.3 Missing legacy-mode coverage
The `commission_via_hr='false'` path routes to `commission_payable`
(2150). The script never sets the setting to false, so the
legacy-mode GL trail is untested.

### 2.4 No re-run idempotency check beyond exactly-once
The script asserts the SECOND consumption attempt finds nothing
(via the "unapproved control row" not being consumed). It does
NOT assert what happens if the operator re-runs the **payroll**
itself for the same month after a paid commission. This is a
known operator pattern ("approve another commission, re-run
payroll for catch-up") that needs an idempotency guarantee.

### 2.5 No amend-then-recalc verification
If an approved calculation's `finalAmount` is amended (operator
correction), what happens to the previously-stamped
`payrollLineId`? The script doesn't exercise that path.

### 2.6 No multi-employee verification
The script uses a single employee. Multi-employee payroll runs
with mixed approved/unapproved calculations are not exercised.

### 2.7 No assertion on event emission
The engine emits `umrah.commission.calculated`. The script
verifies the DB state but NOT the event payload (per U-03's
audit shape, every emission needs to be traceable).

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-06-P1 — port to dynamic integration test (🟢 autonomous)
- New file: `tests/integration/umrahCommissionPayrollCapture.dynamic.test.ts`
- Same 9 assertion shape, refactored to:
  - Use isolated company name (`__U06_PAYROLL_CAPTURE_COMPANY__`)
  - Call `confirmMutamersImport` + `calculateCommissionForPlan` +
    payroll-run engine directly (no HTTP)
  - Run under `tests/integration` so `pnpm test:integration`
    picks it up
- Covers the default (unified-HR) mode only — matches script today.

### 3.2 U-06-P2 — legacy-mode coverage (🟢 autonomous)
- Add a `§F — commission_via_hr=false routes to commission_payable
  2150` section to the new test.
- Toggle the setting, run the journey, assert the alternate GL
  shape.

### 3.3 U-06-P3 — amend-then-recalc + multi-employee (🟢 autonomous)
- Extend the test with two extra scenarios:
  - **Amend**: approved calculation → amend `finalAmount` →
    assert behaviour (engine spec TBD; audit recommendation:
    block amendment of paid calculation; require unstamp + re-run).
  - **Multi-employee**: 3 plans, mixed approved/unapproved,
    assert only approved are consumed.

### 3.4 U-06-P4 — event payload verification (🟢 autonomous, depends on U-03 patterns)
- Subscribe to the event bus during the test.
- Assert `umrah.commission.calculated` payload carries
  `finalAmount`, `employeeId`, `assignmentId`, `month`, `year`.

### 3.5 U-06-P5 — keep the script (🟢 autonomous, doc)
- Add a header comment to the script linking to the dynamic
  test. The script stays useful as a smoke against a live
  provisioned environment, but the dynamic test is the
  primary regression guard.

---

## 4. Permanent hard rails preserved (U-06 will not cross)

- ❌ No engine touch.
- ❌ No migration.
- ❌ No catalog edit.
- ❌ No FE change.
- ❌ No silent linkage.
- ❌ No JE outside the finance engine.
- ❌ No catalog default flip (`commission_via_hr` stays at
  current default `'true'`).
- ❌ No new bulk pathway.
- ❌ Pure test additions for U-06-P1..P4. Doc-only for P5.

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No new test file. ❌ No engine touch. ❌ No script change.
- ❌ No migration. ❌ No FE.
- ❌ FIN-P4-CONTRACT execution untouched (still gated on
  `NEED OWNER DECISION` from #2257 §9).
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.
- ❌ U-05 / U-04 / BILL-MAIN P7 — independent tracks.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change. The existing umrah smokes + integration
   suites continue to protect the surface unchanged.

---

## 7. Closure verdict

- 🟢 **U-06 closes with VERIFICATION SCRIPT INVENTORIED + 7
  GAPS DOCUMENTED + 5 RECOVERY PHASES SCOPED.** The capture
  journey IS verified end-to-end today; the gap is "verification
  doesn't run in CI" not "verification doesn't exist."
- ➜ **Next autonomous step**: U-06-P1 — port the script to a
  dynamic integration test so CI runs it on every PR.
- ➜ **No owner decision needed** for any U-06 phase. All 5 are
  🟢 autonomous test additions.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code,
  BILL-MAIN P4+/P5, U-02b M6+, U-07 stay hard-paused.
