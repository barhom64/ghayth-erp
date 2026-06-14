-- 351_field_category_backfill — assign a tracking-enabled category to
-- field staff whose employee_assignments.categoryKey is still NULL.
--
-- Root cause (field-tracking audit): migration 270's best-effort backfill
-- only ever set 'driver', 'executive' or 'manager' and left every other
-- role — including real field reps, technicians and labor workers — at
-- categoryKey = NULL. With a NULL category the policy engine resolves
-- trackingFrequencySeconds = 0, so getFieldEligibility returns
-- eligible:false / category_not_tracked: the companion shows the
-- "غير مؤهل" banner, never requests GPS, and no field_tracking_points
-- rows are ever written. This migration closes that gap for the obvious
-- field roles while STILL leaving genuinely office/admin rows untouched.
--
-- Conservative + idempotent: only touches rows where categoryKey IS NULL,
-- so any category HR has already set by hand is preserved. Office/admin
-- roles that don't match the field/worker heuristics are deliberately
-- left NULL (untracked) rather than forced into a tracked category.

-- Field employees: sales reps, field technicians, surveyors, couriers,
-- delivery, site staff — periodic location tracking (300s).
UPDATE employee_assignments ea
   SET "categoryKey" = 'field_employee'
 WHERE ea."categoryKey" IS NULL
   AND (
        LOWER(COALESCE(ea.role, ''))      LIKE '%field%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%sales%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%rep%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%technician%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%courier%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%delivery%'
     OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%ميداني%'
     OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%مندوب%'
     OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%فني%'
     OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%مساح%'
     OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%توصيل%'
   );

-- Labor / production workers: strict attendance, no GPS tracking by
-- default (worker frequency = 0) but they get a real category so the
-- attendance policy engine stops falling back to the company default.
UPDATE employee_assignments ea
   SET "categoryKey" = 'worker'
 WHERE ea."categoryKey" IS NULL
   AND (
        LOWER(COALESCE(ea.role, ''))      LIKE '%worker%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%labor%'
     OR LOWER(COALESCE(ea.role, ''))      LIKE '%labour%'
     OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%عامل%'
   );
