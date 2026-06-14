-- @rollback: ALTER TABLE fleet_maintenance DROP COLUMN IF EXISTS "supplierId"; ALTER TABLE fleet_maintenance DROP COLUMN IF EXISTS "unregisteredSupplierName"; ALTER TABLE maintenance_requests DROP COLUMN IF EXISTS "supplierId"; ALTER TABLE maintenance_requests DROP COLUMN IF EXISTS "unregisteredSupplierName";

-- Wire fleet maintenance and property maintenance to the suppliers registry.
-- Replaces the free-text performedBy / contractor field with a proper FK.
-- unregisteredSupplierName is allowed only under the
-- allowUnregisteredMaintenanceSupplier policy (draft-mode exception).

ALTER TABLE fleet_maintenance
  ADD COLUMN IF NOT EXISTS "supplierId"               INTEGER REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS "unregisteredSupplierName" VARCHAR(300);

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS "supplierId"               INTEGER REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS "unregisteredSupplierName" VARCHAR(300);
