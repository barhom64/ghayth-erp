-- Migration 146: Audit-column hygiene for umrah_* tables
--
-- Source: extracted from PR #275 migration 092 (NUSK-extended). After full
-- analysis (see PR #275 final comment), the only safe & valuable additive
-- piece of that PR is hardening audit columns on existing umrah_* tables.
-- Everything else in PR #275 either already exists in main, conflicts with
-- main, or is a regression of 1475 newer commits.
--
-- This migration adds createdBy/updatedBy/branchId/deletedAt to the 7 umrah
-- tables that are missing one or more of them, gated on IF NOT EXISTS so
-- it is idempotent and safe to re-run.

-- umrah_seasons (had only id/companyId/year/name/startDate/endDate/createdAt - missing all 4)
ALTER TABLE umrah_seasons        ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_seasons        ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_seasons        ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_seasons        ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- umrah_packages (missing createdBy, updatedBy, branchId — has deletedAt already)
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);

-- umrah_penalties (missing all 4)
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- umrah_agent_invoices (missing all 4)
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- umrah_transport (missing createdBy, updatedBy, branchId — has deletedAt already)
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);

-- umrah_import_batches (missing createdBy, updatedBy, deletedAt — already has branchId)
ALTER TABLE umrah_import_batches ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_import_batches ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_import_batches ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- umrah_import_logs (missing all 4)
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- Helpful tenant indexes for the new branchId columns (partial on alive rows)
CREATE INDEX IF NOT EXISTS idx_umrah_seasons_branch_alive        ON umrah_seasons        ("branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_penalties_branch_alive      ON umrah_penalties      ("branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_agent_invoices_branch_alive ON umrah_agent_invoices ("branchId") WHERE "deletedAt" IS NULL;
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ; -- ensure for partial idx
CREATE INDEX IF NOT EXISTS idx_umrah_packages_branch_alive       ON umrah_packages       ("branchId") WHERE "deletedAt" IS NULL;
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_umrah_transport_branch_alive      ON umrah_transport      ("branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_branch_alive ON umrah_import_batches ("branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_import_logs_branch_alive    ON umrah_import_logs    ("branchId") WHERE "deletedAt" IS NULL;
