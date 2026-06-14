# BILL-MAIN P4 — Plan (Per-line Tax / Group / Purchase-Ref Aware Engine Fallback)

**Status:** Planning document. **No code change. No engine touch.
No migration. No FE change.** Existing implementation checked
before this plan.

**Owner trigger (2026-06-14 00:19 UTC):** Before BILL-MAIN P4
lands as code, the plan must answer 9 specific requirements
about per-line invoice detail (tax, group, purchase-invoice
reference, sub-agent, etc.) and prove that the journal entry +
operational report preserve all of them. **`generateSalesInvoice`
must not be edited before this plan is ratified.**

This document recaps what already exists, identifies the gap
against the new requirements, and proposes a concrete data
model + worked invoice + worked JE + worked report — so the
owner can ratify (or amend) the design **before** any code
lands.

---

## 1. What's on `main` today (read-only audit)

### 1.1 Schema

- **`umrah_sales_invoices`** (header — migration 101):
  `subAgentId, clientId, seasonId, ref, invoiceDate, subtotal,
  penaltiesTotal, vatRate, vatAmount, total, paidAmount, status,
  dueDate, nuskInvoiceRefs (CSV), groupRefs (CSV),
  pilgrimCount, journalEntryId, notes, costBasis, marginBase`.
- **`umrah_sales_invoice_items`** (lines — migration 101 + 240):
  `invoiceId, itemType ('group'|'penalty'|'adjustment'), groupId,
  violationId, description, quantity, unitPrice, lineTotal,
  productId, vatRate, vatAmount, accountCode`.
- **`umrah_nusk_invoices`** (purchase side): carries
  `totalAmount, netCost, refundAmount, nuskStatus, groupId,
  agentId, seasonId`. Currently NO `salesInvoiceId` FK back to
  sales side; the link goes through `groupId` + a CSV
  `nuskInvoiceRefs` on the sales header.

### 1.2 Engine behaviour (`umrahInvoicingEngine.ts:106–785`)

- Up to **2 lines per group** under §6 of #1870: a
  zero-rated visa line (cost pass-through) + a standard-rated
  ground-service line. Falls back to a single bundled line
  when product mappings are unset.
- **N penalty lines**: one per open violation, no VAT line on
  the existing path.
- **Margin-scheme VAT**: `marginBase = max(0, subtotal -
  costBasis)`, `vatAmount = marginBase × rate / (100 + rate)`
  (inclusive) — read from `umrah_vat_mode` + `umrah_vat_rate`
  system settings.
- **Per-line VAT** stored on items (`vatRate`, `vatAmount`,
  `accountCode`); **GL posting** still uses the header VAT
  total — per-line bucketing is the marked Phase-2 task.
- **JE dimensions today**: `umrahAgentId`, `umrahSeasonId`,
  `clientId`. No `umrahGroupId`, no `umrahSubAgentId`, no
  `sourceNuskInvoiceId`.

### 1.3 FE today

No invoice detail page exists. The list page
(`pages/umrah/invoices.tsx`) shows header columns only —
ref / clientName / subAgentName / total / marginBase / status.
Per-line items, NUSK cross-references, and group breakdown are
NOT rendered.

---

## 2. Gap matrix vs the owner's 9 requirements

| # | Owner requirement | On main today | Gap |
| --- | --- | --- | --- |
| 1 | Full umrah sales-invoice model | header + items exist; per-line VAT stored; per-line GL bucketing TBD | **Items table needs 4–5 added columns + GL bucketing must activate** |
| 2 | Example: taxable + non-taxable lines | engine emits zero-rated visa + standard-rated service; penalties carry no explicit VAT today | **Plan must show all three line types side by side** |
| 3 | How per-line tax policy is read | today: product → catalog policy → invoice fallback | **Add explicit `isTaxable` boolean so the read order is operator-visible, not implicit** |
| 4 | Per-line impact on the JE | today: revenue + VAT split is per ACCOUNT only, not per group | **Need GL bucketing by (accountCode, vatRate, groupId, sourceNuskInvoiceId)** |
| 5 | Where group number appears | on item (`groupId`) + on header CSV | **Promote groupId to a JE dimension on every revenue line** |
| 6 | Where purchase-invoice number appears | only on HEADER CSV (`nuskInvoiceRefs`) | **Add `sourceNuskInvoiceId` to items (nullable int FK)** |
| 7 | Is purchase-invoice ref just a reference, or does it affect COGS? | today: NO COGS line on the sales JE; nusk posts its own AP entry | **Plan must commit to one of three options (§4.3). Recommendation: keep as DIMENSION only in P4. A real COGS pairing is a separate post-P4 track.** |
| 8 | Relationship purchase ↔ sales | today: many-to-many via `groupId`; CSV refs on header | **Persist the many-to-many on items via `sourceNuskInvoiceId`** |
| 9 | Don't edit `generateSalesInvoice` before plan approval | n/a | **This document. No engine touch.** |

---

## 3. Proposed data model additions (additive nullable only)

All migrations are additive nullable + no backfill — same
expand/contract shape as BILL-MAIN P2 (`e60a45cf`).

### 3.1 `umrah_sales_invoice_items` — 5 new columns

```sql
ALTER TABLE umrah_sales_invoice_items
  ADD COLUMN IF NOT EXISTS "sourceNuskInvoiceId" INTEGER,           -- FK umrah_nusk_invoices.id (nullable, no FK constraint)
  ADD COLUMN IF NOT EXISTS "isTaxable" BOOLEAN,                      -- explicit per-line tax stance, nullable = "inherit from header"
  ADD COLUMN IF NOT EXISTS "unitPriceExclTax" NUMERIC(12,2),          -- price before tax, persisted alongside the existing unitPrice
  ADD COLUMN IF NOT EXISTS "lineTotalExclTax" NUMERIC(12,2),          -- lineTotal before tax
  ADD COLUMN IF NOT EXISTS "lineTotalInclTax" NUMERIC(12,2);          -- lineTotal after tax (mirror of lineTotal in inclusive mode)
```

Index: `(invoiceId, groupId)` and `(sourceNuskInvoiceId)`
partial WHERE NOT NULL — small per-tenant tables, plain
`CREATE INDEX IF NOT EXISTS`.

Rationale for **3 amount columns** (excl/incl/lineTotal): under
KSA margin scheme, **`lineTotal` today is ambiguous** — it's
the operator-displayed amount, sometimes inclusive sometimes
exclusive depending on `umrah_vat_mode`. The new excl/incl
pair removes the ambiguity at storage time and is a no-op for
existing rows (NULL = "engine-derived from lineTotal + vatRate +
vat_mode at read time").

### 3.2 Optional `umrah_nusk_invoices` mirror back-pointer
**OUT OF P4 SCOPE.** Adding a `salesInvoiceId` column to
`umrah_nusk_invoices` would create a circular FK that needs
careful backfill rules. Defer to a separate track if the
operator dashboards require it.

---

## 4. Worked invoice — 3-line example

**Scenario:** Sub-agent "MK001" of main agent "AG-RIYADH" (linked
to client #42 under `main_agent_client` policy). Group `GRP-123`
with 25 pilgrims. Two NUSK purchase invoices already imported
for the group:

- `umrah_nusk_invoices.id = 501`: NUSK ref `NV-100001`, total
  cost 22,000 SAR (visa cost 8,000 + everything else 14,000).
- `umrah_nusk_invoices.id = 502`: NUSK ref `NV-100002`,
  additional electronic service 2,000 SAR.

Operator sets `manualPrices[123] = 30,000` SAR (sale price for
the group). Plus an overstay penalty 500 SAR for one pilgrim.

### 4.1 Lines as P4 would produce

| # | itemType | groupId | sourceNuskInvoiceId | description | qty | unitPriceExclTax | isTaxable | vatRate | vatAmount | lineTotalExclTax | lineTotalInclTax |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | group | 123 | **501** | رسوم تأشيرة عمرة — مجموعة GRP-123 (NV-100001) | 25 | 320.00 | **false** | 0.00 | 0.00 | 8,000.00 | 8,000.00 |
| 2 | group | 123 | **502** | خدمة أرضية — مجموعة GRP-123 (NV-100002) | 1 | 21,560.00 | **true** | 15.00 | 2,440.00 | 19,560.00 | 22,000.00 |
| 3 | penalty | 123 | NULL | غرامة تجاوز — معتمر #555 (3 أيام) | 1 | 500.00 | **false** | 0.00 | 0.00 | 500.00 | 500.00 |
| | | | | **Totals** | | | | | **2,440.00** | **28,060.00** | **30,500.00** |

**Header**: `subAgentId=MK001`, `clientId=42` (resolved under
`main_agent_client` from main agent AG-RIYADH; sub-agent's own
clientId still null), `seasonId=...`, `subtotal=28,060`,
`vatAmount=2,440`, `total=30,500`, `costBasis=24,000` (22,000
+ 2,000), `marginBase=6,500` (subtotal − costBasis). The
margin-scheme math reconciles: 6,500 × 15 / 115 ≈ 848 — but
per-line bucketing now yields the **actually-correct**
2,440 because only the service line is taxable and the visa
line is a zero-rated pass-through. **Per-line buckets reveal
that the legacy single-rate margin calc was an under-statement
of VAT on this invoice shape** — that's exactly why per-line
is the right place to live.

### 4.2 Worked JE under P4

GL dimensions on EVERY line: `umrahAgentId=AG-RIYADH-id`,
`umrahSeasonId=...`, `clientId=42`, plus the new
`umrahGroupId=123`, `umrahSubAgentId=MK001-id`,
`sourceNuskInvoiceId` from the source line.

| Account | DR | CR | groupId | sourceNuskInvoiceId | Notes |
| --- | --- | --- | --- | --- | --- |
| 1130-42 (AR / Client #42) | 30,500.00 | | 123 | — | total invoice |
| 4131-001 (Visa revenue) | | 8,000.00 | 123 | **501** | visa line, zero-rated, posted from line 1 |
| 4132-001 (Ground service revenue, ex-VAT) | | 19,560.00 | 123 | **502** | service line, taxable, ex-VAT portion |
| 2310-001 (VAT payable) | | 2,440.00 | 123 | 502 | VAT on the service line only |
| 4133-001 (Penalty revenue) | | 500.00 | 123 | — | penalty line, no VAT |
| | **30,500.00** | **30,500.00** | | | balanced |

**No COGS line.** The cost basis is captured per-line via
`sourceNuskInvoiceId` as a **dimension**, not as a posted COGS.
The NUSK purchase invoices have already booked their own AP
entry (DR 5xxx-cost / CR 2101-AP) at import time. Per option
**§4.3-A** below, P4 keeps cost-tracking as a dimension; a real
COGS recognition is a separate track.

### 4.3 Three options for purchase-ref ↔ COGS (owner question 7)

| Option | Shape | Trade-off | Recommendation |
| --- | --- | --- | --- |
| **A** | `sourceNuskInvoiceId` on items is a **DIMENSION ONLY** — no JE COGS line. Existing NUSK AP entry stays the only cost posting. | No double-posting risk. Reports + audit trail get per-line lineage. Margin-scheme VAT keeps working as today. | **Recommended for P4.** Minimal risk, maximum dimension visibility. |
| **B** | Each item with a non-null `sourceNuskInvoiceId` posts a COGS pair on the sales JE: DR 5xxx (COGS) / CR 1190 (inventory holding). | Real matching of cost to revenue period. Requires holding-account selection per company. | Defer to a separate `BILL-MAIN COGS` track. Out of P4. |
| **C** | Promote the purchase reference to a full INTERCOMPANY ledger entry tracked separately. | Heavy. Useful only for tenants that operate the umrah arm as a separate legal entity. | Out of every immediate roadmap. |

---

## 5. Per-line tax policy resolution — read order

The owner's rule: **don't assume all items are taxable, don't
assume all are non-taxable.** The read order under P4:

1. **Per-line explicit override** — `umrah_sales_invoice_items.isTaxable`
   (`TRUE` / `FALSE`). If set, this wins.
2. **Product default** — `products.defaultTaxCode` ('standard' /
   'zero' / 'exempt'). Hit when `isTaxable` is NULL and `productId`
   is non-null.
3. **Policy default** — a new catalog field
   `umrah.financial.taxableByDefault` (boolean, default `true`).
   Hit when neither of the above gives an answer.
4. **Engine fallback** — the existing inclusive vs exclusive
   mode (`umrah_vat_mode`) determines the math; the per-line
   `vatRate` is set to 0 when the read says "non-taxable",
   else to the catalog `umrah_vat_rate`.

**No code today implements this chain end-to-end**. P4's
engine work activates it (a) by adding the `isTaxable` column +
(b) by computing per-line `vatAmount` from
`lineTotalExclTax × vatRate / 100` (the math the line already
stores) + (c) by reconciling header `vatAmount` as a SUM of
line vatAmounts (not the legacy margin-base shortcut).

---

## 6. Worked operational report mock

The report `pages/umrah/invoices/[id]/detail.tsx` (new under
P4c) displays per the owner's requirement:

```
فاتورة مبيعات #INV-2026-00042
─────────────────────────────────────────────────────────────────
العميل: شركة الرياض للعمرة (#42)  ← الوكيل الرئيسي AG-RIYADH
الوكيل الفرعي: مكتب جدة الفرعي (#MK001)
الموسم: عمرة رمضان 1447 (#SE-2026-03)
رقم الفاتورة: INV-2026-00042       تاريخ: 2026-06-14
المرجع: مرتبطة بفواتير شراء NUSK: NV-100001، NV-100002

البنود:
┌────┬──────────┬──────────────┬────────────┬─────┬────────────┬─────────┬──────┬──────────┬───────────┬───────────┐
│ #  │ المجموعة │ فاتورة شراء │ الوصف      │ كمية│ سعر/وحدة   │ خاضع   │ نسبة │ ضريبة    │ قبل ض.    │ بعد ض.    │
├────┼──────────┼──────────────┼────────────┼─────┼────────────┼─────────┼──────┼──────────┼───────────┼───────────┤
│ 1  │ GRP-123  │ NV-100001    │ تأشيرة     │ 25  │ 320.00     │ لا     │ 0%   │ 0.00     │ 8,000.00  │ 8,000.00  │
│ 2  │ GRP-123  │ NV-100002    │ خدمة أرضية │ 1   │ 21,560.00  │ نعم   │ 15%  │ 2,440.00 │ 19,560.00 │ 22,000.00 │
│ 3  │ GRP-123  │ —            │ غرامة      │ 1   │ 500.00     │ لا     │ 0%   │ 0.00     │ 500.00    │ 500.00    │
└────┴──────────┴──────────────┴────────────┴─────┴────────────┴─────────┴──────┴──────────┴───────────┴───────────┘
                                                                                  المجموع    28,060.00   30,500.00
                                                                          ضريبة (إجمالية)               2,440.00
                                                                          الإجمالي بعد الضريبة        30,500.00
```

**Every column the owner enumerated is visible.** Group number
(per line) + purchase-invoice number (per line) + description +
quantity + unit price ex-tax + taxable flag + VAT rate + VAT
amount + line subtotal + line total. Header recap shows
sub-agent + main-agent client.

---

## 7. Proposed slice sequence

| Slice | Scope | Class |
| --- | --- | --- |
| **P4-plan** | This document. No code. | 🟢 autonomous (this PR). |
| **P4a** | Additive nullable migration (§3.1) + 1 zod schema field on `linkAgentClientSchema` if any + 1 catalog field `umrah.financial.taxableByDefault` + smoke pinning the column shape. **No engine touch yet.** | 🟢 autonomous after this plan ratifies. |
| **P4b** | Engine fallback: `generateSalesInvoice` reads `agent.clientId` under `main_agent_client`, writes the new per-line columns, computes VAT from line buckets, posts JE buckets per (accountCode, vatRate, groupId, sourceNuskInvoiceId) — Option A (§4.3). | 🔴 **hard-pause** (engine + GL behaviour change). Needs explicit owner go. |
| **P4c** | New FE detail page `/umrah/invoices/[id]` rendering §6's mock + read-only NUSK back-link panel. | 🟢 autonomous. |
| **P5** | Catalog default flip `main_agent_client` for new tenants. | 🔴 hard-pause (default flip). |

Only **P4-plan** and (after ratification) **P4a** + **P4c** are
autonomous. **P4b stays hard-pause** because it touches the
invoicing engine and GL posting.

---

## 8. Permanent hard rails preserved

❌ No silent client creation. ❌ No silent AR opening. ❌ No
silent linkage. ❌ No edit to issued invoices (existing rows
keep NULL on the new columns; engine reads NULL as "use legacy
margin calc"). ❌ No hard-coded accounting mapping (the new
`sourceNuskInvoiceId` dimension is read on every line; account
codes still come from product/subsidiary chain). ❌ No JE
outside the finance engine. ❌ No bulk silent anything.

---

## 9. What this PR ships

1. **This plan document.** No source code change. No engine
   change. No migration. No FE change.
2. The 14 existing umrah smokes (`227/227` last green run on
   main) continue to protect the surface unchanged.

---

## 10. Owner decision matrix

| Decision | I do next |
| --- | --- |
| **Ratify §3 + §4 + §5 + §7 sequence** | Open P4a (migration + catalog field + smoke). |
| **Amend §4.3 to Option B** | I redraw §4.2's JE with explicit COGS pairs and re-circulate before any code. |
| **Hold close on the entire plan** | No further action. P4 stays as a documented direction. |
| **Drop P4 entirely** | We close the BILL-MAIN track at P3 + P6 (linker + detection). |

**Until ratification, `generateSalesInvoice` is not touched.**
The 9 owner requirements are the canonical acceptance criteria
for P4 code; any code PR will cite them line-by-line.
