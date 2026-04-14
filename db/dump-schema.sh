#!/bin/bash
#
# dump-schema.sh — extract the schema-only DDL from the live Replit Postgres
# and write it to db/schema.sql. This produces the canonical schema source
# of truth that any developer can apply to a fresh local Postgres to get
# a working instance.
#
# Run this on Replit (where DATABASE_URL points at the live DB) whenever
# the schema changes — typically after a new migration lands on main.
#
# Usage:
#   DATABASE_URL=postgres://... bash db/dump-schema.sh
#
# Or via package.json:
#   pnpm db:dump-schema

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL must be set." >&2
  echo "       Source your .env first, or pass it inline:" >&2
  echo "       DATABASE_URL=postgres://... bash db/dump-schema.sh" >&2
  exit 1
fi

OUT="db/schema.sql"
TMP="$(mktemp)"

echo "→ Dumping schema from \$DATABASE_URL into $OUT"

# --schema-only       : DDL only, no row data
# --no-owner          : strip OWNER clauses (the DB user differs per env)
# --no-acl            : strip GRANT/REVOKE statements (handled by app role)
# --no-comments       : strip COMMENT statements (noisy diff for no value)
# --no-tablespaces    : strip TABLESPACE clauses (single-tablespace anyway)
# --no-publications   : strip pub/sub config (Replit-specific)
# --no-subscriptions  : same
# --if-exists         : add IF EXISTS to DROPs so re-runs don't fail
# --clean             : prepend DROPs so a re-run replaces existing objects
#
# We DELIBERATELY use --clean so `pnpm db:bootstrap` can re-apply the dump
# to wipe + rebuild the local DB in one shot. For the remote/staging case
# the migrate.ts baseline detector skips the dump entirely.
pg_dump \
  --schema-only \
  --no-owner \
  --no-acl \
  --no-comments \
  --no-tablespaces \
  --no-publications \
  --no-subscriptions \
  --if-exists \
  --clean \
  "$DATABASE_URL" > "$TMP"

# Strip Replit-specific noise: extension owner comments, role grants on
# the public schema, etc. Keeps the dump portable.
grep -v '^-- Dumped' "$TMP" \
  | grep -v '^-- TOC entry' \
  | grep -v '^-- Name: SCHEMA public' \
  | sed '/./,$!d' \
  > "$OUT"

rm -f "$TMP"

LINE_COUNT=$(wc -l < "$OUT")
TABLE_COUNT=$(grep -cE '^CREATE TABLE' "$OUT" || echo 0)
INDEX_COUNT=$(grep -cE '^CREATE (UNIQUE )?INDEX' "$OUT" || echo 0)
FK_COUNT=$(grep -cE 'FOREIGN KEY' "$OUT" || echo 0)

echo "✓ Wrote $OUT"
echo "  Lines:        $LINE_COUNT"
echo "  CREATE TABLE: $TABLE_COUNT"
echo "  CREATE INDEX: $INDEX_COUNT"
echo "  FOREIGN KEY:  $FK_COUNT"
echo
echo "Next step: review the diff, commit, and push to the Phase 2 branch."
