-- Migration 186: persist the HR create-form fields that were silently dropped.
--
-- HR functional audit M3: six HR "create" forms POST fields that the backend
-- never stored — the zod schema stripped the unknown key, or the key passed
-- zod but the INSERT had no column for it. Either way user-entered data was
-- discarded before reaching the database. The engines were fine; the bug was
-- missing columns.
--
-- This migration adds those columns. The matching zod + INSERT wiring lands
-- in the same PR (recruitment.ts, training.ts, hr.ts). Every column is
-- nullable and additive — no backfill, no behaviour change for existing rows
-- or existing flows.
--
--   job_postings      — experienceLevel, education, vacancies, benefits, skills
--   job_applications  — source, experience, education, expectedSalary, currentCompany
--   training_programs — objectives, targetAudience  (already in the zod schema)
--   shifts            — breakMinutes, gracePeriod    (already in the zod schema)
--   payroll_runs      — reference, notes
--
-- @rollback: ALTER TABLE job_postings DROP COLUMN IF EXISTS "experienceLevel", DROP COLUMN IF EXISTS education, DROP COLUMN IF EXISTS vacancies, DROP COLUMN IF EXISTS benefits, DROP COLUMN IF EXISTS skills; ALTER TABLE job_applications DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS experience, DROP COLUMN IF EXISTS education, DROP COLUMN IF EXISTS "expectedSalary", DROP COLUMN IF EXISTS "currentCompany"; ALTER TABLE training_programs DROP COLUMN IF EXISTS objectives, DROP COLUMN IF EXISTS "targetAudience"; ALTER TABLE shifts DROP COLUMN IF EXISTS "breakMinutes", DROP COLUMN IF EXISTS "gracePeriod"; ALTER TABLE payroll_runs DROP COLUMN IF EXISTS reference, DROP COLUMN IF EXISTS notes;

ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS "experienceLevel" text;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS vacancies integer;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS benefits text;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS skills text;

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS "expectedSalary" numeric(15,2);
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS "currentCompany" text;

ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS objectives text;
ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS "targetAudience" text;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "breakMinutes" integer;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "gracePeriod" integer;

ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS notes text;
