# RCA — Invoice Approval Runtime Integrity

Track: **Finance Critical Remediation — Wave 1**
Scope: invoice approve flow · PATCH↔POST `/approve` mismatch · GL posting
integrity · approval amount limit · audit/event correctness for this flow.
Mode: static code-trace (runtime not available — see §8).

---

## 1. The defect

Approving a customer invoice **through the UI posts nothing to the general
ledger**. Two handlers exist for the same path:

| Handler | File:line | What it does |
|---|---|---|
| `POST /invoices/:id/approve` | `finance-invoices.ts:570-663` | `applyTransition` draft→approved **+ `postJournalEntry` (DR AR / CR Revenue / CR VAT)** + client revenue + budget consumption + event. RBAC `action:"approve"` **with `amount` limit**. |
| `PATCH /invoices/:id/approve` | `finance-invoices.ts:1073` → `invoiceApprovalAction` (`:996-1071`) | `applyTransition` draft→approved + `approval_actions` row + notification. **No `postJournalEntry`.** RBAC `action:"update"` — **no `amount` limit**. |

The UI's `ApprovalActions` was hardcoded to **`approveMethod="PATCH"`**
(`invoice-detail.tsx:449`, `invoices.tsx:254`) — so every UI approval hit the
GL-less, limit-less handler. The GL-correct `POST` handler had **zero callers**.

**Consequences:** approved invoices have no journal entry; revenue and AR are
never recognised; a later payment posts `DR Cash / CR AR` against an AR that was
never debited (AR drifts negative); the reject/return/delete GL-reversal logic
(which looks up `JE-<ref>`) silently no-ops because `JE-<ref>` never existed; and
any user with `finance:update` can approve an invoice of any amount.

---

## 2. Caller enumeration

Exhaustive grep of `artifacts/ghayth-erp/src` and the backend.

**`PATCH /invoices/:id/approve` — callers (2, both via `ApprovalActions`):**
- `pages/finance/invoice-detail.tsx:443-456` — gated by `invoice.status==="draft"`.
- `pages/finance/invoices.tsx:248-261` — list expanded-row, gated by
  `inv.status==="pending_approval"`.

**`POST /invoices/:id/approve` — callers: none** (orphan handler before this fix).

**`reject` / `return`:** only `PATCH /invoices/:id/reject` and `/return` exist
(`finance-invoices.ts:1074-1075`, same `invoiceApprovalAction`); both call sites
use them via `rejectMethod`/`returnMethod="PATCH"`.

**Other surfaces checked — none apply to invoices:**
- `lib/approval-registry.ts` — has no `invoice` entry (manager-board /
  action-center never approve invoices).
- Bulk approve uses a *different* endpoint (`/entity-meta/bulk-action`) — out of
  this Wave's scope; noted in the functional verification report, not touched here.
- No backend-internal caller of either route.

**`ApprovalActions` component** (`components/approval-actions.tsx`) already
supports a per-action method (`approveMethod` prop, `:52`/`:93`) and forwards it
to `apiFetch(endpoint,{method,body})` (`:115`). The response is not consumed, so
the `POST` handler returning the invoice row vs the `PATCH` handler returning
`{message,status}` is immaterial. `approveBody={()=>({})}` sends an empty body;
the `POST` handler reads the invoice from the DB and does not parse the body.

---

## 3. Options considered & decision

| Option | Description | Blast radius | Verdict |
|---|---|---|---|
| A | Add `postJournalEntry` into the PATCH handler | Duplicates the GL block already in `POST /approve` | ❌ rejected — duplication is explicitly forbidden; two GL code paths to keep in sync |
| B | **Point the UI at the existing `POST /approve`** | 2 frontend lines | ✅ **chosen** — least blast radius, single canonical GL path, no backend change |
| C | Extract a shared approval orchestrator both routes call | New module + both routes refactored | ❌ rejected — wide refactor, out of Wave-1 scope |

**Decision: Option B.** `POST /invoices/:id/approve` is already the complete,
correct path (GL + amount limit + revenue + budget + event + idempotency). The
only defect is that the UI never called it. Switch the UI; change nothing else.

---

## 4. The fix

**(a) Route the UI at the GL handler** — `approveMethod` `"PATCH"` → `"POST"` at
both call sites (`invoice-detail.tsx`, `invoices.tsx`). `rejectMethod` /
`returnMethod` stay `"PATCH"` — those handlers are correct, and once approval
posts `JE-<ref>` their reversal lookup starts succeeding. The
`approveMethod="POST"` / `rejectMethod="PATCH"` asymmetry is deliberate; this RCA
is the durable record of why a future "make the methods consistent" cleanup must
not revert `approveMethod` to `"PATCH"`.

**(b) Align the invoices-list approve gate with the POST path** — see §5.1. The
list rendered `ApprovalActions` for `status==="pending_approval"`, a status the
approve transition never accepts; the gate is changed to `status==="draft"`,
matching `invoice-detail.tsx` and the POST handler's `fromStates`.

**No backend change. No migration. No GL-engine change. No new code path.**

---

## 5. Before / after (static trace)

| Dimension | BEFORE — UI uses PATCH | AFTER — UI uses POST |
|---|---|---|
| invoice status | draft→approved ✓ (`applyTransition`) | draft→approved ✓ (same `applyTransition`, `fromStates:["draft","returned"]`) |
| `journal_entries` | **none created** ❌ | `JE-<ref>` row created, balanced (`:616-633`) ✓ |
| `journal_lines` | **none** ❌ | DR AR · CR Revenue · CR VAT ✓ |
| AR effect | AR never debited ❌ | AR debited by `total`; `clients.totalRevenue += base` (`:637-642`) ✓ |
| payment compatibility | `POST /payment` does `DR Cash / CR AR` against an un-debited AR → AR negative ❌ | AR debited at approval → payment's `CR AR` offsets correctly ✓ |
| reversal / delete | reject/return/delete look up `JE-<ref>` → not found → reversal silently skipped (`:1030` `if (je && …)`) ❌ | `JE-<ref>` exists → reject/return/delete reversal works ✓ |
| `audit_logs` | status transition audited via `applyTransition` ✓ (no GL audit) | transition + GL posting audited ✓ |
| `event_logs` | transition event via `applyTransition` ✓ | transition event + explicit `invoice.approved` emit (`:651`) ✓ |
| approval amount limit | **not enforced** — `authorize({action:"update"})` ❌ | enforced — `authorize({action:"approve", amount:{from:"resource",field:"total"}})` ✓ |
| budget consumption | not updated ❌ | `budgets.used += base` at approval (`:646-649`) ✓ |

## 5.1 UI approve-button gating vs POST `fromStates`

`INVOICE_TRANSITIONS` (`finance-invoices.ts:146-160`) lists `approved` as a target
only from `draft` and `returned`. There is **no `pending_approval` key** at all.
Both approve handlers accept exactly `["draft","returned"]`: `POST /approve`
hardcodes it (`:602`); `PATCH /approve` derives the identical set (`:1009-1011`).

| UI surface | approve shown for | POST accepts it? | verdict |
|---|---|---|---|
| `invoice-detail.tsx:439` | `status==="draft"` only | yes | ✅ safe — subset of POST's set |
| `invoices.tsx:247` (before) | `status==="pending_approval"` only | **no** | ❌ broken button |

The `invoices.tsx` button was already broken **before this PR** — `PATCH /approve`
also rejected `pending_approval` (same derived `fromStates`), so the switch to
POST does **not** regress it (it was always a transition error there, never a
silent "no-GL" success — that only happened on `draft`). Fix (b) changes the gate
to `status==="draft"` so every approve button shown lands on a status the POST
handler accepts. `invoice-detail.tsx` already gates on `draft` — no change needed.

**Out of scope (lifecycle-model gap):** `pending_approval` is a valid invoice
status (`seedDemoData` seeds it) yet has no entry in `INVOICE_TRANSITIONS` — such
invoices have no outbound transition. Adding one is a backend lifecycle change
for a later wave; not touched here.

## 6. Double-posting / idempotency

`POST /approve`'s `postJournalEntry` uses `sourceKey:"finance:invoice_approval:${id}"`
plus `guardTable:"invoices", guardId:id`, and the route calls
`markIdempotencyReplay` — a repeated approve returns `alreadyExists` and posts
**no second entry**. Independently, `applyTransition` only accepts
`fromStates:["draft","returned"]`, so a second approve of an already-approved
invoice fails the transition. Two independent guards ⇒ **no double-posting**.

## 7. Residual & recommended follow-up

`PATCH /invoices/:id/approve` (`finance-invoices.ts:1073`) remains registered but
now has **zero callers**. It is still a GL-less, limit-less approve endpoint
reachable by a direct API client. Removing/disabling it is recommended as a
**small follow-up** — deliberately left out of this PR to keep the change
frontend-only and minimal per the Wave-1 constraint; flagged for owner decision.

The `pending_approval` lifecycle-model gap noted in §5.1 is likewise left for a
later wave — it needs a backend `INVOICE_TRANSITIONS` change, outside this Wave's
frontend-only scope.

## 8. Guard & runtime

- **Guard:** `scripts/guard.sh` (typecheck + lint + full test suite) runs via the
  pre-commit hook on this branch; result reported on the PR.
- **Runtime smoke:** not possible — the app is not runnable without an
  environment change (no `.env`; needs Postgres + migrations + seed). An
  invoice-only runtime smoke is therefore deferred; the before/after evidence
  above is a static trace. Recommended runtime check once an environment exists:
  approve a draft invoice from the UI → assert one balanced `JE-<ref>` row in
  `journal_entries`/`journal_lines`, AR debited, and an over-limit invoice
  rejected with `APPROVAL_LIMIT_EXCEEDED`.

## 9. Blast radius

2 files · frontend only · `approveMethod` value (×2 sites) + the invoices-list
approve-button status gate (×1) · 0 backend · 0 migration · 0 dependency change.
