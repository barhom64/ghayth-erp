#!/bin/bash
# verify-fleet-trip-journey.sh — E2E proof of the Fleet journey (#1609 under #1594).
#   vehicle -> driver -> assign -> trip -> complete (balanced GL cost entry)
# Prereqs: bash db/bootstrap.sh ; api-server built + running on :5000
set -euo pipefail
# Defaults to the الضياء tenant (company 2) like every other GL-posting
# journey: it carries the full Saudi chart of accounts + the seeded fleet
# accounting_mappings (fuel 5510 / depreciation 5710 / driver-fare 5140 /
# cash 1111). The default company 1 (الدور) ships a minimal 28-account COA
# without those leaves, so a fleet trip's GL post would 422. Override EMAIL/
# PASSWORD to target another tenant.
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Fleet trip journey — #1609"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"
[ -n "$CSRF" ] && ok "login" || { no "login"; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
patch(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
gid(){ py 'import sys,json;print(json.load(sys.stdin).get("id") or "")'; }

# Unique suffix per run so plate / licence / policy never collide on a
# re-run against the same DB (those columns are UNIQUE → a fixed value
# 409s the second time). Keeps the suite re-runnable without a fresh boot.
U="$$-${RANDOM}"
PH="05$(printf '%08d' $(( (RANDOM*RANDOM) % 100000000 )))"  # digits-only phone, unique-ish

VID="$(post /fleet/vehicles "{\"plateNumber\":\"DR-تجربة-$U\",\"make\":\"Toyota\",\"model\":\"Hiace\",\"year\":2024,\"fuelType\":\"diesel\"}" | gid)"
[ -n "$VID" ] && ok "vehicle created (#$VID)" || no "vehicle create"

DID="$(post /fleet/drivers "{\"name\":\"سائق الرحلة\",\"phone\":\"$PH\",\"licenseNumber\":\"LIC-$U\",\"licenseExpiry\":\"2030-12-31\",\"licenseType\":\"Heavy\"}" | gid)"
[ -n "$DID" ] && ok "driver created (#$DID)" || no "driver create"

patch /fleet/vehicles/$VID "{\"assignedDriverId\":$DID}" >/dev/null && ok "driver assigned to vehicle" || no "assign"

post /fleet/insurance "{\"vehicleId\":$VID,\"provider\":\"تأمين الدور\",\"startDate\":\"2026-01-01\",\"endDate\":\"2030-12-31\",\"policyNumber\":\"POL-$U\"}" >/dev/null && ok "vehicle insured (valid)" || no "insurance"

TRIP="$(post /fleet/trips "{\"vehicleId\":$VID,\"driverId\":$DID,\"fromLocation\":\"الرياض\",\"toLocation\":\"جدة\",\"fromLat\":24.71,\"fromLng\":46.67,\"toLat\":21.54,\"toLng\":39.17}")"
TID="$(echo "$TRIP" | gid)"
TST="$(echo "$TRIP" | py 'import sys,json;print(json.load(sys.stdin).get("status"))')"
[ -n "$TID" ] && [ "$TST" = "in_progress" ] && ok "trip created (#$TID, in_progress)" || no "trip create (status=$TST)"

CMP="$(post /fleet/trips/$TID/complete '{"startMileage":1000,"endMileage":1450,"fuelPricePerLiter":2.5}')"
CST="$(echo "$CMP" | py 'import sys,json;print(json.load(sys.stdin).get("status") or "")')"
[ "$CST" = "completed" ] && ok "trip completed" || no "trip complete (status=$CST)"

export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
BAL="$(psql "$DSN" -tA -c "select sum(debit)::numeric=sum(credit)::numeric and sum(debit)>0 from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"sourceType\"='fleet_trip' and je.\"sourceId\"=$TID;")"
[ "$BAL" = "t" ] && ok "fleet_trip GL entry exists and balanced" || no "fleet GL not balanced ($BAL)"

# Per-vehicle routing (#1594): fuel line must post to THIS vehicle's own
# auto-created subsidiary fuel account (a child leaf, e.g. 5510-000N).
VEHACC="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" join subsidiary_accounts sa on sa.\"accountId\"=(select id from chart_of_accounts where code=jl.\"accountCode\" and \"companyId\"=sa.\"companyId\") where je.\"sourceType\"='fleet_trip' and je.\"sourceId\"=$TID and sa.\"entityType\"='vehicle' and sa.\"entityId\"=$VID and sa.\"accountType\"='fuel';")"
[ "${VEHACC:-0}" -ge 1 ] && ok "fuel posted to the vehicle's own subsidiary account" || no "fuel not routed to per-vehicle account ($VEHACC)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
