# U-15 — Packages / accommodations classification audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Resolve packages/accommodations classification."

**TL;DR:** Two distinct models exist with no FK between them.
`umrah_packages` is a product catalog (booleans for what's
included). `umrah_hotels` + `umrah_room_blocks` +
`umrah_room_allocations` (migration 246) is the operational
accommodation tracker. They never meet — a package marked
`includesHotel=true` does NOT tell you which hotel. The
`umrah_pilgrims.hotelName` free-text string remains an authoritative
fallback. **Three sources of truth for "what hotel does this
pilgrim stay at?"** Recovery is to wire FKs + add resolution
order + close the legacy string with a deprecation path.

---

## 1. Inventory — what exists

### 1.1 `umrah_packages` (older — product catalog)
Schema (from `db/schema_pre.sql`):
```sql
CREATE TABLE umrah_packages (
  id, companyId, branchId, name, seasonId,
  costPrice, sellPrice,
  includesTransport, includesHotel, includesMeals, includesZiyarat,
  duration, description, status,
  createdAt, updatedAt, deletedAt, createdBy, updatedBy
);
```

**Surface:**
- 4 booleans: `includesTransport`, `includesHotel`, `includesMeals`, `includesZiyarat`.
- 0 FK to hotels / room blocks / transport / meal plans.
- `costPrice` + `sellPrice` flat numbers — no breakdown per included item.
- Linked from `umrah_pilgrims.packageId`.

Created by `POST /umrah/packages` (umrah-entities.ts).

### 1.2 `umrah_hotels` + `umrah_room_blocks` + `umrah_room_allocations` (migration 246)
The accommodation operational model:

```sql
umrah_hotels (id, companyId, name, city, starRating, contactName, contactPhone)
umrah_room_blocks (id, hotelId, seasonId, checkInDate, checkOutDate,
                   roomType ∈ {single,double,triple,quad,suite},
                   totalRooms, ratePerNight, currency)
umrah_room_allocations (id, blockId, pilgrimId, roomNumber, status, ...)
```

Migration 246 explicitly says:
> "The `hotelName` string on umrah_pilgrims stays for backward
> compatibility — when an allocation row exists it takes
> precedence; otherwise the legacy string is the source of
> truth."

### 1.3 `umrah_pilgrims.hotelName` (legacy free-text)
A free-text string column on pilgrim row. Predates migration
246. Migration 246 keeps it for backward compatibility with
the rule "allocation row wins if present, else hotelName wins."

---

## 2. Classification gap

### 2.1 No FK from package to hotel/block
A package's `includesHotel = true` doesn't tell you which hotel
or which block. The operator who sells a "VIP Hilton 7-night
package" stores `name='VIP Hilton 7-night'` + `includesHotel=true`
but the package row never references a hotel id. The operator
later has to manually create a room allocation for each pilgrim
under that package.

**Consequence:** the package definition can drift from the
actual hotel — a "5-star Hilton" package can be silently fulfilled
with a 3-star fallback because the package only says "yes
hotel included", not which hotel.

### 2.2 Three sources of truth for "what hotel?"
For a given pilgrim:
1. **Package row** says `includesHotel=true` (no hotel id).
2. **Pilgrim row** has `hotelName='Hilton Makkah'` (free text).
3. **Room allocation** links pilgrim to a specific `umrah_room_blocks.id → umrah_hotels.id`.

Migration 246's resolution: allocation wins if present, else
hotelName. **Package never wins because it doesn't carry a
hotel id at all.**

This is the inverse of what most operators expect — they
expect "I sold a Hilton package → the hotel is Hilton" — but
the model says "the package is just a name."

### 2.3 Pricing reconciliation is manual
Package has `costPrice` + `sellPrice` as flat numbers. Room
block has `ratePerNight`. If a package "VIP Hilton 7-night"
prices at 1500 SAR/night × 7 = 10,500 SAR cost basis, and the
operator later updates the block's ratePerNight to 1800,
**the package's costPrice does NOT auto-update**. There's no
cron, no smoke, no link.

### 2.4 No package → transport / meals / ziyarat link
Same pattern for the other 3 booleans:
- `includesTransport = true` → no `umrah_transport.id` FK
- `includesMeals = true` → no meal-plan FK (no meal-plan model exists)
- `includesZiyarat = true` → no ziyarat tour FK (no model exists)

So 3 of the 4 booleans don't have a counterpart operational
model at all. They're informational only — the operator has
to verbally remember what each package includes.

### 2.5 No cancellation propagation
If a room allocation is cancelled, does the package status
change? If a package's `seasonId` is removed, does the
allocation reference stay valid? The model has no triggers,
no constraints linking the two.

### 2.6 No smoke pinning the resolution order
There's no `umrahHotelResolutionSmoke.test.ts` that pins the
order: allocation > hotelName. A regression that flips the
order (or drops hotelName silently) would slip past.

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-15-P1 — Schema additive: package → hotel FK (🟢 autonomous)
Add nullable `defaultHotelId` to `umrah_packages`:

```sql
ALTER TABLE umrah_packages
  ADD COLUMN IF NOT EXISTS "defaultHotelId" integer;
```

- Nullable. No FK constraint (legacy packages have no hotel).
- No backfill. New packages set it via the editor.
- Same shape as BILL-MAIN P2 expand/contract.

### 3.2 U-15-P2 — Resolution order helper (🟢 autonomous)
Add a single helper function:

```ts
export async function resolveHotelForPilgrim(
  pilgrimId: number,
  companyId: number,
): Promise<{ source: "allocation" | "hotelName" | "package" | "unknown",
             hotelId: number | null, hotelName: string | null }>
```

Resolution order:
1. Allocation (if `umrah_room_allocations.blockId → umrah_room_blocks.hotelId` resolves)
2. Pilgrim's `hotelName` string
3. Package's `defaultHotelId` (new column)
4. unknown

Static smoke + dynamic test pin the order.

### 3.3 U-15-P3 — FE picker: hotel on package editor (🟢 autonomous)
Add a hotel-picker dropdown to the package create/edit form,
saving to `defaultHotelId`. When set, the booleans
`includesHotel` are inferred (true if `defaultHotelId IS NOT NULL`).

### 3.4 U-15-P4 — Deprecation marker on `umrah_pilgrims.hotelName` (🟢 autonomous)
- Column comment marking the field as deprecated.
- Static smoke that no NEW route writes to `hotelName` (existing
  read paths preserved).
- Dashboard read still falls through to hotelName per migration 246.

### 3.5 U-15-P5 — Pricing reconciliation report (🟢 autonomous)
New read-only route:
`GET /umrah/reports/packages-vs-allocations-pricing-drift`
- Returns packages whose `sellPrice` differs from
  `SUM(allocation.nightsCount * block.ratePerNight)` by > X%.
- Surfacing only; no writes.

### 3.6 U-15-P6 — Transport / meals / ziyarat models (🔴 hard-pause)
The 3 other booleans don't have models. Adding them is a
**significant new domain** (meal-plan model, ziyarat-tour model,
transport linkage with `umrah_transport`).

**Hard-pause** under §3 (new operational model is not autonomous-eligible).
Owner ratification required before proposing schemas.

---

## 4. Permanent hard rails preserved (U-15 will not cross)

- ❌ No engine touch.
- ❌ No migration mutating existing rows (P1/P4 additive only).
- ❌ No silent linkage. ❌ No JE.
- ❌ Resolution order in P2 **preserves migration 246's allocation
  > hotelName** — only adds package as a third fallback.
- ❌ No default flip. ❌ No catalog default change.
- ❌ U-15-P6 stays hard-paused; owner explicit go required.

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No schema edit. ❌ No engine touch. ❌ No FE. ❌ No smoke.
- ❌ FIN-P4-CONTRACT execution untouched.
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.
- ❌ U-04 / U-05 / U-06 / U-14 / U-16 / U-17 — independent.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change. The existing umrah smokes + the
   accommodation model continue to protect the surface unchanged.

---

## 7. Closure verdict

- 🟢 **U-15 closes with TWO MODELS INVENTORIED + 6 GAPS DOCUMENTED
  + 6 RECOVERY PHASES SCOPED.** Five phases are 🟢 autonomous; one
  (transport/meals/ziyarat domain expansion) is **🔴 hard-pause**.
- ➜ **Next autonomous step**: U-15-P1 (nullable
  `defaultHotelId` on packages).
- ➜ **Hard-pause queue grows by 1**: U-15-P6 added.
- ➜ **FIN-P4-CONTRACT code, BILL-MAIN P4+/P5, U-02b M6+, U-07
  stay hard-paused.**
