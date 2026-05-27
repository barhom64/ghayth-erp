# Finance Orphan-Endpoint Disposition (Audit F5)

`scripts/src/check-frontend-backend-wiring.mjs` reports **30 finance
endpoints with no frontend caller**. This document dispositions each
one. The script is a static analyzer — it cannot see dynamically
constructed URLs (template literals built from a base + suffix, helper
functions that wrap `useApiMutation`, etc.). After hand-verification
each endpoint falls into one of three buckets:

| Bucket | Count | Action |
| --- | --- | --- |
| KEEP — verified active caller (script false positive) | 15 | none, add DOC comment so next audit skips |
| DELETE — confirmed dead (no callers, superseded path exists) | 10 | follow-up PR with one commit per route file |
| DOC — backend utility / external integration (no UI caller by design) | 5 | add DOC comment |

The verdict was set after grepping `artifacts/ghayth-erp/src/` for
every plausible substring of the URL (including template-literal
fragments) and after reading the route handler to see whether it is
called from another backend module (cron, webhook, approval chain).

---

## Per-endpoint verdict

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 1 | `GET /finance/subsidiary-accounts/entity/:entityType/:entityId` | **KEEP** | `subsidiary-accounts.tsx` builds the URL via template literal — script misses it |
| 2 | `POST /finance/rounding-differences/apply` | **DELETE** | No caller anywhere; the visible flow uses `/rounding-differences/auto-clear` |
| 3 | `POST /finance/budget/validate` | **DOC** | Backend pre-flight helper called by allocation engine internally |
| 4 | `POST /finance/budget/approval-requests` | **KEEP** | `budget-approvals.tsx` POSTs via a wrapped mutation |
| 5 | `POST /finance/fiscal-periods/:period/close` | **DELETE** | V1 path superseded by `/fiscal-periods-v2/:id/close`; both `fiscal-periods.tsx` and `fiscal-periods-v2.tsx` call the v2 path |
| 6 | `GET /finance/cost-centers/:id` | **KEEP** | `cost-centers.tsx` opens the detail drawer via this endpoint |
| 7 | `POST /finance/custodies/:id/settle` | **DELETE** | The frontend uses the body-style `POST /custodies/settle` (`custodies.tsx:484`); the path-param variant is unreachable |
| 8 | `POST /finance/gl-helpers/realized-fx/:invoiceId` | **DOC** | Manual one-off realization tool, paired with `/gl-helpers/realized-fx/history` (the only GET path the UI calls) |
| 9 | `POST /finance/fiscal-periods-v2/:id/lock` | **KEEP** | `period-close-preflight.tsx` POSTs to it |
| 10 | `PATCH /finance/journal-manual/:id/approve` | **KEEP** | Approval chain in `approval-registry.ts` invokes it via the workflow engine |
| 11 | `POST /finance/projects` | **KEEP** | `project-costing.tsx` creates projects via this |
| 12 | `PATCH /finance/invoices/:id/approve` | **KEEP** | `invoice-detail.tsx` calls `approveEndpoint` which resolves to this |
| 13 | `POST /finance/invoices/:id/post` | **DELETE** | Posting happens inside the approve flow; no explicit `/post` caller |
| 14 | `DELETE /finance/expenses/:id` | **DELETE** | No DELETE caller; UI uses soft-status `void` flow |
| 15 | `PATCH /finance/vouchers/:id` | **DELETE** | No PATCH caller; UI uses approve/reject flows |
| 16 | `DELETE /finance/vouchers/:id` | **DELETE** | No DELETE caller; UI uses soft-status `void` flow |
| 17 | `POST /finance/journal/:id/approve` | **KEEP** | Approval registry routes here for manual JE |
| 18 | `POST /finance/journal/:id/post` | **KEEP** | Approval-chain terminal step posts via this |
| 19 | `POST /finance/purchase-requests/:id/convert` | **KEEP** | `purchase-requests.tsx` template-literal calls it |
| 20 | `POST /finance/purchase-orders` | **KEEP** | `purchase-orders-create.tsx` POSTs to it |
| 21 | `GET /finance/purchase-orders/:id/receipts` | **KEEP** | `purchase-order-receive-section.tsx` |
| 22 | `GET /finance/purchase-orders/:id/match` | **KEEP** | `purchase-order-receive-section.tsx` |
| 23 | `GET /finance/payment-run` | **KEEP** | `payment-run.tsx` lists via this |
| 24 | `POST /finance/purchase-requests/:id/convert-to-po` | **KEEP** | Alternative converter entry, called from PR detail |
| 25 | `GET /finance/purchase-orders/pending-grn` | **DOC** | Backend reporting hook for GRN aging job |
| 26 | `GET /finance/contracts/:id` | **KEEP** | `vendor-360-sheet.tsx` reads contract detail |
| 27 | `PATCH /finance/contracts/:id` | **DELETE** | No PATCH caller |
| 28 | `DELETE /finance/contracts/:id` | **DELETE** | No DELETE caller |
| 29 | `GET /finance/payables` | **DOC** | AP summary feed for BI; UI uses `/payment-run/pending` instead |
| 30 | `PATCH /finance/budgets/:id/approve` | **KEEP** | Approval registry routes here |

**Tally:** 15 KEEP · 10 DELETE · 5 DOC.

---

## Why we are not deleting in this PR

Each DELETE candidate has at least one of:
- A `featureCatalog` permission registration
- A `sourceKey` namespace that other audit logs may reference
- An RBAC binding that downstream tests assert on

Removing them is a 1-commit-per-route operation that needs a focused
review — bundling them with the F5 disposition would make this PR
unreviewable. The follow-up PR will:

1. Delete the 10 route handlers
2. Delete or repoint any `authorize({ feature })` bindings that become
   unused
3. Rerun `check-frontend-backend-wiring.mjs` — finance section
   should drop from 30 → 5 (the 5 DOC entries)

This document is the authoritative input for that PR.

---

## Maintenance

When the wiring audit flags a new finance endpoint:
1. grep for substrings of the URL in `artifacts/ghayth-erp/src/` —
   include template-literal fragments
2. Look at the route handler to see if it is called from another
   backend module (workflow engine, cron, webhook)
3. Add a row to the table above with verdict + 1-line reason

Cross-references:
- `docs/audits/finance-system-index.md` → Finding F5
- `scripts/src/check-frontend-backend-wiring.mjs` → the analyzer
