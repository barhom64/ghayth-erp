-- Seed a canonical default department ("الإدارة العامة") for every existing
-- company so that creating an employee on a fresh dev DB no longer fails with
-- 422 "القسم … غير موجود". The deep CRUD harness used to self-seed a department
-- to work around this; with this migration any new environment ships ready for
-- the UI's employee-create flow without a manual setup step.
--
-- Idempotent: a company is skipped if it already has any department row, so
-- re-running the migration (or running it on a DB that already has departments)
-- is a no-op. Safe on empty DBs (no companies yet) — simply inserts nothing.

INSERT INTO departments (name, "companyId")
SELECT 'الإدارة العامة', c.id
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d."companyId" = c.id
);
