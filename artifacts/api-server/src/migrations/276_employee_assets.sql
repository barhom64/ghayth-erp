-- Migration 276 — Employee assets bridge (#1799 priority #9)
--
-- @rollback: Fully additive. To undo:
--   DROP INDEX IF EXISTS idx_employee_assets_active;
--   DROP INDEX IF EXISTS idx_employee_assets_assignment;
--   DROP TABLE IF EXISTS employee_assets;
--
-- The inventory (docs/HR_OPERATING_FOUNDATION_TASK.md §A.7) found
-- per-employee custody accounts work (subsidiary_accounts) but the
-- system has NO first-class link between physical/IT assets and the
-- employee who holds them. The exit-clearance flow asks «هل سلّم
-- اللابتوب؟» but has no machine-readable list to verify against.
--
-- This migration adds the bridge so:
--   1. HR can register «laptop X assigned to assignmentId Y on date Z»
--   2. The exit-clearance step can list outstanding assets to return
--   3. Asset history per employee surfaces in the 360 profile
--   4. The asset itself is `assetKey` (free text) — companies don't
--      need a warehouse SKU to track «iqama card», «company SIM»,
--      «office key #7», etc.

CREATE TABLE IF NOT EXISTS employee_assets (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "employeeId" INTEGER NOT NULL,
  -- The asset itself. `assetKey` is a free-form identifier (serial,
  -- model, asset tag). `assetType` is the category enum that drives
  -- the icon + the clearance checklist on exit.
  "assetType" VARCHAR(40) NOT NULL,
  -- e.g. 'laptop', 'phone', 'sim', 'vehicle', 'uniform', 'iqama_card',
  -- 'key', 'tools', 'tablet', 'other'
  "assetKey" VARCHAR(120) NOT NULL,
  "assetLabel" VARCHAR(200),
  "serialNumber" VARCHAR(120),
  -- Optional foreign key to a richer warehouse record if it exists.
  "warehouseAssetId" INTEGER,
  -- Lifecycle.
  "assignedAt" DATE NOT NULL DEFAULT CURRENT_DATE,
  "assignedBy" INTEGER,            -- assignmentId of the HR officer
  "returnedAt" DATE,
  "returnedBy" INTEGER,            -- assignmentId who registered the return
  -- Free-form condition note at hand-off and again at return so
  -- damage claims are visible to payroll EOS.
  "conditionOnAssign" TEXT,
  "conditionOnReturn" TEXT,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-employee assignment list — the 360 profile tab + the clearance
-- step both walk this index.
CREATE INDEX IF NOT EXISTS idx_employee_assets_assignment
  ON employee_assets("assignmentId", "assignedAt" DESC);

-- Active-asset list (un-returned). Partial index keeps the lookup
-- fast even after years of return history accumulates.
CREATE INDEX IF NOT EXISTS idx_employee_assets_active
  ON employee_assets("companyId", "assignmentId")
  WHERE "returnedAt" IS NULL;
