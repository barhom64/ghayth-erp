# Transport Operating Model — #1812

> النقل ليس جزيرة — Transport is not an island.
> Two families. One canonical flow. No duplicated screens.

This document is the formal closure of issue #1812 ("إعادة تخطيط مسار النقل ليكون مساعدًا تشغيليًا فعليًا"). It documents the **operating model the system enforces** — not the UI surface.

If you change one of the contracts below, search for `#1812` in the codebase, refresh the matching test, and update this file in the same PR. Tests reference the docs by `#1812 §<letter>` markers so any drift is immediately obvious.

---

## §0 — Two trip families. One canonical flow.

Per the user's mandate (Comment 4663005810 on #1812), every booking belongs to **exactly one trip family**:

```
┌─────────────────────────────────────────┐    ┌─────────────────────────────────────────┐
│       PASSENGER FAMILY (ركاب)            │    │         CARGO FAMILY (حمولة)            │
│                                          │    │                                          │
│  • umrah link                            │    │  • single trip OR Route Pattern (متكرر)   │
│  • customer / contract link              │    │  • loading points (نقاط التحميل)         │
│  • actual passenger count                │    │  • scale (الميزان)                       │
│  • actual seat count                     │    │  • inspection (التفتيش)                  │
│  • seat count excludes the driver        │    │  • rest stops (نقاط الراحة)              │
│  • multi-leg (مطار → فندق → حرم → ...)   │    │  • fuel stops (محطات الوقود)            │
│  • airports / hotels / mazars            │    │  • unloading (التفريغ)                   │
│  • complete driver experience            │    │  • recurring schedule (الردود المتكررة)   │
│  • status auto-cascades from driver      │    │  • Route Pattern → cron materialises    │
└─────────────────────────────────────────┘    └─────────────────────────────────────────┘
                       │                                              │
                       └────────────── ONE CANONICAL FLOW ────────────┘
                                              ▼
                ┌──────────────────────────────────────────────────────────┐
                │  Booking / Template                                       │
                │     → Legs / Route Pattern                                │
                │       → Dispatch Order                                    │
                │         → Driver Execution                                │
                │           → Operational Close                             │
                │             → Accounting Candidate                       │
                └──────────────────────────────────────────────────────────┘
```

**The official model is NOT ten screens for the same thing.** It's the 6 steps above. Every other surface either:
- creates one of those entities (e.g. booking-create form), or
- views one of those entities (e.g. dispatch board), or
- transitions one to the next (e.g. status cascade).

### tripFamily column (migration 284)

`transport_bookings.tripFamily` is the canonical discriminator:

| value | populated when | drives |
|-------|----------------|--------|
| `passenger` | `transportServiceType` ∈ {`passenger_umrah`, `passenger_general`, `equipment_rental`, `internal_transfer` with people, `other` with passengers} | renders passenger UI + skips cargo-operational fields |
| `cargo` | `transportServiceType = cargo_load` OR materialised from a `transport_route_patterns` row | renders cargo UI + exposes loading/scale/inspection/unloading checkpoints |

Old bookings without `tripFamily` are inferred from `transportServiceType` by the route at read time.

---

## §A — Source → Booking → Dispatch → Execution → Finance

```
                    ┌─────────────────────────────────────────┐
                    │  SOURCE LAYER (cross-domain inputs)     │
                    │                                          │
                    │  umrah_group ─┐                          │
                    │  customer_req ├──→ transport_bookings    │
                    │  contract_sch │      (passenger family)   │
                    │  manual_entry │                          │
                    │  api_integ ───┘                          │
                    │                                          │
                    │  route_pattern → bookings (cargo, cron)  │
                    │  import_excel                            │
                    │  recurring_schedule                      │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  BOOKING + LINES                         │
                    │  transport_bookings (header)             │
                    │   ├── tripFamily: passenger | cargo      │
                    │   ├── routePatternId (when cargo recur)   │
                    │   └── cargoOperationalMetadata (jsonb)   │
                    │  transport_booking_lines (per leg)       │
                    │                                          │
                    │  state: draft → submitted → approved →   │
                    │         scheduled → dispatched →         │
                    │         in_progress → completed          │
                    └─────────────────────────────────────────┘
                                       │
                          AssignmentSuggestionEngine
                          (filters by tripFamily + vehicle
                           validForPassengers / validForCargo)
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  DISPATCH ORDER (per booking line)       │
                    │  transport_dispatch_orders               │
                    └─────────────────────────────────────────┘
                                       │
                          Driver acceptance / start / complete
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  DRIVER NAVIGATION SESSION               │
                    │  driver_navigation_sessions              │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼ (cargo only)
                    ┌─────────────────────────────────────────┐
                    │  CARGO MANIFEST + OPERATIONAL CLOSE      │
                    │  cargo_manifests                         │
                    │  + cargoOperationalMetadata milestones    │
                    │    (loaded / scaled / inspected /        │
                    │     rested / refuelled / unloaded)       │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  ACCOUNTING CANDIDATE                    │
                    │  transport_billing_candidates            │
                    │  → finance.transport_billing.materialized│
                    └─────────────────────────────────────────┘
```

---

## §B — Booking sources (`bookingSource` enum)

| value | trigger | back-link FK |
|-------|---------|--------------|
| `manual_entry` | Operator typed by hand | — |
| `customer_request` | Customer self-served via portal | `customerId` |
| `umrah_group` | Umrah ops linked via `UmrahGroupPicker` | `umrahGroupId` |
| `contract_schedule` | Recurring contract obligation matured | `contractObligationId` |
| `recurring_schedule` | Cargo Route Pattern cron materialised | `routePatternId` |
| `import_excel` | Bulk import job | `importJobId` |
| `api_integration` | External system POSTed | `externalRef` |

When the operator selects an umrah group via `UmrahGroupPicker`, the SPA auto-fills `umrahGroupId` + `passengerCount` + `customerName` and sets `bookingSource = "umrah_group"`. Any post-fill mutation to `passengerCount` is recorded in the audit log.

---

## §C — Passenger family contract

Mandatory enforced fields (`tripFamily = passenger`):

- **Source link** — at least one of `umrahGroupId` / `customerId` / `contractId` (validated by the source-driven UI)
- **Real passenger count** — `passengerCount` is the headcount NOT including the driver
- **Real seat count** — vehicle's `seatCount` field excludes the driver seat
- **Multi-leg ready** — `transport_booking_lines` carries per-leg from/to/timing
- **Umrah context (when `passenger_umrah`)** — flightNumber / hotelName / supervisorName / supervisorPhone (the 4 questions in `UmrahContextQuestionnaire`)
- **Status auto-cascade** — manual status dropdown excludes `dispatched`/`in_progress`/`completed`; those flip from driver actions only

### Passenger driver experience surface

The driver UI (`/me/driver` + `/me/driver/navigation`) shows ONLY:
- المهام (tasks list)
- الخريطة (map)
- التنفيذ (execution actions: accept / start / complete)
- الإثباتات (proof uploads — photos, signatures)
- الحالات (status indicator — read-only)

No price / cost / revenue / invoice / journal labels. Enforced by `transportSpaSurface.test.ts` finance-blackout block.

---

## §D — Cargo family contract

Mandatory enforced fields (`tripFamily = cargo`):

- **Single OR recurring** — single = direct booking; recurring = materialised from `transport_route_patterns`
- **Route Pattern (when recurring)** — `daysOfWeekMask` + `departureTime` + `activeFrom`/`activeUntil` + cargo defaults
- **Operational checkpoints** — `cargoOperationalMetadata` JSONB column exists in `transport_bookings` (migration 284). The intended shape is:
  - `loadingPoints[]` — where cargo is loaded
  - `scale` — weighing station + weighedAt + weighKg
  - `inspection` — inspector / result / photo URLs
  - `restStops[]` — planned rest pauses per driver-rest rules
  - `fuelStops[]` — planned refuel stations with expected liters
  - `unloading` — destination unloading + receivedBy

  > ⚠️ **Status (2026-06-09 audit)**: the column exists but the SPA editor is NOT yet shipped. The shape above is the **target contract** — implementers must build the cargo-operational-metadata editor as a follow-up PR. Until then, this field stays NULL on every booking. **No code currently reads or writes it.**

### Cargo route_pattern materialisation

Cron runs daily. For every active `transport_route_patterns` row where `daysOfWeekMask` matches today's day:
1. Read pattern defaults (vehicle class, license class, customer, contract, cargo weight/unit, waypoints)
2. INSERT a fresh `transport_bookings` row with:
   - `tripFamily = 'cargo'`
   - `routePatternId = <pattern.id>`
   - `bookingSource = 'recurring_schedule'`
   - All defaults copied
3. Emit `fleet.booking.created` event with `details.routePatternId` for audit

---

## §E — Vehicle technical profile (migration 284 expansion)

The user's explicit field list:

| field | meaning | used by |
|-------|---------|---------|
| `seatCount` | passenger seats (excluding driver) | passenger capacity check |
| `payloadKg` | LEGAL/registered weight (Wazn nodhomi) | cargo legal compliance |
| `operationalPayloadKg` | safe operating weight (Wazn tashghili) | cargo capacity scorer |
| `boxLengthCm` / `boxWidthCm` / `boxHeightCm` | cargo box dimensions | bulky-item fit check |
| `axleCount` | عدد المحاور | weight distribution, road-fee classification |
| `tireCount` | عدد الكفرات | maintenance scheduling |
| `validForPassengers` | this vehicle can carry passengers | family filter (passenger trips) |
| `validForCargo` | this vehicle can carry cargo | family filter (cargo trips) |

`AssignmentSuggestionEngine` filters by `tripFamily`:
- passenger booking → only `validForPassengers = TRUE` vehicles in candidate pool
- cargo booking → only `validForCargo = TRUE` vehicles
- both flags TRUE → vehicle is in both pools (e.g. equipment_rental hybrid)

---

## §F — Admin experience surface

Per the user's mandate (Comment 4663005810):

| Screen | What lives here |
|--------|-----------------|
| `/fleet/transport/bookings/create` | إنشاء حجز (one form — branches on `tripFamily`) |
| `/fleet/transport/route-patterns` | جداول الرحلات المتكرّرة (cargo) |
| `/fleet/transport/dispatch` | لوحة التوزيع + التعارضات |
| `/fleet/transport/ops-dashboard` | الجدولة + KPIs |
| `/fleet/transport/integration` | linked sources (umrah / customer / contract) |
| `/fleet/transport/itineraries` | برامج رحلات متعددة المقاطع |
| `/finance/transport-billing-candidates` | Accounting candidate handoff |

No duplicate "trip create" screen. `/fleet/trips/create` is deprecated (#1893) and redirects to the booking flow.

---

## §G — Booking lifecycle state machine

Single source of truth: `BOOKING_TRANSITIONS` in `transport-bookings.ts`.

```
draft ──submit──→ submitted ──approve_req──→ pending_approval ──approve──→ approved
                                                        │
                                                        ├─reject──→ rejected (terminal)
                                                        └─cancel──→ cancelled (terminal)

approved ──schedule──→ scheduled ──dispatch──→ dispatched ──start──→ in_progress ──complete──→ completed (terminal)
                                                                                    └────┘
                                                                                       └─cancel from any non-terminal──→ cancelled
```

`dispatched` / `in_progress` / `completed` are **system-driven** — they cascade from `transport_dispatch_orders.status` (see §H). The operator UI exposes only the manually-driveable transitions.

---

## §H — Dispatch lifecycle + cascade

`DISPATCH_TRANSITIONS` in `transport-bookings.ts`:

```
pending ──notify──→ notified ──accept──→ accepted ──start──→ executing ──complete──→ completed ──close──→ closed
                       │
                       ├─decline──→ declined (operator must re-plan)
                       └─cancel──→ cancelled (terminal)
```

Cascade to booking_line + booking:

| dispatch.status | line.status → | booking.status → (when ALL lines settle) |
|-----------------|---------------|------------------------------------------|
| `accepted` | `dispatched` | ⚠️ **NOT cascaded** — line flips, booking unchanged. Operator manually moves `approved → scheduled` for the visible state. |
| `executing` | `in_progress` | `in_progress` (cascades when total_lines = lines_in_progress) |
| `completed` | `completed` | `completed` (cascades when ALL lines completed) |
| `cancelled` | `cancelled` | `cancelled` (cascades when every line cancelled) |

> **Audit note (2026-06-09)**: code at `transport-bookings.ts` line 998 filters the booking-level cascade to `executing | completed | cancelled` only. Acceptance triggers line-level cascade but NOT booking-level — by design (operator can still see `scheduled` while dispatches are accepted but not yet started). Earlier docs claimed `accepted → booking.dispatched` — that was an overstatement; this table now matches the code.

**Multi-leg safety**: booking-level cascade fires only when `total_lines = lines_in_target_state`. A 3-leg umrah trip with leg 1 completed stays `in_progress`.

---

## §I — Assignment suggestion engine

7 scoring factors. Each candidate carries `score` (0..100), `scores` map, `reasons[]`, `blockers[]`:

| axis | weight | hard-blocker condition |
|------|--------|------------------------|
| `capacity` | 1.0 | vehicle.capacity < requirement (passenger or cargo) |
| `availability` | 1.0 | vehicle in maintenance / driver on leave |
| `conflict` | 1.0 | overlapping `tstzrange` with existing dispatch |
| `driverRest` | 0.8 | < required rest hours since last shift |
| `license` | 1.0 | license class mismatch / expired |
| `distance` | 0.5 | informational |
| `agreement` | 0.7 | `requiredExactVehicleId/DriverId` mismatch |

**Family filter** (new with §E + #1812): candidate pool restricted by `tripFamily`:
- passenger → `validForPassengers = TRUE`
- cargo → `validForCargo = TRUE`

**Diagnostics** (#1923): when no candidates returned, `suggestDiagnostics.ts` runs 2 COUNT queries and explains WHY (no_vehicles / no_dispatchable / no_active_drivers / no_window / all_busy / all_blocked).

---

## §J — Maps contract

`MapsService` (`mapsService.ts`) is the single entry. No route file imports a provider directly.

| provider | status | external HTTP |
|----------|--------|---------------|
| `manual_only` | shipped | no (Haversine baseline) |
| `google_maps` | **shipped (#1934)** | yes — Distance Matrix + Geocoding |
| `mapbox` | stubbed | not wired |
| `here_maps` | stubbed | not wired |

Per-company key in `transport_planning_settings.mapProviderApiKey`; env fallback `config.googleMapsApiKey`. Provider failure → transparent fallback to `manual_only` + `isApproximate: true` flag. See `docs/MAPS_PROVIDER_SETUP.md` for the operator setup playbook.

---

## §K — Acceptance journey (the user's mandated tests)

Per Comment 4663005810, these are the 6 acceptance scenarios the system must pass end-to-end:

### 1. رحلة ركاب من العمرة
```
1. Umrah ops creates umrah_group
2. Transport operator opens /fleet/transport/bookings/create
3. BookingSourceSelector → "مجموعة عمرة" → UmrahGroupPicker
4. UmrahContextQuestionnaire prompts 4 questions
5. Operator adds 3-6 legs via MultiLegBookingEditor (or applies the 6-step umrah template)
6. Submits — tripFamily auto-set to 'passenger', umrahGroupId linked
7. AssignmentSuggestionEngine ranks only validForPassengers vehicles
8. Dispatch order materialised, driver app cascades up
```

### 2. رحلة ركاب للسائق
```
1. Driver opens /me/driver — sees only the 5 surfaces (tasks/map/exec/proofs/status)
2. No price/cost/revenue labels anywhere
3. Status cascades up automatically as driver acts
```

### 3. حمولة مرة واحدة
```
1. Operator opens /fleet/transport/bookings/create
2. Service type = cargo_load
3. tripFamily auto-set to 'cargo' — passenger fields hidden
4. Operator fills cargo description + weight (cargoOperationalMetadata editor is TBD, see §D)
5. AssignmentSuggestionEngine ranks only validForCargo vehicles (filter wired in PR #1970)
```

### 4. حمولة متكررة
```
1. Operator opens /fleet/transport/route-patterns/create
2. Sets daysOfWeekMask (Mon/Wed/Fri) + departureTime + route + cargo defaults
3. Cron daily checks active patterns
4. Materialised bookings appear automatically with bookingSource = recurring_schedule
   + routePatternId = pattern.id (audit lineage preserved)
```

### 5. تجربة السائق
```
1. Notified dispatch surfaces in driver app
2. Driver accept → status cascades to booking.dispatched
3. Driver start → booking.in_progress
4. Driver upload proofs (photos, signatures) → recorded on cargo_manifest or session
5. Driver complete → booking.completed → billing candidate emitted
```

### 6. تجربة الإداري
```
1. Admin sees only the 7 admin surfaces listed in §F
2. No "create trip" duplicate path
3. Dispatch board surfaces conflicts visually
4. Ops dashboard shows daily KPIs
5. Reports use canonical 6-step state for ALL accounting reconciliation
```

The matching test is `transportRealIntegration.test.ts` (existing) + `transportCargoPassengerCanon.test.ts` (new with this PR, §K1-K6 markers).
