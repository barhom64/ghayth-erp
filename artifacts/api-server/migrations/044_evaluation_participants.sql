-- ============================================================
-- Migration 027: Evaluation Participants + Upward Review Security
-- ============================================================

-- Add submissionToken to anonymous_upward_reviews for duplicate prevention
-- without storing reviewer identity (the token is a one-way HMAC hash)
DO $$ BEGIN
  BEGIN
    ALTER TABLE anonymous_upward_reviews ADD COLUMN "submissionToken" VARCHAR(64);
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS anon_reviews_token_idx
  ON anonymous_upward_reviews ("cycleId","managerId","submissionToken")
  WHERE "submissionToken" IS NOT NULL;

-- Tracks who is assigned to evaluate in each cycle
CREATE TABLE IF NOT EXISTS evaluation_participants (
  id              SERIAL PRIMARY KEY,
  "cycleId"       INTEGER NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "evaluatorId"   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "evaluatorRole" VARCHAR(20) NOT NULL DEFAULT 'peer'
                    CHECK ("evaluatorRole" IN ('manager','peer')),
  "hasSubmitted"  BOOLEAN NOT NULL DEFAULT false,
  "submittedAt"   TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS eval_participants_cycle_evaluator_idx
  ON evaluation_participants ("cycleId","evaluatorId");
CREATE INDEX IF NOT EXISTS eval_participants_cycle_idx ON evaluation_participants ("cycleId");
CREATE INDEX IF NOT EXISTS eval_participants_evaluator_idx ON evaluation_participants ("evaluatorId");
