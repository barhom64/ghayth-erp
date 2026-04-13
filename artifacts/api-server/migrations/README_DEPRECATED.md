# ⚠️ This directory is NOT used at runtime

**Do NOT add new migrations here.** Use `artifacts/api-server/src/migrations/` instead.

## Why this directory exists

This folder contains 80+ historical SQL files from an older layout. It is kept
only for git history. The migration runner never touches these files.

## How migrations actually run

1. `build.mjs` copies `src/migrations/` → `dist/migrations/` at build time
   (see `copyMigrations()` in `artifacts/api-server/build.mjs`).
2. `src/lib/migrate.ts` resolves `"./migrations"` relative to its own
   `__dirname`, which after bundling is `dist/`, so the runner reads
   `dist/migrations/` — and therefore only ever sees files that originated
   in `src/migrations/`.
3. Each applied filename is recorded in the `schema_migrations` table,
   keyed by filename. Files in `artifacts/api-server/migrations/` are never
   seen by the runner and thus never recorded.

## What to do if you need to touch an old migration from this folder

Don't. The file has almost certainly already been applied to every deployed
database under its old name. Instead:

1. Check whether an equivalent file exists in `src/migrations/`. If it does,
   the one here is the superseded copy — leave both alone.
2. If you need a schema change, add a **new** migration with the next free
   number in `src/migrations/` (look at the highest prefix there, not here).

## Known duplication

`066_inventory_projects_gl_accounts.sql` exists in both this folder and
`src/migrations/`. The `src/migrations/` copy is the one that runs; this
copy is dead.
