-- Migration 271 — Field tracking points (#1799 priority #7)
--
-- @rollback: Fully additive. To undo:
--   DROP INDEX IF EXISTS idx_field_tracking_points_assignment_ts;
--   DROP INDEX IF EXISTS idx_field_tracking_points_company_day;
--   DROP TABLE IF EXISTS field_tracking_points;
--
-- The inventory (docs/HR_OPERATING_FOUNDATION_TASK.md §A.3 + §A.4)
-- found the field-tracking page is a READ-ONLY shell: it plots the
-- single check-in lat/lng of each attendance row on a map. There is
-- no persistent breadcrumb history, no live pings, no per-policy
-- tracking frequency. #1799 §D requires a real ingestion path:
--
--   API لاستقبال نقاط الموقع
--   جدول أو كيان لنقاط التتبع
--   حفظ: lat, lng, accuracy, speed, heading, battery, deviceId,
--        timestamp, employeeId, assignment/task/trip reference
--   تقرير يومي للمسار والتوقفات
--
-- This migration creates the storage. The ingestion endpoint +
-- per-category frequency enforcement land in the same PR (route
-- changes) and consume `attendancePolicyEngine.trackingFrequencySeconds`
-- (added in migration 270) to reject pings that arrive faster than the
-- employee's category allows.

CREATE TABLE IF NOT EXISTS field_tracking_points (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER,
  -- The assignment is the canonical actor link (matches how attendance
  -- + violations key off employee_assignments, not employees, so the
  -- per-company scope is implicit). employeeId is denormalized for
  -- fast reporting joins.
  "assignmentId" INTEGER NOT NULL,
  "employeeId" INTEGER,
  -- Geo payload.
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,           -- horizontal accuracy, meters
  speed DOUBLE PRECISION,              -- meters/sec, nullable
  heading DOUBLE PRECISION,            -- degrees 0-360, nullable
  altitude DOUBLE PRECISION,           -- meters, nullable
  battery SMALLINT,                    -- 0-100, nullable
  -- Device + source provenance.
  "deviceId" VARCHAR(120),
  source VARCHAR(20) NOT NULL DEFAULT 'mobile', -- mobile | web | device | manual
  -- Optional links to what the employee was doing while at this point.
  -- All nullable: a generic field ping has none of them.
  "taskId" INTEGER,
  "tripId" INTEGER,
  "visitId" INTEGER,
  -- Client-reported capture time (the device's clock) vs server
  -- receipt time. We keep both so out-of-order / buffered pings (a
  -- phone that lost signal and flushes a backlog) sort correctly by
  -- capturedAt while createdAt audits when we actually received them.
  "capturedAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary reporting access path: one employee's track for a day,
-- ordered by capture time (the daily route + stop report walks this).
CREATE INDEX IF NOT EXISTS idx_field_tracking_points_assignment_ts
  ON field_tracking_points("assignmentId", "capturedAt");

-- Company-wide day scan for the live map / fleet-style overview.
CREATE INDEX IF NOT EXISTS idx_field_tracking_points_company_day
  ON field_tracking_points("companyId", "capturedAt");
