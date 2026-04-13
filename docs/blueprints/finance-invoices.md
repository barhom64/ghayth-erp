# Blueprint — Finance · Invoices

The invoices module owns the AR side of the business: issuing invoices
to clients, posting their journal entries, tracking collection, and
handing off to ZATCA for e-invoicing. Every invoice that reaches
`approved` writes two sets of rows in the same transaction — the
invoice + its lines, and the GL journal entry + its lines.

## 1. Permissions

Permission wiring for this router lives in `middlewares/` and
`finance.ts` at mount time (the router itself mounts under
`/finance` and inherits the router-level `requireAnyPermission` for
`finance:read` | `finance:write`). Individual handlers rely on the
standard CRUD grouping:

| Permission      | Used by                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `finance:read`  | `GET /invoices`, `/invoices/:id`, `/collection`, `/stats`, `/summary`, `/receivables`, `/tax/summary`, `/tax/declarations` |
| `finance:write` | `POST /invoices`, `POST /invoices/:id/payment`, `PATCH /invoices/:id`, `DELETE /invoices/:id` |
| `finance:post`  | `PATCH /invoices/:id/approve` — gates the move into `approved`, which is the state that triggers GL posting |
| `finance:send`  | `POST /invoices/:id/send` — dispatches the invoice to the client via the communications gateway |

Approval also checks the `accounting_mappings` completeness guard:
if the operation type doesn't have a debit/credit account pair
configured in the settings tab (see the AccountingMappingsTab
blueprint), the approve handler refuses to post.

## 2. Tables written to

| Table                              | Rows written by                                                           |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `invoices`                         | Header: client, ref, description, totals, status                          |
| `invoice_lines`                    | One row per line item (quantity, unit price, VAT amount, line gross)      |
| `journal_entries`                  | On approve: header with `sourceType='invoice'`, `sourceId=invoice.id`     |
| `journal_lines`                    | Matching AR debit + revenue credit + VAT payable credit                   |
| `collection_follow_ups`            | Auto-scheduled follow-ups per company's collection policy                 |
| `invoice_collection_stages`        | Each collection stage transition (contact, escalate, legal, write-off)    |
| `approval_actions`                 | Audit of every approve/reject on an invoice                                |

All invoice-writing endpoints wrap the invoice + journal INSERTs in
`withTransaction` — see `POST /invoices` (line ~173) and the approve
handler (line ~354) for the canonical pattern.

## 3. Events emitted

| Event                              | Emitted at                                 | Subscribers                        |
| ---------------------------------- | ------------------------------------------ | ---------------------------------- |
| `finance.invoice.created`          | `POST /invoices`                           | Notifications, BI rollup           |
| `finance.invoice.approved`         | `PATCH /invoices/:id/approve`              | ZATCA submitter, collection engine |
| `finance.invoice.sent`             | `POST /invoices/:id/send`                  | Notifications (client portal)      |
| `finance.invoice.payment_received` | `POST /invoices/:id/payment`               | Collection engine (stage advance)  |

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`collectionFollowUpCron`** (daily 09:00) — walks
  `collection_follow_ups` where `scheduledDate <= today` and fires
  the configured action (reminder, escalation, legal handoff).
- **`arAgingRollupCron`** (daily 04:00) — rebuilds the AR aging
  buckets read by `/finance/ar-aging`. Uses `finance-algorithms.ts`.

## 5. Frontend entry points

- `/finance/invoices` — `src/pages/finance/invoices.tsx`
- `/finance/invoice-detail/:id` — `src/pages/finance/invoice-detail.tsx`
- `/finance/collection` — `src/pages/finance/collection.tsx`
- `/finance/receivables` — `src/pages/finance/receivables.tsx`
- `/finance/ar-aging` — `src/pages/finance/ar-aging.tsx`

## 6. Known open issues

- **Phase 7 smoke test:** "Finance invoice: create → approve → ZATCA
  submission (mocked)" — the full happy-path ending in the ZATCA
  stub.
- **Deeper gap #2 (event-driven behaviour):** today the ZATCA
  submitter polls invoices directly; with a proper subscriber on
  `finance.invoice.approved` the submission would be push-driven.
- **Deeper gap #6 (communications gateway):** `POST /invoices/:id/send`
  today hand-rolls the email/WhatsApp dispatch. Will migrate once
  the gateway lands.
