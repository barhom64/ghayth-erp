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

## 10. Owner decision matrix (PRE-CONTRACT — superseded by §11)

> The owner ratified §1–§9 in principle on 2026-06-14 00:30 UTC
> **BUT** added a binding architectural rule: Umrah must NOT
> build invoices / JE / tax / accounts itself. It must SEND
> operational data to the Financial Engine and the engine must
> RETURN the invoice ref, posting status, JE id, AR/revenue/VAT
> accounts, and financial period. §11 below answers the eight
> contract questions raised at that ratification.
>
> **Hard freeze (re-affirmed):** no P4a, no P4b, no P4c, no
> engine touch, no migration, no FE detail page, no default
> flip — until §11 is ratified by the owner.

| Original decision | Now superseded by §12 |
| --- | --- |
| Ratify §3 + §4 + §5 + §7 sequence | Re-cast in §12 conditional on §11 contract ratification. |
| Amend §4.3 to Option B | Same — re-cast in §12. |
| Hold close on the entire plan | Still available. |
| Drop P4 entirely | Still available. |

**Until §11 ratification, `generateSalesInvoice` is not
touched.** The 9 owner requirements remain the operational
acceptance criteria; §11 adds the architectural acceptance
criteria.

---

## 11. Financial Engine Contract (response to the owner's
binding architectural rule)

### 11.0 Where Umrah crosses the line today

The read-only audit of `lib/businessHelpers.ts`,
`numberingService.ts`, `taxCodes.ts`,
`revenueAccountResolver.ts`, and
`financialEngine.postJournalEntry` shows the Financial Engine
already exposes four layers:

| Layer | Engine surface | Today umrah delegates? |
| --- | --- | --- |
| **Numbering** | `issueNumber(IssueParams) → IssueResult { number, sequenceValue, schemeId, assignmentId, … }` | ✅ Yes — `umrahInvoicingEngine.ts:541` calls `issueNumber("umrah_sales_invoice")`. |
| **Tax** | `computeTaxFromTaxCode({ companyId, amount, taxInclusive, taxCode }) → { net, tax, gross, taxCode, rate }`; `getCompanyVatRate(companyId)` | ❌ **No.** Umrah computes VAT inline via `marginBase × rate / (100+rate)` (lines 504–524). This is one of the four cross-the-line points. |
| **Account routing** | `resolveRevenueAccount(companyId, hint, accountType?)` + `getAccountCodeFromMapping(companyId, operation, side, fallback)` | ⚠️ Partial — Umrah does delegate revenue routing, but it picks AR / VAT / penalty accounts via `getAccountCodeFromMapping` calls it makes itself, and constructs the GL line array manually. |
| **GL posting** | `financialEngine.postJournalEntry(GLPostingRequest) → journalId` (period guard + idempotency baked in) | ⚠️ Mixed — Umrah calls `createGuardedJournalEntry` directly (the lower-level helper) rather than `financialEngine.postJournalEntry`. CRM finance-invoices uses the higher-level one. |

**Conclusion:** Umrah owns 4 things it shouldn't:
1. Inline VAT math.
2. Manual selection of AR + VAT account codes.
3. Manual GL-line array construction.
4. Direct call to `createGuardedJournalEntry` instead of the
   posted `financialEngine.postJournalEntry`.

### 11.1 Proposed contract surface — `FinancialEngine.postSalesInvoice(...)`

The contract needs **one new façade method** on the financial
engine so Umrah (and any future module) sends an operational
request and receives a finance-side response. **The method does
NOT exist today** — it is the new surface this contract
defines.

```ts
// New (proposed) — lives in artifacts/api-server/src/lib/financialEngine.ts
interface SalesInvoiceRequest {
  // Tenancy
  scope: { companyId: number; branchId?: number | null; userId: number };

  // Operational classification — informs the engine which scheme +
  // mappings + tax policy + period to apply.
  operation: "umrah_sales" | "crm_sales" | "property_rent" | /* …extensible */ string;

  // Document context (operator-supplied; engine does not invent)
  invoiceDate: string;                  // YYYY-MM-DD; engine validates against the period
  dueDate?: string | null;
  notes?: string | null;

  // Counterparty (the LEGAL party for AR/statement). Under
  // main_agent_client mode the umrah module resolves this to the
  // main agent's client; under sub_agent_client_required mode it
  // resolves to the sub-agent's client. The engine does NOT decide
  // which side of the policy is in force — that's umrah-domain.
  customer: { clientId: number };

  // Operational dimensions — engine stamps these on EVERY GL line.
  // Engine does NOT interpret them; modules tell it which to carry.
  dimensions: {
    umrahAgentId?: number | null;       // main agent
    umrahSubAgentId?: number | null;
    umrahSeasonId?: number | null;
    umrahGroupId?: number | null;       // when the WHOLE invoice belongs to one group; otherwise per-line
    propertyUnitId?: number | null;     // for the rent path; harmless null for umrah
    /* …extensible per module */
  };

  // Line items — per-line tax flag, per-line cost reference, per-line
  // group, per-line product. The engine treats these as
  // OPERATIONAL FACTS and decides the accounting consequences.
  lines: Array<{
    // Operational identity
    itemType: "service" | "penalty" | "adjustment";
    description: string;
    quantity: number;

    // Pricing (operator-confirmed)
    unitPriceExclTax: number;

    // Per-line dimensions
    groupId?: number | null;
    sourceNuskInvoiceId?: number | null;  // purchase reference (Option A: dimension only)
    productId?: number | null;            // gives engine a defaultTaxCode + defaultRevenueAccountId

    // Tax intent (explicit; no "all taxable" or "all exempt" assumption)
    isTaxable?: boolean | null;           // NULL = use product/policy default; TRUE / FALSE = explicit override
    taxCodeHint?: "standard" | "zero" | "exempt" | null;

    // Per-line cost basis (optional; engine may use for margin scheme)
    costBasisHint?: number | null;
  }>;

  // Idempotency
  sourceKey: string;                     // e.g., `umrah-sales-${operatorOpKey}`; engine dedupes
}

interface SalesInvoiceResponse {
  // Finance-side facts that umrah PERSISTS but does NOT pick
  invoiceRef: string;                    // from numberingService
  invoiceId: number;                     // engine wrote the header to its own table OR returned a foreign id (see §11.2)
  journalEntryId: number;                // from createGuardedJournalEntry
  postedAt: string;                      // ISO; the date the engine accepted the post
  periodId: number;                      // financial period the JE landed in
  periodName: string;                    // human-readable
  status: "draft" | "posted" | "deferred"; // engine decides based on issueTiming + period

  // Account routing — engine returns the codes it chose, so umrah
  // can SHOW them on the invoice without re-deriving.
  accounts: {
    arAccountCode: string;
    revenueAccountCodes: string[];       // one per revenue bucket (vatRate, groupId, productId)
    vatAccountCode: string;
    penaltyAccountCode?: string;
    // No COGS in Option A; would appear here under Option B.
  };

  // Tax breakdown — engine returns the per-line computed values so
  // umrah can persist + render them without recomputing.
  tax: {
    inclusiveMode: boolean;
    lines: Array<{
      lineIndex: number;
      isTaxable: boolean;                // engine resolves the read chain
      vatRate: number;
      vatAmount: number;
      lineTotalExclTax: number;
      lineTotalInclTax: number;
    }>;
    totals: { subtotalExclTax: number; vatAmount: number; total: number };
  };
}
```

**Engine responsibilities (after contract lands):**
- Owns invoice numbering (already does via numberingService).
- Owns VAT math via `computeTaxFromTaxCode` (NEW — Umrah stops doing it).
- Owns AR + VAT + revenue account code selection from
  `accounting_mappings` + `resolveRevenueAccount` (NEW —
  Umrah stops doing the AR/VAT selection itself).
- Owns period validation (already does inside
  `createJournalEntry`).
- Owns GL line construction + posting (NEW — Umrah stops
  building the array; engine constructs from `lines`+
  `accounts`+`tax`).
- Returns the envelope above.

**Umrah responsibilities (after contract lands):**
- Resolve the customer per the linkage policy (main vs
  sub-agent).
- Decide which groups + NUSK refs + sub-agent + season belong
  on the invoice.
- Decide per-line `isTaxable` overrides when the operator
  explicitly says "this line is exempt".
- Persist the response envelope on
  `umrah_sales_invoices`/`umrah_sales_invoice_items`.
- NOT compute VAT. NOT pick accounts. NOT construct JE lines.
  NOT call `createGuardedJournalEntry` directly.

### 11.2 Eight contract questions — answered

| # | Owner question | Answer |
| --- | --- | --- |
| 1 | **What does Umrah send?** | Operational `SalesInvoiceRequest`: scope, operation key, dates, customer FK, dimensions, lines (with productId / groupId / sourceNuskInvoiceId / isTaxable / unitPriceExclTax), sourceKey. **No invoice number, no JE id, no period, no account codes, no VAT.** |
| 2 | **What does the engine return?** | `SalesInvoiceResponse`: invoiceRef + invoiceId + journalEntryId + postedAt + periodId + periodName + status + accounts + tax breakdown per line + totals. **Umrah persists this verbatim; never overwrites it.** |
| 3 | **Who owns the invoice number?** | The Financial Engine via numberingService. The scheme + counter + reset policy + scope (company/branch/season) live in `numbering_schemes`. Umrah cannot mint or alter the ref. |
| 4 | **Who calculates the tax?** | The Financial Engine via `computeTaxFromTaxCode` per line. Umrah supplies `isTaxable` (or NULL = inherit) and the price; the engine returns `vatRate`, `vatAmount`, `lineTotalExclTax`, `lineTotalInclTax`. Margin-scheme logic, if any, is decided by the engine from the `operation` key — **not by umrah's `umrah_vat_mode` flag**. |
| 5 | **Who picks the accounts?** | The Financial Engine. AR + VAT + penalty from `accounting_mappings(operation = "umrah_sales")`; revenue per bucket from `resolveRevenueAccount(companyId, hint, "revenue")` extended to walk umrah_group / umrah_season / property. Umrah supplies the hint (group/sub-agent/agent/season) and lets the engine resolve. |
| 6 | **Where does the group number appear?** | On the line (`lines[i].groupId`) and on EVERY revenue/VAT GL line via the new `umrahGroupId` dimension. The engine stamps it because Umrah passed it on the line. |
| 7 | **Where does the purchase-invoice number appear?** | On the line (`lines[i].sourceNuskInvoiceId`) and on the engine's GL line via a new `sourceNuskInvoiceId` dimension. The response envelope echoes it back so the printed invoice + report can render it per row. |
| 8 | **Is the purchase-invoice number just a reference or does it affect cost?** | **In P4: reference + dimension only (§4.3 Option A).** The engine uses it to stamp GL lines and to optionally compute margin-scheme VAT base (engine reads `costBasisHint` if supplied). It does NOT post a COGS pair — the NUSK AP entry posted at purchase time remains the only cost posting. A COGS pair (Option B) is a SEPARATE engine track (suggested id: `FIN-COGS-UMRAH`), not bundled into P4. |

### 11.3 Migration consequences for the engine side

Adding the contract is **not** Umrah's migration. The engine
side may need:

- A new method `financialEngine.postSalesInvoice(...)`
  (the only file change required to expose the contract).
- A row in `accounting_mappings` for
  `operation = "umrah_sales"` (which probably already exists —
  needs verification).
- Optional: an enum extension on `taxCodes` for any umrah-
  specific code (e.g., `umrah_visa_zero`); current `zero` /
  `exempt` may suffice.

**None of those land in P4-plan.** They live in a separate
finance-side PR after this contract is ratified.

### 11.4 What changes inside Umrah after the contract lands

- `umrahInvoicingEngine.ts` shrinks from ~785 lines to ~250
  lines: it builds the request, calls
  `financialEngine.postSalesInvoice`, persists the response.
- Inline VAT math (lines 461–524) **deleted**.
- Manual AR/VAT/penalty `getAccountCodeFromMapping` calls
  **deleted**.
- Manual JE line construction (lines 580–731) **deleted**.
- Direct `createGuardedJournalEntry` call **deleted**.
- New: 3 columns on `umrah_sales_invoices` to persist the
  engine's response (`periodId`, `periodName` is rendered
  from the period table, `acceptedAt = postedAt`).

This is **the architectural payoff** of P4: Umrah stops
maintaining a parallel finance code path.

---

## 12. Revised slice sequence (post §11)

| Slice | Scope | Owner |
| --- | --- | --- |
| **P4-plan-v2** | This document, with §11. **No code.** | 🟢 autonomous (this PR; iteration 2 of the plan). |
| **CONTRACT-RATIFY** | Owner reads §11 + answers §11.2 questions, ratifies the request/response envelope shape and the responsibility split. | Owner only. |
| **FIN-P4-CONTRACT** | Finance-side engine PR — adds `financialEngine.postSalesInvoice(...)` + the accounting_mappings row + smokes that pin the contract. **Not Umrah's PR.** | Finance-track owner; class TBD. |
| **P4a (umrah-side)** | Additive nullable migration on `umrah_sales_invoice_items` (the 5 columns in §3.1) + a smoke that pins the column shape. Still no engine touch. | 🟢 autonomous after CONTRACT-RATIFY + FIN-P4-CONTRACT. |
| **P4b (umrah-side)** | `umrahInvoicingEngine.ts` switches to calling `financialEngine.postSalesInvoice(...)`. Old inline math + manual JE deleted. Smoke pins the shrink. | 🔴 **hard-pause** (production behaviour change). |
| **P4c (umrah-side)** | New FE detail page rendering §6's per-line view from the engine's response envelope. | 🟢 autonomous. |
| **P5** | Catalog default flip `main_agent_client` for new tenants. | 🔴 hard-pause. |

**Order of dependencies:** plan ratification → finance-side
contract PR → umrah migration → umrah engine swap → umrah FE
detail → policy default flip. **P4b cannot land before the
finance-side contract PR.**

---

## 13. What this PR (iteration 2) ships

1. This planning document, with §11 added.
2. No source code change anywhere.
3. The 14 existing umrah smokes (`227/227` last green run on
   main) continue to protect the surface unchanged.

---

## 14. Owner decision matrix (post §11)

| Decision | I do next |
| --- | --- |
| **Ratify §11 contract envelope + §12 sequence** | Pause for the finance-track owner to draft FIN-P4-CONTRACT. After it lands, I open P4a (the umrah migration). |
| **Amend §11.1 request/response shape** | I redraft §11 per the amendment and re-circulate. |
| **Amend §11.2 answers (one or more)** | I update the answer + propagate consequences through §11.1 / §12. |
| **Hold close on the entire plan** | No further action; Umrah keeps owning the finance path for now. |
| **Drop P4 entirely** | We close the BILL-MAIN track at P3 + P6. |

**Until ratification of §11, `generateSalesInvoice` is not
touched, no P4a/b/c migration or code lands, no FE detail page,
no default flip.**
