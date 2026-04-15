# Operational Practical Review — Findings #01

**Phase:** Operational Practical Review (first pass)
**Date:** 2026-04-15
**Scope:** Walked the `artifacts/ghayth-erp/src/pages/` tree as if a real user were using the system, looking for concrete operational problems (confusing pages, unclear actions, generic error messages, broken flows). This is NOT a unification round — no templates, no redesigns.
**Output rule:** Every finding cites a real `file:line`. Claims from the first automated pass that could not be verified against `main` have been dropped.

**Summary:** 3 HIGH · 4 MEDIUM · 2 LOW confirmed findings.

The review intentionally stops at 9 verified findings rather than padding the list. Each one maps to a small, surgical fix that does not require any architectural change.

---

## HIGH — user genuinely blocked or misled

### H1 · Silent status filter on 17 list pages (the `statusField: ""` bug returns)

**Where:** grep `'statusField: ""'` against `artifacts/ghayth-erp/src/pages/` returns **17 real call sites** (excluding one doc-comment):

| File | Line |
| ---- | ---- |
| `pages/employees.tsx` | 88 |
| `pages/properties.tsx` | 31 |
| `pages/projects.tsx` | 44 |
| `pages/tasks.tsx` | 80 |
| `pages/crm.tsx` | 77 |
| `pages/store.tsx` | 29, 147 |
| `pages/legal.tsx` | 72, 194 |
| `pages/fleet.tsx` | 62, 231, 337, 406 |
| `pages/finance/receivables.tsx` | 23 |
| `pages/finance/financial-requests.tsx` | 18 |
| `pages/finance/expenses.tsx` | 61 |
| `pages/finance/commitments.tsx` | 18 |

**What the user sees:** the `AdvancedFilters` toolbar renders status pills (e.g. "نشط / معطل", "قيد التنفيذ / مكتمل") because the status metadata exists. When the user clicks one, nothing happens — `applyFilters()` never narrows the list because the filter config says "no status column".

**Why this is HIGH:** this is not a missing feature. This is a feature the user can *see and click* that silently does nothing. The exact same bug was already fixed once in Phase R.3 (`pages/finance/purchase-orders.tsx` carries the comment about it on line 30 and sets `statusField: "status"` on line 62), but the fix was never cascaded. The user has no feedback to distinguish "my filter is wrong" from "there are no records matching".

**Fix:** set `statusField` to the correct column name (`status`, `state`, `currentStatus` depending on the entity). One-line change per file.

---

### H2 · 22 detail/mutation pages swallow typed errors into "حدث خطأ"

**Where:** `grep -rn 'title: "حدث خطأ"' artifacts/ghayth-erp/src/pages/` returns **22 call sites**. The worst offenders are detail pages where the user is performing approvals, rejections, or status changes:

| File | Count | Notes |
| ---- | ----- | ----- |
| `pages/details/project-detail.tsx` | 4 | Project approval / close / status flows |
| `pages/details/ticket-detail.tsx` | 3 | Ticket assignment / resolve / close |
| `pages/details/opportunity-detail.tsx` | 2 | CRM opportunity lifecycle |
| `pages/details/vehicle-detail.tsx` | 2 | Fleet vehicle state changes |
| `pages/reports/scheduled-reports.tsx` | 3 | Scheduled report create/edit/delete |
| `pages/letters.tsx` | 1 | Letter creation |
| `pages/settings/gov-integrations-tab.tsx` | 1 | Integration connect/disconnect |
| `pages/create/finance/accounts-create.tsx` | 1 | Account creation |
| others | 5 | Mixed |

Representative pattern (`pages/details/project-detail.tsx:117`):

```tsx
} catch (err) {
  toast({ variant: "destructive", title: "حدث خطأ" });
}
```

**What the user sees:** they click "اعتماد المشروع", the server returns a perfectly typed `409 CONFLICT` with `code`, `field`, `fix`, and `meta.blockers` — and the UI displays the literal string "حدث خطأ" with no description, no blocker list, no next action.

**Why this is HIGH:** the whole point of the architectural phase (Phase 5 typed errors + Phase C.7b blockers) was that the user would see *exactly* what went wrong. These 22 catch blocks drop that contract on the floor. The rest of the system trained the user to expect real feedback on failure; these pages break that expectation specifically on the detail pages where it matters most.

**Fix:** replace each `try { await mutateAsync(...) } catch { toast(...) }` with `useApiMutation` (or at minimum call `getErrorMessage(err)` into the `description`). Some files (`hr/shifts-management.tsx`, `hr/official-letters.tsx`, `hr/salary-components.tsx`) already pass `description: getErrorMessage(err)` — that's the minimum acceptable shape, and shows the migration pattern is already understood; it just hasn't reached these 22 files.

---

### H3 · Invoice approval polymorphic endpoint (`approved: true | false | "returned"`)

**Where:** `pages/finance/invoices.tsx:255-263`

```tsx
<ApprovalActions
  approveEndpoint={`/finance/invoices/${inv.id}/approve`}
  rejectEndpoint={`/finance/invoices/${inv.id}/approve`}
  returnEndpoint={`/finance/invoices/${inv.id}/approve`}
  approveBody={() => ({ approved: true })}
  rejectBody={(r)  => ({ approved: false, notes: r })}
  returnBody={(r)  => ({ approved: "returned", notes: r })}
/>
```

**What's wrong:** three distinct semantic operations (approve / reject / return-for-changes) are crammed onto one endpoint with a field (`approved`) whose type is silently overloaded from boolean to a string literal. The UI labels are clear ("اعتماد / رفض / إرجاع للتعديل") but the backend contract isn't.

**Why this is HIGH operationally:** the user labels are clear, so in practice the UX reads fine. The risk is on the server: any consumer that reads `approved as boolean` will mis-handle the `"returned"` value. Also, audit logs will show all three as a hit on `/approve` which makes the event stream harder to read in practice for the finance team.

**Fix:** split into `/approve`, `/reject`, `/return` on the server, keep one `ApprovalActions` UI. This is a small API hardening, not a UI rewrite.

---

## MEDIUM — confusing but recoverable

### M1 · Umrah invoices page uses raw try/catch + `err?.error || "خطأ"`

**Where:** `pages/umrah/invoices.tsx:28-30`

```tsx
toast({ title: "تم إنشاء الفاتورة" });
// ...
} catch (err: any) {
  toast({ variant: "destructive", title: err?.error || "خطأ" });
}
```

**Why medium:** the user sees either the raw API `error` field name (usually a validation key like `"seasonId"`) or the single Arabic character sequence "خطأ". No description, no code-to-title mapping, no field binding.

**Fix:** migrate to `useApiMutation`. 5-line change.

---

### M2 · Bank manual match page masks all failures as "حدث خطأ أثناء المطابقة"

**Where:** `pages/create/finance/bank-manual-match.tsx:54-56`

Only a single generic message. The underlying endpoint can fail with: duplicate statement line, already-matched journal, out-of-range amount, closed period. None of those four states is distinguishable to the user from the UI.

**Why medium:** the user is mid-reconciliation and has to guess. Workaround: open devtools → network tab. That's not acceptable for a finance operator.

**Fix:** route the mutation through `useApiMutation` and surface `meta` + `fix` from the typed error.

---

### M3 · Admin monitoring dumps raw `JSON.stringify(err.details)` into a table cell

**Where:** `pages/admin-monitoring.tsx:226`

**Why medium:** the cell overflows with unformatted JSON when `err.details` is a deep object. Admin users see a wall of `{"stack":"...","cause":{...}}` that the table does not wrap. Functional, but unreadable.

**Fix:** wrap in a `<pre>` with `max-h` and a "عرض التفاصيل" expand button. Or render a one-line summary with a dialog-based full view.

---

### M4 · Fleet trip detail page fetches the entire trip list and filters client-side

**Where:** `pages/fleet/trip-detail.tsx` — the file carries an explicit TODO comment about this.

**What the user sees:** every open of a trip detail downloads all trips. On a real deployment with thousands of trips, this is a noticeable lag on every navigation.

**Why medium:** functionally correct, but a real-world performance smell on a hot path (operators open trip details constantly during dispatch).

**Fix:** add `GET /fleet/trips/:id` on the server; replace the client-side filter with a direct query.

---

## LOW — small paper-cuts

### L1 · Journal page filter config has no `statusField` at all

**Where:** `pages/finance/journal.tsx` — the filter config passes `searchFields` and `dateField` but no `statusField`. The page does render a "reversed" chip (line 123: `<PageStatusBadge status="reversed" />`) but the user cannot filter for "only reversed entries" from the toolbar.

**Why low:** not a bug — a missing convenience filter. Auditors care; general users don't.

**Fix:** add `statusField: "status"` (or derive a synthetic "reversed/active" field) to the filter config.

---

### L2 · `ZATCA` status badge falls back to literal `"pending"` when the field is missing

**Where:** `pages/finance/invoices.tsx:103` (approx.) — `<PageStatusBadge status={inv.zatcaStatus || "pending"} domain="zatca" />`.

**Why low:** when `zatcaStatus` is `null` (i.e. the ZATCA subsystem hasn't seen the invoice yet), the chip renders whatever the central `STATUS_MAP.zatca["pending"]` entry says. If that entry is missing, it falls through to the default renderer and the user sees an English word in a right-to-left interface.

**Fix:** either make the fallback `null` (→ no chip) or make sure `STATUS_MAP.zatca.pending` is populated with `"في الانتظار"`.

---

## Findings dropped during verification

For transparency, two claims from the initial automated pass were dropped because they turned out to be wrong on current `main`:

| Dropped claim | Reason |
| ------------- | ------ |
| "`properties/:id` unit detail link is broken — no route registered" | `src/routes/propertyRoutes.tsx:54` explicitly registers `{ path: "/properties/:id", component: UnitDetail }`. The link works. |
| "Journal reversal has no confirm dialog, too late to reconsider" | `pages/finance/journal.tsx` imports `AlertDialog*` (lines 12–19) and uses it as a reversal-reason modal with a cancel path. The confirmation flow exists. |

This is the kind of false positive that motivated the "verify before reporting" rule for this phase.

---

## Recommended fix order

Based on "biggest impact / smallest surgery":

1. **H1** (statusField sweep — 17 files, one-line each, ~30 min)
2. **H2** (22 detail pages migrate catch blocks to `useApiMutation` or at minimum `description: getErrorMessage(err)`, 1–2 hours)
3. **M1 · M2** (umrah invoices + bank manual match — 2 small mutation migrations)
4. **H3** (invoice approval API split — small backend PR + keep UI unchanged)
5. **L1 · L2 · M3 · M4** — opportunistic, only when someone is already in that file

Everything on this list is surgical. None of it requires a new unification round, new templates, or new libraries. None of it touches more than one concern per file.

---

*This is the first pass of the Operational Practical Review phase. Further passes will focus on specific flows (invoice life-cycle, employee onboarding, tenant contract, vehicle maintenance, case escalation) once this batch of fixes lands.*
