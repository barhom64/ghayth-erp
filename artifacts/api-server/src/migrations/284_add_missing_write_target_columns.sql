-- 284_add_missing_write_target_columns.sql
--
-- Operational-readiness fix (#1594 — write-path review, UPDATE SET-column sweep).
--
-- PROBLEM
-- A table-anchored sweep of every `UPDATE <t> SET <col> = …` against the live
-- schema found 9 columns written by routes/engines that were never added to
-- their table. Each write hits
--   column "<col>" of relation "<table>" does not exist
-- and 500s the moment its path is reached — the same root cause as migration
-- 279 (lifecycle tables missing updatedAt), generalised beyond updatedAt:
--
--   • clients.updatedAt                       — rent-payment listener stamps it
--   • documents.updatedAt                     — document version upload
--   • employee_assignments.updatedAt          — role-tier upgrade
--   • employee_commission_calculations.approvedBy / approvedAt
--                                             — commission APPROVAL (reject path
--                                               works; approve path 500s)
--   • gov_integration_links.deletedAt         — soft-delete endpoint; the SELECT
--                                               above the UPDATE *also* filters
--                                               "deletedAt" IS NULL, so the whole
--                                               unlink endpoint is dead
--   • purchase_orders.paidAmount              — scheduled-payment AP-aging bump
--   • scheduled_reports.lastSentAt            — scheduled-report cron stamp
--   • suppliers.totalSpend                    — supplier-spend counter (the write
--                                               is .catch-guarded "may not exist
--                                               yet", so it silently no-ops today)
--
-- FIX
-- Add every missing column (additive, IF NOT EXISTS — non-breaking; existing
-- rows get the column default). Types follow the table's own conventions:
--   updatedAt  → timestamptz NOT NULL DEFAULT now()  (same as migration 279)
--   paidAmount → numeric(12,2) NOT NULL DEFAULT 0     (matches totalAmount)
--   totalSpend → numeric NOT NULL DEFAULT 0           (symmetric to clients.totalRevenue)
--   approvedBy → integer                              (matches createdBy/updatedBy)
--   approvedAt / deletedAt / lastSentAt → timestamptz (nullable; set on the event)
--
-- @rollback:
--   ALTER TABLE public.clients                            DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.documents                          DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.employee_assignments               DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.employee_commission_calculations   DROP COLUMN IF EXISTS "approvedBy";
--   ALTER TABLE public.employee_commission_calculations   DROP COLUMN IF EXISTS "approvedAt";
--   ALTER TABLE public.gov_integration_links              DROP COLUMN IF EXISTS "deletedAt";
--   ALTER TABLE public.purchase_orders                    DROP COLUMN IF EXISTS "paidAmount";
--   ALTER TABLE public.scheduled_reports                  DROP COLUMN IF EXISTS "lastSentAt";
--   ALTER TABLE public.suppliers                          DROP COLUMN IF EXISTS "totalSpend";

ALTER TABLE public.clients                          ADD COLUMN IF NOT EXISTS "updatedAt"  timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.documents                        ADD COLUMN IF NOT EXISTS "updatedAt"  timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employee_assignments             ADD COLUMN IF NOT EXISTS "updatedAt"  timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employee_commission_calculations ADD COLUMN IF NOT EXISTS "approvedBy" integer;
ALTER TABLE public.employee_commission_calculations ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz;
ALTER TABLE public.gov_integration_links            ADD COLUMN IF NOT EXISTS "deletedAt"  timestamptz;
ALTER TABLE public.purchase_orders                  ADD COLUMN IF NOT EXISTS "paidAmount" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.scheduled_reports                ADD COLUMN IF NOT EXISTS "lastSentAt" timestamptz;
ALTER TABLE public.suppliers                        ADD COLUMN IF NOT EXISTS "totalSpend" numeric NOT NULL DEFAULT 0;
