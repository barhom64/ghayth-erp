-- db/seed-financial-periods.sql — bootstrap an open fiscal period per company
--
-- Without at least one open financial_periods row per tenant, every GL
-- posting attempt is rejected by the period guard. This seed inserts a
-- calendar-year period for the *current* year for every existing company
-- if (and only if) that company doesn't already have a period covering
-- today's date.
--
-- Apply order: load AFTER schema.sql + seed.sql (which inserts companies)
-- and AFTER seed-admin-user.sql. The bootstrap script handles ordering.
--
-- Idempotent: safe to re-run.

INSERT INTO public.financial_periods
  ("companyId", name, "startDate", "endDate", status, notes, "createdAt", "updatedAt")
SELECT
  c.id,
  'السنة المالية ' || EXTRACT(YEAR FROM CURRENT_DATE)::text,
  make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 1, 1),
  make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 12, 31),
  'open',
  'Auto-seeded by db/seed-financial-periods.sql',
  NOW(),
  NOW()
FROM public.companies c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp."companyId" = c.id
      AND fp."deletedAt" IS NULL
      AND CURRENT_DATE BETWEEN fp."startDate" AND fp."endDate"
  );
