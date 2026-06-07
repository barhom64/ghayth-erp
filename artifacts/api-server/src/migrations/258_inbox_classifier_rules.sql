-- ===========================================================================
-- Migration 258: inbox_classifier_rules — operator-configurable triage rules
-- ---------------------------------------------------------------------------
-- The inbox auto-classifier (eventListeners.ts inbox.message.received)
-- has shipped with a HARDCODED rule table since N10. Operators couldn't
-- add a new keyword bucket (say, مرتجع → returns), tweak the priority
-- for an existing one, or carve out a custom rule for their tenant
-- without a code change + deploy.
--
-- This migration introduces the DB-backed surface. The runtime listener
-- will load rules at message time (ORDER BY companyId DESC NULLS LAST,
-- sortOrder ASC, id ASC) so a company can override a global default
-- without modifying the shared row. Patterns are stored as a jsonb
-- array of strings; the listener compiles them with the same `i` flag
-- the hardcoded table uses.
--
-- The seed mirrors today's hardcoded table exactly so behavior is
-- preserved on the first deploy. A future PR can flip the listener
-- to read from this table; until then the table is dormant + the UI
-- writes are stored harmlessly.
--
-- @rollback:
--   DROP TABLE IF EXISTS inbox_classifier_rules;
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inbox_classifier_rules (
  id                serial PRIMARY KEY,
  "companyId"       integer REFERENCES companies(id),
  name              varchar(150)  NOT NULL,
  type              varchar(50)   NOT NULL,
  priority          varchar(20)   NOT NULL DEFAULT 'normal',
  "titlePrefix"     varchar(150)  NOT NULL,
  patterns          jsonb         NOT NULL DEFAULT '[]'::jsonb,
  "assignmentRole"  varchar(60),
  "slaHours"        integer       NOT NULL DEFAULT 24,
  "isActive"        boolean       NOT NULL DEFAULT true,
  "sortOrder"       integer       NOT NULL DEFAULT 100,
  description       text,
  "createdBy"       integer       REFERENCES users(id),
  "createdAt"       timestamptz   NOT NULL DEFAULT NOW(),
  "updatedAt"       timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT inbox_classifier_priority_check
    CHECK (priority IN ('low','normal','high','urgent'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_classifier_company
  ON inbox_classifier_rules("companyId", "isActive", "sortOrder");

-- Seed the global defaults (companyId IS NULL) — mirrors the listener's
-- hardcoded table so behavior is unchanged on rollout. Idempotent via
-- WHERE NOT EXISTS so re-running this migration doesn't duplicate.
INSERT INTO inbox_classifier_rules
  ("companyId", name, type, priority, "titlePrefix", patterns,
   "assignmentRole", "slaHours", "sortOrder", description)
SELECT NULL, t.name, t.type, t.priority, t.title_prefix, t.patterns::jsonb,
       t.assignment_role, t.sla_hours, t.sort_order, t.description
FROM (VALUES
  -- (name, type, priority, title_prefix, patterns, role, sla_hours, sort_order, description)
  ('شكوى', 'complaint', 'high', 'شكوى من',
   '["شكوى","complaint"]',
   'support_manager', 4, 10,
   'شكاوى العملاء — يصعّدها المُصنّف كأولوية عالية'),

  ('عاجل', 'urgent', 'urgent', 'عاجل من',
   '["عاجل","urgent","asap","\\\\bemergency\\\\b"]',
   'branch_manager', 2, 20,
   'كلمات الطوارئ — أولوية urgent + موعد استجابة ساعتان'),

  ('استفسار فاتورة', 'billing', 'normal', 'استفسار فاتورة',
   '["فاتورة","invoice","payment","دفع"]',
   'accountant', 24, 30,
   'أسئلة المحاسبة والمدفوعات'),

  ('طلب', 'request', 'normal', 'طلب من',
   '["طلب","request","apply"]',
   'support_agent', 24, 40,
   'طلبات عامة'),

  ('استفسار', 'inquiry', 'low', 'استفسار من',
   '["استفسار","inquiry","question"]',
   'support_agent', 72, 50,
   'استفسارات عامة، أولوية منخفضة')
) AS t(name, type, priority, title_prefix, patterns,
        assignment_role, sla_hours, sort_order, description)
WHERE NOT EXISTS (
  SELECT 1 FROM inbox_classifier_rules
  WHERE "companyId" IS NULL AND name = t.name
);
