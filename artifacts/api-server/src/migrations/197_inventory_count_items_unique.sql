-- 197_inventory_count_items_unique.sql
--
-- `inventory_count_items` had no unique constraint on (countId, productId),
-- so the SELECT-then-INSERT-or-UPDATE pattern in
-- `routes/warehouse.ts:1427-1442` was racy. Two concurrent POSTs for the
-- same product within the same count both saw `existing = null`, both
-- INSERTed, and ended up with two rows for the same (count, product).
-- At approval time the loop iterates EVERY row, so the variance is
-- applied twice and `warehouse_products.currentStock` drifts by the
-- duplicated amount.
--
-- Step 1: de-duplicate existing rows — keep the most recent per
-- (countId, productId). The "most recent" is the one with the largest
-- `id`, which is the latest INSERT (id is a sequence).
--
-- Step 2: add the unique constraint so the route's new
-- `INSERT ... ON CONFLICT (countId, productId) DO UPDATE` collapses
-- the race into a single atomic statement.
--
-- @rollback:
--   ALTER TABLE inventory_count_items
--     DROP CONSTRAINT IF EXISTS inventory_count_items_count_product_unique;

DELETE FROM inventory_count_items
 WHERE id NOT IN (
   SELECT MAX(id) FROM inventory_count_items
   GROUP BY "countId", "productId"
 );

ALTER TABLE inventory_count_items
  ADD CONSTRAINT inventory_count_items_count_product_unique
  UNIQUE ("countId", "productId");
