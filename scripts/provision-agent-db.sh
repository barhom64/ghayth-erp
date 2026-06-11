#!/usr/bin/env bash
#
# provision-agent-db.sh — stand up a HEAD-OF-MAIN Postgres for an AI agent's
# environment, Docker-free, in one command.
#
# WHY THIS EXISTS (vs db/bootstrap.sh):
#   db/bootstrap.sh targets a *system* Postgres (Debian-style: `sudo -u
#   postgres`, `pg_ctlcluster`, port 5432) and — critically — only marks
#   post-cutoff migrations as a baseline; it leaves them for the api-server
#   to apply on boot. Agent/Replit/CI sandboxes have NO system Postgres and
#   NO Docker. This script instead:
#     1. spins up a throwaway NATIVE PG16 cluster (initdb + pg_ctl) on the
#        agreed test port 54329 — so DATABASE_URL carries the `54329` test
#        marker the dynamic harness gates on (assertTestDatabase in
#        tests/integration/_fixtures/twoCompanies.ts), and the journey
#        scripts (scripts/verify-*-journey.sh) can point at it too;
#     2. loads the canonical schema (db/schema_pre.sql + db/schema_post.sql);
#     3. ACTUALLY APPLIES every post-cutoff migration (those after
#        db/.baseline-cutoff) — mirroring .github/workflows/guard.yml's
#        "Load schema into test Postgres" step and src/lib/migrate.ts's delta
#        loop — so the DB is at HEAD OF MAIN, not just the dump baseline;
#     4. seeds the reference rows + the deterministic test admin
#        (owner@local.test / Test1234!) + Al-Diyaa company defaults + an open
#        fiscal period, so GL posting / accounting flows are unblocked.
#
#   The result is the "head-of-main DB" every agent connects to via
#   DATABASE_URL to resume the accounting/server work safely.
#
# USAGE:
#   bash scripts/provision-agent-db.sh
#   pnpm db:provision-agent
#
#   # then, in the SAME shell session (the cluster is a child of this shell):
#   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
#   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
#   cd artifacts/api-server && pnpm run build && pnpm run start   # API on :5000
#   bash scripts/verify-finance-posting-journey.sh                # or any journey
#
# ENV OVERRIDES (all optional):
#   PGPORT       default: 54329  (keep the test marker unless you know why)
#   PGDATA_DIR   default: /tmp/pg-agent-54329
#   DB_NAME      default: ghayth_erp
#   DB_USER      default: ghayth_erp
#   DB_PASSWORD  default: ghayth_erp
#   KEEP_DB=1    skip the drop+recreate; reload onto the existing DB
#
# NOTE ON LIFECYCLE: pg_ctl daemonizes the postmaster as a child of THIS
# shell. It survives for the life of your session but a brand-new, separate
# shell invocation does not inherit it — provision once per long-lived agent
# session (or register this as a Replit workflow for a persistent cluster).

set -euo pipefail

PGPORT="${PGPORT:-54329}"
PGDATA_DIR="${PGDATA_DIR:-/tmp/pg-agent-${PGPORT}}"
DB_NAME="${DB_NAME:-ghayth_erp}"
DB_USER="${DB_USER:-ghayth_erp}"
DB_PASSWORD="${DB_PASSWORD:-ghayth_erp}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_PRE="$REPO_ROOT/db/schema_pre.sql"
SCHEMA_POST="$REPO_ROOT/db/schema_post.sql"
MIGRATIONS_DIR="$REPO_ROOT/artifacts/api-server/src/migrations"
CUTOFF_FILE="$REPO_ROOT/db/.baseline-cutoff"

# Admin connection to the cluster's default `postgres` DB (created with the
# OS user as a trust superuser by initdb --auth=trust).
ADMIN_DSN="postgres://${USER:-runner}@127.0.0.1:${PGPORT}/postgres"
APP_DSN="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PGPORT}/${DB_NAME}"

say() { printf '  %s\n' "$*"; }

echo "▶ Ghayth ERP — agent head-of-main DB provisioner"
echo "  Cluster: 127.0.0.1:${PGPORT}  data=${PGDATA_DIR}"
echo "  Target:  ${APP_DSN}"

for f in "$SCHEMA_PRE" "$SCHEMA_POST"; do
  [ -f "$f" ] || { echo "✗ Missing required file: $f" >&2; exit 1; }
done

# 1. ensure a native cluster is running on $PGPORT.
if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  say "Postgres already listening on ${PGPORT} — reusing it."
else
  if [ ! -s "$PGDATA_DIR/PG_VERSION" ]; then
    say "initdb fresh cluster at ${PGDATA_DIR}..."
    rm -rf "$PGDATA_DIR"
    initdb -D "$PGDATA_DIR" -U "${USER:-runner}" --auth=trust >/dev/null
  fi
  say "starting postmaster on ${PGPORT}..."
  pg_ctl -D "$PGDATA_DIR" \
    -o "-p ${PGPORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" \
    -l "${PGDATA_DIR}.log" -w start
fi

# 2. ensure the app role + database exist.
say "ensuring role ${DB_USER} + database ${DB_NAME}..."
psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -q -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -q -c \
    "CREATE ROLE ${DB_USER} LOGIN SUPERUSER PASSWORD '${DB_PASSWORD}';"

if [ -z "${KEEP_DB:-}" ]; then
  say "drop + recreate ${DB_NAME} (set KEEP_DB=1 to skip)..."
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS ${DB_NAME};"
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

# 3. load the canonical schema. schema_pre = tables/sequences/indexes,
# schema_post = the deferred ADD CONSTRAINT blocks (so FK ordering is
# satisfied by loading pre then post). schema_pre opens `\restrict` which
# auto-clears at EOF; schema_post still carries a leftover lone
# `\unrestrict` that errors under ON_ERROR_STOP=1 when loaded standalone —
# strip it on stdin (same fix as db/bootstrap.sh).
say "loading schema (schema_pre + schema_post)..."
PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=1 -q -f "$SCHEMA_PRE"
grep -v '^\\unrestrict ' "$SCHEMA_POST" | \
  PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=1 -q

# 4. schema_migrations: pre-mark baseline migrations (already in the dump),
# ACTUALLY APPLY post-cutoff ones, record every filename. Mirrors
# .github/workflows/guard.yml and src/lib/migrate.ts. The dump's
# set_config('search_path','') leaves the session on an empty path; the
# psql calls below each open a fresh connection so unqualified identifiers
# resolve against public by default.
PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz DEFAULT NOW());"

CUTOFF="$( (grep -v -e '^[[:space:]]*$' -e '^#' "$CUTOFF_FILE" 2>/dev/null || true) | head -1 | tr -d '[:space:]')"
[ -n "$CUTOFF" ] || { echo "✗ db/.baseline-cutoff missing/empty — refusing to blanket-mark" >&2; exit 1; }
say "baseline cutoff: ${CUTOFF} (migrations after it are APPLIED, not just marked)"

# Numeric-aware "is this file after the cutoff?" — matches src/lib/migrate.ts's
# compareMigrationFiles (version order), NOT a plain lexicographic `\>` (which
# would misclassify once prefixes pass 3 digits, e.g. 1000_* < 285_* as text).
is_post_cutoff() {
  [ "$1" != "$CUTOFF" ] && \
    [ "$(printf '%s\n%s\n' "$CUTOFF" "$1" | sort -V | tail -1)" = "$1" ]
}

# SEED_REPLAY_ALLOWLIST — pre-cutoff migrations whose effects DO NOT live in
# the schema dump (because pg_dump --schema-only excludes table data). These
# are pure INSERTs into reference tables, all idempotent (ON CONFLICT DO
# NOTHING / IF NOT EXISTS), so re-applying them on top of the baseline is
# safe and necessary — without them a fresh agent DB has no numbering
# schemes, no GL operation mappings, no default approval chains, etc., and
# every business journey 422s on the first write.
#
# Curated list — bump it when a new pre-cutoff seed-bearing migration
# lands. Append-only; never remove.
SEED_REPLAY_ALLOWLIST=(
  "034_hr_discipline_regulation.sql"
  "035_inventory_projects_gl_accounts.sql"
  "036_three_way_match.sql"
  "110_rbac_v2_role_templates.sql"
  "133_seed_approval_chains.sql"
  "141_admin_assign_all_rbac_roles.sql"
  "172_print_engine_seed.sql"
  "205_tax_codes_system.sql"
  "213_unified_numbering_center.sql"
  "214_numbering_priority_2_schemes.sql"
  "215_numbering_client_code_scheme.sql"
  "217_numbering_full_coverage.sql"
  "220_numbering_align_issue_timing.sql"
  "221_message_log_outbound_queue.sql"
  "227_numbering_payment_run_scheme.sql"
  "228_numbering_store_order_scheme.sql"
  "230_numbering_inquiry_memo_scheme.sql"
  "231_numbering_customer_advance_scheme.sql"
  "232_numbering_umrah_invoicing_schemes.sql"
  "250_activate_approval_chains.sql"
  "253_seed_notification_templates_full_bilingual.sql"
  "254_seed_company_gl_operation_mappings.sql"
  "256_seed_default_allocation_rules_per_company.sql"
  "256_seed_notification_routing_rules.sql"
  "256_seed_payroll_gl_operation_mappings.sql"
  "257_seed_custody_voucher_allocation_rules.sql"
  "257_seed_properties_gl_operation_mappings.sql"
  "258_seed_standard_functional_roles.sql"
  "270_attendance_per_category.sql"
  "274_org_model_foundation.sql"
  "278_default_hr_role_templates.sql"
  "289_seed_project_gl_mappings.sql"
  "291_seed_purchase_grni_mapping.sql"
  "312_seed_finance_intent_account_mappings.sql"
)
is_replay_seed() {
  for s in "${SEED_REPLAY_ALLOWLIST[@]}"; do
    [ "$s" = "$1" ] && return 0
  done
  return 1
}

marked=0; applied=0; replayed=0
for mig in $(ls "$MIGRATIONS_DIR"/*.sql | sort -V); do
  [ -f "$mig" ] || continue
  fn="$(basename "$mig")"
  if is_post_cutoff "$fn"; then
    say "applying post-cutoff migration: ${fn}"
    PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=1 -q -f "$mig"
    applied=$((applied + 1))
  else
    if is_replay_seed "$fn"; then
      # Seeds dump can't carry — re-applied idempotently so reference
      # rows the business journeys depend on actually exist.
      PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=0 -q -f "$mig" >/dev/null 2>&1 || true
      replayed=$((replayed + 1))
    fi
    marked=$((marked + 1))
  fi
  PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -q -c \
    "INSERT INTO schema_migrations(filename) VALUES ('${fn}') ON CONFLICT DO NOTHING;" >/dev/null
done
say "schema_migrations: ${marked} baseline-marked (${replayed} seeds replayed), ${applied} post-cutoff applied"

# 5. seed reference rows + deterministic admin + company defaults + an open
# fiscal period (so GL posting is unblocked). Reuses the same SQL files
# db/bootstrap.sh uses, in the same order. Each is optional + idempotent.
# seed <file>  — contract-critical: a missing file is a hard error (the DB
# would otherwise report "ready" while violating its own admin/defaults/period
# contract — exactly the silent-success class this script exists to prevent).
seed() {
  local file="$REPO_ROOT/db/$1"
  [ -f "$file" ] || { echo "✗ required seed missing: db/$1" >&2; exit 1; }
  say "seeding db/$1..."
  PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=1 -q -f "$file"
}
# NB: the monolithic db/seed.sql is intentionally NOT loaded — it is stale
# (references the dropped role_permissions table) and optional per db/README.md.
# The per-company pipeline below is the canonical, known-good seed path; the
# reference rows seed.sql once carried (COA, role permissions, settings) are
# produced by seed-aldiyaa-company-defaults.sql, mirroring bootstrapCompany().
seed "seed-admin-user.sql"
seed "seed-aldiyaa-albayan.sql"
seed "seed-aldiyaa-company-defaults.sql"
seed "seed-financial-periods.sql"

# 5b. Replay per-company seeds NOW (after companies exist) — the
# SEED_REPLAY_ALLOWLIST migrations include CROSS JOINs on `companies`
# that produced 0 rows when run at step 4 against an empty DB. Re-run
# them idempotently so reference rows (numbering schemes, GL operation
# mappings, allocation rules, etc.) actually land per-company.
say "replaying per-company seed-bearing migrations after company seeds..."
post_company_replayed=0
for s in "${SEED_REPLAY_ALLOWLIST[@]}"; do
  mig_path="$MIGRATIONS_DIR/$s"
  [ -f "$mig_path" ] || continue
  PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -v ON_ERROR_STOP=0 -q -f "$mig_path" >/dev/null 2>&1 || true
  post_company_replayed=$((post_company_replayed + 1))
done
ns_ct="$(PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -tAc "SELECT count(*) FROM numbering_schemes;" | tr -d '[:space:]')"
am_ct="$(PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -tAc "SELECT count(*) FROM accounting_mappings;" | tr -d '[:space:]')"
say "post-company seed replay: ${post_company_replayed} seeds — numbering_schemes=${ns_ct}, accounting_mappings=${am_ct}"

# 6. final invariants — fail loudly rather than print a false "ready". Asserts
# the head-of-main contract actually landed: admin login row, an open fiscal
# period (GL posting), and every migration file recorded in schema_migrations.
say "verifying invariants..."
q() { PGPASSWORD="$DB_PASSWORD" psql "$APP_DSN" -tAc "$1" | tr -d '[:space:]'; }
admin_ct="$(q "SELECT count(*) FROM users WHERE email='owner@local.test';")"
period_ct="$(q "SELECT count(*) FROM financial_periods WHERE status='open';")"
mig_ct="$(q "SELECT count(*) FROM schema_migrations;")"
total_migs="$(ls "$MIGRATIONS_DIR"/*.sql | wc -l | tr -d '[:space:]')"
[ "${admin_ct:-0}" -ge 1 ]  || { echo "✗ invariant: admin owner@local.test missing"   >&2; exit 1; }
[ "${period_ct:-0}" -ge 1 ] || { echo "✗ invariant: no open financial period"          >&2; exit 1; }
[ "${mig_ct:-0}" -eq "${total_migs:-0}" ] || { echo "✗ invariant: schema_migrations (${mig_ct}) != migration files (${total_migs})" >&2; exit 1; }
say "invariants OK: admin=${admin_ct}, open periods=${period_ct}, migrations=${mig_ct}/${total_migs}"

echo
echo "✓ Head-of-main DB ready at HEAD (${marked}+${applied} migrations)."
echo
echo "  export DATABASE_URL=${APP_DSN}"
echo "  export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test"
echo
echo "  Login: owner@local.test / Test1234!"
echo "  Dynamic tests:  DATABASE_URL=${APP_DSN} JWT_SECRET=<32+ chars> NODE_ENV=test \\"
echo "                  pnpm --filter @workspace/api-server exec vitest run tests/integration/<file>"
echo "  Journey:        DATABASE_URL=${APP_DSN} bash scripts/verify-finance-posting-journey.sh"
