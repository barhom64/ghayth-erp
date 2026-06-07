-- Migration 269 — #1791: physically remove legacy RBAC tables
--
-- RBAC v2 (rbac_roles / rbac_role_grants / rbac_user_roles + authzEngine)
-- is now the sole authority. Every production code path — login, /me,
-- /auth/register, admin user CRUD + assertAdmin, roleGuard module/level
-- derivation, company bootstrap, and auto-migrate seeding — reads and
-- writes v2 exclusively. The legacy tables below have no FK or view
-- dependents (verified against the live catalog), so a CASCADE drop is
-- safe and lands ordered AFTER all code decoupling within the same PR.
--
-- @rollback:
--   -- Irreversible: legacy RBAC data is fully superseded by rbac_* tables.
--   -- Restore from a pre-269 backup if the v2 cutover must be undone.
--
-- @policy:destructive — DROP TABLE on the five legacy RBAC tables. Verified
--   superseded: zero reads/writes in routes/, lib/, middlewares/ outside the
--   defining migrations themselves; no FK or view dependents in the live
--   catalog. RBAC v2 (rbac_*) is the sole authority post-cutover.

DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS custom_roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
