# RCA — Manual Journal Posting Integrity

Track: **Finance Critical Remediation — Wave 2**
Scope: `finance-hardening.ts` manual-journal flow only. Approach **A** (approved):
stop GL posting at draft creation; post the ledger effect once, at `/post`.
Mode: static code-trace (runtime verification deferred to Replit — see §8).

---

## 1. Lifecycle trace

`draft → pending_review → approved → posted` (rejection is terminal):

| Step | Route | Action |
|---|---|---|
| create | `POST /journal-manual` (`finance-hardening.ts:382`) | persists the journal |
| submit | `PATCH /journal-manual/:id/submit` (`:539`) | `applyTransition` approvalStatus `draft→pending_review` |
| review | `PATCH /journal-manual/:id/review` (`:576`) | `applyTransition` `pending_review→approved\|rejected` |
| approve | `PATCH /journal-manual/:id/approve` (`:640`) | `applyTransition` `pending_review→approved\|rejected` |
| post | `PATCH /journal-manual/:id/post` (`:692`) | `applyTransition` approvalStatus `approved→posted` |

submit/review/approve are pure `applyTransition` calls on the `approvalStatus`
column — they touch neither `status` nor the ledger. They are correct and are
**not modified** by this PR.

## 2. The defect (before)

`POST /journal-manual` called `financialEngine.postJournalEntry` **at creation**.
Trace: `financialEngine.postJournalEntry` → `createJournalEntry`
(`businessHelpers.ts:413`):

- `createJournalEntry` INSERTs `journal_entries` **without a `status`**
  (`:522` — column omitted) → DB default applies: **`status='posted'`**
  (`lib/db/src/schema/index.ts:155` — `.default("posted")`).
- In the same transaction it INSERTs `journal_lines` and runs
  `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + delta`
  for every line (`:564-569`) — **unconditionally, regardless of status**.
- `financialEngine.applyHeaderOverrides` then stamps `approvalStatus='draft'`,
  `isManual=true`.

→ A manual journal in `approvalStatus='draft'` was already `status='posted'`,
with `journal_lines` and **moved account balances** — fully in the ledger and
in every `status='posted'` report **before any review**.
`/post` only flipped `approvalStatus` and re-wrote `status='posted'` (already
posted) — the "posting" was a no-op. Rejection flipped `approvalStatus='rejected'`
but left `status='posted'`, the lines, and the balances — **a rejected journal
stayed in the ledger permanently, with no reversal**.

## 3. Where journal rows / balances are written — proof

| Artefact | Before | After (this PR) |
|---|---|---|
| `journal_entries` row | created at draft, `status='posted'` | created at draft, **`status='draft'`** |
| `journal_lines` rows | created at draft | created at draft (parent is `status='draft'`) |
| `chart_of_accounts.currentBalance` | moved at draft creation | moved **only at `/post`** |
| `status` → `'posted'` | DB default at creation | set by `applyTransition` at `/post` |

## 4. Consumers / side-effects analysis

Every reader of manual journals was checked for a dependency on draft-time
posting. **None breaks; the report consumer is corrected:**

- `GET /journal-manual`, `GET /journal-manual/:id` (`finance-hardening.ts`) —
  filter `isManual=TRUE`, no `status` filter → drafts still listed/visible. ✓
- Dashboard pending-journals widget — filters `approvalStatus`, not `status`. ✓
- `GET /finance/journal` (`finance-journal.ts:1014`) — selects `je.status`, no
  `status`/`isManual` filter → a draft now correctly reads `status='draft'`
  instead of a misleading `'posted'`. ✓
- **`finance-reports.ts`** — every report joins `je.status = 'posted'`
  (`:103,135,161,224,244,…`). Before: a draft manual journal (`status='posted'`)
  **wrongly** appeared in trial-balance / income-statement / balance-sheet.
  After: excluded until `/post`. **This is the fix, not a regression.** ✓
- Hourly-escalation cron (`cronScheduler.ts:917`) — `UPDATE journal_entries SET
  status='posted' WHERE status='pending_approval'`, only for refTypes
  `expense/salary_advance/custody`. Manual-journal drafts are `status='draft'`
  and not in that set → untouched. ✓
- Reversal/delete — `POST /journal/:id/reverse` operates on posted journals;
  a posted manual journal (post-`/post`) is `status='posted'` with balances
  applied, identical to any posted entry → reverse/delete behave as before. A
  draft has no balances, so there is nothing to reverse. ✓

No consumer expects a manual `journal_entries` row to be posted before `/post`.

## 5. The fix

Two local helpers in `finance-hardening.ts` (no other file changed):

- **`insertDraftManualJournal`** — `POST /journal-manual` now calls this instead
  of `financialEngine.postJournalEntry`. It posts via the allow-listed GL
  primitive `lib/gl/posting.ts → postJournalEntry` with **`status:"draft"`** —
  which writes `journal_entries`/`journal_lines` but does **not** move
  `currentBalance` — then stamps the manual-workflow columns
  (`approvalStatus='draft'`, `isManual=TRUE`, `costCenter`, `sourceKey`).
  sourceKey idempotency is preserved by a pre-check.
- **`postManualJournalToLedger`** — `/post`, after the `approvalStatus`
  transition to `posted` succeeds, applies the deferred ledger effect: moves
  `chart_of_accounts.currentBalance` by each line's `debit−credit` (the same
  maths `createJournalEntry` used). `status` is flipped to `'posted'` by the
  existing `applyTransition` `setExtras`. A financial-period-open guard runs at
  the start of `/post` — relocated from draft-creation to its correct place,
  posting time.

`createJournalEntry`, `financialEngine`, the lifecycle engine, migrations and
all other domains are **untouched**. No raw `INSERT INTO journal_entries`
(GL-boundary compliant — posting goes through `lib/gl/posting.ts`).

## 6. Acceptance criteria

| Criterion | Status |
|---|---|
| Before: draft manual journal writes GL directly | ✅ confirmed (§2) |
| Before: reject does not reverse it | ✅ confirmed (§2) |
| Before: ledger is distorted | ✅ confirmed (§2,§4) |
| After: draft/review/reject produce **no ledger effect** — rows exist as `status='draft'`, excluded from every `status='posted'` report and from `currentBalance` | ✅ |
| After: ledger effect (`status='posted'` + `currentBalance`) happens once, at `/post` | ✅ |
| After: reject/return need no reversal — a draft never had a ledger effect | ✅ |
| After: no double-posting | ✅ (§7) |
| After: existing posted journals unaffected | ✅ — change touches only the manual-journal create/post paths; existing rows are not migrated or re-read |
| After: audit/event semantics preserved | ✅ — creation still emits `journal.manual_created` + audit; `/post` still events/audits via `applyTransition` |

## 7. Double-posting, idempotency, residuals

- **No double-posting.** `/post` applies the balance only after
  `applyTransition` succeeds, and that transition accepts `fromStates:
  ['approved']` on `approvalStatus` — a retried `/post` fails the transition,
  so `postManualJournalToLedger` runs at most once.
- **Idempotent creation.** `insertDraftManualJournal` pre-checks `sourceKey`
  (`finance:manual:<ref>`, ref = `MJE-<idempotency-token>`) — a replayed create
  returns the existing draft, same as `financialEngine` did.
- **Residual (documented, accepted):** if `applyTransition` at `/post` commits
  but `postManualJournalToLedger` then fails, `journal_entries`/`journal_lines`
  are correct (`status='posted'`) while the `currentBalance` *cache* is stale —
  recoverable by recompute, never a ledger error. This mirrors the existing
  applyTransition-then-GL ordering in `finance-invoices.ts POST /approve`; no
  new atomicity mechanism is introduced (would exceed "no orchestration
  rewrite").
- **Behaviour note:** `lib/gl/posting.ts` validates each line's account is
  postable (`allowPosting=true`) — a manual journal referencing a non-postable
  account now fails at creation. This is stricter and correct.
- **Out of scope:** `pending_approval` as a `journal_entries.status` value, and
  removal of the dead `PATCH /invoices/:id/approve` route — separate waves.

## 8. Runtime verification plan (for Replit)

Static analysis only here — no DB in this environment. To verify at runtime:

1. **Draft has no ledger effect** — create a manual journal; assert its
   `journal_entries.status='draft'`, it does **not** appear in
   `/finance/reports/trial-balance`, and `chart_of_accounts.currentBalance` for
   its accounts is unchanged.
2. **Reject leaves no GL** — submit → review-reject; assert `status` still
   `'draft'`, balances still unchanged, no reversal entry.
3. **Post writes GL once** — submit → review-approve → `/post`; assert
   `status='posted'`, the entry now appears in trial-balance, and
   `currentBalance` moved by exactly `debit−credit` per account.
4. **No double-posting** — call `/post` twice; second call returns a lifecycle
   error and balances move only once.
5. **Closed-period guard** — `/post` into a closed period is rejected.

## 9. Blast radius

1 file (`finance-hardening.ts`): 2 import additions, 2 new local helpers, the
`POST` body swapped to `insertDraftManualJournal`, `/post` gains a period guard
+ a `postManualJournalToLedger` call. 0 other files, 0 migrations, 0 engine
changes.
