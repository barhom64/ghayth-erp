-- ===========================================================================
-- 214_ai_governance.sql
-- ---------------------------------------------------------------------------
-- WHAT:    creates three tables that ground the AI Governance surface from
--          #1139 §4: a registry of AI providers, a versioned prompt catalog,
--          and a review-center table that records who approved each prompt
--          version before it could be shipped.
-- WHY:     without these, every aiEngine.ts edit goes straight to prod —
--          no audit trail of who changed a system prompt, no rollback path,
--          no per-tenant or per-feature provider selection. The master plan
--          calls these out as Stop-Ship requirements (§8: "لا rollback").
-- SAFETY:  additive — three new tables, FKs on review→prompt only, no
--          backfill. Provider rows are created lazily on first AI call
--          via lib/aiGovernance.ensureProvider(); prompts are imported
--          on demand. No live-system impact.
-- @rollback:
--   DROP TABLE IF EXISTS public.ai_prompt_reviews;
--   DROP TABLE IF EXISTS public.ai_prompts;
--   DROP TABLE IF EXISTS public.ai_providers;
-- ===========================================================================

-- 1. Providers -------------------------------------------------------------
-- The registry slot every AI call resolves through. Slug is unique so the
-- runtime can look up "anthropic" without trusting an arbitrary id.
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id           SERIAL PRIMARY KEY,
  slug         varchar(60)  NOT NULL UNIQUE,           -- 'anthropic' / 'openai' / 'azure-openai' …
  name         varchar(200) NOT NULL,                  -- human-readable label (Arabic-OK)
  status       varchar(20)  NOT NULL DEFAULT 'active', -- 'active' | 'disabled' | 'failover-only'
  priority     integer      NOT NULL DEFAULT 100,      -- lower = tried first when fallback is needed
  defaultModel varchar(120),
  -- Config holds the env-var keys to read API credentials from, not the
  -- credentials themselves. The actual secrets stay in lib/config.ts.
  config       jsonb        NOT NULL DEFAULT '{}'::jsonb,
  notes        text,
  "createdAt"  timestamp with time zone DEFAULT now(),
  "updatedAt"  timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_providers_status_check CHECK (status IN ('active','disabled','failover-only'))
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_status_priority
  ON public.ai_providers(status, priority)
  WHERE status <> 'disabled';

-- 2. Prompts ---------------------------------------------------------------
-- Versioned catalog. A logical prompt (slug) can have many rows — one per
-- version. The runtime always picks the row with status='approved' and
-- the highest version number for a given slug.
CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id             SERIAL PRIMARY KEY,
  slug           varchar(120) NOT NULL,                -- 'reception.categorize' / 'print.suggest_template' …
  version        integer      NOT NULL DEFAULT 1,
  title          varchar(300) NOT NULL,
  description    text,
  systemPrompt   text         NOT NULL,
  userTemplate   text,                                 -- optional — engines may compose the user msg themselves
  -- 'draft'        — author is editing
  -- 'in_review'    — submitted; awaiting reviewer decision
  -- 'approved'     — live; eligible for getApprovedPrompt() lookup
  -- 'deprecated'   — superseded by a newer approved version
  -- 'rejected'     — review rejected; cannot ship
  status         varchar(20)  NOT NULL DEFAULT 'draft',
  ownerUserId    integer,
  approvedUserId integer,
  approvedAt     timestamp with time zone,
  "createdAt"    timestamp with time zone DEFAULT now(),
  "updatedAt"    timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_prompts_slug_version_unique UNIQUE (slug, version),
  CONSTRAINT ai_prompts_status_check
    CHECK (status IN ('draft','in_review','approved','deprecated','rejected'))
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_slug_status
  ON public.ai_prompts(slug, status);

-- Single approved version per slug, enforced at the DB level so a race
-- between two approvers can't ship two simultaneously-live prompts.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_prompts_approved_per_slug
  ON public.ai_prompts(slug)
  WHERE status = 'approved';

-- 3. Review center ---------------------------------------------------------
-- One row per reviewer decision. A prompt may receive many reviews; the
-- approval gate (in the route) requires at least one approved review with
-- the reviewer ≠ author before status can move to 'approved'.
CREATE TABLE IF NOT EXISTS public.ai_prompt_reviews (
  id          SERIAL PRIMARY KEY,
  promptId    integer NOT NULL REFERENCES public.ai_prompts(id) ON DELETE CASCADE,
  reviewerId  integer NOT NULL,
  -- 'approved'          — green-light to ship
  -- 'changes_requested' — author should iterate
  -- 'rejected'          — kill the version
  decision    varchar(30) NOT NULL,
  comments    text,
  "createdAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_prompt_reviews_decision_check
    CHECK (decision IN ('approved','changes_requested','rejected'))
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_reviews_prompt
  ON public.ai_prompt_reviews("promptId", "createdAt" DESC);

-- 4. Seed default providers --------------------------------------------
-- The runtime expects at least an "anthropic" row; insert it on first
-- migration so the AI-governance panel renders meaningful state on a
-- fresh DB without forcing the operator to seed it manually.
INSERT INTO public.ai_providers (slug, name, status, priority, "defaultModel", config, notes)
VALUES
  ('anthropic', 'Anthropic Claude', 'active', 10, 'claude-haiku-4-5',
   '{"apiKeyEnv":"AI_INTEGRATIONS_ANTHROPIC_API_KEY","baseUrlEnv":"AI_INTEGRATIONS_ANTHROPIC_BASE_URL"}'::jsonb,
   'Default provider for aiEngine + print AI surfaces.')
ON CONFLICT (slug) DO NOTHING;
