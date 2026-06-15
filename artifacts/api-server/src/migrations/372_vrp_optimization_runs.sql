-- 372_vrp_optimization_runs.sql
-- TA-T18-VRP Phase 1 — Fleet Optimizer storage (audit doc file 20 §10
-- "Fleet Optimizer batch-mode VRP/TSP").
--
-- WHAT:    a per-run record of the batch fleet-assignment optimiser:
--          the input set (which bookings + which vehicles were
--          considered), the assignments the solver produced, and
--          enough metadata to reproduce or compare runs.
--
-- WHY:     the owner brief specified an "advisory batch mode" that
--          produces a one-day plan the dispatcher can approve, reject,
--          or partially apply. Phase 1 (this migration + lib) ships
--          the storage + a greedy nearest-neighbour heuristic so the
--          shape is in place; Phase 2 will plug in a real VRP solver
--          (OR-Tools by default, swappable) WITHOUT changing the
--          storage or the API shape.
--
-- DESIGN:  no FK from the assignment rows in JSONB to fleet_vehicles
--          / fleet_drivers / transport_booking_lines — the run is a
--          *historical snapshot* of what the solver proposed at
--          run-time. If a vehicle is deleted afterwards, the run
--          should still show what was proposed (with an "no longer
--          available" annotation in the UI). Approval is the moment
--          assignments become real (and re-validated by the existing
--          engine + assertDriverEligibility / assertDriverRest in
--          the dispatch flow).
--
-- SAFETY:  pure additive. No FKs to mutable rows, no row touches on
--          other tables, no engine integration in this phase.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS vrp_optimization_runs;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS vrp_optimization_runs (
  id                   SERIAL PRIMARY KEY,
  "companyId"          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"           INTEGER REFERENCES branches(id) ON DELETE SET NULL,

  -- The day we're optimising. The solver looks at all dispatchable
  -- bookings/lines whose scheduledStartAt falls within [runDate, runDate+1day).
  "runDate"            DATE NOT NULL,

  -- Lifecycle: pending → solved → (approved | rejected). failed is
  -- terminal but DOES persist the error for diagnostics. partially_approved
  -- is reserved for Phase 2 (dispatcher accepts a subset of assignments).
  status               TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT vrp_optimization_runs_status_check
      CHECK (status IN ('pending', 'solved', 'failed', 'approved', 'rejected', 'partially_approved')),

  -- Inputs: arrays of integer ids the run optimised over. JSONB so
  -- we can store both filter lists + their context (e.g. "vehicleIds
  -- = [12, 13, 14] because only those were available that day").
  "inputBookingLineIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "inputVehicleIds"     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Output: assignments[] = [{vehicleId, driverId, bookingLineId,
  -- sequenceOrder, distanceMeters, reason}, ...]. The shape mirrors
  -- what the existing single-pair suggest engine returns so the SPA
  -- can reuse rendering code.
  "assignmentsJson"     JSONB,

  -- The list of bookingLineIds the solver could not place — vehicle
  -- count too low, no compatible vehicle, etc. Reported alongside
  -- the plan so the dispatcher knows what falls outside.
  "unassignedJson"      JSONB,

  -- Solver metadata
  algorithm            TEXT,
  "totalDistanceMeters"  BIGINT,
  "totalDurationSeconds" BIGINT,
  "solveDurationMs"      INTEGER,
  "errorMessage"         TEXT,

  -- Lifecycle stamps
  "createdBy"          INTEGER REFERENCES users(id),
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "approvedAt"         TIMESTAMPTZ,
  "approvedBy"         INTEGER REFERENCES users(id),
  "rejectedAt"         TIMESTAMPTZ,
  "rejectedBy"         INTEGER REFERENCES users(id),
  "rejectionReason"    TEXT
);

-- Operator dashboard: "show me today's optimisation runs for company X"
CREATE INDEX IF NOT EXISTS vrp_optimization_runs_company_date_idx
  ON vrp_optimization_runs ("companyId", "runDate" DESC, "createdAt" DESC);

-- Status filtering ("show me runs awaiting approval")
CREATE INDEX IF NOT EXISTS vrp_optimization_runs_company_status_idx
  ON vrp_optimization_runs ("companyId", status, "createdAt" DESC);

COMMIT;
