-- ===========================================================================
-- 216_ai_prompt_evaluations.sql
-- ---------------------------------------------------------------------------
-- WHAT:    creates the evaluation-lab tables that complete the AI Governance
--          surface from #1139 §4. Golden test cases per prompt slug + a
--          recorded log of every evaluation run + per-result rows so an
--          operator can compare prompt versions without re-running the
--          model.
-- WHY:     §4 calls for "evaluation lab" and "simulators". The simulator
--          runs ad-hoc; the lab runs the whole golden set against a
--          candidate prompt version, so a reviewer can see regression
--          before approving. Without this, the only way to compare
--          v1 vs v2 of a prompt is to ship both and read production logs.
-- SAFETY:  additive only — three new tables, FKs cascade through
--          evaluation→results so a deleted run takes its results with it.
--          No backfill, no production impact.
-- @rollback:
--   DROP TABLE IF EXISTS public.ai_prompt_evaluation_results;
--   DROP TABLE IF EXISTS public.ai_prompt_evaluations;
--   DROP TABLE IF EXISTS public.ai_prompt_test_cases;
-- ===========================================================================

-- 1. Golden test cases -----------------------------------------------------
-- Keyed by prompt SLUG (not id) so a case persists across new versions —
-- a reviewer comparing v3 to v2 runs the same case set on both.
CREATE TABLE IF NOT EXISTS public.ai_prompt_test_cases (
  id              SERIAL PRIMARY KEY,
  "promptSlug"    varchar(120) NOT NULL,
  name            varchar(300) NOT NULL,
  description     text,
  -- User input that will be templated into the prompt at run time.
  -- jsonb so a case can carry structured input (e.g. {"ticketTitle": "…",
  -- "ticketDescription": "…"} for responder.draft) rather than one
  -- monolithic string.
  input           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- Optional expected text — when present, the eval marks a case as
  -- 'pass' if the model output contains the expected substring (case-
  -- insensitive). Strict equality is too brittle for LLM output.
  "expectedContains" text,
  "ownerUserId"   integer,
  enabled         boolean      NOT NULL DEFAULT true,
  "createdAt"     timestamp with time zone DEFAULT now(),
  "updatedAt"     timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_test_cases_slug
  ON public.ai_prompt_test_cases("promptSlug", enabled);

-- 2. Evaluation runs -------------------------------------------------------
-- One row per "run the golden set against this prompt version" action.
-- Aggregate counts live here so the UI doesn't have to recount on every
-- list render.
CREATE TABLE IF NOT EXISTS public.ai_prompt_evaluations (
  id            SERIAL PRIMARY KEY,
  "promptId"    integer NOT NULL REFERENCES public.ai_prompts(id) ON DELETE CASCADE,
  "promptSlug"  varchar(120) NOT NULL,                 -- denormalised for quick lookup
  "promptVersion" integer NOT NULL,
  "runByUserId" integer,
  "totalCases"  integer NOT NULL DEFAULT 0,
  "passedCases" integer NOT NULL DEFAULT 0,
  "failedCases" integer NOT NULL DEFAULT 0,
  "skippedCases" integer NOT NULL DEFAULT 0,
  "totalCostUsd" numeric(12,6) NOT NULL DEFAULT 0,
  "totalTokens"  integer NOT NULL DEFAULT 0,
  "durationMs"   integer NOT NULL DEFAULT 0,
  status        varchar(20) NOT NULL DEFAULT 'pending',-- 'pending' | 'running' | 'completed' | 'failed'
  "errorMessage" text,
  "startedAt"   timestamp with time zone DEFAULT now(),
  "completedAt" timestamp with time zone,
  CONSTRAINT ai_prompt_evaluations_status_check
    CHECK (status IN ('pending','running','completed','failed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_evaluations_prompt
  ON public.ai_prompt_evaluations("promptId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_evaluations_slug_version
  ON public.ai_prompt_evaluations("promptSlug", "promptVersion", "startedAt" DESC);

-- 3. Per-case results ------------------------------------------------------
-- One row per (evaluation, test_case) pair. Stores the actual model
-- output so a reviewer can diff v3 vs v2 by joining two runs on the
-- same testCaseId — no re-run needed.
CREATE TABLE IF NOT EXISTS public.ai_prompt_evaluation_results (
  id              SERIAL PRIMARY KEY,
  "evaluationId"  integer NOT NULL REFERENCES public.ai_prompt_evaluations(id) ON DELETE CASCADE,
  "testCaseId"    integer NOT NULL REFERENCES public.ai_prompt_test_cases(id) ON DELETE CASCADE,
  status          varchar(20) NOT NULL,                -- 'pass' | 'fail' | 'error'
  "actualOutput"  text,
  "errorMessage"  text,
  "durationMs"    integer NOT NULL DEFAULT 0,
  "costUsd"       numeric(12,6) NOT NULL DEFAULT 0,
  "tokensUsed"    integer NOT NULL DEFAULT 0,
  "createdAt"     timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_prompt_evaluation_results_status_check
    CHECK (status IN ('pass','fail','error'))
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_evaluation_results_eval
  ON public.ai_prompt_evaluation_results("evaluationId");
CREATE INDEX IF NOT EXISTS idx_ai_prompt_evaluation_results_case
  ON public.ai_prompt_evaluation_results("testCaseId", "createdAt" DESC);
