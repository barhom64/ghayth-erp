# U-19 — Import → Link → Invoice → Collect journey UX audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "UX for import→link→invoice→collect journey."

**TL;DR:** All four journey stages have working pages today.
**They never talk to each other**. The operator walks the
journey four times — once per page — without a unified timeline,
no per-sub-agent progress KPIs, no deep-links between stages,
and no batch-level "I imported 50 mutamers, where are they
now?" view. Recovery is additive: a journey-status helper + a
unified timeline view + step indicators on each stage.

---

## 1. Inventory — the four stages

### 1.1 Import
| Surface | Status |
| --- | --- |
| Page | `pages/umrah/import-wizard.tsx` (1505 lines) |
| Engine | `lib/umrahImportEngine.ts` (1700+ lines after BILL-MAIN P6) |
| Routes | `POST /umrah/import/preview-{mutamers,vouchers,groups}` + `POST /umrah/import/confirm-{...}` |
| Reports | `umrah_import_batches` + `umrah_import_changes` + recovery `/umrah/import/:batchId/unlinked` |

✅ Mature. The wizard is the most polished stage.

### 1.2 Link
| Surface | Status |
| --- | --- |
| Sub-agent linker | `PUT /umrah/sub-agents/:id/link-client` (BILL-LINK) |
| Main-agent linker | `PUT /umrah/agents/:id/link-client` (BILL-MAIN P3, #2204) |
| Detection | `previewMutamersImport.unlinkedSubAgents` + `unlinkedMainAgents` (BILL-MAIN P6) |
| FE | Linker dialog accessed from `/umrah/sub-agents/:id` + `/umrah/agents/:id` detail pages |

✅ Linker routes exist. Detection exists.

### 1.3 Invoice
| Surface | Status |
| --- | --- |
| Page | `pages/umrah/sales-wizard.tsx` (296 lines) |
| Engine | `lib/umrahInvoicingEngine.ts` |
| Route | `POST /umrah/invoices/generate` (per sub-agent, multi-group) |
| Helper | suggested-price chain (last_invoice → pricing_rule → default_per_mutamer → none) |

✅ Per-sub-agent wizard works.

### 1.4 Collect
| Surface | Status |
| --- | --- |
| Page | `pages/umrah/payments.tsx` (372 lines) |
| Route | `POST /umrah/payments` + linked to specific invoice ids |
| Engine | `umrahPaymentEngine` writes the cash/bank JE + clears AR |

✅ Per-invoice payment recording works.

---

## 2. Gaps — what breaks the journey UX

### 2.1 No unified timeline per sub-agent
The operator who wants "what's the status of سعد سعيد فرع المدينة"
today has to:
1. Open `/umrah/sub-agents/:id` → see pilgrim count + linkage.
2. Open `/umrah/agent-balances` report → filter by sub-agent.
3. Open `/umrah/invoices` → filter by sub-agent.
4. Open `/umrah/payments` → filter by sub-agent.
5. Open `/umrah/reports/agent-profitability` for the bigger
   picture.

**Missing:** a single `/umrah/sub-agents/:id/journey` view with
a vertical timeline of import batches → linkage events →
invoices issued → payments collected for that sub-agent.

### 2.2 No batch-level journey progress
After importing 50 mutamers in batch #123, the operator can
see the batch detail but cannot see:
- How many of those 50 are still unlinked at the sub-agent level
- How many have been invoiced
- How many invoices are paid
- Aggregate revenue collected vs invoice total

The `/umrah/import/:batchId/unlinked` page covers half of it
(unlinkage recovery) but not the invoice/payment side.

### 2.3 No step indicator on each stage
None of the four pages show "you are on step 3 of 4" or
"these 7 sub-agents need linking before you can invoice them".
The operator has no visual cue about journey position.

### 2.4 No deep-links between stages
- Sales wizard shows "uninvoiced groups" but no link to "see
  the import batch this group came from".
- Payments page shows invoice id but no link to "see the sales
  wizard generation context".
- Linker dialog doesn't surface "you have N pilgrims waiting
  on this link" before/after the operation.

### 2.5 Inconsistent wizard pattern
- Import wizard is multi-step + previews + commits.
- Sales wizard is single-page + smart suggestions + commits.
- Payments page is plain CRUD table.
- No shared "wizard step" component → each stage feels
  different.

### 2.6 No journey health dashboard
The umrah dashboard exists (`pages/umrah/dashboard.tsx`) but
shows aggregate KPIs (total pilgrims, total revenue) — not
journey health: "how many pilgrims are stuck without linkage?
how many invoices are unpaid > 30 days? how many groups have
been imported but never invoiced?"

### 2.7 No reverse navigation
After collecting a payment, no "view the journey" link from
the payment row back to the source import batch + sub-agent
that produced this revenue.

### 2.8 Recovery flows are separate
Each stage has its own recovery surface:
- Import → `/umrah/import/:batchId/unlinked`
- Link → no surface (only achievable via main detail page)
- Invoice → manual via list page filter
- Collect → no recovery view

A unified "recovery hub" would let an operator triage stuck
journeys.

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-19-P1 — journey-status helper (🟢 autonomous)
New read-only API:
```
GET /umrah/sub-agents/:id/journey
GET /umrah/import-batches/:id/journey
GET /umrah/groups/:id/journey
```

Returns a JSON timeline:
```ts
{
  stages: [
    { stage: "imported",  count, ts },
    { stage: "linked",    count, ts },
    { stage: "invoiced",  count, total, ts },
    { stage: "collected", count, total, ts },
  ],
  outstanding: {
    unlinkedPilgrims: number,
    uninvoicedGroups: number,
    unpaidInvoices: number,
  },
}
```

### 3.2 U-19-P2 — sub-agent journey FE view (🟢 autonomous)
Render the helper as a vertical timeline on `/umrah/sub-agents/:id/journey`.

### 3.3 U-19-P3 — batch journey FE view (🟢 autonomous)
Same shape on `/umrah/import-batches/:id`.

### 3.4 U-19-P4 — step indicator on each stage (🟢 autonomous)
Add `<JourneyStepIndicator currentStage="import" subAgentId={...} />`
to each of the four pages. Uses the helper from P1.

### 3.5 U-19-P5 — deep-links between stages (🟢 autonomous)
- Sales wizard row → link to source import batch.
- Payments row → link to invoice generation context.
- Linker dialog → "N pilgrims waiting" pre/post message.

### 3.6 U-19-P6 — recovery hub (🟢 autonomous)
New page `/umrah/recovery-hub` aggregating:
- Imports with stuck unlinked rows
- Sub-agents waiting to be linked
- Groups uninvoiced > 7 days
- Invoices unpaid > 30 days

### 3.7 U-19-P7 — journey health dashboard panel (🟢 autonomous)
Add a "Journey Health" card to `pages/umrah/dashboard.tsx` —
KPIs from P1's aggregate.

### 3.8 U-19-P8 — closure smoke (🟢 autonomous)
Static smoke that journey-helper API surfaces all 4 stages +
the FE timeline renders without DB.

---

## 4. Permanent hard rails preserved (U-19 will not cross)

- ❌ No engine touch.
- ❌ No migration (purely additive helper + FE).
- ❌ No catalog edit.
- ❌ No silent linkage. ❌ No JE.
- ❌ All new pages are **READ-ONLY**.
- ❌ Smokes additive.

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No code. ❌ No engine touch. ❌ No FE.
- ❌ FIN-P4-CONTRACT execution untouched.
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change.

---

## 7. Closure verdict

- 🟢 **U-19 closes with JOURNEY INVENTORIED + 8 GAPS DOCUMENTED
  + 8 RECOVERY PHASES SCOPED.** All four stages work
  individually; the gap is between them. Recovery is additive
  surfacing.
- ➜ **Next autonomous step**: U-19-P1 (journey-status helper).
- ➜ **No owner decision needed** for any U-19 phase. All 8
  are 🟢 autonomous (read-only API + FE).
- ➜ **Hard-pause queue unchanged.**
