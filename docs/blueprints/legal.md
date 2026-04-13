# Blueprint — Legal

Legal owns two parallel surfaces on the same router: **contracts**
(the legal paperwork lifecycle — active, renew, terminate, renewal
alerts) and **cases** (the courtroom workflow — sessions, hearings,
correspondence, judgments, financial risk rollup). A legal session
is also the bridge to Finance: recording a session with a billable
note triggers an invoice insert against the client.

## 1. Permissions

The legal router is mounted at `/legal` under
`requireModule("legal")` in `routes/index.ts:141`. Inside the router
there are **no** `requirePermission` calls today — every handler
runs through `authMiddleware` only.

| Surface                                   | Current gate                         |
| ----------------------------------------- | ------------------------------------ |
| `GET /legal/contracts`, `/:id`            | `authMiddleware` + `requireModule`   |
| `POST /legal/contracts`                   | `authMiddleware` + `requireModule`   |
| `PATCH /legal/contracts/:id`              | `authMiddleware` + `requireModule`   |
| `POST /legal/contracts/:id/renew`         | `authMiddleware` + `requireModule`   |
| `POST /legal/contracts/:id/terminate`     | `authMiddleware` + `requireModule`   |
| `DELETE /legal/contracts/:id`             | `authMiddleware` + `requireModule`   |
| `GET /legal/cases`, `/:id`                | `authMiddleware` + `requireModule`   |
| `POST /legal/cases`                       | `authMiddleware` + `requireModule`   |
| `PATCH /legal/cases/:id`                  | `authMiddleware` + `requireModule`   |
| `POST /legal/cases/:caseId/sessions`      | `authMiddleware` + `requireModule`   |
| `POST /legal/cases/:caseId/judgments`     | `authMiddleware` + `requireModule`   |
| `PATCH /legal/cases/:id/financial-risk`   | `authMiddleware` + `requireModule`   |

When the RBAC migration lands this needs the full
`legal:read/create/update/delete` split, plus a dedicated
`legal:cases:approve` for the judgment-signoff handler (it writes
financial risk and triggers invoice creation).

## 2. Tables written to

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `legal_contracts`                  | Create / update / renew / terminate / soft-delete. Renewal writes a new row and flips the parent's status. |
| `legal_cases`                      | Create (status `open`), update (including `nextHearingDate`, `financialRisk`, `riskLevel`), soft-delete. Status transitions to `in_progress` when the first session is recorded. |
| `legal_sessions`                   | One row per hearing — `(caseId, sessionDate, location, judge, result, nextSessionDate)`. |
| `legal_correspondence`             | One row per inbound/outbound letter — `(caseId, direction, subject, parties, documentRef)`. |
| `legal_judgments`                  | Judgment row — `(caseId, judgmentDate, judgmentType, verdict, amount, paidAmount, dueDate)`. Also rolls the amount into `legal_cases.financialRisk`. |
| `invoices`                         | Implicit: `POST /cases/:caseId/sessions` with a billable fee inserts a draft invoice for the case's client. |
| `notifications`                    | Written by `daily_legal_check` cron for upcoming hearings. |

The session → invoice bridge is the only cross-module writer. Note
it inserts the invoice with `clientId = NULL` when the case has no
linked client (e.g. internal matters) — the invoice is later
attached manually from the finance side.

## 3. Events emitted

None. The legal router has no `safeEmitEvent` or `eventBus.emit`
calls. Contract renewal, case creation, session recording, and
judgment signoff are all silent.

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`daily_legal_check`** (daily) — scans `legal_cases` where
  `"nextHearingDate"` falls within the next 7 days and raises a
  `legal_hearing` alert per case. The severity stays at `warning`
  regardless of how close the hearing is.
- **Contract renewal alerts** — computed on every
  `GET /legal/contracts/renewal-alerts` call (not cron-driven). The
  handler walks contracts with `endDate` in the next 60 days and
  returns them grouped by urgency tier.

## 5. Frontend entry points

- `/legal/contracts` — `src/pages/legal/contracts.tsx`
- `/legal/contracts/:id` — `src/pages/legal/contract-detail.tsx`
- `/legal/cases` — `src/pages/legal/cases.tsx`
- `/legal/cases/:id` — `src/pages/legal/case-detail.tsx` (tabs:
  overview, sessions, correspondence, judgments, financial risk)
- `/legal/sessions/upcoming` — `src/pages/legal/upcoming-sessions.tsx`
- `/legal/judgments/financial-report` — financial risk rollup view

## 6. Known open issues

- **Phase 7 smoke test:** "Legal case create → session record →
  judgment sign-off → financial risk rollup → invoice insert" is the
  target flow.
- **Deeper gap #4 (unified RBAC):** the router has zero permission
  gates. Needs `legal:read/create/update/delete` and
  `legal:cases:approve` for judgment signoff.
- **Deeper gap #5 (event bus):** contract renewal, case opening,
  judgment signoff should emit events so BI, notifications, and
  Finance can subscribe instead of polling.
- **Deeper gap #10 (expense integration):** today the session →
  invoice bridge only posts AR. Lawyer-fee expenses recorded via
  judgments do not post to the GL.
