-- Phase 5 behavior enhancements migration

-- Add receiving manager approval step columns to employee_transfers
ALTER TABLE employee_transfers
  ADD COLUMN IF NOT EXISTS "receivedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMPTZ;

-- Add flexible/remote/split shift columns to shifts table
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS "shiftType" VARCHAR(30) DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS "remoteAllowed" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "splitBreakStart" TIME,
  ADD COLUMN IF NOT EXISTS "splitBreakEnd" TIME,
  ADD COLUMN IF NOT EXISTS "flexStartEarliest" TIME,
  ADD COLUMN IF NOT EXISTS "flexStartLatest" TIME;

-- Add 'present_holiday' as a recognized attendance status (no schema constraint changes needed
-- since status is typically a VARCHAR, but add comment for clarity)
COMMENT ON COLUMN attendance.status IS
  'Attendance status: present, absent, late, on_leave, present_off_day, present_holiday, present_out_of_range, remote';

-- Expiring document notifications: add the 90-day threshold by extending the cron query window
-- (logic change in cronScheduler.ts — no schema change needed)
