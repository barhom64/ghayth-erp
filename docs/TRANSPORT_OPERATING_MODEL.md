# Transport Operating Model — #1812

> النقل ليس جزيرة — Transport is not an island.

This document is the formal closure of issue #1812 ("إعادة تخطيط مسار النقل ليكون مساعدًا تشغيليًا فعليًا"). It documents the **operating model** the system enforces, **not** the UI surface.

If you change one of the contracts below, search for `#1812` in the codebase, refresh the matching test, and update this file in the same PR. Tests reference the docs by `#1812 §<letter>` markers so a drift is immediately obvious.

---

## §A — Source → Booking → Dispatch → Execution → Finance

```
                    ┌─────────────────────────────────────────┐
                    │  SOURCE LAYER (cross-domain inputs)     │
                    │                                          │
                    │  umrah_group ─┐                          │
                    │  customer_req ├──→ transport_bookings    │
                    │  contract_sch │                          │
                    │  recurring    │                          │
                    │  import_excel │                          │
                    │  api_integ    │                          │
                    │  manual_entry ┘                          │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  BOOKING + LINES                         │
                    │  transport_bookings (header)             │
                    │  transport_booking_lines (per leg)       │
                    │                                          │
                    │  state: draft → submitted → approved →   │
                    │         scheduled → dispatched →         │
                    │         in_progress → completed          │
                    └─────────────────────────────────────────┘
                                       │
                          AssignmentSuggestionEngine
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  DISPATCH ORDER (per booking line)       │
                    │  transport_dispatch_orders               │
                    │                                          │
                    │  state: pending → notified → accepted →  │
                    │         executing → completed → closed   │
                    └─────────────────────────────────────────┘
                                       │
                          Driver acceptance / start / complete
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  DRIVER NAVIGATION SESSION               │
                    │  driver_navigation_sessions              │
                    │                                          │
                    │  cascade: dispatch.status → line.status  │
                    │           → booking.status (when ALL     │
                    │           lines are terminal)            │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  CARGO MANIFEST (cargo only)             │
                    │  cargo_manifests                         │
                    │  state: in_transit → delivered →         │
                    │         ready_for_invoice                │
                    └─────────────────────────────────────────┘
                                       │
                          ready_for_invoice transition gate
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  FINANCE HANDOFF                         │
                    │  transport_billing_candidates            │
                    │  → finance.transport_billing.materialized│
                    └─────────────────────────────────────────┘
```

**Cardinality**:

- 1 booking → N booking_lines (one per leg of a multi-leg trip).
- 1 booking_line → 0..1 dispatch_order (planning hasn't run yet → 0; planned → 1).
- 1 dispatch_order → 0..1 driver_navigation_session (driver hasn't accepted → 0).
- N booking_lines → 0..1 cargo_manifest (cargo bookings only; passenger bookings skip this layer).

---

## §B — Booking sources (`booking_source` enum)

The `booking_source` column on `transport_bookings` is the audit-trail link to the originating system. **Never set this from the SPA** — the create endpoint enforces it from server context.

| value               | trigger                                                                  | back-link column        |
|---------------------|--------------------------------------------------------------------------|--------------------------|
| `manual_entry`      | Operator typed the booking by hand from `/fleet/transport/bookings/create` | — (no FK)                |
| `customer_request`  | Customer self-served from `/client-portal/transport`                     | `customerRequestId`     |
| `umrah_group`       | Umrah ops linked a transport need via `UmrahGroupPicker`                 | `umrahGroupId`          |
| `contract_schedule` | Recurring contract obligation matured                                    | `contractObligationId`  |
| `recurring_schedule`| Cron created from a `recurring_bookings` template                        | `recurringTemplateId`   |
| `import_excel`      | Bulk import job created the booking                                      | `importJobId`           |
| `api_integration`   | External system POSTed via `/integrations/transport/bookings`            | `externalRef`           |

**Picker integration**: when the operator selects an umrah group via `UmrahGroupPicker`, the SPA auto-fills `umrahGroupId` + `passengerCount` + `customerName` and sets `bookingSource = "umrah_group"`. Any post-fill mutation to `passengerCount` is recorded in the audit log so finance can trace pricing variance.

---

## §C — Booking lifecycle state machine

Single source of truth: `BOOKING_TRANSITIONS` in `artifacts/api-server/src/routes/transport-bookings.ts`.

```
draft ──submit──→ submitted ──approve_req──→ pending_approval ──approve──→ approved
                                                        │
                                                        ├─reject──→ rejected (terminal)
                                                        └─cancel──→ cancelled (terminal)

approved ──schedule──→ scheduled ──dispatch──→ dispatched ──start──→ in_progress ──complete──→ completed (terminal)
                                                                                    └────┘
                                                                                       └─cancel from any non-terminal──→ cancelled
```

The booking state is **never** manually set from the SPA past `submitted`. Beyond that, transitions are **cascaded from the dispatch layer**:

| dispatch_orders.status | cascades booking_line.status to | cascades booking.status (only when ALL lines terminal) |
|------------------------|---------------------------------|--------------------------------------------------------|
| `pending`              | —                               | —                                                       |
| `notified`             | —                               | —                                                       |
| `accepted`             | `dispatched`                    | `dispatched`                                            |
| `executing`            | `in_progress`                   | `in_progress`                                           |
| `completed`            | `completed`                     | `completed`                                             |
| `cancelled`            | `cancelled`                     | `cancelled` (if every line cancelled)                   |
| `declined`             | `pending` (re-plan needed)      | —                                                       |
| `closed`               | —                               | —                                                       |

**Multi-leg safety**: the booking-level cascade fires only when `total_lines = lines_in_target_state`. A 3-leg umrah trip with leg 1 completed and legs 2-3 still executing **stays in `in_progress`** — it does not prematurely close.

---

## §D — Dispatch lifecycle state machine

Single source of truth: `DISPATCH_TRANSITIONS` in `artifacts/api-server/src/routes/transport-bookings.ts`.

```
pending ──notify──→ notified ──accept──→ accepted ──start──→ executing ──complete──→ completed ──close──→ closed
                       │                                                                          
                       ├─decline──→ declined (terminal — operator must re-plan)
                       └─cancel──→ cancelled (terminal from any non-terminal)
```

- `pending` → `notified` is the driver app notification fire.
- `notified` → `accepted/declined` is the driver's action in the app.
- `executing` is the live navigation window.
- `closed` is the financial cutover: cargo manifest sealed, billing candidate emitted.

---

## §E — Assignment suggestion engine (7 scoring factors)

`AssignmentSuggestionEngine` (`artifacts/api-server/src/lib/fleet/assignmentSuggestionEngine.ts`) ranks (vehicle, driver) candidates per booking. Each candidate carries:

| axis          | weight | hard-blocker condition                                  |
|---------------|--------|----------------------------------------------------------|
| `capacity`    | 1.0    | vehicle.capacity < booking.passengerCount/cargoWeight    |
| `availability`| 1.0    | vehicle is in maintenance / driver is on leave           |
| `conflict`    | 1.0    | overlapping `tstzrange` with an existing dispatch order  |
| `driverRest`  | 0.8    | < 10h since last shift (configurable per company)        |
| `license`     | 1.0    | license class mismatch / expired / iqama missing         |
| `distance`    | 0.5    | none (informational — closer is better)                  |
| `agreement`   | 0.7    | `requiredExactVehicleId/DriverId` mismatch               |

**Customer-agreement contract** (#1830):

- `requestedVehicleClass` — narrows candidate pool to vehicles of this class.
- `vehicleSubstitutionPolicy` — one of `exact_only`, `same_class`, `upgrade_allowed`, `any`, `any_with_consent`, `flexible`.
- `requiredExactVehicleId` / `requiredExactDriverId` — hard pinning. Engine returns blocker if can't satisfy.
- `allowUpgrade` — opt-in for `upgrade_allowed` policy.

**Dominant blockers panel** (#1872): when `candidates.every(c => c.blockers.length > 0)`, the dialog aggregates the top 5 blocker reasons (normalised by `replace(/\d+(\.\d+)?/g, "N")`) so the operator sees the root cause instead of "no match".

---

## §F — Maps contract (provider-agnostic)

`MapsService` (`artifacts/api-server/src/lib/fleet/mapsService.ts`) is the single entry point. **No route file imports a maps provider directly.**

| provider      | status   | external HTTP | fallback                              |
|---------------|----------|---------------|----------------------------------------|
| `manual_only` | shipped  | no            | —                                      |
| `google_maps` | stubbed  | not wired     | Returns manual estimate + `provider_stub: true` |
| `mapbox`      | stubbed  | not wired     | same                                   |
| `here_maps`   | stubbed  | not wired     | same                                   |

Provider per company is set in `transport_planning_settings.mapProvider`. Switching providers is one PR: implement the provider class, no caller change.

**Cache table**: `transport_route_estimates`. TTL per company in `transport_planning_settings.estimateCacheTtlMinutes`. A duplicate query inside the TTL window does **not** re-hit the provider.

**Lat/lng/placeId**: schema columns exist on `transport_booking_lines` (`pickupLat`, `pickupLng`, `pickupPlaceId`, `dropoffLat`, `dropoffLng`, `dropoffPlaceId`). The SPA accepts them but the manual_only provider only uses lat/lng for Haversine estimates. `placeId` is reserved for the eventual google/mapbox switch.

---

## §G — Driver app contract (`/me/driver/navigation`)

The driver self-service surface lives at `/me/driver` (dashboard) and `/me/driver/navigation` (active session). The driver role does **NOT** see:

- Prices (`unitPrice`, `totalAmount`).
- Costs (`fuelCost`, `tollCost`).
- Revenue / invoice / journal / debit / credit anywhere on the surface.

The driver UI is **finance-blackout** by contract. The acceptance test `driverFinanceBlackout.test.ts` grep-pins this — a single `unitPrice` token leaking into a driver-rendered page fails the suite.

Driver actions and their cascades:

| driver action  | endpoint                                              | dispatch.status → | session.status →   |
|----------------|--------------------------------------------------------|-------------------|-------------------|
| Accept         | `POST /transport/dispatch-orders/:id/accept`          | `accepted`         | `pending_start`    |
| Decline        | `POST /transport/dispatch-orders/:id/decline`         | `declined`         | (no session)       |
| Start trip     | `POST /transport/dispatch-orders/:id/start`           | `executing`        | `in_progress`      |
| GPS ping       | `POST /transport/sessions/:id/ping`                   | —                  | (ping rows appended) |
| Complete       | `POST /transport/dispatch-orders/:id/complete`        | `completed`        | `completed`        |

---

## §H — Finance handoff boundary

**The finance accountant never sees raw transport rows.** The handoff is mediated by `transport_billing_candidates`:

1. Cargo manifest reaches `delivered` status (or passenger booking reaches `completed`).
2. Operator (or auto-rule) transitions to `ready_for_invoice` — guarded by `ready_for_invoice` transition check.
3. Row inserted into `transport_billing_candidates` with the snapshot of pricing inputs.
4. Accountant reviews the queue at `/finance/transport-billing-candidates`.
5. Materialization fires `finance.transport_billing.materialized` event; row removed from queue.

The boundary is **transactional + idempotent**: a duplicate transition does not duplicate the candidate (unique index on `(companyId, sourceTable, sourceId)`).

---

## §I — Source integration bridge (`transport-integration.ts`)

Cross-domain bridges live in `transport-integration.ts` and follow one rule: **read-only on the source domain**.

- `/transport/integration/linked-sources` — lists umrah groups + customer requests + contract obligations within a date window. Returns counts of bookings already materialized so the picker can color-code (green = linked, warning = pending).
- `/transport/integration/plan-bookings` — atomically plans a batch of booking IDs (single or bulk). Used by the suggest dialog (single) and the ops dashboard "خطّط الكل" button (bulk).
- `/transport/integration/calendar.ics` — iCalendar feed of confirmed transport rides for the central calendar.

**No write-back to the source domain** — if umrah needs to know a booking was materialized, it watches the `fleet.transport_booking.created` event.

---

## §J — Acceptance journey

The end-to-end acceptance path required by #1812:

```
1. Umrah ops creates umrah_group via /umrah/groups/create
2. Transport operator opens /fleet/transport/bookings/create
3. Selects service_type = passenger_umrah
4. UmrahGroupPicker shows the group (green = no link yet)
5. Operator picks → bookingSource = umrah_group, passengerCount auto-filled
6. Operator adds 3 legs (airport → hotel → mazar → hotel)
7. Submits — booking lands in scheduled state
8. Operator clicks "اقترح إسناد" → engine returns 5 candidates
9. Picks the best → dispatch order auto-created (autoCreate=true)
10. Driver opens /me/driver, sees notified dispatch
11. Accepts → cascade flips line.status to dispatched
12. Starts → cascade flips line.status to in_progress, booking.status to in_progress
13. Completes leg 1 → only that line moves to completed
14. Completes legs 2 + 3 → booking.status cascades to completed
15. Transition to ready_for_invoice → billing candidate emitted
16. Accountant materializes → finance.transport_billing.materialized fires
```

The matching test is `transportRealIntegration.test.ts`.
