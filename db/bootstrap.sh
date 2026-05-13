#!/bin/bash
#
# bootstrap.sh — one command to spin up a fresh local Postgres for the
# Ghayth ERP API server. Idempotent: re-running it wipes + rebuilds
# the local DB from db/schema.sql + db/seed.sql + db/seed-admin-user.sql.
#
# Usage:
#   bash db/bootstrap.sh
#
# Or via:
#   pnpm db:bootstrap
#
# Environment overrides (all optional):
#   DB_NAME      default: ghayth_erp
#   DB_USER      default: ghayth_erp
#   DB_PASSWORD  default: ghayth_erp
#   DB_HOST      default: localhost
#   DB_PORT      default: 5432
#
# Prerequisites:
#   • postgresql-16 installed and running locally
#   • db/schema.sql + db/seed.sql exist (run db/dump-schema.sh on Replit
#     to regenerate them if missing)
#
# After this script:
#   • Local DB is empty schema-only with the reference rows + one admin
#     user "owner@local.test" / password "Test1234!"
#   • Drop the .env file at artifacts/api-server/.env with the right
#     DATABASE_URL (the script prints it at the end)
#   • Run `pnpm dev` from artifacts/api-server

set -e

DB_NAME="${DB_NAME:-ghayth_erp}"
DB_USER="${DB_USER:-ghayth_erp}"
DB_PASSWORD="${DB_PASSWORD:-ghayth_erp}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA_FILE="$REPO_ROOT/db/schema.sql"
SEED_FILE="$REPO_ROOT/db/seed.sql"
ADMIN_FILE="$REPO_ROOT/db/seed-admin-user.sql"

echo "▶ Ghayth ERP — local DB bootstrap"
echo "  Target: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# 1. sanity-check the dump files exist
for f in "$SCHEMA_FILE" "$ADMIN_FILE"; do
  if [ ! -f "$f" ]; then
    echo "✗ Missing required file: $f" >&2
    if [ "$f" = "$SCHEMA_FILE" ]; then
      echo "  Run db/dump-schema.sh on Replit to generate it, commit, and pull." >&2
    fi
    exit 1
  fi
done

if [ ! -f "$SEED_FILE" ]; then
  echo "  ⚠ db/seed.sql not found — bootstrap will load schema only."
  echo "    The API will boot but you'll need to create test data manually."
  echo "    Run db/dump-seed.sh on Replit to generate it."
fi

# 2. ensure Postgres is running. If not, try to start it (dev sandbox).
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
  echo "  Postgres not reachable; attempting to start..."
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    sudo pg_ctlcluster 16 main start 2>/dev/null || \
      pg_ctlcluster 16 main start 2>/dev/null || true
  fi
  sleep 1
  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    echo "✗ Cannot reach Postgres at $DB_HOST:$DB_PORT" >&2
    echo "  Install postgresql-16 and start it, then retry." >&2
    exit 1
  fi
fi

# 3. ensure the role exists; idempotent.
echo "  Ensuring role $DB_USER exists..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE $DB_USER WITH LOGIN SUPERUSER PASSWORD '$DB_PASSWORD';" >/dev/null

# 4. drop + recreate the DB. Idempotent reset.
echo "  Dropping + recreating $DB_NAME..."
sudo -u postgres dropdb --if-exists "$DB_NAME" >/dev/null
sudo -u postgres createdb "$DB_NAME" -O "$DB_USER" >/dev/null

DSN="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

# 5. load the schema. The dump is generated with --clean so it can also
# be applied to a non-empty DB; on a fresh DB the DROPs are no-ops.
#
# Load schema_pre + schema_post directly instead of going through the
# `db/schema.sql` wrapper. The wrapper uses `\ir` which is rejected by
# pg_dump's `\restrict` token that sits at the top of schema_pre.sql in
# psql 16.10+: once schema_pre.sql sets restricted mode, every backslash
# command in the parent script (including the `\ir schema_post.sql`
# that should fire next) is blocked, killing the load mid-way.
SCHEMA_PRE_FILE="$REPO_ROOT/db/schema_pre.sql"
SCHEMA_POST_FILE="$REPO_ROOT/db/schema_post.sql"
echo "  Loading schema from db/schema_pre.sql + db/schema_post.sql..."
# schema_pre.sql starts with `\restrict <token>` which auto-unsets when
# the file ends. The trailing `\unrestrict <token>` in schema_post.sql is
# left over from when both halves loaded in one session; since we now
# load them as two separate psql calls, it triggers "not currently in
# restricted mode" which `-v ON_ERROR_STOP=1` upgrades to a fatal error.
# Strip the lone `\unrestrict` lines on stdin to keep the load atomic.
PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$SCHEMA_PRE_FILE"
grep -v '^\\unrestrict ' "$SCHEMA_POST_FILE" | \
  PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q

# 6. load the reference seed (companies/branches/permissions/...).
if [ -f "$SEED_FILE" ]; then
  echo "  Loading reference rows from db/seed.sql..."
  PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$SEED_FILE"
fi

# 7. create the deterministic test admin user. This file uses a known
# bcrypt hash for "Test1234!" so the verification packs can log in.
echo "  Creating test admin user (owner@local.test / Test1234!)..."
PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$ADMIN_FILE"

# 7b. seed an open fiscal period per company so GL posting is unblocked.
# Without this, every journal posting attempt fails the period guard.
PERIODS_FILE="$REPO_ROOT/db/seed-financial-periods.sql"
if [ -f "$PERIODS_FILE" ]; then
  echo "  Seeding open fiscal period(s) for current year..."
  PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$PERIODS_FILE"
fi

# 7c. seed Al-Diyaa wal-Bayan company + sub-branches + owner user.
ALDIYAA_FILE="$REPO_ROOT/db/seed-aldiyaa-albayan.sql"
if [ -f "$ALDIYAA_FILE" ]; then
  echo "  Seeding Al-Diyaa wal-Bayan company, branches, owner..."
  PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$ALDIYAA_FILE"
fi

# 7d. seed Al-Diyaa company-level defaults that mirror bootstrapCompany():
#     chart of accounts, role permissions, leave types, shifts, salary
#     components, and system_settings (settings + violation types +
#     approval chains + numbering prefixes + penalty ladder).
ALDIYAA_DEFAULTS_FILE="$REPO_ROOT/db/seed-aldiyaa-company-defaults.sql"
if [ -f "$ALDIYAA_DEFAULTS_FILE" ]; then
  echo "  Seeding Al-Diyaa wal-Bayan company defaults (COA, roles, settings)..."
  PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$ALDIYAA_DEFAULTS_FILE"
fi

# 8. mark every existing migration as applied so runMigrations skips them
# on the first server boot. Otherwise they'd try to ALTER TABLE on a
# baseline that already has those columns.
echo "  Marking applied migrations as baseline..."
PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz DEFAULT NOW()
);
SQL

# Walk the migrations dir and pre-record every file so the runner skips
# them. The user can override this by passing SKIP_BASELINE_MARK=1.
if [ -z "$SKIP_BASELINE_MARK" ]; then
  for mig in "$REPO_ROOT/artifacts/api-server/src/migrations"/*.sql; do
    [ -f "$mig" ] || continue
    fn="$(basename "$mig")"
    PGPASSWORD="$DB_PASSWORD" psql "$DSN" -q -c \
      "INSERT INTO schema_migrations(filename) VALUES ('$fn') ON CONFLICT DO NOTHING;" >/dev/null
  done
fi

echo
echo "✓ Local DB ready."
echo
echo "Next steps:"
echo "  1. Drop this into artifacts/api-server/.env:"
echo
echo "       DATABASE_URL=$DSN"
echo "       JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test-only"
echo "       NODE_ENV=development"
echo "       PORT=5000"
echo
echo "  2. Build + start the API:"
echo "       cd artifacts/api-server && pnpm run build && pnpm run start"
echo
echo "  3. Login with:"
echo "       email:    owner@local.test"
echo "       password: Test1234!"
echo
echo "  4. Re-run any verification pack from docs/verification/*.md"
