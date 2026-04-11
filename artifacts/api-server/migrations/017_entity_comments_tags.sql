CREATE TABLE IF NOT EXISTS entity_comments (
  id SERIAL PRIMARY KEY,
  "entityType" VARCHAR(50) NOT NULL,
  "entityId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER,
  "userName" VARCHAR(200),
  body TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entity_comments_entity ON entity_comments ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_entity_comments_company ON entity_comments ("companyId");

CREATE TABLE IF NOT EXISTS entity_tags (
  id SERIAL PRIMARY KEY,
  "entityType" VARCHAR(50) NOT NULL,
  "entityId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  tag VARCHAR(50) NOT NULL,
  color VARCHAR(30) DEFAULT 'blue',
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("entityType", "entityId", tag, "companyId")
);
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_entity_tags_company ON entity_tags ("companyId");
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags (tag, "companyId");
