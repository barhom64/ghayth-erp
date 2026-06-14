# FIN-P4-CONTRACT — Audit / Spec (No Code)

**Status:** Investigation only. **No code change. No engine
touch. No migration. No FE change.** Existing implementation
checked before this spec.

**Owner trigger (2026-06-14 00:48 UTC):** Following BILL-MAIN
P4-plan §11 ratification, this document is the spec/audit for
the internal service contract between the umrah module and the
financial engine. The owner authorised this as audit/spec only
— **no code anywhere** until ratification. If the audit reveals
that any finance-side code is needed, the next step is
NEED OWNER DECISION before any execution PR.

---

## 1. What's already in the finance engine

The audit of `artifacts/api-server/src/lib/engines/financialEngine.ts`,
`numberingService.ts`, `taxCodes.ts`, `revenueAccountResolver.ts`,
and `businessHelpers.ts` shows the finance side is **substantially
complete**. The reality check:

| Capability | Where it lives | Status |
| --- | --- | --- |
| GL posting (period guard + idempotency + failure recovery) | `lib/engines/financialEngine.ts:69` (`postJournalEntry`) | ✅ FULL — 26 callers across 9 finance files. CRM invoices, payments, custodies, reconciliation, recurring all use it. |
| Account resolution per operation | `financialEngine.ts:284` (`resolveAccountCode`) + `businessHelpers.ts:1665` (`getAccountCodeFromMapping`) + intent fallback | ✅ FULL — `accounting_mappings` table + postability validation built-in. |
| Revenue subsidiary hierarchy | `lib/revenueAccountResolver.ts:70` (5-level chain: sub_agent → agent → season → property_unit → property) | ✅ FULL — already wired for umrah subsidiary overrides. |
| Tax math | `lib/taxCodes.ts:138` (`computeTaxFromTaxCode`) + `businessHelpers.ts:190` (`getCompanyVatRate`) | ✅ FULL — split engine returns `{ net, tax, gross, taxCode, rate }` with VAT15 / VAT0 / EXEMPT codes. |
| Numbering | `lib/numberingService.ts:292` (`issueNumber`) — moduleKey + entityKey, scheme-driven, scope policy, issue timing enforced | ✅ FULL — already used by both CRM and umrah. |
| Period guard | `financialEngine.ts:321` (`checkPeriodOpen`) + mandatory inside `createJournalEntry` | ✅ FULL — `skipPeriodCheck` reserved for year-end closing only. |
| Posting failure tracking | migration 119 + `financial_posting_failures` table; `createGuardedJournalEntry` writes; admin readers + retry scheduler | ✅ FULL. |
| Invoice events | `lib/eventCatalog.ts` declares 8 invoice-related actions (`invoice.created`, `invoice.approved`, `invoice.paid`, `invoice.posted`, `finance.invoice.*`, `umrah.sales_invoice.created`, `umrah.invoice.gl_auto_posted`) | ✅ FULL. |
| **High-level `postSalesInvoice` façade** | — | ❌ **MISSING** — every module currently composes its own (issueNumber → header insert → lines insert → postJournalEntry → emit + audit). |

### 1.1 Where umrah currently crosses the line

| Cross-line behaviour | File:line | What the engine provides instead |
| --- | --- | --- |
| Direct `createGuardedJournalEntry` call (bypasses `financialEngine.postJournalEntry`) | `umrahInvoicingEngine.ts` GL block | `financialEngine.postJournalEntry` — the documented pattern. CRM already uses it (`finance-invoices.ts:1341`). |
| Inline VAT math (`marginBase × rate / (100 + rate)`) | `umrahInvoicingEngine.ts:461–524` | `computeTaxFromTaxCode` / `computeVat` from `taxCodes.ts`. |
| Manual AR/VAT account code selection via `getAccountCodeFromMapping` calls umrah makes itself | `umrahInvoicingEngine.ts` (multiple sites) | `financialEngine.resolveAccountCode` / `resolveAccountCodes` (batch). Same backing logic; centralised wrapper + postability assert. |
| Manual JE line array construction | `umrahInvoicingEngine.ts:580–731` | Engine builds from the contract's `lines` + `accounts` + `tax`. |

---

## 2. Do we use the existing surface or add a new one?

**Answer: BOTH, narrowly.**

- **Use the existing surface** for: numbering, tax math, account
  resolution, GL posting, period guard, failure tracking, events.
  These are present and battle-tested with 26+ caller sites.
- **Add ONE new façade** — `financialEngine.postSalesInvoice(SalesInvoiceRequest)
  : Promise<SalesInvoiceResponse>` — that composes the existing
  building blocks in the standard sequence. **No new GL/tax/numbering
  logic is being introduced.** It's a thin orchestrator that:
  1. Calls `issueNumber({ moduleKey, entityKey: "sales_invoice" })`.
  2. Resolves account codes via `resolveAccountCodes`.
  3. Resolves the revenue subsidiary override via
     `resolveRevenueAccount`.
  4. Computes per-line VAT via `computeTaxFromTaxCode`.
  5. Constructs GL lines (AR / per-bucket revenue / VAT /
     penalty) with the operational dimensions umrah supplied.
  6. Calls `financialEngine.postJournalEntry` with the
     constructed request.
  7. Emits the `*.invoice.created` / `*.invoice.posted` events.
  8. Returns the response envelope.

**The façade is small.** Probably 150–250 lines. It does not
duplicate any existing capability — it orchestrates them.

**Why a façade is preferable to "umrah swaps `createGuardedJournalEntry`
for `financialEngine.postJournalEntry` and we're done":**

- Direct swap still leaves umrah owning VAT math, account
  selection, and JE array construction.
- The façade is the only honest answer to the owner's rule
  ("لا حساب ضريبة داخل العمرة بمنطق مستقل، لا اختيار حسابات
  داخل العمرة").
- Every other module that wants a sales invoice (a future
  housing-services module, e.g.) gets the same wrapper for
  free.

---

## 3. Final `SalesInvoiceRequest` (engine input)

```ts
interface SalesInvoiceRequest {
  // 3.1 Tenancy
  scope: {
    companyId: number;
    branchId?: number | null;
    userId: number;            // operator who initiated
  };

  // 3.2 Operational classification — drives scheme + mappings
  //     + revenue resolver hint set. Engine uses this to pick the
  //     numbering scheme (moduleKey+entityKey), the
  //     accounting_mappings operationType, and the
  //     `revenueAccountResolver` hint shape.
  operation: {
    moduleKey: "umrah" | "crm" | "property" | /* extensible */ string;
    entityKey: "sales_invoice";
  };

  // 3.3 Document context (operator-supplied)
  invoiceDate: string;          // YYYY-MM-DD — engine validates against period
  dueDate?: string | null;
  notes?: string | null;

  // 3.4 Counterparty — engine does NOT decide who this is.
  //     For umrah under main_agent_client: this is the main
  //     agent's clientId. For sub_agent_client_required: the
  //     sub-agent's clientId. Policy resolution stays in
  //     umrah.
  customer: {
    clientId: number;
  };

  // 3.5 Operational dimensions — engine stamps on EVERY GL line
  dimensions: {
    umrahAgentId?: number | null;
    umrahSubAgentId?: number | null;
    umrahSeasonId?: number | null;
    umrahGroupId?: number | null;      // if the WHOLE invoice belongs to one group; otherwise per-line
    propertyUnitId?: number | null;
    propertyId?: number | null;
    // extensible per module
  };

  // 3.6 Lines — operational facts only
  lines: Array<{
    itemType: "service" | "penalty" | "adjustment";
    description: string;
    quantity: number;
    unitPriceExclTax: number;

    // Per-line dimensions (override header dims for THIS line)
    groupId?: number | null;
    sourceNuskInvoiceId?: number | null;  // purchase reference; engine stamps as JE dimension
    productId?: number | null;            // gives engine default tax code + default revenue accountId

    // Per-line tax intent — engine resolves the chain
    //   1) `isTaxable=true/false` overrides everything
    //   2) `taxCodeHint` ('standard'|'zero'|'exempt')
    //   3) product default
    //   4) operation/policy default
    isTaxable?: boolean | null;
    taxCodeHint?: "standard" | "zero" | "exempt" | null;

    // Optional cost basis (for margin-scheme VAT only)
    costBasisHint?: number | null;
  }>;

  // 3.7 Idempotency
  sourceKey: string;            // e.g. `umrah-sales:${groupIdsHash}:${subAgentId}` — engine dedupes on (companyId, sourceKey)
}
```

---

## 4. Final `SalesInvoiceResponse` (engine output)

```ts
interface SalesInvoiceResponse {
  // 4.1 Finance-issued identifiers — umrah persists, never edits
  invoiceRef: string;            // from numberingService — e.g. "INV-UM-2026-0001"
  invoiceId: number;             // header row id (engine wrote to umrah_sales_invoices via callback; see §6.2)
  journalEntryId: number;        // from financialEngine.postJournalEntry
  postedAt: string;              // ISO
  periodId: number;
  periodName: string;
  status: "draft" | "posted" | "deferred";   // depends on scheme.issueTiming

  // 4.2 Account codes the engine chose — umrah renders, never re-picks
  accounts: {
    arAccountCode: string;
    vatAccountCode: string;
    penaltyAccountCode?: string;
    revenueBuckets: Array<{
      accountCode: string;
      vatRate: number;             // bucket identity
      groupId?: number | null;
      sourceNuskInvoiceId?: number | null;
      lineIndices: number[];       // which request lines roll into this bucket
      amountExclTax: number;
    }>;
  };

  // 4.3 Per-line tax — umrah persists on items
  tax: {
    inclusiveMode: boolean;
    lines: Array<{
      lineIndex: number;
      resolvedTaxCode: "VAT15" | "VAT0" | "EXEMPT" | string;
      isTaxable: boolean;
      vatRate: number;
      vatAmount: number;
      lineTotalExclTax: number;
      lineTotalInclTax: number;
    }>;
    totals: {
      subtotalExclTax: number;
      vatAmount: number;
      total: number;
    };
  };

  // 4.4 Validation surfaces (only present on failure paths)
  warnings?: Array<{ code: string; field: string; message: string }>;
}
```

On failure (period closed, missing mapping, non-postable
account, idempotency hit, etc.), the engine throws a typed
error — see §10.

---

## 5. Ownership matrix

| Concern | Umrah owns | Finance owns |
| --- | --- | --- |
| Which groups land on which invoice | ✅ | ❌ |
| Which sub-agent / main agent / season the invoice belongs to | ✅ | ❌ |
| The customer's `clientId` (policy resolution: main vs sub-agent) | ✅ | ❌ |
| Per-line `isTaxable` override / `taxCodeHint` | ✅ | ❌ |
| Per-line `productId`, `groupId`, `sourceNuskInvoiceId` | ✅ | ❌ |
| `unitPriceExclTax` per line | ✅ | ❌ |
| `sourceKey` (operational op key) | ✅ | ❌ |
| `invoiceRef` | ❌ | ✅ |
| `invoiceId` (header row id) | ❌ | ✅ |
| `journalEntryId` + `postedAt` + `periodId` + `status` | ❌ | ✅ |
| AR account code | ❌ | ✅ |
| Revenue account codes per bucket | ❌ | ✅ |
| VAT account code | ❌ | ✅ |
| `vatRate` + `vatAmount` per line | ❌ | ✅ |
| `lineTotalExclTax` / `lineTotalInclTax` per line | ❌ | ✅ |
| GL line construction (AR / revenue / VAT / penalty rows) | ❌ | ✅ |
| Period validation | ❌ | ✅ |
| Idempotency on `sourceKey` | ❌ | ✅ |
| Failure tracking → `financial_posting_failures` | ❌ | ✅ |
| Invoice events (`*.invoice.created`, `*.invoice.posted`) | ❌ | ✅ |

**The matrix is the contract.** Anywhere a row says "Finance
owns" and code in `umrahInvoicingEngine.ts` currently does that
thing, the BILL-MAIN P4 implementation moves that piece out.

---

## 6. Per-capability sub-contracts

### 6.1 Numbering contract

- Engine reads `numbering_schemes` for
  `(moduleKey, entityKey) = (operation.moduleKey, "sales_invoice")`.
- `issueTiming` decides timing:
  - `on_draft` → engine reserves at façade start.
  - `on_submit` / `on_approval` → engine returns a draft response
    (status="draft", `invoiceRef` is null until a later call).
  - `on_posting` → ref assigned at GL post time.
- The scheme's `scopePolicy` (company/branch/module/season/fiscal_year)
  determines the counter scope. **Umrah does not pick this** — it's
  configured by the company administrator in the
  numbering-schemes UI.
- The façade calls `assignReservedNumber()` after the row
  persists so that draft-stage cancellations don't burn
  counters.

### 6.2 Header / items persistence — who writes the table?

**Decision required** in the contract:

- **Option α (recommended):** the façade WRITES the
  `umrah_sales_invoices` + `umrah_sales_invoice_items` rows
  inside the same DB transaction as the GL posting. This
  matches the CRM pattern (`finance-invoices.ts` POST /invoices
  writes `invoices` + `invoice_lines` in one `withTransaction`).
  Umrah's existing tables stay the table of record; the engine
  knows the schema via a per-operation callback (registered at
  app-init time, similar to how plugins register handlers).
- **Option β:** the engine introduces a generic `sales_invoices`
  table and umrah's existing tables become read-only views.
  Larger surface; defer.

**Recommendation:** **Option α.** Smallest delta, preserves
umrah's existing schema, matches the existing CRM pattern.

### 6.3 Tax contract

- Each line's resolved tax code obeys the chain in §3.6.
- For each line, the engine calls
  `computeTaxFromTaxCode({ companyId, amount: lineTotalExclTax,
  taxInclusive: lineInclusiveMode, taxCode: resolvedCode })`
  and stores the split.
- **No margin-scheme math in the engine** for the standard
  path. Margin scheme is a per-operation policy (umrah today,
  optional later). If umrah needs it, the operation
  configuration carries `marginScheme=true` and the engine
  applies the marginBase formula from §11.1 of the P4-plan —
  not umrah.

### 6.4 Account-resolution contract

- AR: `financialEngine.resolveAccountCode(companyId,
  `${operation.moduleKey}_sales`, "debit", fallbackARCode)`.
- Per-bucket revenue: `resolveRevenueAccount(companyId, hint,
  "revenue")` walks the 5-level chain (sub_agent → agent →
  season → property_unit → property) with the hint set
  populated from the request's dimensions + per-line override.
- VAT: `financialEngine.resolveAccountCode(companyId,
  `${operation.moduleKey}_sales`, "credit_vat", fallbackVATCode)`
  — or read from `tax_codes.accountId` per the resolved tax
  code.
- Penalty: a separate operationType (e.g.,
  `umrah_penalty`) lookup so the credit lands on the right
  penalty revenue account.

### 6.5 GL posting contract

- Engine calls `financialEngine.postJournalEntry({
    sourceType: "umrah_sales_invoices",
    sourceId: invoiceId,
    sourceKey,
    type: "sales",
    ref: `JE-${invoiceRef}`,
    description: `فاتورة ${invoiceRef} — ${customerName}`,
    lines: [
      { accountCode: ar, debit: total, credit: 0, clientId, ...dims },
      ...revenueBuckets.map(b => ({ accountCode: b.code, debit: 0, credit: b.amountExclTax, ...b.dims })),
      { accountCode: vat, debit: 0, credit: vatTotal, ...dims },
      ...penaltyLines,
    ],
    guardTable: "umrah_sales_invoices",
    guardId: invoiceId,
  })`.
- Period guard fires inside the engine — no escape hatch.
- On idempotency hit (same `sourceKey` already posted), engine
  returns `{ alreadyExists: true, journalId: existingId }` and
  the façade returns the original response envelope.

### 6.6 Validation / error contract

- `PeriodClosedError`: invoice date falls into a
  closed/locked period. Thrown by the engine; surfaced as a
  warning in the response on draft path, as a thrown error on
  the posting path.
- `MissingMappingError`: `accounting_mappings(operation_type)`
  has no row for the requested operation+side. Thrown by
  `resolveAccountCode`.
- `NonPostableAccountError`: resolved account has
  `allowPosting=false`. Thrown by `assertPostableAccount`.
- `DuplicateSourceKeyError`: `sourceKey` already used. Engine
  returns the prior result + `alreadyExists=true`.
- `InvalidTaxCodeError`: a `taxCodeHint` resolves to a code
  not declared in `tax_codes`. Thrown by `computeTaxFromTaxCode`.

All errors carry a structured shape `{ code, field?, message,
fix? }` consistent with the existing `ValidationError` /
`ConflictError` envelopes in `lib/errorHandler.ts`.

### 6.7 Audit / event contract

- Engine writes one `createAuditLog` row with
  `entity="umrah_sales_invoices"`, `entityId=invoiceId`,
  `action="post"`, `before=null`, `after={ invoiceRef,
  journalEntryId, total }`, `reason=request.notes`.
- Engine emits `${operation.moduleKey}.invoice.posted` (e.g.
  `umrah.invoice.posted`) — already declared in
  `eventCatalog.ts` (umrah-side action exists, finance has
  `invoice.posted` for the standard path).

---

## 7. Worked invoice — end-to-end

**Scenario** (same as P4-plan §4):
- Sub-agent `MK001` of main agent `AG-RIYADH` (linked to
  client #42 under `main_agent_client`).
- Group `GRP-123`, 25 pilgrims.
- Two NUSK purchase invoices: `id=501` (`NV-100001`, total
  22,000) + `id=502` (`NV-100002`, 2,000).
- Operator sets `manualPrices[123] = 30,000`. Plus an overstay
  penalty 500 SAR.

### 7.1 Request umrah sends

```ts
financialEngine.postSalesInvoice({
  scope: { companyId: 7, branchId: 12, userId: 88 },
  operation: { moduleKey: "umrah", entityKey: "sales_invoice" },
  invoiceDate: "2026-06-14",
  customer: { clientId: 42 },
  dimensions: {
    umrahAgentId: 301,
    umrahSubAgentId: 4501,
    umrahSeasonId: 2026031,
  },
  lines: [
    {
      itemType: "service",
      description: "رسوم تأشيرة عمرة — مجموعة GRP-123 (NV-100001)",
      quantity: 25, unitPriceExclTax: 320.00,
      groupId: 123, sourceNuskInvoiceId: 501, productId: 9001,
      isTaxable: false, taxCodeHint: "zero",
    },
    {
      itemType: "service",
      description: "خدمة أرضية — مجموعة GRP-123 (NV-100002)",
      quantity: 1, unitPriceExclTax: 21560.00,
      groupId: 123, sourceNuskInvoiceId: 502, productId: 9002,
      isTaxable: true, taxCodeHint: "standard",
    },
    {
      itemType: "penalty",
      description: "غرامة تجاوز — معتمر #555 (3 أيام)",
      quantity: 1, unitPriceExclTax: 500.00,
      groupId: 123,
      isTaxable: false, taxCodeHint: "exempt",
    },
  ],
  sourceKey: "umrah-sales:groups=123:sa=4501:season=2026031",
});
```

### 7.2 Response umrah receives

```ts
{
  invoiceRef: "INV-UM-2026-00042",
  invoiceId: 8801,
  journalEntryId: 50204,
  postedAt: "2026-06-14T00:48:32Z",
  periodId: 6, periodName: "يونيو 2026", status: "posted",
  accounts: {
    arAccountCode: "1130-042",
    vatAccountCode: "2310-001",
    penaltyAccountCode: "4133-001",
    revenueBuckets: [
      { accountCode: "4131-001", vatRate: 0, groupId: 123,
        sourceNuskInvoiceId: 501, lineIndices: [0], amountExclTax: 8000 },
      { accountCode: "4132-001", vatRate: 15, groupId: 123,
        sourceNuskInvoiceId: 502, lineIndices: [1], amountExclTax: 19560 },
    ],
  },
  tax: {
    inclusiveMode: true,
    lines: [
      { lineIndex: 0, resolvedTaxCode: "VAT0", isTaxable: false,
        vatRate: 0, vatAmount: 0, lineTotalExclTax: 8000, lineTotalInclTax: 8000 },
      { lineIndex: 1, resolvedTaxCode: "VAT15", isTaxable: true,
        vatRate: 15, vatAmount: 2440, lineTotalExclTax: 19560, lineTotalInclTax: 22000 },
      { lineIndex: 2, resolvedTaxCode: "EXEMPT", isTaxable: false,
        vatRate: 0, vatAmount: 0, lineTotalExclTax: 500, lineTotalInclTax: 500 },
    ],
    totals: { subtotalExclTax: 28060, vatAmount: 2440, total: 30500 },
  },
}
```

### 7.3 GL journal the engine posted

| Account | DR | CR | groupId | sourceNuskInvoiceId | umrahAgentId | umrahSubAgentId | clientId |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1130-042 (AR / Client 42) | 30,500.00 | | 123 | — | 301 | 4501 | 42 |
| 4131-001 (Visa revenue) | | 8,000.00 | 123 | **501** | 301 | 4501 | 42 |
| 4132-001 (Ground service revenue, ex-VAT) | | 19,560.00 | 123 | **502** | 301 | 4501 | 42 |
| 2310-001 (VAT payable) | | 2,440.00 | 123 | 502 | 301 | 4501 | 42 |
| 4133-001 (Penalty revenue) | | 500.00 | 123 | — | 301 | 4501 | 42 |
| | **30,500** | **30,500** | | | | | balanced |

### 7.4 Report rendered from the response

Same per-line table as P4-plan §6 — but now every cell is
verified against the engine's response envelope, not derived
from umrah's local math.

---

## 8. What this PR ships

1. This audit/spec document only.
2. No source code change anywhere.
3. No migration. No FE change. No engine touch.
4. The 14 existing umrah smokes (`227/227` on main) keep
   protecting the surface unchanged.

---

## 9. Decision matrix

| Decision | What I do next |
| --- | --- |
| **Ratify the contract (§3 + §4 + §5 + §6)** | Send `NEED OWNER DECISION` before any code PR (the spec itself says the next step needs code on the finance side). The owner has reserved this gate explicitly. |
| **Amend §3 or §4 shapes** | Re-draft the affected section and re-circulate. |
| **Amend §5 ownership rows** | Re-balance the matrix and propagate consequences through §6. |
| **Choose Option β for §6.2** (engine-owned tables) | Restructure §6.2 + §7's "where the row lives" footnote and re-circulate. |
| **Hold close on the spec** | No further action. Umrah keeps its current direct-call pattern; the contract stays as documented intent for a future cycle. |
| **Drop FIN-P4-CONTRACT** | Close the contract track; BILL-MAIN P4b is then permanently impossible without re-opening this. |

**Until ratification:**
❌ No code anywhere — neither finance-side (`postSalesInvoice` façade) nor umrah-side (engine swap / migration / FE detail).
❌ No `generateSalesInvoice` edit.
❌ No `umrahInvoicingEngine` edit.
❌ No default flip / COGS / backfill / migration.
❌ No bypass: if anything in this contract turns out to need
   finance-side code, the next step is `NEED OWNER DECISION`,
   not a PR.
