# Blueprint — CRM / Clients

The CRM surface is split between two routers: `clients.ts` owns the
client master (CRUD, portal accounts, auto-create from other modules),
and `crm.ts` owns the opportunity pipeline (leads, stages,
conversion, activities, followups). Both mount under the `crm`
module gate in `routes/index.ts:116` — disabling the CRM module hides
all client data and the pipeline.

## 1. Permissions

### Clients router (`/clients`)

No `requirePermission` calls today — handlers run through
`authMiddleware` + `requireModule("crm")` only. This is the same
pattern as Properties (see §6). When the migration lands the router
should adopt `crm:read/create/update/delete` and a dedicated
`crm:portal_admin` for the two portal-account handlers.

| Surface                                 | Current gate                          |
| --------------------------------------- | ------------------------------------- |
| `GET /clients`, `/clients/:id`          | `authMiddleware` + `requireModule`    |
| `POST /clients`                         | `authMiddleware` + `requireModule`    |
| `POST /clients/auto-create`             | `authMiddleware` + `requireModule`    |
| `PATCH /clients/:id`                    | `authMiddleware` + `requireModule`    |
| `DELETE /clients/:id`                   | `authMiddleware` + `requireModule`    |
| `GET/POST/PATCH /clients/:id/portal-account` | `authMiddleware` + `requireModule` |

### CRM router (`/crm`)

Fully on the unified RBAC catalog:

| Permission     | Used by                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `crm:read`     | `/crm/opportunities`, `/crm/opportunities/:id`, `/related`, `/activities`, `/pipeline`, `/analytics`, `/stats` |
| `crm:create`   | `POST /crm/opportunities`, `POST /crm/opportunities/:id/activities`, `POST /crm/followup-check` |
| `crm:update`   | `PATCH /crm/opportunities/:id`, `POST /crm/opportunities/:id/convert` |
| `crm:delete`   | `DELETE /crm/opportunities/:id`                                         |

## 2. Tables written to

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `clients`                          | Create / update / soft-delete / auto-create. Master table for AR, legal, CRM references. |
| `client_portal_accounts`           | `POST /clients/:id/portal-account` creates a client-portal login tied to the client row. `PATCH` rotates the password. |
| `crm_opportunities`                | Create / update (stage transitions, amount, close date), convert (flips to `won` and links to invoice), soft-delete. |
| `crm_opportunity_activities`       | One row per activity — call, email, meeting, note. Written by the activity POST handler and by the followup-check cron helper. |
| `crm_opportunity_followups`        | Scheduled followup rows written on opportunity create / stage transition. |
| `invoices`                         | Implicit write from `POST /crm/opportunities/:id/convert` — converting a won opportunity creates an invoice row for the linked client. |

The `POST /clients/auto-create` handler is the interesting edge: it
is called from Finance invoice create and Properties contract create
when the entered client name doesn't match an existing row — it
inserts a stub client with just name + phone so the transaction can
continue. Users de-duplicate later from the CRM screen.

## 3. Events emitted

No events are emitted by either router today — neither has a
`safeEmitEvent` or `eventBus.emit` call. Opportunity stage
transitions, won conversions, and client creation are all silent.

This is part of deeper gap #5 (event bus migration). When it lands
the minimum target set is:
- `crm.client.created`
- `crm.opportunity.stage_changed`
- `crm.opportunity.won`
- `crm.opportunity.lost`

## 4. Scheduled jobs

No CRM-specific cron jobs today. The `POST /crm/followup-check`
handler is designed to be invoked from a cron but is currently
request-scoped (the frontend calls it from the pipeline dashboard).

When the cron lands it should:
- Run daily at 08:00
- Walk `crm_opportunity_followups` where `scheduledDate <= today`
- Fire a notification per followup and mark it as done

## 5. Frontend entry points

- `/clients` — `src/pages/clients.tsx` (list + create)
- `/clients/:id` — `src/pages/client-detail.tsx` (tabs: overview,
  invoices, opportunities, contracts, portal account, activity)
- `/crm/pipeline` — `src/pages/crm/pipeline.tsx` (kanban stage board)
- `/crm/opportunities` — `src/pages/crm/opportunities.tsx`
- `/crm/opportunities/:id` — `src/pages/crm/opportunity-detail.tsx`
- `/crm/analytics` — `src/pages/crm/analytics.tsx`

## 6. Known open issues

- **Phase 7 smoke test:** "CRM opportunity create → stage transitions
  → convert to invoice → client auto-create" is the target flow.
- **Deeper gap #4 (unified RBAC):** the `/clients` router has zero
  permission gates and leaks through `requireModule` alone. Needs
  `crm:read/create/update/delete` + `crm:portal_admin`.
- **Deeper gap #5 (event bus):** opportunity and client lifecycle
  should emit events so notifications, BI, and the unified activity
  feed can subscribe.
- **Deeper gap #11 (client dedup):** `POST /clients/auto-create`
  does a soft name match and inserts a stub on miss — no canonical
  dedup story yet. Cross-company client merge also missing.
