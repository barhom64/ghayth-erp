# U-13c — Sensitive Permission Isolation Audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §7.

**Backlog title:** "Isolate sensitive permission actions
(approve / cancel / close / print / export)" — the canonical
governance U-13 item. Filed as **U-13c** (the **c**anonical
permission-isolation item) because this session previously used
"U-13" as an unrelated identifier (BILL-MAIN), per the
roadmap §0 reconciliation merged at `de14460c`.

**TL;DR:** Five sensitive-action surfaces inspected across
`routes/umrah.ts` + `routes/umrah-entities.ts`. **0 / 5 use an
isolated permission verb.** All five are lumped under generic
CRUD verbs (`update` / `list`). The most acute gap is the
pilgrim CSV export which requires only `action: "list"` —
i.e. any operator who can see the pilgrim list can also
exfiltrate full PII (passport / visa / DOB). All fixes are
behaviour changes (the verb operators carry today would stop
working on these handlers) → 🔴 hard-pause.

---

## 1. Method

For each sensitive verb (approve / cancel / close / print /
export) the audit inspected every umrah router declaration in:

- `artifacts/api-server/src/routes/umrah.ts`
- `artifacts/api-server/src/routes/umrah-entities.ts`

A handler is **ISOLATED** when its `authorize({ feature, action })`
guard uses a dedicated verb that matches the sensitive action
(e.g. `action: "approve"`). It is **NOT ISOLATED** when the
verb is one of the generic CRUD set (`create` / `update` /
`delete` / `view` / `list`).

---

## 2. Inventory

### 2.1 approve

| Handler | Guard | Verdict |
| --- | --- | --- |
| `POST /refund-requests/:id/approve` | `action: "update"` | ❌ NOT ISOLATED — lumped with generic update |

### 2.2 cancel

No explicit cancel endpoints. Cancellation flows through
generic `PATCH /...` on pilgrim/violation/transport/invoice/
nusk-invoice with `action: "update"`. **No isolated cancel
guard exists** for any umrah entity.

### 2.3 close

| Handler | Guard | Verdict |
| --- | --- | --- |
| `PATCH /seasons/:id` (status=closed/archived) | `action: "update"` | ❌ NOT ISOLATED |
| `POST /refund-requests/:id/close` | `action: "update"` | ❌ NOT ISOLATED |

### 2.4 print

No dedicated print endpoints. Letter dispatch
(`POST /letters/:id/dispatch` with `dispatchedVia: "print"`)
uses `action: "update"`. Daily-runsheet / transport-manifest
reads use `action: "view"` (read-level).

### 2.5 export

| Handler | Guard | Verdict |
| --- | --- | --- |
| `GET /pilgrims/export.csv` | `action: "list"` | ❌ NOT ISOLATED — **read-level guard exporting full PII** |

---

## 3. Findings ranked by severity

### 3.1 🔴 Pilgrim CSV export at read-level guard

`GET /pilgrims/export.csv` requires only `action: "list"`. The
exported rows carry full PII: passport numbers, visa numbers,
nationality, dates of birth. **Any role with the list-level
view permission can exfiltrate the entire pilgrim directory in
one request.** This is the audit's headline finding.

### 3.2 🟠 Refund approval lumped with generic update

`POST /refund-requests/:id/approve` uses `action: "update"`. An
operator who can PATCH a refund's notes can also approve the
refund payment. **No separation of duties** between editorial
and financial-final authority.

### 3.3 🟠 Season + refund close lumped with generic update

Closing a season is a terminal operational state. Closing a
refund request finalises the payment record. Both use
`action: "update"`. **No dedicated close guard.**

### 3.4 🟡 No isolated cancel guard anywhere

Cancellation is performed via PATCH on the entity with a
status transition. The audit trail records the update but the
RBAC layer cannot distinguish "the operator edited a note"
from "the operator cancelled an invoice".

### 3.5 🟡 No dedicated print guard

Print dispatch shares the generic update verb. Printing is
typically a record-of-action (regulatory paper trail), so a
dedicated guard would let companies enforce dual-control on
print.

---

## 4. Why every fix is hard-pause

Each gap above has the same shape: change the guard's `action`
value on the handler. That instantly changes who can call the
endpoint — any role that does NOT carry the new verb starts
seeing 403s on a workflow they could complete yesterday. This
is a behavioural change for production operators and a
permissions-class change per the roadmap §3 hard-pause list:

> "No PR may change permissions without separate authorisation."

Recovery shape (for the eventual implementation track,
**not in this PR**):

1. Add the five new verbs to the umrah feature's permission
   catalog: `approve`, `cancel`, `close`, `print`, `export`.
2. Grant these new verbs to roles that today carry the
   generic verbs they replace — backward-compat default so
   no operator loses access on day 1.
3. Switch the handlers to the new verbs one by one. Each
   switch is a small PR with its own smoke.
4. Add a smoke that pins every sensitive handler against its
   dedicated verb so a future PR can't accidentally regress
   to a generic verb.

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No guard change on any handler.
- ❌ No new permission verb declared.
- ❌ No role grant edit.
- ❌ No FE change.
- ❌ No new route.
- ❌ U-12 not opened. U-02b stopped at M5b. BILL-MAIN P4+
  remains hard-pause.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change. The existing 13 umrah smokes
   (223/223) continue to protect the surface unchanged.

---

## 7. Closure verdict

- 🟡 **U-13c closes with PERMISSION ISOLATION GAP
  DOCUMENTED.** Score: 0/5 sensitive actions are properly
  isolated. The pilgrim CSV export is the headline PII
  exposure.
- ➜ **Suggested follow-up track** (hard-pause):
  **PERM-ISO-UMRAH** — sequenced four-step roll-out per §4.
- ➜ **Next autonomous audit per roadmap §8:** U-08 (E2E import
  test with false-success-prevention contract).
