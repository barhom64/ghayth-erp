#!/bin/bash
#
# scripts/backup.sh — point-in-time logical backup of the Ghayth ERP database.
#
# Produces a single timestamped *.sql.gz file you can ship anywhere and
# restore with scripts/restore.sh. Schema + data + sequence values, no
# privileges or roles (those live in your infra config).
#
# Usage:
#   bash scripts/backup.sh                      # → backups/ghayth-erp-2026-05-09T12-34-56Z.sql.gz
#   bash scripts/backup.sh --out /mnt/snapshots # custom destination
#   DATABASE_URL=postgres://... bash scripts/backup.sh
#
# Required env (same defaults as db/bootstrap.sh):
#   DATABASE_URL   (preferred — single connection string)
#   OR DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT
#
# Exit codes:
#   0  backup written successfully
#   1  configuration / env failure
#   2  pg_dump failure (DB unreachable, permission denied, …)
#
# Recommended cadence:
#   • Hourly via cron during business hours
#   • Plus a nightly full retained for 30 days
#   • Plus a weekly full retained for 1 year (offsite)
# Adjust retention by combining this with `find ... -mtime +N -delete`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/backups"

# --- arg parsing --------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --out)   OUT_DIR="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "✗ Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# --- resolve connection -------------------------------------------------
if [ -n "${DATABASE_URL:-}" ]; then
  CONN="$DATABASE_URL"
else
  DB_NAME="${DB_NAME:-ghayth_erp}"
  DB_USER="${DB_USER:-ghayth_erp}"
  DB_PASSWORD="${DB_PASSWORD:-ghayth_erp}"
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  CONN="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
fi

# --- preflight ----------------------------------------------------------
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "✗ pg_dump not found. Install postgresql-client-16 (or matching server version)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_FILE="$OUT_DIR/ghayth-erp-$STAMP.sql.gz"
TMP_FILE="$OUT_FILE.partial"

echo "▶ Ghayth ERP backup"
echo "  Target: $OUT_FILE"

# --- dump ---------------------------------------------------------------
# --no-owner / --no-privileges keeps the dump portable across roles.
# --clean adds DROP statements so a restore wipes existing objects first.
# --if-exists makes the DROPs idempotent on a fresh DB.
# We pipe through gzip so we never write the plaintext dump to disk.
if ! pg_dump "$CONN" \
      --format=plain \
      --no-owner \
      --no-privileges \
      --clean \
      --if-exists \
  | gzip -c > "$TMP_FILE"; then
  rm -f "$TMP_FILE"
  echo "✗ pg_dump failed. Check connection: $CONN" >&2
  exit 2
fi

# Atomic rename — readers never see a half-written file.
mv "$TMP_FILE" "$OUT_FILE"

SIZE_HUMAN=$(du -h "$OUT_FILE" | cut -f1)
echo "✓ Backup complete — $SIZE_HUMAN at $OUT_FILE"
echo
echo "Restore with:"
echo "  bash scripts/restore.sh $OUT_FILE"
