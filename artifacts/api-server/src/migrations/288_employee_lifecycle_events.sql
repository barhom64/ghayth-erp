-- Migration 288 — Employee lifecycle events (#2077 PR-8).
--
-- @rollback: Fully additive.
--   DROP INDEX IF EXISTS idx_emp_lifecycle_employee;
--   DROP INDEX IF EXISTS idx_emp_lifecycle_company_state;
--   DROP TABLE IF EXISTS employee_lifecycle_events;
--
-- The product owner's brief: «دورة الحياة ليست مجرد status flag.
-- كل انتقال يجب أن يكون له سبب، تاريخ قرار، تاريخ تنفيذ، منفذ، دور
-- نشط، شركة، فرع، Audit، Event».
--
-- This table is the single ledger every lifecycle transition writes
-- to. The CURRENT state is DERIVED by reading the latest event for
-- an employee — there is no separate `lifecycle_state` column on
-- employees / assignments. That keeps the audit trail honest: any
-- change to current state HAS to land an event row first.
--
-- The four date columns are explicit per the product owner's
-- discipline («لا تخلط بين تاريخ الإنشاء، تاريخ القرار، تاريخ التنفيذ،
-- تاريخ المستند»):
--   - createdAt      → wall-clock when the row landed.
--   - decisionDate   → when the decision was made (a manager said yes).
--   - effectiveDate  → when it takes effect (the start of the new state).
--   - documentDate   → date on the formal letter/contract/clearance.
--
-- The IGOC quartet (active_role_key, active_department_id,
-- resolved_scope, override_reason) lands here directly — so a
-- forensic query «من أنهى خدمة الموظف X؟ وبأي صلاحية؟» is answered
-- from ONE row, no join to audit_logs needed.

CREATE TABLE IF NOT EXISTS employee_lifecycle_events (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER REFERENCES branches(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "assignmentId" INTEGER REFERENCES employee_assignments(id),

  -- Event taxonomy
  "eventType" VARCHAR(40) NOT NULL,
  "stateBefore" VARCHAR(40),
  "stateAfter" VARCHAR(40),

  -- Required narrative + dates discipline
  reason TEXT,
  "decisionDate" DATE,
  "effectiveDate" DATE,
  "documentDate" DATE,
  "documentRef" VARCHAR(80),

  -- Actor + IGOC context (mirrors audit_logs columns introduced in PR-1).
  "actorUserId" INTEGER NOT NULL REFERENCES users(id),
  "activeRoleKey" VARCHAR(60),
  "activeDepartmentId" INTEGER,
  "resolvedScope" VARCHAR(20),
  "impersonationSourceUser" INTEGER,

  -- Guard bypass — the product owner allowed «تجاوز موثق» for some
  -- transitions (e.g. terminate with active custody). Required when
  -- the engine's pre-check fails but the operator overrides.
  "overrideReason" TEXT,

  -- Per-event details (termination type, suspension duration,
  -- transferred-from/to ids, …) so a downstream consumer can act
  -- without re-querying. Pure JSONB — no rigid shape.
  metadata JSONB DEFAULT '{}'::jsonb,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_lifecycle_employee
  ON employee_lifecycle_events ("employeeId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_emp_lifecycle_company_state
  ON employee_lifecycle_events ("companyId", "stateAfter", "createdAt" DESC)
  WHERE "stateAfter" IS NOT NULL;
