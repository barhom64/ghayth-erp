# Blueprint — Properties / Ejar

Properties owns the full real-estate lifecycle: buildings, units,
owners, tenants, rental contracts, security deposits, inspections,
maintenance requests, and the Ejar integration fields carried on the
contract row. It is the busiest source of the `rental_contracts` and
`rent_payments` tables that Finance reads for AR aging, and the main
subscriber to `/properties/maintenance-requests` from the tenant
self-service portal.

## 1. Permissions

The properties router is mounted at `/properties` behind
`requireModule("property")` (see `routes/index.ts:140`) — the module
gate blocks the whole surface for companies that do not have the
property module enabled.

Inside the router, however, there are **no** `requirePermission`
calls — every handler only runs through `authMiddleware`. This is a
known gap carried over from before the unified RBAC catalog
(deeper gap #4) and is tracked in §6.

| Surface                                 | Current gate                          |
| --------------------------------------- | ------------------------------------- |
| `GET /properties/*`                     | `authMiddleware` + `requireModule`    |
| `POST /properties/*`                    | `authMiddleware` + `requireModule`    |
| `PATCH /properties/*`                   | `authMiddleware` + `requireModule`    |
| `DELETE /properties/*`                  | `authMiddleware` + `requireModule`    |

When the permission migration lands the handlers should adopt the
`property:read` / `:create` / `:update` / `:delete` split that is
already reserved in `lib/rbacCatalog.ts`.

## 2. Tables written to

| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `property_buildings`               | Create / update / soft-delete. Carries `deedNumber`, `buildingPermitNumber`, `nationalAddress`, GPS, `ownerId`, `managerId`. |
| `property_units`                   | Create / update / soft-delete. Status transitions `vacant → rented → vacant` driven by contract activation / termination. Carries utility meters, finishing, `ownerId`. |
| `property_owners`                  | Full CRUD. Holds individual or entity owner metadata, authorization period, IBAN. |
| `rental_contracts`                 | Create (implicit `status='active'`, unit flipped to `rented`), update (including Ejar sync fields — `ejarNumber`, `ejarStatus`, `ejarFilingDate`, `ejarContractType`, `ejarFeeAmount`), soft-delete. |
| `rent_payments`                    | Inserted on contract create (schedule) + updated on `POST /contracts/:id/schedule/:installmentId/pay` + `POST /payments/:id/pay`. |
| `property_tenants`                 | Full CRUD including ID number, guarantor info.                           |
| `property_maintenance_requests`    | Create (draft), approve (status `approved`), complete (status `completed`, final cost, technician rating). |
| `property_inspections`             | Create + update — move-in / move-out / periodic inspection reports.       |
| `property_security_deposits`       | Create on contract activation + refund (`PATCH /deposits/:id/refund`).    |
| `notifications`                    | Written by the late-rent escalate handler and maintenance completion.     |
| `journal_entries`, `journal_lines` | Written via `createJournalEntry` when a maintenance request completion carries a cost (expense posting). |

The late-rent escalation handler (`POST /late-rent/escalate`) is the
most complex multi-table writer — it walks overdue `rent_payments`,
decides the escalation tier (reminder → warning → legal handoff), and
writes both a notification and (for the legal tier) a new
`legal_cases` row.

## 3. Events emitted

| Event                              | Emitted at                                    | Subscribers                        |
| ---------------------------------- | --------------------------------------------- | ---------------------------------- |
| `maintenance.completed`            | `POST /maintenance-requests/:id/complete`     | Notifications (tenant + owner), BI rollup |

Contract lifecycle (`properties.contract.activated`, `.terminated`,
`.ejar_synced`) is **not** emitted today — also part of the event bus
migration gap. The Ejar mock sync flips `ejarStatus` on the row
directly without an event.

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`daily_property_check`** (daily 08:00) — walks
  `rental_contracts` where the contract ends within the next 30 days
  and raises an alert per expiring contract. Severity tier flips to
  `critical` when `daysLeft <= 7`.
- **`weekly_property_revenue`** (Monday 09:00) — per-company rollup
  of `rent_payments` for the prior week; sends the "weekly property
  revenue" notification to the finance manager.
- **Late-rent scan** — runs inside `POST /late-rent/escalate` when
  called from the operations dashboard; it is not on a cron but is
  designed to be invoked from one.

## 5. Frontend entry points

- `/properties` — `src/pages/properties.tsx` (landing + stats)
- `/properties/units` — `src/pages/properties/units.tsx`
- `/properties/buildings` — `src/pages/properties/buildings.tsx`
- `/properties/contracts` — `src/pages/properties/contracts.tsx`
- `/properties/tenants` — `src/pages/properties/tenants.tsx`
- `/properties/owners` — `src/pages/properties/owners.tsx`
- `/properties/payments` — `src/pages/properties/payments.tsx`
- `/properties/maintenance` — `src/pages/properties/maintenance.tsx`
- `/properties/inspections` — `src/pages/properties/inspections.tsx`
- `/properties/deposits` — `src/pages/properties/deposits.tsx`
- `/properties/operations-dashboard` — `src/pages/properties/operations-dashboard.tsx`
- `/properties/occupancy-report` — `src/pages/properties/occupancy-report.tsx`
- `/bi/property-occupancy` — BI rollup of per-building occupancy

## 6. Known open issues

- **Phase 7 smoke test:** "Property contract create → Ejar sync
  (mocked) → rent schedule generation → first payment" is the target
  flow for the vitest suite.
- **Deeper gap #4 (unified RBAC):** the router has zero
  `requirePermission` calls. Every handler needs a
  `property:read/create/update/delete` gate.
- **Deeper gap #5 (event bus migration):** contract lifecycle and
  Ejar sync should emit events so Finance and BI can subscribe
  instead of polling `rental_contracts` directly.
- **Deeper gap #7 (real Ejar endpoint):** the `ejar*` columns are
  written by the frontend through `PATCH /contracts/:id`; there is
  no real call to the Ejar platform. Once the Ejar API lands, the
  contract create handler should push automatically and the webhook
  from Ejar should flip `ejarStatus`.
- **Deeper gap #10 (expense integration):** maintenance completion
  writes a GL expense through `createJournalEntry` — this is the
  only module already on the expected pattern. The others (fleet,
  payroll deductions) should mirror the approach.
