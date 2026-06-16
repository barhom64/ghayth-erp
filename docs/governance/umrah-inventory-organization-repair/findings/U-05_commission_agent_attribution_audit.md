# U-05 — Commission agent attribution audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "agentId on commission plans + agent dim on JE."

**TL;DR:** Two precise gaps confirmed, both **self-documented in
the engine source** with a follow-up marker. Adding the schema
column is autonomous (nullable additive migration). Adding the JE
dimension is **autonomous** IF the engine merely populates a new
dim field without changing posting math; classified as such pending
owner ratification of the slice boundary.

---

## 1. Where the gap lives (concrete locations)

### 1.1 Schema gap
`employee_commission_plans` (migration `093_umrah_phase2_tables.sql`)
declares the plan with these attribution columns:

| Column | Purpose | Today |
| --- | --- | --- |
| `companyId` | Tenant | ✅ |
| `branchId` | Branch dim | ✅ |
| `employeeId` | The marketer earning the commission | ✅ |
| `assignmentId` | The marketer's employee assignment | ✅ |
| `seasonId` | Umrah season the plan is scoped to | ✅ |
| **`agentId`** | The umrah main agent the marketer worked under | ❌ **missing** |

There is no `agentId` (or `subAgentId`) column on
`employee_commission_plans`. The plan model knows WHICH MARKETER
earned the commission and FOR WHICH SEASON, but not FOR WHICH
AGENT — so a "commission by agent" report cannot be built without
joining through employee assignments + sales attribution.

### 1.2 JE-dimension gap
`artifacts/api-server/src/lib/umrahCommissionEngine.ts:208-231`
calls `createGuardedJournalEntry` with these dimensions on every
commission line:

```ts
lines: [
  { accountCode: expenseCode, debit: ..., credit: 0, ..., employeeId, umrahSeasonId },
  { accountCode: payableCode, debit: 0, credit: ..., ..., employeeId, umrahSeasonId },
],
```

The two dims are `employeeId` + `umrahSeasonId`. **Missing on every
commission JE line:**

- `umrahAgentId` — main agent attribution (drilldown by main agent)
- `umrahSubAgentId` — sub-agent attribution
- `umrahGroupId` — group attribution

### 1.3 Self-documented gap
The engine comment at lines **223–226** spells out the gap and the
follow-up:

> ```ts
> // umrahAgentId would carry the marketer's agent attribution but
> // employee_commission_plans has no agentId column today — the
> // dimension is left undefined here and will be added when the
> // plan schema gains an agent FK in a follow-up.
> ```

U-05 is the audit for that follow-up.

---

## 2. Why this matters (operator-visible consequence)

- **Agent statements** can list invoices + nusk purchases + linkage
  events for an agent, but **cannot list commission expense** the
  business booked against work done under that agent. The expense
  is invisible at the agent level today.
- **Season-by-agent margin** is broken: revenue + cost are
  attributed to the agent (via BILL-MAIN P2–P6 dims on sales /
  purchase JEs), but commission expense lacks the same dim — so a
  P&L drilldown by agent over-reports margin (commission expense
  shows under season-only, not agent-segregated).
- **Commission disputes** with marketers cannot be re-attributed to
  a specific agent's volume after the fact because the plan never
  recorded which agent was the cause.

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-05-P1 — schema additive (🟢 autonomous)
Add nullable columns to `employee_commission_plans`:

```sql
ALTER TABLE employee_commission_plans
  ADD COLUMN IF NOT EXISTS "agentId"    integer,
  ADD COLUMN IF NOT EXISTS "subAgentId" integer;
```

**Constraints:**
- Both nullable, no FK constraint, no backfill, no behaviour change.
- No `groupId` here — commission plans run for a whole season, not
  per-group. Group attribution belongs on the JE line, not on the
  plan row.
- Follows the BILL-MAIN P2 expand/contract shape.

Plan-route writes need a thin update to accept the new field; the
audit doc proposes the minimal patch but does NOT execute it.

### 3.2 U-05-P2 — JE dimension additive (🟢 autonomous, **borderline**)
Update `umrahCommissionEngine.ts:208-231` to read
`plan.agentId` / `plan.subAgentId` and pass them on the JE lines:

```ts
lines: [
  { accountCode: expenseCode, debit: ..., credit: 0, ...,
    employeeId, umrahSeasonId,
    umrahAgentId: plan.agentId ?? undefined,
    umrahSubAgentId: plan.subAgentId ?? undefined },
  { accountCode: payableCode, debit: 0, credit: ..., ...,
    employeeId, umrahSeasonId,
    umrahAgentId: plan.agentId ?? undefined,
    umrahSubAgentId: plan.subAgentId ?? undefined },
],
```

**Why this is borderline:**
- It does NOT change the JE math, posting status, account codes, or
  reconciliation.
- It DOES change the shape of every commission JE line going
  forward (new dim fields populated).
- Posted historical JEs stay untouched (the migration is additive
  and nullable; legacy commission JEs stay legacy).

**Classification proposal:** 🟢 autonomous, conditional on:
- Confirming `createGuardedJournalEntry` already accepts
  `umrahAgentId` / `umrahSubAgentId` per-line (BILL-MAIN P2 +
  earlier added these on the sales side).
- A smoke that pins the dim presence + a regression smoke that the
  POSTING math is unchanged.

If the owner classifies this as 🔴 (any JE shape change is a
hard-pause), U-05-P2 stops at the schema layer and waits.

### 3.3 U-05-P3 — closure smoke + dim presence assertion (🟢 autonomous)
- Static smoke pinning that `umrahCommissionEngine.ts` passes both
  new dim fields on both lines.
- Dynamic E2E (DB-backed) that creates a plan with `agentId`, runs
  one calculation, and asserts the resulting JE lines carry the
  agent dim.

### 3.4 U-05-P4 — FE on commission plan editor (🟢 autonomous)
Add agent picker + sub-agent picker to the commission-plan editor.
Both optional. The editor is operator-confirmed; no auto-resolve.

---

## 4. Relationship to BILL-MAIN P4

BILL-MAIN P4 (hard-pause) targets the **sales** path:
`generateSalesInvoice` reading `agent.clientId` for AR routing.
U-05 targets the **commission** path: writing `agentId` to the
plan + propagating it to the JE dim. The two paths are independent
— U-05 does NOT enable any `main_agent_client` behaviour, and
BILL-MAIN P4 ratification is NOT a prerequisite for U-05-P1 or
U-05-P3. P2 is borderline and may need ratification depending on the
owner's stance on "additive JE dim = behaviour change?".

---

## 5. Permanent hard rails preserved (U-05 will not cross)

- ❌ No silent linkage between marketers and agents (operator
  picks agent on plan editor, no auto-assignment).
- ❌ No silent JE shape change without a smoke pinning it.
- ❌ No backfill of legacy plans (`agentId` stays NULL until the
  operator updates the plan).
- ❌ No historical JE edit. New commission JEs from now on carry
  the dim; old ones stay untouched.
- ❌ No new dependency on `main_agent_client` policy. The new
  column is plain data, not gated by any catalog flag.
- ❌ No engine-side rebuild — the change is additive `plan.X →
  line.umrahX` plumbing, not a refactor.

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No migration file.
- ❌ No engine touch.
- ❌ No FE change.
- ❌ No smoke.
- ❌ BILL-MAIN P4 / P4a / P4b / P4c / P5 untouched.
- ❌ FIN-P4-CONTRACT execution untouched (the financial engine
  contract from #2257 §9 is still gated on `NEED OWNER DECISION`).
- ❌ U-02b / U-07 / U-09 / U-12 / U-14 / U-15 / U-16 / U-17 / U-18
  / U-19 untouched.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. The existing 14 umrah smokes
   + BILL-MAIN P7 closure smoke (added separately in #2284)
   continue to protect the surface unchanged.

---

## 8. Closure verdict

- 🟢 **U-05 closes with INVENTORY DOCUMENTED + RECOVERY PLAN
  SCOPED.** Both gaps are real, both are self-documented in the
  engine source, and the recovery is a sequence of small autonomous
  PRs.
- ➜ **Next autonomous step** (if owner approves the slice
  boundary):
  - **U-05-P1** — nullable schema migration on
    `employee_commission_plans` (`agentId`, `subAgentId`).
- ➜ **Owner decision needed on P2 classification:** is "additive
  JE dim without posting-math change" 🟢 autonomous or 🔴 hard-pause?
  This audit proposes 🟢, conditional on smoke coverage.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code execution
  still requires `NEED OWNER DECISION` (gate from #2257 §9).
  BILL-MAIN P4/P4a/P4b/P4c/P5 + U-02b M6+ + U-07 stay hard-paused.
