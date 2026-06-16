# Non-Finance Unused-Endpoint Disposition (Foundation Audit)

`scripts/src/check-frontend-backend-wiring.mjs` (the authoritative
static wiring analyzer) reports the following healthy baseline:

```
orphan frontend calls (no backend match):   0
method mismatches (path ok, verb wrong):    0
backend coverage by UI:                      1489/1534 (97.1%)
unused backend endpoints (no UI caller):     45
```

Of those **45 unused endpoints**, **24 are finance** and are already
dispositioned in [`finance-orphan-endpoints-disposition.md`](./finance-orphan-endpoints-disposition.md).
This document dispositions the remaining **21 non-finance** endpoints.

The analyzer is static — it only resolves URLs reached through the
`apiFetch` / `useApiQuery` / `useApiMutation` call graph. It cannot see:
- downloads opened via `href` / `window.location` / `apiUrl(...)` (PDF, CSV)
- endpoints whose only client is a **separate app** (the driver portal is
  not part of `artifacts/ghayth-erp/src`, the only tree it scans)
- backend-ready features whose UI is not built yet (the wiring backlog)

Each verdict was set after grepping `artifacts/ghayth-erp/src/` for every
plausible URL fragment (including `href`/`window.location` and template
literals) and reading the handler to see whether a non-SPA consumer exists.

| Bucket | Count | Action |
| --- | --- | --- |
| KEEP — verified active caller, analyzer blind spot (false positive) | 6 | none; analyzer cannot see `href`/`window.location`/`useApiQuery` template literals |
| FIXED — backend-ready, UI now wired in this pass | 2 | done (see "Fixed in this pass" below) |
| DOC — by-design no ERP-SPA caller (separate client / admin-cron / backend-ready, UI pending) | 13 | none today; tracked as wiring backlog |
| DELETE — confirmed dead (no caller, superseded) | 0 | — |

**Net: zero dead endpoints.** Consistent with the foundation-audit
thesis — what remains is analyzer blind spots and a (shrinking) wiring
backlog, not dead code.

> **Note on the analyzer's reach:** the scan also misses calls made via
> `useApiQuery` with template-literal URLs — e.g. `GET /umrah/pilgrims/:id/timeline`
> (wired at `pilgrim-detail.tsx:109`) and `GET /umrah/import/presets`
> (wired in `import-wizard.tsx`) are both flagged "unused" yet are live.
> They are KEEP, not backlog.

## Fixed in this pass

| Method + Path | What was wired | Where |
| --- | --- | --- |
| `DELETE /umrah/import/presets/:id` | Delete button on the saved-preset row (save + list were already wired; this completes the management surface) | `pages/umrah/import-wizard.tsx` |
| `GET /exec-dashboard/unified-pnl` | Consolidated month-to-date P&L card (revenue / expense / net + top accounts) | `pages/exec-dashboard.tsx` |

---

## Per-endpoint verdict

### /export (3) — PDF print endpoints

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 1 | `GET /export/pdf/invoice/:id` | **KEEP** | `pages/finance/invoice-detail.tsx` opens it via `apiUrl(...)` href — not `apiFetch`, so the analyzer misses it |
| 2 | `GET /export/pdf/voucher/:id` | **KEEP** | Same href-based print pattern as the invoice/payroll PDF exports |
| 3 | `GET /export/pdf/payroll/:id` | **KEEP** | `pages/details/payroll-detail.tsx` print/ExportButton hits it via href |

### /umrah (4)

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 4 | `GET /umrah/pilgrims/export.csv` | **KEEP** | `pages/umrah/pilgrims.tsx:389` downloads via `window.location.href = /api/umrah/pilgrims/export.csv` |
| 5 | `GET /umrah/pilgrims/:id/timeline` | **KEEP** | Already wired at `pilgrim-detail.tsx:109` via `useApiQuery` template literal — analyzer blind spot, not a gap |
| 6 | `GET /umrah/import/presets` | **KEEP** | Already wired at `import-wizard.tsx` (`useApiQuery` with `?fileType=` template literal) — analyzer blind spot |
| 7 | `DELETE /umrah/import/presets/:id` | **FIXED** | Delete button added on the preset row — completes the preset management surface |

### /driver-portal (6) — separate client app

No driver-portal client exists anywhere in this repository; these form a
coherent auth + profile + trips + availability API intended for a separate
driver mobile/PWA client. The ERP SPA is not their consumer by design.

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 8 | `POST /driver-portal/auth/login` | **DOC** | Separate driver client |
| 9 | `GET /driver-portal/me` | **DOC** | Separate driver client |
| 10 | `GET /driver-portal/me/trips` | **DOC** | Separate driver client |
| 11 | `GET /driver-portal/me/trips/:id` | **DOC** | Separate driver client |
| 12 | `PATCH /driver-portal/me/availability` | **DOC** | Separate driver client |
| 13 | `POST /driver-portal/auth/change-password` | **DOC** | Separate driver client |

### /documents (6) — ACL + retention (compliance/admin)

Per-document access control and data-retention. Backend landed with
per-document ACL work; the admin/compliance UI for these surfaces is
pending. Retention endpoints are admin/cron-style by design.

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 14 | `GET /documents/:id/access-log` | **DOC** | Per-document audit feed; admin UI pending |
| 15 | `POST /documents/retention/backfill` | **DOC** | Admin/cron data-retention maintenance op |
| 16 | `GET /documents/retention/due` | **DOC** | Retention-sweep feed (records due for disposal); admin/cron consumer |
| 17 | `GET /documents/:id/acls` | **DOC** | Per-document ACL list; admin UI pending |
| 18 | `POST /documents/:id/acls` | **DOC** | Grant ACL; admin UI pending |
| 19 | `DELETE /documents/:id/acls/:aclId` | **DOC** | Revoke ACL; admin UI pending |

### /communications (1)

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 20 | `GET /communications/log/:id/referral-chain` | **DOC** | Message-lineage reporting feed; UI widget pending |

### /exec-dashboard (1)

| # | Method + Path | Verdict | Reason |
| - | --- | --- | --- |
| 21 | `GET /exec-dashboard/unified-pnl` | **FIXED** | Month-to-date P&L card added to the executive dashboard |

---

## Wiring backlog (the actionable subset)

The remaining **DOC — UI pending** rows are not defects; they are a
backlog of backend-ready features awaiting a frontend. Highest-value
candidates to wire when product prioritizes them:

- **Per-document ACL admin** — #14, #17, #18, #19 (full grant/revoke/audit surface ready; security-sensitive — needs design)
- **Document retention console** — #15, #16
- **Message referral-chain view** — #20

_(#5 timeline and #6 presets-list turned out already wired; #7 preset-delete
and #21 unified-P&L were wired in this pass — see "Fixed in this pass".)_

The **driver-portal** set (#8–#13) is a separate-client contract — wire it
from the driver app, not the ERP SPA.

---

> **Record correction:** an earlier shortlist circulated referencing
> endpoints such as `umrah/families`, `umrah/refund-requests`, and
> `admin/communication-control/{outbound-queue,bulk-retry,validation}`.
> These do **not** exist in the current backend and are not produced by the
> wiring analyzer — they were stale/incorrect entries. The 45 figure above
> is the authoritative count from `check-frontend-backend-wiring.mjs`.
