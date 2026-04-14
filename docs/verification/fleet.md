# Fleet — Phase C.3 Verification Pack

> **Purpose:** End-to-end verification for the Fleet audit (commit `5ff8d4f`).
> **Author:** Claude (code) — to be executed by the programmer on the Replit
> environment where the live schema lives.
> **Branch:** `claude/review-complete-task-eyEgc`
> **Goal:** produce a ✅/⚠️/❌ verdict for **Phase C.3 Fleet** before merging
> to `main`.

Do **not** run this pack against production without a staging reset first.
All tests create rows that can be cleaned up via the DB queries in §5.

---

## 0. Overview

This pack has two independent signals:

1. **Execution Pack (A)** — Parts 1–5 below. A curl playbook you paste into
   a Replit shell, plus DB queries that confirm events / audit rows landed.
2. **Static Review (C)** — follows after Part 5. Code walkthrough of the
   same scenarios showing exactly which typed error class should fire and
   what the response body should contain.

The two signals should agree. Any disagreement between static and runtime
is a Fleet bug and blocks the merge.

### Scenario index — 15 tests

| # | Surface | Scenario | Expected |
|---|---|---|---|
| 1 | POST /fleet/vehicles | missing `plateNumber` | 422 `VALIDATION_ERROR` |
| 2 | POST /fleet/vehicles | missing `make` | 422 `VALIDATION_ERROR` |
| 3 | POST /fleet/vehicles | `year=1800` (out of range) | 422 `VALIDATION_ERROR` |
| 4 | POST /fleet/vehicles | happy path | 201 + `fleet.vehicle.created` event |
| 5 | POST /fleet/vehicles | duplicate `plateNumber` | 409 `CONFLICT` |
| 6 | POST /fleet/drivers | missing `licenseNumber` | 422 `VALIDATION_ERROR` |
| 7 | POST /fleet/drivers | expired `licenseExpiry` | 422 `VALIDATION_ERROR` |
| 8 | POST /fleet/drivers | duplicate license | 409 `CONFLICT` |
| 9 | PATCH /fleet/vehicles/:id | valid `available → in_use` | 200 + `status_changed` event |
| 10 | PATCH /fleet/vehicles/:id | invalid `in_use → out_of_service` | 409 + `allowedNext` in `fix` |
| 11 | PATCH /fleet/trips/:id | direct `status=completed` via PATCH | 409 redirect to `/complete` |
| 12 | DELETE /fleet/trips/:id | `in_progress` status | 409 `CONFLICT` |
| 13 | POST /fleet/maintenance | missing `vehicleId` | 422 `VALIDATION_ERROR` |
| 14 | POST /fleet/maintenance | missing `description` | 422 `VALIDATION_ERROR` |
| 15 | PATCH /fleet/traffic-violations/:id/pay | already `paid` | 409 `CONFLICT` + `allowedNext` |

---

## 1. Setup

### 1.1 Environment requirements

Run inside the Replit shell of the API server workspace. The API must be
running and reachable at `http://127.0.0.1:5000` (adjust `BASE_URL` below
if your Replit exposes a different port).

Required prerequisites:

- Live schema on the Replit-managed Postgres (the `fleet_*`, `employees`,
  `companies`, `users`, `event_logs`, `audit_logs` tables must already exist).
- A user account with `fleet:create` + `fleet:update` + `fleet:delete`
  permissions and an active `employee_assignments` row. A finance-manager
  / owner / general-manager role is sufficient.
- `psql` available in the shell (it is by default on Replit Postgres modules).
- `curl` and `jq` available.

### 1.2 Auth / token assumptions

All scenarios assume a Bearer token from a single authenticated session.
Get one with:

```bash
BASE_URL="http://127.0.0.1:5000"

# Replace these with a real admin user from your Replit DB
ADMIN_EMAIL="owner@example.com"
ADMIN_PASSWORD="your-admin-password"

LOGIN_RES=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RES" | jq -r .token)
echo "$TOKEN" > /tmp/fleet_token.txt
echo "Token captured (length=${#TOKEN})"
```

Sanity check the token:

```bash
curl -sS "$BASE_URL/api/auth/me" -H "Authorization: Bearer $TOKEN" | jq .
```

You should see your user + active assignment + role. If `role` is not
one of `owner` / `general_manager` / `finance_manager`, some scenarios
that require write permission may fail for reasons unrelated to Phase C.3.

### 1.3 Conventions for the rest of the pack

- `TOKEN` is loaded from `/tmp/fleet_token.txt` at the start of each section.
- `BASE_URL` defaults to `http://127.0.0.1:5000`.
- Every scenario shows a single curl command, the expected HTTP status,
  and the expected JSON response shape. Shape means *keys and types* —
  exact error message wording may differ slightly from production-seeded
  messages, that is OK.
- Any scenario that creates a DB row captures the new id in a shell var
  (e.g. `VEHICLE_ID`) so subsequent scenarios can reference it.
- DB verification queries are in §5. Run them after the curl block finishes.

### 1.4 Safety rails

- Vehicles created during testing all use plate numbers prefixed with
  `TEST-FLEET-C3-` so you can clean them up with a single `DELETE` at
  the end.
- No scenario touches `main` or production tenants — every insert is
  scoped to the test user's `companyId`.
- If any scenario leaves the DB in an unexpected state, §5 has a cleanup
  query at the bottom.

---

## 2. Vehicles & Drivers scenarios (Tests 1–8)

Load the token at the start of this section:

```bash
TOKEN=$(cat /tmp/fleet_token.txt)
BASE_URL="http://127.0.0.1:5000"
AUTH="Authorization: Bearer $TOKEN"
```

---

### Test 1 — POST /fleet/vehicles missing `plateNumber` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/vehicles" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"make":"Toyota","model":"Hilux"}'
```

**Expected status:** `422 Unprocessable Entity`

**Expected body shape:**
```json
{
  "error": "رقم اللوحة مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "plateNumber",
  "fix": "أدخل رقم لوحة المركبة"
}
```

**Notes:** Thrown by `ValidationError` at fleet.ts:96. No DB write should
happen — verify in §5 that no new row with empty plate was created.

---

### Test 2 — POST /fleet/vehicles missing `make` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/vehicles" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"plateNumber":"TEST-FLEET-C3-001","model":"Hilux"}'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "الشركة المصنّعة مطلوبة",
  "code": "VALIDATION_ERROR",
  "field": "make",
  "fix": "أدخل اسم الشركة المصنّعة للمركبة"
}
```

**Notes:** fleet.ts:99. `model` check at fleet.ts:102 behaves identically
with `field: "model"` if make is supplied but model is not.

---

### Test 3 — POST /fleet/vehicles invalid `year` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/vehicles" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"plateNumber":"TEST-FLEET-C3-002","make":"Toyota","model":"Hilux","year":1800}'
```

**Expected status:** `422`

**Expected body (message contains the dynamic upper bound):**
```json
{
  "error": "السنة غير صالحة — يجب أن تكون بين 1950 و2027",
  "code": "VALIDATION_ERROR",
  "field": "year",
  "fix": "أدخل سنة صنع المركبة بصيغة صحيحة"
}
```

**Notes:** fleet.ts:108. The upper bound is `currentYear + 1`, so the
numeric value in the error message is driven by the server clock. Any
year `< 1950` or `> currentYear+1` is rejected. `year=2026` should pass.

---

### Test 4 — POST /fleet/vehicles happy path → 201

```bash
CREATE_RES=$(curl -sS -X POST "$BASE_URL/api/fleet/vehicles" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"plateNumber":"TEST-FLEET-C3-100","make":"Toyota","model":"Hilux","year":2024,"color":"white","fuelType":"diesel","currentMileage":0}')

echo "$CREATE_RES" | jq .
VEHICLE_ID=$(echo "$CREATE_RES" | jq -r .id)
echo "VEHICLE_ID=$VEHICLE_ID" > /tmp/fleet_ids.txt
```

**Expected status:** `201`

**Expected body highlights:**
- `id` — numeric, non-null
- `plateNumber: "TEST-FLEET-C3-100"`
- `status: "available"` (default)
- `companyId` matches your session

**Side effects to verify in §5:**
- One row in `audit_logs` with `action='create' entity='fleet_vehicles' entityId=VEHICLE_ID`
- One row in `event_logs` with `action='fleet.vehicle.created' entityId=VEHICLE_ID`

---

### Test 5 — POST /fleet/vehicles duplicate `plateNumber` → 409

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/vehicles" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"plateNumber":"TEST-FLEET-C3-100","make":"Toyota","model":"Corolla","year":2024}'
```

**Expected status:** `409 Conflict`

**Expected body:**
```json
{
  "error": "رقم اللوحة مسجل مسبقاً",
  "code": "CONFLICT",
  "field": "plateNumber",
  "fix": "استخدم رقم لوحة مختلف أو تحقق من السجل الموجود"
}
```

**Notes:** fleet.ts:122. The duplicate check filters on `"deletedAt" IS NULL`,
so a soft-deleted vehicle with the same plate should *not* trigger the
conflict. If it does, that is a bug — flag it and stop the run.

---

### Test 6 — POST /fleet/drivers missing `licenseNumber` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/drivers" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Ahmed Test","phone":"+966501234567"}'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "رقم الرخصة مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "licenseNumber",
  "fix": "أدخل رقم رخصة القيادة"
}
```

**Notes:** fleet.ts:186. The check order is `name → phone → licenseNumber`,
so sending an empty name would fail earlier with `field: "name"`.

---

### Test 7 — POST /fleet/drivers expired `licenseExpiry` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/drivers" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Ahmed Test","phone":"+966501234567","licenseNumber":"LIC-TEST-C3-1","licenseExpiry":"2020-01-01"}'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "رخصة السائق منتهية بالفعل",
  "code": "VALIDATION_ERROR",
  "field": "licenseExpiry",
  "fix": "لا يمكن تسجيل سائق برخصة منتهية — جدّد الرخصة أولاً"
}
```

**Notes:** fleet.ts:194. A completely malformed date (e.g. `"invalid"`)
triggers the earlier `fleet.ts:191` branch with
`error: "تاريخ انتهاء الرخصة غير صالح"` — also `VALIDATION_ERROR`, same field.

---

### Test 8 — POST /fleet/drivers duplicate license → 409

First create a baseline driver with a fresh license, then retry:

```bash
# Baseline (should succeed)
FUTURE_DATE="2028-12-31"
DRIVER_RES=$(curl -sS -X POST "$BASE_URL/api/fleet/drivers" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Driver C3\",\"phone\":\"+966501111111\",\"licenseNumber\":\"LIC-TEST-C3-100\",\"licenseExpiry\":\"$FUTURE_DATE\"}")

echo "$DRIVER_RES" | jq .
DRIVER_ID=$(echo "$DRIVER_RES" | jq -r .id)
echo "DRIVER_ID=$DRIVER_ID" >> /tmp/fleet_ids.txt

# Retry — should 409
curl -sS -i -X POST "$BASE_URL/api/fleet/drivers" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Another Driver\",\"phone\":\"+966502222222\",\"licenseNumber\":\"LIC-TEST-C3-100\",\"licenseExpiry\":\"$FUTURE_DATE\"}"
```

**Expected status on retry:** `409`

**Expected body:**
```json
{
  "error": "رقم الرخصة مسجل مسبقاً لسائق آخر",
  "code": "CONFLICT",
  "field": "licenseNumber",
  "fix": "استخدم رقم رخصة صحيح أو راجع السجل الموجود"
}
```

**Notes:** fleet.ts:204. First call must succeed (201) before the retry
can verify the duplicate path. Capture `DRIVER_ID` for later scenarios.

---

## 3. Vehicles PATCH + Trips + Maintenance scenarios (Tests 9–14)

Load ids captured in Part 2:

```bash
source /tmp/fleet_ids.txt
TOKEN=$(cat /tmp/fleet_token.txt)
BASE_URL="http://127.0.0.1:5000"
AUTH="Authorization: Bearer $TOKEN"
echo "VEHICLE_ID=$VEHICLE_ID DRIVER_ID=$DRIVER_ID"
```

---

### Test 9 — PATCH /fleet/vehicles/:id valid transition → 200

Move the test vehicle from `available` to `in_use`. This should succeed
and emit `fleet.vehicle.status_changed`.

```bash
curl -sS -i -X PATCH "$BASE_URL/api/fleet/vehicles/$VEHICLE_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"in_use"}'
```

**Expected status:** `200`

**Expected body highlights:**
- `id` matches `$VEHICLE_ID`
- `status: "in_use"`
- `updatedAt` is recent (within the last few seconds)

**Side effects to verify in §5:**
- `audit_logs` row with `action='update' entity='fleet_vehicles'` and the
  `before` column showing `{"status": "available"}`, `after` showing
  `{"status": "in_use"}`.
- `event_logs` row with `action='fleet.vehicle.status_changed'`.

**Notes:** This test depends on `getVehicleStatusImpact` returning
`canProceed: true` for an empty vehicle. If the live preview considers
any active dependency a blocker, the test flips to a 409 — that is the
*business impact guard* at fleet.ts:312 and is a valid conflict, not a
Phase C.3 failure. Skip to Test 10 if it fires.

---

### Test 10 — PATCH /fleet/vehicles/:id invalid transition → 409

After Test 9 the vehicle is `in_use`. `in_use` only allows
`["available", "maintenance"]`, so attempting `out_of_service` must fail.

```bash
curl -sS -i -X PATCH "$BASE_URL/api/fleet/vehicles/$VEHICLE_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"out_of_service"}'
```

**Expected status:** `409`

**Expected body:**
```json
{
  "error": "لا يمكن نقل المركبة من \"in_use\" إلى \"out_of_service\"",
  "code": "CONFLICT",
  "field": "status",
  "fix": "الانتقالات المسموحة من الحالة الحالية: available, maintenance"
}
```

**Notes:** fleet.ts:308. The `fix` string is the dynamic list of allowed
next states from `VEHICLE_TRANSITIONS[existing.status]`. If the response
`fix` is missing either `available` or `maintenance`, the state machine
table has been edited — flag and stop.

Then return the vehicle to `available` for subsequent tests:

```bash
curl -sS -X PATCH "$BASE_URL/api/fleet/vehicles/$VEHICLE_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"available"}' | jq .status
# → "available"
```

---

### Test 11 — PATCH /fleet/trips/:id direct `status=completed` → 409

> **Update after first verification run (2026-04-14):** The first run
> came back with a **200** here, matching the ⚠️ Partial prediction in
> §6. The follow-up commit restores the expected behaviour: PATCH
> /trips/:id now refuses `in_progress → completed` and
> `in_progress → cancelled` with a 409 that points the caller at the
> dedicated lifecycle endpoints. The same defence-in-depth block was
> added to PATCH /maintenance/:id because it had the identical gap.
>
> Re-run this test after the follow-up is deployed. Expected result
> flips from ⚠️ → ✅.

Direct PATCH of `status` is refused for lifecycle-owned transitions —
callers must go through `/trips/:id/complete` or `/trips/:id/cancel`.

First create an in-progress trip (the POST will auto-assign vehicle +
driver and default status to `in_progress`):

```bash
TRIP_RES=$(curl -sS -X POST "$BASE_URL/api/fleet/trips" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"vehicleId\":$VEHICLE_ID,\"driverId\":$DRIVER_ID,\"fromLocation\":\"Riyadh\",\"toLocation\":\"Jeddah\",\"distance\":950}")

echo "$TRIP_RES" | jq .
TRIP_ID=$(echo "$TRIP_RES" | jq -r .id)
echo "TRIP_ID=$TRIP_ID" >> /tmp/fleet_ids.txt
```

> **Note:** If the POST fails with a 422 about missing insurance, create
> a placeholder insurance row for the vehicle first (see Part 4, Test 15
> setup) — that is the existing insurance guard at fleet.ts:305, not a
> regression.

Now try to close the trip via PATCH:

```bash
curl -sS -i -X PATCH "$BASE_URL/api/fleet/trips/$TRIP_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

**Expected status:** `409`

**Expected body (message contains both states, `fix` contains the
transition list AND the redirect hint):**
```json
{
  "error": "لا يمكن نقل الرحلة من \"in_progress\" إلى \"completed\" عبر PATCH",
  "code": "CONFLICT",
  "field": "status",
  "fix": "استخدم /trips/:id/complete أو /trips/:id/cancel لإدارة دورة حياة الرحلة. الانتقالات المسموحة: completed, cancelled"
}
```

**Notes:** fleet.ts:1597. Even though `completed` is technically in the
allowed list (`in_progress → completed`), the **PATCH path** rejects it
anyway because the lifecycle engine owns status moves. This is the
defence-in-depth behaviour we want.

Actually — re-read the state machine: `in_progress → ["completed", "cancelled"]`.
The PATCH handler's allowlist check *would* let this through, which
means the state-machine allowlist **does not block** the bypass alone.
The only thing stopping a caller from a silent status write is the
missing lifecycle side-effects (journal entry, vehicle release, obligation
cancel). **This is a known gap and should be flagged in the verdict.**

If the programmer gets a 200 here instead of a 409, the verdict should
be ⚠️ **Partial** and a follow-up commit must force PATCH to refuse
`in_progress → completed` and `in_progress → cancelled` explicitly,
redirecting to the lifecycle endpoints.

---

### Test 12 — DELETE /fleet/trips/:id `in_progress` → 409

```bash
curl -sS -i -X DELETE "$BASE_URL/api/fleet/trips/$TRIP_ID" \
  -H "$AUTH"
```

**Expected status:** `409`

**Expected body:**
```json
{
  "error": "لا يمكن حذف رحلة قيد التنفيذ",
  "code": "CONFLICT",
  "field": "status",
  "fix": "ألغِ الرحلة عبر /trips/:id/cancel أو أكملها قبل الحذف"
}
```

**Notes:** fleet.ts:1671. After the 409, cancel the trip so the rest of
the pack can clean up:

```bash
curl -sS -X POST "$BASE_URL/api/fleet/trips/$TRIP_ID/cancel" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason":"verification cleanup"}' | jq .status
# → "cancelled"
```

---

### Test 13 — POST /fleet/maintenance missing `vehicleId` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/maintenance" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"type":"oil_change","description":"Regular 10k service"}'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "المركبة مطلوبة",
  "code": "VALIDATION_ERROR",
  "field": "vehicleId",
  "fix": "اختر المركبة التي ستخضع للصيانة"
}
```

**Notes:** fleet.ts:1038. This is the first validation in POST
/maintenance, checked before `type` and `description`.

---

### Test 14 — POST /fleet/maintenance missing `description` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/fleet/maintenance" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"vehicleId\":$VEHICLE_ID,\"type\":\"oil_change\"}"
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "وصف الصيانة مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "description",
  "fix": "اكتب وصفاً موجزاً للعمل المطلوب"
}
```

**Notes:** fleet.ts:1044. Check order is `vehicleId → type → description`.

---

## 4. Insurance setup + Traffic Violations scenario (Test 15)

Test 15 requires a *paid* traffic violation to exist first. Part 4 also
includes optional insurance creation if Test 11's trip POST failed for
insurance reasons.

Load ids:

```bash
source /tmp/fleet_ids.txt
TOKEN=$(cat /tmp/fleet_token.txt)
BASE_URL="http://127.0.0.1:5000"
AUTH="Authorization: Bearer $TOKEN"
```

---

### Optional — create insurance for the test vehicle

Only run this if Test 11's trip creation failed with *"لا يمكن بدء رحلة
بمركبة تأمينها منتهي"*. The insurance guard is pre-existing behaviour
at fleet.ts:305, not Phase C.3 code — we treat it as scaffolding.

```bash
curl -sS -X POST "$BASE_URL/api/fleet/insurance" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"vehicleId\":$VEHICLE_ID,\"provider\":\"Tawuniya\",\"policyNumber\":\"POL-TEST-C3-1\",\"startDate\":\"2026-01-01\",\"endDate\":\"2027-12-31\",\"premium\":3000,\"type\":\"comprehensive\"}" \
  | jq '{id, provider, startDate, endDate, premium}'
```

Then re-run Test 11's trip creation.

---

### Test 15 setup — create a traffic violation

Traffic violations default to `status='pending'` after creation. We need
to pay it once (normal lifecycle) then try to pay again (the scenario).

```bash
# Create the violation
VIOL_RES=$(curl -sS -X POST "$BASE_URL/api/fleet/traffic-violations" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"vehicleId\":$VEHICLE_ID,\"violationType\":\"overspeeding\",\"fineAmount\":500,\"violationDate\":\"2026-04-01\",\"liability\":\"company\"}")

echo "$VIOL_RES" | jq '{id, status, fineAmount, liability}'
VIOLATION_ID=$(echo "$VIOL_RES" | jq -r .id)
echo "VIOLATION_ID=$VIOLATION_ID" >> /tmp/fleet_ids.txt
```

**Expected status for the setup call:** `201`

**Expected body highlights:**
- `id` numeric
- `status: "pending"`
- `liability: "company"`
- `journalEntryId` — numeric, non-null (because `fineAmount > 0` and
  liability is `company`, the expense JE fires immediately)

**Side effects to verify in §5:** one `event_logs` row with
`action='fleet.traffic_violation.created'` and one journal entry +
two journal lines for accounts 5290 (fines expense) DR 500 / 2100 (AP)
CR 500.

---

### Pay the violation once (normal lifecycle, not a scenario)

```bash
curl -sS -X PATCH "$BASE_URL/api/fleet/traffic-violations/$VIOLATION_ID/pay" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}' \
  | jq '{id, status, paidAt}'
```

**Expected status:** `200`, `status: "paid"`, `paidAt` is an ISO timestamp.

---

### Test 15 — PATCH /fleet/traffic-violations/:id/pay already `paid` → 409

Now retry the pay on the same violation:

```bash
curl -sS -i -X PATCH "$BASE_URL/api/fleet/traffic-violations/$VIOLATION_ID/pay" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}'
```

**Expected status:** `409`

**Expected body:**
```json
{
  "error": "المخالفة مدفوعة بالفعل",
  "code": "CONFLICT",
  "field": "status",
  "fix": "الانتقالات المسموحة من الحالة الحالية: لا يوجد (حالة نهائية)"
}
```

**Notes:** fleet.ts:2344. The VIOLATION_TRANSITIONS table sets `paid: []`
(terminal), so `allowedNext` is empty — the `fix` string echoes that
directly. If the response instead shows a list of states, the transition
table has been edited and must be re-reviewed.

---

### Cleanup after Part 4 (run once at end of pack)

Run this **after** §5 verification queries, not before — §5 needs the
rows to be present to count them:

```bash
# Only the rows created by this pack (plate prefix TEST-FLEET-C3-)
psql "$DATABASE_URL" <<'SQL'
BEGIN;
DELETE FROM fleet_traffic_violations
  WHERE "vehicleId" IN (SELECT id FROM fleet_vehicles WHERE "plateNumber" LIKE 'TEST-FLEET-C3-%');
UPDATE fleet_trips SET "deletedAt"=NOW()
  WHERE "vehicleId" IN (SELECT id FROM fleet_vehicles WHERE "plateNumber" LIKE 'TEST-FLEET-C3-%')
    AND "deletedAt" IS NULL;
UPDATE fleet_drivers SET "deletedAt"=NOW()
  WHERE "licenseNumber" LIKE 'LIC-TEST-C3-%' AND "deletedAt" IS NULL;
UPDATE fleet_vehicles SET "deletedAt"=NOW()
  WHERE "plateNumber" LIKE 'TEST-FLEET-C3-%' AND "deletedAt" IS NULL;
COMMIT;
SQL
```

The cleanup is intentionally soft-delete — the `deletedAt` rows stay
visible in the audit trail so you can still verify §5 queries even
after cleanup. If you want a hard delete, remove the `UPDATE` lines
and use `DELETE FROM` instead — but only on a staging DB.

---

## 5. Event + Audit verification queries

Run **after** Parts 2–4 have completed, **before** the cleanup block at
the end of Part 4. These queries prove the listeners fired and no
rows were silently dropped.

All queries assume `psql` is pointed at the same database the API is
using (`psql "$DATABASE_URL"` or equivalent).

### 5.1 Vehicle created — exactly one event + one audit row

```sql
-- Should return 1 row per scenario run
SELECT action, "entityId", details, "createdAt"
  FROM event_logs
 WHERE action = 'fleet.vehicle.created'
   AND "createdAt" > NOW() - INTERVAL '15 minutes'
 ORDER BY id DESC
 LIMIT 5;
```

```sql
-- Should show the matching audit row
SELECT action, entity, "entityId", after->>'plateNumber' AS plate, "createdAt"
  FROM audit_logs
 WHERE entity = 'fleet_vehicles'
   AND action = 'create'
   AND "createdAt" > NOW() - INTERVAL '15 minutes'
 ORDER BY id DESC
 LIMIT 5;
```

**Pass criteria:** one row in each table per Test 4 execution. Multiple
rows means the listener fired twice (the same bug we fought in Support).

---

### 5.2 Vehicle status change (Test 9) — one status_changed event

```sql
SELECT action, "entityId", "createdAt"
  FROM event_logs
 WHERE action IN ('fleet.vehicle.status_changed', 'fleet.vehicle.updated')
   AND "createdAt" > NOW() - INTERVAL '15 minutes'
 ORDER BY id DESC
 LIMIT 10;
```

```sql
SELECT action, entity, before->'status' AS before_status,
       after->'status' AS after_status, "createdAt"
  FROM audit_logs
 WHERE entity = 'fleet_vehicles'
   AND action = 'update'
   AND "createdAt" > NOW() - INTERVAL '15 minutes'
 ORDER BY id DESC
 LIMIT 10;
```

**Pass criteria:**
- Exactly one `fleet.vehicle.status_changed` event for the transition
  `available → in_use` from Test 9
- No `fleet.vehicle.updated` event for that same transition (the code
  picks one or the other, never both)
- The audit row shows `before_status="available"` and
  `after_status="in_use"`

---

### 5.3 Driver + violation listeners

```sql
SELECT action, "entityId", "createdAt"
  FROM event_logs
 WHERE action IN (
   'fleet.driver.created',
   'fleet.traffic_violation.created',
   'fleet.traffic_violation.paid'
 )
   AND "createdAt" > NOW() - INTERVAL '15 minutes'
 ORDER BY id DESC
 LIMIT 20;
```

**Pass criteria:**
- One `fleet.driver.created` row (Test 8 baseline)
- One `fleet.traffic_violation.created` row (Test 15 setup)
- One `fleet.traffic_violation.paid` row (normal pay in Test 15 setup,
  the second attempt should have failed before emitting)

---

### 5.4 No orphan rows from validation failures

Tests 1, 2, 3, 5, 6, 7, 8-retry, 10, 11, 12, 13, 14, 15-retry all
throw before the DB write. Verify they left no rows behind:

```sql
-- Vehicles: no row with NULL plate or plate starting with nothing useful
SELECT id, "plateNumber", make, model, "createdAt"
  FROM fleet_vehicles
 WHERE "plateNumber" IS NULL
    OR "plateNumber" = ''
    OR (make IS NULL AND "createdAt" > NOW() - INTERVAL '15 minutes');
-- Expected: 0 rows
```

```sql
-- Drivers: no row with NULL licenseNumber
SELECT id, name, "licenseNumber", "createdAt"
  FROM fleet_drivers
 WHERE "licenseNumber" IS NULL
   AND "createdAt" > NOW() - INTERVAL '15 minutes';
-- Expected: 0 rows
```

```sql
-- Maintenance: no row for Test 13/14 (invalid validation)
SELECT id, "vehicleId", type, description, "createdAt"
  FROM fleet_maintenance
 WHERE description IS NULL
   AND "createdAt" > NOW() - INTERVAL '15 minutes';
-- Expected: 0 rows
```

**Pass criteria:** all three queries return zero rows.

---

### 5.5 Journal entries from Test 15

Creating a company-liability violation posts a JE at fleet.ts:2311.
Paying it posts a second JE at fleet.ts:2374.

```sql
SELECT je.id, je.ref, je.description, je."createdAt",
       ARRAY_AGG(jl."accountCode" || ':' || jl.debit || '/' || jl.credit) AS lines
  FROM journal_entries je
  LEFT JOIN journal_lines jl ON jl."journalId" = je.id
 WHERE (je."sourceType" = 'fleet_traffic_violation'
     OR je."sourceType" = 'fleet_traffic_violation_payment')
   AND je."createdAt" > NOW() - INTERVAL '15 minutes'
 GROUP BY je.id, je.ref, je.description, je."createdAt"
 ORDER BY je.id DESC
 LIMIT 5;
```

**Pass criteria:**
- Two journal entries: one `sourceType='fleet_traffic_violation'` and
  one `sourceType='fleet_traffic_violation_payment'`
- First JE has lines `5290:500/0` (DR) and `2100:0/500` (CR)
- Second JE has lines `2100:500/0` (DR) and `1100:0/500` (CR)
- If either is missing, Phase C.3 has not wired the GL posting correctly

---

### 5.6 Final scoreboard query

```sql
WITH vehicle_create AS (
  SELECT COUNT(*) AS n FROM event_logs
   WHERE action = 'fleet.vehicle.created' AND "createdAt" > NOW() - INTERVAL '15 minutes'
), vehicle_status AS (
  SELECT COUNT(*) AS n FROM event_logs
   WHERE action = 'fleet.vehicle.status_changed' AND "createdAt" > NOW() - INTERVAL '15 minutes'
), driver_create AS (
  SELECT COUNT(*) AS n FROM event_logs
   WHERE action = 'fleet.driver.created' AND "createdAt" > NOW() - INTERVAL '15 minutes'
), violation_create AS (
  SELECT COUNT(*) AS n FROM event_logs
   WHERE action = 'fleet.traffic_violation.created' AND "createdAt" > NOW() - INTERVAL '15 minutes'
), violation_paid AS (
  SELECT COUNT(*) AS n FROM event_logs
   WHERE action = 'fleet.traffic_violation.paid' AND "createdAt" > NOW() - INTERVAL '15 minutes'
)
SELECT
  (SELECT n FROM vehicle_create)   AS "fleet.vehicle.created",
  (SELECT n FROM vehicle_status)   AS "fleet.vehicle.status_changed",
  (SELECT n FROM driver_create)    AS "fleet.driver.created",
  (SELECT n FROM violation_create) AS "fleet.traffic_violation.created",
  (SELECT n FROM violation_paid)   AS "fleet.traffic_violation.paid";
```

**Expected counts after a clean run:**

| Event | Expected |
|---|---|
| `fleet.vehicle.created` | 1 |
| `fleet.vehicle.status_changed` | ≥ 1 (Test 9 + the reset to available) |
| `fleet.driver.created` | 1 |
| `fleet.traffic_violation.created` | 1 |
| `fleet.traffic_violation.paid` | 1 |

Any `0` in the scoreboard for a row that matches a happy path = ❌ Failed.
Any row that is `> expected` = ⚠️ Partial (double-write regression).

---

### 5.7 Final verdict template

After you run the pack, copy this into the thread with the actual
results filled in:

```
Fleet Phase C.3 Verification — <date>

Execution environment: Replit / <branch>
Token user: <email> / role=<role>

Test results (15 scenarios):
  1. POST /vehicles missing plate        [ ] 422 ✅   [ ] other ❌
  2. POST /vehicles missing make         [ ] 422 ✅   [ ] other ❌
  3. POST /vehicles invalid year         [ ] 422 ✅   [ ] other ❌
  4. POST /vehicles happy path           [ ] 201 ✅   [ ] other ❌
  5. POST /vehicles duplicate plate      [ ] 409 ✅   [ ] other ❌
  6. POST /drivers missing license       [ ] 422 ✅   [ ] other ❌
  7. POST /drivers expired license       [ ] 422 ✅   [ ] other ❌
  8. POST /drivers duplicate license     [ ] 409 ✅   [ ] other ❌
  9. PATCH vehicle available→in_use      [ ] 200 ✅   [ ] other ❌
 10. PATCH vehicle in_use→out_of_service [ ] 409 ✅   [ ] other ❌
 11. PATCH trip direct status bypass     [ ] 409 ✅   [ ] 200 ⚠️
 12. DELETE trip in_progress             [ ] 409 ✅   [ ] other ❌
 13. POST maintenance missing vehicleId  [ ] 422 ✅   [ ] other ❌
 14. POST maintenance missing description[ ] 422 ✅   [ ] other ❌
 15. PATCH pay already-paid violation    [ ] 409 ✅   [ ] other ❌

Event listener scoreboard (§5.6):
  fleet.vehicle.created         = _
  fleet.vehicle.status_changed  = _
  fleet.driver.created          = _
  fleet.traffic_violation.created = _
  fleet.traffic_violation.paid  = _

Journal entries (§5.5): [ ] both present ✅ [ ] missing ❌

Verdict: [ ] ✅ Verified  [ ] ⚠️ Partial  [ ] ❌ Failed

Bugs found:
  - (none) / (list)

Ready for merge to main: [ ] yes  [ ] no
```

---

## 6. Static Review (Part C)

Independent signal. Walkthrough of each scenario against the code in
`artifacts/api-server/src/routes/fleet.ts` at commit `5ff8d4f`.

Format per scenario: **route → check → error class → response shape → risks.**

### State machines referenced

```
VEHICLE_TRANSITIONS    available → [in_use, maintenance, out_of_service]
                       in_use    → [available, maintenance]
                       maintenance→ [available, out_of_service]
                       out_of_service → [available, maintenance]

TRIP_TRANSITIONS       scheduled   → [planned, in_progress, cancelled]
                       planned     → [in_progress, cancelled]
                       in_progress → [completed, cancelled]
                       completed / cancelled → [] (terminal)

MAINTENANCE_TRANSITIONS scheduled   → [in_progress, cancelled]
                        in_progress → [completed, cancelled]
                        completed / cancelled → [] (terminal)

VIOLATION_TRANSITIONS   pending   → [paid, disputed, cancelled]
                        disputed  → [paid, cancelled]
                        paid / cancelled → [] (terminal)
```

---

### Test 1 — POST /vehicles missing plateNumber

- **Route:** fleet.ts:89
- **Check:** line 94 trims `b.plateNumber`; line 95 throws when empty.
- **Error class:** `ValidationError` (status 422, code `VALIDATION_ERROR`).
- **Response shape:** `{ error: "رقم اللوحة مطلوب", code: "VALIDATION_ERROR", field: "plateNumber", fix: "أدخل رقم لوحة المركبة" }`.
- **Risks:** none — first check, no DB touch.

### Test 2 — POST /vehicles missing make

- **Route:** fleet.ts:89 → line 98.
- **Error class:** `ValidationError`.
- **Response shape:** same shape with `field: "make"`.
- **Risks:** none — runs after plate check so plate must be provided.

### Test 3 — POST /vehicles year=1800

- **Route:** fleet.ts:107.
- **Check:** `yr < 1950 || yr > currentYear+1`.
- **Error class:** `ValidationError`.
- **Response shape:** `{ error: "السنة غير صالحة — يجب أن تكون بين 1950 و<Y+1>", field: "year", fix: ... }`.
- **Risks:** message contains the server's current year. Automated
  assertions must match the pattern, not the exact string.

### Test 4 — POST /vehicles happy path

- **Route:** fleet.ts:89 → 133 (INSERT) → 138 (audit) → 143 (event).
- **Side effects:** `audit_logs` row + `event_logs` row via
  `fleet.vehicle.created` listener (eventListeners.ts:760).
- **Response shape:** full row from `fleet_vehicles` with `status: "available"`.
- **Risks:**
  - The `createAuditLog` call uses `b.plateNumber` directly (not
    `plateNumber` after trim) at line 141. Harmless but should note
    for the follow-up commit — the after-log shows the untrimmed value.
  - Double-write check §5.1 is the defensive guard.

### Test 5 — POST /vehicles duplicate plate

- **Route:** fleet.ts:118–123.
- **Check:** SELECT `id` from `fleet_vehicles` where plate matches
  and `"deletedAt" IS NULL`.
- **Error class:** `ConflictError` (409, code `CONFLICT`).
- **Response shape:** `{ error: "رقم اللوحة مسجل مسبقاً", code: "CONFLICT", field: "plateNumber", fix: ... }`.
- **Risks:** if the dup check omitted the `deletedAt IS NULL` filter,
  soft-deleted plates would block new creates. The filter is present —
  verified.

### Test 6 — POST /drivers missing licenseNumber

- **Route:** fleet.ts:184 → 186.
- **Error class:** `ValidationError`.
- **Risks:** none.

### Test 7 — POST /drivers expired licenseExpiry

- **Route:** fleet.ts:188–196. Two branches:
  - 190 — invalid date string → `VALIDATION_ERROR` + `field: "licenseExpiry"`
  - 193 — valid date but `< new Date()` → `VALIDATION_ERROR` + same field,
    different message `"رخصة السائق منتهية بالفعل"`
- **Risks:** the expired check uses `new Date()` so it is server-clock
  dependent. A license expiring *today* and the server already past
  midnight will fail. Acceptable edge.

### Test 8 — POST /drivers duplicate license

- **Route:** fleet.ts:199–205.
- **Check:** same pattern as Test 5 — SELECT with `deletedAt IS NULL`.
- **Error class:** `ConflictError`.
- **Risks:** none.

### Test 9 — PATCH /vehicles/:id available → in_use

- **Route:** fleet.ts:289 → state machine at 302 → impact preview at 312
  → SET block at 340 → audit at 386 → event at 399.
- **Lookup:** `available → [in_use, maintenance, out_of_service]`, so
  `in_use` is allowed.
- **Impact preview:** `getVehicleStatusImpact` at line 312 can block if
  dependencies exist. For a fresh vehicle with no trip, `canProceed`
  should be `true`.
- **Event emitted:** `fleet.vehicle.status_changed` (because `"status" in after`).
- **Response shape:** full updated row.
- **Risks:**
  - Impact preview is live business logic — if the preview
    implementation changes, this test may flip. Not a Phase C.3 concern.
  - Audit `before/after` only includes the fields that changed (the
    `trackedFields` loop in 363–373).

### Test 10 — PATCH /vehicles/:id in_use → out_of_service

- **Route:** fleet.ts:306 — lookup `VEHICLE_TRANSITIONS["in_use"]` →
  `["available", "maintenance"]`. `out_of_service` is **not in the list**.
- **Error class:** `ConflictError`.
- **Response shape:** `{ error: "لا يمكن نقل المركبة من \"in_use\" إلى \"out_of_service\"", code: "CONFLICT", field: "status", fix: "الانتقالات المسموحة من الحالة الحالية: available, maintenance" }`.
- **Risks:** none — pure allowlist check, no side effect.

### Test 11 — PATCH /trips/:id direct status=completed ✅ (after follow-up)

- **Route:** fleet.ts:1575 → state machine at 1591.
- **Original lookup:** `in_progress → [completed, cancelled]`. Because
  `completed` was in the allowed list, the allowlist check at line 1596
  did not throw. The PATCH succeeded, silently wrote `status='completed'`,
  and skipped:
  - the cost calculation block (fleet.ts:872 onwards)
  - the vehicle release (fleet.ts:525)
  - the driver release (fleet.ts:528)
  - the `fleet.trip.completed` event (fleet.ts:904)
  - the `JE-FLEET-...` journal entry
- **First verification run:** expected 409, **actual 200**. ⚠️ Gap confirmed.
- **Follow-up commit:** Added explicit refuse-list at fleet.ts:1599
  that blocks both `in_progress → completed` and `in_progress → cancelled`
  on the PATCH path, throwing `ConflictError` with a redirect in the
  `fix` field:
  - `completed` → redirects to `POST /trips/:id/complete`
  - `cancelled` → redirects to `POST /trips/:id/cancel`
- **Sibling fix:** PATCH /maintenance/:id at fleet.ts:1712 had the
  exact same gap (MAINTENANCE_TRANSITIONS permits
  `in_progress → completed/cancelled`). Same defence-in-depth block
  added — redirects to `/maintenance/:id/complete` and `/cancel`.
- **Expected on re-run:** 409 + `CONFLICT` + `field: "status"` + fix
  string containing `POST /trips/:id/complete`.

### Test 12 — DELETE /trips/:id in_progress

- **Route:** fleet.ts:1669.
- **Check:** `existing.status === "in_progress"` → `ConflictError`.
- **Response shape:** `{ error: "لا يمكن حذف رحلة قيد التنفيذ", code: "CONFLICT", field: "status", fix: ... }`.
- **Risks:** none — the check is explicit.

### Test 13 — POST /maintenance missing vehicleId

- **Route:** fleet.ts:1032 → 1037.
- **Error class:** `ValidationError`.
- **Risks:** none.

### Test 14 — POST /maintenance missing description

- **Route:** fleet.ts:1032 → 1043.
- **Error class:** `ValidationError`.
- **Risks:** none — runs after `vehicleId` and `type` checks.

### Test 15 — PATCH /traffic-violations/:id/pay already paid

- **Route:** fleet.ts:2333 → state machine at 2344.
- **Lookup:** `VIOLATION_TRANSITIONS["paid"] = []` (terminal). The check
  `!allowedNext.includes("paid")` is true → throw `ConflictError`.
- **Response shape:** `{ error: "المخالفة مدفوعة بالفعل", code: "CONFLICT", field: "status", fix: "الانتقالات المسموحة من الحالة الحالية: لا يوجد (حالة نهائية)" }`.
- **Risks:** none — terminal state is enforced cleanly.

---

### Static Review verdict (post follow-up)

| Tests expected to pass after re-run | 15 / 15 |
|---|---|
| Tests flagged as ⚠️ Partial | 0 (Test 11 fix applied) |
| Tests expected to fail | 0 |

**Status timeline**

1. **First run** (programmer on Replit, 2026-04-14): 14/15 ✅ + 1 ⚠️
   as the static review predicted. Test 11 returned 200 because PATCH
   /trips/:id allowlist accepted `in_progress → completed`.
2. **Follow-up commit** (this commit): refuses terminal lifecycle
   transitions on the PATCH path for both trips and maintenance.
3. **Expected re-run**: 15/15 ✅.

After the programmer re-runs Test 11 and confirms 409, Fleet moves to
✅ Verified and we proceed to Property (Phase C.4).

---

## 7. Appendix — unrelated build fix on the same branch

Commit `dbc67c3` on `claude/review-complete-task-eyEgc` is independent
of Phase C.3. It removes four stray double commas (`ConflictError,,`
and `ForbiddenError,,`) in the Finance imports that were introduced by
the Phase C.7 batch regex:

- `artifacts/api-server/src/routes/finance.ts`
- `artifacts/api-server/src/routes/finance-reports.ts`
- `artifacts/api-server/src/routes/finance-algorithms.ts`
- `artifacts/api-server/src/routes/finance-zatca.ts`

TypeScript's `tsc --noEmit` accepted them; `esbuild` (production build)
rejects them with `Expected identifier but found ,`. This fix **must
not be lost** when merging — it is a real production build breaker.
It applies regardless of whether Fleet passes verification.

The fix is already on the work branch at commit `dbc67c3`; no action
is needed unless someone rebases and drops commits.





