-- ===========================================================================
-- 213_ai_request_logs.sql
-- ---------------------------------------------------------------------------
-- WHAT:    creates ai_request_logs — per-call usage + cost ledger for every
--          LLM request the server makes. Powers the AI-cost panel of the
--          observability operator pane (#1139 §5) and the future cost-
--          governance rollout/rollback surface (#1139 §4).
-- WHY:     the master execution plan lists "AI costs" as one of the six
--          observability concerns. Without a per-call row, the operator
--          can only see "AI is on" — not which feature is burning budget
--          or whether a model swap blew up the bill.
-- SAFETY:  additive only — new table, two indexes, no FK constraints, no
--          backfill. Zero impact on existing writes; safe to apply on a
--          live system without a maintenance window.
-- @rollback:
--   DROP INDEX IF EXISTS idx_ai_request_logs_company_created;
--   DROP INDEX IF EXISTS idx_ai_request_logs_model_created;
--   DROP INDEX IF EXISTS idx_ai_request_logs_feature_created;
--   DROP TABLE IF EXISTS public.ai_request_logs;
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.ai_request_logs (
  id           SERIAL PRIMARY KEY,
  "companyId"  integer,                                    -- nullable: AI calls outside an authed request
  "userId"     integer,                                    -- nullable: same reason
  provider     varchar(60)  NOT NULL DEFAULT 'anthropic',  -- 'anthropic' / 'openai' / future
  model        varchar(120) NOT NULL,                      -- e.g. 'claude-haiku-4-5'
  feature      varchar(120) NOT NULL,                      -- 'reception.categorize' / 'print.suggest_template' / …
  "promptTokens"     integer       DEFAULT 0,
  "completionTokens" integer       DEFAULT 0,
  "totalTokens"      integer       DEFAULT 0,
  -- Stored as numeric so partial-cent precision survives roll-ups.
  "costUsd"          numeric(12,6) DEFAULT 0,
  "durationMs"       integer       DEFAULT 0,
  status       varchar(20)  NOT NULL DEFAULT 'success',    -- 'success' | 'error'
  "errorCode"  varchar(60),                                -- short code/category when status='error'
  "createdAt"  timestamp with time zone DEFAULT now()
);

-- Operator-pane lookup: "AI cost for this tenant in the last 24h".
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_company_created
  ON public.ai_request_logs("companyId", "createdAt" DESC);

-- Per-model roll-up: "is Sonnet costing us more than Haiku?".
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_model_created
  ON public.ai_request_logs(model, "createdAt" DESC);

-- Per-feature roll-up: "is the print summariser the budget hog?".
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_feature_created
  ON public.ai_request_logs(feature, "createdAt" DESC);
