# Finance Critical Remediation — Unified Final Report

Generated: 2026-05-21
Track: Finance Critical Remediation (Waves 1–9)
Basis: `docs/audit/FUNCTIONAL_FINANCE_VERIFICATION.md` (the functional verification
that opened this track). Mode: static remediation; runtime verification deferred
to Replit (no DB in this environment).
Status (2026-05-21): all six fix waves are **merged to `main`** —
#728/#729, #730, #731, #732, #734, #736. This report is delivered via PR #737.

---

## 0. Executive summary

The Finance Critical Remediation track addressed the highest-severity defects
the functional verification surfaced. **Six waves shipped as scoped fix PRs;
three waves resolved to architectural Decision Tracks** that require an owner
decision rather than a code fix.

The headline result: the **single most damaging defect — invoice approval
posting nothing to the general ledger — is fixed** (Wave 1, merged), and the
ledger is no longer polluted by unposted manual journals (Wave 2, merged). The
remaining critical-but-architectural items (vouchers, salary advances,
purchasing GL chain) are documented below with options and recommendations.

Every shipped wave passed `guard.sh` (typecheck + lint + 4240 tests). **None is
runtime-verified** — see §6.

---

## 1. Fixed

| Wave | Title | PR | Status | What it fixed |
|---|---|---|---|---|
| 1 | Invoice Approval Runtime Integrity | #728, #729 | ✅ merged | UI approve hit `PATCH /approve` (status-only, no GL, no amount-limit). Routed it to `POST /approve` → posts DR AR / CR Revenue / CR VAT and enforces `rbac_approval_limits`. #729 aligned the invoices-list approve gate (`pending_approval`→`draft`) with the POST `fromStates`. |
| 2 | Manual Journal Posting Integrity | #730 | ✅ merged | `POST /journal-manual` posted GL at draft creation (`status='posted'` + balances moved); rejected drafts were never reversed. Now creates an unposted `status='draft'` entry via `lib/gl/posting.ts`; the ledger effect (status→posted + `currentBalance`) happens once, at `/post`, behind a financial-period guard. |
| 4 | Financial-Request Approval | #731 | ✅ merged | `PATCH /financial-requests/:id/approve` ran `applyTransition` on `workflow_instances`, but the GET endpoints read `workflow_requests` — a different table/id-sequence. Approve hit a non-existent or unrelated row. Pointed the transition at `workflow_requests`. |
| 7-C7 | Bank Manual-Match Contract | #732 | ✅ merged | `bank-manual-match.tsx` read the wrong response key (`.lines` vs `.rows`), searched `/finance/journal` (journal *entries*) and passed an entry id where a journal *line* id was required, and POSTed `bankLineId` (schema wants `bankStatementId`). Manual matching was 100% broken; now aligned to the backend contract via `/finance/journal-lines/search`. |
| 8 | Route Integrity | #734 | ✅ merged | Added `requireGuards("financial")` to the `finance-hardening` mount (it bypassed the financial system-governor guard every sibling router has); removed the dead `GET /stats` in `finance-vendors.ts` (shadowed by `finance-accounts.ts`); fixed the ZATCA `enabled` toggle (sent as a string `"true"`/`"false"` against a `z.boolean()` schema → never persisted → ZATCA submission stayed blocked). |
| 9 | List Summaries + CashFlow Shape | #736 | ✅ merged | Four list endpoints (`/receivables`, `/payments`, `/commitments`, `/financial-requests`) never returned the `summary` object their pages read → every KPI card showed 0. Added aggregated summaries. `GET /reports/cash-flow` now returns flat `inflows`/`outflows` arrays → the CashFlow report tab's two tables (previously always empty) populate. |

All six waves: scoped, single-purpose PRs; `guard.sh` green locally; precise
runtime test plans in each PR body.

---

## 2. Deferred (non-blocking follow-ups)

- **Dead `GET`/`POST /journal` in `finance-accounts.ts`** — shadowed by
  `finance-journal.ts` (`journalRouter` mounts first), so they never execute.
  Removal cascades into orphaned-import/schema cleanup (`JournalEntryWithLinesRow`,
  `createJournalSchema`, ~5 imports) across the file top — that crosses into the
  "broad refactor" Wave 8 explicitly excluded. The routes are **inert** (zero
  runtime risk); recommend a dedicated tiny cleanup PR.
- **Functional-verification backlog** — the orphan-subsystem UIs (FX, dunning,
  bad-debt, customer-advances, credit/debit memos, payment-run, GRN, vendor
  contracts) and the dead-UI cleanup from `FUNCTIONAL_FINANCE_VERIFICATION.md`
  are a separate **feature track**, not critical remediation.

---

## 3. Decision Tracks

Three waves are not code fixes — they are architectural decisions. Each is a
genuine defect, but resolving it requires an owner choice. **No partial fix or
workaround was applied to any of them.**

### 3.1 — Vouchers (Wave 3)

**Current behaviour.** `POST /vouchers` creates a receipt (`RV-`) or payment
(`PV-`) voucher and **immediately posts it to the GL** via
`financialEngine.postJournalEntry` — the `journal_entries` row gets
`status='posted'`, cash moves, `currentBalance` updates, all at creation. The
`voucher-detail.tsx` page renders an `ApprovalActions` card, and
`vendorsRouter.patch("/vouchers/:id/approve")` exists.

**Why structurally broken.** Vouchers have no draft/pending lifecycle. The
approve endpoint is **doubly non-functional**: (1) its `extraWhere` filters
`ref LIKE 'VOUCHER%'`, but vouchers carry `RV-`/`PV-` refs; (2) even with the ref
corrected, its `applyTransition` `fromStates:["draft","pending_approval","returned"]`
never matches a voucher whose `status` is already `'posted'`. `DELETE /vouchers/:id`
similarly guards `status='draft'` and never matches. The entire voucher-approval
surface is vestigial.

| | Option A — keep auto-posted | Option B — draft→approve→post lifecycle | Option C — hybrid |
|---|---|---|---|
| Description | Remove the dead approve endpoint + the voucher-detail `ApprovalActions` | Vouchers created `status='draft'`, GL posted only on approval (the Wave-2 pattern) | Auto-post receipts (RV, money in); require approval for payments (PV, money out) |
| GL impact | None (unchanged) | GL posting deferred to approval | Split — PV deferred, RV unchanged |
| Audit/event | Loses the (already-broken) approval trail; create event/audit remain | Gains a real approval audit trail | Real trail for PV only |
| Rollback complexity | Low (deletion only) | Medium (per-voucher-type reflow) | Medium-high |
| Migration complexity | None | None (`status` column exists) | None |
| Runtime risk | Low | Medium (changes when cash posts) | Medium |

**Recommendation: B** (or **C** as an interim). A payment voucher disbursing
cash with zero enforced approval is a real internal-control gap. B aligns
vouchers with the manual-journal model already shipped in Wave 2. Option A is
**not** recommended — it cements the control gap — and is acceptable only if the
business explicitly accepts unapproved voucher disbursement.

### 3.2 — Salary Advances (Wave 5)

**Current behaviour.** `POST /salary-advances` posts the advance to the GL
immediately (`financialEngine.postJournalEntry`, `status='posted'`). It then
calls `initiateApprovalChain(...)`; if approval is required it runs
`UPDATE journal_entries SET status='pending_approval' WHERE id=$1 AND status='draft'`.
The list `GET /salary-advances` projects a hardcoded `'active' AS status`.

**Why structurally broken.** Same root as vouchers — created-and-posted, no
draft lifecycle. Plus a concrete creation bug: the `status='draft'` guard on the
`pending_approval` UPDATE **never matches** (the row is `'posted'`), so when an
approval chain is configured `POST /salary-advances` updates 0 rows and **throws
`NotFoundError` — advance creation hard-fails**. The hardcoded `'active'` masks
the real status, so the list's approval buttons (`pendingStatuses:["pending"]`)
never render. The approve `fromStates` never match a posted advance, and reject
posts no GL reversal.

Options A/B/C are analogous to §3.1 (auto-post + remove scaffolding / full
lifecycle / hybrid), with the same GL / audit / rollback / migration / runtime
profile.

**Recommendation: B.** Salary advances are employee cash disbursements that
should be approved before the money moves — the Wave-2 pattern fits exactly.
**Independent of the lifecycle decision**, the `POST /salary-advances`
`NotFoundError`-on-approval-chain bug should be fixed — it can hard-fail advance
creation today.

### 3.3 — Purchasing GL Chain (Wave 6)

**Current behaviour.** PO lifecycle: PR → approve → convert to PO → approve →
receive (GRN) → 3-way match → schedule-payment → payment-run. GRN posts
`DR Inventory / DR VAT / CR GRNI`.

**Why structurally broken.**
1. **`match-invoice` posts no GL clearing entry.** When the supplier invoice is
   matched, the GRNI liability should clear via `DR GRNI / CR AP`. It does not.
   `payment-run` then posts `DR AP / CR Cash` against an AP that was never
   credited → **AP subledger understated, GRNI accumulates forever.**
2. **`invoice_mismatch` / `payment_scheduled` are absent from the
   `chk_purchase_orders_status` CHECK constraint** → those transitions throw
   Postgres `23514`. `schedule-payment` commits its GL journal **before**
   `applyTransition`, so when the transition fails the constraint, an **orphan
   GL entry** is left.
3. The entire post-approval PO lifecycle (GRN, match, payment-run) is
   **UI-unreachable**.

| | Option A — fix GL chain + constraint | Option B — A + build the missing UI | Option C — minimal: constraint + GL ordering only |
|---|---|---|---|
| Description | Add the GRNI-clearing entry to `match-invoice`; reorder `schedule-payment` (GL after transition); migration to add the 2 CHECK values | A, plus GRN / match / payment-run UI | Only the CHECK migration + GL-ordering; defer the GRNI-clearing design |
| GL impact | Significant — touches the AP/GRNI posting chain | Same | Lower — no new GL entry, just ordering |
| Audit/event | New audit/event for the match-invoice GL | Same | Minimal |
| Rollback complexity | Medium-high (GL chain) | High | Low-medium |
| Migration complexity | **Migration required** (CHECK constraint) | Required | Required |
| Runtime risk | High — the live AP posting chain | High | Medium |

**Recommendation: A**, as its own carefully-scoped wave with **explicit
migration authorization** and a dedicated executive RCA. The GRNI/AP gap is a
real accounting-integrity defect. This is the highest-effort, highest-care
Decision Track — it must not be rushed.

---

## 4. Operational integrity status

With all six fix waves merged to `main`, the Finance operational path stands at:

- **Invoice → GL:** ✅ correct — UI approval posts a balanced journal entry and
  enforces approval limits (Wave 1).
- **Manual journals:** ✅ correct — drafts no longer touch the ledger; posting
  happens once, at `/post` (Wave 2).
- **Financial-request approval:** ✅ correct table (Wave 4).
- **Bank manual reconciliation:** ✅ contract aligned — matching works (Wave 7).
- **finance-hardening RBAC / ZATCA / dead routes:** ✅ cleaned (Wave 8).
- **List KPIs + CashFlow report tables:** ✅ populated (Wave 9).
- **Vouchers / salary advances:** ❌ still post cash with no enforced approval
  (Decision Tracks 3.1, 3.2).
- **Purchasing AP/GRNI chain:** ❌ structurally broken (Decision Track 3.3).

Net: the catastrophic ledger-integrity holes (invoice GL, manual-journal
pollution) are closed; the remaining integrity gaps are the three Decision
Tracks plus the non-critical functional backlog.

---

## 5. Remaining finance risks

1. **Unapproved cash disbursement** — vouchers and salary advances post cash
   with no enforced approval (Decision Tracks 3.1, 3.2). *Severity: high.*
2. **AP understated / GRNI never cleared** — the purchasing match-invoice gap
   (Decision Track 3.3). *Severity: high — financial-statement correctness.*
3. **Salary-advance creation can hard-fail** when an approval chain is
   configured (the `NotFoundError` bug, §3.2). *Severity: medium-high.*
4. **All six waves are runtime-unverified** — see §6.
5. **Inert dead routes** in `finance-accounts.ts` (§2). *Severity: low.*
6. **Functional-verification backlog** — orphan subsystems / dead UI
   (`FUNCTIONAL_FINANCE_VERIFICATION.md`). *Severity: medium, non-critical.*

---

## 6. Runtime confidence

**Static-high, runtime-unverified.** Every shipped wave passed the full
`guard.sh` gate — TypeScript typecheck, pattern/GL-boundary lints, route/schema
audits, and the 4240-test vitest suite. But **no wave has been executed against
a running instance** — this environment has no database (`check:schema-drift`
and `check:ghost-rows` skip for that reason), so the verification throughout the
track is static code-tracing.

Each PR carries a precise, scenario-level runtime test plan. **Recommendation:**
run Replit (or any DB-backed) runtime verification on the six merged waves —
in particular the GL-affecting waves (1, 2) and the contract-alignment waves
(4, 7, 9). The static evidence is strong but is not a substitute for a live
ledger assertion.

---

## 7. Recommended next-wave ordering

1. **Runtime-verify the six merged fix waves** — #728/#729, #730, #731, #732,
   #734, #736 (all merged to `main`). Highest priority — confirm each fix
   against a live ledger.
2. **Decision Track 3.3 — Purchasing GL chain** — highest integrity risk (AP
   understated). Needs explicit migration authorization + a dedicated executive
   RCA before any code.
3. **Decision Tracks 3.1 + 3.2 — vouchers & salary advances** — make the
   auto-post-vs-lifecycle decision once; if "lifecycle", execute as one combined
   wave (both share the Wave-2 pattern). Fix the salary-advance creation bug
   (§3.2) regardless of that decision.
4. **Deferred cleanup** — remove the inert `finance-accounts.ts` dead `/journal`
   routes (trivial, zero-risk).
5. **Functional-verification backlog** — orphan-subsystem UIs and dead-UI
   cleanup, as a separate feature track.

---

## Appendix — track artefacts

- `docs/audit/FUNCTIONAL_FINANCE_VERIFICATION.md` — the opening verification.
- `docs/audit/FINANCE_INVOICE_APPROVAL_RCA.md` — Wave 1 RCA.
- `docs/audit/FINANCE_MANUAL_JOURNAL_RCA.md` — Wave 2 RCA.
- PRs: #728, #729 (Wave 1) · #730 (Wave 2) · #731 (Wave 4) · #732 (Wave 7-C7) ·
  #734 (Wave 8) · #736 (Wave 9).
