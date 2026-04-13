# Blueprint — Finance · ZATCA

ZATCA (Zakat, Tax and Customs Authority) is the Saudi e-invoicing
compliance surface. It owns the per-company registration metadata,
the TLV/QR code encoder, the XML builder, and the submission log that
records every push to the sandbox or production endpoint. Today the
"push" is simulated — the sandbox environment short-circuits to an
`accepted` status so the rest of the stack (invoice badge, aging
report, BI rollup) can exercise the happy path end-to-end.

## 1. Permissions

ZATCA routes do **not** use the generic `finance:*` permission
catalog. Instead they gate every handler through a hard-coded role
allow-list helper (`requireRole` in `routes/finance-zatca.ts:14`):

```
FINANCE_ROLES = ["finance_manager", "general_manager", "owner"]
```

This is intentional: the secrets stored in `zatca_settings`
(`oauthClientSecret`, `csid`, `pihKey`) are sensitive enough that the
more granular `finance:read` / `finance:write` split isn't sufficient —
only the three named roles can read or write any ZATCA surface. Every
handler in the router runs the same role check on entry.

| Route                                           | Allowed roles |
| ----------------------------------------------- | ------------- |
| `GET /zatca/settings`                           | finance_manager / general_manager / owner |
| `PUT /zatca/settings`                           | finance_manager / general_manager / owner |
| `POST /zatca/test-connection`                   | finance_manager / general_manager / owner |
| `POST /zatca/invoice/:id/submit`                | finance_manager / general_manager / owner |
| `POST /zatca/expense/:id/submit`                | finance_manager / general_manager / owner |
| `GET /zatca/submissions`                        | finance_manager / general_manager / owner |
| `PATCH /zatca/invoice/:id`                      | finance_manager / general_manager / owner |
| `PATCH /zatca/expense/:id`                      | finance_manager / general_manager / owner |

**Open item:** this hand-rolled role check predates the unified RBAC
catalog; it should migrate to a dedicated `finance:zatca` permission
once the catalog gains a "sensitive-secrets" tier. Tracked under the
same deeper gap as the communications gateway.

## 2. Tables written to

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `zatca_settings`                   | `PUT /zatca/settings` — one row per company. Upserts 15 registration fields including encrypted secrets. |
| `zatca_settings.lastConnectionTest` / `.connectionTestStatus` / `.connectionTestMessage` | Updated by `POST /zatca/test-connection` |
| `invoices` (ZATCA columns)         | `zatcaUuid`, `zatcaHash`, `zatcaStatus`, `zatcaQrCode` set by `POST /zatca/invoice/:id/submit` |
| `invoices` (tax flags)             | `isTaxLinked`, `invoiceTypeCode`, `taxCategoryCode`, `exemptionReason` set by `PATCH /zatca/invoice/:id` |
| `journal_entries` (ZATCA columns)  | Same four ZATCA columns set by `POST /zatca/expense/:id/submit` for `type = 'expense'` rows |
| `journal_entries` (tax flags)      | Same four tax flags set by `PATCH /zatca/expense/:id`                    |
| `zatca_submission_log`             | One row per submission attempt — header (entity type/id, ref, uuid, hash), status, environment, request/response payloads, submitter assignment |

The submission log is the canonical audit trail: even if the invoice
row is later amended or soft-deleted, the submission log retains the
exact XML (first 5000 chars) and response payload that was pushed.

## 3. Events emitted

ZATCA handlers currently do **not** emit events through the
`eventBus` / `safeEmitEvent` layer. This is a known gap — see §6.

The cross-module trigger that *should* push ZATCA is
`finance.invoice.approved` emitted by the Finance Invoices router. The
invoice blueprint documents that subscriber relationship; the ZATCA
router today is pull-based (the frontend calls
`POST /zatca/invoice/:id/submit` after approval), not push-based.

## 4. Scheduled jobs

No ZATCA-specific cron jobs exist yet. The submission model is
request-scoped: the user clicks "إرسال إلى هيئة الزكاة" on the invoice
detail page and the handler fires synchronously.

When the event-driven migration lands (see §6) the subscriber will
live alongside the other finance cron jobs in `lib/cronScheduler.ts`
as a queue drainer rather than a fixed-schedule job.

## 5. Frontend entry points

- `/settings` → "ZATCA" tab — `src/pages/settings/zatca-settings-tab.tsx`
  (extracted in Phase 6). Manages the 15 registration fields, masks
  the three secret fields with `****`, calls `PUT /zatca/settings` and
  `POST /zatca/test-connection`.
- `/finance/invoice-detail/:id` — the submit button and the ZATCA
  status badge (reads `invoice.zatcaStatus`, renders the QR code
  inline when present).
- `/finance/zatca-submissions` — `src/pages/finance/zatca-submissions.tsx`
  (the submission log browser, reads `GET /zatca/submissions`).
- `/finance/expenses` — per-row ZATCA badge + submit action.

## 6. Known open issues

- **Phase 7 smoke test:** "Finance invoice: create → approve → ZATCA
  submission (mocked)" — the sandbox short-circuit already returns
  `accepted`, the vitest suite just needs to walk the full chain.
- **Deeper gap #2 (event-driven behaviour):** the ZATCA push is
  pull-based from the frontend today. Should subscribe to
  `finance.invoice.approved` so submission happens automatically on
  approve, removing the manual step.
- **Deeper gap #4 (unified RBAC):** `requireRole` is a hand-rolled
  allow-list that bypasses the RBAC catalog. Should move to
  `finance:zatca:*` permissions and drop the helper.
- **Deeper gap #7 (real ZATCA endpoint):** `POST /zatca/invoice/:id/submit`
  simulates success in sandbox and marks the invoice `accepted` without
  contacting any real endpoint. Production roll-out requires the real
  OAuth flow, the CSID onboarding, and the Fatoora API integration.
  The XML builder and TLV/QR encoder are already ZATCA-compliant; only
  the transport is stubbed.
- **Deeper gap #6 (communications gateway):** the submission log
  does not emit a notification today. Once the communications gateway
  lands, failed submissions (`status = 'rejected'`) should page the
  finance manager via the gateway rather than relying on them to
  refresh the submissions page.
