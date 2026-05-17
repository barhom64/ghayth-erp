-- Migration 171: Dynamic Pricing Rules Engine (Task #276)
--
-- Adds a generic rules engine that resolves a unit price for an invoice/quote
-- line based on stacked conditions (customer / category / product / quantity /
-- date) and a per-rule action (fixed price, percentage discount, or formula).
--
-- Tables:
--   pricing_rules            — rule header (name, priority, validity, status)
--   pricing_conditions       — DSL leaves: { field, operator, value } + group/op
--   pricing_actions          — outcome: fixed_price | percent_discount | formula
--   pricing_rule_applications — audit trail of every resolved price (which rule
--                              fired, the original price, the discount, the
--                              acting user, and whether it was overridden)
--
-- All tables are tenant-scoped (companyId), soft-deletable (deletedAt), and
-- bound to the existing companies/branches FK shape used elsewhere.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id),
  "branchId"      INTEGER REFERENCES branches(id),
  name            TEXT NOT NULL,
  description     TEXT,
  priority        INTEGER NOT NULL DEFAULT 0,
  "validFrom"     DATE,
  "validTo"       DATE,
  status          TEXT NOT NULL DEFAULT 'active',  -- active|inactive
  "logicOp"       TEXT NOT NULL DEFAULT 'AND',     -- AND|OR for top-level group
  "createdBy"     INTEGER,
  "deletedAt"     TIMESTAMP,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pr_company_idx       ON pricing_rules ("companyId");
CREATE INDEX IF NOT EXISTS pr_status_idx        ON pricing_rules (status);
CREATE INDEX IF NOT EXISTS pr_priority_idx      ON pricing_rules (priority DESC);
CREATE INDEX IF NOT EXISTS pr_validity_idx      ON pricing_rules ("validFrom", "validTo");
CREATE INDEX IF NOT EXISTS pr_deleted_idx       ON pricing_rules ("deletedAt");

CREATE TABLE IF NOT EXISTS pricing_conditions (
  id          SERIAL PRIMARY KEY,
  "ruleId"    INTEGER NOT NULL REFERENCES pricing_rules(id) ON DELETE CASCADE,
  field       TEXT NOT NULL,        -- clientId|clientSegment|productId|productCategory|quantity|date
  operator    TEXT NOT NULL,        -- eq|neq|gt|gte|lt|lte|in|between
  value       TEXT NOT NULL,        -- JSON-encoded scalar / array / [from,to]
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pc_rule_idx ON pricing_conditions ("ruleId");

CREATE TABLE IF NOT EXISTS pricing_actions (
  id            SERIAL PRIMARY KEY,
  "ruleId"      INTEGER NOT NULL UNIQUE REFERENCES pricing_rules(id) ON DELETE CASCADE,
  "actionType"  TEXT NOT NULL,       -- fixed_price|percent_discount|amount_discount|formula
  value         NUMERIC(14, 4) NOT NULL DEFAULT 0,
  formula       TEXT,                -- optional JS-style expression (basePrice, quantity)
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing_rule_applications (
  id                 SERIAL PRIMARY KEY,
  "companyId"        INTEGER NOT NULL REFERENCES companies(id),
  "ruleId"           INTEGER REFERENCES pricing_rules(id),
  "ruleName"         TEXT,
  "entityType"       TEXT NOT NULL,        -- invoice|quote|preview
  "entityId"         INTEGER,
  "clientId"         INTEGER,
  "productId"        INTEGER,
  "productCategory"  TEXT,
  quantity           NUMERIC(14, 4),
  "basePrice"        NUMERIC(14, 4) NOT NULL,
  "resolvedPrice"    NUMERIC(14, 4) NOT NULL,
  "discountAmount"   NUMERIC(14, 4) NOT NULL DEFAULT 0,
  overridden         BOOLEAN NOT NULL DEFAULT FALSE,
  "overridePrice"    NUMERIC(14, 4),
  "overrideReason"   TEXT,
  "appliedBy"        INTEGER,
  "appliedAt"        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pra_company_idx  ON pricing_rule_applications ("companyId");
CREATE INDEX IF NOT EXISTS pra_rule_idx     ON pricing_rule_applications ("ruleId");
CREATE INDEX IF NOT EXISTS pra_entity_idx   ON pricing_rule_applications ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS pra_applied_idx  ON pricing_rule_applications ("appliedAt");
CREATE INDEX IF NOT EXISTS pra_client_idx   ON pricing_rule_applications ("clientId");
