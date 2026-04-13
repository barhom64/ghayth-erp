# Blueprint — Fleet

Fleet owns the vehicle + driver + trip triad plus their supporting
tables (maintenance, fuel logs, insurance, preventive plans, traffic
violations, GPS tracking). The module is multi-state: a single trip
start mutates four tables atomically and flips both the vehicle and
driver status fields. Trips are the bridge to finance — trip `cost`
rolls into the BI fleet TCO report and (once the expense integration
lands) will post as an expense journal entry.

## 1. Permissions

| Permission      | Used by                                                     |
| --------------- | ----------------------------------------------------------- |
| `fleet:read`    | All `GET` endpoints: vehicles, drivers, trips, maintenance, fuel logs, insurance, alerts, stats, preventive plans, traffic violations, TCO report |
| `fleet:create`  | `POST` create endpoints for vehicle, driver, trip, maintenance, fuel-log, insurance, preventive-plan, traffic-violation |
| `fleet:update`  | `PATCH` / complete / cancel / waypoint / pay handlers across all entities |
| `fleet:delete`  | `DELETE` soft-delete endpoints for vehicle, driver, trip, maintenance, fuel-log, insurance |

The module does not have its own role tier. Standard read/create/
update/delete semantics from `lib/rbacCatalog.ts` apply, so the
driver-assignment flow relies on UI-side role gating rather than
separate permissions.

## 2. Tables written to

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `fleet_vehicles`                   | Create / update. Status is flipped by trip start / complete / cancel and by the cron status check. |
| `fleet_drivers`                    | Create / update. `status` transitions `available → on_trip → available`; `totalTrips` increments on trip completion. |
| `fleet_trips`                      | Create (status `in_progress`), complete (status `completed`, `endTime`, actual distance, actual cost), cancel (status `cancelled`). |
| `fleet_gps_tracking`               | One row per waypoint posted to `POST /trips/:id/waypoints` — `(vehicleId, driverId, lat, lng, speed, recordedAt)`. |
| `fleet_maintenance`                | Create (status `scheduled`), complete (status `completed`, final cost). Completion can also deduct parts from warehouse. |
| `fleet_fuel_logs`                  | Create / update / soft-delete. Feeds the fuel-efficiency alert.           |
| `fleet_insurance`                  | Create / update / soft-delete. Feeds the expiry alert.                    |
| `fleet_preventive_plans`           | Create / update. Completing a plan step deducts warehouse parts.          |
| `fleet_traffic_violations`         | Create + pay (status `paid`, `paidAt`).                                   |
| `warehouse_movements`              | Written (`type='out'`) when a maintenance complete or preventive-plan step consumes parts from inventory. |
| `event_logs`                       | Audit row written on trip completion.                                     |

Trip create is the canonical multi-table handler
(`POST /fleet/trips` around line ~400): it inserts the trip row,
flips the vehicle to `in_use`, flips the driver to `on_trip`, all in
one logical unit. Trip complete mirrors the reverse transitions.

## 3. Events emitted

| Event                              | Emitted at                                     | Subscribers                          |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `fleet.vehicle.breakdown`          | `fleetStatusCheck` cron when a vehicle crosses the service-due mileage threshold | Notifications (fleet manager) |

Trip lifecycle events (`fleet.trip.started`, `fleet.trip.completed`,
`fleet.trip.cancelled`) are **not** emitted today — this is a known
gap listed in §6. The only emitter in the module is the breakdown
event from the daily status check.

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`fleet_status_check`** (daily 06:00) — scans `fleet_vehicles`
  where `"currentMileage" >= "nextServiceMileage"` and flips them to
  `needs_service`, creates a `fleet_service_overdue` alert, and
  emits `fleet.vehicle.breakdown`. Same job also:
  - Scans `fleet_insurance` for expired policies and raises a
    `fleet_insurance_expired` alert per affected vehicle.
  - Scans `fleet_drivers` for licenses whose `licenseExpiry <= today`,
    flips them to `suspended`, and raises an alert.
- **`weekly_fleet_report`** (Sunday 08:00) — sends a weekly summary
  (total vehicles, available, in-use, maintenance) to fleet managers.
- **Fuel-efficiency alerts** (embedded in `alerts` handler at line
  ~693 / ~745) — not a cron; computed on every `GET /fleet/alerts`
  call by joining fuel logs with recent trips.

## 5. Frontend entry points

- `/fleet/vehicles` — `src/pages/fleet/vehicles.tsx`
- `/fleet/drivers` — `src/pages/fleet/drivers.tsx`
- `/fleet/trips` — `src/pages/fleet/trips.tsx`
- `/fleet/trips/:id` — trip detail + waypoint map
- `/fleet/maintenance` — `src/pages/fleet/maintenance.tsx`
- `/fleet/fuel-logs` — `src/pages/fleet/fuel-logs.tsx`
- `/fleet/insurance` — `src/pages/fleet/insurance.tsx`
- `/fleet/preventive-plans` — `src/pages/fleet/preventive-plans.tsx`
- `/fleet/traffic-violations` — `src/pages/fleet/traffic-violations.tsx`
- `/fleet/alerts` — dashboard widget of all active alerts
- `/bi/fleet-tco` — read-only rollup of per-vehicle total cost of
  ownership (fuel + maintenance + depreciation)

## 6. Known open issues

- **Phase 7 smoke test:** "Fleet trip create → waypoint → complete →
  cost posting" is the target flow for the vitest suite.
- **Deeper gap #5 (event bus migration):** trip lifecycle should emit
  `fleet.trip.started` / `.completed` / `.cancelled` through
  `safeEmitEvent` so BI rollups and the expense poster can subscribe.
  Today the BI dashboard re-aggregates from `fleet_trips` directly.
- **Deeper gap #10 (expense integration):** trip `cost` is stored on
  the row but never posted as a GL expense. The completion handler
  should write a `journal_entries` row of type `expense` refType
  `fleet_trip` once the finance mapping lands.
- **Deeper gap #3 (obligations engine):** `fleet_status_check`
  iterates companies one-at-a-time — fine at current scale, will need
  sharding through the obligations engine past ~100 companies.
