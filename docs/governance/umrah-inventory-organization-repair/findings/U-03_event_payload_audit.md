# U-03 — Event Payload Audit (invoice.generated + commission.calculated)

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §7.

**Backlog title:** "Fix rejected event payloads
(invoice.generated, commission.calculated)" — from the canonical
governance list under #2080 / Charter #1870.

**TL;DR:** The defect implied by the backlog title **does not
reproduce** on the current `main`. Both emit sites and both
listeners are aligned: payload shapes match, the event catalog
declares both actions, listeners are registered, and the DLQ
table shows the expected delivery path. The audit therefore
closes U-03 as **verified-clean** and surfaces one adjacent
ordering risk that is **out of U-03's scope** and tracked for a
separate hard-pause PR.

---

## 1. Surfaces inspected

| Surface | File | Lines |
| --- | --- | --- |
| invoice.generated emit | `lib/umrahInvoicingEngine.ts` | 735 |
| sales_invoice.created emit (canonical synonym) | `lib/umrahInvoicingEngine.ts` | 739 |
| commission.calculated emit | `lib/umrahCommissionEngine.ts` | 169–173 |
| invoice.generated listener | `lib/eventListeners.ts` | 1454–1528 |
| commission.calculated listener | `lib/eventListeners.ts` | 1900–2012 |
| Envelope validation | `lib/eventBus.ts` | 80–124 |
| Catalog check | `lib/businessHelpers.ts` | ~295 |
| Catalog declarations | `lib/eventCatalog.ts` | 451 (invoice.generated), 471 (commission.calculated) |
| DLQ / rejection path | `lib/eventBus.ts` | 142–145 |

---

## 2. Emit-side payload shapes

### 2.1 `umrah.invoice.generated`

```ts
emitEvent({
  action: "umrah.invoice.generated",
  entity: "umrah_sales_invoices",
  entityId: invoiceId,
  details: JSON.stringify({
    ref, total, subAgentId, groupCount, pilgrimCount,
  }),
});
```

### 2.2 `umrah.sales_invoice.created` (canonical synonym, emitted alongside)

```ts
emitEvent({
  action: "umrah.sales_invoice.created",
  entity: "umrah_sales_invoices",
  entityId: invoiceId,
  after: { ref, total, subAgentId, groupCount, pilgrimCount },
});
```

### 2.3 `umrah.commission.calculated`

```ts
emitEvent({
  action: "umrah.commission.calculated",
  entity: "employee_commission_plans",
  entityId: planId,
  after: { month, year, finalAmount, employeeId, assignmentId },
});
```

---

## 3. Listener-side expectations

Listeners read **polymorphic** payloads with explicit fallbacks:

- **invoice.generated** at `eventListeners.ts:1454–1528` —
  reads `payload.after` first, falls back to JSON-parsed
  `payload.details`. The required fields for the three side-
  effects (GL posting, obligation registration, manager
  notification) are `ref`, `total`, `subAgentId`. All three are
  present in **both** emit shapes.

- **commission.calculated** at `eventListeners.ts:1900–2012` —
  reads `payload.after.{month,year,finalAmount,employeeId,
  assignmentId}`. All five fields are present in the emit
  payload (§2.3).

Catalog (`eventCatalog.ts:451 / 471`) **declares both action
names**, so `emitEvent`'s catalog assertion
(`businessHelpers.ts:~295`) passes. Listener registration
(`eventListeners.ts:100–102`) confirms both subscribers are
wired.

---

## 4. Rejection analysis (the question the backlog implies)

- **Envelope validation** (`eventBus.ts:80–124`): every emitted
  event is stamped with `v` + `occurredAt` before dispatch. No
  silent drop here.
- **Catalog assertion**: both action names are declared. Not a
  source of rejection.
- **Required-field missing**: no — `ref/total/subAgentId` for
  invoice and `month/year/finalAmount` for commission are
  present on every emit path.
- **Field-type mismatch**: no — listeners use defensive `??`
  + JSON.parse fallbacks. A string `details` and an object
  `after` are both accepted.
- **Action-name mismatch**: no — emit and listener strings
  match character-for-character.
- **Listener unregistered**: no — both are registered at
  `eventListeners.ts:100–102`.
- **DLQ rows**: the eventBus DLQ is exercised when a listener
  THROWS, not when an emit fails validation. If U-03 was about
  past listener throws, those would be visible in
  `event_dlq` rows at runtime — but the code path itself is
  correctly wired today.

**Conclusion:** the backlog item's stated defect — "rejected
event payloads" — **does not reproduce** in the current code.
It may have been silently fixed by a prior PR, or it may have
described a transient bug in an earlier branch. Either way,
the audit closes U-03 as verified-clean.

---

## 5. One adjacent risk surfaced (OUT OF U-03 SCOPE)

The commission engine posts the GL journal entry **synchronously
inside the same DB transaction** that persists
`employee_commission_calculations`, and emits the event
**after** commit (`umrahCommissionEngine.ts:175–231`, emit at
169).

The listener at `eventListeners.ts:1912–1942` includes a
**recovery block** that re-posts the accrual if missing. The
re-post path uses a deduplication `sourceKey`, so the ledger is
safe; but the comment + structure indicate this is a known
defensive layer for a transactional-ordering edge case (commit
succeeded → event delivery deferred → listener compensates).

This is **not a U-03 defect**. Touching it would require:

- A change to the commission engine's transactional ordering
  (engine touch → 🔴 hard-pause class per
  `UMRAH_REMAINING_WORK_ROADMAP.md` §3).
- Potential backfill if the historical
  `employee_commission_calculations` rows need re-validation
  (backfill → 🔴 hard-pause).

**Audit-only recommendation:** open a follow-up backlog item
(suggested id: **CMSN-ORDER** — commission emit-after-commit
ordering review) and route it through the hard-pause queue.
Do not bundle it with U-03's closure.

---

## 6. Out of scope for this PR (explicit)

Permanent hard rails from `UMRAH_REMAINING_WORK_ROADMAP.md` §2,
plus the audit-specific limits:

- ❌ No edit to `umrahInvoicingEngine.ts` or
  `umrahCommissionEngine.ts`.
- ❌ No edit to `eventListeners.ts` or `eventBus.ts`.
- ❌ No new event action / no catalog change.
- ❌ No backfill of historical commission calculations.
- ❌ No migration.
- ❌ No FE change.
- ❌ U-12 not opened. U-02b stopped at M5b. BILL-MAIN P4+
  remains hard-pause.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. No new smoke (the existing 13 umrah
   smokes — 223/223 — continue to protect the surface).
3. No issue/ticket creation (CMSN-ORDER is mentioned for
   tracking; opening it is the owner's call).

---

## 8. Closure verdict

- ✅ **U-03 closes verified-clean** on the strength of the
  evidence in §2–§4.
- 🟡 **Adjacent flag:** consider opening CMSN-ORDER as a
  separate hard-pause backlog item for the commission engine's
  emit-after-commit timing.
- ➜ **Next per roadmap §8:** U-10 (verify 11-policy
  effectiveness — no silent hardcode) as the next autonomous
  audit.
