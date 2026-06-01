-- Migration 240: add nameEn column to departments
--
-- Context: routes/settings.ts POST /departments and PUT /departments/:id
-- both write to a "nameEn" column:
--   INSERT INTO departments (name, "nameEn", "companyId", "managerId") ...
--   UPDATE departments SET name=$1, "nameEn"=$2, ...
-- but the column was never created — no baseline column, no prior
-- migration. Every "إضافة قسم" / "تعديل قسم" therefore failed at the
-- INSERT/UPDATE with pg 42703 ("column \"nameEn\" of relation
-- \"departments\" does not exist"), which the API surfaces to the user as
-- the generic "خطأ في هيكل قاعدة البيانات، يرجى التواصل مع الدعم الفني".
--
-- This mirrors branches."nameEn" (migration 008) — every other
-- org-structure table (branches, companies) already carries a bilingual
-- name, departments was simply missed. Additive + idempotent via
-- `IF NOT EXISTS`; safe to re-run and zero-downtime.
--
-- @rollback:
--   ALTER TABLE departments DROP COLUMN IF EXISTS "nameEn";

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS "nameEn" VARCHAR(200);

COMMENT ON COLUMN departments."nameEn" IS
  'Optional English name for the department — mirrors branches."nameEn".';
