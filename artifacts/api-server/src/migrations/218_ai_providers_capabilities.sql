-- ===========================================================================
-- 218_ai_providers_capabilities.sql
-- ---------------------------------------------------------------------------
-- WHAT:    extends ai_providers so a single provider row can declare
--          multiple capabilities (text generation, speech-to-text,
--          embeddings, ...) — turning the existing registry into the
--          unified vendor surface for every AI feature, including STT.
--          Adds optional `endpoint` and seeds a disabled Whisper-API
--          STT provider entry so an operator can flip it on from the
--          UI with only an API key.
-- WHY:     #1139 §3 calls for STT to be "easy to wire from the UI";
--          the operator wanted vendor wiring driven from the admin
--          surface, not from env vars. The capability column is the
--          discrimination axis pbxControl uses to find an active STT
--          provider at run time. Same pattern works for future
--          embeddings / image-generation capabilities.
-- SAFETY:  additive — two new columns with defaults, no backfill of
--          existing data, no FK changes. Seed insert uses
--          ON CONFLICT DO NOTHING so re-running the migration on a
--          partially-migrated DB is safe.
-- @rollback:
--   ALTER TABLE public.ai_providers
--     DROP COLUMN IF EXISTS endpoint,
--     DROP COLUMN IF EXISTS capabilities;
--   DELETE FROM public.ai_providers WHERE slug = 'openai-whisper';
-- ===========================================================================

ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '["generation"]'::jsonb;

ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS endpoint text;

-- Containment index so getActiveProvidersByCapability() can lookup by
-- capability cheaply when the registry grows past a handful of rows.
CREATE INDEX IF NOT EXISTS idx_ai_providers_capabilities
  ON public.ai_providers USING gin (capabilities);

-- Seed: a disabled STT provider entry the operator just enables +
-- pastes an API key into. The config keys map to lib/aiGovernance's
-- decryption (apiKey is encrypted at rest via secrets.ts).
INSERT INTO public.ai_providers
  (slug, name, status, priority, "defaultModel", capabilities, endpoint, config, notes)
VALUES
  ('openai-whisper', 'OpenAI Whisper (STT)', 'disabled', 50, 'whisper-1',
   '["stt"]'::jsonb,
   'https://api.openai.com/v1/audio/transcriptions',
   '{"apiKey":""}'::jsonb,
   'STT provider. Fill in apiKey + status=active to wire transcription of PBX recordings.')
ON CONFLICT (slug) DO NOTHING;
