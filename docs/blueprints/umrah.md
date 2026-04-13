# Blueprint — Umrah

Umrah is the operational module for Umrah-season management: seasons,
agents, packages, pilgrims, visa/arrival/departure tracking, overstay
penalties, transport bookings, and agent invoice generation. It is
the only module that imports Excel sheets of pilgrims in bulk (the
`POST /umrah/import` handler), and the only one that owns a domain-
specific "penalty engine" — overstayed pilgrims auto-write rows to
`umrah_penalties` from a cron-triggered pass.

## 1. Permissions

The Umrah router is fully on the unified RBAC catalog, reusing the
generic `operations:*` permission family (same as projects). Every
handler carries an explicit `requirePermission` gate.

| Permission           | Used by                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `operations:read`    | `/umrah/seasons`, `/agents`, `/packages`, `/pilgrims`, `/pilgrims/:id`, `/dashboard`, `/penalties`, `/agent-invoices`, `/transport`, `/import-logs`, `/unassigned` |
| `operations:create`  | `POST /umrah/seasons`, `/agents`, `/packages`, `/pilgrims`, `/import`, `/run-daily-status`, `/run-penalty-engine`, `/agent-invoices/generate`, `/transport`, `/assign-bulk` |
| `operations:update`  | `PATCH /umrah/seasons/:id`, `/agents/:id`, `/pilgrims/:id`       |

The `/run-daily-status` and `/run-penalty-engine` endpoints are both
gated by `operations:create` because they are write-heavy — they
batch-update `umrah_pilgrims` and insert `umrah_penalties` rows.

## 2. Tables written to

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `umrah_seasons`                    | Create / update. Header: title, date window, notes.                       |
| `umrah_agents`                     | Create / update. Each agent carries a profit margin and contract ref.     |
| `umrah_packages`                   | Create. Linked to a season; carries cost/sell price and includes flags. |
| `umrah_pilgrims`                   | Create (manual or via bulk import), update. Status transitions: `pending → arrived → departed` or `arrived → overstayed → overstay_penalized`. |
| `umrah_import_logs`                | Header per bulk-import run — file metadata, counts of new/updated/duplicate/error rows. |
| `umrah_penalties`                  | Written by the penalty engine when a pilgrim crosses the overstay threshold. Later flipped to `invoiced` when an agent invoice is generated. |
| `umrah_agent_invoices`             | `POST /umrah/agent-invoices/generate` writes one header row per agent + season, aggregating the penalties and services into subtotal + commission + total. |
| `umrah_transport`                  | One row per trip — season, date, from/to, optional vehicle + driver, capacity, pilgrim count. |

The daily-status handler is the canonical multi-phase writer:

1. Flip pilgrims whose `arrivalDate` passed to `status='arrived'`.
2. Flip arrived pilgrims whose `departureDate` passed to
   `status='overstayed'`.
3. Flip overstayed pilgrims whose overstay window has closed to
   `status='departed'` (assume they left without a record).

Then the penalty engine (`/run-penalty-engine`) iterates the
overstayed rows and writes `umrah_penalties` + flips the pilgrim to
`overstay_penalized`.

## 3. Events emitted

None. The Umrah router has zero `safeEmitEvent` calls. All flows
(status transitions, penalty creation, agent invoice generation) are
silent and the frontend must poll for updates.

When the event bus migration lands the minimum set is:
- `umrah.pilgrim.arrived`
- `umrah.pilgrim.overstayed`
- `umrah.penalty.created`
- `umrah.agent_invoice.generated`

## 4. Scheduled jobs

**There is no Umrah-specific cron today.** The `/run-daily-status`
and `/run-penalty-engine` handlers exist in the router but are
invoked manually from the frontend dashboard's "Run Now" button.
This is a deliberate interim choice — until the penalty thresholds
are codified in the obligations engine (deeper gap #3), the module
is kept request-scoped so an operator can review the preview before
writing.

Planned cron targets (tracked but not yet in `cronScheduler.ts`):
- `umrah_daily_status` (daily 23:00) — calls the same logic as
  `/run-daily-status` per company.
- `umrah_penalty_scan` (daily 23:30) — calls `/run-penalty-engine`
  per company after the status pass.

## 5. Frontend entry points

- `/umrah/dashboard` — `src/pages/umrah/dashboard.tsx`
- `/umrah/seasons` — `src/pages/umrah/seasons.tsx`
- `/umrah/agents` — `src/pages/umrah/agents.tsx`
- `/umrah/packages` — `src/pages/umrah/packages.tsx`
- `/umrah/pilgrims` — `src/pages/umrah/pilgrims.tsx`
- `/umrah/pilgrims/:id` — `src/pages/umrah/pilgrim-detail.tsx`
- `/umrah/import` — bulk import wizard (`src/pages/umrah/import.tsx`)
- `/umrah/penalties` — `src/pages/umrah/penalties.tsx`
- `/umrah/agent-invoices` — `src/pages/umrah/agent-invoices.tsx`
- `/umrah/transport` — `src/pages/umrah/transport.tsx`
- `/umrah/assign` — bulk assignment (`src/pages/umrah/assign.tsx`)

## 6. Known open issues

- **Phase 7 smoke test:** "Umrah pilgrim import (10 rows) → daily
  status → overstay detected → penalty engine → agent invoice" is
  the target flow.
- **Deeper gap #3 (obligations engine):** the penalty engine and
  daily-status run are both manual triggers. Should move to cron
  once the obligations engine ships so the run is sharded by
  company and the state transitions become idempotent.
- **Deeper gap #5 (event bus):** all transitions are silent. Needs
  the four events listed in §3 so BI and notifications can subscribe.
- **Deeper gap #10 (expense integration):** `umrah_agent_invoices`
  is not posted to the GL as a receivable. It should mirror the
  Finance invoices blueprint.
