-- 171_mudad_contract_register_type.sql
-- Task #272: extend mudad_settlements.type CHECK to allow
-- 'contract_register' rows so the new "register new hire with Mudad"
-- listener can persist its submission alongside salary / termination
-- entries. The legacy enum (salary, leave_unpaid, exit_reentry,
-- termination, contract_renewal) lacked a row-type for the initial
-- contract registration that happens at hire-time.

BEGIN;

ALTER TABLE mudad_settlements
  DROP CONSTRAINT IF EXISTS chk_mudad_type;

ALTER TABLE mudad_settlements
  ADD CONSTRAINT chk_mudad_type
  CHECK (type IN (
    'salary',
    'leave_unpaid',
    'exit_reentry',
    'termination',
    'contract_renewal',
    'contract_register'
  ));

COMMIT;
