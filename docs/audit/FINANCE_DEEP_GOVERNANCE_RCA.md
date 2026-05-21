# Finance Deep Governance RCA

> **Role:** Agent 1 — Finance Governance Lead. **Mode:** RCA + governance (analysis, not development — no code change in this document).
> **Method:** static source analysis of `artifacts/api-server/` on `main` (`be58891`). **No runtime verification** — every finding is a code-level claim with `file:line` evidence.
> **Scope:** chart of accounts · subaccounts · posting discipline · posting gates · period enforcement · branch isolation · voucher lifecycle · reconciliation.
> **Date:** 2026-05-21.

---

## 1. Executive summary

28 findings — **6 P0, 16 P1, 6 P2**. They are not 28 unrelated bugs: they collapse to **4 systemic root causes** (§2).

The headline: the General Ledger's core invariants — *one balanced entry*, *posted rows are immutable*, *one journal line ↔ one bank match*, *no posting into a closed period* — are asserted in **JavaScript, on some code paths and not others, with no database backstop**. The "happy" HTTP route through `financialEngine` is mostly disciplined; every other path (a second posting primitive, the recurring-journal scheduler, direct line inserts, sibling routes, concurrent requests) can post **unbalanced, double-posted, back-dated, or cross-branch** entries. The governance assumption stated verbatim in the code — `financialEngine.ts:2-4`: *"Central gateway for ALL General Ledger operations… Every domain… MUST go through this engine"* — is **factually false on `main`**.

| Severity | Count | Meaning |
|---|---|---|
| **P0** | 6 | Ledger integrity can be violated on a path reachable today. |
| **P1** | 16 | Governance control missing/bypassable; integrity depends on caller discipline. |
| **P2** | 6 | Inconsistency or latent gap; low immediate impact. |

---

## 2. Systemic root causes

### RC-1 — There is no single posting primitive

Two independent primitives write `journal_entries` / `journal_lines`:

- **Path A** — `financialEngine.postJournalEntry` → `createJournalEntry` / `createGuardedJournalEntry` (`lib/businessHelpers.ts`). Validates accounts, checks balance, injects a rounding line, updates `chart_of_accounts.currentBalance`, dedupes on `sourceKey`.
- **Path B** — `lib/gl/posting.ts::postJournalEntry`. A parallel primitive used only by the FX (`lib/fx/post-*.ts`), inventory (`lib/inventory/post-*.ts`) and Mudad payroll (`lib/saudi-compliance/mudad/post-salary-journal.ts`) posters. Re-validates balance and period — but does **not** update `currentBalance` and does **not** write/dedupe `sourceKey`.

Every divergence below (PD-1, PD-6, PG-2, PER-1, the trial-balance drift) traces here. **This is the spine of the RCA.**

### RC-2 — Core accounting invariants live only in application code, never in the database

No `CHECK`, `UNIQUE`, trigger or rule enforces *debits = credits per entry*, *posted rows are immutable*, *one bank match per journal line*, or *account `type` is a valid enum*. Balance and immutability are JavaScript-only invariants — so any raw `INSERT`/`UPDATE`, any second primitive, any concurrent request, and any future caller bypasses them entirely. Drives PD-2, PD-3, PD-5, COA-3, REC-2.

### RC-3 — Governance gates are bound to the HTTP route, not to the operation

`requireGuards("financial")`, period checks and branch checks live in route middleware or route-handler bodies. Therefore the recurring-journal **scheduler**, **engine library calls**, and **sibling routes that perform the same operation** are ungated or inconsistently gated. Drives PG-1, PER-2, BR-1, BR-2, COA-1.

### RC-4 — Declared governance is not wired

State machines, status columns and tables exist but are bypassed: vouchers are *born `posted`* and never enter their state machine; the voucher `approve` endpoint matches a `ref` pattern no real voucher has; the `vouchers` table is dead schema; `financial_periods.locked` is enforced in the gate but no code path can set it. Capability declared ≠ capability wired. Drives VL-1, VL-2, VL-5, PER-3, PD-4.

---

## 3. Findings by area

Severity in **bold**. Evidence is `file:line` under `artifacts/api-server/src/` unless noted.

### 3.1 Chart of Accounts

*How it works today.* One table `chart_of_accounts`, scoped by `"companyId"` (a `"branchId"` column exists, unused by the route). Accounts carry a string `code` `varchar(20)`, a `type` (asset/liability/equity/revenue/expense), a `nature` (debit/credit), `level int`, and an `"allowPosting" boolean DEFAULT true`. CRUD in `routes/finance-accounts.ts`. A ~level-4 Arabic chart is seeded per company in `lib/companyBootstrap.ts`.

- **COA-1 — `allowPosting` is a free flag, not derived from leaf-ness. [P2]** `createJournalEntry` blocks posting to a header account via `if (acc.allowPosting === false)` (`businessHelpers.ts:469-471`), but nothing flips a parent's `allowPosting` to `false` when a child is added (`createAccountSchema` defaults `allowPosting:true`, `finance-accounts.ts:31`). A postable parent and its postable child coexist → roll-up double-counting. *Root cause: RC-3.*
- **COA-2 — Account `code` unique per company only. [P2]** `chart_of_accounts_company_code_uq UNIQUE ("companyId", code)` (`migrations/016_accounting_engine.sql:32`); branch not a key. Acceptable for a shared chart, recorded for completeness.
- **COA-3 — `type`/`nature` validated only at API input. [P1]** Zod restricts the enum (`finance-accounts.ts:21-30`); the DB column is plain `varchar` with **no `CHECK`**. Nothing verifies a debit-natured account is debited, or posted amounts respect normal balance. Reports key off `accountCode LIKE '5%'` (`finance-accounts.ts:513`) rather than `type` → silent misclassification. *Root cause: RC-2.*
- **COA-4 — `UPDATE` may re-type or re-parent an account that already has postings. [P1]** `DELETE` correctly refuses when `journal_lines` exist (`finance-accounts.ts:289-298`), but `updateAccountSchema` permits editing `type` and `parentCode` (`finance-accounts.ts:35-39`) **with no usage check**. Changing `type` after postings exist retroactively rewrites historical financial statements; re-parenting re-buckets prior balances. *Root cause: RC-2/RC-4.*
- **COA-5 — Seeded standard chart is not authoritative. [P2]** `companyBootstrap.ts` seeds a full chart, but free-form `POST /accounts` lets operators add any code/type/parent afterward with nothing keeping additions consistent.

### 3.2 Subaccounts

- **SUB-1 — Subaccount parenting is entirely unguarded: no cycle protection, no parent/child type consistency. [P0]** On create/update, `parentCode` is accepted and `parentId` resolved (`finance-accounts.ts:193-200, 234-237`) with **zero validation** — parent existence is not checked, parent `type` is not compared to the child, `level` is never recomputed, and there is no ancestry/cycle check. An account can be set as its own parent (or two as mutual parents); any recursive-CTE roll-up then loops. A `revenue` child can sit under an `asset` parent, corrupting tree-based statements. *Root cause: RC-2. Highest-priority chart finding.*

### 3.3 Posting discipline

*How it works today.* See RC-1 — two primitives. Path A is `createJournalEntry` in `businessHelpers.ts`; Path B is `lib/gl/posting.ts`.

- **PD-1 — Two divergent posting primitives. [P0]** `financialEngine.ts:2-4` asserts a single gateway; `lib/gl/posting.ts` is a second primitive used by 5 posters. They disagree on invariants: Path A injects a rounding line and updates `chart_of_accounts.currentBalance`; Path B does neither. **Consequence:** FX, inventory and Mudad-payroll journals never update `currentBalance` → the trial balance silently drifts from the ledger. *Root cause: RC-1.*
- **PD-2 — A sub-0.05 imbalance is force-balanced, not rejected. [P1]** `businessHelpers.ts:482-513`: any imbalance `> 0.001 and ≤ 0.05` SAR is absorbed into an auto-created account `9999` (`params.lines.push({ accountCode: "9999", … })`, `:500`); only `> 0.05` throws. A structurally wrong entry off by ≤5 halalas posts silently. Path B hard-rejects `> 0.01` (`gl/posting.ts:75`) — the two primitives apply **different balance rules**. *Root cause: RC-1/RC-2.*
- **PD-3 — No database backstop for balance or posted-immutability. [P1]** No `CHECK`/trigger enforces `sum(debit) = sum(credit)` per entry; no constraint blocks `UPDATE`/`DELETE` of a posted entry. Balance and immutability are JS-only. *Root cause: RC-2.*
- **PD-4 — Posted journal entries are mutable. [P1]** `finance-journal.ts:558` issues `UPDATE journal_entries SET description=$1` with no `status != 'posted'` guard; `financialEngine.applyHeaderOverrides` (`financialEngine.ts:131-186`) runs a post-insert `UPDATE` of `status`/`"createdAt"`/metadata on every posting — i.e. the *posting date* is set by a mutating `UPDATE`, and nothing prevents the same `UPDATE` shape from re-dating an old, period-closed entry. *Root cause: RC-2/RC-4.*
- **PD-5 — `appendRoundingAdjustment` mutates an existing entry with no post-condition check and no transaction. [P1]** `financialEngine.ts:193-234` is the "centralised" way to append a rounding line to an *existing* journal entry. It validates the caller-supplied `amount` is non-zero and `≤ 0.05`, then `INSERT INTO journal_lines …`. It does **not** read the entry's current balance, **not** assert the entry is balanced afterwards, and runs **outside a transaction**. Correctness depends entirely on the caller passing the exact residual; the same method, called on an already-balanced entry, unbalances it — with no guardrail. *Root cause: RC-2.*
- **PD-6 — Path B has no `sourceKey` idempotency → retried posts double-post. [P0]** Idempotency dedup on `sourceKey` exists only in Path A (`businessHelpers.ts:441-453`, `financialEngine.ts:85-95`). `lib/gl/posting.ts` neither dedupes nor writes a `sourceKey`. A retried FX revaluation, inventory cycle-count, or Mudad salary post **double-posts** to the GL. *Root cause: RC-1.*

### 3.4 Posting gates

*How it works today.* `requireGuards("financial")` (`lib/systemGovernor.ts:188`) gates HTTP routes mounted under `/finance` (`routes/index.ts:293`) — system-stop / red-button, a posting-failure threshold, an audit-violation threshold. It short-circuits on non-HTTP method and returns `next()` when there is no `companyId`.

- **PG-1 — Gates cover HTTP routes only; scheduler and engine posts are ungated. [P1]** `recurringJournalProcessor.processDueRecurringJournals` posts on a cron tick with no `requireGuards` pass — system-stop and the posting-failure threshold do **not** halt scheduled recurring journals. Path B posters' gating depends on whichever router happens to mount them. *Root cause: RC-3.*
- **PG-2 — Posting-failure recording is Path-B-blind → the threshold under-counts. [P1]** Failures are written to `financial_posting_failures` only inside `createGuardedJournalEntry` (`businessHelpers.ts:617`, `ON CONFLICT DO NOTHING`), which runs only when `guardTable`/`guardId` are passed. Plain `createJournalEntry` failures and **all** Path-B failures are never recorded, so `postingFailuresGuard` (`systemGovernor.ts:73-87`) under-counts and the red-line never trips for FX/inventory/payroll posting failures. *Root cause: RC-1/RC-3.*

### 3.5 Period enforcement

*How it works today.* `financial_periods` (`migrations/022_financial_periods.sql`) is keyed by `"companyId"` only — **no `branchId`**, periods are company-wide. `status CHECK IN ('open','closed','locked')`. The gate is `checkFinancialPeriodOpen(companyId, date)` (`businessHelpers.ts:1040`), which bars both `closed` and `locked`.

- **PER-1 — The period gate checks two different dates on two paths. [P1]** `createJournalEntry` validates the period against `todayISO()` (`businessHelpers.ts:429`), not the entry's ledger date; the engine layer compensates by passing `request.postingDate` (`financialEngine.ts:97`). A caller invoking `createJournalEntry` directly validates the **wrong date**. *Root cause: RC-1.*
- **PER-2 — A backdated manual journal can post into a CLOSED period. [P0]** The manual-journal post path validates `checkFinancialPeriodOpen(scope.companyId, todayISO())` (`finance-hardening.ts:728`) — *today*, an open period — while the journal carries a backdated `date`. A manual entry dated into a now-closed/locked period therefore **posts**. This defeats period close. *Root cause: RC-3.*
- **PER-3 — The `locked` period status is unreachable. [P1]** No endpoint, no `applyTransition`, no `UPDATE … status='locked'` exists; `lockedAt`/`lockedBy` columns (`migrations/062_financial_hardening.sql`) are dead. The `locked` enforcement is live in the gate but a period can only ever be `open`/`closed` — the stricter "permanently locked, no reopen" control does not exist operationally. *Root cause: RC-4.*
- **PER-4 — Reopening a closed period is ungated by privilege. [P2]** Reopen (`finance-hardening.ts:260`) requires only `feature:"finance.hardening", action:"create"` — the same permission as creating a period; no owner/GM restriction, no distinct `reopen` action. It is audited, but any finance-hardening creator can reopen a closed period and post freely.

### 3.6 Branch isolation

*How it works today.* Branch scope is opt-in via `buildScopedWhere(..., { enforceBranchScope: true })`. Finance list routes mostly pass it; detail routes and the chart do not.

- **BR-1 — The chart-of-accounts list is not branch-scoped though COA carries `branchId`. [P2]** `finance-accounts.ts:134` calls `buildScopedWhere` with neither `enforceBranchScope` nor `disableBranchScope`, while `finance-journal.ts` list routes pass `enforceBranchScope: true` — a sibling-route inconsistency. *Root cause: RC-3.*
- **BR-2 — `GET /journal/:id` and `/journal/:id/reverse` enforce company scope only, not branch. [P1]** `finance-journal.ts:1117`: `WHERE je.id=$1 AND je."companyId"=$2`. The list endpoint enforces branch scope; the detail and *reverse* endpoints do not. A branch-scoped user who iterates a journal id can **read full GL entries — and reverse them — for branches they are not assigned to**. *Root cause: RC-3.*
- **BR-3 — `branchId` on a posting is not always validated against the caller's allowed branches. [P1]** The expense route checks `scope.allowedBranches.includes(branchId)` (`finance-journal.ts:395`); the voucher route passes `branchId ?? scope.branchId` with no membership check, and `recurringJournalProcessor` posts `branchId ?? recurring.branchId ?? 0` unvalidated. A branch-scoped user can stamp a voucher/journal onto another branch. *Root cause: RC-3.*

### 3.7 Voucher lifecycle

*How it works today.* A "voucher" is **not** a row in the `vouchers` table — that table is dead schema. `POST /vouchers` (`finance-journal.ts:702+`) calls `financialEngine.postJournalEntry` and inserts straight into `journal_entries` with a `RV-`/`PV-` `ref` and `sourceType:"voucher"`. A voucher is therefore *born already posted* to the GL.

- **VL-1 — A voucher has no lifecycle — it posts immediately, with no approval. [P0]** Creation `= postJournalEntry`, which defaults `status:"posted"` (`gl/posting.ts:85`). There is no draft/approval state; the creation path never calls `applyTransition`. Any user with `finance.journal:create` posts cash/bank movements to the ledger with **zero approval**. *Root cause: RC-4.*
- **VL-2 — The voucher `approve` endpoint is dead code. [P1]** `PATCH /vouchers/:id/approve` (`finance-vendors.ts:624-648`) runs `applyTransition` with `extraWhere: ref LIKE 'VOUCHER%'` and `fromStates:["draft","pending_approval","returned"]`. Real vouchers use `RV-`/`PV-` refs and are created `posted` — so this endpoint **can never match a real voucher**. The only governed approval path is unreachable. *Root cause: RC-4.*
- **VL-3 — A posted voucher's description can be silently rewritten. [P1]** `PATCH /vouchers/:id` (`finance-journal.ts:838-849`) runs a raw `UPDATE journal_entries SET description=$1` with **no status check, no audit log, no event, no `updatedBy`**. The amount is immutable (good); the narrative of a posted ledger entry is not, and the change leaves no trail. *Root cause: RC-2/RC-4.*
- **VL-4 — No voucher-specific reversal; `cancelled` does not reverse the GL. [P1]** There is no `/vouchers/:id/reverse`; a voucher can only be reversed via the generic `/journal/:id/reverse`. `JOURNAL_TRANSITIONS` lists `cancelled` as terminal, but `→ cancelled` triggers no GL reversal — a cancelled voucher can leave the ledger inconsistent.
- **VL-5 — The `vouchers` table is dead schema. [P2]** `migrations/105_missing_tables.sql:22-38` defines `vouchers` with `status DEFAULT 'posted'` and `journalEntryId`; no route writes it. Declared model ≠ wired model. *Root cause: RC-4.*

### 3.8 Reconciliation

*How it works today.* Bank statement lines are imported into `bank_statements` and matched to `journal_lines` via `matchedJournalLineId` (`routes/finance-algorithms.ts`).

- **REC-1 — A match is permanent: no un-reconcile path, and no row-level trail. [P1]** `manual-match`/`auto-match` set `matchStatus='matched'` (`finance-algorithms.ts:464, 566`) and require `'unmatched'` to (re)match — so a match locks. There is **no un-match / un-reconcile endpoint anywhere**; a wrong match is unfixable through the API. `bank_statements` has no `matchedBy`/`matchedAt` columns (`schema_pre.sql:3166-3180`) — only a batch-level `createAuditLog` records the user, so a specific match cannot be tied to a user from the row. *Root cause: RC-2/RC-4.*
- **REC-2 — The same journal line can be matched to two bank lines under concurrency. [P0]** Both matchers guard with an application-level `NOT EXISTS (SELECT 1 FROM bank_statements bs2 WHERE bs2."matchedJournalLineId"=jl.id)` (`finance-algorithms.ts:451-453, 560`). There is **no `UNIQUE` constraint on `bank_statements.matchedJournalLineId`**. Two concurrent `manual-match` requests both pass the `NOT EXISTS` check, then both `UPDATE` — the same journal line is reconciled against two bank lines, **double-counting cash**. *Root cause: RC-2.*

---

## 4. Severity register

| ID | Sev | Area | One-line |
|----|-----|------|----------|
| SUB-1 | **P0** | Subaccounts | Unguarded parenting → cycles + type-mismatched trees |
| PD-1 | **P0** | Posting discipline | Two posting primitives; FX/inventory bypass `currentBalance` |
| PD-6 | **P0** | Posting discipline | Path B has no `sourceKey` idempotency → double-posts on retry |
| PER-2 | **P0** | Period enforcement | Backdated manual journal posts into a closed period |
| VL-1 | **P0** | Voucher lifecycle | Voucher born `posted` — no approval, no state machine |
| REC-2 | **P0** | Reconciliation | No `UNIQUE` on match key → concurrent double-match double-counts cash |
| COA-3 | P1 | Chart of accounts | `type`/`nature` not enforced in DB or on posting |
| COA-4 | P1 | Chart of accounts | `UPDATE` re-types/re-parents accounts with postings |
| PD-2 | P1 | Posting discipline | ≤0.05 imbalance force-balanced into `9999` |
| PD-3 | P1 | Posting discipline | No DB backstop for balance / posted-immutability |
| PD-4 | P1 | Posting discipline | Posted entries mutable (description, date, status) |
| PD-5 | P1 | Posting discipline | `appendRoundingAdjustment` — no post-condition, no txn |
| PG-1 | P1 | Posting gates | Scheduler / engine posts ungated |
| PG-2 | P1 | Posting gates | Posting-failure threshold under-counts (Path-B-blind) |
| PER-1 | P1 | Period enforcement | Gate checks `todayISO()` vs ledger date inconsistently |
| PER-3 | P1 | Period enforcement | `locked` status unreachable; dead `lockedAt/By` columns |
| BR-2 | P1 | Branch isolation | `/journal/:id` (+reverse) cross-branch read/reverse |
| BR-3 | P1 | Branch isolation | `branchId` unvalidated on voucher/recurring posts |
| VL-2 | P1 | Voucher lifecycle | `approve` endpoint matches a ref no voucher has — dead |
| VL-3 | P1 | Voucher lifecycle | Posted voucher description silently rewritten, no trail |
| VL-4 | P1 | Voucher lifecycle | No voucher reversal; `cancelled` doesn't reverse GL |
| REC-1 | P1 | Reconciliation | No un-match path; no row-level reconciler trail |
| COA-1 | P2 | Chart of accounts | `allowPosting` flag not derived from leaf-ness |
| COA-2 | P2 | Chart of accounts | Account `code` unique per company only |
| COA-5 | P2 | Chart of accounts | Seeded chart not authoritative vs free-form CRUD |
| PER-4 | P2 | Period enforcement | Reopen ungated by privilege |
| BR-1 | P2 | Branch isolation | Chart-of-accounts list not branch-scoped |
| VL-5 | P2 | Voucher lifecycle | `vouchers` table is dead schema |

---

## 5. Governance recommendations (bounded — not a refactor mandate)

This RCA recommends **governance controls**, not a rewrite. Each item is sized: **[S]** small/bounded · **[D]** needs an owner decision before any work. This document changes no code.

**DB-level invariants (RC-2) — highest leverage, smallest change:**
- **[S]** `UNIQUE` on `bank_statements.matchedJournalLineId` (partial, where not null) — closes REC-2 (P0) outright at the database.
- **[S]** A deferred `CHECK`/trigger asserting `sum(debit)=sum(credit)` per `journal_entries` row — backstops PD-2/PD-3.
- **[S]** `CHECK` constraints pinning `chart_of_accounts.type`/`nature` to their enums — closes the COA-3 input/DB gap.

**Wire declared-but-dead governance (RC-4):**
- **[D]** Decide per item: *wire or delete*. The `vouchers` table (VL-5), the voucher `approve` endpoint (VL-2), and the `financial_periods.locked` status + `lockedAt/By` columns (PER-3) are each "declared, not wired." Either route real data/transitions through them or remove the dead schema — the current half-state is the hazard.
- **[D]** Whether a voucher should have a draft→approved→posted lifecycle at all (VL-1) is a finance-policy decision, and touches the state-machine layer the owner has frozen — flagged for the owner, not actioned here.

**Relocate gates from route to operation (RC-3):**
- **[S]** Add the missing branch predicate to `GET /journal/:id` and `/journal/:id/reverse` (BR-2) — a contained route fix.
- **[S]** Make the manual-journal period gate check the entry's `date`, not `todayISO()` (PER-2) — a contained route fix.
- **[D]** Extending `requireGuards`/period checks to the scheduler and engine posts (PG-1) depends on RC-1 below.

**RC-1 — consolidate to one posting primitive:**
- **[D]** This is the root cause behind the worst P0s, and consolidating `gl/posting.ts` and `createJournalEntry` into one primitive **is a refactor** — larger than an increment and outside this RCA's mandate to execute. It is the single highest-value remediation and should be sequenced as an explicit, owner-scoped track. Until then, PD-1/PD-6/PG-2 remain open by construction.

---

## 6. Explicitly out of scope

- This RCA **does not change code** and opens no code PR.
- Per the Finance Governance Lead mandate, it does not pursue **broad refactor, queues, or runtime infrastructure**. RC-1's remediation is named as a refactor and deliberately left as an owner-sequenced decision.
- Findings that touch **RBAC, state machines, or the branch model** (VL-1, VL-2, PER-3) are analysed but their remediation is flagged **[D]** — owner decision — because those layers are frozen for this lead.
- No runtime verification was performed; all claims are static and carry `file:line` evidence for independent confirmation.
