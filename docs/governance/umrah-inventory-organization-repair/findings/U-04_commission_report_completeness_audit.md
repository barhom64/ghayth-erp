# U-04 — Commission report completeness audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Complete commission_report."

**TL;DR:** The commissions-summary report exists at
`GET /umrah/reports/commissions-summary` + the FE page
`commissions-summary.tsx`. The pattern is solid (5 KPIs + 3 breakdown
tabs + 100 recent rows). **Six gaps** vs an operator-ready
commission attribution rollup, **none requires engine touch** —
the recovery is additive surfacing on the existing report.

---

## 1. Inventory — what exists today

### 1.1 API surface
`artifacts/api-server/src/routes/umrah-entities.ts:4959-5080`
declares `GET /umrah/reports/commissions-summary` which returns:

```ts
{
  kpis: {
    total: number;             // count of calculations
    calculatedAmount: number;  // sum of finalAmount
    paidAmount: number;        // sum where status='paid'
    pendingAmount: number;     // sum where status NOT IN ('paid')
    employeesCount: number;    // distinct employee count
  },
  byStatus:   [{ status, count, total }],
  byMonth:    [{ year, month, count, total }, ...12],
  byEmployee: [{ employeeId, employeeName, count, total }, ...50],
  recent:     [{ id, planId, planName, employeeId, employeeName,
                 month, year, status, finalAmount, commissionAmount,
                 totalMutamers, conditionMet, createdAt }, ...100],
}
```

### 1.2 Filters supported
| Filter | Source | Behaviour |
| --- | --- | --- |
| `seasonId` | `cc.planId → cp.seasonId` via EXISTS subquery | ✅ |
| `employeeId` | `cc.employeeId` | ✅ |
| `year` | `cc.year` | ✅ |
| `status` | `cc.status` | ✅ |

### 1.3 FE page
`artifacts/ghayth-erp/src/pages/umrah/reports/commissions-summary.tsx`
renders the response with 4 filters + 5 KPI cards + 3 breakdown
tabs + a 100-row recent table.

### 1.4 Smokes
- `tests/unit/umrahCommissionsSummarySmoke.test.ts` — pins the API
  shape (kpis + breakdown keys).
- `tests/unit/umrahReportsCatalogSmoke.test.ts` — pins catalog
  listing.

---

## 2. Gaps vs an operator-ready commission attribution rollup

### 2.1 No agent / sub-agent / group breakdown
The breakdown tabs surface `status`, `month`, `employee`. **Missing**:
- **byAgent** — "أكبر 10 وكلاء بمصروف العمولة"
- **bySubAgent**
- **byGroup**

**Today** the operator can answer "أي موظف يستحق أكثر؟" but NOT
"أي وكيل يكلفنا أكثر في العمولات؟"

**Blocker:** `employee_commission_calculations` doesn't carry
`agentId`/`subAgentId`/`groupId`. They would need to be plumbed
through. **Direct overlap with U-05** (#2286): the plan-side
columns ship in U-05-P1 → the calculation-side could chain
through `cc.planId → cp.agentId` in the same way `seasonId`
already chains. **No engine touch needed.**

### 2.2 No date-range filter
Only `year` is a filter. Operators preparing month-by-month
payroll for a specific quarter cannot filter
`month_from / month_to` or `date_from / date_to`. The byMonth
breakdown is fixed at last 12 months — no scrollback.

### 2.3 No condition-met split
The `recent` row carries `conditionMet: boolean` but NO KPI
counts. An operator can't tell at a glance:
- "How many calcs met the condition vs not?"
- "What's the calculated amount of unmet-condition calcs?"

Both are 1-line SQL additions.

### 2.4 No financial-impact split
The engine tracks `financialImpactCount` on the import path. The
commission calc has a similar concept (calcs that had to be
re-run after overstayDays update). The report doesn't surface
this — it's invisible whether the rollup includes recalculated
amounts.

### 2.5 No export
No CSV / Excel download. The recent 100 rows are read-only on
screen, no `/umrah/reports/commissions-summary/export` route.

Pattern reference: `/umrah/reports/violations-summary` (mentioned
in the FE page comment as the model) — does it have export?
Worth a follow-up smoke check; if yes, parity needed.

### 2.6 No comparison vs last period
The KPIs show absolute numbers for the current filter. No
"vs same period last year" or "vs last month" comparison. This
is a quick win — the same query with `year - 1` gives the
comparison.

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-04-P1 — agent / sub-agent / group breakdown (🟢 autonomous, **depends on U-05-P1**)
Add three breakdown tabs to the existing response:

```ts
byAgent:     [{ agentId, agentName, count, total }, ...20],
bySubAgent:  [{ subAgentId, subAgentName, count, total }, ...20],
byGroup:     [{ groupId, groupName, count, total }, ...20],
```

Via:
```sql
LEFT JOIN employee_commission_plans cp ON cp.id = cc."planId" AND cp."deletedAt" IS NULL
LEFT JOIN umrah_agents     a  ON a.id  = cp."agentId"
LEFT JOIN umrah_sub_agents sa ON sa.id = cp."subAgentId"
-- groupId chain: TBD whether groupId belongs on plan or calc.
-- Audit recommendation: dim it via JE only (U-05-P2), not the plan row.
```

**Constraints:**
- Depends on U-05-P1 shipping `cp.agentId` + `cp.subAgentId`.
- New columns NULLable → rolls up under "بدون وكيل" for legacy
  plans (no backfill needed).

### 3.2 U-04-P2 — date-range + condition-met + financial-impact (🟢 autonomous)
- Add `monthFrom`, `monthTo`, `dateFrom`, `dateTo` filters.
- Add `conditionMetCount`, `conditionUnmetCount` KPIs.
- Add `financialImpactCount` KPI (count of calcs with
  overstayDays/actualStayDays change).

All additive. Existing filters/KPIs untouched.

### 3.3 U-04-P3 — export (🟢 autonomous)
- New route `GET /umrah/reports/commissions-summary/export`
  returning CSV (Arabic-safe, BOM-prefixed).
- Same query, same filters; serializes `recent` rows.
- Limit raise: `LIMIT 5000` for export only (the on-screen 100
  stays).

### 3.4 U-04-P4 — comparison vs prior period (🟢 autonomous)
- Add `comparePriorYear: boolean` filter. When true, return:
  ```ts
  prior: { kpis: ..., byMonth: ... }
  ```
- FE renders KPIs with a delta indicator.

### 3.5 U-04-P5 — FE rendering (🟢 autonomous)
- Add 3 new breakdown tabs (Agent / SubAgent / Group) to the FE.
- Add export button.
- Add delta indicators on KPI cards when `comparePriorYear` set.

---

## 4. Relationship to U-05

| Track | Carries |
| --- | --- |
| **U-05-P1** | Schema: `agentId`/`subAgentId` on `employee_commission_plans` |
| **U-04-P1** | Surfacing: breakdown by agent/subAgent on the report |
| **U-05-P2** | Engine: JE dim — populated from plan |

**U-04-P1 ships AFTER U-05-P1.** Without `cp.agentId` the agent
breakdown query has no source. The audit doc for U-05 (#2286)
proposes U-05-P1 as 🟢 autonomous, so the dependency is unblocked
once that ships.

U-04-P2/P3/P4/P5 do NOT depend on U-05. They can ship in any order.

---

## 5. Permanent hard rails preserved (U-04 will not cross)

- ❌ No engine touch.
- ❌ No migration.
- ❌ No catalog edit.
- ❌ No silent client/agent creation.
- ❌ No silent linkage.
- ❌ No JE outside the finance engine.
- ❌ No hardcoded mapping.
- ❌ No bulk silent anything.
- ❌ The report is **READ-ONLY**. No POST/PUT/DELETE side effects.
- ❌ All new fields are additive on response, never changes to
  existing field semantics.

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No migration. ❌ No engine touch. ❌ No route change.
- ❌ No FE change. ❌ No smoke.
- ❌ U-05-P1/P2/P3/P4 untouched (different track).
- ❌ FIN-P4-CONTRACT execution untouched (still gated on
  `NEED OWNER DECISION` from #2257 §9).
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. The existing umrah smokes (15+ files
   after #2284) continue to protect the surface unchanged.

---

## 8. Closure verdict

- 🟢 **U-04 closes with INVENTORY DOCUMENTED + RECOVERY PLAN
  SCOPED.** The report exists and works for the
  employee-attribution case; the gap is operator surfaces
  beyond employee, plus export + comparison + range filters.
- ➜ **Sequencing:** U-05-P1 (schema) must ship before U-04-P1.
  All other U-04 phases (P2/P3/P4/P5) ship in any order.
- ➜ **No owner decision needed for U-04 execution.** All 5
  phases are 🟢 autonomous under §4.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code, BILL-MAIN
  P4+/P5, U-02b M6+, U-07 stay hard-paused.
