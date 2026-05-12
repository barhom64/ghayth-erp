#!/usr/bin/env bash
# pgbench wrapper — runs PostgreSQL's standard TPC-B-like benchmark plus a
# read-only variant so we have a vendor-neutral baseline number to compare
# against Odoo/ERPNext/Dolibarr (all of which can also be measured the same
# way against their PostgreSQL/MySQL backend).
#
# Usage:
#   DATABASE_URL=postgresql://... bash benchmarks/db/run-pgbench.sh
#
# What it does:
#   1. Initialises a fresh pgbench schema in a "pgbench_*" namespace.
#   2. Runs a 60 s TPC-B-like benchmark (mixed read/write).
#   3. Runs a 60 s read-only (`-S`) benchmark.
#   4. Drops the pgbench schema.
#
# This script does NOT touch ghayth_erp tables.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

if ! command -v pgbench >/dev/null 2>&1; then
  echo "pgbench not found. Install postgresql-contrib (Debian/Ubuntu) or postgresql (brew)." >&2
  exit 1
fi

OUT_DIR="$(cd "$(dirname "$0")"/.. && pwd)/results"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$OUT_DIR/pgbench-$TS.log"

SCALE="${PGBENCH_SCALE:-10}"        # ~150 MB at scale=10 — fits in RAM
CLIENTS="${PGBENCH_CLIENTS:-16}"
THREADS="${PGBENCH_THREADS:-4}"
DURATION="${PGBENCH_DURATION:-60}"

echo "Initialising pgbench (scale=$SCALE) …" | tee "$LOG"
pgbench -i -s "$SCALE" "$DATABASE_URL" 2>&1 | tee -a "$LOG"

echo
echo "▶ Mixed (TPC-B-like): $CLIENTS clients × $DURATION s" | tee -a "$LOG"
pgbench -c "$CLIENTS" -j "$THREADS" -T "$DURATION" -P 10 "$DATABASE_URL" 2>&1 | tee -a "$LOG"

echo
echo "▶ Read-only: $CLIENTS clients × $DURATION s" | tee -a "$LOG"
pgbench -c "$CLIENTS" -j "$THREADS" -T "$DURATION" -P 10 -S "$DATABASE_URL" 2>&1 | tee -a "$LOG"

echo
echo "Cleaning up pgbench schema …" | tee -a "$LOG"
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS pgbench_accounts, pgbench_branches, pgbench_history, pgbench_tellers CASCADE;" 2>&1 | tee -a "$LOG"

echo
echo "Done. Log: $LOG"
