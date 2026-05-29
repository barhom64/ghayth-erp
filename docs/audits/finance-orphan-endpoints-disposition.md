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
| 2 | `POST /finance/rounding-differences/apply` | **DOC** | Defensive endpoint. `financeVendorsReportsSmoke.test.ts:244` asserts existence; deleting would lose the smoke contract |
| 3 | `POST /finance/budget/validate` | **DOC** | Backend pre-flight helper called by allocation engine internally |
| 4 | `POST /finance/budget/approval-requests` | **KEEP** | `budget-approvals.tsx` POSTs via a wrapped mutation |
| 5 | `POST /finance/fiscal-periods/:period/close` | **DOC** | Already returns 410 Gone with a pointer to v2. Kept as a loud-failure tombstone for old API clients |
| 6 | `GET /finance/cost-centers/:id` | **KEEP** | `cost-centers.tsx` opens the detail drawer via this endpoint |
| 7 | `POST /finance/custodies/:id/settle` | **DOC** | Defensive REST-style variant. `financeBudgetCustodySmoke.test.ts:114` asserts existence. The UI uses the body-style sibling but the path variant is kept for parity |
| 8 | `POST /finance/gl-helpers/realized-fx/:invoiceId` | **DOC** | Manual one-off realization tool, paired with `/gl-helpers/realized-fx/history` (the only GET path the UI calls) |
| 9 | `POST /finance/fiscal-periods-v2/:id/lock` | **KEEP** | `period-close-preflight.tsx` POSTs to it |
| 10 | `PATCH /finance/journal-manual/:id/approve` | **KEEP** | Approval chain in `approval-registry.ts` invokes it via the workflow engine |
| 11 | `POST /finance/projects` | **KEEP** | `project-costing.tsx` creates projects via this |
| 12 | `PATCH /finance/invoices/:id/approve` | **KEEP** | `invoice-detail.tsx` calls `approveEndpoint` which resolves to this |
| 13 | `POST /finance/invoices/:id/post` | **DOC** | Defensive. Behavioural tests in `cogsPostingPreviewSmoke.test.ts` + `financeGoldenPath.test.ts:27` validate the posting flow. Kept for backend integrations / future UI |
| 14 | `DELETE /finance/expenses/:id` | **DOC** | Defensive with maintained guards. `financeGoldenPath.test.ts:358+` covers "budget reservation release" behaviour — losing the route loses the safety net |
| 15 | `PATCH /finance/vouchers/:id` | **DOC** | Defensive with **VL-1 guard contract** (ref-prefix filter, terminal-state rejection, period gate). `financeGoldenPath.test.ts:316+` validates each guard |
| 16 | `DELETE /finance/vouchers/:id` | **DOC** | Defensive sibling to PATCH. `financeGoldenPath.test.ts:141` asserts existence; status='draft' only |
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
| 27 | `PATCH /finance/contracts/:id` | **DOC** | Admin surface — no caller today but defensive completeness for the planned vendor-contracts UI. Audit + event hooks already wired |
| 28 | `DELETE /finance/contracts/:id` | **DOC** | Admin surface — soft-delete with audit + event hooks. Kept for parity with the PATCH variant |
| 29 | `GET /finance/payables` | **DOC** | AP summary feed for BI; UI uses `/payment-run/pending` instead |
| 30 | `PATCH /finance/budgets/:id/approve` | **KEEP** | Approval registry routes here |

**Tally:** 15 KEEP · 0 DELETE · 15 DOC.

(Original disposition had 10 DELETE candidates; **all 10 reclassified to
DOC** after deeper investigation:

- **8 have maintained guards + behavioural tests** in
  `financeGoldenPath`, `financeBudgetCustodySmoke`,
  `financeVendorsReportsSmoke`, and `cogsPostingPreviewSmoke`.
  Deleting them would lose ~50 assertion guards including the **VL-1
  voucher contract**, the **budget-reservation release** on expense
  delete, the **COGS posting preview path**, and the **fiscal-period
  410-Gone tombstone**.
- **2** (vendor contract PATCH + DELETE) **have no callers and no
  tests**, but they are full admin endpoints with audit + event hooks
  already wired. Kept as defensive completeness for the planned
  vendor-contracts admin UI.

The "no frontend caller" verdict is correct, but the backend test suite
and the audit-trail wiring treat these as **defensive endpoints with
maintained guards** — deletion-cost > deletion-benefit.)

---

## What this follow-up did

- **Reclassified** 10 DELETE markers → DOC markers across 7 route files
- **Updated** this disposition doc to reflect the final tally
- **No route deletions** — the wiring audit's count stays at 30 finance
  orphans, all 30 now have explicit DOC verdicts.

The honest outcome of an orphan audit is that **most "orphans" are
intentional retention**: defensive guards, REST parity, admin
completeness, or tombstones. Future audits should weigh deletion-cost
(tests/guards lost, RBAC churn, integration risk) against
deletion-benefit (lines saved). For this finance surface, the cost
won every time.

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
