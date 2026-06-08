-- 249_seed_job_title_role_defaults.sql
--
-- WHAT:    backfill `defaultRoleKey` + `opensCustody` for the common
--          Arabic job titles seeded by migrations 012 / 123. New tenants
--          inherit these defaults so the employee-create form
--          auto-suggests sensible RBAC + custody flags.
--
-- WHY:     migration 248 added the columns NULL/false. Without this
--          seed, a fresh tenant picks "سائق" and the system has nothing
--          to tell it the RBAC role is "driver" or that drivers
--          normally open a custody on day 1.
--
-- SAFETY:  pure UPDATE on rows whose defaultRoleKey is still NULL.
--          Operators who already set their own defaults are untouched.
--
-- @rollback: UPDATE job_titles SET "defaultRoleKey" = NULL, "opensCustody" = false
--             WHERE name IN ('سائق','محاسب','مدير عام','مدير الموارد البشرية',
--                            'مندوب مبيعات','مدير عقارات','مدير قانوني','أمين صندوق');

BEGIN;

UPDATE public.job_titles SET "defaultRoleKey" = 'driver',         "opensCustody" = true  WHERE "defaultRoleKey" IS NULL AND name IN ('سائق','سائق رئيسي','سائق نقل');
UPDATE public.job_titles SET "defaultRoleKey" = 'accountant',     "opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('محاسب','محاسب مالي','محاسب أول');
UPDATE public.job_titles SET "defaultRoleKey" = 'finance_manager',"opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('مدير مالي','المدير المالي');
UPDATE public.job_titles SET "defaultRoleKey" = 'general_manager',"opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('مدير عام','المدير العام');
UPDATE public.job_titles SET "defaultRoleKey" = 'hr_manager',     "opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('مدير الموارد البشرية','مدير موارد بشرية','HR Manager');
UPDATE public.job_titles SET "defaultRoleKey" = 'sales_rep',      "opensCustody" = true  WHERE "defaultRoleKey" IS NULL AND name IN ('مندوب مبيعات','مندوب','ممثل مبيعات');
UPDATE public.job_titles SET "defaultRoleKey" = 'property_manager',"opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('مدير عقارات','مدير عقاري');
UPDATE public.job_titles SET "defaultRoleKey" = 'legal_manager',  "opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('مدير قانوني','المستشار القانوني');
UPDATE public.job_titles SET "defaultRoleKey" = 'cashier',        "opensCustody" = true  WHERE "defaultRoleKey" IS NULL AND name IN ('أمين صندوق','كاشير','أمين خزينة');
UPDATE public.job_titles SET "defaultRoleKey" = 'branch_manager', "opensCustody" = false WHERE "defaultRoleKey" IS NULL AND name IN ('مدير فرع');

COMMIT;
