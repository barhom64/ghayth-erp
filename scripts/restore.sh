#!/bin/bash
#
# scripts/restore.sh — restore a Ghayth ERP backup produced by scripts/backup.sh.
#
# DESTRUCTIVE: drops + recreates every object the dump touched. Refuses
# to run unless --yes is passed and the target DB looks safe (matches a
# known dev/test pattern OR you set --i-know-what-im-doing for prod).
#
# Usage:
#   bash scripts/restore.sh backups/ghayth-erp-2026-05-09T12-34-56Z.sql.gz --yes
#
#   # Production (also requires explicit override flag)
#   DATABASE_URL=postgres://... bash scripts/restore.sh /tmp/x.sql.gz --yes --i-know-what-im-doing
#
# Required env:
#   DATABASE_URL   (preferred)
#   OR DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT
#
# Exit codes:
#   0  restore complete
#   1  config / preflight failure (missing file, missing tools, refused)
#   2  psql restore failure (data invalid, fk violations, …)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- arg parsing --------------------------------------------------------
DUMP_FILE=""
CONFIRMED=0
PROD_OVERRIDE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes)                  CONFIRMED=1; shift ;;
    --i-know-what-im-doing) PROD_OVERRIDE=1; shift ;;
    --help|-h)              sed -n '2,25p' "$0"; exit 0 ;;
    -*)                     echo "✗ Unknown flag: $1" >&2; exit 1 ;;
    *)                      DUMP_FILE="$1"; shift ;;
  esac
done

if [ -z "$DUMP_FILE" ]; then
  echo "✗ Usage: bash scripts/restore.sh <backup.sql.gz> --yes" >&2
  exit 1
fi
if [ ! -f "$DUMP_FILE" ]; then
  echo "✗ Backup file not found: $DUMP_FILE" >&2
  exit 1
fi
if [ "$CONFIRMED" -ne 1 ]; then
  echo "✗ Restore is destructive. Re-run with --yes to confirm." >&2
  exit 1
fi

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

# --- safety: detect production-looking targets --------------------------
LOOKS_PROD=0
case "$CONN" in
  *prod*|*production*|*live*) LOOKS_PROD=1 ;;
esac
if [ "$LOOKS_PROD" -eq 1 ] && [ "$PROD_OVERRIDE" -ne 1 ]; then
  echo "✗ Connection string contains 'prod' / 'production' / 'live'." >&2
  echo "  Restoring would DROP every existing row." >&2
  echo "  Re-run with --i-know-what-im-doing if you really mean it." >&2
  exit 1
fi

# --- preflight ----------------------------------------------------------
for cmd in psql gunzip; do
  if ! command -v $cmd >/dev/null 2>&1; then
    echo "✗ $cmd not found. Install postgresql-client-16 + gzip." >&2
    exit 1
  fi
done

echo "▶ Ghayth ERP restore"
echo "  From: $DUMP_FILE"
echo "  Into: $CONN"

# --- restore ------------------------------------------------------------
# `--single-transaction` rolls back the entire restore if anything fails,
# so we never end up with a half-restored DB. ON_ERROR_STOP=1 catches the
# first error rather than barreling through.
if ! gunzip -c "$DUMP_FILE" \
      | psql "$CONN" -v ON_ERROR_STOP=1 --single-transaction -q; then
  echo "✗ psql restore failed. Database is unchanged (single-transaction rolled back)." >&2
  exit 2
fi

echo "✓ Restore complete."
echo
echo "Recommended next steps:"
echo "  1. pnpm db:dump-schema   # confirm schema.sql matches restored DB"
echo "  2. pnpm typecheck        # confirm types still align"
echo "  3. Smoke test the API and a few key flows"
