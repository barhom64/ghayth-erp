#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
DB_CONTAINER="${DB_CONTAINER:-ghayth-erp-db-1}"
DB_NAME="${POSTGRES_DB:-ghayth_erp}"
DB_USER="${POSTGRES_USER:-ghayth}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"
FORCE_RESET="${FORCE_RESET:-false}"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Missing ${ROOT_DIR}/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.env"
set +a

DB_NAME="${POSTGRES_DB:-${DB_NAME}}"
DB_USER="${POSTGRES_USER:-${DB_USER}}"
DB_PASSWORD="${POSTGRES_PASSWORD:-${DB_PASSWORD}}"

if [[ -z "${DB_PASSWORD}" ]]; then
  echo "POSTGRES_PASSWORD is required" >&2
  exit 1
fi

cd "${ROOT_DIR}"

docker compose -f "${COMPOSE_FILE}" up -d db

echo "Waiting for Postgres..."
for i in {1..60}; do
  if docker exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" == "60" ]]; then
    echo "Postgres did not become ready" >&2
    exit 1
  fi
done

TABLE_COUNT=$(docker exec -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")

if [[ "${TABLE_COUNT}" != "0" && "${FORCE_RESET}" != "true" ]]; then
  echo "Database is not empty (${TABLE_COUNT} public tables). Set FORCE_RESET=true only if you intentionally want to wipe and rebuild it." >&2
  exit 1
fi

if [[ "${FORCE_RESET}" == "true" ]]; then
  echo "Resetting database ${DB_NAME}..."
  docker exec -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME};"
  docker exec -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

load_sql_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing SQL file: $file" >&2
    exit 1
  fi
  echo "Loading $(basename "$file")..."
  docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -q < "$file"
}

load_sql_file "${ROOT_DIR}/db/schema_pre.sql"
# schema_post may contain stale \unrestrict from split dump; strip it like local bootstrap.
grep -v '^\\unrestrict ' "${ROOT_DIR}/db/schema_post.sql" | docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -q

if [[ -f "${ROOT_DIR}/db/seed.sql" ]]; then
  load_sql_file "${ROOT_DIR}/db/seed.sql"
fi

for seed in \
  "db/seed-admin-user.sql" \
  "db/seed-aldiyaa-albayan.sql" \
  "db/seed-aldiyaa-company-defaults.sql" \
  "db/seed-financial-periods.sql"; do
  if [[ -f "${ROOT_DIR}/${seed}" ]]; then
    load_sql_file "${ROOT_DIR}/${seed}"
  fi
done

echo "Marking baseline migrations..."
docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz DEFAULT NOW()
);
SQL

CUTOFF=""
if [[ -f "${ROOT_DIR}/db/.baseline-cutoff" ]]; then
  CUTOFF=$(grep -v '^[[:space:]]*$' "${ROOT_DIR}/db/.baseline-cutoff" | grep -v '^#' | head -1 | tr -d '[:space:]')
fi

if [[ -z "${CUTOFF}" ]]; then
  echo "db/.baseline-cutoff is missing or empty" >&2
  exit 1
fi

MARKED=0
SKIPPED=0
for mig in "${ROOT_DIR}/artifacts/api-server/src/migrations"/*.sql; do
  [[ -f "$mig" ]] || continue
  fn="$(basename "$mig")"
  if [[ "$fn" > "$CUTOFF" ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -q -c "INSERT INTO schema_migrations(filename) VALUES ('${fn}') ON CONFLICT DO NOTHING;"
  MARKED=$((MARKED + 1))
done

echo "Production DB bootstrap complete. Marked ${MARKED}, left ${SKIPPED} migrations after cutoff (${CUTOFF})."
