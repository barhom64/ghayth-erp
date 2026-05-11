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
FULL="$(mktemp)"
grep -v '^-- Dumped' "$TMP" \
  | grep -v '^-- TOC entry' \
  | grep -v '^-- Name: SCHEMA public' \
  | sed '/./,$!d' \
  > "$FULL"

rm -f "$TMP"

# Split at the last `CREATE TABLE … );` boundary so each half stays under
# the ~800 KB Replit GitHub-proxy upload limit. db/schema.sql becomes a
# tiny psql wrapper that `\ir`s both halves; consumers that read the SQL
# as text (e.g. scripts/src/audit-schema-drift.mjs) read both files and
# concatenate them.
LAST_CT=$(grep -n '^CREATE TABLE' "$FULL" | tail -1 | cut -d: -f1)
END_CT=$(awk -v start="$LAST_CT" 'NR>=start && /^\);$/ {print NR; exit}' "$FULL")

if [ -z "$END_CT" ]; then
  echo "ERROR: could not locate end of last CREATE TABLE block." >&2
  rm -f "$FULL"
  exit 2
fi

PRE="db/schema_pre.sql"
POST="db/schema_post.sql"
head -n "$END_CT" "$FULL" > "$PRE"
tail -n +"$((END_CT + 1))" "$FULL" > "$POST"

cat > "$OUT" <<'WRAP'
-- db/schema.sql — wrapper that loads the schema in two halves.
--
-- The full schema is too large for some upload paths (the Replit GitHub
-- proxy tops out around 800 KB per file), so the dump is split at the
-- last `CREATE TABLE` boundary into:
--
--   db/schema_pre.sql   — DROP CONSTRAINT/INDEX, DROP TABLE, CREATE TABLE
--   db/schema_post.sql  — ALTER TABLE … ADD CONSTRAINT (PK/FK), CREATE INDEX
--
-- This wrapper uses psql's `\ir` (include-relative) so it works regardless
-- of the caller's CWD: `psql -f db/schema.sql` resolves both halves
-- relative to this file's location.
--
-- Regenerate with: bash db/dump-schema.sh
\ir schema_pre.sql
\ir schema_post.sql
WRAP

LINE_COUNT=$(wc -l < "$FULL")
TABLE_COUNT=$(grep -cE '^CREATE TABLE' "$FULL" || echo 0)
INDEX_COUNT=$(grep -cE '^CREATE (UNIQUE )?INDEX' "$FULL" || echo 0)
FK_COUNT=$(grep -cE 'FOREIGN KEY' "$FULL" || echo 0)
PRE_BYTES=$(wc -c < "$PRE")
POST_BYTES=$(wc -c < "$POST")

rm -f "$FULL"

echo "✓ Wrote $OUT (wrapper) + $PRE + $POST"
echo "  Lines:        $LINE_COUNT"
echo "  CREATE TABLE: $TABLE_COUNT"
echo "  CREATE INDEX: $INDEX_COUNT"
echo "  FOREIGN KEY:  $FK_COUNT"
echo "  Pre size:     $PRE_BYTES bytes"
echo "  Post size:    $POST_BYTES bytes"
echo
echo "Next step: review the diff, commit, and push."
